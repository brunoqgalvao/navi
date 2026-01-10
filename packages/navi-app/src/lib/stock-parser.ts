/**
 * Stock Code Block Parser
 *
 * Parses ```stocks code blocks from markdown content.
 * Returns the extracted stock data and processed content with placeholders.
 */

export interface StockBlock {
  id: string;
  content: string;
}

export interface StockParserResult {
  processedContent: string;
  items: StockBlock[];
}

let blockCounter = 0;

/**
 * Parse stock code blocks from content
 * Replaces ```stocks blocks with placeholders and extracts data
 */
export function parseStockContent(content: string): StockParserResult {
  const items: StockBlock[] = [];

  if (!content) {
    return { processedContent: content, items };
  }

  // Match ```stocks ... ``` blocks
  const processedContent = content.replace(
    /```stocks\n([\s\S]*?)\n```/g,
    (_, stockContent: string) => {
      const id = `stock-${Date.now()}-${++blockCounter}`;
      items.push({
        id,
        content: stockContent.trim(),
      });
      return `<div class="stock-block-placeholder" data-stock-id="${id}"></div>`;
    }
  );

  return { processedContent, items };
}
