import { useEffect, useRef, useState } from "react";
import { useTerminalPreview } from "@/web/hooks/useTerminalPreview";
import { cn } from "@/web/lib/utils";
import { ChevronDown, ChevronRight } from "@/components/ui/icons";

interface SdkMessage {
  type: "system" | "assistant" | "tool" | "result" | "error";
  timestamp: string;
  content: string;
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: string;
  sessionId?: string;
}

interface TerminalPreviewProps {
  taskId: string;
  prompt?: string;
  className?: string;
  autoScroll?: boolean;
  maxHeight?: number;
}

function TerminalMarkdown({ content }: { content: string }) {
  if (!content) return null;

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];

  const parseInline = (text: string, key: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let partIndex = 0;

    while (remaining.length > 0) {
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        parts.push(
          <code
            key={`${key}-code-${partIndex++}`}
            className="px-1.5 py-0.5 rounded bg-zinc-800 text-yellow-400 font-mono text-[0.9em]"
          >
            {codeMatch[1]}
          </code>,
        );
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }

      const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
      if (boldMatch) {
        parts.push(
          <strong key={`${key}-bold-${partIndex++}`} className="text-cyan-400 font-semibold">
            {boldMatch[1]}
          </strong>,
        );
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }

      const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        parts.push(
          <a
            key={`${key}-link-${partIndex++}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:underline"
          >
            {linkMatch[1]}
          </a>,
        );
        remaining = remaining.slice(linkMatch[0].length);
        continue;
      }

      const nextSpecial = remaining.search(/[`*[]/);
      if (nextSpecial === -1) {
        parts.push(remaining);
        break;
      } else if (nextSpecial === 0) {
        parts.push(remaining[0]);
        remaining = remaining.slice(1);
      } else {
        parts.push(remaining.slice(0, nextSpecial));
        remaining = remaining.slice(nextSpecial);
      }
    }

    return parts.length === 1 ? parts[0] : <>{parts}</>;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineKey = `line-${i}`;

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre
            key={`${lineKey}-codeblock`}
            className="my-2 p-3 rounded-md bg-zinc-800/80 border border-zinc-700/50 overflow-x-auto"
          >
            <code className="text-emerald-400 text-[0.9em]">{codeBlockContent.join("\n")}</code>
          </pre>,
        );
        inCodeBlock = false;
        codeBlockContent = [];
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    const h1Match = line.match(/^# (.+)$/);
    if (h1Match) {
      elements.push(
        <h1 key={lineKey} className="text-amber-500 text-lg font-bold mt-4 mb-2">
          {parseInline(h1Match[1] ?? "", lineKey)}
        </h1>,
      );
      continue;
    }

    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      elements.push(
        <h2 key={lineKey} className="text-amber-500 text-base font-bold mt-3 mb-2">
          {parseInline(h2Match[1] ?? "", lineKey)}
        </h2>,
      );
      continue;
    }

    const h3Match = line.match(/^### (.+)$/);
    if (h3Match) {
      elements.push(
        <h3 key={lineKey} className="text-amber-500 text-sm font-bold mt-2 mb-1">
          {parseInline(h3Match[1] ?? "", lineKey)}
        </h3>,
      );
      continue;
    }

    const h4Match = line.match(/^#{4,6} (.+)$/);
    if (h4Match) {
      elements.push(
        <h4 key={lineKey} className="text-amber-500/80 text-sm font-semibold mt-2 mb-1">
          {parseInline(h4Match[1] ?? "", lineKey)}
        </h4>,
      );
      continue;
    }

    const listMatch = line.match(/^(\s*)[-*] (.+)$/);
    if (listMatch) {
      const indent = (listMatch[1] ?? "").length;
      elements.push(
        <div
          key={lineKey}
          className="flex gap-2"
          style={{ paddingLeft: `${indent * 0.5 + 0.25}rem` }}
        >
          <span className="text-cyan-500">-</span>
          <span className="text-zinc-100">{parseInline(listMatch[2] ?? "", lineKey)}</span>
        </div>,
      );
      continue;
    }

    const numberedMatch = line.match(/^(\s*)(\d+)\. (.+)$/);
    if (numberedMatch) {
      const indent = (numberedMatch[1] ?? "").length;
      elements.push(
        <div
          key={lineKey}
          className="flex gap-2"
          style={{ paddingLeft: `${indent * 0.5 + 0.25}rem` }}
        >
          <span className="text-cyan-500">{numberedMatch[2]}.</span>
          <span className="text-zinc-100">{parseInline(numberedMatch[3] ?? "", lineKey)}</span>
        </div>,
      );
      continue;
    }

    if (line.trim() === "") {
      elements.push(<div key={lineKey} className="h-2" />);
      continue;
    }

    elements.push(
      <p key={lineKey} className="text-zinc-100 leading-relaxed">
        {parseInline(line, lineKey)}
      </p>,
    );
  }

  if (inCodeBlock && codeBlockContent.length > 0) {
    elements.push(
      <pre
        key="unclosed-codeblock"
        className="my-2 p-3 rounded-md bg-zinc-800/80 border border-zinc-700/50 overflow-x-auto"
      >
        <code className="text-emerald-400 text-[0.9em]">{codeBlockContent.join("\n")}</code>
      </pre>,
    );
  }

  return <div className="space-y-0.5">{elements}</div>;
}

