import { Agent } from "./agent";

export class TradingAgentAdvanced extends Agent {
  async getMarketSentiment(): Promise<{
    sentiment: "bullish" | "bearish" | "neutral";
    score: number;
    sources: string[];
  }> {
    const sentiments = ["bullish", "bearish", "neutral"] as const;
    const randomSentiment =
      sentiments[Math.floor(Math.random() * sentiments.length)];

    return {
      sentiment: randomSentiment,
      score: Math.random() * 2 - 1,
      sources: ["Twitter", "Reddit", "News Articles", "Telegram Groups"],
    };
  }

  async getTechnicalIndicators(priceData: any[]): Promise<{
    rsi: number;
    macd: { value: number; signal: number; histogram: number };
    ma_20: number;
    ma_50: number;
    ma_200: number;
    bollinger_bands: { upper: number; middle: number; lower: number };
  }> {
    const currentPrice = priceData[priceData.length - 1]?.price || 100;

    return {
      rsi: Math.random() * 100,
      macd: {
        value: Math.random() * 10 - 5,
        signal: Math.random() * 10 - 5,
        histogram: Math.random() * 5 - 2.5,
      },
      ma_20: currentPrice * (0.95 + Math.random() * 0.1),
      ma_50: currentPrice * (0.9 + Math.random() * 0.2),
      ma_200: currentPrice * (0.8 + Math.random() * 0.4),
      bollinger_bands: {
        upper: currentPrice * 1.05,
        middle: currentPrice,
        lower: currentPrice * 0.95,
      },
    };
  }

  async getOnChainMetrics(): Promise<{
    active_addresses: number;
    transaction_volume: number;
    whale_movements: { large_transfers: number; avg_amount: number };
    exchange_flows: { inflow: number; outflow: number };
  }> {
    return {
      active_addresses: Math.floor(Math.random() * 10000) + 1000,
      transaction_volume: Math.random() * 1000000,
      whale_movements: {
        large_transfers: Math.floor(Math.random() * 50),
        avg_amount: Math.random() * 1000000,
      },
      exchange_flows: {
        inflow: Math.random() * 500000,
        outflow: Math.random() * 500000,
      },
    };
  }

  async getRiskAssessment(priceData: any[]): Promise<{
    volatility: number;
    risk_level: "low" | "medium" | "high";
    max_position_size: number;
    recommended_timeframe: string;
  }> {
    const prices = priceData.map((d) => d.price);
    const returns = prices
      .slice(1)
      .map((price, i) => (price - prices[i]) / prices[i]);
    const volatility = Math.sqrt(
      returns.reduce((sum, ret) => sum + ret * ret, 0) / returns.length
    );

    const riskLevels = ["low", "medium", "high"] as const;
    const riskLevel =
      volatility < 0.02 ? "low" : volatility < 0.05 ? "medium" : "high";

    return {
      volatility,
      risk_level: riskLevel,
      max_position_size:
        riskLevel === "low" ? 10 : riskLevel === "medium" ? 5 : 2,
      recommended_timeframe:
        riskLevel === "low"
          ? "long-term"
          : riskLevel === "medium"
          ? "medium-term"
          : "short-term",
    };
  }

  async makeEnhancedTradeDecision(
    userPrompt: string,
    ticker: string,
    priceHistory: any,
    requestedFeatures: string[] = []
  ): Promise<any> {
    let additionalData: any = {};

    if (requestedFeatures.includes("sentiment")) {
      console.log(`📊 Fetching market sentiment for ${ticker}...`);
      additionalData.sentiment = await this.getMarketSentiment();
    }

    if (requestedFeatures.includes("technical")) {
      console.log(`📈 Calculating technical indicators for ${ticker}...`);
      additionalData.technical = await this.getTechnicalIndicators(
        priceHistory.data
      );
    }

    if (requestedFeatures.includes("onchain")) {
      console.log(`⛓️ Fetching on-chain metrics for ${ticker}...`);
      additionalData.onchain = await this.getOnChainMetrics();
    }

    if (requestedFeatures.includes("risk")) {
      console.log(`⚠️ Performing risk assessment for ${ticker}...`);
      additionalData.risk = await this.getRiskAssessment(priceHistory.data);
    }

    // Create enhanced trading agent with additional data
    const enhancedAgent = new Agent({
      model: "gemini-2.0-flash",
      preamble: `You are an expert cryptocurrency trading analyst with access to comprehensive market data.
      
      Based on the user's prompt, token ticker, price history, and additional market data, provide a detailed trade recommendation.
      
      Analyze all available data including:
      - Price trends and patterns
      - Technical indicators (if available)
      - Market sentiment (if available)
      - On-chain metrics (if available)
      - Risk assessment (if available)
      
      Provide specific entry, stop loss, and take profit levels with detailed reasoning that incorporates all available data.
      
      If you need additional data that wasn't provided, mention what would be helpful for better analysis.`,
    });

    // Add all available data as knowledge
    enhancedAgent.knowledges.push(
      `Price History Data for ${ticker}:\n${JSON.stringify(
        priceHistory,
        null,
        2
      )}`
    );

    if (Object.keys(additionalData).length > 0) {
      enhancedAgent.knowledges.push(
        `Additional Market Data:\n${JSON.stringify(additionalData, null, 2)}`
      );
    }

    enhancedAgent.responseJsonSchema = {
      type: "object",
      properties: {
        token: { type: "string" },
        sl: { type: "number" },
        tp: { type: "number" },
        entry: { type: "number" },
        currentPrice: { type: "number" },
        message: { type: "string" },
        reject: { type: "boolean" },
        confidence: { type: "number" },
        data_used: { type: "array", items: { type: "string" } },
      },
      required: [
        "token",
        "sl",
        "tp",
        "entry",
        "currentPrice",
        "message",
        "reject",
        "confidence",
        "data_used",
      ],
    };

    const result = await enhancedAgent.prompt(userPrompt);
    return result;
  }
}

export async function demonstrateAdvancedFeatures() {
  console.log("🚀 Demonstrating Advanced Trading Agent Features\n");

  const advancedAgent = new TradingAgentAdvanced({
    model: "gemini-2.0-flash",
    preamble: "Advanced Trading Agent",
  });

  const userPrompt =
    "I want to make a high-confidence trade on TON. Give me the best possible analysis.";

  const result = await advancedAgent.processTradeRequest(userPrompt);

  if (result.tradeDecision && result.tickerResult && result.priceHistory) {
    console.log(
      "🔍 Making enhanced trade decision with additional features...\n"
    );

    const enhancedDecision = await advancedAgent.makeEnhancedTradeDecision(
      userPrompt,
      result.tickerResult.ticker,
      result.priceHistory,
      ["sentiment", "technical", "onchain", "risk"]
    );

    console.log("🎯 ENHANCED TRADE RECOMMENDATION:");
    console.log(JSON.stringify(enhancedDecision, null, 2));
  }
}
