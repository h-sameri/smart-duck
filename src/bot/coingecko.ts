import { tokens } from "./tokens";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

interface TimeSeriesValue {
  timestamp: number;
  value: number;
}

interface PriceDataPoint {
  timestamp: number;
  price: number;
  volume: number;
  market_cap: number;
}

interface PriceHistoryResult {
  success: boolean;
  symbol?: string;
  data?: PriceDataPoint[];
  error?: string;
}

interface CachedPriceHistory {
  symbol: string;
  days: number;
  data: PriceDataPoint[];
  timestamp: number;
}

interface PriceCache {
  [key: string]: CachedPriceHistory;
}

const CACHE_DURATION = 5 * 60 * 1000;
const CACHE_DIR = join(process.cwd(), "cache");
const CACHE_FILE = join(CACHE_DIR, "price_history_cache.json");
const MAX_CACHE_SIZE = 10;
const BACKGROUND_FETCH_DELAY = 2000;
const API_RATE_LIMIT_DELAY = 1000;

const PRIORITY_TOKENS = ["TON", "WBTC", "WETH", "USDT", "USDC"];

const backgroundFetchQueue = new Set<string>();

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function loadCache(): PriceCache {
  try {
    ensureCacheDir();
    if (existsSync(CACHE_FILE)) {
      const cacheData = readFileSync(CACHE_FILE, "utf-8");
      return JSON.parse(cacheData);
    }
  } catch (error) {
    console.warn("Failed to load cache:", error);
  }
  return {};
}

function saveCache(cache: PriceCache): void {
  try {
    ensureCacheDir();
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.warn("Failed to save cache:", error);
  }
}

function getCacheKey(ticker: string, days: number): string {
  return `${ticker}_${days}d`;
}

function isCacheValid(cachedItem: CachedPriceHistory): boolean {
  return Date.now() - cachedItem.timestamp < CACHE_DURATION;
}

function cleanupExpiredCache(): void {
  const cache = loadCache();
  const cleanedCache: PriceCache = {};
  let removedCount = 0;

  for (const [key, item] of Object.entries(cache)) {
    if (isCacheValid(item)) {
      cleanedCache[key] = item;
    } else {
      removedCount++;
    }
  }

  if (removedCount > 0) {
    saveCache(cleanedCache);
    console.log(`🧹 Cleaned up ${removedCount} expired cache entries`);
  }
}

function limitCacheSize(): void {
  const cache = loadCache();
  const entries = Object.entries(cache);

  if (entries.length <= MAX_CACHE_SIZE) {
    return;
  }

  // Sort by timestamp (keep newest entries)
  entries.sort((a, b) => b[1].timestamp - a[1].timestamp);

  const limitedCache: PriceCache = {};
  const keepCount = Math.min(MAX_CACHE_SIZE, entries.length);

  for (let i = 0; i < keepCount; i++) {
    const [key, value] = entries[i];
    limitedCache[key] = value;
  }

  saveCache(limitedCache);
  console.log(
    `📦 Limited cache to ${keepCount} entries (removed ${
      entries.length - keepCount
    })`
  );
}

