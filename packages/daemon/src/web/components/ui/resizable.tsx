"use client";

import * as React from "react";
import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ResizablePanelGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: "horizontal" | "vertical";
  children: React.ReactNode;
  /**
   * Called whenever the first (left/top) panel size changes, as a percentage (0-100).
   * Useful for persisting layout state (e.g., localStorage).
   */
  onResize?: (leftSize: number) => void;
}

interface PanelConfig {
  defaultSize: number;
  minSize: number;
  maxSize: number;
}

function ResizablePanelGroup({
  className,
  direction = "horizontal",
  children,
  onResize,
  ...props
}: ResizablePanelGroupProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftSize, setLeftSize] = useState<number | null>(null);
  const panelConfigsRef = useRef<PanelConfig[]>([]);

  // Extract panel configs from children on mount
  React.useEffect(() => {
    const configs: PanelConfig[] = [];
    React.Children.forEach(children, (child) => {
      if (React.isValidElement<ResizablePanelProps>(child) && child.type === ResizablePanel) {
        configs.push({
          defaultSize: child.props.defaultSize ?? 50,
          minSize: child.props.minSize ?? 0,
          maxSize: child.props.maxSize ?? 100,
        });
      }
    });
    panelConfigsRef.current = configs;
    if (configs.length > 0 && leftSize === null) {
      setLeftSize(configs[0]?.defaultSize ?? 50);
    }
  }, [children, leftSize]);

  const handleResize = useCallback(
    (newLeftSize: number) => {
      const configs = panelConfigsRef.current;
      const left = configs[0];
      const right = configs[1];
      if (!left || !right) return;

      // Apply constraints
      const constrainedSize = Math.max(left.minSize, Math.min(left.maxSize, newLeftSize));

      // Check right panel constraints
      const rightSize = 100 - constrainedSize;
      if (rightSize < right.minSize || rightSize > right.maxSize) {
        return;
      }

      onResize?.(constrainedSize);
      setLeftSize(constrainedSize);
    },
    [onResize],
  );

  // Clone children and inject size props
  const childArray = React.Children.toArray(children);
  const clonedChildren = childArray.map((child, index) => {
    if (!React.isValidElement(child)) return child;

    if (child.type === ResizablePanel) {
      const panelProps = child.props as ResizablePanelProps;
      const panelIndex = childArray
        .slice(0, index)
        .filter((c) => React.isValidElement(c) && c.type === ResizablePanel).length;

      const size =
        panelIndex === 0
          ? (leftSize ?? panelProps.defaultSize ?? 50)
          : 100 - (leftSize ?? panelProps.defaultSize ?? 50);

      return React.cloneElement(child as React.ReactElement<ResizablePanelProps>, {
        ...panelProps,
        _size: size,
        _direction: direction,
      });
    }

    if (child.type === ResizableHandle) {
      const handleProps = child.props as ResizableHandleProps;
      return React.cloneElement(child as React.ReactElement<ResizableHandleProps>, {
        ...handleProps,
        _direction: direction,
        _containerRef: containerRef,
        _onResize: handleResize,
        _currentSize: leftSize ?? panelConfigsRef.current[0]?.defaultSize ?? 50,
      });
    }

    return child;
  });

  return (
    <div
      ref={containerRef}
      data-slot="resizable-panel-group"
      data-panel-group-direction={direction}
      className={cn(
        "flex h-full w-full",
        direction === "vertical" ? "flex-col" : "flex-row",
        className,
      )}
      {...props}
    >
      {clonedChildren}
    </div>
  );
}

interface ResizablePanelProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  children: React.ReactNode;
  // Internal props injected by parent
  _size?: number;
  _direction?: "horizontal" | "vertical";
}

function ResizablePanel({
  className,
  defaultSize = 50,
  children,
  _size,
  _direction = "horizontal",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  minSize,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  maxSize,
  ...props
}: ResizablePanelProps) {
  const size = _size ?? defaultSize;

  const style: React.CSSProperties =
    _direction === "horizontal"
      ? { width: `${size}%`, minWidth: 0, flexShrink: 0 }
      : { height: `${size}%`, minHeight: 0, flexShrink: 0 };

  return (
    <div
      data-slot="resizable-panel"
      className={cn("overflow-hidden", className)}
      style={style}
      {...props}
    >
      {children}
    </div>
  );
}

interface ResizableHandleProps extends React.HTMLAttributes<HTMLDivElement> {
  withHandle?: boolean;
  // Internal props injected by parent
  _direction?: "horizontal" | "vertical";
  _containerRef?: React.RefObject<HTMLDivElement | null>;
  _onResize?: (newSize: number) => void;
  _currentSize?: number;
}

function ResizableHandle({
  withHandle,
  className,
  _direction = "horizontal",
  _containerRef,
  _onResize,
  _currentSize = 50,
  ...props
}: ResizableHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();

      const startPos = _direction === "horizontal" ? e.clientX : e.clientY;
      const startSize = _currentSize;

      document.body.style.cursor = _direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!_containerRef?.current || !_onResize) return;

        const containerRect = _containerRef.current.getBoundingClientRect();
        const containerSize =
          _direction === "horizontal" ? containerRect.width : containerRect.height;

        const currentPos = _direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY;
        const delta = currentPos - startPos;
        const deltaPercent = (delta / containerSize) * 100;

        const newSize = startSize + deltaPercent;
        _onResize(newSize);
      };

      const handleMouseUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [_direction, _containerRef, _onResize, _currentSize],
  );

  return (
    <div
      ref={handleRef}
      data-slot="resizable-handle"
      onMouseDown={handleMouseDown}
      className={cn(
        "relative flex items-center justify-center bg-border shrink-0",
        "hover:bg-primary/50 active:bg-primary transition-colors",
        _direction === "horizontal" ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div
          className={cn(
            "bg-muted-foreground/60 rounded-full z-10",
            _direction === "horizontal" ? "h-8 w-1" : "w-8 h-1",
          )}
        />
      )}
    </div>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
