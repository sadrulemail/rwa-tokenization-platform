import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { APP_CONFIG, type AppConfig } from "../config";

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const toCamel = <T = Record<string, unknown>>(row: Record<string, unknown>): T =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [camel(k), v])) as T;

/**
 * Read models over the indexer's tables (written by Ponder) joined with off-chain profiles.
 * Amounts stay as decimal strings: shares have 18 decimals, stablecoin 6.
 */
@Injectable()
export class MarketService {
  private readonly s: string;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @InjectDataSource() private readonly db: DataSource,
  ) {
    if (!/^[a-z_][a-z0-9_]*$/.test(config.indexerSchema)) throw new Error("Invalid INDEXER_SCHEMA");
    this.s = `"${config.indexerSchema}"`;
  }

  private async rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    try {
      const result: Record<string, unknown>[] = await this.db.query(sql, params);
      return result.map((r) => toCamel<T>(r));
    } catch (error) {
      if ((error as { code?: string }).code === "42P01") {
        throw new ServiceUnavailableException("The indexer has not created its tables yet. Start it with pnpm dev.");
      }
      throw error;
    }
  }

  private assetSelect(where = "") {
    return `
      SELECT a.token, a.asset_id::text, a.compliance, a.name, a.symbol, a.asset_class, a.jurisdiction,
             a.metadata_uri, a.document_hash, a.custodian, a.status, a.paused,
             a.max_supply::text, a.total_supply::text, a.holder_count, a.nav_per_share::text,
             a.asset_value::text, a.valuation_at::text, a.valuation_report_hash,
             a.income_deposited::text, a.income_claimed::text, a.distribution_count,
             a.created_at::text, a.created_tx,
             floor(a.total_supply * a.nav_per_share / 1e18)::numeric(78,0)::text AS market_value,
             p.id AS profile_id, p.location, p.description, p.highlights, p.documents,
             p.target_yield_bps, p.distribution_frequency,
             r.min_tier, r.max_holders::text, r.lockup_until::text, r.max_balance::text, r.blocked_countries,
             first_nav.nav_per_share::text AS initial_nav_per_share
        FROM ${this.s}.asset a
        LEFT JOIN app.asset_profile p ON p.id::text = split_part(a.metadata_uri, '/metadata/', 2)
        LEFT JOIN ${this.s}.compliance_rules r ON r.compliance = a.compliance
        LEFT JOIN LATERAL (
          SELECT v.nav_per_share FROM ${this.s}.valuation v
           WHERE v.token = a.token ORDER BY v.timestamp, v.block_number LIMIT 1
        ) first_nav ON true
        ${where}
       ORDER BY a.asset_id`;
  }

  async summary() {
    const [totals] = await this.rows<Record<string, string | number>>(`
      SELECT count(*)::int AS assets,
             coalesce(sum(floor(total_supply * nav_per_share / 1e18)), 0)::numeric(78,0)::text AS market_value,
             coalesce(sum(asset_value), 0)::text AS asset_value,
             coalesce(sum(income_deposited), 0)::text AS income_distributed,
             coalesce(sum(holder_count), 0)::int AS holder_positions
        FROM ${this.s}.asset`);
    const [counts] = await this.rows<Record<string, number>>(`
      SELECT (SELECT count(*)::int FROM ${this.s}.investor WHERE registered) AS investors,
             (SELECT count(*)::int FROM ${this.s}.desk_request WHERE status = 0) AS pending_requests,
             (SELECT count(*)::int FROM ${this.s}.share_transfer) AS transfers`);
    return { ...totals, ...counts };
  }

  listAssets() {
    return this.rows(this.assetSelect());
  }

  async asset(token: string) {
    const [row] = await this.rows(this.assetSelect("WHERE a.token = $1"), [token.toLowerCase()]);
    if (!row) throw new NotFoundException("Asset not found");
    return row;
  }

  valuations(token: string) {
    return this.rows(
      `SELECT nav_per_share::text, asset_value::text, report_hash, timestamp::text, tx_hash
         FROM ${this.s}.valuation WHERE token = $1 ORDER BY timestamp, block_number`,
      [token.toLowerCase()],
    );
  }

  distributions(token: string) {
    return this.rows(
      `SELECT distribution_id::text, amount::text, total_supply::text, statement_hash, timestamp::text, tx_hash
         FROM ${this.s}.distribution WHERE token = $1 ORDER BY timestamp DESC`,
      [token.toLowerCase()],
    );
  }

  transfers(token: string, limit: number) {
    return this.rows(
      `SELECT id, from_account, to_account, amount::text, kind, timestamp::text, tx_hash
         FROM ${this.s}.share_transfer WHERE token = $1 ORDER BY timestamp DESC, id DESC LIMIT $2`,
      [token.toLowerCase(), limit],
    );
  }

  holders(token: string) {
    return this.rows(
      `SELECT h.account, h.balance::text, h.locked::text, h.frozen, h.income_claimed::text,
              h.first_acquired_at::text, i.country, i.tier, i.expires_at::text, i.registered
         FROM ${this.s}.holding h
         LEFT JOIN ${this.s}.investor i ON i.wallet = h.account
        WHERE h.token = $1 AND h.balance > 0
        ORDER BY h.balance DESC`,
      [token.toLowerCase()],
    );
  }

  activity(params: { token?: string; account?: string; limit: number; before?: string }) {
    const where: string[] = [];
    const args: unknown[] = [];
    if (params.token) where.push(`x.token = $${args.push(params.token.toLowerCase())}`);
    if (params.account) {
      const i = args.push(params.account.toLowerCase());
      where.push(`(x.account = $${i} OR x.sender = $${i})`);
    }
    if (params.before) where.push(`x.timestamp < $${args.push(params.before)}`);
    const limit = args.push(params.limit);
    return this.rows(
      `SELECT x.id, x.timestamp::text, x.block_number::text, x.tx_hash, x.sender, x.contract, x.event,
              x.token, x.account, x.data, a.symbol, a.name AS asset_name
         FROM ${this.s}.activity x
         LEFT JOIN ${this.s}.asset a ON a.token = x.token
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY x.timestamp DESC, x.block_number DESC, x.log_index DESC
        LIMIT $${limit}`,
      args,
    );
  }

  requests(params: { status?: number; account?: string; token?: string }) {
    const where: string[] = [];
    const args: unknown[] = [];
    if (params.status !== undefined) where.push(`r.status = $${args.push(params.status)}`);
    if (params.account) where.push(`r.account = $${args.push(params.account.toLowerCase())}`);
    if (params.token) where.push(`r.token = $${args.push(params.token.toLowerCase())}`);
    return this.rows(
      `SELECT r.id::text, r.kind, r.status, r.token, r.account, r.requested_by, r.amount::text,
              r.minimum_out::text, r.settled::text, r.reason, r.decided_by, r.created_at::text,
              r.decided_at::text, r.created_tx, r.decided_tx, a.name AS asset_name, a.symbol,
              a.nav_per_share::text
         FROM ${this.s}.desk_request r
         JOIN ${this.s}.asset a ON a.token = r.token
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY r.id DESC LIMIT 200`,
      args,
    );
  }

  async portfolio(wallet: string) {
    const holdings = await this.rows(
      `SELECT h.token, a.name, a.symbol, a.asset_class, h.balance::text, h.locked::text, h.frozen,
              h.income_claimed::text, a.nav_per_share::text, a.valuation_at::text,
              floor(h.balance * a.nav_per_share / 1e18)::numeric(78,0)::text AS value,
              h.first_acquired_at::text
         FROM ${this.s}.holding h JOIN ${this.s}.asset a ON a.token = h.token
        WHERE h.account = $1 AND (h.balance > 0 OR h.income_claimed > 0)
        ORDER BY value DESC`,
      [wallet.toLowerCase()],
    );
    const [identity] = await this.rows(
      `SELECT registered, country, tier, expires_at::text FROM ${this.s}.investor WHERE wallet = $1`,
      [wallet.toLowerCase()],
    );
    const claims = await this.rows(
      `SELECT c.token, a.symbol, c.amount::text, c.timestamp::text, c.tx_hash
         FROM ${this.s}.income_claim c JOIN ${this.s}.asset a ON a.token = c.token
        WHERE c.account = $1 ORDER BY c.timestamp DESC LIMIT 50`,
      [wallet.toLowerCase()],
    );
    return { holdings, identity: identity ?? null, claims };
  }

  async pendingKyc(): Promise<number> {
    const [row] = await this.rows<{ count: number }>(
      `SELECT count(*)::int AS count FROM app.kyc_application WHERE status = 'SUBMITTED'`,
    );
    return row?.count ?? 0;
  }
}
