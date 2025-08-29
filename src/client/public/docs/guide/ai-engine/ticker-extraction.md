# Ticker Extraction System

## Intelligent Symbol Recognition

The ticker extraction system uses AI to identify cryptocurrency symbols from natural language, supporting various naming conventions and aliases.

```typescript
const TokenExtractionResultSchema = z.object({
  ticker: z.string(),
  found: z.boolean(),
});

async extractTicker(prompt: string): Promise<TokenExtractionResult> {
  const systemPrompt = `Extract cryptocurrency ticker symbols from user queries.
  
  Supported tokens: ${supportedTokens.join(", ")}
  
  Rules:
  - Return the exact symbol from the supported list
  - Handle common aliases (e.g., "Bitcoin" → "WBTC", "Ethereum" → "WETH")
  - If multiple tokens mentioned, prioritize the first one
  - Return found: false if no supported token identified`;
  
  const result = await this.generateStructuredOutput(
    systemPrompt,
    prompt,
    TokenExtractionResultSchema
  );
  
  return result;
}
```

### Supported Token Formats
- **Standard Symbols**: TON, WBTC, WETH, USDT
- **Alternative Names**: "Wrapped TON", "Bitcoin", "Ethereum"

## Token Registry Integration

```typescript
// Token registry with metadata
const tokens = [
  {
    symbol: "TON",
    name: "Wrapped TON", 
    cg_id: "ton-network",
    aliases: ["TON", "Wrapped TON"]
  },
  {
    symbol: "WBTC",
    name: "Wrapped BTC",
    cg_id: "wrapped-bitcoin", 
    aliases: ["Bitcoin", "BTC", "Wrapped Bitcoin"]
  }
  // ... more tokens
];
```

### Token Metadata
- **Symbol**: Official trading symbol
- **Name**: Full token name
- **CoinGecko ID**: API identifier for market data
- **Aliases**: Common alternative names
- **Network**: Blockchain network information

## Extraction Algorithms

### Pattern Matching
```typescript
function extractByPattern(text: string): string[] {
  const patterns = [
    /\b[A-Z]{2,10}\b/g,  // Standard ticker format
    /\b[A-Za-z]+coin\b/g, // Coin suffix
    /\b[A-Za-z]+token\b/g // Token suffix
  ];
  
  const matches = [];
  for (const pattern of patterns) {
    const found = text.match(pattern);
    if (found) matches.push(...found);
  }
  
  return matches;
}
```

### Fuzzy Matching
```typescript
function fuzzyMatch(input: string, tokens: Token[]): Token | null {
  const normalizedInput = input.toLowerCase().trim();
  
  for (const token of tokens) {
    // Exact match
    if (token.symbol.toLowerCase() === normalizedInput) {
      return token;
    }
    
    // Alias match
    if (token.aliases.some(alias => 
      alias.toLowerCase() === normalizedInput
    )) {
      return token;
    }
    
    // Partial match
    if (token.symbol.toLowerCase().includes(normalizedInput) ||
        normalizedInput.includes(token.symbol.toLowerCase())) {
      return token;
    }
  }
  
  return null;
}
```

## Context-Aware Extraction

### Query Context Analysis
```typescript
interface QueryContext {
  intent: "buy" | "sell" | "analyze" | "compare";
  timeframe: "short" | "medium" | "long";
  riskLevel: "low" | "medium" | "high";
  amount?: number;
}

function analyzeContext(prompt: string): QueryContext {
  const context: QueryContext = {
    intent: "analyze",
    timeframe: "short",
    riskLevel: "medium"
  };
  
  // Intent detection
  if (prompt.toLowerCase().includes("buy")) context.intent = "buy";
  if (prompt.toLowerCase().includes("sell")) context.intent = "sell";
  if (prompt.toLowerCase().includes("compare")) context.intent = "compare";
  
  // Timeframe detection
  if (prompt.toLowerCase().includes("long term")) context.timeframe = "long";
  if (prompt.toLowerCase().includes("short term")) context.timeframe = "short";
  
  return context;
}
```

### Multi-Token Handling
```typescript
function extractMultipleTokens(prompt: string): Token[] {
  const tokens: Token[] = [];
  const words = prompt.split(/\s+/);
  
  for (const word of words) {
    const token = fuzzyMatch(word, supportedTokens);
    if (token && !tokens.find(t => t.symbol === token.symbol)) {
      tokens.push(token);
    }
  }
  
  return tokens;
}
```

## Error Handling & Fallbacks

### Ambiguous Token Resolution
```typescript
function resolveAmbiguity(tokens: Token[], context: QueryContext): Token {
  if (tokens.length === 1) return tokens[0];
  
  // Prioritize by context
  if (context.intent === "buy") {
    // Prefer stable tokens for buying
    const stable = tokens.find(t => 
      ["USDT", "USDC", "DAI"].includes(t.symbol)
    );
    if (stable) return stable;
  }
  
  // Default to first token
  return tokens[0];
}
```

### Unknown Token Handling
```typescript
function handleUnknownToken(input: string): TokenExtractionResult {
  return {
    ticker: input.toUpperCase(),
    found: false,
    suggestion: `"${input}" is not currently supported. Supported tokens: ${supportedTokens.map(t => t.symbol).join(", ")}`
  };
}
```

## Performance Optimization

### Caching Token Lookups
```typescript
class TokenCache {
  private cache = new Map<string, Token>();
  
  getToken(input: string): Token | null {
    const normalized = input.toLowerCase().trim();
    return this.cache.get(normalized) || null;
  }
  
  setToken(input: string, token: Token): void {
    const normalized = input.toLowerCase().trim();
    this.cache.set(normalized, token);
  }
}
```

### Batch Processing
```typescript
async function batchExtractTokens(queries: string[]): Promise<TokenExtractionResult[]> {
  const results: TokenExtractionResult[] = [];
  
  // Process in batches for efficiency
  const batchSize = 10;
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(query => extractTicker(query))
    );
    results.push(...batchResults);
  }
  
  return results;
}
```
