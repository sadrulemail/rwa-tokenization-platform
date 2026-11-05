import { Inject, Injectable, Logger, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import type { AppRole, StaffRole } from "@rwa/contracts";
import { type Hex } from "viem";
import { generateSiweNonce, parseSiweMessage } from "viem/siwe";
import { IsNull, LessThan, type Repository } from "typeorm";

import { AuditService } from "../audit/audit.service";
import { ChainService } from "../chain/chain.service";
import { APP_CONFIG, type AppConfig } from "../config";
import { AppUser, AuthNonce } from "../database/entities";

const NONCE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly staff = new Map<string, StaffRole>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @InjectRepository(AppUser) private readonly users: Repository<AppUser>,
    @InjectRepository(AuthNonce) private readonly nonces: Repository<AuthNonce>,
    private readonly jwt: JwtService,
    private readonly chain: ChainService,
    private readonly audit: AuditService,
  ) {}

  /** Staff roles follow the role addresses recorded at deployment. */
  onModuleInit() {
    const r = this.chain.deployment.roles;
    const map: [string, StaffRole][] = [
      [r.treasury, "TREASURY"],
      [r.valuator, "VALUATOR"],
      [r.operator, "ASSET_MANAGER"],
      [r.officer, "COMPLIANCE_OFFICER"],
      [r.admin, "ADMIN"],
    ];
    for (const [wallet, role] of map) this.staff.set(wallet.toLowerCase(), role);
    this.logger.log(`Staff wallets: ${[...this.staff].map(([w, role]) => `${role}=${w}`).join(", ")}`);
  }

  roleFor(wallet: string): AppRole {
    return this.staff.get(wallet.toLowerCase()) ?? "INVESTOR";
  }

  async issueNonce(): Promise<string> {
    await this.nonces.delete({ expiresAt: LessThan(new Date()) });
    const nonce = generateSiweNonce();
    await this.nonces.insert({ nonce, expiresAt: new Date(Date.now() + NONCE_TTL_MS), usedAt: null });
    return nonce;
  }

  /** Verifies an EIP-4361 message and signature, then issues a session token. */
  async signIn(message: string, signature: Hex) {
    const parsed = parseSiweMessage(message);
    const expectedDomain = new URL(this.config.webOrigin).host;
    if (!parsed.address || !parsed.nonce) throw new UnauthorizedException("Malformed sign-in message");
    if (parsed.domain !== expectedDomain) throw new UnauthorizedException("Sign-in message is for another site");
    if (parsed.chainId !== this.config.chainId) throw new UnauthorizedException("Wrong network");

    const nonce = await this.nonces.findOneBy({ nonce: parsed.nonce });
    if (!nonce || nonce.usedAt || nonce.expiresAt < new Date()) {
      throw new UnauthorizedException("Sign-in request expired. Try again.");
    }
    const valid = await this.chain.publicClient.verifySiweMessage({
      message,
      signature,
      domain: expectedDomain,
      nonce: parsed.nonce,
    });
    if (!valid) throw new UnauthorizedException("Signature does not match the wallet");

    // Single use: only the first request that flips used_at wins.
    const claimed = await this.nonces.update({ nonce: parsed.nonce, usedAt: IsNull() }, { usedAt: new Date() });
    if (!claimed.affected) throw new UnauthorizedException("Sign-in request already used");

    const wallet = parsed.address.toLowerCase();
    const role = this.roleFor(wallet);
    await this.users.upsert({ wallet, role, lastLoginAt: new Date() }, ["wallet"]);
    await this.audit.append({
      actorWallet: wallet,
      actorRole: role,
      action: "SIGNED_IN",
      entityType: "SESSION",
      entityId: wallet,
      summary: `Signed in as ${role.toLowerCase().replace("_", " ")}`,
    });
    const token = await this.jwt.signAsync({ sub: wallet, role });
    return { token, user: { wallet, role } };
  }
}
