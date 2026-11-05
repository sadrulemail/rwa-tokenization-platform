import { ScreeningService, type ScreeningInput } from "./screening.service";

const base: ScreeningInput = {
  fullName: "Amelia Hart",
  email: "amelia@example.com",
  dateOfBirth: "1988-04-12",
  addressLine: "14 Quay Street, Manchester M3 3HN",
  countryAlpha2: "GB",
  documentType: "PASSPORT",
  documentNumber: "533401287",
  requestedTier: 1,
  duplicateOfOtherWallet: false,
};
const now = new Date("2026-11-05T00:00:00Z");
const service = new ScreeningService();
const check = (input: Partial<ScreeningInput>, name: string) =>
  service.screen({ ...base, ...input }, now).checks.find((c) => c.name === name)!;

describe("ScreeningService", () => {
  it("clears a complete retail application", () => {
    const result = service.screen(base, now);
    expect(result.recommendation).toBe("APPROVE");
    expect(result.riskLevel).toBe("LOW");
    expect(result.checks.every((c) => c.result === "CLEAR")).toBe(true);
  });

  it("rejects sanctioned jurisdictions, minors, watch-list names and duplicates", () => {
    expect(check({ countryAlpha2: "KP" }, "Jurisdiction").result).toBe("FAIL");
    expect(check({ dateOfBirth: "2010-01-01" }, "Age").result).toBe("FAIL");
    expect(check({ fullName: "Grey Harbour Logistics Ltd" }, "Sanctions list").result).toBe("FAIL");
    expect(check({ duplicateOfOtherWallet: true }, "Duplicate identity").result).toBe("FAIL");
    expect(service.screen({ ...base, countryAlpha2: "IR" }, now)).toMatchObject({
      recommendation: "REJECT",
      riskLevel: "HIGH",
    });
  });

  it("flags items for manual review", () => {
    expect(check({ email: "j.doe@finance.gov.uk" }, "Politically exposed person").result).toBe("REVIEW");
    expect(check({ documentNumber: "12" }, "Identity document").result).toBe("REVIEW");
    expect(check({ requestedTier: 3 }, "Investor category").result).toBe("REVIEW");
    const result = service.screen({ ...base, requestedTier: 3 }, now);
    expect(result.recommendation).toBe("REVIEW");
    expect(result.riskLevel).toBe("MEDIUM");
  });

  it("computes age on the exact birthday boundary", () => {
    expect(check({ dateOfBirth: "2008-11-05" }, "Age").result).toBe("CLEAR");
    expect(check({ dateOfBirth: "2008-11-06" }, "Age").result).toBe("FAIL");
  });
});
