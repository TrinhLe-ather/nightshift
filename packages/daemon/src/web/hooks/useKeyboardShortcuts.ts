/**
 * Keyboard Shortcuts Hook
 *
 * Provides global keyboard shortcut handling.
 */

import { useCallback, useEffect } from "react";

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
  preventDefault?: boolean;
}

/**
 * Hook to register keyboard shortcuts
 */
export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        // Only allow Escape to work in input fields
        if (event.key !== "Escape") {
          return;
        }
      }

      for (const shortcut of shortcuts) {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = shortcut.ctrl ? event.ctrlKey : !event.ctrlKey;
        const metaMatch = shortcut.meta ? event.metaKey : !event.metaKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;

        // For Cmd+K, accept either Ctrl or Meta
        const cmdOrCtrl = shortcut.meta && !shortcut.ctrl;
        const modifierMatch = cmdOrCtrl
          ? (event.metaKey || event.ctrlKey) && !event.altKey
          : ctrlMatch && metaMatch && altMatch;

        if (keyMatch && modifierMatch && shiftMatch) {
          if (shortcut.preventDefault !== false) {
            event.preventDefault();
          }
          shortcut.handler();
          return;
        }
      }
    },
    [shortcuts],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}

/**
 * List of all available keyboard shortcuts for the help dialog
 */
export const KEYBOARD_SHORTCUTS = [
  {
    category: "Global",
    shortcuts: [
      { keys: ["⌘", "K"], description: "New task" },
      { keys: ["?"], description: "Show keyboard shortcuts" },
      { keys: ["Esc"], description: "Close dialog/overlay" },
    ],
  },
  {
    category: "Navigation",
    shortcuts: [
      { keys: ["j", "↓"], description: "Move down" },
      { keys: ["k", "↑"], description: "Move up" },
      { keys: ["Enter"], description: "Open selected item" },
    ],
  },
];
