import { writable, get } from "svelte/store";
import type { ContentBlock } from "../claude";
import { STREAMING_THROTTLE_MS } from "../constants";

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

function createStreamingStore() {
  const state = writable<Map<string, StreamingState>>(new Map());
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
    
    state.update(map => {
      const s = map.get(sessionId);
      if (s) {
        map.set(sessionId, {
          ...s,
          partialText: s.partialText + pendingText,
          partialThinking: s.partialThinking + pendingThinking,
          partialJson: s.partialJson + pendingJson,
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

  function start(sessionId: string): void {
    state.update(map => {
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

  function addBlock(sessionId: string, block: ContentBlock): void {
    state.update(map => {
      const s = map.get(sessionId);
      if (s) {
        map.set(sessionId, {
          ...s,
          currentBlocks: [...s.currentBlocks, block],
          partialText: "",
          partialThinking: "",
          partialJson: "",
        });
      }
      return new Map(map);
    });
  }

  function appendDelta(sessionId: string, delta: { text?: string; thinking?: string; partial_json?: string }): void {
    const throttle = getThrottleState(sessionId);
    
    if (delta.text) throttle.pendingText += delta.text;
    if (delta.thinking) throttle.pendingThinking += delta.thinking;
    if (delta.partial_json) throttle.pendingJson += delta.partial_json;

    const now = Date.now();
    const timeSinceLastUpdate = now - throttle.lastUpdate;

    if (timeSinceLastUpdate >= STREAMING_THROTTLE_MS) {
      flushThrottledUpdates(sessionId);
    } else if (!throttle.timer) {
      throttle.timer = setTimeout(() => {
        flushThrottledUpdates(sessionId);
      }, STREAMING_THROTTLE_MS - timeSinceLastUpdate);
    }
  }

  function finishBlock(sessionId: string): void {
    flushThrottledUpdates(sessionId);
    
    state.update(map => {
      const s = map.get(sessionId);
      if (s && s.currentBlocks.length > 0) {
        const blocks = [...s.currentBlocks];
        const lastBlock = blocks[blocks.length - 1];
        
        if (lastBlock.type === "text" && s.partialText) {
          blocks[blocks.length - 1] = { ...lastBlock, text: s.partialText } as any;
        } else if (lastBlock.type === "thinking" && s.partialThinking) {
          blocks[blocks.length - 1] = { ...lastBlock, thinking: s.partialThinking } as any;
        } else if (lastBlock.type === "tool_use" && s.partialJson) {
          try {
            const input = JSON.parse(s.partialJson);
            blocks[blocks.length - 1] = { ...lastBlock, input } as any;
          } catch (e) {
            console.warn("[StreamingStore] Failed to parse partial JSON for tool_use block:", e);
          }
        }
        
        map.set(sessionId, {
          ...s,
          currentBlocks: blocks,
          partialText: "",
          partialThinking: "",
          partialJson: "",
        });
      }
      return new Map(map);
    });
  }

  function stop(sessionId: string): void {
    flushThrottledUpdates(sessionId);
    const throttle = throttleStates.get(sessionId);
    if (throttle?.timer) {
      clearTimeout(throttle.timer);
    }
    throttleStates.delete(sessionId);
    
    state.update(map => {
      map.delete(sessionId);
      return new Map(map);
    });
  }

  function get_(sessionId: string): StreamingState | undefined {
    return get(state).get(sessionId);
  }

  function isStreaming(sessionId: string): boolean {
    return get(state).has(sessionId);
  }

  /**
   * Clean up all streaming sessions and throttle states.
   * Call this when the app is being unloaded or reset.
   */
  function clearAll(): void {
    // Clear all timers and throttle states
    for (const [sessionId, throttle] of throttleStates) {
      if (throttle.timer) {
        clearTimeout(throttle.timer);
      }
    }
    throttleStates.clear();

    // Clear the store state
    state.set(new Map());
  }

  return {
    subscribe: state.subscribe,
    start,
    addBlock,
    appendDelta,
    finishBlock,
    stop,
    get: get_,
    isStreaming,
    clearAll,
  };
}

export const streamingStore = createStreamingStore();
