import type { MigrationInterface, QueryRunner } from "typeorm";

/** Application schema. The indexer owns its own schema; this migration never touches it. */
export class InitialSchema1762300000000 implements MigrationInterface {
  name = "InitialSchema1762300000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await q.query(`
      CREATE TABLE app.app_user (
        wallet         varchar(42) PRIMARY KEY,
        role           varchar(32) NOT NULL,
        display_name   varchar(120),
        created_at     timestamptz NOT NULL DEFAULT now(),
        last_login_at  timestamptz
      )`);

    await q.query(`
      CREATE TABLE app.auth_nonce (
        nonce       varchar(128) PRIMARY KEY,
        expires_at  timestamptz NOT NULL,
        used_at     timestamptz
      )`);

    await q.query(`
      CREATE TABLE app.kyc_application (
        id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet                varchar(42) NOT NULL,
        status                varchar(16) NOT NULL
                              CHECK (status IN ('SUBMITTED','APPROVED','REJECTED','REVOKED')),
        full_name_enc         text NOT NULL,
        email_enc             text NOT NULL,
        date_of_birth_enc     text NOT NULL,
        address_enc           text NOT NULL,
        document_type         varchar(24) NOT NULL,
        document_number_enc   text NOT NULL,
        document_fingerprint  char(64) NOT NULL,
        country_alpha2        char(2) NOT NULL,
        country_numeric       smallint NOT NULL,
        requested_tier        smallint NOT NULL CHECK (requested_tier BETWEEN 1 AND 3),
        approved_tier         smallint CHECK (approved_tier BETWEEN 1 AND 3),
        source_of_funds       varchar(64) NOT NULL,
        screening             jsonb NOT NULL,
        risk_level            varchar(8) NOT NULL,
        submitted_at          timestamptz NOT NULL,
        reviewed_by           varchar(42),
        reviewed_at           timestamptz,
        decision_reason       text,
        tx_hash               varchar(66),
        kyc_expires_at        timestamptz
      )`);
    await q.query(`CREATE INDEX kyc_application_wallet_idx ON app.kyc_application (wallet, submitted_at DESC)`);
    await q.query(`CREATE INDEX kyc_application_status_idx ON app.kyc_application (status)`);
    await q.query(`CREATE INDEX kyc_application_fingerprint_idx ON app.kyc_application (document_fingerprint)`);

    await q.query(`
      CREATE TABLE app.audit_log (
        id            bigserial PRIMARY KEY,
        occurred_at   timestamptz NOT NULL,
        actor_wallet  varchar(42),
        actor_role    varchar(32),
        action        varchar(64) NOT NULL,
        entity_type   varchar(32) NOT NULL,
        entity_id     varchar(128),
        summary       text NOT NULL,
        details       jsonb NOT NULL DEFAULT '{}'::jsonb,
        tx_hash       varchar(66),
        prev_hash     char(64) NOT NULL,
        hash          char(64) NOT NULL UNIQUE
      )`);
    await q.query(`CREATE INDEX audit_log_entity_idx ON app.audit_log (entity_type, entity_id)`);
    await q.query(`CREATE INDEX audit_log_actor_idx ON app.audit_log (actor_wallet)`);
    await q.query(`CREATE UNIQUE INDEX audit_log_tx_action_idx ON app.audit_log (tx_hash, action) WHERE tx_hash IS NOT NULL`);

    // The audit trail is append-only: block UPDATE, DELETE and TRUNCATE at the database level.
    await q.query(`
      CREATE FUNCTION app.audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'audit_log is append-only (% blocked)', TG_OP;
      END $$`);
    await q.query(`
      CREATE TRIGGER audit_log_no_update_delete BEFORE UPDATE OR DELETE ON app.audit_log
      FOR EACH ROW EXECUTE FUNCTION app.audit_log_append_only()`);
    await q.query(`
      CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON app.audit_log
      FOR EACH STATEMENT EXECUTE FUNCTION app.audit_log_append_only()`);

    await q.query(`
      CREATE TABLE app.asset_profile (
        id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name                    varchar(120) NOT NULL,
        asset_class             smallint NOT NULL CHECK (asset_class BETWEEN 0 AND 2),
        location                varchar(160) NOT NULL,
        description             text NOT NULL,
        highlights              jsonb NOT NULL DEFAULT '[]'::jsonb,
        documents               jsonb NOT NULL DEFAULT '[]'::jsonb,
        document_hash           char(66) NOT NULL,
        target_yield_bps        integer,
        distribution_frequency  varchar(24),
        created_by              varchar(42) NOT NULL,
        created_at              timestamptz NOT NULL DEFAULT now()
      )`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS app.asset_profile`);
    await q.query(`DROP TABLE IF EXISTS app.audit_log`);
    await q.query(`DROP FUNCTION IF EXISTS app.audit_log_append_only()`);
    await q.query(`DROP TABLE IF EXISTS app.kyc_application`);
    await q.query(`DROP TABLE IF EXISTS app.auth_nonce`);
    await q.query(`DROP TABLE IF EXISTS app.app_user`);
  }
}
