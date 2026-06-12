/**
 * event-channel.ts — shared EventChannel for streaming GatewayEvents.
 *
 * A simple async channel for streaming GatewayEvents from concurrent
 * producers to a single consumer (the send() generator).
 *
 * push() enqueues an item (or resolves a waiting consumer).
 * end() signals completion.
 */

import type { GatewayEvent } from "../events.js";

export class EventChannel {
  private _queue: Array<GatewayEvent | { __done: true }> = [];
  private _waiter: (() => void) | undefined;

  private _notify(): void {
    const w = this._waiter;
    this._waiter = undefined;
    w?.();
  }

  push(evt: GatewayEvent): void {
    this._queue.push(evt);
    this._notify();
  }

  end(): void {
    this._queue.push({ __done: true });
    this._notify();
  }

  /** Returns an AsyncIterable that yields events until end() */
  async *iter(): AsyncIterable<GatewayEvent> {
    while (true) {
      while (this._queue.length === 0) {
        await new Promise<void>((res) => {
          this._waiter = res;
        });
      }
      const item = this._queue.shift()!;
      if ("__done" in item) return;
      yield item as GatewayEvent;
    }
  }
}
