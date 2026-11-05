import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { type Address, type Hex, isHash } from "viem";
import { DataSource, type EntityManager } from "typeorm";

import { ChainService } from "../chain/chain.service";
import type { SessionUser } from "../common/auth.decorators";
import { AuditLog } from "../database/entities";
import { chainHash, GENESIS_HASH, type HashableEntry } from "./audit-hash";

export type AuditInput = Omit<HashableEntry, "occurredAt" | "details" | "txHash"> & {
  details?: Record<string, unknown>;
  txHash?: string | null;
};

const AUDIT_LOCK = 774_211; // pg advisory lock key that serialises appends

@Injectable()
export class AuditService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly chain: ChainService,
  ) {}

  /** Appends one entry, linking it to the previous entry's hash. */
  async append(input: AuditInput, manager?: EntityManager): Promise<AuditLog> {
    const run = async (m: EntityManager) => {
      await m.query("SELECT pg_advisory_xact_lock($1)", [AUDIT_LOCK]);
      const last = await m.getRepository(AuditLog).find({ order: { id: "DESC" }, take: 1 });
      const prevHash = last[0]?.hash ?? GENESIS_HASH;
      // Millisecond precision so the stored timestamp round-trips to the same ISO string.
      const occurredAt = new Date(Math.floor(Date.now()));
      const entry: HashableEntry = {
        occurredAt,
        actorWallet: input.actorWallet,
        actorRole: input.actorRole,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        summary: input.summary,
        details: input.details ?? {},
        txHash: input.txHash ?? null,
      };
      return m.getRepository(AuditLog).save({ ...entry, prevHash, hash: chainHash(prevHash, entry) });
    };
    return manager ? run(manager) : this.db.transaction(run);
  }

  /**
   * Records an on-chain action the user signed in their wallet. The receipt must be successful,
   * sent by the signed-in wallet and addressed to a platform contract.
   */
  async recordOnchain(
    user: SessionUser,
    body: { action: string; txHash: string; entityType: string; entityId?: string; summary: string },
  ): Promise<AuditLog> {
    if (!isHash(body.txHash)) throw new BadRequestException("txHash is not a transaction hash");
    const receipt = await this.chain.publicClient.getTransactionReceipt({ hash: body.txHash as Hex });
    if (receipt.status !== "success") throw new BadRequestException("Transaction reverted");
    if (receipt.from.toLowerCase() !== user.wallet) {
      throw new BadRequestException("Transaction was not sent by the signed-in wallet");
    }
    if (!receipt.to || !(await this.chain.isPlatformContract(receipt.to as Address))) {
      throw new BadRequestException("Transaction is not addressed to a platform contract");
    }
    try {
      return await this.append({
        actorWallet: user.wallet,
        actorRole: user.role,
        action: body.action,
        entityType: body.entityType,
        entityId: body.entityId ?? null,
        summary: body.summary,
        txHash: body.txHash,
        details: { blockNumber: receipt.blockNumber.toString(), contract: receipt.to },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new ConflictException("This transaction is already in the audit trail");
      }
      throw error;
    }
  }

  async list(params: { limit: number; before?: string; entityType?: string; actor?: string }) {
    const qb = this.db.getRepository(AuditLog).createQueryBuilder("a").orderBy("a.id", "DESC").take(params.limit);
    if (params.before) qb.andWhere("a.id < :before", { before: params.before });
    if (params.entityType) qb.andWhere("a.entity_type = :t", { t: params.entityType });
    if (params.actor) qb.andWhere("a.actor_wallet = :w", { w: params.actor.toLowerCase() });
    return qb.getMany();
  }

  /** Recomputes the whole chain. Returns the first broken entry, if any. */
  async verify(): Promise<{ valid: boolean; checked: number; brokenAt: string | null; head: string }> {
    const repo = this.db.getRepository(AuditLog);
    let prevHash = GENESIS_HASH;
    let checked = 0;
    let lastId = "0";
    for (;;) {
      const batch = await repo
        .createQueryBuilder("a")
        .where("a.id > :lastId", { lastId })
        .orderBy("a.id", "ASC")
        .take(500)
        .getMany();
      if (batch.length === 0) break;
      for (const row of batch) {
        const expected = chainHash(prevHash, {
          occurredAt: row.occurredAt,
          actorWallet: row.actorWallet,
          actorRole: row.actorRole,
          action: row.action,
          entityType: row.entityType,
          entityId: row.entityId,
          summary: row.summary,
          details: row.details,
          txHash: row.txHash,
        });
        if (row.prevHash !== prevHash || row.hash !== expected) {
          return { valid: false, checked, brokenAt: row.id, head: prevHash };
        }
        prevHash = row.hash;
        checked += 1;
        lastId = row.id;
      }
    }
    return { valid: true, checked, brokenAt: null, head: prevHash };
  }
}
