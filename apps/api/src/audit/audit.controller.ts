import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsNumberString, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";

import { CurrentUser, Roles, type SessionUser } from "../common/auth.decorators";
import { AuditService } from "./audit.service";

/** On-chain actions the web app reports after the user's wallet confirms them. */
export const ONCHAIN_ACTIONS = [
  "ASSET_CREATED",
  "ALLOCATION_PROPOSED",
  "REQUEST_APPROVED",
  "REQUEST_REJECTED",
  "REQUEST_CANCELLED",
  "SUBSCRIPTION_REQUESTED",
  "REDEMPTION_REQUESTED",
  "VALUATION_UPDATED",
  "INCOME_DEPOSITED",
  "INCOME_CLAIMED",
  "WALLET_FROZEN",
  "WALLET_UNFROZEN",
  "FORCED_TRANSFER",
  "WALLET_RECOVERED",
  "ASSET_PAUSED",
  "ASSET_UNPAUSED",
  "COMPLIANCE_RULES_UPDATED",
  "COUNTRY_RESTRICTION_UPDATED",
  "ASSET_STATUS_CHANGED",
  "SHARES_TRANSFERRED",
] as const;

class RecordOnchainDto {
  @IsIn(ONCHAIN_ACTIONS)
  action: string;

  @Matches(/^0x[0-9a-fA-F]{64}$/)
  txHash: string;

  @IsString()
  @Length(1, 32)
  entityType: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  entityId?: string;

  @IsString()
  @Length(1, 500)
  summary: string;
}

class ListAuditQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;

  @IsOptional()
  @IsNumberString()
  before?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @Matches(/^0x[0-9a-fA-F]{40}$/)
  actor?: string;
}

@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Post("onchain")
  record(@CurrentUser() user: SessionUser, @Body() body: RecordOnchainDto) {
    return this.audit.recordOnchain(user, body);
  }

  @Get()
  @Roles("ADMIN", "COMPLIANCE_OFFICER")
  list(@Query() query: ListAuditQuery) {
    return this.audit.list(query);
  }

  @Get("verify")
  @Roles("ADMIN", "COMPLIANCE_OFFICER")
  verify() {
    return this.audit.verify();
  }
}
