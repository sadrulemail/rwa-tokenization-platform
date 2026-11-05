import { Controller, Get, Param, Query } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsNumberString, IsOptional, Matches, Max, Min } from "class-validator";

import { AuditService } from "../audit/audit.service";
import { CurrentUser, Public, Roles, type SessionUser } from "../common/auth.decorators";
import { MarketService } from "./market.service";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

class TokenParam {
  @Matches(ADDRESS)
  token: string;
}

class LimitQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit = 50;
}

class ActivityQuery extends LimitQuery {
  @IsOptional()
  @Matches(ADDRESS)
  token?: string;

  @IsOptional()
  @Matches(ADDRESS)
  account?: string;

  @IsOptional()
  @IsNumberString()
  before?: string;
}

class RequestsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1, 2, 3])
  status?: number;

  @IsOptional()
  @Matches(ADDRESS)
  token?: string;
}

@Controller()
export class MarketController {
  constructor(
    private readonly market: MarketService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Get("market/summary")
  summary() {
    return this.market.summary();
  }

  @Public()
  @Get("market/assets")
  assets() {
    return this.market.listAssets();
  }

  @Public()
  @Get("market/assets/:token")
  asset(@Param() p: TokenParam) {
    return this.market.asset(p.token);
  }

  @Public()
  @Get("market/assets/:token/valuations")
  valuations(@Param() p: TokenParam) {
    return this.market.valuations(p.token);
  }

  @Public()
  @Get("market/assets/:token/distributions")
  distributions(@Param() p: TokenParam) {
    return this.market.distributions(p.token);
  }

  @Public()
  @Get("market/assets/:token/transfers")
  transfers(@Param() p: TokenParam, @Query() q: LimitQuery) {
    return this.market.transfers(p.token, q.limit);
  }

  /** Cap table: restricted to staff. */
  @Get("market/assets/:token/holders")
  @Roles("ADMIN", "COMPLIANCE_OFFICER", "ASSET_MANAGER", "TREASURY")
  holders(@Param() p: TokenParam) {
    return this.market.holders(p.token);
  }

  /** On-chain events are public data; the feed is open like a block explorer. */
  @Public()
  @Get("market/activity")
  activity(@Query() q: ActivityQuery) {
    return this.market.activity(q);
  }

  /** Staff see every desk request; investors only their own. */
  @Get("market/requests")
  requests(@CurrentUser() user: SessionUser, @Query() q: RequestsQuery) {
    const account = user.role === "INVESTOR" ? user.wallet : undefined;
    return this.market.requests({ ...q, account });
  }

  @Get("portfolio")
  portfolio(@CurrentUser() user: SessionUser) {
    return this.market.portfolio(user.wallet);
  }

  @Get("dashboard")
  @Roles("ADMIN", "COMPLIANCE_OFFICER", "ASSET_MANAGER", "VALUATOR", "TREASURY")
  async dashboard() {
    const [summary, pendingKyc, auditCheck, recent] = await Promise.all([
      this.market.summary(),
      this.market.pendingKyc(),
      this.audit.verify(),
      this.market.activity({ limit: 12 }),
    ]);
    return { summary, pendingKyc, audit: auditCheck, recent };
  }
}
