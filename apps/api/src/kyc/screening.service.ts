import { Injectable } from "@nestjs/common";
import { SANCTIONED_COUNTRIES } from "@rwa/contracts";

import type { ScreeningCheck, ScreeningResult } from "../database/entities";

export type ScreeningInput = {
  fullName: string;
  email: string;
  dateOfBirth: string; // YYYY-MM-DD
  addressLine: string;
  countryAlpha2: string;
  documentType: string;
  documentNumber: string;
  requestedTier: number;
  duplicateOfOtherWallet: boolean;
};

/**
 * Stand-in for a KYC/AML vendor (sanctions, PEP, document and age checks). It is deterministic
 * so reviews are reproducible; swap it for a real provider behind the same interface.
 */
@Injectable()
export class ScreeningService {
  static readonly PROVIDER = "Simulated screening v1";

  /** Fictional watch-list entries used by the simulated sanctions check. */
  private static readonly WATCHLIST = ["NORTHWIND SHELL TRADING", "GREY HARBOUR LOGISTICS", "ORION FRONT HOLDINGS"];

  private static readonly DOCUMENT_PATTERNS: Record<string, RegExp> = {
    PASSPORT: /^[A-Z0-9]{6,9}$/,
    NATIONAL_ID: /^[A-Z0-9]{5,20}$/,
    DRIVING_LICENCE: /^[A-Z0-9]{5,20}$/,
  };

  screen(input: ScreeningInput, now = new Date()): ScreeningResult {
    const checks: ScreeningCheck[] = [];
    const name = input.fullName.trim().toUpperCase().replace(/\s+/g, " ");

    const listed = ScreeningService.WATCHLIST.some((entry) => name.includes(entry));
    checks.push({
      name: "Sanctions list",
      result: listed ? "FAIL" : "CLEAR",
      detail: listed ? "Name matches a watch-list entry" : "No match",
    });

    const sanctionedCountry = SANCTIONED_COUNTRIES.includes(input.countryAlpha2.toUpperCase());
    checks.push({
      name: "Jurisdiction",
      result: sanctionedCountry ? "FAIL" : "CLEAR",
      detail: sanctionedCountry ? "Residence in a comprehensively sanctioned country" : "Permitted country",
    });

    const officialDomain = /\.(gov|gob|gouv|mil)(\.[a-z]{2})?$/i.test(input.email.split("@")[1] ?? "");
    checks.push({
      name: "Politically exposed person",
      result: officialDomain ? "REVIEW" : "CLEAR",
      detail: officialDomain ? "Public-sector e-mail domain; confirm PEP status" : "No indicator",
    });

    const age = this.age(input.dateOfBirth, now);
    checks.push({
      name: "Age",
      result: age >= 18 ? "CLEAR" : "FAIL",
      detail: Number.isFinite(age) ? `${age} years old` : "Invalid date of birth",
    });

    const pattern = ScreeningService.DOCUMENT_PATTERNS[input.documentType];
    const docOk = !!pattern && pattern.test(input.documentNumber.trim().toUpperCase());
    checks.push({
      name: "Identity document",
      result: docOk ? "CLEAR" : "REVIEW",
      detail: docOk ? "Format valid" : "Number format unusual for this document type",
    });

    checks.push({
      name: "Duplicate identity",
      result: input.duplicateOfOtherWallet ? "FAIL" : "CLEAR",
      detail: input.duplicateOfOtherWallet ? "Document already used by another wallet" : "Unique",
    });

    checks.push({
      name: "Proof of address",
      result: input.addressLine.trim().length >= 12 ? "CLEAR" : "REVIEW",
      detail: input.addressLine.trim().length >= 12 ? "Address complete" : "Address looks incomplete",
    });

    checks.push({
      name: "Investor category",
      result: input.requestedTier === 3 ? "REVIEW" : "CLEAR",
      detail:
        input.requestedTier === 3
          ? "Institutional status needs entity documents"
          : input.requestedTier === 2
            ? "Professional investor self-certification received"
            : "Retail investor",
    });

    const fails = checks.filter((c) => c.result === "FAIL").length;
    const reviews = checks.filter((c) => c.result === "REVIEW").length;
    const riskScore = Math.min(100, 5 + reviews * 20 + fails * 60);
    return {
      provider: ScreeningService.PROVIDER,
      checkedAt: now.toISOString(),
      riskScore,
      riskLevel: riskScore >= 60 ? "HIGH" : riskScore >= 25 ? "MEDIUM" : "LOW",
      recommendation: fails > 0 ? "REJECT" : reviews > 0 ? "REVIEW" : "APPROVE",
      checks,
    };
  }

  private age(dateOfBirth: string, now: Date): number {
    const dob = new Date(`${dateOfBirth}T00:00:00Z`);
    if (Number.isNaN(dob.getTime())) return Number.NaN;
    let age = now.getUTCFullYear() - dob.getUTCFullYear();
    const beforeBirthday =
      now.getUTCMonth() < dob.getUTCMonth() ||
      (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
    if (beforeBirthday) age -= 1;
    return age;
  }
}
