import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { countryByAlpha2, INVESTOR_TIERS } from "@rwa/contracts";
import { getAddress } from "viem";
import { In, Not, type Repository } from "typeorm";

import { AuditService } from "../audit/audit.service";
import { ChainService } from "../chain/chain.service";
import type { SessionUser } from "../common/auth.decorators";
import { PiiCipher } from "../common/pii-cipher";
import { APP_CONFIG, type AppConfig } from "../config";
import { KycApplication } from "../database/entities";
import type { ApproveKycDto, SubmitKycDto } from "./kyc.dto";
import { ScreeningService } from "./screening.service";

const DAY_MS = 86_400_000;

@Injectable()
export class KycService {
  private readonly cipher: PiiCipher;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @InjectRepository(KycApplication) private readonly applications: Repository<KycApplication>,
    private readonly screening: ScreeningService,
    private readonly chain: ChainService,
    private readonly audit: AuditService,
  ) {
    this.cipher = new PiiCipher(config.piiKey);
  }

  private latest(wallet: string) {
    return this.applications.findOne({ where: { wallet: wallet.toLowerCase() }, order: { submittedAt: "DESC" } });
  }

  async statusFor(wallet: string) {
    const app = await this.latest(wallet);
    if (!app) return null;
    const expired = app.status === "APPROVED" && !!app.kycExpiresAt && app.kycExpiresAt < new Date();
    return {
      applicationId: app.id,
      status: expired ? "EXPIRED" : app.status,
      submittedAt: app.submittedAt,
      requestedTier: app.requestedTier,
      approvedTier: app.approvedTier,
      expiresAt: app.kycExpiresAt,
      decisionReason: app.status === "REJECTED" ? app.decisionReason : null,
      txHash: app.txHash,
    };
  }

  async submit(user: SessionUser, dto: SubmitKycDto) {
    if (user.role !== "INVESTOR") throw new BadRequestException("Staff wallets do not go through investor KYC");
    const current = await this.latest(user.wallet);
    if (current?.status === "SUBMITTED") throw new ConflictException("Your application is already under review");
    if (current?.status === "APPROVED" && current.kycExpiresAt && current.kycExpiresAt > new Date()) {
      throw new ConflictException("Your wallet is already verified");
    }

    const country = countryByAlpha2(dto.country)!;
    const documentNumber = dto.documentNumber.replace(/[\s-]/g, "").toUpperCase();
    const fingerprint = this.cipher.fingerprint(`${dto.documentType}:${documentNumber}`);
    const duplicate = await this.applications.exist({
      where: {
        documentFingerprint: fingerprint,
        wallet: Not(user.wallet),
        status: In(["SUBMITTED", "APPROVED"]),
      },
    });
    const screening = this.screening.screen({
      fullName: dto.fullName,
      email: dto.email,
      dateOfBirth: dto.dateOfBirth,
      addressLine: dto.addressLine,
      countryAlpha2: country.alpha2,
      documentType: dto.documentType,
      documentNumber,
      requestedTier: dto.requestedTier,
      duplicateOfOtherWallet: duplicate,
    });

    const saved = await this.applications.save(
      this.applications.create({
        wallet: user.wallet,
        status: "SUBMITTED",
        fullNameEnc: this.cipher.encrypt(dto.fullName.trim()),
        emailEnc: this.cipher.encrypt(dto.email.trim().toLowerCase()),
        dateOfBirthEnc: this.cipher.encrypt(dto.dateOfBirth),
        addressEnc: this.cipher.encrypt(dto.addressLine.trim()),
        documentType: dto.documentType,
        documentNumberEnc: this.cipher.encrypt(documentNumber),
        documentFingerprint: fingerprint,
        countryAlpha2: country.alpha2,
        countryNumeric: country.numeric,
        requestedTier: dto.requestedTier,
        approvedTier: null,
        sourceOfFunds: dto.sourceOfFunds,
        screening,
        riskLevel: screening.riskLevel,
        submittedAt: new Date(),
      }),
    );
    await this.audit.append({
      actorWallet: user.wallet,
      actorRole: user.role,
      action: "KYC_SUBMITTED",
      entityType: "KYC_APPLICATION",
      entityId: saved.id,
      summary: `KYC application submitted (${country.name}, ${INVESTOR_TIERS[dto.requestedTier]}); screening ${screening.recommendation.toLowerCase()}`,
      details: { riskScore: screening.riskScore, riskLevel: screening.riskLevel },
    });
    return this.view(saved, true);
  }

  async own(wallet: string) {
    const app = await this.latest(wallet);
    return app ? this.view(app, true) : null;
  }

  async list(status?: string) {
    const apps = await this.applications.find({
      where: status ? { status: status as KycApplication["status"] } : {},
      order: { submittedAt: "DESC" },
      take: 200,
    });
    return apps.map((a) => this.view(a, false));
  }

  async get(id: string) {
    return this.view(await this.find(id), true);
  }

  async approve(officer: SessionUser, id: string, dto: ApproveKycDto) {
    const app = await this.find(id);
    if (app.status !== "SUBMITTED") throw new ConflictException(`Application is ${app.status.toLowerCase()}`);
    if (app.screening.recommendation === "REJECT" && !dto.overrideReason) {
      throw new BadRequestException("Screening recommends rejection; give an override reason to approve");
    }
    // Base the expiry on whichever is later, the wall clock or the chain clock.
    const chainNow = await this.chain.chainTime();
    const base = Math.max(Date.now(), chainNow.getTime());
    const expiresAt = new Date(base + (dto.validityDays ?? this.config.kycValidityDays) * DAY_MS);
    const txHash = await this.chain.registerInvestor(getAddress(app.wallet), app.countryNumeric, dto.tier, expiresAt);

    app.status = "APPROVED";
    app.approvedTier = dto.tier;
    app.reviewedBy = officer.wallet;
    app.reviewedAt = new Date();
    app.decisionReason = dto.overrideReason ?? null;
    app.txHash = txHash;
    app.kycExpiresAt = expiresAt;
    await this.applications.save(app);
    await this.audit.append({
      actorWallet: officer.wallet,
      actorRole: officer.role,
      action: "KYC_APPROVED",
      entityType: "KYC_APPLICATION",
      entityId: app.id,
      summary: `Approved ${app.wallet} as ${INVESTOR_TIERS[dto.tier]} investor until ${expiresAt.toISOString().slice(0, 10)}`,
      details: { wallet: app.wallet, tier: dto.tier, country: app.countryNumeric, override: !!dto.overrideReason },
      txHash,
    });
    return this.view(app, true);
  }

  async reject(officer: SessionUser, id: string, reason: string) {
    const app = await this.find(id);
    if (app.status !== "SUBMITTED") throw new ConflictException(`Application is ${app.status.toLowerCase()}`);
    app.status = "REJECTED";
    app.reviewedBy = officer.wallet;
    app.reviewedAt = new Date();
    app.decisionReason = reason;
    await this.applications.save(app);
    await this.audit.append({
      actorWallet: officer.wallet,
      actorRole: officer.role,
      action: "KYC_REJECTED",
      entityType: "KYC_APPLICATION",
      entityId: app.id,
      summary: `Rejected KYC for ${app.wallet}: ${reason}`,
      details: { wallet: app.wallet },
    });
    return this.view(app, true);
  }

  async revoke(officer: SessionUser, wallet: string, reason: string) {
    const app = await this.latest(wallet);
    if (!app || app.status !== "APPROVED") throw new NotFoundException("No approved KYC for this wallet");
    const txHash = await this.chain.revokeInvestor(getAddress(app.wallet));
    app.status = "REVOKED";
    app.decisionReason = reason;
    app.reviewedBy = officer.wallet;
    app.reviewedAt = new Date();
    await this.applications.save(app);
    await this.audit.append({
      actorWallet: officer.wallet,
      actorRole: officer.role,
      action: "KYC_REVOKED",
      entityType: "KYC_APPLICATION",
      entityId: app.id,
      summary: `Revoked verification of ${app.wallet}: ${reason}`,
      details: { wallet: app.wallet },
      txHash,
    });
    return this.view(app, true);
  }

  private async find(id: string) {
    const app = await this.applications.findOneBy({ id });
    if (!app) throw new NotFoundException("Application not found");
    return app;
  }

  /** Decrypts for the owner and reviewers. List views mask the e-mail and document number. */
  private view(app: KycApplication, full: boolean) {
    const email = this.cipher.decrypt(app.emailEnc);
    const documentNumber = this.cipher.decrypt(app.documentNumberEnc);
    const mask = (v: string, keep: number) => `${"•".repeat(Math.max(0, v.length - keep))}${v.slice(-keep)}`;
    return {
      id: app.id,
      wallet: app.wallet,
      status: app.status,
      fullName: this.cipher.decrypt(app.fullNameEnc),
      email: full ? email : email.replace(/^(.).*(@.*)$/, "$1•••$2"),
      dateOfBirth: full ? this.cipher.decrypt(app.dateOfBirthEnc) : null,
      addressLine: full ? this.cipher.decrypt(app.addressEnc) : null,
      documentType: app.documentType,
      documentNumber: full ? documentNumber : mask(documentNumber, 3),
      country: { alpha2: app.countryAlpha2, numeric: app.countryNumeric, name: countryByAlpha2(app.countryAlpha2)?.name },
      requestedTier: app.requestedTier,
      approvedTier: app.approvedTier,
      sourceOfFunds: app.sourceOfFunds,
      screening: app.screening,
      riskLevel: app.riskLevel,
      submittedAt: app.submittedAt,
      reviewedBy: app.reviewedBy,
      reviewedAt: app.reviewedAt,
      decisionReason: app.decisionReason,
      txHash: app.txHash,
      expiresAt: app.kycExpiresAt,
    };
  }
}
