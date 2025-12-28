"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  /** Content shown in the peek bar when collapsed */
  peekContent?: React.ReactNode;
  /** Height of the peek bar */
  peekHeight?: number;
  /** Whether to show the drag handle */
  showHandle?: boolean;
  /** Class name for the content container */
  className?: string;
}

/**
 * Mobile-optimized bottom sheet with peek state and drag handle.
 * Designed for iOS-style progressive disclosure patterns.
 */
function BottomSheet({
  open,
  onOpenChange,
  children,
  peekContent,
  peekHeight = 56,
  showHandle = true,
  className,
}: BottomSheetProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragOffset, setDragOffset] = React.useState(0);
  const startY = React.useRef(0);
  const contentRef = React.useRef<HTMLDivElement>(null);

  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    setIsDragging(true);
    startY.current = touch.clientY;
  }, []);

  const handleTouchMove = React.useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      if (!touch) return;
      const deltaY = touch.clientY - startY.current;
      // Only allow dragging down (positive delta)
      if (deltaY > 0) {
        setDragOffset(deltaY);
      }
    },
    [isDragging],
  );

  const handleTouchEnd = React.useCallback(() => {
    setIsDragging(false);
    // If dragged more than 100px, close the sheet
    if (dragOffset > 100) {
      onOpenChange(false);
    }
    setDragOffset(0);
  }, [dragOffset, onOpenChange]);

  return (
    <>
      {/* Peek bar - always visible when not fully open */}
      {!open && peekContent && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.1)] cursor-pointer"
          style={{ height: peekHeight }}
          onClick={() => onOpenChange(true)}
        >
          {showHandle && (
            <div className="flex justify-center pt-2">
              <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </div>
          )}
          <div className="px-4 py-2">{peekContent}</div>
        </div>
      )}

      {/* Full sheet */}
      <SheetPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <SheetPrimitive.Portal>
          <SheetPrimitive.Backdrop
            className={cn(
              "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm",
              "data-open:animate-in data-closed:animate-out",
              "data-closed:fade-out-0 data-open:fade-in-0",
              "duration-200",
            )}
          />
          <SheetPrimitive.Popup
            ref={contentRef}
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 flex max-h-[85svh] flex-col",
              "bg-card border-t border-border rounded-t-2xl shadow-2xl",
              "data-open:animate-in data-closed:animate-out",
              "data-closed:slide-out-to-bottom data-open:slide-in-from-bottom",
              "data-closed:fade-out-0 data-open:fade-in-0",
              "duration-300 ease-out",
              className,
            )}
            style={{
              transform: isDragging ? `translateY(${dragOffset}px)` : undefined,
              transition: isDragging ? "none" : undefined,
            }}
          >
            {/* Drag handle */}
            {showHandle && (
              <div
                className="flex justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-hidden">{children}</div>
          </SheetPrimitive.Popup>
        </SheetPrimitive.Portal>
      </SheetPrimitive.Root>
    </>
  );
}

/**
 * Floating action button for triggering bottom sheets
 */
interface FloatingActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  badge?: number;
  position?: "left" | "right";
}

function FloatingActionButton({
  icon,
  badge,
  position = "right",
  className,
  ...props
}: FloatingActionButtonProps) {
  return (
    <button
      className={cn(
        "fixed bottom-20 z-30 flex h-14 w-14 items-center justify-center",
        "rounded-full bg-primary text-primary-foreground shadow-lg",
        "active:scale-95 transition-transform",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        position === "right" ? "right-4" : "left-4",
        className,
      )}
      {...props}
    >
      {icon}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-medium text-destructive-foreground">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

export { BottomSheet, FloatingActionButton };
