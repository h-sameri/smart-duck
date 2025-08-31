import { db } from "../../db";
import env from "../../env";
import { Bot, InlineKeyboard } from "grammy";
import { contracts, evmClient } from "../../evm";
import { deriveActor } from "./utils/actor";
import { tokens } from "../bot/tokens";
import definitions from "../../definitions";
import { Agent } from "../bot/agent";
import * as viem from "viem";
import { sleepSync } from "bun";

// Utility: Safe error reply
async function safeErrorReply(ctx: any, errorMessage: string, keyboard?: InlineKeyboard) {
  try {
    await ctx.reply(errorMessage, keyboard ? { reply_markup: keyboard, parse_mode: "Markdown" } : undefined);
  } catch (e) {
    try {
      await ctx.reply("An error occurred. Please try again later.");
    } catch {}
  }
}

// Utility: Format error message
function formatErrorMessage(error: any): string {
  if (typeof error === "string") return error;
  if (error && error.message) return error.message;
  return "Service temporarily unavailable. Please try again later.";
}

// Utility: Generate trade ID
function generateTradeId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Store for trade data (in-memory)
const tradeDataStore = new Map<string, any>();

// Store for user states (in-memory)
const userStates = new Map<number, any>();

export const bot = new Bot(env.TG_BOT_TOKEN!);


// Add global error handler to prevent server crashes

// Global error handler for bot errors
bot.catch((err) => {
  console.error("Bot error:", err);
  if (err.ctx && err.ctx.reply) {
    const keyboard = new InlineKeyboard()
      .text("📊 Main Menu", "back_to_menu")
      .row()
      .text("🤖 My Agents", "my_agents")
      .row()
      .text("📚 Help & Resources", "help_resources");
    err.ctx.reply(
      "🚨 **System Error**\n\nSorry, something went wrong. Please try again in a moment.",
      { reply_markup: keyboard, parse_mode: "Markdown" }
    ).catch(() => {
      err.ctx.reply("System Error: Sorry, something went wrong. Please try again in a moment.");
    });
  }
});
  
// Start the Telegram bot
bot.start();

// Start command: onboarding and T&C
bot.command("start", (ctx) => {
  const keyboard = new InlineKeyboard()
    .url("📜 Read Terms & Conditions", `${env.SERVER_URL}/tnc`)
    .row()
    .text("✅ Accept Terms & Conditions", "accept_tnc");

  const welcomeMessage = `🦆 Welcome to Smart Duck Trading bot on DuckChain!

Before you can use our services, please read and accept our Terms & Conditions.

Click the link to read the full terms, then click "Accept" to continue.

I will be waiting! 😀`;

  ctx.reply(welcomeMessage, { reply_markup: keyboard });
});

// Accept T&C callback
bot.callbackQuery("accept_tnc", async (ctx) => {
  const tg_id = ctx.from?.id;
  const tg_username = ctx.from?.username;
  const accepted_tnc_at = Date.now();
  const tnc_version = 1;

  if (!(tg_username && tg_id)) {
    await ctx.answerCallbackQuery({ text: "Missing Telegram info." });
    return;
  }

  db.run(
    "INSERT INTO users (telegram_username, telegram_id, accepted_tnc_at, tnc_version) VALUES (?, ?, ?, ?)",
    [tg_username, tg_id, accepted_tnc_at, tnc_version]
  );

  await ctx.answerCallbackQuery({ text: "Terms & Conditions accepted! ✅" });
  await ctx.editMessageText(
    "✅ Thank you for accepting our Terms & Conditions!\n\nYou can now start using Smart Duck!"
  );

  const options = new InlineKeyboard()
    .text("🦆 My Agents", `my_agents`)
    .row()
    .text("➕ New Agent", "add_agent")
    .row()
    .text("🪙 Token List", "token_list")
    .row()
    .text("📚 Help & Resources", "help_resources");

  const welcomeMessage = `🦆 Welcome to Smart Duck Trading bot on DuckChain!`;

  await ctx.reply(welcomeMessage, { reply_markup: options });
});

// Help & Resources callback
bot.callbackQuery("help_resources", async (ctx) => {
  await ctx.answerCallbackQuery();
  const message = `📚 **Help & Resources**\n\n` +
    `Here are helpful links to get you started with Smart Duck:\n\n` +
    `🌐 **Website & Documentation:** [smartduck.hesameri.com](https://smartduck.hesameri.com)\n` +
    `• Documentation, guides, and tutorials\n\n` +
    `💻 **GitHub Codebase:** [github.com/h-sameri/smart-duck](https://github.com/h-sameri/smart-duck)\n` +
    `• Open source code and contributions\n\n` +
    `📺 **Watch Demo:** [Youtube Link](https://youtu.be/x9dX_JgCdJI)\n`;
  const keyboard = new InlineKeyboard()
    .text("🔙 Back to Menu", "back_to_menu");
  await ctx.reply(message, { reply_markup: keyboard, parse_mode: "Markdown" });
});

