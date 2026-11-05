import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsString, Length, Matches } from "class-validator";
import type { Hex } from "viem";

import { CurrentUser, Public, type SessionUser } from "../common/auth.decorators";
import { KycService } from "../kyc/kyc.service";
import { AuthService } from "./auth.service";

class VerifyDto {
  @IsString()
  @Length(50, 2000)
  message: string;

  @Matches(/^0x[0-9a-fA-F]+$/)
  signature: Hex;
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly kyc: KycService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get("nonce")
  async nonce() {
    return { nonce: await this.auth.issueNonce() };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("verify")
  @HttpCode(200)
  verify(@Body() body: VerifyDto) {
    return this.auth.signIn(body.message, body.signature);
  }

  @Get("me")
  async me(@CurrentUser() user: SessionUser) {
    return { ...user, kyc: await this.kyc.statusFor(user.wallet) };
  }
}
