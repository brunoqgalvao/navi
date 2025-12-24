import type { StreamEventMessage } from "../claude";
import { chatStore } from "./messageStore";

export function handleStreamEvent(sessionId: string, msg: StreamEventMessage): void {
  const event = msg.event;
  if (!event) return;
  
  switch (event.type) {
    case "message_start":
      chatStore.startStreaming(sessionId);
      break;
    
    case "content_block_start":
      if (event.content_block) {
        chatStore.addStreamingBlock(sessionId, event.content_block);
      }
      break;
    
    case "content_block_delta":
      if (event.delta) {
        chatStore.appendStreamingDelta(sessionId, event.delta);
      }
      break;
    
    case "content_block_stop":
      chatStore.finishStreamingBlock(sessionId);
      break;
    
    case "message_stop":
    case "message_delta":
      chatStore.stopStreaming(sessionId);
      break;
  }
}