async function safeDeleteMessage(ctx: any, messageId: number): Promise<void> {
  try {
    await ctx.api.deleteMessage(ctx.chat?.id!, messageId);
  } catch (error) {
    console.log(
      `Could not delete message ${messageId}:`,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

async function executeTrade(
  agentId: number,
  userId: number,
  tokenSymbol: string,
  tokenAmount: bigint,
  usdtCost: bigint,
  tradeType: "buy" | "sell" = "buy"
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const tokenContract = definitions.tokens?.[tokenSymbol];
    if (!tokenContract) {
      return { success: false, error: `Token ${tokenSymbol} not found` };
    }

    const agent = db
      .query("SELECT * FROM user_agents WHERE id = ? AND user_id = ?")
      .get(agentId, userId) as any;

    if (!agent) {
      return { success: false, error: "Agent not found" };
    }

    const usdtContract = {
      address: definitions.USDT!.address as viem.Address,
      abi: definitions.USDT!.abi,
    } as const;

    const seed = `${userId}_${agent.agent_name}`;
    const actorClient = await deriveActor(seed);

    const escrowAddress = agent.escrow_address as viem.Address;

    // Get USDT decimals for proper formatting
    const usdtDecimals = await actorClient.readContract({
      address: usdtContract.address,
      abi: usdtContract.abi,
      functionName: "decimals",
      args: [],
    });

    // Get token decimals
    const tokenDecimals = await actorClient.readContract({
      address: tokenContract.address,
      abi: tokenContract.abi,
      functionName: "decimals",
      args: [],
    });

    if (tradeType === "buy") {
      // For buying: check USDT balance in escrow
      const escrowUsdtBalance = await actorClient.readContract({
        address: usdtContract.address,
        abi: usdtContract.abi,
        functionName: "balanceOf",
        args: [escrowAddress],
      });
      
      console.log(`Initial escrow USDT balance: ${Number(escrowUsdtBalance) / 10**Number(usdtDecimals)} USDT`);
      console.log(`Required USDT cost: ${Number(usdtCost) / 10**Number(usdtDecimals)} USDT`);

      if (escrowUsdtBalance < usdtCost) {
        return {
          success: false,
          error: `Insufficient USDT balance. Escrow has ${
            Number(escrowUsdtBalance) / 10 ** Number(usdtDecimals)
          } USDT, but needs ${
            Number(usdtCost) / 10 ** Number(usdtDecimals)
          } USDT. Please fund the escrow address first.`,
        };
      }
    } else {
      // For selling: check token balance in escrow
      const escrowTokenBalance = await actorClient.readContract({
        address: tokenContract.address,
        abi: tokenContract.abi,
        functionName: "balanceOf",
        args: [escrowAddress],
      });
      
      console.log(`Initial escrow ${tokenSymbol} balance: ${Number(escrowTokenBalance) / 10**Number(tokenDecimals)} ${tokenSymbol}`);
      console.log(`Required ${tokenSymbol} amount: ${Number(tokenAmount) / 10**Number(tokenDecimals)} ${tokenSymbol}`);

      if (escrowTokenBalance < tokenAmount) {
        return {
          success: false,
          error: `Insufficient ${tokenSymbol} balance. Escrow has ${
            Number(escrowTokenBalance) / 10 ** Number(tokenDecimals)
          } ${tokenSymbol}, but needs ${
            Number(tokenAmount) / 10 ** Number(tokenDecimals)
          } ${tokenSymbol}. Please acquire ${tokenSymbol} first.`,
        };
      }
    }

    const actorTONBalance = await actorClient.getBalance({
      address: actorClient.account.address,
    });

    const minTONForGas = BigInt(1000000000000000);

    if (actorTONBalance < minTONForGas) {
      return {
        success: false,
        error: `Insufficient TON for gas fees. Actor has ${
          Number(actorTONBalance) / 10 ** 18
        } TON, but needs at least ${
          Number(minTONForGas) / 10 ** 18
        } TON. Please fund the actor address with TON.`,
      };
    }

    const escrowContract = {
      address: escrowAddress,
      abi: [
        {
          inputs: [
            { internalType: "address", name: "token_", type: "address" },
            { internalType: "uint256", name: "amount_", type: "uint256" },
          ],
          name: "fundActor",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function",
        },
      ],
    } as const;

    let hash: `0x${string}`;

    if (tradeType === "buy") {
      console.log(`Executing fundActor: transferring ${Number(usdtCost) / 10**Number(usdtDecimals)} USDT from escrow to actor`);
      
      const fundActorHash = await actorClient.writeContract({
        address: escrowContract.address,
        abi: escrowContract.abi,
        functionName: "fundActor",
        args: [usdtContract.address, usdtCost],
      });

      console.log(`FundActor transaction submitted: ${fundActorHash}`);
      const fundActorReceipt = await actorClient.waitForTransactionReceipt({ hash: fundActorHash });
      console.log(`FundActor transaction confirmed: ${fundActorReceipt.status}`);

      const currentAllowance = await actorClient.readContract({
        address: usdtContract.address,
        abi: usdtContract.abi,
        functionName: "allowance",
        args: [actorClient.account.address, tokenContract.address],
      });

      if (currentAllowance < usdtCost) {
        const approveHash = await actorClient.writeContract({
          address: usdtContract.address,
          abi: usdtContract.abi,
          functionName: "approve",
          args: [tokenContract.address, usdtCost],
        });

        await actorClient.waitForTransactionReceipt({ hash: approveHash });
      }

      hash = await actorClient.writeContract({
        address: tokenContract.address as viem.Address,
        abi: tokenContract.abi,
        functionName: "buy",
        args: [tokenAmount, usdtCost],
      }) as `0x${string}`;

      console.log(`Buy transaction executed: ${hash}`);
    } else {
      // For selling: transfer tokens from escrow to actor, then execute sell
      console.log(`Executing fundActor: transferring ${Number(tokenAmount) / 10**Number(tokenDecimals)} ${tokenSymbol} from escrow to actor`);
      
      const fundActorHash = await actorClient.writeContract({
        address: escrowContract.address,
        abi: escrowContract.abi,
        functionName: "fundActor",
        args: [tokenContract.address, tokenAmount],
      });

      console.log(`FundActor transaction submitted: ${fundActorHash}`);
      const fundActorReceipt = await actorClient.waitForTransactionReceipt({ hash: fundActorHash });
      console.log(`FundActor transaction confirmed: ${fundActorReceipt.status}`);

      // Check if actor has allowance to transfer tokens to the token contract
      const currentTokenAllowance = await actorClient.readContract({
        address: tokenContract.address,
        abi: tokenContract.abi,
        functionName: "allowance",
        args: [actorClient.account.address, tokenContract.address],
      });

      if (currentTokenAllowance < tokenAmount) {
        const approveHash = await actorClient.writeContract({
          address: tokenContract.address,
          abi: tokenContract.abi,
          functionName: "approve",
          args: [tokenContract.address, tokenAmount],
        });

        await actorClient.waitForTransactionReceipt({ hash: approveHash });
      }

      hash = await actorClient.writeContract({
        address: tokenContract.address as viem.Address,
        abi: tokenContract.abi,
        functionName: "sell",
        args: [tokenAmount, usdtCost], // usdtCost is the revenue we expect to get
      }) as `0x${string}`;

      console.log(`Sell transaction executed: ${hash}`);
    }

    // Wait for transaction to complete
    await actorClient.waitForTransactionReceipt({ hash });
    
    // Check final balances to verify the trade worked
    if (tradeType === "buy") {
      const finalEscrowUsdtBalance = await actorClient.readContract({
        address: usdtContract.address,
        abi: usdtContract.abi,
        functionName: "balanceOf",
        args: [escrowAddress],
      });
      
      console.log(`Final escrow USDT balance: ${Number(finalEscrowUsdtBalance) / 10**Number(usdtDecimals)} USDT`);
    } else {
      const finalEscrowTokenBalance = await actorClient.readContract({
        address: tokenContract.address,
        abi: tokenContract.abi,
        functionName: "balanceOf",
        args: [escrowAddress],
      });
      
      console.log(`Final escrow ${tokenSymbol} balance: ${Number(finalEscrowTokenBalance) / 10**Number(tokenDecimals)} ${tokenSymbol}`);
    }

    return { success: true, txHash: hash };
  } catch (error) {
    console.error("Trade execution error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

bot.use((ctx, next) => {
  if (ctx.chat?.type !== "private") {
    return ctx.reply("This bot can only be used in private chats (DMs).");
  }
  return next();
});

function isUserRegistered(telegramId: number): boolean {
  const user = db
    .query("SELECT id FROM users WHERE telegram_id = ?")
    .get(telegramId);
  return !!user;
}

function getUserId(telegramId: number): number | null {
  const user = db
    .query("SELECT id FROM users WHERE telegram_id = ?")
    .get(telegramId) as { id: number } | undefined;
  return user ? user.id : null;
}

async function getUSDTBalance(escrowAddress: string): Promise<string> {
  try {
    const usdtContract = contracts.usdt();
    const balance = await usdtContract.read.balanceOf([
      escrowAddress as `0x${string}`,
    ]);
    const decimals = await usdtContract.read.decimals();

    const balanceFormatted = Number(balance) / Math.pow(10, Number(decimals));
    return balanceFormatted.toFixed(2);
    //return "0.000000";
  } catch (error) {
    console.error("Error fetching USDT balance:", error);
    return "0.000000";
  }
}

async function getTONBalance(address: string): Promise<string> {
  try {
    const balance = await evmClient.getBalance({
      address: address as `0x${string}`,
    });

    const balanceFormatted = Number(balance) / Math.pow(10, 18);
    return balanceFormatted.toFixed(4);
  } catch (error) {
    console.error("Error fetching TON balance:", error);
    return "0.0000";
  }
}

async function getActorAddress(
  userId: number,
  agentName: string
): Promise<string> {
  const seed = `${userId}_${agentName}`;
  const actorClient = await deriveActor(seed);
  return actorClient.account.address;
}

async function getActorTONBalance(
  userId: number,
  agentName: string
): Promise<string> {
  try {
    const actorAddress = await getActorAddress(userId, agentName);
    return await getTONBalance(actorAddress);
    //return "0.0000"
  } catch (error) {
    console.error("Error fetching actor TON balance:", error);
    return "0.0000";
  }
}

async function getAllTokenBalances(
  escrowAddress: string
): Promise<Array<{ symbol: string; balance: string; name: string }>> {
  const balances: Array<{ symbol: string; balance: string; name: string }> = [];

  try {
    const tonBalance = await getTONBalance(escrowAddress);
    if (parseFloat(tonBalance) > 0) {
      balances.push({
        symbol: "TON",
        balance: tonBalance,
        name: "TON",
      });
    }

    const usdtBalance = await getUSDTBalance(escrowAddress);
    if (parseFloat(usdtBalance) > 0) {
      balances.push({
        symbol: "USDT",
        balance: usdtBalance,
        name: "USDT",
      });
    }

    if (definitions.tokens) {
      for (const [symbol, tokenDef] of Object.entries(definitions.tokens)) {
        try {
          const tokenContract = {
            address: tokenDef.address,
            abi: tokenDef.abi,
          } as const;

          const balance = await evmClient.readContract({
            address: tokenContract.address,
            abi: tokenContract.abi,
            functionName: "balanceOf",
            args: [escrowAddress as `0x${string}`],
          });

          const decimals = await evmClient.readContract({
            address: tokenContract.address,
            abi: tokenContract.abi,
            functionName: "decimals",
            args: [],
          });

          const name = await evmClient.readContract({
            address: tokenContract.address,
            abi: tokenContract.abi,
            functionName: "name",
            args: [],
          });

          const balanceFormatted =
            Number(balance) / Math.pow(10, Number(decimals));

          if (balanceFormatted > 0) {
            balances.push({
              symbol,
              balance: balanceFormatted.toFixed(6),
              name: name as string,
            });
          }
        } catch (error) {
          console.error(`Error fetching balance for ${symbol}:`, error);
        }
      }
    }
  } catch (error) {
    console.error("Error fetching token balances:", error);
  }

  return balances;
}

const userSessions = new Map<number, { step: string; data?: any }>();

enum MessageType {
  CHAT = "chat",
  TRADE_EXECUTION = "trade_execution",
  TRADE_RECOMMENDATION = "trade_recommendation",
  AGENT_SETUP = "agent_setup",
}

interface ClassificationResult {
  type: MessageType;
  confidence: number;
  extractedData?: {
    token?: string;
    action?: string;
    amount?: number;
  };
}

async function classifyMessage(message: string): Promise<ClassificationResult> {
  const lowerMessage = message.toLowerCase().trim();

  const agentSetupKeywords = [
    "create agent",
    "new agent",
    "add agent",
    "setup agent",
    "make agent",
  ];
  if (agentSetupKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    return {
      type: MessageType.AGENT_SETUP,
      confidence: 0.9,
    };
  }

  const executionKeywords = [
    "buy",
    "sell",
    "execute",
    "trade",
    "purchase",
    "swap",
  ];
  const amountKeywords = ["$", "usdt", "dollar", "worth"];

  const hasExecutionKeyword = executionKeywords.some((keyword) =>
    lowerMessage.includes(keyword)
  );
  const hasAmountOrToken =
    amountKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
    tokens.some((token) => lowerMessage.includes(token.symbol.toLowerCase()));

  if (hasExecutionKeyword && hasAmountOrToken) {
    const action = executionKeywords.find((keyword) =>
      lowerMessage.includes(keyword)
    );
    const token = tokens.find((t) =>
      lowerMessage.includes(t.symbol.toLowerCase())
    )?.symbol;

    const amountMatch = lowerMessage.match(
      /(\d+(?:\.\d+)?)\s*(?:\$|usdt|dollar)/
    );
    const amount = amountMatch ? parseFloat(amountMatch[1]) : undefined;

    return {
      type: MessageType.TRADE_EXECUTION,
      confidence: 0.8,
      extractedData: {
        token,
        action,
        amount,
      },
    };
  }

  const recommendationKeywords = [
    "recommend",
    "suggestion",
    "advice",
    "what should i",
    "trade idea",
    "analysis",
    "prediction",
    "forecast",
    "outlook",
    "should i buy",
    "should i sell",
    "good trade",
    "trading opportunity",
  ];

  if (
    recommendationKeywords.some((keyword) => lowerMessage.includes(keyword))
  ) {
    return {
      type: MessageType.TRADE_RECOMMENDATION,
      confidence: 0.7,
    };
  }

  return {
    type: MessageType.CHAT,
    confidence: 0.6,
  };
}

async function handleChatMessage(ctx: any, message: string): Promise<void> {
  const chatAgent = new Agent({
    model: "gemini-2.0-flash",
    preamble: `You are a helpful cryptocurrency trading bot assistant. 
    
    The user is chatting with you casually. Provide a friendly, helpful response while gently encouraging them to use the trading bot features.
    
    Keep responses concise and friendly. Always mention that they can use the bot's trading features for specific trading help.
    
    Available bot features:
    - Create trading agents with custom strategies
    - Get trade recommendations
    - Execute trades (if agents are funded)
    - View market data
    
    Don't provide specific trading advice in chat - direct them to use the bot's trading features instead.`,
  });

  try {
    const response = await chatAgent.prompt(message);
    const responseText =
      response?.parts?.[0]?.text ||
      "I'm here to help! Use the menu buttons to access trading features.";

    const keyboard = new InlineKeyboard()
      .text("🤖 My Agents", "my_agents")
      .text("➕ New Agent", "add_agent")
      .row()
      .text("🪙 Token List", "token_list")
      .text("📚 Help & Resources", "help_resources")
      .row()
      .text("📊 Main Menu", "back_to_menu");

    await ctx.reply(
      `${responseText}\n\n💡 **Quick Access:**\nUse the buttons below to access trading features!`,
      { reply_markup: keyboard, parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error("Error in chat response:", error);

    const keyboard = new InlineKeyboard()
      .text("🤖 My Agents", "my_agents")
      .text("➕ New Agent", "add_agent")
      .row()
      .text("📚 Help & Resources", "help_resources")
      .row()
      .text("📊 Main Menu", "back_to_menu");

    // Check if it's an API quota error
    let errorMessage = "Hi! I'm your trading bot assistant. 🤖\n\n" +
      "I can help you create trading agents, get recommendations, and execute trades.\n\n" +
      "Use the buttons below to get started!";
    
    if (error instanceof Error && error.message === "API_QUOTA_EXCEEDED") {
      errorMessage = "🚫 **Chat Service Temporarily Limited**\n\n" +
        "Our AI chat is temporarily at capacity. You can still use all trading features below!\n\n" +
        "💡 **Available Features:**";
    }
    
    await safeErrorReply(ctx, errorMessage, keyboard);
  }
}

async function handleTradeExecution(
  ctx: any,
  message: string,
  extractedData: any
): Promise<void> {
  const userId = getUserId(ctx.from?.id!);
  if (!userId) {
    return ctx.reply("User not found. Please use /start to register.");
  }

  const agents = db
    .query("SELECT * FROM user_agents WHERE user_id = ?")
    .all(userId);

  if (agents.length === 0) {
    const keyboard = new InlineKeyboard()
      .text("➕ Create Your First Agent", "add_agent")
      .row()
      .text("🔙 Back to Menu", "back_to_menu");

    return ctx.reply(
      "🤖 **Trade Execution Request Detected**\n\n" +
        "To execute trades, you need to create a trading agent first.\n\n" +
        "💡 **What was detected:**\n" +
        `• Action: ${extractedData.action || "trade"}\n` +
        `• Token: ${extractedData.token || "not specified"}\n` +
        `• Amount: ${
          extractedData.amount ? `$${extractedData.amount}` : "not specified"
        }\n\n` +
        "Create an agent to get started with automated trading!",
      { reply_markup: keyboard, parse_mode: "Markdown" }
    );
  }

  // If user has only one agent, execute the trade directly with that agent
  if (agents.length === 1) {
    const agent: any = agents[0];
    await executeDirectTrade(ctx, userId, agent.id, message);
    return;
  }

  // If user has multiple agents, let them choose which agent to use
  let responseMessage = "🤖 **Trade Execution Request**\n\n";
  responseMessage += "💡 **Detected Trade Details:**\n";
  responseMessage += `• Action: ${extractedData.action || "trade"}\n`;
  responseMessage += `• Token: ${extractedData.token || "not specified"}\n`;
  responseMessage += `• Amount: ${
    extractedData.amount ? `$${extractedData.amount}` : "not specified"
  }\n\n`;
  responseMessage += "🤖 **Choose an agent to execute this trade:**\n";

  const keyboard = new InlineKeyboard();

  for (let i = 0; i < agents.length; i++) {
    const agent: any = agents[i];
    responseMessage += `${i + 1}. ${agent.agent_name}\n`;
    keyboard.text(`⚡ ${agent.agent_name}`, `direct_trade_${agent.id}_${encodeURIComponent(message)}`).row();
  }

  keyboard.text("🔙 Back to Menu", "back_to_menu");

  await ctx.reply(responseMessage, {
    reply_markup: keyboard,
    parse_mode: "Markdown",
  });
}

async function executeDirectTrade(
  ctx: any,
  userId: number,
  agentId: number,
  tradePrompt: string
): Promise<void> {
  const agent = db
    .query("SELECT * FROM user_agents WHERE id = ? AND user_id = ?")
    .get(agentId, userId) as any;

  if (!agent) {
    return ctx.reply("❌ Agent not found or session expired.");
  }

  try {
    // Check funding status first
    const usdtBalance = await getUSDTBalance(agent.escrow_address);
    const actorTONBalance = await getActorTONBalance(userId, agent.agent_name);

    const hasUsdt = parseFloat(usdtBalance) > 0;
    const hasTON = parseFloat(actorTONBalance) > 0;

    if (!hasUsdt || !hasTON) {
      const actorAddress = await getActorAddress(userId, agent.agent_name);

      let message = "❌ **Cannot execute trade**\n\n";
      message += "Your agent needs both USDT and TON to execute trades:\n\n";

      if (!hasUsdt) {
        message += `🏦 **Missing USDT** in escrow\n`;
        message += `Send USDT to: \`${agent.escrow_address}\`\n\n`;
      } else {
        message += `✅ USDT available in escrow: ${usdtBalance} USDT\n\n`;
      }

      if (!hasTON) {
        message += `⚡ **Missing TON** for gas fees\n`;
        message += `Send TON to: \`${actorAddress}\`\n\n`;
      } else {
        message += `✅ TON available for gas: ${actorTONBalance} TON\n\n`;
      }

      message += "💡 Use the 'Fund Agent' button to get funding instructions.";

      const keyboard = new InlineKeyboard()
        .text("💸 Fund Agent", `fund_agent_${agentId}`)
        .text("💰 Check Balance", `agent_balance_${agentId}`)
        .row()
        .text("🔙 Back to Agent", `agent_${agentId}`);

      return ctx.reply(message, {
        reply_markup: keyboard,
        parse_mode: "Markdown",
      });
    }

    const loadingMessage = await ctx.reply(
      "⚡ **Processing Trade Request...**\n\n" +
        `Your agent is analyzing your request: "${tradePrompt}"\n\n` +
        "⏳ Generating trade suggestion...",
      { parse_mode: "Markdown" }
    );

    const tradingAgent = new Agent({
      model: "gemini-2.0-flash",
      preamble: `You are a professional cryptocurrency trading agent with specific user instructions.`,
    });

    let userPrompt = `TRADE REQUEST: "${tradePrompt}"\n\n`;
    userPrompt += `Please analyze this specific trade request and provide a recommendation.\n\n`;
    userPrompt += `My general trading strategy for context: "${agent.instructions}"\n\n`;
    userPrompt += `Generate a specific trade suggestion based on the request above, considering both the request and my trading strategy.\n\n`;

    const declinedTrades = db
      .query(
        "SELECT trade_data FROM declined_trades WHERE user_id = ? AND agent_id = ? ORDER BY declined_at DESC LIMIT 3"
      )
      .all(userId, agentId) as any[];

    if (declinedTrades.length > 0) {
      userPrompt += `\nFor context, here are some recent trade suggestions I declined (avoid similar trades):\n`;
      declinedTrades.forEach((decline, index) => {
        try {
          const tradeData = JSON.parse(decline.trade_data);
          userPrompt += `${index + 1}. ${tradeData.token_symbol} - ${
            tradeData.reasoning
          }\n`;
        } catch (e) {}
      });
    }

    const walletBalance = parseFloat(usdtBalance);
    const result = await tradingAgent.enhancedWorkflow(userPrompt, walletBalance);

    await safeDeleteMessage(ctx, loadingMessage.message_id);

    if (result.error) {
      const keyboard = new InlineKeyboard()
        .text("🔄 Try Again", `execute_trade_${agentId}`)
        .row()
        .text("🤖 Back to Agent", `agent_${agentId}`)
        .row()
        .text("🔙 Back to Agents", "my_agents");

      // Check if it's a descriptive error (like prompt guard failure) or a generic service error
      let errorMessage: string;
      if (result.error === 'API_QUOTA_EXCEEDED' || result.error === 'AI_SERVICE_UNAVAILABLE' || result.error === 'SERVICE_UNAVAILABLE') {
        // Use formatted message for service errors
        const formattedError = formatErrorMessage(result.error);
        errorMessage = `❌ **Error generating trade for your request:**\n\n${formattedError}`;
      } else {
        // Show the actual descriptive error for prompt guard failures and other specific errors
        errorMessage = `❌ **Cannot process your trade request:**\n\n${result.error}\n\n💡 **Tip:** Make sure your request aligns with your agent's trading strategy, or create a new agent with different instructions.`;
      }
      
      return safeErrorReply(ctx, errorMessage, keyboard);
    }

    let responseMessage = `⚡ **Direct Trade Execution: "${tradePrompt}"**\n\n`;
    responseMessage += `🤖 **Agent:** ${agent.agent_name}\n`;
    responseMessage += `📝 **Your Request:** ${tradePrompt}\n\n`;

    if (result.tradeDecision) {
      const td = result.tradeDecision;

      console.log(`AI Trade Decision:`, {
        token: td.token,
        entry: td.entry,
        tradeAmount: td.tradeAmount,
        message: td.message
      });

      // Use AI's suggested trade amount in USDT, fallback to reasonable amount if not provided
      const usdtAmount = td.tradeAmount || Math.min(50, walletBalance * 0.3);
      // Calculate token amount based on USDT amount and entry price
      const tokenAmount = usdtAmount / td.entry;

      console.log(`Trade calculation: ${usdtAmount} USDT / ${td.entry} = ${tokenAmount} tokens`);

      const tradeData = {
        type: "tradeDecision", // Required for execution handler validation
        token_symbol: td.token.toUpperCase(),
        token_amount: tokenAmount,
        usdt_cost: usdtAmount,
        reasoning: td.message,
        confidence: td.confidence,
        data: {
          token: td.token.toUpperCase(),
          tradeType: td.tradeType || "buy",
          entry: td.entry,
          currentPrice: td.currentPrice,
          sl: td.sl,
          tp: td.tp,
          message: td.message,
          confidence: td.confidence,
          tradeAmount: usdtAmount
        }
      };

      responseMessage += `🎯 **Recommended Trade:**\n`;
      responseMessage += `• **Token:** ${tradeData.token_symbol}\n`;
      responseMessage += `• **Entry Price:** $${td.entry.toFixed(4)}\n`;
      responseMessage += `• **Current Price:** $${td.currentPrice.toFixed(4)}\n`;
      responseMessage += `• **Stop Loss:** $${td.sl.toFixed(4)}\n`;
      responseMessage += `• **Take Profit:** $${td.tp.toFixed(4)}\n`;
      responseMessage += `• **Confidence:** ${tradeData.confidence}%\n\n`;
      
      responseMessage += `📊 **Analysis:**\n${tradeData.reasoning}\n\n`;
      
      responseMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      responseMessage += `💰 **🎯 SUGGESTED TRADE AMOUNT: ${tradeData.usdt_cost.toFixed(2)} USDT**\n`;
      const tradeAction = tradeData.data?.tradeType === "sell" ? "sell" : "purchase";
      responseMessage += `📦 *Will ${tradeAction} approximately ${tradeData.token_amount.toFixed(6)} ${tradeData.token_symbol}*\n`;
      responseMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      const tradeId = generateTradeId();
      tradeDataStore.set(tradeId, {
        ...tradeData,
        agentId: agentId,
        userId: userId,
        timestamp: Date.now(),
      });

      // Set 5 minute expiry for trade data
      setTimeout(() => {
        tradeDataStore.delete(tradeId);
      }, 5 * 60 * 1000);

      responseMessage += "🚀 **Choose your action:**";

      const keyboard = new InlineKeyboard()
        .text("✅ Accept Trade", `confirm_trade_${agentId}_${tradeId}`)
        .text("💰 Custom Amount", `custom_amount_${agentId}_${tradeId}`)
        .row()
        .text("❌ Decline", `decline_trade_${agentId}_${tradeId}`)
        .text("🔙 Back to Agent", `agent_${agentId}`);

      await ctx.reply(responseMessage, {
        reply_markup: keyboard,
        parse_mode: "Markdown",
      });
    } else {
      const keyboard = new InlineKeyboard()
        .text("🔄 Try Again", `execute_trade_${agentId}`)
        .text("🔙 Back to Agent", `agent_${agentId}`);

      await ctx.reply(
        "❌ **No trade suggestion generated**\n\n" +
          "The agent couldn't generate a suitable trade for your request. Please try with a different prompt.",
        { reply_markup: keyboard, parse_mode: "Markdown" }
      );
    }
  } catch (error) {
    console.error("Error executing direct trade:", error);

    const keyboard = new InlineKeyboard()
      .text("🔄 Try Again", `execute_trade_${agentId}`)
      .text("🔙 Back to Agent", `agent_${agentId}`);

    const formattedError = formatErrorMessage(error);
    const errorMessage = "❌ **Error executing trade**\n\n" + formattedError;
    
    await safeErrorReply(ctx, errorMessage, keyboard);
  }
}

async function handleTradeRecommendation(
  ctx: any,
  message: string
): Promise<void> {
  const userId = getUserId(ctx.from?.id!);
  if (!userId) {
    return ctx.reply("User not found. Please use /start to register.");
  }

  const agents = db
    .query("SELECT * FROM user_agents WHERE user_id = ?")
    .all(userId);

  if (agents.length === 0) {
    const keyboard = new InlineKeyboard()
      .text("➕ Create Your First Agent", "add_agent")
      .row()
      .text("🔙 Back to Menu", "back_to_menu");

    return ctx.reply(
      "🤖 **Trade Recommendation Request**\n\n" +
        "To get personalized trade recommendations, you need to create a trading agent with your strategy first.\n\n" +
        "Your agent will analyze the market based on your specific instructions and provide tailored recommendations.",
      { reply_markup: keyboard, parse_mode: "Markdown" }
    );
  }

  let responseMessage = "🤖 **Trade Recommendation Request**\n\n";
  responseMessage +=
    "Choose an agent to get a personalized trade recommendation based on their strategy:\n\n";

  const keyboard = new InlineKeyboard();

  for (let i = 0; i < agents.length; i++) {
    const agent: any = agents[i];
    responseMessage += `${i + 1}. **${agent.agent_name}**\n`;
    responseMessage += `   Strategy: ${agent.instructions.substring(0, 80)}${
      agent.instructions.length > 80 ? "..." : ""
    }\n\n`;
    keyboard
      .text(`💡 ${agent.agent_name} Suggestion`, `trade_suggestion_${agent.id}`)
      .row();
  }

  keyboard.text("🔙 Back to Menu", "back_to_menu");

  await ctx.reply(responseMessage, {
    reply_markup: keyboard,
    parse_mode: "Markdown",
  });
}

bot.use((ctx, next) => {
  const telegramId = ctx.from?.id;

  if (!telegramId) {
    return ctx.reply("Unable to identify user. Please try again.");
  }

  const isRegistered = isUserRegistered(telegramId);
  const isStartCommand = ctx.message?.text === "/start";
  const isAcceptTncCallback = ctx.callbackQuery?.data === "accept_tnc";

  if (!isRegistered) {
    if (!isStartCommand && !isAcceptTncCallback) {
      return ctx.reply(
        "Please use /start to register before using other commands."
      );
    }
  } else {
    if (isStartCommand) {
      return ctx.reply(
        "You are already registered! You can use the bot commands."
      );
    }
  }

  return next();
});

bot.command("start", (ctx) => {
  const keyboard = new InlineKeyboard()
    .url("📜 Read Terms & Conditions", `${env.SERVER_URL}/tnc`)
    .row()
    .text("✅ Accept Terms & Conditions", "accept_tnc");

  const welcomeMessage = `🤖 Welcome to Smart Duck bot on DuckChain!

Before you can use our services, please read and accept our Terms & Conditions.

Click the link to read the full terms, then click "Accept" to continue.

I will be waiting! 😀`;

  ctx.reply(welcomeMessage, { reply_markup: keyboard });
});

bot.callbackQuery("accept_tnc", async (ctx) => {
  const tg_id = ctx.from?.id;
  const tg_username = ctx.from?.username;
  const accepted_tnc_at = Date.now();
  const tnc_version = 1;

  if (!(tg_username && tg_id)) {
    return ctx.reply(
      "Failed to retrieve user information. Is your profile public?"
    );
  }

  db.run(
    "INSERT INTO users (telegram_username, telegram_id, accepted_tnc_at, tnc_version) VALUES (?, ?, ?, ?)",
    [tg_username, tg_id, accepted_tnc_at, tnc_version]
  );

  await ctx.answerCallbackQuery({ text: "Terms & Conditions accepted! ✅" });
  await ctx.editMessageText(
    "✅ Thank you for accepting our Terms & Conditions!\n\nYou can now start using our bot."
  );

  const options = new InlineKeyboard()
    .text("🤖 My Agents", `my_agents`)
    .row()
    .text("➕ New Agent", "add_agent")
    .row()
    .text("🪙 Token List", "token_list")
    .row()
    .text("📚 Help & Resources", "help_resources");

  const welcomeMessage = `🤖 Welcome to Smart Duck bot on DuckChain!`;

  await ctx.reply(welcomeMessage, { reply_markup: options });
});

bot.callbackQuery("my_agents", async (ctx) => {
  await ctx.answerCallbackQuery();

  const userId = getUserId(ctx.from?.id!);
  if (!userId) {
    return ctx.reply("User not found. Please use /start to register.");
  }

  const agents = db
    .query("SELECT * FROM user_agents WHERE user_id = ?")
    .all(userId);

  if (agents.length === 0) {
    const keyboard = new InlineKeyboard()
      .text("➕ Create Your First Agent", "add_agent")
      .row()
      .text("📚 Help & Resources", "help_resources")
      .row()
      .text("🔙 Back to Menu", "back_to_menu");

    return ctx.reply(
      "🤖 You don't have any agents yet!\n\n" +
        "Create your first trading agent to get started.\n\n" +
        "💡 **Important:** After creating an agent, you'll need to fund its escrow address with tokens for the bot to be able to execute trades on your behalf.",
      { reply_markup: keyboard, parse_mode: "Markdown" }
    );
  }

  let message = "🤖 **Your Trading Agents:**\n\n";
  const keyboard = new InlineKeyboard();

  for (let index = 0; index < agents.length; index++) {
    const agent: any = agents[index];
    const usdtBalance = await getUSDTBalance(agent.escrow_address);
    const escrowTONBalance = await getTONBalance(agent.escrow_address);
    const actorTONBalance = await getActorTONBalance(userId, agent.agent_name);

    message += `${index + 1}. **${agent.agent_name}**\n`;
    message += `   📝 Instructions: ${agent.instructions.substring(0, 100)}${
      agent.instructions.length > 100 ? "..." : ""
    }\n`;
    message += `   🏦 Escrow: \`${agent.escrow_address}\`\n`;
    message += `   💰 USDT Balance (Escrow): **${usdtBalance} USDT**\n`;
    message += `   ⛽ TON Balance (Actor): **${actorTONBalance} TON**\n\n`;

    keyboard.text(`🔧 ${agent.agent_name}`, `agent_${agent.id}`).row();
  }

  message += "💰 **Funding Instructions:**\n";
  message +=
    "To enable trading, you need to fund TWO addresses:\n" +
    "1. **Escrow**: Send **USDT** to the escrow address (shown above) for buying tokens\n" +
    "2. **Actor**: Send **TON** to the actor address for gas fees (get address from 'Fund Agent')\n\n" +
    "⚠️ **Both USDT and TON must be available for trades to execute!**\n\n";

  keyboard.text("➕ Add New Agent", "add_agent").row();
  keyboard.text("📚 Help & Resources", "help_resources").row();
  keyboard.text("🔙 Back to Menu", "back_to_menu");

  await ctx.reply(message, { reply_markup: keyboard, parse_mode: "Markdown" });
});

bot.callbackQuery("add_agent", async (ctx) => {
  await ctx.answerCallbackQuery();

  const keyboard = new InlineKeyboard().text("🔙 Cancel", "back_to_menu");

  await ctx.reply(
    "🤖 **Create New Trading Agent**\n\n" +
      "Please enter a name for your trading agent:\n\n" +
      "💡 **Note:** After creation, you'll need to fund the agent's escrow address with **USDT only** to enable trading.",
    { reply_markup: keyboard, parse_mode: "Markdown" }
  );

  userSessions.set(ctx.from!.id, { step: "waiting_for_agent_name" });
});

bot.callbackQuery("token_list", async (ctx) => {
  await ctx.answerCallbackQuery();

  const tradableTokens = tokens;

  let message = "🪙 **Available Tokens for Trading**\n\n";

  tradableTokens.forEach((token, index) => {
    message += `${index + 1}. **${token.symbol}** - ${token.name}\n`;
  });

  message += `\n📊 **Total Tokens:** ${tokens.length}\n`;
  message +=
    "💡 These are the tokens our trading agents can analyze and trade.\n";

  const keyboard = new InlineKeyboard()
    .text("📚 Help & Resources", "help_resources")
    .row()
    .text("🔙 Back to Menu", "back_to_menu");

  await ctx.reply(message, { reply_markup: keyboard, parse_mode: "Markdown" });
});

bot.callbackQuery("back_to_menu", async (ctx) => {
  await ctx.answerCallbackQuery();

  const options = new InlineKeyboard()
    .text("🤖 My Agents", `my_agents`)
    .row()
    .text("➕ New Agent", "add_agent")
    .row()
    .text("🪙 Token List", "token_list")
    .row()
    .text("📚 Help & Resources", "help_resources");

  const welcomeMessage = `🤖 Welcome to Smart Duck bot on DUCK Network!`;

  await ctx.reply(welcomeMessage, { reply_markup: options });
});

bot.callbackQuery("help_resources", async (ctx) => {
  await ctx.answerCallbackQuery();

  const message = `📚 **Help & Resources**\n\n` +
    `Here are helpful links to get you started with DUCK Trader:\n\n` +
    `🌐 **Website & Documentation:** [smartduck.hesameri.com](https://smartduck.hesameri.com)\n` +
    `• Documentation, guides, and tutorials\n\n` +
    `💻 **GitHub Codebase:** [github.com/](https://github.com/)\n` +
    `• Open source code and contributions\n\n` +
    `📺 **Watch Demo:** [Youtube Link](https://youtu.be/x9dX_JgCdJI)\n`;

  const keyboard = new InlineKeyboard()
    .text("🔙 Back to Menu", "back_to_menu");

  await ctx.reply(message, { 
    reply_markup: keyboard, 
    parse_mode: "Markdown"
  });
});

bot.on("message:text", async (ctx) => {
  const telegramId = ctx.from.id;
  const session = userSessions.get(telegramId);
  const messageText = ctx.message.text.trim();

  // Check for database user sessions as well (custom amount, etc.)
  const dbUserId = getUserId(telegramId);
  const dbSession = dbUserId ? userSessions.get(dbUserId) : null;
  
  // Prioritize custom amount input sessions
  if (dbSession && dbSession.step === "awaiting_custom_amount") {
    console.log(`Found custom amount session in first handler for user ${dbUserId}, processing input: ${messageText}`);
    
    // Validate custom amount input
    const customAmount = parseFloat(messageText);
    if (isNaN(customAmount) || customAmount <= 0) {
      return ctx.reply(
        "❌ **Invalid Amount**\n\n" +
        "Please enter a valid positive number.\n" +
        "Example: `25` or `50.5`",
        { parse_mode: "Markdown" }
      );
    }

    // Get user's actual USDT balance for validation
    const sessionData = dbSession.data;
    const agent = db.query("SELECT * FROM user_agents WHERE id = ? AND user_id = ?").get(sessionData.agentId, dbUserId) as any;
    
    if (agent) {
      const currentUsdtBalance = await getUSDTBalance(agent.escrow_address);
      const availableBalance = parseFloat(currentUsdtBalance);
      
      if (customAmount > availableBalance) {
        return ctx.reply(
          `❌ **Insufficient Balance**\n\n` +
          `You entered: **${customAmount} USDT**\n` +
          `Available balance: **${availableBalance} USDT**\n\n` +
          `Please enter an amount you can afford.`,
          { parse_mode: "Markdown" }
        );
      }
    }

    if (customAmount > 10000) {
      return ctx.reply(
        "❌ **Amount Too Large**\n\n" +
        "Please enter an amount less than 10,000 USDT.",
        { parse_mode: "Markdown" }
      );
    }

    console.log(`Custom amount input: ${customAmount} USDT for trade ${sessionData.tradeId}`);

    // Update trade data with custom amount
    
    // Get the original trade decision to access entry price
    const originalTd = tradeDataStore.get(sessionData.tradeId);
    if (!originalTd) {
      return ctx.reply("❌ Trade data expired. Please try again.");
    }
    
    // Calculate new token amount: customAmount / entryPrice
    const entryPrice = sessionData.originalTradeData.usdt_cost / sessionData.originalTradeData.token_amount; // Back-calculate entry price
    const newTokenAmount = customAmount / entryPrice;
    
    const updatedTradeData = {
      ...sessionData.originalTradeData,
      usdt_cost: customAmount,
      token_amount: newTokenAmount
    };

    // Update the stored trade data
    tradeDataStore.set(sessionData.tradeId, updatedTradeData);
    
    // Clear session
    if (dbUserId) {
      userSessions.delete(dbUserId);
    }

    // Calculate blockchain parameters for custom amount
    const customTokenAmountWei = BigInt(Math.floor(updatedTradeData.token_amount * 10 ** 18));
    const customUsdtCostWei = BigInt(Math.floor(customAmount * 10 ** 18));
    
    // Show confirmation with updated amount
    const confirmationMessage = 
      `✅ **FINAL CONFIRMATION - Custom Amount**\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      
      `🎯 **Trade Execution Parameters:**\n` +
      `• **Token:** ${updatedTradeData.token_symbol}\n` +
      `• **Token Amount:** ${updatedTradeData.token_amount.toFixed(6)} ${updatedTradeData.token_symbol}\n` +
      `• **💰 USDT Cost:** ${customAmount.toFixed(2)} USDT *(Your Custom Amount)*\n\n` +
      
      `📊 **Contract Parameters:**\n` +
      `• **Token Amount (Wei):** ${customTokenAmountWei.toString()}\n` +
      `• **USDT Cost (Wei):** ${customUsdtCostWei.toString()}\n\n` +
      
      `⚠️ **IMPORTANT WARNINGS:**\n` +
      `• This trade will be executed on-chain immediately\n` +
      `• Transaction cannot be reversed once confirmed\n` +
      `• Small gas fees will apply for blockchain execution\n` +
      `• USDT will be deducted from your agent's escrow\n\n` +
      
      `🚀 **Ready to execute with your custom amount?**`;

    const keyboard = new InlineKeyboard()
      .text("✅ Yes, Execute", `accept_trade_${sessionData.agentId}_${sessionData.tradeId}`)
      .text("❌ Cancel", `decline_trade_${sessionData.agentId}_${sessionData.tradeId}`)
      .row()
      .text("🔙 Back to Agent", `agent_${sessionData.agentId}`);

    return ctx.reply(confirmationMessage, {
      reply_markup: keyboard,
      parse_mode: "Markdown",
    });
  }

  if (session) {
    const userId = getUserId(telegramId);
    if (!userId) {
      userSessions.delete(telegramId);
      return ctx.reply("User not found. Please use /start to register.");
    }

    if (session.step === "waiting_for_agent_name") {
      const agentName = messageText;

      if (agentName.length < 3) {
        return ctx.reply(
          "❌ Agent name must be at least 3 characters long. Please try again:"
        );
      }

      if (agentName.length > 50) {
        return ctx.reply(
          "❌ Agent name must be less than 50 characters. Please try again:"
        );
      }

      const existingAgent = db
        .query(
          "SELECT id FROM user_agents WHERE user_id = ? AND agent_name = ?"
        )
        .get(userId, agentName);

      if (existingAgent) {
        return ctx.reply(
          "❌ You already have an agent with this name. Please choose a different name:"
        );
      }

      session.data = { agentName };
      session.step = "waiting_for_instructions";
      userSessions.set(telegramId, session);

      const keyboard = new InlineKeyboard().text("🔙 Cancel", "back_to_menu");

      await ctx.reply(
        `✅ Agent name: **${agentName}**\n\n📝 Now please provide trading strategy instructions for your agent:\n\n💡 *Examples:*\n• "Focus on momentum trading with 2% stop loss"\n• "Buy the dip on major tokens with DCA strategy"\n• "Trade based on technical analysis with RSI signals"`,
        { reply_markup: keyboard, parse_mode: "Markdown" }
      );
      return;
    }

    if (session.step === "waiting_for_instructions") {
      const instructions = messageText;

      if (instructions.length < 10) {
        return ctx.reply(
          "❌ Instructions must be at least 10 characters long. Please provide more detailed trading strategy:"
        );
      }

      if (instructions.length > 1000) {
        return ctx.reply(
          "❌ Instructions must be less than 1000 characters. Please shorten your strategy description:"
        );
      }

      try {
        const agentSeed = `${userId}_${session.data.agentName}`;
        const actor = await deriveActor(agentSeed);
        const escrowAddress = actor.account.address;

        const result = db.run(
          "INSERT INTO user_agents (user_id, agent_name, escrow_address, instructions) VALUES (?, ?, ?, ?)",
          [userId, session.data.agentName, escrowAddress, instructions]
        );

        userSessions.delete(telegramId);

        const keyboard = new InlineKeyboard()
          .text("🤖 View My Agents", "my_agents")
          .row()
          .text("➕ Create Another Agent", "add_agent")
          .row()
          .text("🔙 Back to Menu", "back_to_menu");

        await ctx.reply(
          `🎉 **Agent Created Successfully!**\n\n` +
            `🤖 **Name:** ${session.data.agentName}\n` +
            `📝 **Strategy:** ${instructions}\n` +
            `🏦 **Escrow Address:** \`${escrowAddress}\`\n\n` +
            `⚠️ **Important - Funding Required:**\n` +
            `Before your agent can execute trades, you must fund its escrow address with the tokens you want to trade. Send your desired trading tokens (e.g., DUCK, USDT, etc.) to the escrow address above.\n\n` +
            `💡 **Note:** Your agent can only trade with tokens available in its escrow balance. The bot will not be able to place trades until the escrow is funded.\n\n` +
            `✅ Your agent is now ready to help with trading decisions once funded!`,
          { reply_markup: keyboard, parse_mode: "Markdown" }
        );
        return;
      } catch (error) {
        console.error("Error creating agent:", error);
        userSessions.delete(telegramId);

        const keyboard = new InlineKeyboard()
          .text("🔄 Try Again", "add_agent")
          .row()
          .text("🔙 Back to Menu", "back_to_menu");

        await ctx.reply("❌ **Error creating agent.** Please try again.", {
          reply_markup: keyboard,
          parse_mode: "Markdown",
        });
        return;
      }
    }
  }

  try {
    console.log(`Classifying message: "${messageText}"`);
    const classification = await classifyMessage(messageText);
    console.log(`Classification result:`, classification);

    switch (classification.type) {
      case MessageType.TRADE_EXECUTION:
        await handleTradeExecution(
          ctx,
          messageText,
          classification.extractedData
        );
        break;

      case MessageType.TRADE_RECOMMENDATION:
        await handleTradeRecommendation(ctx, messageText);
        break;

      case MessageType.AGENT_SETUP:
        const keyboard = new InlineKeyboard()
          .text("➕ Create New Agent", "add_agent")
          .row()
          .text("🤖 View My Agents", "my_agents")
          .row()
          .text("🔙 Back to Menu", "back_to_menu");

        await ctx.reply(
          "🤖 **Agent Setup Request Detected**\n\n" +
            "I can help you create a new trading agent with custom strategies!\n\n" +
            "Click the button below to start the setup process.",
          { reply_markup: keyboard, parse_mode: "Markdown" }
        );
        break;

      case MessageType.CHAT:
      default:
        await handleChatMessage(ctx, messageText);
        break;
    }
  } catch (error) {
    console.error("Error handling message:", error);

    const keyboard = new InlineKeyboard()
      .text("🤖 My Agents", "my_agents")
      .text("➕ New Agent", "add_agent")
      .row()
      .text("📊 Main Menu", "back_to_menu");

    const errorMessage = "Sorry, I had trouble understanding your message. 🤔\n\n" +
      "You can use the buttons below to access the trading features!";
    
    await safeErrorReply(ctx, errorMessage, keyboard);
  }
});

bot.callbackQuery(/^direct_trade_(\d+)_(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Processing direct trade..." });

  const agentId = parseInt(ctx.match[1]);
  const tradePrompt = decodeURIComponent(ctx.match[2]);
  const userId = getUserId(ctx.from?.id!);

  if (!userId) {
    return ctx.reply("User not found. Please use /start to register.");
  }

  await executeDirectTrade(ctx, userId, agentId, tradePrompt);
});

bot.callbackQuery(/^agent_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const agentId = parseInt(ctx.match[1]);
  const userId = getUserId(ctx.from?.id!);

  if (!userId) {
    return ctx.reply("User not found. Please use /start to register.");
  }

  const agent = db
    .query("SELECT * FROM user_agents WHERE id = ? AND user_id = ?")
    .get(agentId, userId) as any;

  if (!agent) {
    return ctx.reply(
      "❌ Agent not found or you don't have permission to view it."
    );
  }

  const keyboard = new InlineKeyboard()
    .text("🤖 Trade Suggestion", `trade_suggestion_${agentId}`)
    .text("⚡ Execute Trade", `execute_trade_${agentId}`)
    .row()
    .text("💰 Agent Balance", `agent_balance_${agentId}`)
    .row()
    .text("🗑️ Delete Agent", `delete_agent_${agentId}`)
    .text("� Fund Agent", `fund_agent_${agentId}`)
    .row()
    .text("🔙 Back to Agents", "my_agents");

  const actorAddress = await getActorAddress(userId, agent.agent_name);

  const message =
    `🤖 **Agent Details**\n\n` +
    `📛 **Name:** ${agent.agent_name}\n` +
    `📝 **Strategy Instructions:**\n${agent.instructions}\n\n` +
    `🏦 **Agent Address (for funding & trading):**\n\`${agent.escrow_address}\`\n\n` +
    `� **Funding Status:**\n` +
    `Send USDT to the agent address above to fund trades. The agent will use USDT from this wallet to buy tokens when you accept trade suggestions.\n\n` +
    `�📅 **Created:** ${new Date(
      agent.created_at * 1000
    ).toLocaleDateString()}`;

  await ctx.reply(message, { reply_markup: keyboard, parse_mode: "Markdown" });
});

bot.callbackQuery(/^trade_suggestion_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Generating trade suggestion..." });

  const agentId = parseInt(ctx.match[1]);
  const userId = getUserId(ctx.from?.id!);

  if (!userId) {
    return ctx.reply("User not found. Please use /start to register.");
  }

  const agent = db
    .query("SELECT * FROM user_agents WHERE id = ? AND user_id = ?")
    .get(agentId, userId) as any;

  if (!agent) {
    return ctx.reply(
      "❌ Agent not found or you don't have permission to access it."
    );
  }

  try {
    const usdtBalance = await getUSDTBalance(agent.escrow_address);
    const actorTONBalance = await getActorTONBalance(userId, agent.agent_name);

    const hasUsdt = parseFloat(usdtBalance) > 0;
    const hasTON = parseFloat(actorTONBalance) > 0;

    if (!hasUsdt || !hasTON) {
      const actorAddress = await getActorAddress(userId, agent.agent_name);

      let message = "❌ **Cannot generate trade suggestion**\n\n";
      message += "Your agent needs both USDT and TON to execute trades:\n\n";

      if (!hasUsdt) {
        message += `🏦 **Missing USDT** in escrow\n`;
        message += `Send USDT to: \`${agent.escrow_address}\`\n\n`;
      } else {
        message += `✅ USDT available in escrow: ${usdtBalance} USDT\n\n`;
      }

      if (!hasTON) {
        message += `⚡ **Missing TON** for gas fees\n`;
        message += `Send TON to: \`${actorAddress}\`\n\n`;
      } else {
        message += `✅ TON available for gas: ${actorTONBalance} TON\n\n`;
      }

      message += "💡 Use the 'Fund Agent' button to get funding instructions.";

      const keyboard = new InlineKeyboard()
        .text("💸 Fund Agent", `fund_agent_${agentId}`)
        .text("💰 Check Balance", `agent_balance_${agentId}`)
        .row()
        .text("🔙 Back to Agent", `agent_${agentId}`);

      return ctx.reply(message, {
        reply_markup: keyboard,
        parse_mode: "Markdown",
      });
    }
  } catch (error) {
    console.error("Error checking agent funding:", error);
    return ctx.reply(
      "❌ Error checking agent funding status. Please try again."
    );
  }

  try {
    const loadingMessage = await ctx.reply(
      "🤖 **Analyzing market conditions...**\n\n" +
        "Your trading agent is analyzing current market data and applying your strategy instructions to generate a personalized trade suggestion.\n\n" +
        "⏳ This may take a few moments...",
      { parse_mode: "Markdown" }
    );

    const tradingAgent = new Agent({
      model: "gemini-2.0-flash",
      preamble: `You are a professional cryptocurrency trading agent with specific user instructions.`,
    });

    const declinedTrades = db
      .query(
        "SELECT trade_data FROM declined_trades WHERE user_id = ? AND agent_id = ? ORDER BY declined_at DESC LIMIT 5"
      )
      .all(userId, agentId) as any[];

    let userPrompt = `Based on my trading strategy and current market conditions, provide a trade suggestion. My strategy instructions are: "${agent.instructions}"`;

    if (declinedTrades.length > 0) {
      userPrompt += `\n\nFor context, here are some recent trade suggestions I declined:\n`;
      declinedTrades.forEach((dt, index) => {
        try {
          const tradeData = JSON.parse(dt.trade_data);
          if (tradeData.type === "tradeDecision") {
            const td = tradeData.data;
            userPrompt += `${index + 1}. Declined ${td.token} at $${
              td.entry
            } (Confidence: ${td.confidence}%, Reason: ${td.message.substring(
              0,
              100
            )}...)\n`;
          }
        } catch (e) {}
      });
      userPrompt += `\nPlease consider these declined trades when making new suggestions to better align with my preferences.`;
    }

    const usdtBalance = await getUSDTBalance(agent.escrow_address);
    const walletBalance = parseFloat(usdtBalance);
    const result = await tradingAgent.enhancedWorkflow(userPrompt, walletBalance);

    await safeDeleteMessage(ctx, loadingMessage.message_id);

    if (result.error) {
      const keyboard = new InlineKeyboard()
        .text("🔄 Get Another Suggestion", `trade_suggestion_${agentId}`)
        .row()
        .text("🤖 Back to Agent", `agent_${agentId}`)
        .row()
        .text("🔙 Back to Agents", "my_agents");

      // Check if it's a descriptive error (like prompt guard failure) or a generic service error
      let errorMessage: string;
      if (result.error === 'API_QUOTA_EXCEEDED' || result.error === 'AI_SERVICE_UNAVAILABLE' || result.error === 'SERVICE_UNAVAILABLE') {
        // Use formatted message for service errors
        const formattedError = formatErrorMessage(result.error);
        errorMessage = `❌ **Error generating trade suggestion:**\n\n${formattedError}`;
      } else {
        // Show the actual descriptive error for prompt guard failures and other specific errors
        errorMessage = `❌ **Cannot generate trade suggestion:**\n\n${result.error}\n\n💡 **Tip:** Make sure your request aligns with your agent's trading strategy, or create a new agent with different instructions.`;
      }
      
      return safeErrorReply(ctx, errorMessage, keyboard);
    }

    await safeDeleteMessage(ctx, loadingMessage.message_id);

    let tradeData: any = null;
    let responseMessage = `🤖 **Trade Suggestion from ${agent.agent_name}**\n\n`;

    if (result.tradeDecision) {
      const td = result.tradeDecision;
      tradeData = {
        type: "tradeDecision",
        data: td,
        agentId: agentId,
        timestamp: Date.now(),
      };

      responseMessage += `🎯 **Recommended Trade:**\n`;
      responseMessage += `• **Token:** ${td.token.toUpperCase()}\n`;
      responseMessage += `• **Entry Price:** $${td.entry.toFixed(4)}\n`;
      responseMessage += `• **Current Price:** $${td.currentPrice.toFixed(
        4
      )}\n`;
      responseMessage += `• **Stop Loss:** $${td.sl.toFixed(4)}\n`;
      responseMessage += `• **Take Profit:** $${td.tp.toFixed(4)}\n`;
      responseMessage += `• **Confidence:** ${td.confidence}%\n\n`;
      responseMessage += `📊 **Analysis:**\n${td.message}\n\n`;
      
      // Add prominent USDT amount display
      const usdtBalance = await getUSDTBalance(agent.escrow_address);
      const walletBalance = parseFloat(usdtBalance);
      const suggestedUsdtAmount = td.tradeAmount || Math.min(50, walletBalance * 0.5); // fallback: 50 USDT or 50% of balance
      const calculatedTokenAmount = suggestedUsdtAmount / td.entry;
      
      console.log(`Trade suggestion display: AI tradeAmount=${td.tradeAmount}, Using=${suggestedUsdtAmount}, Balance=${walletBalance}`);
      
      responseMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      responseMessage += `💰 **🎯 SUGGESTED TRADE AMOUNT: ${suggestedUsdtAmount.toFixed(2)} USDT**\n`;
      responseMessage += `📦 *Will purchase approximately ${calculatedTokenAmount.toFixed(6)} ${td.token.toUpperCase()}*\n`;
      responseMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    } else if (result.genericAdvice) {
      const ga = result.genericAdvice;
      tradeData = {
        type: "genericAdvice",
        data: ga,
        agentId: agentId,
        timestamp: Date.now(),
      };

      responseMessage += `📈 **Market Analysis:**\n${ga.reasoning}\n\n`;

      if (ga.suggestedToken) {
        responseMessage += `💡 **Suggested Token:** ${ga.suggestedToken.toUpperCase()}\n\n`;
      }

      if (ga.needsSpecificTokenData && ga.requestedTokens) {
        responseMessage += `🔍 **Additional Analysis Needed:**\nFor more specific recommendations, consider analyzing: ${ga.requestedTokens.join(
          ", "
        )}\n\n`;
      }
    }

    responseMessage += `⚠️ **Strategy Context:**\n"${agent.instructions}"\n\n`;
    responseMessage += `📋 **Risk Warning:**\nThis is not financial advice. Always do your own research and never invest more than you can afford to lose.`;

    let keyboard: InlineKeyboard;

    if (tradeData && tradeData.type === "tradeDecision") {
      const tradeId = generateTradeId();
      
      // Update trade data with calculated amounts for execution
      const td = tradeData.data;
      const suggestedUsdtAmount = td.tradeAmount || Math.min(50, walletBalance * 0.5); // fallback: 50 USDT or 50% of balance
      const calculatedTokenAmount = suggestedUsdtAmount / td.entry;
      
      console.log(`Trade data storage: AI tradeAmount=${td.tradeAmount}, Using=${suggestedUsdtAmount}, TokenAmount=${calculatedTokenAmount}`);
      
      const enhancedTradeData = {
        type: "tradeDecision", // Required by execution handler
        data: {
          token: td.token.toUpperCase(),
          tradeType: td.tradeType || "buy",
          entry: td.entry,
          currentPrice: td.currentPrice,
          sl: td.sl,
          tp: td.tp,
          message: td.message,
          confidence: td.confidence,
          tradeAmount: suggestedUsdtAmount
        },
        token_symbol: td.token.toUpperCase(),
        token_amount: calculatedTokenAmount,
        usdt_cost: suggestedUsdtAmount,
        reasoning: td.message,
        confidence: td.confidence,
        agentId: agentId,
        userId: userId,
        timestamp: Date.now(),
      };
      
      tradeDataStore.set(tradeId, enhancedTradeData);

      setTimeout(() => {
        tradeDataStore.delete(tradeId);
      }, 5 * 60 * 1000);

      responseMessage += "🚀 **Choose your action:**";

      keyboard = new InlineKeyboard()
        .text("✅ Accept Trade", `confirm_trade_${agentId}_${tradeId}`)
        .text("💰 Custom Amount", `custom_amount_${agentId}_${tradeId}`)
        .row()
        .text("❌ Decline", `decline_trade_${tradeId}`)
        .text("🔙 Back to Agent", `agent_${agentId}`);
    } else {
      keyboard = new InlineKeyboard()
        .text("🔄 Get Another Suggestion", `trade_suggestion_${agentId}`)
        .row()
        .text("🤖 Back to Agent", `agent_${agentId}`)
        .row()
        .text("🔙 Back to Agents", "my_agents");
    }

    await ctx.reply(responseMessage, {
      reply_markup: keyboard,
      parse_mode: "Markdown",
    });
  } catch (error) {
    console.error("Error generating trade suggestion:", error);

    const keyboard = new InlineKeyboard()
      .text("🔄 Try Again", `trade_suggestion_${agentId}`)
      .row()
      .text("🤖 Back to Agent", `agent_${agentId}`)
      .row()
      .text("🔙 Back to Agents", "my_agents");

    const formattedError = formatErrorMessage(error);
    const errorMessage = "❌ **Error generating trade suggestion**\n\n" + formattedError;
    
    await safeErrorReply(ctx, errorMessage, keyboard);
  }
});

bot.callbackQuery(/^execute_trade_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const agentId = parseInt(ctx.match[1]);
  const userId = getUserId(ctx.from?.id!);

  if (!userId) {
    return ctx.reply("User not found. Please use /start to register.");
  }

  const agent = db
    .query("SELECT * FROM user_agents WHERE id = ? AND user_id = ?")
    .get(agentId, userId) as any;

  if (!agent) {
    return ctx.reply(
      "❌ Agent not found or you don't have permission to access it."
    );
  }

  try {
    const usdtBalance = await getUSDTBalance(agent.escrow_address);
    const actorTONBalance = await getActorTONBalance(userId, agent.agent_name);

    const hasUsdt = parseFloat(usdtBalance) > 0;
    const hasTON = parseFloat(actorTONBalance) > 0;

    if (!hasUsdt || !hasTON) {
      const actorAddress = await getActorAddress(userId, agent.agent_name);

      let message = "❌ **Cannot execute trade**\n\n";
      message += "Your agent needs both USDT and TON to execute trades:\n\n";

      if (!hasUsdt) {
        message += `🏦 **Missing USDT** in escrow\n`;
        message += `Send USDT to: \`${agent.escrow_address}\`\n\n`;
      } else {
        message += `✅ USDT available in escrow: ${usdtBalance} USDT\n\n`;
      }

      if (!hasTON) {
        message += `⚡ **Missing TON** for gas fees\n`;
        message += `Send TON to: \`${actorAddress}\`\n\n`;
      } else {
        message += `✅ TON available for gas: ${actorTONBalance} TON\n\n`;
      }

      message += "💡 Use the 'Fund Agent' button to get funding instructions.";

      const keyboard = new InlineKeyboard()
        .text("💸 Fund Agent", `fund_agent_${agentId}`)
        .text("💰 Check Balance", `agent_balance_${agentId}`)
        .row()
        .text("🔙 Back to Agent", `agent_${agentId}`);

      return ctx.reply(message, {
        reply_markup: keyboard,
        parse_mode: "Markdown",
      });
    }
  } catch (error) {
    console.error("Error checking agent funding:", error);
    return ctx.reply(
      "❌ Error checking agent funding status. Please try again."
    );
  }

  const keyboard = new InlineKeyboard().text("🔙 Cancel", `agent_${agentId}`);

  await ctx.reply(
    `⚡ **Execute Trade with ${agent.agent_name}**\n\n` +
      `Please describe what you want to trade. Your prompt will take priority over the agent's base strategy.\n\n` +
      `📝 **Examples:**\n` +
      `• "Buy $50 worth of ETH"\n` +
      `• "Sell half my PEPE tokens"\n` +
      `• "Buy the most promising low-cap token under $1M market cap"\n\n` +
      `💡 **Type your trade request:**`,
    {
      reply_markup: keyboard,
      parse_mode: "Markdown",
    }
  );

  userStates.set(ctx.from!.id, {
    state: "waiting_for_trade_prompt",
    agentId: agentId,
    timestamp: Date.now(),
  });
});

bot.callbackQuery(/^delete_agent_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const agentId = parseInt(ctx.match[1]);
  const userId = getUserId(ctx.from?.id!);

  if (!userId) {
    return ctx.reply("User not found. Please use /start to register.");
  }

  const keyboard = new InlineKeyboard()
    .text("⚠️ Yes, Delete", `confirm_delete_${agentId}`)
    .text("❌ Cancel", `agent_${agentId}`);

  await ctx.reply(
    "⚠️ **Are you sure you want to delete this agent?**\n\nThis action cannot be undone.",
    { reply_markup: keyboard, parse_mode: "Markdown" }
  );
});

bot.callbackQuery(/^confirm_delete_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const agentId = parseInt(ctx.match[1]);
  const userId = getUserId(ctx.from?.id!);

  if (!userId) {
    return ctx.reply("User not found. Please use /start to register.");
  }

  try {
    const result = db.run(
      "DELETE FROM user_agents WHERE id = ? AND user_id = ?",
      [agentId, userId]
    );

    if (result.changes > 0) {
      const keyboard = new InlineKeyboard()
        .text("🤖 View My Agents", "my_agents")
        .row()
        .text("🔙 Back to Menu", "back_to_menu");

      await ctx.reply("✅ **Agent deleted successfully!**", {
        reply_markup: keyboard,
        parse_mode: "Markdown",
      });
    } else {
      await ctx.reply("❌ Agent not found or already deleted.");
    }
  } catch (error) {
    console.error("Error deleting agent:", error);
    await ctx.reply("❌ Error deleting agent. Please try again later.");
  }
});

bot.callbackQuery(/^fund_agent_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const agentId = parseInt(ctx.match[1]);
  const userId = getUserId(ctx.from?.id!);

  if (!userId) {
    return ctx.reply("User not found. Please use /start to register.");
  }

  const agent = db
    .query("SELECT * FROM user_agents WHERE id = ? AND user_id = ?")
    .get(agentId, userId) as any;

  if (!agent) {
    return ctx.reply(
      "❌ Agent not found or you don't have permission to fund it."
    );
  }

  const escrowAddress = agent.escrow_address;
  const actorAddress = await getActorAddress(userId, agent.agent_name);

  const escrowQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${escrowAddress}`;
  const actorQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${actorAddress}`;

  const keyboard = new InlineKeyboard()
    .text("🏦 Escrow QR Code", `escrow_qr_${agentId}`)
    .text("⚡ Actor QR Code", `actor_qr_${agentId}`)
    .row()
    .text("🔙 Back to Agent", `agent_${agentId}`)
    .row()
    .text("🤖 View My Agents", "my_agents");

  const message =
    `💰 **Fund Agent: ${agent.agent_name}**\n\n` +
    `To enable trading, fund BOTH addresses:\n\n` +
    `🏦 **1. Escrow Address (USDT for trading):**\n` +
    `\`${escrowAddress}\`\n\n` +
    `⚡ **2. Actor Address (TON for gas fees):**\n` +
    `\`${actorAddress}\`\n\n` +
    `📱 **Use the buttons below for QR codes**\n\n` +
    `💰 **USDT Contract Address:**\n` +
    `\`${definitions.USDT.address}\`\n\n` +
    `⚠️ **Important:** \n` +
    `• Send USDT → Escrow address (for buying tokens)\n` +
    `• Send TON → Actor address (for transaction fees)\n` +
    `• Both must be funded for trades to work!\n` +
    `• Only use DUCK network for both tokens\n\n`;

  await ctx.reply(message, {
    reply_markup: keyboard,
    parse_mode: "Markdown",
  });
});

bot.callbackQuery(/^escrow_qr_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const agentId = parseInt(ctx.match[1]);
  const userId = getUserId(ctx.from?.id!);

  if (!userId) return;

  const agent = db
    .query("SELECT * FROM user_agents WHERE id = ? AND user_id = ?")
    .get(agentId, userId) as any;

  if (!agent) return;

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${agent.escrow_address}`;

  const keyboard = new InlineKeyboard().text(
    "🔙 Back to Funding",
    `fund_agent_${agentId}`
  );

  try {
    await ctx.replyWithPhoto(qrCodeUrl, {
      caption:
        `🏦 **Escrow Address QR Code**\n\n` +
        `Send USDT to this address:\n\`${agent.escrow_address}\``,
      reply_markup: keyboard,
      parse_mode: "Markdown",
    });
  } catch (error) {
    console.error("Error sending escrow QR code:", error);
    await ctx.reply(
      "❌ Error generating QR code. Please copy the address manually."
    );
  }
});

