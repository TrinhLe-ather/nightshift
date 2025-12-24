/**
 * Toast Component
 *
 * A notification that appears temporarily.
 * Uses a simple context-based approach for global toast management.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/web/lib/utils";

type ToastVariant = "default" | "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const addToast = React.useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast = { ...toast, id };
    setToasts((prev) => [...prev, newToast]);

    // Auto-remove after duration
    const duration = toast.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>,
    document.body,
  );
}

const variantIcons = {
  default: null,
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const variantColors = {
  default: "border-[var(--color-border)]",
  success: "border-[var(--color-success)]",
  error: "border-[var(--color-destructive)]",
  warning: "border-[var(--color-warning)]",
  info: "border-[var(--color-info)]",
};

const variantIconColors = {
  default: "text-[var(--color-text-primary)]",
  success: "text-[var(--color-success)]",
  error: "text-[var(--color-destructive)]",
  warning: "text-[var(--color-warning)]",
  info: "text-[var(--color-info)]",
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const variant = toast.variant ?? "default";
  const Icon = variantIcons[variant];

  return (
    <div
      className={cn(
        "flex w-80 items-start gap-3 rounded-[var(--radius-lg)] border bg-[var(--color-surface)] p-4 shadow-lg",
        variantColors[variant],
      )}
    >
      {Icon && <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", variantIconColors[variant])} />}
      <div className="flex-1">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{toast.title}</p>
        {toast.description && (
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{toast.description}</p>
        )}
      </div>
      <button
        onClick={onClose}
        className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
