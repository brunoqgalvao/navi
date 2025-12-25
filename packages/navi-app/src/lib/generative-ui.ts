/**
 * Utilities for processing generative UI blocks in markdown content
 */

export interface GenerativeUIBlock {
  id: string;
  html: string;
  originalText: string;
}

/**
 * Extracts generative UI blocks from markdown content and replaces them with placeholders
 */
export function extractGenerativeUIBlocks(content: string): {
  processedContent: string;
  blocks: GenerativeUIBlock[];
} {
  const blocks: GenerativeUIBlock[] = [];
  
  // Match ```genui code blocks
  const genuiPattern = /```genui\n([\s\S]*?)```/g;
  
  const processedContent = content.replace(genuiPattern, (match, htmlContent) => {
    const id = `genui-${Math.random().toString(36).substr(2, 9)}`;
    
    blocks.push({
      id,
      html: htmlContent.trim(),
      originalText: match
    });
    
    // Replace with a placeholder that will be processed after markdown rendering
    return `<div data-genui-placeholder="${id}"></div>`;
  });
  
  return {
    processedContent,
    blocks
  };
}

/**
 * Replaces genui placeholders in rendered HTML with actual generative UI components
 */
export function injectGenerativeUIBlocks(html: string, blocks: GenerativeUIBlock[]): string {
  let result = html;
  
  for (const block of blocks) {
    const placeholder = `<div data-genui-placeholder="${block.id}"></div>`;
    const replacement = `<div class="generative-ui-block" data-genui-id="${block.id}" data-genui-html="${encodeURIComponent(block.html)}"></div>`;
    
    result = result.replace(placeholder, replacement);
  }
  
  return result;
}

/**
 * Process markdown content to extract and prepare generative UI blocks
 */
export function processGenerativeUIContent(content: string): {
  processedContent: string;
  blocks: GenerativeUIBlock[];
} {
  return extractGenerativeUIBlocks(content);
}