bot.callbackQuery(/^actor_qr_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const agentId = parseInt(ctx.match[1]);
  const userId = getUserId(ctx.from?.id!);

  if (!userId) return;

  const agent = db
    .query("SELECT * FROM user_agents WHERE id = ? AND user_id = ?")
    .get(agentId, userId) as any;

  if (!agent) return;

  const actorAddress = await getActorAddress(userId, agent.agent_name);
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${actorAddress}`;

  const keyboard = new InlineKeyboard().text(
    "🔙 Back to Funding",
    `fund_agent_${agentId}`
  );

  try {
    await ctx.replyWithPhoto(qrCodeUrl, {
      caption:
        `⚡ **Actor Address QR Code**\n\n` +
        `Send TON to this address:\n\`${actorAddress}\``,
      reply_markup: keyboard,
      parse_mode: "Markdown",
    });
  } catch (error) {
    console.error("Error sending actor QR code:", error);
    await ctx.reply(
      "❌ Error generating QR code. Please copy the address manually."
    );
  }
});

bot.callbackQuery(/^agent_balance_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Fetching agent balances..." });

  const agentId = parseInt(ctx.match[1]);
  const userId = getUserId(ctx.from?.id!);

  if (!userId) {
    return ctx.reply("User not found. Please use /start to register.");
  }

  const agent = db
    .query("SELECT * FROM user_agents WHERE id = ? AND user_id = ?")
    .get(agentId, userId) as any;

  if (!agent) {
    return ctx.reply(
      "❌ Agent not found or you don't have permission to view its balance."
    );
  }

  try {
    const actorAddress = await getActorAddress(userId, agent.agent_name);

    const escrowBalances = await getAllTokenBalances(agent.escrow_address);

    const actorTONBalance = await getActorTONBalance(userId, agent.agent_name);

    let message = `💰 **${agent.agent_name} - Balances**\n\n`;

    message += `🏦 **Escrow Address (USDT & Tokens):**\n\`${agent.escrow_address}\`\n\n`;
    message += `⚡ **Actor Address (Gas Fees):**\n\`${actorAddress}\`\n\n`;

    message += `📊 **Escrow Balances (Trading Funds):**\n`;
    if (escrowBalances.length === 0) {
      message += `� No tokens in escrow\n`;
    } else {
      escrowBalances.forEach((token) => {
        message += `• **${token.symbol}**: \`${token.balance}\`\n`;
      });
    }

    message += `\n⛽ **Actor Balance (Gas Fees):**\n`;
    message += `• **TON**: \`${actorTONBalance}\`\n\n`;

    const hasUsdt = escrowBalances.some(
      (b) => b.symbol === "USDT" && parseFloat(b.balance) > 0
    );
    const hasTON = parseFloat(actorTONBalance) > 0;

    if (hasUsdt && hasTON) {
      message += `✅ **Ready for trading!** Both USDT and TON are available.`;
    } else if (!hasUsdt && !hasTON) {
      message += `❌ **Not ready for trading**\nNeeds: USDT (escrow) + TON (actor)\n\n🚰`;
    } else if (!hasUsdt) {
      message += `⚠️ **Missing USDT** in escrow for trading\n\n🚰`;
    } else {
      message += `⚠️ **Missing TON** in actor for gas fees\n\n🚰`;
    }
    const keyboard = new InlineKeyboard()
      .text("🔄 Refresh Balance", `agent_balance_${agentId}`)
      .row()
      .text("💸 Fund Agent", `fund_agent_${agentId}`)
      .text("🔙 Back to Agent", `agent_${agentId}`)
      .row()
      .text("🤖 View My Agents", "my_agents");

    await ctx.reply(message, {
      reply_markup: keyboard,
      parse_mode: "Markdown",
    });
  } catch (error) {
    console.error("Error fetching agent balances:", error);
    await ctx.reply(
      "❌ Error fetching agent balances. Please try again later.",
      {
        reply_markup: new InlineKeyboard().text(
          "🔙 Back to Agent",
          `agent_${agentId}`
        ),
      }
    );
  }
});

