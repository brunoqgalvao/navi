#!/usr/bin/env bun
/**
 * Stock Data Fetcher
 *
 * Fetches historical stock data from Yahoo Finance.
 * Usage: bun run fetch-stocks.ts AAPL MSFT --period 6mo
 */

interface StockQuote {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StockData {
  symbol: string;
  name: string;
  currency: string;
  data: StockQuote[];
  currentPrice?: number;
  change?: number;
  changePercent?: number;
}

type Period = "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y" | "max";

const PERIOD_TO_RANGE: Record<Period, { range: string; interval: string }> = {
  "1d": { range: "1d", interval: "5m" },
  "5d": { range: "5d", interval: "15m" },
  "1mo": { range: "1mo", interval: "1d" },
  "3mo": { range: "3mo", interval: "1d" },
  "6mo": { range: "6mo", interval: "1d" },
  "1y": { range: "1y", interval: "1d" },
  "2y": { range: "2y", interval: "1wk" },
  "5y": { range: "5y", interval: "1wk" },
  "max": { range: "max", interval: "1mo" },
};

async function fetchStockData(symbol: string, period: Period): Promise<StockData> {
  const { range, interval } = PERIOD_TO_RANGE[period];

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${symbol}: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  const result = json.chart?.result?.[0];

  if (!result) {
    throw new Error(`No data found for symbol: ${symbol}`);
  }

  const meta = result.meta;
  const timestamps = result.timestamp || [];
  const quotes = result.indicators?.quote?.[0] || {};
  const adjClose = result.indicators?.adjclose?.[0]?.adjclose;

  const data: StockQuote[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const close = adjClose?.[i] ?? quotes.close?.[i];
    if (close != null && !isNaN(close)) {
      data.push({
        date: new Date(timestamps[i] * 1000).toISOString().split("T")[0],
        open: Number((quotes.open?.[i] ?? 0).toFixed(2)),
        high: Number((quotes.high?.[i] ?? 0).toFixed(2)),
        low: Number((quotes.low?.[i] ?? 0).toFixed(2)),
        close: Number(close.toFixed(2)),
        volume: quotes.volume?.[i] ?? 0,
      });
    }
  }

  // Calculate change
  const currentPrice = meta.regularMarketPrice;
  const previousClose = meta.chartPreviousClose || meta.previousClose;
  const change = currentPrice - previousClose;
  const changePercent = (change / previousClose) * 100;

  return {
    symbol: meta.symbol,
    name: meta.longName || meta.shortName || symbol,
    currency: meta.currency || "USD",
    currentPrice: Number(currentPrice.toFixed(2)),
    change: Number(change.toFixed(2)),
    changePercent: Number(changePercent.toFixed(2)),
    data,
  };
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let period: Period = "6mo";
  const symbols: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--period" || args[i] === "-p") {
      period = (args[++i] as Period) || "6mo";
    } else if (!args[i].startsWith("-")) {
      symbols.push(args[i].toUpperCase());
    }
  }

  if (symbols.length === 0) {
    console.error("Usage: bun run fetch-stocks.ts SYMBOL1 SYMBOL2 ... --period 6mo");
    console.error("Periods: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, max");
    process.exit(1);
  }

  try {
    const results = await Promise.all(
      symbols.map((symbol) => fetchStockData(symbol, period))
    );

    // Output as YAML-like format for the stocks code block
    const output = {
      title: symbols.length > 1
        ? `${symbols.join(" vs ")} - ${period} Comparison`
        : `${symbols[0]} - ${period}`,
      period,
      fetchedAt: new Date().toISOString(),
      symbols: results.map((stock) => ({
        symbol: stock.symbol,
        name: stock.name,
        currency: stock.currency,
        currentPrice: stock.currentPrice,
        change: stock.change,
        changePercent: stock.changePercent,
        dataPoints: stock.data.length,
        data: stock.data,
      })),
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    console.error("Error fetching stock data:", error);
    process.exit(1);
  }
}

main();
