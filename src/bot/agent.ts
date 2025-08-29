import { GoogleGenAI } from "@google/genai";
import {
  getPriceHistory,
  getAllCachedPriceHistories,
  warmEssentialCache,
  getMarketSummary,
} from "./coingecko";
import { tokens } from "./tokens";
import { z } from "zod";
import env from "../../env";

const ai = new GoogleGenAI({
  apiKey: env.GOOGLE_API_KEY,
  httpOptions: {},
});

type GoogleGenAiConfig = NonNullable<
  Parameters<GoogleGenAI["models"]["generateContent"]>["0"]["config"]
>;

type AgentConfig = Omit<
  GoogleGenAiConfig,
  "responseMimeType" | "responseJsonSchema" | "systemInstruction"
>;
type ModelName = "gemini-2.0-flash";

const PromptGuardResultSchema = z.object({
  valid: z.boolean(),
  reason: z.string().optional(),
});

const TokenExtractionResultSchema = z.object({
  ticker: z.string(),
  found: z.boolean(),
});

const TradeDecisionSchema = z.object({
  token: z.string(),
  tradeType: z.enum(["buy", "sell"]).default("buy"), // Buy or sell operation
  sl: z.number(),
  tp: z.number(),
  entry: z.number(),
  currentPrice: z.number(),
  message: z.string(),
  confidence: z.number().min(0).max(100),
  tradeAmount: z.number().optional(), // Suggested trade amount in USDT
});

const ContextRequestSchema = z.object({
  needsMoreContext: z.boolean(),
  requestedTokens: z.array(z.string()).optional(),
  requestedDays: z.number().optional(),
  reason: z.string().optional(),
});

const GenericAdviceSchema = z.object({
  suggestedToken: z.string().optional(),
  reasoning: z.string(),
  needsSpecificTokenData: z.boolean(),
  requestedTokens: z.array(z.string()).optional(),
});

type PromptGuardResult = z.infer<typeof PromptGuardResultSchema>;
type TokenExtractionResult = z.infer<typeof TokenExtractionResultSchema>;
type TradeDecision = z.infer<typeof TradeDecisionSchema>;
type ContextRequest = z.infer<typeof ContextRequestSchema>;
type GenericAdvice = z.infer<typeof GenericAdviceSchema>;

export class Agent {
  preamble: string;
  ai: GoogleGenAI;
  model: ModelName;
  config: AgentConfig = {};
  responseJsonSchema: any;
  knowledges: string[] = [];

  constructor(options: { preamble: string; model: ModelName }) {
    this.preamble = options.preamble;
    this.model = options.model;
    this.ai = new GoogleGenAI({
      apiKey: env.GOOGLE_API_KEY,
    });
  }

