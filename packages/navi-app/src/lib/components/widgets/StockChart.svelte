<script lang="ts">
  /**
   * StockChart Widget
   *
   * Renders stock comparison charts from ```stocks code blocks.
   * Uses Chart.js for visualization.
   */
  import { onMount } from "svelte";
  import type { Chart as ChartType, TooltipItem } from "chart.js";

  interface StockQuote {
    date: string;
    close: number;
  }

  interface StockSymbol {
    symbol: string;
    name: string;
    currency?: string;
    currentPrice?: number;
    change?: number;
    changePercent?: number;
    data: StockQuote[];
  }

  interface StockData {
    title: string;
    period: string;
    symbols: StockSymbol[];
  }

  interface Props {
    content: string;
    compact?: boolean;
  }

  let { content, compact = false }: Props = $props();

  let canvasRef: HTMLCanvasElement | null = $state(null);
  let chart: ChartType | null = $state(null);
  let stockData: StockData | null = $state(null);
  let error: string | null = $state(null);
  let showNormalized = $state(true);

  // Color palette for multiple stocks
  const COLORS = [
    { line: "#3b82f6", bg: "rgba(59, 130, 246, 0.1)" },   // Blue
    { line: "#10b981", bg: "rgba(16, 185, 129, 0.1)" },   // Green
    { line: "#f59e0b", bg: "rgba(245, 158, 11, 0.1)" },   // Amber
    { line: "#ef4444", bg: "rgba(239, 68, 68, 0.1)" },    // Red
    { line: "#8b5cf6", bg: "rgba(139, 92, 246, 0.1)" },   // Purple
    { line: "#ec4899", bg: "rgba(236, 72, 153, 0.1)" },   // Pink
  ];

  function parseStockData(raw: string): StockData {
    // Try JSON first
    try {
      return JSON.parse(raw);
    } catch {
      // Fall back to YAML-like parsing
    }

    // Simple YAML-like parser for the stocks format
    const lines = raw.split("\n");
    const result: StockData = { title: "", period: "", symbols: [] };

    let currentSymbol: StockSymbol | null = null;
    let inData = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith("title:")) {
        result.title = trimmed.slice(6).trim();
      } else if (trimmed.startsWith("period:")) {
        result.period = trimmed.slice(7).trim();
      } else if (trimmed.startsWith("- symbol:")) {
        if (currentSymbol) result.symbols.push(currentSymbol);
        currentSymbol = {
          symbol: trimmed.slice(9).trim(),
          name: "",
          data: [],
        };
        inData = false;
      } else if (currentSymbol && trimmed.startsWith("name:")) {
        currentSymbol.name = trimmed.slice(5).trim();
      } else if (currentSymbol && trimmed.startsWith("data:")) {
        inData = true;
      } else if (inData && currentSymbol && trimmed.startsWith("- date:")) {
        const dateMatch = trimmed.match(/date:\s*"?([^"]+)"?/);
        const date = dateMatch?.[1] || "";
        currentSymbol.data.push({ date, close: 0 });
      } else if (inData && currentSymbol && trimmed.startsWith("close:")) {
        const close = parseFloat(trimmed.slice(6).trim());
        if (currentSymbol.data.length > 0) {
          currentSymbol.data[currentSymbol.data.length - 1].close = close;
        }
      }
    }

    if (currentSymbol) result.symbols.push(currentSymbol);
    return result;
  }

  function normalizeData(data: StockQuote[]): number[] {
    if (data.length === 0) return [];
    const basePrice = data[0].close;
    return data.map((d) => ((d.close - basePrice) / basePrice) * 100);
  }

  async function renderChart() {
    if (!canvasRef || !stockData || stockData.symbols.length === 0) return;

    // Dynamically import Chart.js
    const { Chart, registerables } = await import("chart.js");
    Chart.register(...registerables);

    // Destroy existing chart
    if (chart) {
      chart.destroy();
    }

    // Get common dates across all symbols
    const allDates = stockData.symbols[0].data.map((d) => d.date);

    // Prepare datasets
    const datasets = stockData.symbols.map((stock, i) => {
      const color = COLORS[i % COLORS.length];
      const values = showNormalized
        ? normalizeData(stock.data)
        : stock.data.map((d) => d.close);

      return {
        label: `${stock.symbol}${stock.name ? ` (${stock.name})` : ""}`,
        data: values,
        borderColor: color.line,
        backgroundColor: color.bg,
        borderWidth: 2,
        fill: stockData!.symbols.length === 1,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 4,
      };
    });

    chart = new Chart(canvasRef, {
      type: "line",
      data: {
        labels: allDates,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              usePointStyle: true,
              padding: 15,
            },
          },
          tooltip: {
            callbacks: {
              label: (context: TooltipItem<"line">) => {
                const stock = stockData!.symbols[context.datasetIndex];
                const yVal = context.parsed.y ?? 0;
                if (showNormalized) {
                  const pct = yVal.toFixed(2);
                  return `${stock.symbol}: ${Number(pct) >= 0 ? "+" : ""}${pct}%`;
                }
                return `${stock.symbol}: $${yVal.toFixed(2)}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              maxTicksLimit: 8,
              maxRotation: 0,
            },
          },
          y: {
            grid: { color: "rgba(0,0,0,0.05)" },
            ticks: {
              callback: (value: string | number) =>
                showNormalized
                  ? `${Number(value) >= 0 ? "+" : ""}${value}%`
                  : `$${value}`,
            },
          },
        },
      },
    });
  }

  onMount(() => {
    try {
      stockData = parseStockData(content);
      // Render after DOM update
      setTimeout(renderChart, 0);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to parse stock data";
    }

    return () => {
      if (chart) chart.destroy();
    };
  });

  // Re-render when normalized toggle changes
  $effect(() => {
    if (stockData && canvasRef) {
      showNormalized; // Track dependency
      renderChart();
    }
  });
</script>

<div class="stock-chart-widget" class:compact>
  {#if error}
    <div class="error">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{error}</span>
    </div>
  {:else if stockData}
    <!-- Header -->
    <div class="header">
      <div class="title-section">
        <h3 class="title">{stockData.title || "Stock Comparison"}</h3>
        {#if stockData.period}
          <span class="period">{stockData.period}</span>
        {/if}
      </div>

      {#if stockData.symbols.length > 1}
        <button
          class="toggle-btn"
          class:active={showNormalized}
          onclick={() => (showNormalized = !showNormalized)}
        >
          {showNormalized ? "% Change" : "$ Price"}
        </button>
      {/if}
    </div>

    <!-- Stock Summary Cards -->
    <div class="summary-cards">
      {#each stockData.symbols as stock, i}
        <div class="stock-card" style="--accent: {COLORS[i % COLORS.length].line}">
          <div class="stock-symbol">{stock.symbol}</div>
          {#if stock.currentPrice}
            <div class="stock-price">${stock.currentPrice.toFixed(2)}</div>
          {/if}
          {#if stock.changePercent != null}
            <div class="stock-change" class:positive={stock.changePercent >= 0} class:negative={stock.changePercent < 0}>
              {stock.changePercent >= 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Chart -->
    <div class="chart-container" style="height: {compact ? '200px' : '300px'}">
      <canvas bind:this={canvasRef}></canvas>
    </div>
  {:else}
    <div class="loading">Loading chart...</div>
  {/if}
</div>

<style>
  .stock-chart-widget {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 1rem;
    margin: 0.5rem 0;
  }

  .stock-chart-widget.compact {
    padding: 0.75rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .title-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .title {
    font-size: 1rem;
    font-weight: 600;
    color: #111827;
    margin: 0;
  }

  .period {
    font-size: 0.75rem;
    color: #6b7280;
    background: #f3f4f6;
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
  }

  .toggle-btn {
    font-size: 0.75rem;
    padding: 0.375rem 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    background: white;
    color: #374151;
    cursor: pointer;
    transition: all 0.15s;
  }

  .toggle-btn:hover {
    background: #f9fafb;
  }

  .toggle-btn.active {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;
  }

  .summary-cards {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .stock-card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #f9fafb;
    border-radius: 0.5rem;
    border-left: 3px solid var(--accent);
  }

  .stock-symbol {
    font-weight: 600;
    font-size: 0.875rem;
    color: #111827;
  }

  .stock-price {
    font-size: 0.875rem;
    color: #374151;
  }

  .stock-change {
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
  }

  .stock-change.positive {
    background: #d1fae5;
    color: #065f46;
  }

  .stock-change.negative {
    background: #fee2e2;
    color: #991b1b;
  }

  .chart-container {
    position: relative;
    width: 100%;
  }

  .error {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 0.5rem;
    color: #991b1b;
    font-size: 0.875rem;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: #6b7280;
    font-size: 0.875rem;
  }
</style>
