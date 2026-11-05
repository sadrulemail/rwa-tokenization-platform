import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { Matches } from "class-validator";

import { CurrentUser, Roles, type SessionUser } from "../common/auth.decorators";
import { ApproveKycDto, DecisionReasonDto, ListApplicationsQuery, SubmitKycDto } from "./kyc.dto";
import { KycService } from "./kyc.service";

class WalletParam {
  @Matches(/^0x[0-9a-fA-F]{40}$/)
  wallet: string;
}

/** Investor side of onboarding. */
@Controller("kyc")
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get("me")
  me(@CurrentUser() user: SessionUser) {
    return this.kyc.own(user.wallet);
  }

  @Post("applications")
  @Roles("INVESTOR")
  submit(@CurrentUser() user: SessionUser, @Body() body: SubmitKycDto) {
    return this.kyc.submit(user, body);
  }
}

/** Compliance officer review queue. */
@Controller("compliance")
@Roles("COMPLIANCE_OFFICER", "ADMIN")
export class ComplianceController {
  constructor(private readonly kyc: KycService) {}

  @Get("applications")
  list(@Query() query: ListApplicationsQuery) {
    return this.kyc.list(query.status);
  }

  @Get("applications/:id")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.kyc.get(id);
  }

  @Post("applications/:id/approve")
  @Roles("COMPLIANCE_OFFICER")
  approve(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: ApproveKycDto) {
    return this.kyc.approve(user, id, body);
  }

  @Post("applications/:id/reject")
  @Roles("COMPLIANCE_OFFICER")
  reject(
    @CurrentUser() user: SessionUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: DecisionReasonDto,
  ) {
    return this.kyc.reject(user, id, body.reason);
  }

  @Post("investors/:wallet/revoke")
  @Roles("COMPLIANCE_OFFICER")
  revoke(@CurrentUser() user: SessionUser, @Param() params: WalletParam, @Body() body: DecisionReasonDto) {
    return this.kyc.revoke(user, params.wallet, body.reason);
  }
}
