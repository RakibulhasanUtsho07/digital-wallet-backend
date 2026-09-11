import { describe, expect, it } from "vitest";
import {
  getAgeOnDate,
  parseStrictDate,
  requireAdult,
  validateAndNormalizeNID,
} from "../src/modules/ekyc/validation.js";

describe("advanced e-KYC identity validation", () => {
  it("accepts Bangladesh 10, 13, and 17 digit NIDs", () => {
    const dateOfBirth = parseStrictDate("1994-07-10");
    expect(validateAndNormalizeNID("1234567890", dateOfBirth)).toBe("1234567890");
    expect(validateAndNormalizeNID("1234567890123", dateOfBirth)).toBe("19941234567890123");
    expect(validateAndNormalizeNID("19941234567890123", dateOfBirth)).toBe("19941234567890123");
  });

  it("rejects impossible calendar dates", () => {
    expect(() => parseStrictDate("2000-02-30")).toThrow("valid calendar date");
    expect(() => parseStrictDate("2000/02/29")).toThrow("YYYY-MM-DD");
  });

  it("enforces the adult boundary at day precision", () => {
    const onDate = new Date("2026-09-05T00:00:00.000Z");
    const adult = new Date("2008-09-05T00:00:00.000Z");
    const underage = new Date("2008-09-06T00:00:00.000Z");
    expect(getAgeOnDate(adult, onDate)).toBe(18);
    expect(getAgeOnDate(underage, onDate)).toBe(17);
    expect(() => requireAdult(underage, onDate)).toThrow("18");
  });
});
