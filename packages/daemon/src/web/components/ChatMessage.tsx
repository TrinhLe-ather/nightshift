/**
 * Chat Message Component
 *
 * Renders individual messages in the chat view based on event type.
 * Supports: user prompts, agent messages, tool calls, system messages, etc.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Loader2,
  MessageSquare,
  Terminal,
  XCircle,
} from "@/components/ui/icons";

export type MessageType =
  | "prompt" // User's original prompt
  | "agent_message" // Claude's response text
  | "agent_tool_call" // Tool invocation
  | "agent_tool_result" // Tool result
  | "agent_thinking" // Thinking block
  | "agent_needs_human" // Needs human input
  | "task_started" // Task started
  | "task_completed" // Task completed
  | "task_failed" // Task failed
  | "task_paused" // Task paused
  | "artifact_commit" // Git commit created
  | "artifact_pr" // PR created
  | "system"; // Generic system message

export interface ChatMessageProps {
  type: MessageType;
  content: string;
  timestamp?: string;
  data?: Record<string, unknown>;
  className?: string;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Collapsible content wrapper
function CollapsibleContent({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
      >
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {title}
      </button>
      {isOpen && (
        <div className="px-3 py-2 bg-background border-t border-border text-sm">{children}</div>
      )}
    </div>
  );
}

// User prompt message (right-aligned)
function PromptMessage({ content, timestamp }: { content: string; timestamp?: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] flex flex-col items-end gap-1">
        <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-3">
          <p className="whitespace-pre-wrap text-sm">{content}</p>
        </div>
        {timestamp && (
          <span className="text-xs text-muted-foreground">{formatTime(timestamp)}</span>
        )}
      </div>
    </div>
  );
}

// Agent message (left-aligned)
function AgentMessage({ content, timestamp }: { content: string; timestamp?: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] flex flex-col items-start gap-1">
        <div className="bg-card border border-border text-card-foreground rounded-2xl rounded-bl-md px-4 py-3">
          <p className="whitespace-pre-wrap text-sm text-foreground">{content}</p>
        </div>
        {timestamp && (
          <span className="text-xs text-muted-foreground">{formatTime(timestamp)}</span>
        )}
      </div>
    </div>
  );
}

// Tool call (compact inline)
function ToolCallMessage({
  content,
  data,
  timestamp,
}: {
  content: string;
  data?: Record<string, unknown>;
  timestamp?: string;
}) {
  const toolName = (data?.tool as string) || "Tool";
  const file = data?.file as string;
  const args = data?.args as Record<string, unknown>;

  // Format tool display
  let displayText = content;
  if (file) {
    displayText = file;
  } else if (args && typeof args === "object") {
    // Try to extract meaningful info from args
    const argStr = Object.entries(args)
      .slice(0, 2)
      .map(([k, v]) => `${k}=${typeof v === "string" ? v.slice(0, 30) : String(v)}`)
      .join(", ");
    if (argStr) displayText = argStr;
  }

  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted border border-border rounded-md text-sm font-mono">
        <Terminal className="h-3.5 w-3.5 text-primary" />
        <span className="text-primary font-medium">{toolName}</span>
        <span className="text-muted-foreground truncate max-w-[300px]">{displayText}</span>
      </div>
      {timestamp && <span className="text-xs text-muted-foreground">{formatTime(timestamp)}</span>}
    </div>
  );
}

// Tool result (collapsible)
function ToolResultMessage({ content, data }: { content: string; data?: Record<string, unknown> }) {
  const toolName = (data?.tool as string) || "Result";
  const truncatedContent = content.length > 200 ? content.slice(0, 200) + "..." : content;

  return (
    <div className="pl-6">
      <CollapsibleContent title={`${toolName} result`}>
        <pre className="whitespace-pre-wrap text-xs font-mono text-muted-foreground overflow-x-auto">
          {truncatedContent}
        </pre>
      </CollapsibleContent>
    </div>
  );
}

// Thinking block (collapsible)
function ThinkingMessage({ content }: { content: string }) {
  return (
    <div className="pl-2">
      <CollapsibleContent title="Thinking...">
        <p className="whitespace-pre-wrap text-sm text-muted-foreground italic">{content}</p>
      </CollapsibleContent>
    </div>
  );
}

// Needs human input (warning card)
function NeedsHumanMessage({ content, data }: { content: string; data?: Record<string, unknown> }) {
  const question = (data?.question as string) || content;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex items-start gap-3">
          <MessageSquare className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground mb-1">Waiting for your input</p>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{question}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// System messages (centered)
function SystemMessage({
  type,
  content,
  data: _data,
  timestamp,
}: {
  type: MessageType;
  content: string;
  data?: Record<string, unknown>;
  timestamp?: string;
}) {
  const getIcon = () => {
    switch (type) {
      case "task_started":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "task_completed":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "task_failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "task_paused":
        return <Clock className="h-4 w-4 text-amber-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTextColor = () => {
    switch (type) {
      case "task_completed":
        return "text-emerald-500";
      case "task_failed":
        return "text-destructive";
      case "task_paused":
        return "text-amber-500";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div className="flex justify-center py-2">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border">
        {getIcon()}
        <span className={cn("text-xs font-medium", getTextColor())}>{content}</span>
        {timestamp && (
          <span className="text-xs text-muted-foreground">{formatTime(timestamp)}</span>
        )}
      </div>
    </div>
  );
}

// Artifact messages (commit/PR)
function ArtifactMessage({
  type,
  content: _content,
  data,
}: {
  type: "artifact_commit" | "artifact_pr";
  content: string;
  data?: Record<string, unknown>;
}) {
  const isCommit = type === "artifact_commit";
  const url = data?.url as string;
  const sha = data?.sha as string;
  const branch = data?.branch as string;

  return (
    <div className="flex justify-center py-2">
      <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
        {isCommit ? (
          <GitBranch className="h-4 w-4 text-emerald-500" />
        ) : (
          <GitPullRequest className="h-4 w-4 text-emerald-500" />
        )}
        <div className="flex flex-col">
          <span className="text-sm font-medium text-emerald-500">
            {isCommit ? "Commit created" : "Pull Request created"}
          </span>
          {sha && (
            <span className="text-xs font-mono text-muted-foreground">{sha.slice(0, 8)}</span>
          )}
          {branch && <span className="text-xs text-muted-foreground">{branch}</span>}
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

export function ChatMessage({ type, content, timestamp, data, className }: ChatMessageProps) {
  return (
    <div className={cn("", className)}>
      {type === "prompt" && <PromptMessage content={content} timestamp={timestamp} />}
      {type === "agent_message" && <AgentMessage content={content} timestamp={timestamp} />}
      {type === "agent_tool_call" && (
        <ToolCallMessage content={content} data={data} timestamp={timestamp} />
      )}
      {type === "agent_tool_result" && <ToolResultMessage content={content} data={data} />}
      {type === "agent_thinking" && <ThinkingMessage content={content} />}
      {type === "agent_needs_human" && <NeedsHumanMessage content={content} data={data} />}
      {(type === "task_started" ||
        type === "task_completed" ||
        type === "task_failed" ||
        type === "task_paused" ||
        type === "system") && (
        <SystemMessage type={type} content={content} data={data} timestamp={timestamp} />
      )}
      {(type === "artifact_commit" || type === "artifact_pr") && (
        <ArtifactMessage type={type} content={content} data={data} />
      )}
    </div>
  );
}
