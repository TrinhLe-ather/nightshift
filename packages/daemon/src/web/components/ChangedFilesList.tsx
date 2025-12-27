/**
 * Changed Files List Component
 *
 * Displays a cumulative list of files changed during task execution.
 * Shows file names with +/- line counts.
 * Clicking a file opens a modal with all diffs shown and scrolls to that file.
 */

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { FileEdit, FilePlus, FileDiff } from "@/components/ui/icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileDiffView } from "./FileDiffView";
import type { FileChange } from "./TranscriptViewer";

interface ChangedFilesListProps {
  changes: FileChange[];
  className?: string;
  /** Whether to show as a compact inline list or full card */
  variant?: "card" | "inline";
  /** Default collapsed state for card variant (deprecated - no longer used) */
  defaultCollapsed?: boolean;
}

function getFileName(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

function FileChangeItem({ change, onClick }: { change: FileChange; onClick?: () => void }) {
  const fileName = getFileName(change.filePath);
  const Icon = change.isNewFile ? FilePlus : FileEdit;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
    >
      <Icon
        className={cn("h-4 w-4 shrink-0", change.isNewFile ? "text-emerald-500" : "text-amber-500")}
      />
      <span className="font-mono text-sm text-foreground truncate flex-1">{fileName}</span>
      <div className="flex items-center gap-2 text-xs font-mono shrink-0">
        {change.added > 0 && <span className="text-emerald-500">+{change.added}</span>}
        {change.removed > 0 && <span className="text-red-500">-{change.removed}</span>}
      </div>
    </button>
  );
}

export function ChangedFilesList({ changes, className, variant = "card" }: ChangedFilesListProps) {
  const [showModal, setShowModal] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Scroll to selected file when modal opens
  useEffect(() => {
    if (showModal && selectedFilePath) {
      const fileElement = fileRefs.current.get(selectedFilePath);
      if (fileElement) {
        setTimeout(() => {
          fileElement.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
    }
  }, [showModal, selectedFilePath]);

  const handleFileClick = (filePath: string) => {
    setSelectedFilePath(filePath);
    setShowModal(true);
  };

  // Calculate totals
  const totals = changes.reduce(
    (acc, change) => ({
      added: acc.added + change.added,
      removed: acc.removed + change.removed,
    }),
    { added: 0, removed: 0 },
  );

  if (changes.length === 0) {
    return null;
  }

  if (variant === "inline") {
    return (
      <>
        <div className={cn("flex flex-wrap gap-1", className)}>
          {changes.map((change) => {
            const fileName = getFileName(change.filePath);
            const Icon = change.isNewFile ? FilePlus : FileEdit;

            return (
              <button
                key={change.filePath}
                onClick={() => handleFileClick(change.filePath)}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted/50 hover:bg-muted border border-border text-xs font-mono transition-colors"
              >
                <Icon
                  className={cn(
                    "h-3 w-3",
                    change.isNewFile ? "text-emerald-500" : "text-amber-500",
                  )}
                />
                <span className="text-foreground truncate max-w-[120px]">{fileName}</span>
                {change.added > 0 && <span className="text-emerald-500">+{change.added}</span>}
                {change.removed > 0 && <span className="text-red-500">-{change.removed}</span>}
              </button>
            );
          })}
        </div>

        {/* Dialog with all diffs */}
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent
            className="max-w-6xl max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0"
            showCloseButton={true}
          >
            <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
              <DialogTitle>Changed Files ({changes.length})</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto p-4">
              <div className="space-y-6">
                {changes.map((change) => (
                  <div
                    key={change.filePath}
                    ref={(el) => {
                      if (el) fileRefs.current.set(change.filePath, el);
                    }}
                    className="scroll-mt-4"
                  >
                    <FileDiffView
                      filePath={change.filePath}
                      oldContent={change.oldContent}
                      newContent={change.newContent}
                      isNewFile={change.isNewFile}
                      defaultCollapsed={false}
                    />
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <div className={cn("border border-border bg-card", className)}>
        {/* Header */}
        <div className="w-full flex items-center gap-2 px-4 py-3 bg-muted/30">
          <FileDiff className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground flex-1">
            Changed Files ({changes.length})
          </span>
          <div className="flex items-center gap-2 text-xs font-mono">
            {totals.added > 0 && <span className="text-emerald-500">+{totals.added}</span>}
            {totals.removed > 0 && <span className="text-red-500">-{totals.removed}</span>}
          </div>
        </div>

        {/* File list - always visible */}
        <div className="border-t border-border px-1 py-1">
          {changes.map((change) => (
            <FileChangeItem
              key={change.filePath}
              change={change}
              onClick={() => handleFileClick(change.filePath)}
            />
          ))}
        </div>
      </div>

      {/* Dialog with all diffs */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent
          className="sm:max-w-full h-svh overflow-hidden flex flex-col p-0 gap-0"
          showCloseButton={true}
        >
          <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
            <DialogTitle>Changed Files ({changes.length})</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-4">
            <div className="space-y-6">
              {changes.map((change) => (
                <div
                  key={change.filePath}
                  ref={(el) => {
                    if (el) fileRefs.current.set(change.filePath, el);
                  }}
                  className="scroll-mt-4"
                >
                  <FileDiffView
                    filePath={change.filePath}
                    oldContent={change.oldContent}
                    newContent={change.newContent}
                    isNewFile={change.isNewFile}
                    defaultCollapsed={false}
                  />
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Summary badge for changed files count
 */
interface ChangedFilesBadgeProps {
  changes: FileChange[];
  onClick?: () => void;
  className?: string;
}

export function ChangedFilesBadge({ changes, onClick, className }: ChangedFilesBadgeProps) {
  const totals = changes.reduce(
    (acc, change) => ({
      added: acc.added + change.added,
      removed: acc.removed + change.removed,
    }),
    { added: 0, removed: 0 },
  );

  if (changes.length === 0) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 bg-muted/50 hover:bg-muted border border-border text-sm transition-colors",
        className,
      )}
    >
      <FileDiff className="h-4 w-4 text-muted-foreground" />
      <span className="text-foreground">
        {changes.length} file{changes.length !== 1 ? "s" : ""}
      </span>
      <div className="flex items-center gap-1 font-mono text-xs">
        {totals.added > 0 && <span className="text-emerald-500">+{totals.added}</span>}
        {totals.removed > 0 && <span className="text-red-500">-{totals.removed}</span>}
      </div>
    </button>
  );
}
