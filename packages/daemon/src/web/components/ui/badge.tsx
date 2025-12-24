/**
 * Badge Component
 *
 * A small label for status indicators and tags.
 */

import * as React from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-[var(--radius-sm)] px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-[var(--color-accent)] text-white",
        secondary:
          "bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border)]",
        destructive: "bg-[var(--color-destructive)] text-white",
        success: "bg-[var(--color-success)] text-white",
        warning: "bg-[var(--color-warning)] text-black",
        outline: "border border-[var(--color-border)] text-[var(--color-text-secondary)]",
        // Task status variants
        pending:
          "bg-[var(--color-info)]/20 text-[var(--color-info)] border border-[var(--color-info)]/30",
        running:
          "bg-[var(--color-accent)]/20 text-[var(--color-accent)] border border-[var(--color-accent)]/30",
        completed:
          "bg-[var(--color-success)]/20 text-[var(--color-success)] border border-[var(--color-success)]/30",
        failed:
          "bg-[var(--color-destructive)]/20 text-[var(--color-destructive)] border border-[var(--color-destructive)]/30",
        canceled:
          "bg-[var(--color-text-muted)]/20 text-[var(--color-text-muted)] border border-[var(--color-text-muted)]/30",
        paused:
          "bg-[var(--color-warning)]/20 text-[var(--color-warning)] border border-[var(--color-warning)]/30",
        // Priority variants
        low: "bg-[var(--color-priority-low)]/20 text-[var(--color-priority-low)]",
        medium: "bg-[var(--color-priority-medium)]/20 text-[var(--color-priority-medium)]",
        high: "bg-[var(--color-priority-high)]/20 text-[var(--color-priority-high)]",
        urgent: "bg-[var(--color-priority-urgent)]/20 text-[var(--color-priority-urgent)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
