/**
 * File Diff View Component
 *
 * Renders file edits with a GitHub-style diff view using @git-diff-view/react
 */

import { useMemo, useState } from "react";
import { DiffView, DiffModeEnum } from "@git-diff-view/react";
import { generateDiffFile } from "@git-diff-view/file";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, FilePlus, FileEdit } from "@/components/ui/icons";

interface FileDiffViewProps {
  /** File path being edited */
  filePath: string;
  /** Original content (empty for new files) */
  oldContent: string;
  /** New content after edit */
  newContent: string;
  /** Whether this is a new file (Write) vs edit (Edit) */
  isNewFile?: boolean;
  /** Default collapsed state */
  defaultCollapsed?: boolean;
  /** Hide the collapsible header (for inline use where parent handles toggle) */
  hideHeader?: boolean;
  className?: string;
}

function getFileExtension(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  // Map common extensions to language identifiers
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    md: "markdown",
    py: "python",
    rs: "rust",
    go: "go",
    css: "css",
    scss: "scss",
    html: "html",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
  };
  return langMap[ext] || ext;
}

function getFileName(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

export function FileDiffView({
  filePath,
  oldContent,
  newContent,
  isNewFile = false,
  defaultCollapsed = true,
  hideHeader = false,
  className,
}: FileDiffViewProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const diffFile = useMemo(() => {
    const lang = getFileExtension(filePath);
    const instance = generateDiffFile(
      isNewFile ? "" : filePath,
      oldContent,
      filePath,
      newContent,
      lang,
      lang,
    );
    instance.initRaw();
    return instance;
  }, [filePath, oldContent, newContent, isNewFile]);

  // Calculate stats
  const stats = useMemo(() => {
    const newLines = newContent ? newContent.split("\n").length : 0;

    if (isNewFile) {
      return { added: newLines, removed: 0 };
    }

    // Simple line-based diff count
    let added = 0;
    let removed = 0;

    const oldLineSet = new Set(oldContent.split("\n"));
    const newLineSet = new Set(newContent.split("\n"));

    for (const line of newContent.split("\n")) {
      if (!oldLineSet.has(line)) added++;
    }
    for (const line of oldContent.split("\n")) {
      if (!newLineSet.has(line)) removed++;
    }

    return { added, removed };
  }, [oldContent, newContent, isNewFile]);

  const fileName = getFileName(filePath);
  const Icon = isNewFile ? FilePlus : FileEdit;

  // If hideHeader is true, just show the diff content directly
  if (hideHeader) {
    return (
      <div className={cn("border border-border overflow-hidden", className)}>
        <div className="diff-view-wrapper text-sm">
          <DiffView
            diffFile={diffFile}
            diffViewWrap={true}
            diffViewTheme="dark"
            diffViewHighlight={true}
            diffViewMode={DiffModeEnum.Unified}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("border border-border overflow-hidden", className)}>
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted transition-colors text-left"
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="font-mono text-sm text-foreground truncate flex-1">{fileName}</span>
        <div className="flex items-center gap-2 text-xs font-mono shrink-0">
          {stats.added > 0 && <span className="text-emerald-500">+{stats.added}</span>}
          {stats.removed > 0 && <span className="text-red-500">-{stats.removed}</span>}
        </div>
      </button>

      {/* Diff content */}
      {!isCollapsed && (
        <div className="diff-view-wrapper text-sm">
          <DiffView
            diffFile={diffFile}
            diffViewWrap={true}
            diffViewTheme="dark"
            diffViewHighlight={true}
            diffViewMode={DiffModeEnum.Unified}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline diff badge for tool calls
 */
interface InlineDiffBadgeProps {
  filePath: string;
  added: number;
  removed: number;
  isNewFile?: boolean;
  onClick?: () => void;
}

export function InlineDiffBadge({
  filePath,
  added,
  removed,
  isNewFile,
  onClick,
}: InlineDiffBadgeProps) {
  const fileName = getFileName(filePath);
  const Icon = isNewFile ? FilePlus : FileEdit;

  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2 py-1 bg-muted/50 hover:bg-muted border border-border text-xs font-mono transition-colors"
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-foreground truncate max-w-[200px]">{fileName}</span>
      {(added > 0 || removed > 0) && (
        <span className="flex items-center gap-1">
          {added > 0 && <span className="text-emerald-500">+{added}</span>}
          {removed > 0 && <span className="text-red-500">-{removed}</span>}
        </span>
      )}
    </button>
  );
}
