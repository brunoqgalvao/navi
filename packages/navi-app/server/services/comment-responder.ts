// Comment Responder - lightweight AI responses for inline comments
// @experimental

import Anthropic from "@anthropic-ai/sdk";
import { messageComments } from "../db";

const COMMENT_SYSTEM_PROMPT = `You are answering a quick clarifying question about a specific part of a conversation.

RULES:
- Be extremely concise (1-3 sentences max unless more detail is explicitly requested)
- Answer only what was asked - no preamble, no sign-offs
- If asked for an example, provide a short one
- If the question requires context you don't have, say so briefly
- Be direct and helpful`;

interface CommentResponseRequest {
  threadId: string;
  sessionId: string;
  question: string;
  selectionText: string;
  messageContext: string;
}

interface CommentResponseResult {
  success: boolean;
  comment?: {
    id: string;
    content: string;
    created_at: number;
  };
  error?: string;
}

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

export async function generateCommentResponse(
  request: CommentResponseRequest
): Promise<CommentResponseResult> {
  try {
    const client = getAnthropicClient();

    // Build the user message with context
    const userMessage = buildUserMessage(request);

    // Use Sonnet 4.5 for quality comment responses
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 500,
      system: COMMENT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    // Extract the text response
    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      return { success: false, error: "No text response from AI" };
    }

    // Add the AI reply to the thread
    const commentId = crypto.randomUUID();
    const comment = messageComments.reply(
      commentId,
      request.threadId,
      "assistant",
      textContent.text
    );

    if (!comment) {
      return { success: false, error: "Failed to save comment reply" };
    }

    return {
      success: true,
      comment: {
        id: comment.id,
        content: comment.content,
        created_at: comment.created_at,
      },
    };
  } catch (error: any) {
    console.error("[CommentResponder] Error generating response:", error);
    return {
      success: false,
      error: error.message || "Failed to generate AI response",
    };
  }
}

function buildUserMessage(request: CommentResponseRequest): string {
  const parts: string[] = [];

  // Add the highlighted text context
  if (request.selectionText) {
    parts.push(`The user highlighted this text: "${request.selectionText}"`);
  }

  // Add surrounding message context (truncated if too long)
  if (request.messageContext) {
    const truncatedContext =
      request.messageContext.length > 2000
        ? request.messageContext.slice(0, 2000) + "..."
        : request.messageContext;
    parts.push(`\nFrom this message:\n---\n${truncatedContext}\n---`);
  }

  // Add the user's question
  parts.push(`\nUser's question: ${request.question}`);

  return parts.join("\n");
}

// Export the function for the REST API to use
export { type CommentResponseRequest, type CommentResponseResult };
