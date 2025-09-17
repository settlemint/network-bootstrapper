import { getAddress, isAddress, isHex } from "viem";
import { z } from "zod";

import type { BesuAllocAccount } from "../genesis/besu-genesis.service.ts";

type HexLiteral = `0x${string}`;

const HexStringSchema = z
  .string()
  .refine(
    (value) => isHex(value, { strict: true }),
    "Value must be a 0x-prefixed hex string"
  )
  .transform((value) => value as HexLiteral);

const AllocationEntrySchema = z.object({
  balance: HexStringSchema,
  code: HexStringSchema.optional(),
  storage: z
    .record(HexStringSchema, HexStringSchema)
    .default({})
    .transform((storage) =>
      Object.keys(storage).length === 0 ? undefined : storage
    ),
});

const AllocationFileSchema = z.record(
  z
    .string()
    .refine((value) => isAddress(value), "Invalid address")
    .transform((value) => getAddress(value)),
  AllocationEntrySchema
);

type AllocationFile = Record<string, BesuAllocAccount>;

export const loadAllocations = async (
  path: string
): Promise<AllocationFile> => {
  if (!path.endsWith(".json")) {
    throw new Error("Allocations file must be a .json file");
  }

  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`Allocations file not found at ${path}`);
  }

  let parsed: unknown;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Allocations file is not valid JSON: ${(error as Error).message}`
    );
  }

  const parsedAllocations = AllocationFileSchema.parse(parsed);
  const entries = Object.entries(parsedAllocations).map(
    ([address, account]) => [
      address,
      {
        balance: account.balance,
        code: account.code,
        storage: account.storage,
      } satisfies BesuAllocAccount,
    ]
  );

  return Object.fromEntries(entries);
};
