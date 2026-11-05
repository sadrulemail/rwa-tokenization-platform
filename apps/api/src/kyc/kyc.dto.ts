import { COUNTRIES } from "@rwa/contracts";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator";

export const DOCUMENT_TYPES = ["PASSPORT", "NATIONAL_ID", "DRIVING_LICENCE"] as const;
export const SOURCES_OF_FUNDS = [
  "EMPLOYMENT_INCOME",
  "BUSINESS_PROFITS",
  "INVESTMENTS",
  "SAVINGS",
  "INHERITANCE",
  "INSTITUTIONAL_CAPITAL",
] as const;

export class SubmitKycDto {
  @IsString()
  @Length(2, 120)
  fullName: string;

  @IsEmail()
  @Length(3, 160)
  email: string;

  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateOfBirth: string;

  @IsString()
  @Length(5, 200)
  addressLine: string;

  @IsIn(COUNTRIES.map((c) => c.alpha2))
  country: string;

  @IsIn(DOCUMENT_TYPES)
  documentType: string;

  @IsString()
  @Length(4, 24)
  @Matches(/^[A-Za-z0-9 -]+$/)
  documentNumber: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  requestedTier: number;

  @IsIn(SOURCES_OF_FUNDS)
  sourceOfFunds: string;
}

export class ApproveKycDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  tier: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(1095)
  validityDays?: number;

  /** Needed to approve against a REJECT screening recommendation. */
  @IsOptional()
  @IsString()
  @Length(10, 500)
  overrideReason?: string;
}

export class DecisionReasonDto {
  @IsString()
  @Length(5, 500)
  reason: string;
}

export class ListApplicationsQuery {
  @IsOptional()
  @IsIn(["SUBMITTED", "APPROVED", "REJECTED", "REVOKED"])
  status?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  latestOnly?: boolean;
}
