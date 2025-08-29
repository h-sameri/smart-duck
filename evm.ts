import * as viem from "viem";
import { hardhat } from "viem/chains";
import env, { isProd } from "./env";
import { privateKeyToAccount } from "viem/accounts";
import definitions from "./definitions";
import { duckchainMainnet } from "./evm/duckchainMainnet"

if (!viem.isHex(env.PVT_KEY)) {
  throw new Error("Invalid private key");
}

export const primaryChain = isProd ? duckchainMainnet : hardhat;

export const evmClient = viem
  .createWalletClient({
    chain: primaryChain,
    account: privateKeyToAccount(env.PVT_KEY),
    transport: viem.http(primaryChain.rpcUrls.default.http[0]),
  })
  .extend(viem.publicActions);

export type EvmClient = typeof evmClient;

export const contracts = {
  CaretOrchestrator() {
    return viem.getContract({
      client: evmClient,
      ...definitions.CaretOrchestrator,
    });
  },

  CaretEscrow(address: viem.Address) {
    return viem.getContract({
      client: evmClient,
      ...definitions.CaretEscrow,
      address,
    });
  },

  usdt() {
    return viem.getContract({
      client: evmClient,
      ...definitions.USDT,
    });
  },
};