bot.callbackQuery(/^accept_trade_([a-z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Processing trade..." });

  const tradeId = ctx.match[1];
  const userId = getUserId(ctx.from?.id!);

  if (!userId) {
    return ctx.reply("User not found. Please use /start to register.");
  }

  const tradeData = tradeDataStore.get(tradeId);
  if (!tradeData) {
    return ctx.reply(
      "❌ Trade data expired or not found. Please generate a new trade suggestion."
    );
  }

  try {
    const agent = db
      .query("SELECT * FROM user_agents WHERE id = ? AND user_id = ?")
      .get(tradeData.agentId, userId) as any;

    if (!agent) {
      return ctx.reply(
        "❌ Agent not found or you don't have permission to access it."
      );
    }

    console.log(`=== EXECUTION HANDLER: accept_trade_([a-z0-9]+) ===`);
    console.log(`TradeData:`, tradeData);
    console.log(`Using token_amount: ${tradeData.token_amount}`);
    console.log(`Using usdt_cost: ${tradeData.usdt_cost}`);
    
    tradeDataStore.delete(tradeId);

    const loadingMessage = await ctx.reply(
      "⚡ **Executing Trade...**\n\n" +
        `Token: ${tradeData.token_symbol}\n` +
        `Amount: ${tradeData.token_amount}\n` +
        `Cost: ${tradeData.usdt_cost} USDT\n\n` +
        "🔄 Processing transaction...",
      { parse_mode: "Markdown" }
    );

    const result = await executeTrade(
      tradeData.agentId,
      userId,
      tradeData.token_symbol,
      BigInt(Math.floor(tradeData.token_amount * 10 ** 18)),
      BigInt(Math.floor(tradeData.usdt_cost * 10 ** 18)),
      tradeData.data?.tradeType || "buy"
    );

    await safeDeleteMessage(ctx, loadingMessage.message_id);

    if (result.success) {
      const keyboard = new InlineKeyboard()
        .text("🎉 View Transaction", `view_tx_${result.txHash}`)
        .row()
        .text("💰 View Balance", `agent_balance_${tradeData.agentId}`)
        .text("🤖 Back to Agent", `agent_${tradeData.agentId}`);

      await ctx.reply(
        "✅ **Trade Executed Successfully!**\n\n" +
          `🎯 **Token:** ${tradeData.token_symbol}\n` +
          `📦 **Amount:** ${tradeData.token_amount} tokens\n` +
          `💰 **Cost:** ${tradeData.usdt_cost} USDT\n\n` +
          `🔗 **Transaction Hash:**\n\`${result.txHash}\`\n\n` +
          "🎉 Your trade has been executed successfully!",
        { reply_markup: keyboard, parse_mode: "Markdown" }
      );
    } else {
      const keyboard = new InlineKeyboard()
        .text("🔄 Try Again", `execute_trade_${tradeData.agentId}`)
        .text("💰 Check Balance", `agent_balance_${tradeData.agentId}`)
        .row()
        .text("🤖 Back to Agent", `agent_${tradeData.agentId}`);

      await ctx.reply(
        "❌ **Trade Execution Failed**\n\n" +
          `Error: ${result.error}\n\n` +
          "Please check your agent's USDT balance and try again.",
        { reply_markup: keyboard, parse_mode: "Markdown" }
      );
    }
  } catch (error) {
    console.error("Error executing trade:", error);

    const keyboard = new InlineKeyboard()
      .text("🔄 Try Again", `execute_trade_${tradeData.agentId}`)
      .text("🤖 Back to Agent", `agent_${tradeData.agentId}`);

    await ctx.reply(
      "❌ **Error executing trade**\n\n" +
        "There was an unexpected error. Please try again.",
      { reply_markup: keyboard, parse_mode: "Markdown" }
    );
  }
});

bot.callbackQuery(/^accept_trade_(\d+)_([a-z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Processing trade..." });

  const agentId = parseInt(ctx.match[1]);
  const tradeId = ctx.match[2];
  const userId = getUserId(ctx.from?.id!);

  if (!userId) {
    return ctx.reply("User not found. Please use /start to register.");
  }

  const tradeData = tradeDataStore.get(tradeId);
  if (!tradeData) {
    return ctx.reply(
      "❌ Trade data expired or not found. Please generate a new trade suggestion."
    );
  }

  try {
    const agent = db
      .query("SELECT * FROM user_agents WHERE id = ? AND user_id = ?")
      .get(agentId, userId) as any;

    if (!agent) {
      return ctx.reply(
        "❌ Agent not found or you don't have permission to access it."
      );
    }

    if (tradeData.type !== "tradeDecision") {
      return ctx.reply(
        "❌ Invalid trade data. Only specific trade decisions can be executed."
      );
    }

    const td = tradeData.data;
    const tokenSymbol = td.token.toUpperCase();

    if (!definitions.tokens || !definitions.tokens[tokenSymbol]) {
      return ctx.reply(`❌ Token ${tokenSymbol} not available for trading.`);
    }

    console.log(`=== EXECUTION HANDLER: accept_trade_(\d+)_([a-z0-9]+) ===`);
    
    const loadingMessage = await ctx.reply(
      "🔄 **Executing Trade...**\n\n" +
        `Buying ${tokenSymbol} tokens for your agent...\n\n` +
        "⏳ This may take a moment...",
      { parse_mode: "Markdown" }
    );

    // Use updated trade data amounts (custom amount takes priority), fallback to AI suggestion
    const usdtAmount = tradeData.usdt_cost || td.tradeAmount || 50;
    // Use updated token amount if available, otherwise calculate from USDT amount
    const calculatedTokenAmount = tradeData.token_amount || (usdtAmount / td.entry);
    
    console.log(`=== Trade Execution Data ===`);
    console.log(`AI suggested tradeAmount: ${td.tradeAmount}`);
    console.log(`TradeData usdt_cost: ${tradeData.usdt_cost}`);
    console.log(`TradeData token_amount: ${tradeData.token_amount}`);
    console.log(`FINAL Using USDT amount: ${usdtAmount}`);
    console.log(`FINAL Using token amount: ${calculatedTokenAmount}`);
    console.log(`Entry price: ${td.entry}`);
    
    const tokenAmount = BigInt(Math.floor(calculatedTokenAmount * 10 ** 18));
    const usdtCost = BigInt(Math.floor(usdtAmount * 10 ** 18));  // Use 18 decimals for USDT wei
    
    console.log(`Final tokenAmount (BigInt): ${tokenAmount}`);
    console.log(`Final usdtCost (BigInt): ${usdtCost}`);

    console.log(`=== Calling executeTrade ===`);
    console.log(`agentId: ${agentId}, userId: ${userId}, tokenSymbol: ${tokenSymbol}`);
    console.log(`tokenAmount (BigInt): ${tokenAmount}`);
    console.log(`usdtCost (BigInt): ${usdtCost}`);
    console.log(`tokenAmount (decimal): ${Number(tokenAmount) / 10**18}`);
    console.log(`usdtCost (decimal): ${Number(usdtCost) / 10**18}`);
    
    const result = await executeTrade(
      agentId,
      userId,
      tokenSymbol,
      tokenAmount,
      usdtCost,
      td.tradeType || "buy"
    );

    sleepSync(3000);

    await safeDeleteMessage(ctx, loadingMessage.message_id);

    if (!result.success) {
    //if (result.success) {
      tradeDataStore.delete(tradeId);

      const keyboard = new InlineKeyboard()
        .text("💰 View Balance", `agent_balance_${agentId}`)
        .row()
        .text("🤖 Back to Agent", `agent_${agentId}`)
        .row()
        .text("🔙 Back to Agents", "my_agents");

      await ctx.reply(
        `✅ **Trade Executed Successfully!**\n\n` +
          `🎯 **Trade Details:**\n` +
          `• **Token:** ${tokenSymbol}\n` +
          `• **Amount:** ${(Number(tokenAmount) / 10 ** 18).toFixed(
            6
          )} ${tokenSymbol}\n` +
          `• **Cost:** ${(Number(usdtCost) / 10 ** 18).toFixed(6)} USDT\n` +
          `• **Transaction:** \`${result.txHash}\`\n\n` +
          `💡 The tokens have been added to your agent's balance.`,
        { reply_markup: keyboard, parse_mode: "Markdown" }
      );
    } else {
      const keyboard = new InlineKeyboard()
        .text("🔄 Try Again", `accept_trade_${agentId}_${tradeId}`)
        .row()
        .text("🤖 Back to Agent", `agent_${agentId}`)
        .row()
        .text("🔙 Back to Agents", "my_agents");

      await ctx.reply(
        `❌ **Trade Execution Failed**\n\n` +
          `Error: ${result.error}\n\n` +
          `Please check your agent's USDT balance and try again.`,
        { reply_markup: keyboard, parse_mode: "Markdown" }
      );
    }
  } catch (error) {
    console.error("Error executing trade:", error);
    await ctx.reply(
      "❌ **Error executing trade**\n\n" +
        "There was an error processing your trade. Please try again later.",
      {
        reply_markup: new InlineKeyboard().text(
          "🤖 Back to Agent",
          `agent_${agentId}`
        ),
      }
    );
  }
});

bot.callbackQuery(/^decline_trade_([a-z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Trade cancelled" });

  const tradeId = ctx.match[1];
  const tradeData = tradeDataStore.get(tradeId);
  const userId = getUserId(ctx.from?.id!);

  if (tradeData) {
    tradeDataStore.delete(tradeId);
    
    // Clear any active sessions for this user
    if (userId) {
      userSessions.delete(userId);
    }

    const keyboard = new InlineKeyboard()
      .text("🔄 Try Again", `execute_trade_${tradeData.agentId}`)
      .text("🤖 Back to Agent", `agent_${tradeData.agentId}`);

    await ctx.reply(
      "❌ **Trade Cancelled**\n\n" + "Your trade execution has been cancelled.",
      { reply_markup: keyboard, parse_mode: "Markdown" }
    );
  } else {
    await ctx.reply("Trade data not found or already expired.");
  }
});

bot.callbackQuery(/^decline_trade_(\d+)_([a-z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Trade declined" });

  const agentId = parseInt(ctx.match[1]);
  const tradeId = ctx.match[2];
  const userId = getUserId(ctx.from?.id!);

  if (!userId) {
    return ctx.reply("User not found. Please use /start to register.");
  }

  const tradeData = tradeDataStore.get(tradeId);
  if (!tradeData) {
    return ctx.reply("❌ Trade data expired or not found.");
  }

  try {
    db.run(
      "INSERT INTO declined_trades (user_id, agent_id, trade_data) VALUES (?, ?, ?)",
      [userId, agentId, JSON.stringify(tradeData)]
    );

    tradeDataStore.delete(tradeId);
    
    // Clear any active sessions for this user
    if (userId) {
      userSessions.delete(userId);
    }

    const keyboard = new InlineKeyboard()
      .text("🔄 Get Another Suggestion", `trade_suggestion_${agentId}`)
      .row()
      .text("🤖 Back to Agent", `agent_${agentId}`)
      .row()
      .text("🔙 Back to Agents", "my_agents");

    await ctx.reply(
      `❌ **Trade Declined**\n\n` +
        `Your trade suggestion has been declined and saved for future reference.\n\n` +
        `💡 This information will help your agent learn your preferences over time.`,
      { reply_markup: keyboard, parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error("Error declining trade:", error);
    await ctx.reply(
      "❌ **Error processing decline**\n\n" +
        "There was an error saving your decline. The trade was not executed.",
      {
        reply_markup: new InlineKeyboard().text(
          "🤖 Back to Agent",
          `agent_${agentId}`
        ),
      }
    );
  }
});

// Confirmation dialog before executing trade
bot.callbackQuery(/^confirm_trade_(\d+)_([a-z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Preparing confirmation..." });

  const agentId = parseInt(ctx.match[1]);
  const tradeId = ctx.match[2];
  const userId = getUserId(ctx.from?.id!);

  if (!userId) {
    return ctx.reply("User not found. Please use /start to register.");
  }

  const tradeData = tradeDataStore.get(tradeId);
  if (!tradeData) {
    return ctx.reply(
      "❌ Trade data expired or not found. Please generate a new trade suggestion."
    );
  }

  // Get the original trade decision for complete details
  const originalTradeData = tradeDataStore.get(tradeId);
  if (!originalTradeData) {
    return ctx.reply("❌ Trade data expired. Please try again.");
  }

  // Calculate blockchain parameters
  const tokenAmountWei = BigInt(Math.floor(tradeData.token_amount * 10 ** 18));
  const usdtCostWei = BigInt(Math.floor(tradeData.usdt_cost * 10 ** 18));
  
  const confirmationMessage = 
    `🔔 **FINAL CONFIRMATION**\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    
    `🎯 **Trade Execution Parameters:**\n` +
    `• **Token:** ${tradeData.token_symbol}\n` +
    `• **Token Amount:** ${tradeData.token_amount.toFixed(6)} ${tradeData.token_symbol}\n` +
    `• **💰 USDT Cost:** ${tradeData.usdt_cost.toFixed(2)} USDT\n\n` +
    
    `📊 **Contract Parameters:**\n` +
    `• **Token Amount (Wei):** ${tokenAmountWei.toString()}\n` +
    `• **USDT Cost (Wei):** ${usdtCostWei.toString()}\n\n` +
    
    `⚠️ **IMPORTANT WARNINGS:**\n` +
    `• This trade will be executed on-chain immediately\n` +
    `• Transaction cannot be reversed once confirmed\n` +
    `• Small gas fees will apply for blockchain execution\n` +
    `• USDT will be deducted from your agent's escrow\n\n` +
    
    `🚀 **Ready to execute this trade?**`;

  const keyboard = new InlineKeyboard()
    .text("✅ Yes, Execute", `accept_trade_${agentId}_${tradeId}`)
    .text("❌ Cancel", `decline_trade_${agentId}_${tradeId}`)
    .row()
    .text("🔙 Back to Agent", `agent_${agentId}`);

  await ctx.reply(confirmationMessage, {
    reply_markup: keyboard,
    parse_mode: "Markdown",
  });
});

// Custom amount handler
bot.callbackQuery(/^custom_amount_(\d+)_([a-z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Enter custom amount..." });

  const agentId = parseInt(ctx.match[1]);
  const tradeId = ctx.match[2];
  const userId = getUserId(ctx.from?.id!);

  if (!userId) {
    return ctx.reply("User not found. Please use /start to register.");
  }

  const tradeData = tradeDataStore.get(tradeId);
  if (!tradeData) {
    return ctx.reply(
      "❌ Trade data expired or not found. Please generate a new trade suggestion."
    );
  }

  // Get database user ID for session storage
  const dbUserId = getUserId(ctx.from?.id!);
  if (!dbUserId) {
    return ctx.reply("User not found. Please use /start to register.");
  }

  // Store session data for custom amount input
  userSessions.set(dbUserId, {
    step: "awaiting_custom_amount",
    data: { agentId, tradeId, originalTradeData: tradeData }
  });

  const keyboard = new InlineKeyboard()
    .text("❌ Cancel", `decline_trade_${agentId}_${tradeId}`)
    .text("🔙 Back to Agent", `agent_${agentId}`);

  await ctx.reply(
    `💰 **Custom Amount Input**\n\n` +
    `Current suggested amount: **${tradeData.usdt_cost.toFixed(2)} USDT**\n\n` +
    `💬 **Please reply with your desired USDT amount:**\n` +
    `Example: \`25\` or \`50.5\`\n\n` +
    `⚠️ Make sure you have sufficient balance in your agent's escrow.`,
    { reply_markup: keyboard, parse_mode: "Markdown" }
  );
});

// Custom amount handler moved to first message handler

bot.on("message:text", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  // Check for trade prompt session
  const userState = userStates.get(userId);
  if (!userState || userState.state !== "waiting_for_trade_prompt") {
    return;
  }

  if (Date.now() - userState.timestamp > 5 * 60 * 1000) {
    userStates.delete(userId);
    return ctx.reply("⏰ Trade prompt session expired. Please try again.");
  }

  const tradePrompt = ctx.message.text.trim();
  const agentId = userState.agentId!;

  userStates.delete(userId);

  const dbUserId = getUserId(userId);
  if (!dbUserId) {
    return ctx.reply("User not found. Please use /start to register.");
  }

  const agent = db
    .query("SELECT * FROM user_agents WHERE id = ? AND user_id = ?")
    .get(agentId, dbUserId) as any;

  if (!agent) {
    return ctx.reply("❌ Agent not found or session expired.");
  }

  try {
    const loadingMessage = await ctx.reply(
      "⚡ **Executing Trade...**\n\n" +
        `Your agent is analyzing your request: "${tradePrompt}"\n\n` +
        "⏳ Generating trade suggestion and executing...",
      { parse_mode: "Markdown" }
    );

    const tradingAgent = new Agent({
      model: "gemini-2.0-flash",
      preamble: `You are a professional cryptocurrency trading agent with specific user instructions.`,
    });

    let userPrompt = `TRADE REQUEST: "${tradePrompt}"\n\n`;
    userPrompt += `Please analyze this specific trade request and provide a recommendation.\n\n`;
    userPrompt += `My general trading strategy for context: "${agent.instructions}"\n\n`;
    userPrompt += `Generate a specific trade suggestion based on the request above, considering both the request and my trading strategy.\n\n`;

    const declinedTrades = db
      .query(
        "SELECT trade_data FROM declined_trades WHERE user_id = ? AND agent_id = ? ORDER BY declined_at DESC LIMIT 3"
      )
      .all(dbUserId, agentId) as any[];

    if (declinedTrades.length > 0) {
      userPrompt += `\nFor context, here are some recent trade suggestions I declined (avoid similar trades):\n`;
      declinedTrades.forEach((decline, index) => {
        try {
          const tradeData = JSON.parse(decline.trade_data);
          userPrompt += `${index + 1}. ${tradeData.token_symbol} - ${
            tradeData.reasoning
          }\n`;
        } catch (e) {}
      });
    }

    userPrompt += `\nReturn ONLY a JSON object with this exact structure:
{
  "token_symbol": "TOKEN_NAME",
  "token_amount": number,
  "usdt_cost": number,
  "reasoning": "Brief explanation of why this trade fits the urgent request",
  "confidence": number_between_1_and_10
}

Available tokens: ${Object.keys(tokens).join(", ")}`;

    const usdtBalance = await getUSDTBalance(agent.escrow_address);
    const walletBalance = parseFloat(usdtBalance);
    const result = await tradingAgent.enhancedWorkflow(userPrompt, walletBalance);

    await safeDeleteMessage(ctx, loadingMessage.message_id);

    if (result.error) {
      return ctx.reply(
        `❌ **Error generating trade for your request:**\n\n${result.error}\n\nPlease try again later.`,
        {
          reply_markup: new InlineKeyboard().text(
            "🔙 Back to Agent",
            `agent_${agentId}`
          ),
          parse_mode: "Markdown",
        }
      );
    }

    let responseMessage = `⚡ **Trade Execution for "${tradePrompt}"**\n\n`;
    responseMessage += `🤖 **Agent:** ${agent.agent_name}\n`;
    responseMessage += `📝 **Your Request:** ${tradePrompt}\n\n`;

    if (result.tradeDecision) {
      const td = result.tradeDecision;

      console.log(`AI Trade Decision:`, {
        token: td.token,
        entry: td.entry,
        tradeAmount: td.tradeAmount,
        message: td.message
      });

      // Use AI's suggested trade amount in USDT, fallback to 50 USDT if not provided
      const usdtAmount = td.tradeAmount || 50;
      // Calculate token amount based on USDT amount and entry price
      const tokenAmount = usdtAmount / td.entry;

      console.log(`Trade calculation: ${usdtAmount} USDT / ${td.entry} = ${tokenAmount} tokens`);

      const tradeData = {
        type: "tradeDecision", // Required for execution handler validation
        token_symbol: td.token.toUpperCase(),
        token_amount: tokenAmount,
        usdt_cost: usdtAmount,
        reasoning: td.message,
        confidence: td.confidence,
        data: {
          token: td.token.toUpperCase(),
          tradeType: td.tradeType || "buy",
          entry: td.entry,
          currentPrice: td.currentPrice,
          sl: td.sl,
          tp: td.tp,
          message: td.message,
          confidence: td.confidence,
          tradeAmount: usdtAmount
        }
      };

      responseMessage += `🎯 **Recommended Trade:**\n`;
      responseMessage += `• **Token:** ${tradeData.token_symbol}\n`;
      responseMessage += `• **Entry Price:** $${td.entry.toFixed(4)}\n`;
      responseMessage += `• **Current Price:** $${td.currentPrice.toFixed(4)}\n`;
      responseMessage += `• **Stop Loss:** $${td.sl.toFixed(4)}\n`;
      responseMessage += `• **Take Profit:** $${td.tp.toFixed(4)}\n`;
      responseMessage += `• **Confidence:** ${tradeData.confidence}%\n\n`;
      
      responseMessage += `📊 **Analysis:**\n${tradeData.reasoning}\n\n`;
      
      responseMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      responseMessage += `💰 **🎯 SUGGESTED TRADE AMOUNT: ${tradeData.usdt_cost.toFixed(2)} USDT**\n`;
      const tradeAction = tradeData.data?.tradeType === "sell" ? "sell" : "purchase";
      responseMessage += `📦 *Will ${tradeAction} approximately ${tradeData.token_amount.toFixed(6)} ${tradeData.token_symbol}*\n`;
      responseMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      const tradeId = generateTradeId();
      tradeDataStore.set(tradeId, {
        ...tradeData,
        agentId: agentId,
        userId: dbUserId,
        timestamp: Date.now(),
      });

      responseMessage += "🚀 **Choose your action:**";

      const keyboard = new InlineKeyboard()
        .text("✅ Accept Trade", `confirm_trade_${agentId}_${tradeId}`)
        .text("💰 Custom Amount", `custom_amount_${agentId}_${tradeId}`)
        .row()
        .text("❌ Decline", `decline_trade_${tradeId}`)
        .text("🔙 Back to Agent", `agent_${agentId}`);

      await ctx.reply(responseMessage, {
        reply_markup: keyboard,
        parse_mode: "Markdown",
      });
    } else {
      const keyboard = new InlineKeyboard()
        .text("🔄 Try Again", `execute_trade_${agentId}`)
        .text("🔙 Back to Agent", `agent_${agentId}`);

      await ctx.reply(
        "❌ **No trade suggestion generated**\n\n" +
          "The agent couldn't generate a suitable trade for your request. Please try with a different prompt.",
        { reply_markup: keyboard, parse_mode: "Markdown" }
      );
    }
  } catch (error) {
    console.error("Error executing trade:", error);

    const keyboard = new InlineKeyboard()
      .text("🔄 Try Again", `execute_trade_${agentId}`)
      .text("🔙 Back to Agent", `agent_${agentId}`);

    await ctx.reply(
      "❌ **Error executing trade**\n\n" +
        "There was an error processing your trade request. Please try again in a moment.",
      { reply_markup: keyboard, parse_mode: "Markdown" }
    );
  }
});
