---
name: stock-compare
description: Compare stock prices and performance. Use when the user asks to compare stocks, analyze stock performance, show stock charts, check stock prices, or visualize market data.
tools: Bash, WebFetch
---

# Stock Price Comparison Skill

Compare and visualize stock prices using Yahoo Finance data.

## Usage

When the user asks to compare stocks:

1. Fetch stock data using the provided script
2. Output results in a `stocks` code block for chart rendering

## Fetching Stock Data

Use the stock fetcher script:

```bash
bun run /path/to/project/.claude/skills/stock-compare/fetch-stocks.ts AAPL MSFT --period 6mo
```

**Periods:** `1d`, `5d`, `1mo`, `3mo`, `6mo`, `1y`, `2y`, `5y`, `max`

## Output Format

Always output stock data in this exact format for the UI to render a chart:

```stocks
title: AAPL vs MSFT - 6 Month Comparison
period: 6mo
symbols:
  - symbol: AAPL
    name: Apple Inc.
    data:
      - date: "2024-01-02"
        close: 185.64
      - date: "2024-01-03"
        close: 184.25
  - symbol: MSFT
    name: Microsoft Corporation
    data:
      - date: "2024-01-02"
        close: 374.58
      - date: "2024-01-03"
        close: 370.87
```

The UI will render this as an interactive comparison chart.

## Examples

**User:** "Compare Apple and Google stock over the last year"

**Response:**
1. Run: `bun run .claude/skills/stock-compare/fetch-stocks.ts AAPL GOOGL --period 1y`
2. Format the output as a `stocks` code block
3. Add brief analysis of the comparison

**User:** "How has Tesla performed vs the S&P 500?"

**Response:**
1. Run: `bun run .claude/skills/stock-compare/fetch-stocks.ts TSLA SPY --period 1y`
2. SPY is the S&P 500 ETF - use it for index comparisons
3. Format and analyze

## Common Symbols

- **Tech:** AAPL, MSFT, GOOGL, AMZN, META, NVDA, TSLA
- **Indices:** SPY (S&P 500), QQQ (Nasdaq), DIA (Dow Jones)
- **Finance:** JPM, BAC, GS, V, MA
- **Healthcare:** JNJ, UNH, PFE, ABBV

## Notes

- Data comes from Yahoo Finance (free, no API key needed)
- Prices are adjusted for splits/dividends
- Weekend/holiday gaps are normal
- For crypto, use symbols like BTC-USD, ETH-USD
