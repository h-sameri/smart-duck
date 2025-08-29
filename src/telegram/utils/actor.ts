import { evmClient, primaryChain } from "../../../evm";
import {
  createWalletClient,
  http,
  keccak256,
  toBytes,
  publicActions,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export async function deriveActor(seed: string) {
  const hash = keccak256(toBytes(seed));
  const pvtKey = hash as `0x${string}`;

  return createWalletClient({
    chain: primaryChain,
    account: privateKeyToAccount(pvtKey),
    transport: http(primaryChain.rpcUrls.default.http[0]),
  }).extend(publicActions);
}
