import { contracts } from "./evm";

await contracts
  .usdt()
  .write.transfer([
    "0xE9935F0A1FCE4fD1A1731BC707A55F70286EDe61",
    100_00000000_0000000000n,
  ]);
