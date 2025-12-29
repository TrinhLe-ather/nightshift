/**
 * Keyboard Shortcuts Dialog
 *
 * Shows all available keyboard shortcuts.
 */

import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle } from "@/components/ui/modal";
import { KEYBOARD_SHORTCUTS } from "@/hooks/useKeyboardShortcuts";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Keyboard Shortcuts</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-6">
          {KEYBOARD_SHORTCUTS.map((category) => (
            <div key={category.category}>
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                {category.category}
              </h3>
              <div className="space-y-2">
                {category.shortcuts.map((shortcut) => (
                  <div key={shortcut.description} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <span key={i}>
                          {i > 0 && <span className="mx-1 text-muted-foreground">/</span>}
                          <kbd className="inline-flex min-w-6 items-center justify-center border border-border bg-background px-1.5 py-0.5 text-xs font-medium text-foreground">
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
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