function ThinkingBlock({
  content,
  defaultOpen = true,
}: {
  content: string;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="my-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-300 transition-colors text-sm"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <span className="italic">Thinking:</span>
      </button>
      {isOpen && (
        <div className="mt-1 pl-5 border-l-2 border-zinc-700">
          <p className="text-zinc-400 italic text-sm leading-relaxed whitespace-pre-wrap">
            {content}
          </p>
        </div>
      )}
    </div>
  );
}

function getToolTarget(toolArgs?: unknown): string {
  if (!toolArgs || typeof toolArgs !== "object") return "";

  const args = toolArgs as Record<string, unknown>;

  if (args.filePath) return String(args.filePath);
  if (args.path) return String(args.path);
  if (args.file) return String(args.file);
  if (args.command) {
    const cmd = String(args.command);
    return cmd.length > 60 ? cmd.slice(0, 60) + "..." : cmd;
  }
  if (args.pattern) return String(args.pattern);
  if (args.query) return String(args.query);
  if (args.url) return String(args.url);

  return "";
}

function TerminalMessage({ message }: { message: SdkMessage }) {
  switch (message.type) {
    case "assistant": {
      if (message.toolName) {
        const target = getToolTarget(message.toolArgs);
        return (
          <div className="flex items-start gap-2 py-0.5">
            <span className="text-emerald-400 shrink-0">-&gt;</span>
            <span className="text-cyan-400 font-medium">{message.toolName}</span>
            {target && <span className="text-zinc-400 font-mono text-sm truncate">{target}</span>}
          </div>
        );
      }

      const contentLower = message.content.toLowerCase();
      const isThinking =
        contentLower.startsWith("thinking") ||
        contentLower.startsWith("let me") ||
        contentLower.startsWith("i need to") ||
        contentLower.startsWith("i should") ||
        contentLower.startsWith("first,") ||
        contentLower.startsWith("now ");

      if (isThinking && message.content.length < 500) {
        return <ThinkingBlock content={message.content} />;
      }

      return (
        <div className="my-3">
          <TerminalMarkdown content={message.content} />
        </div>
      );
    }

    case "tool":
      if (message.toolResult) {
        const isError = message.toolResult.toLowerCase().includes("error");
        const preview =
          message.toolResult.length > 150
            ? message.toolResult.slice(0, 150) + "..."
            : message.toolResult;

        if (isError) {
          return (
            <div className="my-1 pl-5 text-sm">
              <span className="text-red-400">Result: </span>
              <span className="text-zinc-400">{preview}</span>
            </div>
          );
        }
        return null;
      }
      return null;

    case "error":
      return (
        <div className="my-2 p-3 rounded-md bg-red-900/20 border border-red-500/30">
          <span className="text-red-400 font-medium">Error: </span>
          <span className="text-red-300">{message.content}</span>
        </div>
      );

    case "result":
      return (
        <div className="my-2 p-3 rounded-md bg-emerald-900/20 border border-emerald-500/30">
          <span className="text-emerald-400 font-medium">Complete: </span>
          <span className="text-emerald-300">{message.content}</span>
        </div>
      );

    case "system":
      return <div className="my-1 text-sm text-zinc-500 italic">{message.content}</div>;

    default:
      return null;
  }
}

function UserPrompt({ content }: { content: string }) {
  return (
    <div className="mb-4 p-4 rounded-lg bg-zinc-800/50 border border-zinc-700">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-zinc-400">hoalong</span>
      </div>
      <p className="text-zinc-100 whitespace-pre-wrap">{content}</p>
    </div>
  );
}

export function TerminalPreview({
  taskId,
  prompt,
  className,
  autoScroll = true,
  maxHeight = 500,
}: TerminalPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, error } = useTerminalPreview(taskId);

  useEffect(() => {
    if (autoScroll && containerRef.current && (data?.content || data?.messages)) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [autoScroll, data?.content, data?.messages]);

  if (isLoading && !data) {
    return (
      <div
        className={cn(
          "bg-zinc-900 rounded-lg border border-zinc-800 p-4 font-mono text-sm text-zinc-400",
          className,
        )}
        style={{ maxHeight }}
      >
        <div className="flex items-center gap-2">
          <span className="animate-pulse">Loading terminal output...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "bg-zinc-900 rounded-lg border border-zinc-800 p-4 font-mono text-sm",
          className,
        )}
        style={{ maxHeight }}
      >
        <span className="text-red-400">Error loading terminal: {error.message}</span>
      </div>
    );
  }

  const content = data?.content || "";
  const messages = data?.messages as SdkMessage[] | undefined;
  const isLive = data?.isLive || false;
  const hasStructuredMessages = messages && messages.length > 0;

  return (
    <div className={cn("relative", className)}>
      {isLive && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 text-xs text-emerald-400 z-10 bg-zinc-900/80 px-2 py-1 rounded-full">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Live
        </div>
      )}

      <div
        ref={containerRef}
        className="bg-zinc-900 rounded-lg border border-zinc-800 p-5 font-mono text-sm overflow-auto"
        style={{ maxHeight }}
      >
        {prompt && <UserPrompt content={prompt} />}

        {hasStructuredMessages ? (
          <div className="space-y-0">
            {messages.map((msg, idx) => (
              <TerminalMessage key={idx} message={msg} />
            ))}
          </div>
        ) : content ? (
          <pre className="whitespace-pre-wrap wrap-break-word text-zinc-100">{content}</pre>
        ) : (
          <span className="text-zinc-500">
            {isLive ? "Waiting for output..." : "No terminal output available"}
          </span>
        )}
      </div>
    </div>
  );
}
