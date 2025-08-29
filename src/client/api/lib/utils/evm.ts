import { contracts } from "../../../../../evm";

export function fundWalletWithUSDT(walletAddress: `0x${string}`, amount: bigint) {
  return contracts
    .usdt()
    .write.transfer([walletAddress, amount]);
}