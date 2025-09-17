import { describe, expect, test } from "bun:test";

import { NodeKeyFactory } from "./node-key-factory.ts";

const factory = new NodeKeyFactory();

describe("NodeKeyFactory", () => {
  test("generates unique key material", () => {
    const first = factory.generate();
    const second = factory.generate();

    expect(first.privateKey.startsWith("0x")).toBe(true);
    expect(first.publicKey.startsWith("0x")).toBe(true);
    expect(first.address.startsWith("0x")).toBe(true);
    expect(first.enode).toBe(first.privateKey);

    expect(first.privateKey).not.toBe(second.privateKey);
    expect(first.publicKey).not.toBe(second.publicKey);
    expect(first.address).not.toBe(second.address);
  });

  test("throws on empty label", () => {
    expect(() => new NodeKeyFactory(" ")).toThrow(
      "NodeKeyFactory label cannot be empty"
    );
  });
});