export async function getPriceHistory(
  ticker: string,
  days: number = 7,
  triggerBackgroundFetch: boolean = true
): Promise<PriceHistoryResult> {
  try {
    // Clean up expired cache entries first
    cleanupExpiredCache();

    const cacheKey = getCacheKey(ticker, days);
    const cache = loadCache();

    // Check if we have valid cached data
    if (cache[cacheKey] && isCacheValid(cache[cacheKey])) {
      console.log(`📦 Using cached data for ${ticker} (${days}d)`);

      // Trigger background refresh for popular tokens (non-blocking)
      if (triggerBackgroundFetch) {
        triggerSmartBackgroundFetch(ticker);
      }

      return {
        success: true,
        symbol: ticker,
        data: cache[cacheKey].data,
      };
    }

    const cg_id = tokens.find((token) => token.symbol === ticker)?.cg_id;

    if (!cg_id) {
      return {
        success: false,
        error: `CoinGecko ID not found for token: ${ticker}`,
      };
    }

    if (days > 15) {
      return {
        success: false,
        error: "Price history should only be fetched for up to 15 days.",
      };
    }

    console.log(
      `🌐 Fetching fresh data for ${ticker} (${days}d) from CoinGecko`
    );

    // Add delay to respect rate limits
    await new Promise((resolve) => setTimeout(resolve, API_RATE_LIMIT_DELAY));

    const raw = await fetch(
      `https://api.coingecko.com/api/v3/coins/${cg_id}/market_chart?vs_currency=usd&days=${days}`
    );

    if (!raw.ok) {
      return {
        success: false,
        error: `Failed to fetch data from CoinGecko: ${raw.status} ${raw.statusText}`,
      };
    }

    const res = await raw.json();

    // Combine all the data points into a single array
    const data: PriceDataPoint[] = res.prices.map(
      (price: [number, number], index: number) => ({
        timestamp: price[0],
        price: price[1],
        volume: res.total_volumes[index] ? res.total_volumes[index][1] : 0,
        market_cap: res.market_caps[index] ? res.market_caps[index][1] : 0,
      })
    );

    // Cache the result
    cache[cacheKey] = {
      symbol: ticker,
      days,
      data,
      timestamp: Date.now(),
    };
    saveCache(cache);

    // Limit cache size after adding new entry
    limitCacheSize();

    // Trigger background refresh for related tokens (non-blocking)
    if (triggerBackgroundFetch) {
      triggerSmartBackgroundFetch(ticker);
    }

    return {
      success: true,
      symbol: ticker,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: `Error fetching price history: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}

export function getAllCachedPriceHistories(): {
  [symbol: string]: PriceDataPoint[];
} {
  const cache = loadCache();
  const result: { [symbol: string]: PriceDataPoint[] } = {};

  for (const [key, cachedItem] of Object.entries(cache)) {
    if (isCacheValid(cachedItem)) {
      result[cachedItem.symbol] = cachedItem.data;
    }
  }

  return result;
}

async function triggerSmartBackgroundFetch(
  requestedToken: string
): Promise<void> {
  setTimeout(async () => {
    try {
      const tokensToFetch = getTokensToCache(requestedToken);
      console.log(`🔄 Background caching for: ${tokensToFetch.join(", ")}`);

      for (const token of tokensToFetch) {
        if (backgroundFetchQueue.has(token)) {
          continue;
        }

        backgroundFetchQueue.add(token);

        try {
          await getPriceHistory(token, 7, false);
          await new Promise((resolve) =>
            setTimeout(resolve, BACKGROUND_FETCH_DELAY)
          );
        } catch (error) {
          console.warn(`⚠️ Background fetch failed for ${token}:`, error);
        } finally {
          backgroundFetchQueue.delete(token);
        }
      }
    } catch (error) {
      console.warn("⚠️ Background fetch error:", error);
    }
  }, 100); // Small delay to not interfere with main request
}

// Determine which tokens to cache based on the requested token
function getTokensToCache(requestedToken: string): string[] {
  const cache = loadCache();
  const tokensToFetch: string[] = [];

  // Always prioritize priority tokens that aren't cached or are near expiration
  for (const token of PRIORITY_TOKENS) {
    const cacheKey = getCacheKey(token, 7);
    if (!cache[cacheKey] || !isCacheValid(cache[cacheKey])) {
      tokensToFetch.push(token);
    }
  }

  // Add the requested token if not in priority list
  if (!PRIORITY_TOKENS.includes(requestedToken)) {
    const cacheKey = getCacheKey(requestedToken, 7);
    if (!cache[cacheKey] || !isCacheValid(cache[cacheKey])) {
      tokensToFetch.unshift(requestedToken); // Add to front
    }
  }

  // Limit to 3-5 tokens max
  return tokensToFetch.slice(0, 5);
}

// Function to manually warm cache with essential tokens
export async function warmEssentialCache(): Promise<{
  success: boolean;
  cached: string[];
  failed: string[];
}> {
  const cached: string[] = [];
  const failed: string[] = [];

  console.log(
    `🔥 Warming cache with essential tokens: ${PRIORITY_TOKENS.join(", ")}`
  );

  for (const token of PRIORITY_TOKENS) {
    try {
      const result = await getPriceHistory(token, 7, false);
      if (result.success) {
        cached.push(token);
      } else {
        failed.push(token);
      }
      // Add delay between requests
      await new Promise((resolve) =>
        setTimeout(resolve, API_RATE_LIMIT_DELAY * 2)
      );
    } catch (error) {
      failed.push(token);
    }
  }

  console.log(
    `✅ Cache warming complete: ${cached.length} cached, ${failed.length} failed`
  );

  return {
    success: true,
    cached,
    failed,
  };
}

// Replace the old aggressive preloading function with a smarter one
export async function preloadAllTokenPriceHistories(days: number = 7): Promise<{
  success: boolean;
  loaded: string[];
  failed: string[];
}> {
  console.log(`⚠️ Note: Using smart caching instead of preloading all tokens`);
  const result = await warmEssentialCache();
  return {
    success: result.success,
    loaded: result.cached,
    failed: result.failed,
  };
}

// Function to get market summary from cached data
export function getMarketSummary(): {
  totalTokens: number;
  cachedTokens: number;
  summary: Array<{
    symbol: string;
    currentPrice: number;
    priceChange24h: number;
    lastUpdate: string;
  }>;
} {
  const cache = loadCache();
  const summary: Array<{
    symbol: string;
    currentPrice: number;
    priceChange24h: number;
    lastUpdate: string;
  }> = [];
  let cachedTokens = 0;

  for (const [key, cachedItem] of Object.entries(cache)) {
    if (isCacheValid(cachedItem) && cachedItem.data.length > 0) {
      cachedTokens++;
      const latestData = cachedItem.data[cachedItem.data.length - 1];
      const previousData =
        cachedItem.data.length > 1
          ? cachedItem.data[cachedItem.data.length - 2]
          : latestData;

      const priceChange24h = latestData.price - previousData.price;

      summary.push({
        symbol: cachedItem.symbol,
        currentPrice: latestData.price,
        priceChange24h,
        lastUpdate: new Date(cachedItem.timestamp).toISOString(),
      });
    }
  }

  return {
    totalTokens: tokens.length,
    cachedTokens,
    summary: summary.sort((a, b) => b.currentPrice - a.currentPrice),
  };
}
