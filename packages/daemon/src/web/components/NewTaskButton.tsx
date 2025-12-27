/**
 * New Task Button Component
 *
 * Reusable button to open command palette for creating new tasks.
 * Used across Dashboard, Tasks page, and TaskListSidebar.
 */

import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Plus } from "@/components/ui/icons";
import { type ComponentProps } from "react";
import { useNewTaskDialog } from "../contexts/newTaskDialog";

interface NewTaskButtonProps {
  /**
   * Button size variant
   * @default "default"
   */
  size?: ComponentProps<typeof Button>["size"];
  /**
   * Button variant
   * @default "default"
   */
  variant?: ComponentProps<typeof Button>["variant"];
  /**
   * Whether to show keyboard shortcut hint
   * @default true
   */
  showKbd?: boolean;
  /**
   * Custom className for the button
   */
  className?: string;
  /**
   * Whether to show text label
   * @default true
   */
  showLabel?: boolean;
}

export function NewTaskButton({
  size = "default",
  variant = "default",
  showKbd = true,
  className,
  showLabel = true,
}: NewTaskButtonProps) {
  const newTaskDialog = useNewTaskDialog();

  return (
    <Button
      onClick={() => newTaskDialog.open()}
      size={size}
      variant={variant}
      className={className}
    >
      <Plus className="h-4 w-4" />
      {showLabel && "New Task"}
      {showKbd && (
        <KbdGroup className="ml-2 hidden sm:inline-flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      )}
    </Button>
  );
}
