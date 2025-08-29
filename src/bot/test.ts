import { Agent } from "./agent";
import { getMarketSummary, warmEssentialCache } from "./coingecko";

const agent = new Agent({
  model: "gemini-2.0-flash",
  preamble: `You are a sophisticated cryptocurrency trading bot with advanced analysis capabilities.`,
});

async function testComprehensiveWorkflow() {
  console.log("🚀 Comprehensive Trading Agent Test\n");

  const testCases = [
    { prompt: "What's the best crypto to trade right now?", type: "generic" },
    {
      prompt: "I want to trade TON, what's a good entry point?",
      type: "specific",
    },
    { prompt: "Should I buy TON or WBTC today?", type: "comparison" },
    { prompt: "Give me stock trading advice", type: "invalid" },
    { prompt: "Tell me about WETH volatility and risk", type: "analysis" },
  ];

  console.log("📊 Initial cache status:");
  let summary = getMarketSummary();
  console.log(
    `Cached tokens: ${summary.cachedTokens}/${summary.totalTokens}\n`
  );

  for (const [index, testCase] of testCases.entries()) {
    console.log("=".repeat(60));
    console.log(`🧪 Test ${index + 1}: ${testCase.type.toUpperCase()}`);
    console.log(`"${testCase.prompt}"`);
    console.log("=".repeat(60));

    try {
      const start = Date.now();
      const result = await agent.enhancedWorkflow(testCase.prompt);
      const duration = Date.now() - start;

      console.log(`⏱️  Duration: ${duration}ms`);
      console.log(
        `✅ Prompt Guard: ${result.guardResult.valid ? "PASSED" : "FAILED"}`
      );

      if (!result.guardResult.valid) {
        console.log(`❌ Reason: ${result.guardResult.reason}`);
        continue;
      }

      if (result.tickerResult) {
        console.log(
          `🎯 Ticker: ${result.tickerResult.ticker} (Found: ${result.tickerResult.found})`
        );
      }

      if (result.genericAdvice) {
        console.log(`🤖 Generic Advice:`);
        console.log(
          `   Suggested: ${result.genericAdvice.suggestedToken || "None"}`
        );
        console.log(
          `   Reasoning: ${result.genericAdvice.reasoning.substring(0, 100)}...`
        );
      }

      if (result.priceHistory?.success) {
        const latest =
          result.priceHistory.data![result.priceHistory.data!.length - 1];
        console.log(`📈 Price Data: $${latest.price.toFixed(4)}`);
      }

      if (result.contextRequest?.needsMoreContext) {
        console.log(
          `🧠 Context Request: ${result.contextRequest.requestedTokens?.join(
            ", "
          )}`
        );
      }

      if (result.tradeDecision) {
        console.log(`💰 Trade Decision:`);
        console.log(`   Token: ${result.tradeDecision.token}`);
        console.log(`   Entry: $${result.tradeDecision.entry}`);
        console.log(`   Stop Loss: $${result.tradeDecision.sl}`);
        console.log(`   Take Profit: $${result.tradeDecision.tp}`);
        console.log(`   Confidence: ${result.tradeDecision.confidence}%`);
      }
    } catch (error) {
      console.log(`❌ Error: ${error}`);
    }

    console.log("");
  }

  console.log("=".repeat(60));
  console.log("📊 FINAL CACHE STATUS");
  console.log("=".repeat(60));

  summary = getMarketSummary();
  console.log(`Cached tokens: ${summary.cachedTokens}/${summary.totalTokens}`);

  if (summary.summary.length > 0) {
    console.log("Cached data:");
    summary.summary.forEach((token) => {
      console.log(`  ${token.symbol}: $${token.currentPrice.toFixed(4)}`);
    });
  }

  console.log("\n✅ Comprehensive test complete!");
}

testComprehensiveWorkflow().catch(console.error);
