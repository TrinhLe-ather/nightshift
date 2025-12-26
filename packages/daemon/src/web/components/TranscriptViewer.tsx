/**
 * Transcript Viewer Component
 *
 * Renders full SDK messages with proper formatting:
 * - Read: "Read <file_path>"
 * - Bash: "Ran <command>"
 * - Edit/Write: Show diff view
 * - Full message content (not truncated)
 */

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { cn } from "@/web/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  File,
  Terminal,
  FileEdit,
  FilePlus,
  Search,
  Globe,
  FolderSearch,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Activity,
  GitBranch,
  GitPullRequest,
} from "@/components/ui/icons";
import { FileDiffView } from "./FileDiffView";

export interface SdkMessage {
  type: "system" | "assistant" | "tool" | "result" | "error" | "user";
  timestamp: string;
  content: string;
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: string;
  sessionId?: string;
}

export interface SessionEvent {
  schemaVersion: number;
  ts: string;
  seq: number;
  level: "info" | "warn" | "error" | "debug";
  type: string;
  taskId: string;
  runId: string;
  data?: Record<string, unknown>;
}

export type TimelineItem =
  | { itemType: "message"; data: SdkMessage }
  | { itemType: "event"; data: SessionEvent };

interface TranscriptViewerProps {
  messages: SdkMessage[];
  events?: SessionEvent[];
  prompt?: string;
  className?: string;
  autoScroll?: boolean;
  isLive?: boolean;
  /** Callback when file changes are detected */
  onFileChanges?: (changes: FileChange[]) => void;
}

export interface FileChange {
  filePath: string;
  oldContent: string;
  newContent: string;
  isNewFile: boolean;
  added: number;
  removed: number;
  timestamp: string;
}

interface ToolArgs {
  file_path?: string;
  filePath?: string;
  path?: string;
  command?: string;
  old_string?: string;
  new_string?: string;
  content?: string;
  pattern?: string;
  query?: string;
  url?: string;
  prompt?: string;
  description?: string;
}

function getToolArgs(toolArgs: unknown): ToolArgs {
  if (!toolArgs || typeof toolArgs !== "object") return {};
  return toolArgs as ToolArgs;
}

function getFilePath(args: ToolArgs): string {
  return args.file_path || args.filePath || args.path || "";
}

function getFileName(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

function countLines(content: string): number {
  return content ? content.split("\n").length : 0;
}

function calculateDiff(oldContent: string, newContent: string): { added: number; removed: number } {
  if (!oldContent) {
    return { added: countLines(newContent), removed: 0 };
  }

  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const oldLineSet = new Set(oldLines);
  const newLineSet = new Set(newLines);

  let added = 0;
  let removed = 0;

  for (const line of newLines) {
    if (!oldLineSet.has(line)) added++;
  }
  for (const line of oldLines) {
    if (!newLineSet.has(line)) removed++;
  }

  return { added, removed };
}

// Tool-specific renderers
function ReadToolMessage({ args }: { args: ToolArgs }) {
  const filePath = getFilePath(args);
  const fileName = getFileName(filePath);

  return (
    <div className="flex items-center gap-2 py-1">
      <File className="h-4 w-4 text-blue-400 shrink-0" />
      <span className="text-zinc-300">Read</span>
      <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-cyan-400 font-mono text-sm">
        {fileName}
      </code>
    </div>
  );
}

function BashToolMessage({ args }: { args: ToolArgs }) {
  const command = args.command || "";
  const description = args.description || "";

  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex items-center gap-2">
        <Terminal className="h-4 w-4 text-emerald-400 shrink-0" />
        <span className="text-zinc-300">Ran</span>
        <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-yellow-400 font-mono text-sm max-w-[500px] truncate">
          {command}
        </code>
      </div>
      {description && <p className="text-xs text-zinc-500 ml-6">{description}</p>}
    </div>
  );
}

function EditToolMessage({
  args,
  showDiff,
  onToggleDiff,
}: {
  args: ToolArgs;
  showDiff: boolean;
  onToggleDiff: () => void;
}) {
  const filePath = getFilePath(args);
  const fileName = getFileName(filePath);
  const oldString = args.old_string || "";
  const newString = args.new_string || "";
  const { added, removed } = calculateDiff(oldString, newString);

  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="flex items-center gap-2">
        <FileEdit className="h-4 w-4 text-amber-400 shrink-0" />
        <span className="text-zinc-300">Edited</span>
        <button
          onClick={onToggleDiff}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors"
        >
          <code className="text-cyan-400 font-mono text-sm">{fileName}</code>
          <span className="flex items-center gap-1 text-xs font-mono">
            {added > 0 && <span className="text-emerald-500">+{added}</span>}
            {removed > 0 && <span className="text-red-500">-{removed}</span>}
          </span>
          {showDiff ? (
            <ChevronDown className="h-3 w-3 text-zinc-500" />
          ) : (
            <ChevronRight className="h-3 w-3 text-zinc-500" />
          )}
        </button>
      </div>
      {showDiff && (
        <div className="ml-6 mt-1">
          <FileDiffView
            filePath={filePath}
            oldContent={oldString}
            newContent={newString}
            isNewFile={false}
            hideHeader={true}
          />
        </div>
      )}
    </div>
  );
}

function WriteToolMessage({
  args,
  showDiff,
  onToggleDiff,
}: {
  args: ToolArgs;
  showDiff: boolean;
  onToggleDiff: () => void;
}) {
  const filePath = getFilePath(args);
  const fileName = getFileName(filePath);
  const content = args.content || "";
  const lines = countLines(content);

  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="flex items-center gap-2">
        <FilePlus className="h-4 w-4 text-emerald-400 shrink-0" />
        <span className="text-zinc-300">Created</span>
        <button
          onClick={onToggleDiff}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors"
        >
          <code className="text-cyan-400 font-mono text-sm">{fileName}</code>
          <span className="text-xs font-mono text-emerald-500">+{lines}</span>
          {showDiff ? (
            <ChevronDown className="h-3 w-3 text-zinc-500" />
          ) : (
            <ChevronRight className="h-3 w-3 text-zinc-500" />
          )}
        </button>
      </div>
      {showDiff && (
        <div className="ml-6 mt-1">
          <FileDiffView
            filePath={filePath}
            oldContent=""
            newContent={content}
            isNewFile={true}
            hideHeader={true}
          />
        </div>
      )}
    </div>
  );
}

function GrepToolMessage({ args }: { args: ToolArgs }) {
  const pattern = args.pattern || "";

  return (
    <div className="flex items-start gap-2 py-1">
      <Search className="h-4 w-4 text-purple-400 shrink-0 mt-1" />
      <span className="text-zinc-300 pt-0.5">Searched</span>
      <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-purple-400 font-mono text-sm">
        {pattern}
      </code>
    </div>
  );
}

function GlobToolMessage({ args }: { args: ToolArgs }) {
  const pattern = args.pattern || "";

  return (
    <div className="flex items-center gap-2 py-1">
      <FolderSearch className="h-4 w-4 text-orange-400 shrink-0" />
      <span className="text-zinc-300">Found files</span>
      <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-orange-400 font-mono text-sm">
        {pattern}
      </code>
    </div>
  );
}

function WebFetchToolMessage({ args }: { args: ToolArgs }) {
  const url = args.url || "";

  return (
    <div className="flex items-center gap-2 py-1">
      <Globe className="h-4 w-4 text-blue-400 shrink-0" />
      <span className="text-zinc-300">Fetched</span>
      <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-blue-400 font-mono text-sm max-w-[400px] truncate">
        {url}
      </code>
    </div>
  );
}

function GenericToolMessage({ toolName, args }: { toolName: string; args: ToolArgs }) {
  const filePath = getFilePath(args);

  return (
    <div className="flex items-center gap-2 py-1">
      <Terminal className="h-4 w-4 text-zinc-400 shrink-0" />
      <span className="text-cyan-400 font-medium">{toolName}</span>
      {filePath && (
        <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono text-sm truncate max-w-[300px]">
          {getFileName(filePath)}
        </code>
      )}
    </div>
  );
}

