import { useEffect, useRef, useState } from "react";
import type { Terminal, ITheme, FitAddon } from "ghostty-web";

interface UseTerminalOptions {
  fontSize?: number;
  fontFamily?: string;
  theme?: ITheme;
}

interface UseTerminalReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isConnected: boolean;
  isReady: boolean;
  error: string | null;
  reconnect: () => void;
}

const defaultTheme: ITheme = {
  background: "#0d1117",
  foreground: "#c9d1d9",
  cursor: "#58a6ff",
  cursorAccent: "#0d1117",
  selectionBackground: "#388bfd66",
  black: "#484f58",
  red: "#ff7b72",
  green: "#3fb950",
  yellow: "#d29922",
  blue: "#58a6ff",
  magenta: "#bc8cff",
  cyan: "#39c5cf",
  white: "#b1bac4",
  brightBlack: "#6e7681",
  brightRed: "#ffa198",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#79c0ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#56d4dd",
  brightWhite: "#f0f6fc",
};

export function useTerminal(options: UseTerminalOptions = {}): UseTerminalReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const initializingRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Prevent double initialization (React Strict Mode)
    if (initializingRef.current || termRef.current) {
      return;
    }
    initializingRef.current = true;

    let cancelled = false;
    let term: Terminal | null = null;
    let ws: WebSocket | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let handleResize: (() => void) | null = null;

    async function initialize() {
      if (!container) return;

      try {
        const ghostty = await import("ghostty-web");
        if (cancelled) return;

        await ghostty.init();
        if (cancelled) return;

        // Clear container in case of reconnect
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }

        term = new ghostty.Terminal({
          fontSize: options.fontSize ?? 14,
          fontFamily: options.fontFamily ?? "'JetBrains Mono', Monaco, Menlo, monospace",
          cursorBlink: true,
          scrollback: 10000,
          theme: options.theme ?? defaultTheme,
        });

        const fitAddon = new ghostty.FitAddon();
        term.loadAddon(fitAddon);
        term.open(container);

        termRef.current = term;
        fitAddonRef.current = fitAddon;

        // Give the terminal a moment to initialize dimensions
        await new Promise((r) => requestAnimationFrame(r));

        if (cancelled) {
          term.dispose();
          return;
        }

        fitAddon.fit();
        setIsReady(true);

        // Connect WebSocket
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws/terminal?cols=${term.cols}&rows=${term.rows}`;

        ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer"; // Avoid async Blob conversion for proper message ordering
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          setError(null);
          term?.focus();
        };

        ws.onmessage = (e) => {
          if (typeof e.data === "string") {
            term?.write(e.data);
          } else if (e.data instanceof ArrayBuffer) {
            term?.write(new Uint8Array(e.data));
          }
        };

        ws.onerror = () => {
          setError("WebSocket connection error");
        };

        ws.onclose = () => {
          setIsConnected(false);
        };

        // Handle user input
        term.onData((data) => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        });

        // Handle resize
        term.onResize(({ cols, rows }) => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "resize", cols, rows }));
          }
        });

        // Auto-fit on window resize
        handleResize = () => {
          fitAddonRef.current?.fit();
        };
        window.addEventListener("resize", handleResize);

        // Also observe container resize
        resizeObserver = new ResizeObserver(() => {
          fitAddonRef.current?.fit();
        });
        resizeObserver.observe(container);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to initialize terminal");
      }
    }

    initialize();

    return () => {
      cancelled = true;
      initializingRef.current = false;

      if (handleResize) {
        window.removeEventListener("resize", handleResize);
      }
      resizeObserver?.disconnect();

      if (ws) {
        ws.close();
        wsRef.current = null;
      }

      if (term) {
        term.dispose();
        termRef.current = null;
        fitAddonRef.current = null;
      }

      setIsReady(false);
      setIsConnected(false);
    };
  }, [reconnectTrigger, options.fontSize, options.fontFamily, options.theme]);

  const reconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (termRef.current) {
      termRef.current.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    }
    initializingRef.current = false;
    setIsReady(false);
    setIsConnected(false);
    setError(null);
    setReconnectTrigger((t) => t + 1);
  };

  return { containerRef, isConnected, isReady, error, reconnect };
}