  private safeParseWithZod<T>(data: any, schema: z.ZodSchema<T>): T {
    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.warn("Zod validation failed:", error.issues);
        throw new Error(
          `Validation failed: ${error.issues.map((e) => e.message).join(", ")}`
        );
      }
      throw error;
    }
  }

  async prompt(input: string, schema?: z.ZodSchema) {
    try {
      const contents = this.parsePrompt(input);
      const res = await this.ai.models.generateContent({
        model: this.model,
        contents,
        config: this.getConfig(),
      });

      if (this.responseJsonSchema) {
        const jsonText = res.candidates?.[0].content?.parts
          ?.map((part) => part.text)
          .join("");
        if (!jsonText) {
          return {};
        }
        const json = JSON.parse(jsonText);

        if (schema) {
          return this.safeParseWithZod(json, schema);
        }

        return json;
      }

      return res.candidates?.[0].content;
    } catch (error) {
      // Log the full error details for debugging
      console.error("Google AI API error:", error);
      
      // Check if it's a quota/rate limit error
      if (error && typeof error === 'object') {
        const errorStr = JSON.stringify(error);
        if (errorStr.includes('429') || errorStr.includes('quota') || errorStr.includes('RESOURCE_EXHAUSTED')) {
          throw new Error("API_QUOTA_EXCEEDED");
        }
      }
      
      // For other errors, throw a generic error
      throw new Error("AI_SERVICE_UNAVAILABLE");
    }
  }
  async promptGuard(userPrompt: string): Promise<PromptGuardResult> {
    const currentTimestamp = new Date().toISOString();
    const guardAgent = new Agent({
      model: "gemini-2.0-flash",
      preamble: `You are a prompt guard for a cryptocurrency trading bot. 
      Current timestamp: ${currentTimestamp}
      
      Analyze the user's prompt and determine if it's appropriate for cryptocurrency trading.
      
      Valid prompts include:
      - Requests for trade recommendations
      - Questions about specific cryptocurrencies
      - Market analysis requests
      - Price predictions
      
      Invalid prompts include:
      - Requests for financial advice beyond trading
      - Non-crypto related queries
      - Harmful or inappropriate content
      - Requests to trade stocks, forex, or other non-crypto assets
      
      Return your analysis with valid: true/false and a reason if invalid.`,
    });

    guardAgent.responseJsonSchema = {
      type: "object",
      properties: {
        valid: { type: "boolean" },
        reason: { type: "string" },
      },
      required: ["valid"],
    };

    const result = await guardAgent.prompt(userPrompt, PromptGuardResultSchema);
    return result as PromptGuardResult;
  }

  async extractTicker(userPrompt: string): Promise<TokenExtractionResult> {
    const currentTimestamp = new Date().toISOString();
    const tickerAgent = new Agent({
      model: "gemini-2.0-flash",
      preamble: `You are a token ticker extraction agent. 
      Current timestamp: ${currentTimestamp}
      
      Analyze the user's prompt and extract the cryptocurrency ticker they want to trade.
      
      Available tokens: ${tokens.map((t) => t.symbol).join(", ")}
      
      If no specific token is mentioned, suggest the most relevant one based on context.
      If multiple tokens are mentioned, pick the primary one for trading.
      
      Remember: w(wrapped) tokens may be referred to by their original name.`,
    });

    tickerAgent.responseJsonSchema = {
      type: "object",
      properties: {
        ticker: { type: "string" },
        found: { type: "boolean" },
      },
      required: ["ticker", "found"],
    };

    const result = await tickerAgent.prompt(
      userPrompt,
      TokenExtractionResultSchema
    );
    return result as TokenExtractionResult;
  }

  async makeTradeDecision(
    userPrompt: string,
    ticker: string,
    priceHistory: any,
    walletBalance?: number
  ): Promise<TradeDecision> {
    const currentTimestamp = new Date().toISOString();
    const walletBalanceInfo = walletBalance 
      ? `\n      User's current USDT wallet balance: ${walletBalance} USDT\n      
      CRITICAL: For risk management, suggest trades using 10% to 90% of available balance based on risk assessment.
      Available balance: ${walletBalance} USDT
      Suggest between ${(walletBalance * 0.1).toFixed(2)} USDT (10%) and ${(walletBalance * 0.9).toFixed(2)} USDT (90%).
      Choose percentage based on trade confidence, market volatility, and risk level.
      Higher confidence = higher percentage (up to 90%), Lower confidence = lower percentage (down to 10%).
      NEVER suggest more than 90% or less than 10% of the balance.`
      : `\n      User's wallet balance: Unknown - provide general trade recommendation without specific amounts.`;

    const tradeAgent = new Agent({
      model: "gemini-2.0-flash",
      preamble: `You are an expert cryptocurrency trading analyst. 
      Current timestamp: ${currentTimestamp}${walletBalanceInfo}
      
      Based on the user's prompt, token ticker, and price history data, provide a detailed trade recommendation.
      
      Analyze:
      - Price trends and patterns
      - Volume indicators
      - Support and resistance levels
      - Risk management parameters
      - User's available balance for trading
      - Whether this should be a BUY or SELL operation based on the user's request
      
      Provide specific entry, stop loss, and take profit levels with detailed reasoning.
      Also suggest an appropriate trade amount (tradeAmount) in USDT that fits within the user's budget.
      Set tradeType to "buy" for buying tokens with USDT, or "sell" for selling tokens to get USDT.
      
      IMPORTANT: Return confidence as a percentage number between 0-100 (e.g., 75 for 75% confidence, not 0.75).`,
    });

    tradeAgent.knowledges.push(
      `Price History Data for ${ticker}:\n${JSON.stringify(
        priceHistory,
        null,
        2
      )}`
    );
    tradeAgent.knowledges.push(
      `Available tokens: ${tokens
        .map((t) => `${t.symbol} (${t.name})`)
        .join(", ")}`
    );

    tradeAgent.responseJsonSchema = {
      type: "object",
      properties: {
        token: { type: "string" },
        tradeType: { type: "string", enum: ["buy", "sell"] },
        sl: { type: "number" },
        tp: { type: "number" },
        entry: { type: "number" },
        currentPrice: { type: "number" },
        message: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 100 },
        tradeAmount: { type: "number" },
      },
      required: [
        "token",
        "tradeType",
        "sl",
        "tp",
        "entry",
        "currentPrice",
        "message",
        "confidence",
        "tradeAmount",
      ],
    };

    const result = await tradeAgent.prompt(userPrompt, TradeDecisionSchema);
    return result as TradeDecision;
  }

  /**
   * Complete trading workflow
   */
  async processTradeRequest(userPrompt: string, walletBalance?: number): Promise<{
    guardResult: PromptGuardResult;
    tickerResult?: TokenExtractionResult;
    priceHistory?: any;
    tradeDecision?: TradeDecision;
    error?: string;
  }> {
    try {
      console.log("🛡️ Running prompt guard...");
      const guardResult = await this.promptGuard(userPrompt);

      if (!guardResult.valid) {
        return {
          guardResult,
          error: guardResult.reason || "Prompt validation failed",
        };
      }

      console.log("🎯 Extracting ticker...");
      const tickerResult = await this.extractTicker(userPrompt);

      if (!tickerResult.found) {
        return {
          guardResult,
          tickerResult,
          error: "Could not identify a valid cryptocurrency ticker",
        };
      }

      console.log(`📈 Fetching price history for ${tickerResult.ticker}...`);
      const priceHistory = await getPriceHistory(tickerResult.ticker, 7);

      if (!priceHistory.success) {
        return {
          guardResult,
          tickerResult,
          priceHistory,
          error: `Failed to fetch price history: ${priceHistory.error}`,
        };
      }

      console.log("🤖 Analyzing and making trade decision...");
      const tradeDecision = await this.makeTradeDecision(
        userPrompt,
        tickerResult.ticker,
        priceHistory,
        walletBalance
      );

      return {
        guardResult,
        tickerResult,
        priceHistory,
        tradeDecision,
      };
    } catch (error) {
      // Log the full error details for debugging
      console.error("Agent workflow error:", error);
      
      // Check for specific error types from the prompt method
      if (error instanceof Error) {
        if (error.message === "API_QUOTA_EXCEEDED") {
          return {
            guardResult: { valid: false, reason: "API quota exceeded" },
            error: "API_QUOTA_EXCEEDED",
          };
        }
        if (error.message === "AI_SERVICE_UNAVAILABLE") {
          return {
            guardResult: { valid: false, reason: "AI service unavailable" },
            error: "AI_SERVICE_UNAVAILABLE",
          };
        }
      }
      
      return {
        guardResult: { valid: false, reason: "System error occurred" },
        error: "SERVICE_UNAVAILABLE",
      };
    }
  }

  private getConfig() {
    let config: GoogleGenAiConfig = {
      ...this.config,
      systemInstruction: this.preamble,
    };

    if (this.responseJsonSchema) {
      config.responseMimeType = "application/json";
      config.responseJsonSchema = this.responseJsonSchema;
    }

    return config;
  }

  private parsePrompt(input: string) {
    const contents: string[] = [];
    for (const knowledge of this.knowledges) {
      contents.push("This is knowledge provided to you :\n" + knowledge);
    }
    contents.push("User Prompt:\n" + input);
    return contents.join("\n");
  }

  private zodToJsonSchema(schema: z.ZodSchema): any {
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const properties: any = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        if (value instanceof z.ZodString) {
          properties[key] = { type: "string" };
        } else if (value instanceof z.ZodNumber) {
          properties[key] = { type: "number" };
        } else if (value instanceof z.ZodBoolean) {
          properties[key] = { type: "boolean" };
        } else if (value instanceof z.ZodOptional) {
          const innerType = value._def.innerType;
          if (innerType instanceof z.ZodString) {
            properties[key] = { type: "string" };
          } else if (innerType instanceof z.ZodNumber) {
            properties[key] = { type: "number" };
          } else if (innerType instanceof z.ZodBoolean) {
            properties[key] = { type: "boolean" };
          }
        } else {
          properties[key] = { type: "string" };
        }

        if (!(value instanceof z.ZodOptional)) {
          required.push(key);
        }
      }

      return {
        type: "object",
        properties,
        required,
      };
    }

    return { type: "object" };
  }

  /**
   * Enhanced workflow that handles generic trading advice and context requests
   */
  async enhancedWorkflow(userPrompt: string, walletBalance?: number): Promise<{
    guardResult: PromptGuardResult;
    tickerResult?: TokenExtractionResult;
    priceHistory?: any;
    tradeDecision?: TradeDecision;
    genericAdvice?: GenericAdvice;
    contextRequest?: ContextRequest;
    marketSummary?: any;
    error?: string;
  }> {
    try {
      console.log("🛡️ Running prompt guard...");
      const guardResult = await this.promptGuard(userPrompt);

      if (!guardResult.valid) {
        return {
          guardResult,
          error: guardResult.reason || "Prompt validation failed",
        };
      }

      console.log("🎯 Extracting ticker...");
      const tickerResult = await this.extractTicker(userPrompt);

      if (!tickerResult.found) {
        console.log(
          "🤔 No specific ticker found, providing generic trading advice..."
        );

        const cachedData = getAllCachedPriceHistories();
        const marketSummary = getMarketSummary();

        if (marketSummary.cachedTokens < 3) {
          console.log(
            "📊 Limited cached data available, warming essential cache..."
          );
          await warmEssentialCache();
        }

        const genericAdvice = await this.provideGenericAdvice(
          userPrompt,
          cachedData,
          marketSummary
        );

        return {
          guardResult,
          tickerResult,
          genericAdvice,
          marketSummary,
        };
      }

      console.log(`📈 Fetching price history for ${tickerResult.ticker}...`);
      const priceHistory = await getPriceHistory(tickerResult.ticker, 7);

      if (!priceHistory.success) {
        return {
          guardResult,
          tickerResult,
          priceHistory,
          error: `Failed to fetch price history: ${priceHistory.error}`,
        };
      }

      console.log("🧠 Checking if more context is needed...");
      const contextRequest = await this.checkForContextNeeds(
        userPrompt,
        tickerResult.ticker,
        priceHistory
      );

      if (contextRequest.needsMoreContext && contextRequest.requestedTokens) {
        console.log(
          `📊 AI requested additional data for: ${contextRequest.requestedTokens.join(
            ", "
          )}`
        );

        const additionalData: { [key: string]: any } = {};
        for (const requestedToken of contextRequest.requestedTokens) {
          const additionalHistory = await getPriceHistory(
            requestedToken,
            contextRequest.requestedDays || 7
          );
          if (additionalHistory.success) {
            additionalData[requestedToken] = additionalHistory;
          }
        }

        const tradeDecision = await this.makeTradeDecisionWithContext(
          userPrompt,
          tickerResult.ticker,
          priceHistory,
          additionalData,
          walletBalance
        );

        return {
          guardResult,
          tickerResult,
          priceHistory,
          tradeDecision,
          contextRequest,
        };
      }

      console.log("🤖 Analyzing and making trade decision...");
      const tradeDecision = await this.makeTradeDecision(
        userPrompt,
        tickerResult.ticker,
        priceHistory,
        walletBalance
      );

      return {
        guardResult,
        tickerResult,
        priceHistory,
        tradeDecision,
      };
    } catch (error) {
      // Log the full error details for debugging
      console.error("Agent workflow error:", error);
      
      // Check for specific error types from the prompt method
      if (error instanceof Error) {
        if (error.message === "API_QUOTA_EXCEEDED") {
          return {
            guardResult: { valid: false, reason: "API quota exceeded" },
            error: "API_QUOTA_EXCEEDED",
          };
        }
        if (error.message === "AI_SERVICE_UNAVAILABLE") {
          return {
            guardResult: { valid: false, reason: "AI service unavailable" },
            error: "AI_SERVICE_UNAVAILABLE",
          };
        }
      }
      
      return {
        guardResult: { valid: false, reason: "System error occurred" },
        error: "SERVICE_UNAVAILABLE",
      };
    }
  }

  async provideGenericAdvice(
    userPrompt: string,
    cachedData: { [symbol: string]: any },
    marketSummary: any
  ): Promise<GenericAdvice> {
    const currentTimestamp = new Date().toISOString();
    const adviceAgent = new Agent({
      model: "gemini-2.0-flash",
      preamble: `You are an expert cryptocurrency trading analyst providing general trading advice.
      Current timestamp: ${currentTimestamp}
      
      The user has asked for trading advice without specifying a particular token.
      
      Based on the current market data and user's request, provide:
      1. General market insights
      2. Suggest a specific token to trade (if appropriate)
      3. Reasoning for your suggestion
      4. Whether you need specific token price data to make a better recommendation
      
      Available tokens: ${tokens.map((t) => t.symbol).join(", ")}
      
      If you suggest a token, make sure it's from the available list.`,
    });

    adviceAgent.knowledges.push(
      `Market Summary:\n${JSON.stringify(marketSummary, null, 2)}`
    );

    if (Object.keys(cachedData).length > 0) {
      adviceAgent.knowledges.push(
        `Cached Price Data:\n${JSON.stringify(cachedData, null, 2)}`
      );
    }

    adviceAgent.responseJsonSchema = {
      type: "object",
      properties: {
        suggestedToken: { type: "string" },
        reasoning: { type: "string" },
        needsSpecificTokenData: { type: "boolean" },
        requestedTokens: { type: "array", items: { type: "string" } },
      },
      required: ["reasoning", "needsSpecificTokenData"],
    };

    return await adviceAgent.prompt(userPrompt, GenericAdviceSchema);
  }

  async checkForContextNeeds(
    userPrompt: string,
    ticker: string,
    priceHistory: any
  ): Promise<ContextRequest> {
    const currentTimestamp = new Date().toISOString();
    const contextAgent = new Agent({
      model: "gemini-2.0-flash",
      preamble: `You are an expert cryptocurrency analyst reviewing if additional market data is needed.
      Current timestamp: ${currentTimestamp}
      
      Given the user prompt, target token, and its price history, determine if you need additional context such as:
      - Price data from other tokens for comparison
      - Longer historical data
      - Market correlation data
      
      Be specific about what additional data would help make a better trading decision.
      Available tokens: ${tokens.map((t) => t.symbol).join(", ")}`,
    });

    contextAgent.knowledges.push(`Target Token: ${ticker}`);
    contextAgent.knowledges.push(
      `Price History for ${ticker}:\n${JSON.stringify(priceHistory, null, 2)}`
    );

    contextAgent.responseJsonSchema = {
      type: "object",
      properties: {
        needsMoreContext: { type: "boolean" },
        requestedTokens: { type: "array", items: { type: "string" } },
        requestedDays: { type: "number" },
        reason: { type: "string" },
      },
      required: ["needsMoreContext"],
    };

    return await contextAgent.prompt(userPrompt, ContextRequestSchema);
  }

  async makeTradeDecisionWithContext(
    userPrompt: string,
    ticker: string,
    priceHistory: any,
    additionalData: { [key: string]: any },
    walletBalance?: number
  ): Promise<TradeDecision> {
    const currentTimestamp = new Date().toISOString();
    const walletBalanceInfo = walletBalance 
      ? `\n      User's current USDT wallet balance: ${walletBalance} USDT\n      
      CRITICAL: For risk management, suggest trades using 10% to 90% of available balance based on risk assessment.
      Available balance: ${walletBalance} USDT
      Suggest between ${(walletBalance * 0.1).toFixed(2)} USDT (10%) and ${(walletBalance * 0.9).toFixed(2)} USDT (90%).
      Choose percentage based on trade confidence, market volatility, and risk level.
      Higher confidence = higher percentage (up to 90%), Lower confidence = lower percentage (down to 10%).
      NEVER suggest more than 90% or less than 10% of the balance.`
      : `\n      User's wallet balance: Unknown - provide general trade recommendation without specific amounts.`;

    const enhancedTradeAgent = new Agent({
      model: "gemini-2.0-flash",
      preamble: `You are an expert cryptocurrency trading analyst with access to comprehensive market data.
      Current timestamp: ${currentTimestamp}${walletBalanceInfo}
      
      Based on the user's prompt, target token, its price history, and additional market context, provide a detailed trade recommendation.
      
      Analyze:
      - Primary token price trends and patterns
      - Volume indicators
      - Support and resistance levels
      - Correlation with other tokens
      - Market sentiment from additional data
      - Risk management parameters
      - User's available balance for trading
      - Whether this should be a BUY or SELL operation based on the user's request
      
      Provide specific entry, stop loss, and take profit levels with detailed reasoning.
      Also suggest an appropriate trade amount (tradeAmount) in USDT that fits within the user's budget.
      Set tradeType to "buy" for buying tokens with USDT, or "sell" for selling tokens to get USDT.
      
      IMPORTANT: Return confidence as a percentage number between 0-100 (e.g., 75 for 75% confidence, not 0.75).`,
    });

    enhancedTradeAgent.knowledges.push(
      `Target Token Price History for ${ticker}:\n${JSON.stringify(
        priceHistory,
        null,
        2
      )}`
    );

    enhancedTradeAgent.knowledges.push(
      `Additional Market Data:\n${JSON.stringify(additionalData, null, 2)}`
    );

    enhancedTradeAgent.knowledges.push(
      `Available tokens: ${tokens
        .map((t) => `${t.symbol} (${t.name})`)
        .join(", ")}`
    );

    enhancedTradeAgent.responseJsonSchema = {
      type: "object",
      properties: {
        token: { type: "string" },
        tradeType: { type: "string", enum: ["buy", "sell"] },
        sl: { type: "number" },
        tp: { type: "number" },
        entry: { type: "number" },
        currentPrice: { type: "number" },
        message: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 100 },
        tradeAmount: { type: "number" },
      },
      required: [
        "token",
        "tradeType",
        "sl",
        "tp",
        "entry",
        "currentPrice",
        "message",
        "confidence",
        "tradeAmount",
      ],
    };

    return await enhancedTradeAgent.prompt(userPrompt, TradeDecisionSchema);
  }
}
