# Market Data Integration

## CoinGecko API Integration

The system integrates with CoinGecko's API to provide real-time and historical market data for comprehensive analysis.

```typescript
interface PriceDataPoint {
  timestamp: number;
  price: number;
  volume: number;
  market_cap: number;
}

async getPriceHistory(symbol: string, days: number): Promise<PriceHistoryResult> {
  // Check cache first
  const cached = getCachedPriceHistory(symbol, days);
  if (cached && !isExpired(cached)) {
    return { success: true, symbol, data: cached.data };
  }
  
  // Fetch from CoinGecko
  const cgId = getTokenCoinGeckoId(symbol);
  const response = await fetch(
    `https://api.coingecko.com/api/v3/coins/${cgId}/market_chart?vs_currency=usd&days=${days}`
  );
  
  // Process and cache data
  const data = await response.json();
  const processed = processMarketData(data);
  setCachedPriceHistory(symbol, days, processed);
  
  return { success: true, symbol, data: processed };
}
```

### Market Data Features
- **Real-Time Prices**: Current market prices with minimal latency
- **Historical Analysis**: 7-day price history for trend analysis
- **Volume Data**: Trading volume for liquidity assessment
- **Market Cap**: Token valuation metrics
- **Intelligent Caching**: 5-minute cache duration for optimal performance

## Performance Optimization

### Advanced Caching System
```typescript
// Advanced caching system
class MarketDataCache {
  private cache: Map<string, CachedData> = new Map();
  private backgroundQueue: Set<string> = new Set();
  
  async warmEssentialCache(): Promise<void> {
    const priorityTokens = ["TON", "WBTC", "WETH", "USDT"];
    
    // Parallel data fetching
    const promises = priorityTokens.map(token => 
      this.fetchAndCache(token, 7)
    );
    
    await Promise.allSettled(promises);
  }
  
  async backgroundRefresh(): Promise<void> {
    // Refresh stale data in background
    for (const symbol of this.backgroundQueue) {
      setTimeout(() => this.refreshToken(symbol), 
        Math.random() * 10000 // Stagger requests
      );
    }
  }
}
```

### Cache Management
```typescript
interface CachedData {
  data: PriceDataPoint[];
  timestamp: number;
  ttl: number;
}

function isExpired(cached: CachedData): boolean {
  return Date.now() - cached.timestamp > cached.ttl;
}

function getCachedPriceHistory(symbol: string, days: number): CachedData | null {
  const key = `${symbol}_${days}`;
  const cached = cache.get(key);
  
  if (cached && !isExpired(cached)) {
    return cached;
  }
  
  return null;
}
```

## Data Processing

### Market Data Processing
```typescript
function processMarketData(rawData: any): PriceDataPoint[] {
  const { prices, total_volumes, market_caps } = rawData;
  
  return prices.map((price: [number, number], index: number) => ({
    timestamp: price[0],
    price: price[1],
    volume: total_volumes[index]?.[1] || 0,
    market_cap: market_caps[index]?.[1] || 0
  }));
}
```

### Technical Indicators
```typescript
function calculateTechnicalIndicators(data: PriceDataPoint[]) {
  return {
    sma7: calculateSMA(data, 7),
    sma14: calculateSMA(data, 14),
    volatility: calculateVolatility(data),
    momentum: calculateMomentum(data),
    rsi: calculateRSI(data),
    support: findSupportLevel(data),
    resistance: findResistanceLevel(data)
  };
}

function calculateSMA(data: PriceDataPoint[], period: number): number {
  const recent = data.slice(-period);
  const sum = recent.reduce((acc, point) => acc + point.price, 0);
  return sum / period;
}
```

## API Management

### Rate Limiting
```typescript
class CoinGeckoAPI {
  private requestCount = 0;
  private lastReset = Date.now();
  private readonly RATE_LIMIT = 50; // requests per minute
  private readonly RESET_INTERVAL = 60000; // 1 minute
  
  async makeRequest(url: string): Promise<any> {
    await this.checkRateLimit();
    
    const response = await fetch(url);
    this.requestCount++;
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    
    return response.json();
  }
  
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Reset counter if interval has passed
    if (now - this.lastReset > this.RESET_INTERVAL) {
      this.requestCount = 0;
      this.lastReset = now;
    }
    
    // Wait if rate limit exceeded
    if (this.requestCount >= this.RATE_LIMIT) {
      const waitTime = this.RESET_INTERVAL - (now - this.lastReset);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.lastReset = Date.now();
    }
  }
}
```

### Error Handling
```typescript
async function fetchWithRetry(url: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      
      if (response.ok) {
        return response.json();
      }
      
      if (response.status === 429) {
        // Rate limited, wait and retry
        const waitTime = Math.pow(2, i) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      throw new Error(`HTTP ${response.status}`);
      
    } catch (error) {
      if (i === retries - 1) throw error;
      
      // Wait before retry
      const waitTime = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}
```

## Data Quality Assurance

### Data Validation
```typescript
function validateMarketData(data: any): boolean {
  if (!data || !Array.isArray(data)) return false;
  
  for (const point of data) {
    if (!point.timestamp || !point.price) return false;
    if (point.price <= 0) return false;
    if (point.timestamp <= 0) return false;
  }
  
  return true;
}
```

### Data Cleaning
```typescript
function cleanMarketData(data: PriceDataPoint[]): PriceDataPoint[] {
  return data
    .filter(point => point.price > 0 && point.timestamp > 0)
    .sort((a, b) => a.timestamp - b.timestamp)
    .filter((point, index, array) => {
      // Remove duplicates
      if (index > 0 && point.timestamp === array[index - 1].timestamp) {
        return false;
      }
      return true;
    });
}
```

## Real-Time Updates

### WebSocket Integration
```typescript
class RealTimeDataManager {
  private ws: WebSocket | null = null;
  private subscribers = new Map<string, Function[]>();
  
  connect(): void {
    this.ws = new WebSocket('wss://api.coingecko.com/ws');
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleUpdate(data);
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.reconnect();
    };
  }
  
  subscribe(symbol: string, callback: Function): void {
    if (!this.subscribers.has(symbol)) {
      this.subscribers.set(symbol, []);
    }
    this.subscribers.get(symbol)!.push(callback);
  }
  
  private handleUpdate(data: any): void {
    const { symbol, price } = data;
    const callbacks = this.subscribers.get(symbol) || [];
    
    callbacks.forEach(callback => callback(price));
  }
}
```
