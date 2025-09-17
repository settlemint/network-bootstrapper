import { describe, expect, test } from "bun:test";

import { accent, label, muted, success } from "./colors.ts";

const SAMPLE = "hello";
const RESET = "\x1b[0m";

describe("CLI colors", () => {
  test("accent adds ANSI codes", () => {
    const result = accent(SAMPLE);
    expect(result.includes(SAMPLE)).toBe(true);
    expect(result.endsWith(RESET)).toBe(true);
    expect(result).not.toBe(SAMPLE);
  });

  test("label adds ANSI codes", () => {
    const result = label(SAMPLE);
    expect(result.includes(SAMPLE)).toBe(true);
    expect(result.endsWith(RESET)).toBe(true);
  });

  test("success adds ANSI codes", () => {
    const result = success(SAMPLE);
    expect(result.includes(SAMPLE)).toBe(true);
    expect(result.endsWith(RESET)).toBe(true);
  });

  test("muted adds ANSI codes", () => {
    const result = muted(SAMPLE);
    expect(result.includes(SAMPLE)).toBe(true);
    expect(result.endsWith(RESET)).toBe(true);
  });
});
