import { describe, expect, it } from "vitest";
import { formatMoneyInput, parseMoney } from "./money";

describe("parseMoney", () => {
  it.each([
    ["12", 12],
    ["12,5", 12.5],
    ["12.5", 12.5],
    ["12,50 €", 12.5],
    ["1.284,50", 1284.5],
    ["1284,5", 1284.5],
    ["1.284", 1284],
    [" 0,99 ", 0.99],
    ["0", 0],
  ])("reads %j as %d", (text, expected) => {
    expect(parseMoney(text)).toBe(expected);
  });

  it.each(["", "abc", "-5", "12,345", "12.345.6", "1,2,3", "12.5,0"])(
    "rejects %j",
    (text) => {
      expect(parseMoney(text)).toBeNull();
    },
  );
});

describe("formatMoneyInput", () => {
  it("writes Spanish decimals and thousands", () => {
    expect(formatMoneyInput(12.5)).toBe("12,50");
    expect(formatMoneyInput(1284.5)).toBe("1.284,50");
  });
});
