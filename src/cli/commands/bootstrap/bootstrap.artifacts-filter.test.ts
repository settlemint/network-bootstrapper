import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ARTIFACT_FILTER,
  includesArtifact,
  parseArtifactList,
} from "./bootstrap.artifacts-filter.ts";

describe("parseArtifactList", () => {
  test("returns all artifacts by default", () => {
    const filter = parseArtifactList("");
    expect(filter).toEqual(DEFAULT_ARTIFACT_FILTER);
  });

  test("parses single artifact kind", () => {
    const filter = parseArtifactList("genesis");
    expect(filter.genesis).toBe(true);
    expect(filter.keys).toBe(false);
    expect(filter.abis).toBe(false);
    expect(filter.subgraph).toBe(false);
    expect(filter.allocations).toBe(false);
  });

  test("parses multiple artifact kinds", () => {
    const filter = parseArtifactList("genesis,keys,abis");
    expect(filter.genesis).toBe(true);
    expect(filter.keys).toBe(true);
    expect(filter.abis).toBe(true);
    expect(filter.subgraph).toBe(false);
    expect(filter.allocations).toBe(false);
  });

  test("handles whitespace around items", () => {
    const filter = parseArtifactList("  genesis  ,  keys  ,  abis  ");
    expect(filter.genesis).toBe(true);
    expect(filter.keys).toBe(true);
    expect(filter.abis).toBe(true);
    expect(filter.subgraph).toBe(false);
    expect(filter.allocations).toBe(false);
  });

  test("case insensitive parsing", () => {
    const filter = parseArtifactList("Genesis,KEYS,Abis");
    expect(filter.genesis).toBe(true);
    expect(filter.keys).toBe(true);
    expect(filter.abis).toBe(true);
  });

  test("throws on invalid artifact kind", () => {
    expect(() => parseArtifactList("invalid")).toThrow(
      'Invalid artifact kind: "invalid"'
    );
  });

  test("throws on partially valid list", () => {
    expect(() => parseArtifactList("genesis,invalid,keys")).toThrow(
      'Invalid artifact kind: "invalid"'
    );
  });

  test("ignores empty strings in list", () => {
    const filter = parseArtifactList("genesis,,keys,");
    expect(filter.genesis).toBe(true);
    expect(filter.keys).toBe(true);
    expect(filter.abis).toBe(false);
  });
});

describe("includesArtifact", () => {
  test("returns true for enabled artifacts", () => {
    const filter = parseArtifactList("genesis,keys");
    expect(includesArtifact(filter, "genesis")).toBe(true);
    expect(includesArtifact(filter, "keys")).toBe(true);
  });

  test("returns false for disabled artifacts", () => {
    const filter = parseArtifactList("genesis");
    expect(includesArtifact(filter, "keys")).toBe(false);
    expect(includesArtifact(filter, "abis")).toBe(false);
  });
});