// Markdown renderer for assistant messages
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

    const codeBlockMatch = line.match(/^```(\w*)/);
    if (codeBlockMatch) {
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

// Collapsible thinking block
function ThinkingBlock({
  content,
  defaultOpen = false,
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
        <span className="italic">Thinking...</span>
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

// User prompt display
function UserPrompt({ content }: { content: string }) {
  return (
    <div className="mb-4 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
      <div className="flex items-start gap-2">
        <MessageSquare className="size-5 text-blue-400" />
        <p className="text-zinc-100 whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}

// Session event display
function SessionEventItem({ event }: { event: SessionEvent }) {
  const eventConfig: Record<string, { icon: typeof Activity; color: string; label: string }> = {
    TASK_CLAIMED: { icon: Activity, color: "text-blue-400", label: "Task claimed" },
    TASK_STARTED: { icon: Activity, color: "text-blue-400", label: "Task started" },
    TASK_COMPLETED: { icon: CheckCircle2, color: "text-emerald-400", label: "Task completed" },
    TASK_FAILED: { icon: XCircle, color: "text-red-400", label: "Task failed" },
    WORKTREE_CREATED: { icon: GitBranch, color: "text-purple-400", label: "Worktree created" },
    WORKTREE_REMOVED: { icon: GitBranch, color: "text-zinc-500", label: "Worktree removed" },
    REPO_BRANCH_CREATED: { icon: GitBranch, color: "text-blue-400", label: "Branch created" },
    ARTIFACT_PR_CREATED: { icon: GitPullRequest, color: "text-emerald-400", label: "PR created" },
    ARTIFACT_COMMIT_CREATED: { icon: CheckCircle2, color: "text-emerald-400", label: "Committed" },
    PREFLIGHT_STARTED: { icon: Activity, color: "text-zinc-500", label: "Preflight checks" },
    PREFLIGHT_PASSED: { icon: CheckCircle2, color: "text-emerald-400", label: "Preflight passed" },
    PREFLIGHT_FAILED: { icon: XCircle, color: "text-red-400", label: "Preflight failed" },
  };

  const config = eventConfig[event.type] || {
    icon: Activity,
    color: "text-zinc-400",
    label: event.type,
  };

  const Icon = config.icon;

  // Format timestamp
  const timestamp = new Date(event.ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // Format event data
  let detail = "";
  if (event.data) {
    if (event.data.branch) detail = `${event.data.branch}`;
    if (event.data.url) detail = String(event.data.url);
    if (event.data.sha) detail = String(event.data.sha).substring(0, 8);
    if (event.data.message) detail = String(event.data.message);
  }

  return (
    <div className="flex items-start gap-2 py-1 text-sm">
      <Icon className={cn("h-3.5 w-3.5 shrink-0 mt-0.5", config.color)} />
      <p className="text-zinc-400 truncate">
        {config.label} {detail && <span className="text-zinc-500 font-mono">{detail}</span>}
      </p>
      <span className="text-zinc-600 font-mono ml-auto shrink-0">{timestamp}</span>
    </div>
  );
}

// Tool result with collapsible content
function ToolResultMessage({ content, isError }: { content: string; isError: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const previewLength = 200;
  const hasMore = content.length > previewLength;

  if (!content) return null;

  return (
    <div className={cn("my-1 pl-6", isError ? "text-red-400" : "text-zinc-500")}>
      {hasMore ? (
        <div>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1.5 text-xs hover:text-zinc-300 transition-colors"
          >
            {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <span>
              {isError ? "Error" : "Result"} ({content.length} chars)
            </span>
          </button>
          {isOpen && (
            <pre className="mt-1 p-2 rounded bg-zinc-800/50 text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-[300px] overflow-y-auto">
              {content}
            </pre>
          )}
        </div>
      ) : (
        <span className="text-xs">{content}</span>
      )}
    </div>
  );
}

// Single message renderer
function TranscriptMessage({
  message,
}: {
  message: SdkMessage;
  previousToolName?: string;
  onShowDiff: (
    filePath: string,
    oldContent: string,
    newContent: string,
    isNewFile: boolean,
  ) => void;
}) {
  const args = getToolArgs(message.toolArgs);
  const [showInlineDiff, setShowInlineDiff] = useState(false);

  switch (message.type) {
    case "assistant": {
      if (message.toolName) {
        // Render tool-specific message
        switch (message.toolName) {
          case "Read":
            return <ReadToolMessage args={args} />;
          case "Bash":
            return <BashToolMessage args={args} />;
          case "Edit":
            return (
              <EditToolMessage
                args={args}
                showDiff={showInlineDiff}
                onToggleDiff={() => setShowInlineDiff(!showInlineDiff)}
              />
            );
          case "Write":
            return (
              <WriteToolMessage
                args={args}
                showDiff={showInlineDiff}
                onToggleDiff={() => setShowInlineDiff(!showInlineDiff)}
              />
            );
          case "Grep":
            return <GrepToolMessage args={args} />;
          case "Glob":
            return <GlobToolMessage args={args} />;
          case "WebFetch":
            return <WebFetchToolMessage args={args} />;
          default:
            return <GenericToolMessage toolName={message.toolName} args={args} />;
        }
      }

      // Check if it's a thinking message
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

      // Regular assistant message - render full content
      return (
        <div className="my-3">
          <TerminalMarkdown content={message.content} />
        </div>
      );
    }

    case "tool":
      // Tool result - hide all tool results (the tool action itself is already shown)
      // Only keep thinking blocks and file diffs visible
      return null;

    case "error":
      return (
        <div className="my-2 p-3 rounded-md bg-red-900/20 border border-red-500/30 flex items-start gap-2">
          <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <span className="text-red-300">{message.content}</span>
        </div>
      );

    case "result":
      // Skip result block - all events/messages are already shown
      return null;

    case "system":
      return <div className="my-1 text-sm text-zinc-500 italic">{message.content}</div>;

    case "user":
      return (
        <div className="my-3 p-3 rounded-md bg-blue-900/20 border border-blue-500/30">
          <div className="text-sm font-medium text-blue-400 mb-1">You</div>
          <div className="text-zinc-200">{message.content}</div>
        </div>
      );

    default:
      return null;
  }
}

export function TranscriptViewer({
  messages,
  events = [],
  prompt,
  autoScroll = true,
  isLive = false,
  onFileChanges,
}: TranscriptViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeDiff, setActiveDiff] = useState<{
    filePath: string;
    oldContent: string;
    newContent: string;
    isNewFile: boolean;
  } | null>(null);

  // Merge messages and events chronologically
  const timeline = useMemo(() => {
    // Filter out agent-related events (AGENT_TOOL_*, AGENT_MESSAGE)
    // Only keep task/session lifecycle events
    const filteredEvents = events.filter(
      (evt) =>
        !evt.type.startsWith("AGENT_TOOL") &&
        evt.type !== "AGENT_MESSAGE" &&
        evt.type !== "AGENT_STARTED" &&
        evt.type !== "AGENT_RESUMED" &&
        evt.type !== "SESSION_STARTED" &&
        evt.type !== "SESSION_ENDED",
    );

    const items: TimelineItem[] = [
      ...messages.map((msg): TimelineItem => ({ itemType: "message", data: msg })),
      ...filteredEvents.map((evt): TimelineItem => ({ itemType: "event", data: evt })),
    ];

    // Sort by timestamp
    items.sort((a, b) => {
      const timeA = a.itemType === "message" ? a.data.timestamp : a.data.ts;
      const timeB = b.itemType === "message" ? b.data.timestamp : b.data.ts;
      return new Date(timeA).getTime() - new Date(timeB).getTime();
    });

    return items;
  }, [messages, events]);

  // Track file changes
  const fileChanges = useMemo(() => {
    const changes: Map<string, FileChange> = new Map();

    for (const msg of messages) {
      if (msg.type === "assistant" && msg.toolName) {
        const args = getToolArgs(msg.toolArgs);
        const filePath = getFilePath(args);

        if (msg.toolName === "Edit" && filePath) {
          const existing = changes.get(filePath);
          const oldContent = args.old_string || "";
          const newContent = args.new_string || "";
          const diff = calculateDiff(oldContent, newContent);

          if (existing) {
            // Accumulate changes
            changes.set(filePath, {
              ...existing,
              newContent: newContent,
              added: existing.added + diff.added,
              removed: existing.removed + diff.removed,
              timestamp: msg.timestamp,
            });
          } else {
            changes.set(filePath, {
              filePath,
              oldContent,
              newContent,
              isNewFile: false,
              ...diff,
              timestamp: msg.timestamp,
            });
          }
        } else if (msg.toolName === "Write" && filePath) {
          const content = args.content || "";
          const lines = countLines(content);

          changes.set(filePath, {
            filePath,
            oldContent: "",
            newContent: content,
            isNewFile: true,
            added: lines,
            removed: 0,
            timestamp: msg.timestamp,
          });
        }
      }
    }

    return Array.from(changes.values());
  }, [messages]);

  // Notify parent of file changes
  useEffect(() => {
    onFileChanges?.(fileChanges);
  }, [fileChanges, onFileChanges]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [autoScroll, timeline]);

  // Check if we should show the prompt (avoid duplication with first message)
  const shouldShowPrompt = useMemo(() => {
    if (!prompt) return false;
    if (timeline.length === 0) return true; // No messages yet, show prompt

    // Find first user message in timeline
    const firstUserMessage = timeline.find(
      (item) => item.itemType === "message" && item.data.type === "user",
    );

    // Don't show UserPrompt if first message matches prompt (avoid duplication)
    if (firstUserMessage && firstUserMessage.itemType === "message") {
      return firstUserMessage.data.content !== prompt;
    }

    return true; // Show prompt if no user messages found
  }, [prompt, timeline]);

  const handleShowDiff = useCallback(
    (filePath: string, oldContent: string, newContent: string, isNewFile: boolean) => {
      setActiveDiff({ filePath, oldContent, newContent, isNewFile });
    },
    [],
  );

  return (
    <div className="pr-1">
      {isLive && (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Live
        </div>
      )}

      <div
        ref={containerRef}
        className="text-sm"
        // style={{ maxHeight }}
      >
        {shouldShowPrompt && prompt && <UserPrompt content={prompt} />}

        {timeline.length > 0 ? (
          <div className="space-y-0">
            {timeline.map((item, idx) => {
              if (item.itemType === "event") {
                return <SessionEventItem key={`event-${idx}`} event={item.data} />;
              } else {
                const prevItem = idx > 0 ? timeline[idx - 1] : undefined;
                const prevToolName =
                  prevItem?.itemType === "message" ? prevItem.data.toolName : undefined;
                return (
                  <TranscriptMessage
                    key={`message-${idx}`}
                    message={item.data}
                    previousToolName={prevToolName}
                    onShowDiff={handleShowDiff}
                  />
                );
              }
            })}
          </div>
        ) : (
          <span className="text-zinc-500">
            {isLive ? "Waiting for output..." : "No transcript available"}
          </span>
        )}
      </div>

      {/* Diff modal */}
      {activeDiff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-zinc-900 rounded-lg border border-zinc-700 max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
              <h3 className="font-mono text-sm text-zinc-100">{activeDiff.filePath}</h3>
              <button
                onClick={() => setActiveDiff(null)}
                className="text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <FileDiffView
                filePath={activeDiff.filePath}
                oldContent={activeDiff.oldContent}
                newContent={activeDiff.newContent}
                isNewFile={activeDiff.isNewFile}
                defaultCollapsed={false}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
