import { useTerminal } from "@/web/hooks/useTerminal";
import { cn } from "@/lib/utils";
import { AlertCircle, RefreshCw } from "@/components/ui/icons";

export function Terminal() {
  const { containerRef, isConnected, isReady, error, reconnect } = useTerminal({
    fontSize: 14,
    fontFamily: "'JetBrains Mono', Monaco, Menlo, 'Courier New', monospace",
  });

  return (
    <div className="h-screen flex flex-col bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "h-2.5 w-2.5 rounded-full transition-colors",
                isConnected ? "bg-green-500" : "bg-red-500",
              )}
            />
            <span className="text-sm text-zinc-400">
              {isConnected ? "Connected" : isReady ? "Disconnected" : "Initializing..."}
            </span>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={reconnect}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Reconnect</span>
        </button>
      </div>

      {/* Terminal container - full screen */}
      <div ref={containerRef} className="flex-1 min-h-0 p-2" />
    </div>
  );
}
