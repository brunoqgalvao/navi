import { writable, get } from "svelte/store";
import type { ContentBlock } from "../claude";

export interface AgentUpdate {
  id: string;
  sessionId: string;
  timestamp: number;
  parentToolUseId: string | null;
  type: "user" | "assistant" | "system";
  content: ContentBlock[] | string;
}

export interface StreamingState {
  isStreaming: boolean;
  currentBlocks: ContentBlock[];
  partialText: string;
  partialThinking: string;
  partialJson: string;
}

interface ThrottleState {
  pendingText: string;
  pendingThinking: string;
  pendingJson: string;
  timer: ReturnType<typeof setTimeout> | null;
  lastUpdate: number;
}

const THROTTLE_MS = 50;

function createChatStore() {
  const updates = writable<Map<string, AgentUpdate[]>>(new Map());
  const streaming = writable<Map<string, StreamingState>>(new Map());
  const throttleStates = new Map<string, ThrottleState>();

  function getThrottleState(sessionId: string): ThrottleState {
    if (!throttleStates.has(sessionId)) {
      throttleStates.set(sessionId, {
        pendingText: "",
        pendingThinking: "",
        pendingJson: "",
        timer: null,
        lastUpdate: 0,
      });
    }
    return throttleStates.get(sessionId)!;
  }

  function flushThrottledUpdates(sessionId: string): void {
    const throttle = throttleStates.get(sessionId);
    if (!throttle) return;
    
    const { pendingText, pendingThinking, pendingJson } = throttle;
    if (!pendingText && !pendingThinking && !pendingJson) return;
    
    streaming.update(map => {
      const state = map.get(sessionId);
      if (state) {
        map.set(sessionId, {
          ...state,
          partialText: state.partialText + pendingText,
          partialThinking: state.partialThinking + pendingThinking,
          partialJson: state.partialJson + pendingJson,
        });
      }
      return new Map(map);
    });
    
    throttle.pendingText = "";
    throttle.pendingThinking = "";
    throttle.pendingJson = "";
    throttle.lastUpdate = Date.now();
    throttle.timer = null;
  }

  function addUserMessage(sessionId: string, content: string): string {
    const id = crypto.randomUUID();
    const update: AgentUpdate = {
      id,
      sessionId,
      timestamp: Date.now(),
      parentToolUseId: null,
      type: "user",
      content,
    };
    
    updates.update(map => {
      const list = map.get(sessionId) || [];
      map.set(sessionId, [...list, update]);
      return new Map(map);
    });
    
    return id;
  }

  function addSystemMessage(sessionId: string, content: string): string {
    const id = crypto.randomUUID();
    const update: AgentUpdate = {
      id,
      sessionId,
      timestamp: Date.now(),
      parentToolUseId: null,
      type: "system",
      content,
    };
    
    updates.update(map => {
      const list = map.get(sessionId) || [];
      map.set(sessionId, [...list, update]);
      return new Map(map);
    });
    
    return id;
  }

  function addAssistantMessage(sessionId: string, content: ContentBlock[], parentToolUseId: string | null): string {
    const id = crypto.randomUUID();
    const update: AgentUpdate = {
      id,
      sessionId,
      timestamp: Date.now(),
      parentToolUseId,
      type: "assistant",
      content,
    };
    
    updates.update(map => {
      const list = map.get(sessionId) || [];
      map.set(sessionId, [...list, update]);
      return new Map(map);
    });
    
    streaming.update(map => {
      map.delete(sessionId);
      return new Map(map);
    });
    
    return id;
  }

  function startStreaming(sessionId: string): void {
    streaming.update(map => {
      map.set(sessionId, {
        isStreaming: true,
        currentBlocks: [],
        partialText: "",
        partialThinking: "",
        partialJson: "",
      });
      return new Map(map);
    });
  }

  function addStreamingBlock(sessionId: string, block: ContentBlock): void {
    streaming.update(map => {
      const state = map.get(sessionId);
      if (state) {
        map.set(sessionId, {
          ...state,
          currentBlocks: [...state.currentBlocks, block],
          partialText: "",
          partialThinking: "",
          partialJson: "",
        });
      }
      return new Map(map);
    });
  }

  function appendStreamingDelta(sessionId: string, delta: { text?: string; thinking?: string; partial_json?: string }): void {
    const throttle = getThrottleState(sessionId);
    
    if (delta.text) throttle.pendingText += delta.text;
    if (delta.thinking) throttle.pendingThinking += delta.thinking;
    if (delta.partial_json) throttle.pendingJson += delta.partial_json;
    
    const now = Date.now();
    const timeSinceLastUpdate = now - throttle.lastUpdate;
    
    if (timeSinceLastUpdate >= THROTTLE_MS) {
      flushThrottledUpdates(sessionId);
    } else if (!throttle.timer) {
      throttle.timer = setTimeout(() => {
        flushThrottledUpdates(sessionId);
      }, THROTTLE_MS - timeSinceLastUpdate);
    }
  }

  function finishStreamingBlock(sessionId: string): void {
    flushThrottledUpdates(sessionId);
    
    streaming.update(map => {
      const state = map.get(sessionId);
      if (state && state.currentBlocks.length > 0) {
        const blocks = [...state.currentBlocks];
        const lastBlock = blocks[blocks.length - 1];
        
        if (lastBlock.type === "text" && state.partialText) {
          blocks[blocks.length - 1] = { ...lastBlock, text: state.partialText };
        } else if (lastBlock.type === "thinking" && state.partialThinking) {
          blocks[blocks.length - 1] = { ...lastBlock, thinking: state.partialThinking };
        } else if (lastBlock.type === "tool_use" && state.partialJson) {
          try {
            const input = JSON.parse(state.partialJson);
            blocks[blocks.length - 1] = { ...lastBlock, input };
          } catch {}
        }
        
        map.set(sessionId, {
          ...state,
          currentBlocks: blocks,
          partialText: "",
          partialThinking: "",
          partialJson: "",
        });
      }
      return new Map(map);
    });
  }

  function stopStreaming(sessionId: string): void {
    flushThrottledUpdates(sessionId);
    const throttle = throttleStates.get(sessionId);
    if (throttle?.timer) {
      clearTimeout(throttle.timer);
    }
    throttleStates.delete(sessionId);
    
    streaming.update(map => {
      const state = map.get(sessionId);
      if (state) {
        map.set(sessionId, { ...state, isStreaming: false });
      }
      return new Map(map);
    });
  }

  function getUpdates(sessionId: string): AgentUpdate[] {
    return get(updates).get(sessionId) || [];
  }

  function getStreamingState(sessionId: string): StreamingState | undefined {
    return get(streaming).get(sessionId);
  }

  function clearSession(sessionId: string): void {
    updates.update(map => {
      map.delete(sessionId);
      return new Map(map);
    });
    streaming.update(map => {
      map.delete(sessionId);
      return new Map(map);
    });
  }

  return {
    subscribe: updates.subscribe,
    streaming,
    addUserMessage,
    addSystemMessage,
    addAssistantMessage,
    startStreaming,
    addStreamingBlock,
    appendStreamingDelta,
    finishStreamingBlock,
    stopStreaming,
    getUpdates,
    getStreamingState,
    clearSession,
  };
}

export const chatStore = createChatStore();
