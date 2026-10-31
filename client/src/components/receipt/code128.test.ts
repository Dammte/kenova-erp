import { describe, expect, it } from "vitest";
import { PATTERNS, code128Values, code128Widths } from "./code128";

describe("Code 128", () => {
  it("has the 106 symbols, each 11 modules wide", () => {
    expect(PATTERNS).toHaveLength(106);
    for (const p of PATTERNS) expect([...p].reduce((s, w) => s + Number(w), 0)).toBe(11);
  });

  it("computes the checksum of the reference example", () => {
    // 104 + 48·1 + 42·2 + 42·3 + 17·4 + 18·5 + 19·6 + 35·7 = 879; 879 mod 103 = 55 (same as python-barcode).
    expect(code128Values("PJJ123C").at(-1)).toBe(55);
  });

  it("starts with start B and ends with the 13-module stop", () => {
    const w = code128Widths("MP-0142");
    expect(w.slice(0, 6).join("")).toBe("211214");
    expect(w.slice(-7).join("")).toBe("2331112");
    // Start, 7 characters and the checksum at 11 modules, plus the stop.
    expect(w.reduce((s, x) => s + x, 0)).toBe(9 * 11 + 13);
  });

  it("refuses characters a scanner could not read back", () => {
    expect(() => code128Values("MP-0142\n")).toThrow();
  });
});
