import { useEffect, useRef, useCallback, useState } from "react";
import type { ClaudeMessage, QueryOptions } from "~/lib/claude";

interface UseWebSocketOptions {
  url?: string;
  onMessage?: (msg: ClaudeMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  autoConnect?: boolean;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    url = "ws://localhost:3001/ws",
    onMessage,
    onConnect,
    onDisconnect,
    autoConnect = true,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listenersRef = useRef<((msg: ClaudeMessage) => void)[]>([]);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Add onMessage to listeners
  useEffect(() => {
    if (onMessage) {
      listenersRef.current.push(onMessage);
      return () => {
        listenersRef.current = listenersRef.current.filter(
          (l) => l !== onMessage
        );
      };
    }
  }, [onMessage]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("Connected to Claude server");
        setIsConnected(true);
        setError(null);
        onConnect?.();
      };

      ws.onmessage = (event) => {
        try {
          const msg: ClaudeMessage = JSON.parse(event.data);
          listenersRef.current.forEach((fn) => fn(msg));
        } catch (e) {
          console.error("Failed to parse message:", e);
        }
      };

      ws.onerror = (event) => {
        console.error("WebSocket error:", event);
        setError("Connection error");
      };

      ws.onclose = () => {
        console.log("Disconnected from Claude server");
        setIsConnected(false);
        onDisconnect?.();

        // Auto-reconnect after 2 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          if (autoConnect) {
            connect();
          }
        }, 2000);
      };
    } catch (e) {
      console.error("Failed to connect:", e);
      setError("Failed to connect");
    }
  }, [url, onConnect, onDisconnect, autoConnect]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn("WebSocket not connected, cannot send");
    }
  }, []);

  const query = useCallback(
    (options: QueryOptions) => {
      send({ type: "query", ...options });
    },
    [send]
  );

  const abort = useCallback(
    (sessionId?: string) => {
      send({ type: "abort", sessionId });
    },
    [send]
  );

  const attachSession = useCallback(
    (sessionId: string) => {
      send({ type: "attach", sessionId });
    },
    [send]
  );

  const respondToPermission = useCallback(
    (requestId: string, approved: boolean, approveAll?: boolean) => {
      send({
        type: "permission_response",
        permissionRequestId: requestId,
        approved,
        approveAll,
      });
    },
    [send]
  );

  const addListener = useCallback((fn: (msg: ClaudeMessage) => void) => {
    listenersRef.current.push(fn);
    return () => {
      listenersRef.current = listenersRef.current.filter((l) => l !== fn);
    };
  }, []);

  return {
    isConnected,
    error,
    connect,
    disconnect,
    query,
    abort,
    attachSession,
    respondToPermission,
    addListener,
    send,
  };
}
