import * as viem from "viem";
import { hardhat } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { duckchainMainnet } from "../duckchainMainnet";
import { Chain } from "viem";
import CaretOrchestrator from "../artifacts/src/CaretOrchestrator.sol/CaretOrchestrator.json";
import CaretEscrow from "../artifacts/src/CaretEscrow.sol/CaretEscrow.json";
import USDT from "../artifacts/src/usdt.sol/USDT.json";
import Token from "../artifacts/src/Token.sol/Token.json";
import { tokens } from "../../src/bot/tokens";

const networkArg = Bun.argv[2];
const isDuck = networkArg === "duck";

const privateKey = Bun.env.PRIVATE_KEY_1;
if (!privateKey || !viem.isHex(privateKey)) {
  throw new Error("PRIVATE_KEY_1 is invalid");
}

const getChain = () => {
  if (isDuck) return duckchainMainnet;
  return hardhat;
};

const getAccount = () => {
  if (isDuck) return privateKeyToAccount(privateKey);
  // fallback:
  return privateKeyToAccount(
    "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e"
  );
};

const getRpcUrl = () => {
  const chain = getChain();
  if (
    chain.rpcUrls &&
    chain.rpcUrls.default &&
    chain.rpcUrls.default.http &&
    chain.rpcUrls.default.http.length > 0
  ) {
    return chain.rpcUrls.default.http[0];
  }
  // fallback for hardhat
  return "http://127.0.0.1:8545";
};

const client = viem
  .createWalletClient({
    chain: getChain() as Chain,
    account: getAccount(),
    transport: viem.http(getRpcUrl()),
  })
  .extend(viem.publicActions);

const definitions: {
  CaretOrchestrator?: {
    abi: any;
    address?: viem.Address;
  };
  CaretEscrow?: {
    abi: any;
    address?: viem.Address;
  };
  USDT?: {
    abi: any;
    address?: viem.Address;
  };
  tokens?: Record<
    string,
    {
      abi: any;
      address: viem.Address;
    }
  >;
} = {};

async function main() {
  console.log(`Deploying to ${getChain().name}...`);
  console.log(`Deployer address: ${client.account.address}`);

  if (!viem.isHex(CaretOrchestrator.bytecode))
    throw new Error("CaretOrchestrator bytecode is missing or invalid");

  if (!viem.isHex(USDT.bytecode))
    throw new Error("USDT bytecode is missing or invalid");

  if (!viem.isHex(Token.bytecode))
    throw new Error("Token bytecode is missing or invalid");

  const serverAddress = client.account.address;

  console.log("Deploying USDT...");
  const usdtHash = await client.deployContract({
    abi: USDT.abi,
    bytecode: USDT.bytecode,
    args: [],
    chain: getChain() as Chain,
  });

  const usdtReceipt = await client.waitForTransactionReceipt({
    hash: usdtHash,
  });

  if (!usdtReceipt.contractAddress) throw new Error("USDT deployment failed");

  console.log(`USDT deployed at: ${usdtReceipt.contractAddress}`);

  console.log("Deploying CaretOrchestrator...");
  const orchestratorHash = await client.deployContract({
    abi: CaretOrchestrator.abi,
    bytecode: CaretOrchestrator.bytecode,
    args: [serverAddress, usdtReceipt.contractAddress],
    chain: getChain() as Chain,
  });

  const orchestratorReceipt = await client.waitForTransactionReceipt({
    hash: orchestratorHash,
  });

  if (!orchestratorReceipt.contractAddress)
    throw new Error("CaretOrchestrator deployment failed");

  console.log(
    `CaretOrchestrator deployed at: ${orchestratorReceipt.contractAddress}`
  );

  console.log("\nDeploying tokens...");
  const allTokens: Record<
    string,
    {
      abi: any;
      address: viem.Address;
    }
  > = {};

  for (const token of tokens) {
    const tokenName = `${token.name}`;
    const tokenSymbol = token.symbol;

    console.log(`Deploying ${tokenName} (${tokenSymbol})...`);

    const tokenHash = await client.deployContract({
      abi: Token.abi,
      bytecode: Token.bytecode,
      args: [tokenName, tokenSymbol, usdtReceipt.contractAddress],
      chain: getChain() as Chain,
    });

    const tokenReceipt = await client.waitForTransactionReceipt({
      hash: tokenHash,
    });

    if (!tokenReceipt.contractAddress)
      throw new Error(`${tokenSymbol} deployment failed`);

    console.log(
      `${tokenSymbol} deployed at: ${tokenReceipt.contractAddress}`
    );

    allTokens[tokenSymbol] = {
      abi: Token.abi,
      address: tokenReceipt.contractAddress,
    };
  }

  definitions["CaretOrchestrator"] = {
    abi: CaretOrchestrator.abi,
    address: orchestratorReceipt.contractAddress,
  };

  definitions["CaretEscrow"] = {
    abi: CaretEscrow.abi,
  };

  definitions["USDT"] = {
    abi: USDT.abi,
    address: usdtReceipt.contractAddress,
  };

  definitions.tokens = allTokens;

  console.log("\nDeployment Summary:");
  console.log("===================");
  console.log(`USDT: ${usdtReceipt.contractAddress}`);
  console.log(`CaretOrchestrator: ${orchestratorReceipt.contractAddress}`);
  console.log(`Server address: ${serverAddress}`);
  console.log(`Tokens deployed: ${Object.keys(tokens).length}`);
}

main()
  .then(async () => {
    await Bun.write(
      Bun.file("../definitions.json"),
      JSON.stringify(definitions, null, 2)
    );

    await Bun.write(
      Bun.file("../definitions.ts"),
      "const definitions = " +
        JSON.stringify(definitions, null, 2) +
        " as const;\nexport default definitions;\n"
    );

    console.log("\nDeployment successful! Contract definitions written to:");
  })
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
