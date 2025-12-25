export type StreamCaptureState = {
  blocks: any[];
  partialText: string;
  partialThinking: string;
  partialJson: string;
  lastCompleteBlocks: any[] | null;
};

const streamCaptures = new Map<string, StreamCaptureState>();

export function ensureStreamState(sessionId: string): StreamCaptureState {
  const existing = streamCaptures.get(sessionId);
  if (existing) return existing;
  const created: StreamCaptureState = {
    blocks: [],
    partialText: "",
    partialThinking: "",
    partialJson: "",
    lastCompleteBlocks: null,
  };
  streamCaptures.set(sessionId, created);
  return created;
}

function finalizeStreamBlock(state: StreamCaptureState) {
  const lastBlock = state.blocks[state.blocks.length - 1];
  if (!lastBlock) return;

  if (lastBlock.type === "text" && state.partialText) {
    lastBlock.text = state.partialText;
  } else if (lastBlock.type === "thinking" && state.partialThinking) {
    lastBlock.thinking = state.partialThinking;
  } else if (lastBlock.type === "tool_use" && state.partialJson) {
    try {
      lastBlock.input = JSON.parse(state.partialJson);
    } catch {}
  }

  state.partialText = "";
  state.partialThinking = "";
  state.partialJson = "";
}

export function captureStreamEvent(sessionId: string, event: any) {
  const state = ensureStreamState(sessionId);

  switch (event?.type) {
    case "message_start":
      state.blocks = [];
      state.partialText = "";
      state.partialThinking = "";
      state.partialJson = "";
      state.lastCompleteBlocks = null;
      break;
    case "content_block_start":
      if (event.content_block) {
        state.blocks.push(event.content_block);
        state.partialText = "";
        state.partialThinking = "";
        state.partialJson = "";
      }
      break;
    case "content_block_delta":
      if (event.delta?.text) state.partialText += event.delta.text;
      if (event.delta?.thinking) state.partialThinking += event.delta.thinking;
      if (event.delta?.partial_json) state.partialJson += event.delta.partial_json;
      break;
    case "content_block_stop":
      finalizeStreamBlock(state);
      break;
    case "message_delta":
      finalizeStreamBlock(state);
      break;
    case "message_stop":
      finalizeStreamBlock(state);
      state.lastCompleteBlocks = state.blocks.length ? [...state.blocks] : null;
      state.blocks = [];
      break;
  }
}

export function mergeThinkingBlocks(sessionId: string, assistantContent: any[]): any[] {
  const state = streamCaptures.get(sessionId);
  const streamBlocks = state?.lastCompleteBlocks;
  state?.lastCompleteBlocks && (state.lastCompleteBlocks = null);

  if (!streamBlocks || streamBlocks.length === 0) return assistantContent;
  if (assistantContent.some((b) => b?.type === "thinking")) return assistantContent;
  if (!streamBlocks.some((b) => b?.type === "thinking")) return assistantContent;

  const nonThinking = streamBlocks.filter((b) => b?.type !== "thinking");
  if (nonThinking.length !== assistantContent.length) return assistantContent;

  const merged: any[] = [];
  let assistantIndex = 0;
  for (const block of streamBlocks) {
    if (block?.type === "thinking") {
      merged.push(block);
      continue;
    }
    const next = assistantContent[assistantIndex];
    if (!next || next.type !== block?.type) {
      return assistantContent;
    }
    merged.push(next);
    assistantIndex += 1;
  }

  return merged;
}

export function deleteStreamCapture(sessionId: string) {
  streamCaptures.delete(sessionId);
}

export function getStreamCaptures() {
  return streamCaptures;
}
