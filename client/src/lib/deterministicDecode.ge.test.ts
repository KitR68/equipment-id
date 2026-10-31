import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deterministicDecode } from "./deterministicDecode";

const model = "GTS17DTNNRWW";
const decode = (serial: string, modelNumber?: string, dateCode?: string) =>
  deterministicDecode("GE APPLIANCES", serial, dateCode, modelNumber);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("GE official household-appliance date codes", () => {
  const months = [
    ["A", "January"], ["D", "February"], ["F", "March"], ["G", "April"],
    ["H", "May"], ["L", "June"], ["M", "July"], ["R", "August"],
    ["S", "September"], ["T", "October"], ["V", "November"], ["Z", "December"],
  ];
  it.each(months)("maps month %s to %s", (letter, month) => {
    expect(decode(`${letter}A123456`)?.manufactureDate).toMatch(new RegExp(`^${month} `));
  });

  const recentYears = [
    ["A", 2025], ["D", 2026], ["F", 2015], ["G", 2016], ["H", 2017],
    ["L", 2018], ["M", 2019], ["R", 2020], ["S", 2021], ["T", 2022],
    ["V", 2023], ["Z", 2024],
  ] as const;
  it.each(recentYears)("includes official year %s=%s without inventing later cycles", (letter, year) => {
    const result = decode(`D${letter}123456`);
    expect(result?.manufactureDate).toContain(String(year));
    expect(result?.confidence).toBe("medium");
    const years = result!.manufactureDate.match(/\d{4}/g)!.map(Number);
    expect(Math.max(...years)).toBe(year);
  });

  it.each(["GE", "General Electric", "GENERAL ELECTRIC COMPANY", "GE APPLIANCES"])(
    "resolves DD to February 2026 for the verified model under alias %s",
    (manufacturer) => {
      const result = deterministicDecode(manufacturer, "DD123456", "245D000BP000", model);
      expect(result?.manufactureDate).toBe("2026-02");
      expect(result?.confidence).toBe("high");
      expect(result?.sources).toContain("https://products.geappliances.com/appliance/gea-support-search-content?contentId=16195");
      expect(result?.determination).toContain("September 2019");
    },
  );
  it("supports the exact retail model and optional serial suffix", () => {
    expect(decode("dd123456p", "GTS17DTNRWW")?.manufactureDate).toBe("2026-02");
  });
  it("preserves year ambiguity without model-era evidence", () => {
    const result = decode("DD123456", "GTS17OTHER");
    expect(result?.manufactureDate).toContain("2014");
    expect(result?.manufactureDate).toContain("2026");
    expect(result?.confidence).toBe("medium");
  });
  it("does not apply the verified era to lookalike model numbers", () => {
    expect(decode("DD123456", "GTS17DTNRWWX")?.confidence).toBe("medium");
  });
  it("excludes dates before September 2019 for the verified model", () => {
    expect(decode("MM123456", model)).toBeNull();
    expect(decode("SM123456", model)?.manufactureDate).toBe("2019-09");
  });
  it("excludes manufacture months in the future", () => {
    expect(decode("ZD123456", model)).toBeNull();
    expect(decode("ZD123456")?.manufactureDate).not.toContain("2026");
  });
  it.each(["BD123456", "DD12345", "DD1234567", "DD123456AB", "245D000BP000", "DDINVALID", "DB123456"])(
    "rejects unsupported or invalid serial %s instead of guessing",
    (serial) => expect(decode(serial, model)).toBeNull(),
  );
  it("does not derive a date from an auxiliary code when the serial is invalid", () => {
    expect(decode("invalid", model, "DD123456")).toBeNull();
  });
  it("retains GE decoding for a GE-built Kenmore appliance", () => {
    const result = deterministicDecode("Kenmore", "DD123456", null, "363.12345");
    expect(result?.manufactureDate).toContain("February");
    expect(result?.confidence).toBe("medium");
  });
});
