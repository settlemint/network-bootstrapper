import { expect, test } from "bun:test";

// Sanity check to keep the test suite green until functional tests are added.
test("Bun runtime exposes a version string", () => {
  expect(typeof Bun.version).toBe("string");
  expect(Bun.version.length).toBeGreaterThan(0);
});
