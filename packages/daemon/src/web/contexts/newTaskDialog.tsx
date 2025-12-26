/**
 * New Task Dialog Context
 *
 * Provides global access to the NewTaskDialog for opening from anywhere in the app.
 */

import { createContext, useContext, type ReactNode } from "react";

export type NewTaskDialogContextValue = {
  isOpen: boolean;
  setOpen: (next: boolean) => void;
  open: () => void;
  close: () => void;
};

const NewTaskDialogContext = createContext<NewTaskDialogContextValue | null>(null);

export function NewTaskDialogProvider({
  value,
  children,
}: {
  value: NewTaskDialogContextValue;
  children: ReactNode;
}) {
  return <NewTaskDialogContext.Provider value={value}>{children}</NewTaskDialogContext.Provider>;
}

export function useNewTaskDialog() {
  const ctx = useContext(NewTaskDialogContext);
  if (!ctx) {
    throw new Error("useNewTaskDialog must be used within NewTaskDialogProvider");
  }
  return ctx;
}
