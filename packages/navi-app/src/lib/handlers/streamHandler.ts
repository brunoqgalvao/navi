import type { StreamEventMessage } from "../claude";
import { streamingStore } from "./streamingStore";

export function handleStreamEvent(sessionId: string, msg: StreamEventMessage): void {
  const event = msg.event;
  if (!event) return;
  
  switch (event.type) {
    case "message_start":
      streamingStore.start(sessionId);
      break;
    
    case "content_block_start":
      if (event.content_block) {
        streamingStore.addBlock(sessionId, event.content_block);
      }
      break;
    
    case "content_block_delta":
      if (event.delta) {
        streamingStore.appendDelta(sessionId, event.delta);
      }
      break;
    
    case "content_block_stop":
      streamingStore.finishBlock(sessionId);
      break;
    
    case "message_stop":
    case "message_delta":
      streamingStore.stop(sessionId);
      break;
  }
}
