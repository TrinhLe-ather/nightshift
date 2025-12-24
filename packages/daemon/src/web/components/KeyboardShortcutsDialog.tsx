/**
 * Keyboard Shortcuts Dialog
 *
 * Shows all available keyboard shortcuts.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui";
import { KEYBOARD_SHORTCUTS } from "@/hooks/useKeyboardShortcuts";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader onClose={onClose}>
        <DialogTitle>Keyboard Shortcuts</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-6">
          {KEYBOARD_SHORTCUTS.map((category) => (
            <div key={category.category}>
              <h3 className="mb-3 text-sm font-medium text-[var(--color-text-muted)]">
                {category.category}
              </h3>
              <div className="space-y-2">
                {category.shortcuts.map((shortcut) => (
                  <div key={shortcut.description} className="flex items-center justify-between">
                    <span className="text-sm text-[var(--color-text-secondary)]">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <span key={i}>
                          {i > 0 && <span className="mx-1 text-[var(--color-text-muted)]">/</span>}
                          <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-1.5 py-0.5 text-xs font-medium text-[var(--color-text-primary)]">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
