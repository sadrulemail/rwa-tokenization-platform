import type { AppRole } from "@rwa/contracts";
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm";

/** Every wallet that has signed in. Staff roles come from the deployment's role addresses. */
@Entity({ name: "app_user" })
export class AppUser {
  @PrimaryColumn({ type: "varchar", length: 42 })
  wallet: string;

  @Column({ type: "varchar", length: 32 })
  role: AppRole;

  @Column({ name: "display_name", type: "varchar", length: 120, nullable: true })
  displayName: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @Column({ name: "last_login_at", type: "timestamptz", nullable: true })
  lastLoginAt: Date | null;
}

/** One-time Sign-In with Ethereum nonces. */
@Entity({ name: "auth_nonce" })
export class AuthNonce {
  @PrimaryColumn({ type: "varchar", length: 128 })
  nonce: string;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt: Date;

  @Column({ name: "used_at", type: "timestamptz", nullable: true })
  usedAt: Date | null;
}

export type KycStatus = "SUBMITTED" | "APPROVED" | "REJECTED" | "REVOKED";

export type ScreeningCheck = { name: string; result: "CLEAR" | "REVIEW" | "FAIL"; detail: string };
export type ScreeningResult = {
  provider: string;
  checkedAt: string;
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  recommendation: "APPROVE" | "REVIEW" | "REJECT";
  checks: ScreeningCheck[];
};

/** KYC application. Personal fields are AES-256-GCM encrypted (columns ending in _enc). */
@Entity({ name: "kyc_application" })
@Index(["wallet", "submittedAt"])
export class KycApplication {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 42 })
  wallet: string;

  @Column({ type: "varchar", length: 16 })
  status: KycStatus;

  @Column({ name: "full_name_enc", type: "text" })
  fullNameEnc: string;

  @Column({ name: "email_enc", type: "text" })
  emailEnc: string;

  @Column({ name: "date_of_birth_enc", type: "text" })
  dateOfBirthEnc: string;

  @Column({ name: "address_enc", type: "text" })
  addressEnc: string;

  @Column({ name: "document_type", type: "varchar", length: 24 })
  documentType: string;

  @Column({ name: "document_number_enc", type: "text" })
  documentNumberEnc: string;

  @Column({ name: "document_fingerprint", type: "char", length: 64 })
  documentFingerprint: string;

  @Column({ name: "country_alpha2", type: "char", length: 2 })
  countryAlpha2: string;

  @Column({ name: "country_numeric", type: "smallint" })
  countryNumeric: number;

  @Column({ name: "requested_tier", type: "smallint" })
  requestedTier: number;

  @Column({ name: "approved_tier", type: "smallint", nullable: true })
  approvedTier: number | null;

  @Column({ name: "source_of_funds", type: "varchar", length: 64 })
  sourceOfFunds: string;

  @Column({ type: "jsonb" })
  screening: ScreeningResult;

  @Column({ name: "risk_level", type: "varchar", length: 8 })
  riskLevel: ScreeningResult["riskLevel"];

  @Column({ name: "submitted_at", type: "timestamptz" })
  submittedAt: Date;

  @Column({ name: "reviewed_by", type: "varchar", length: 42, nullable: true })
  reviewedBy: string | null;

  @Column({ name: "reviewed_at", type: "timestamptz", nullable: true })
  reviewedAt: Date | null;

  @Column({ name: "decision_reason", type: "text", nullable: true })
  decisionReason: string | null;

  @Column({ name: "tx_hash", type: "varchar", length: 66, nullable: true })
  txHash: string | null;

  @Column({ name: "kyc_expires_at", type: "timestamptz", nullable: true })
  kycExpiresAt: Date | null;
}

/** Append-only, hash-chained log of every off-chain decision and audited on-chain action. */
@Entity({ name: "audit_log" })
export class AuditLog {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "occurred_at", type: "timestamptz" })
  occurredAt: Date;

  @Column({ name: "actor_wallet", type: "varchar", length: 42, nullable: true })
  actorWallet: string | null;

  @Column({ name: "actor_role", type: "varchar", length: 32, nullable: true })
  actorRole: string | null;

  @Column({ type: "varchar", length: 64 })
  action: string;

  @Column({ name: "entity_type", type: "varchar", length: 32 })
  entityType: string;

  @Column({ name: "entity_id", type: "varchar", length: 128, nullable: true })
  entityId: string | null;

  @Column({ type: "text" })
  summary: string;

  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  details: Record<string, unknown>;

  @Column({ name: "tx_hash", type: "varchar", length: 66, nullable: true })
  txHash: string | null;

  @Column({ name: "prev_hash", type: "char", length: 64 })
  prevHash: string;

  @Column({ type: "char", length: 64 })
  hash: string;
}

export type AssetDocument = { name: string; sha256: string };

/** Off-chain description of a tokenized asset; served as the deed NFT's tokenURI metadata. */
@Entity({ name: "asset_profile" })
export class AssetProfile {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 120 })
  name: string;

  @Column({ name: "asset_class", type: "smallint" })
  assetClass: number;

  @Column({ type: "varchar", length: 160 })
  location: string;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  highlights: string[];

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  documents: AssetDocument[];

  @Column({ name: "document_hash", type: "char", length: 66 })
  documentHash: string;

  @Column({ name: "target_yield_bps", type: "integer", nullable: true })
  targetYieldBps: number | null;

  @Column({ name: "distribution_frequency", type: "varchar", length: 24, nullable: true })
  distributionFrequency: string | null;

  @Column({ name: "created_by", type: "varchar", length: 42 })
  createdBy: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}

export const ENTITIES = [AppUser, AuthNonce, KycApplication, AuditLog, AssetProfile];
