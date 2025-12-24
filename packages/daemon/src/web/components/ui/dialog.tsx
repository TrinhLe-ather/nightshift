/**
 * Dialog Component
 *
 * A modal dialog for confirmations and forms.
 * Uses native dialog element with React portal.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

function Dialog({ open, onClose, children }: DialogProps) {
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/80" onClick={onClose} aria-hidden="true" />
      {/* Content */}
      <div className="relative z-50 max-h-[85vh] w-full max-w-lg overflow-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
        {children}
      </div>
    </div>,
    document.body,
  );
}

interface DialogHeaderProps {
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

function DialogHeader({ children, onClose, className }: DialogHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-[var(--color-border)] p-6",
        className,
      )}
    >
      <div>{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          className="rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function DialogTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn("text-lg font-semibold text-[var(--color-text-primary)]", className)}>
      {children}
    </h2>
  );
}

function DialogDescription({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={cn("text-sm text-[var(--color-text-secondary)]", className)}>{children}</p>;
}

function DialogContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-6", className)}>{children}</div>;
}

function DialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 border-t border-[var(--color-border)] p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter };
