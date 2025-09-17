import type { Address, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

export type GeneratedNodeKey = {
  address: Address;
  enode: string;
  privateKey: Hex;
  publicKey: Hex;
};

/**
 * Provides lightweight wrappers around viem's account generation helpers.
 */
export class NodeKeyFactory {
  constructor(label = "node-key-factory") {
    if (label.trim().length === 0) {
      throw new Error("NodeKeyFactory label cannot be empty");
    }
  }

  /**
   * Generates a fresh private key alongside the derived public key, address,
   * and exposes the private key again under `enode` for downstream tooling.
   */
  generate(): GeneratedNodeKey {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const publicKey = account.publicKey;
    const address = account.address;
    const enode = privateKey;

    return {
      address,
      enode,
      privateKey,
      publicKey,
    };
  }
}
