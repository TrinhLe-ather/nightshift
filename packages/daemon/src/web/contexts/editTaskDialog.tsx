/**
 * Edit Task Dialog Context
 *
 * Provides global access to the EditTaskDialog for opening from anywhere in the app.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { Task } from "../../db/drizzle";

export type EditTaskDialogContextValue = {
  task: Task | null;
  setTask: (task: Task | null) => void;
  open: (task: Task) => void;
  close: () => void;
};

const EditTaskDialogContext = createContext<EditTaskDialogContextValue | null>(null);

export function EditTaskDialogProvider({
  value,
  children,
}: {
  value: EditTaskDialogContextValue;
  children: ReactNode;
}) {
  return <EditTaskDialogContext.Provider value={value}>{children}</EditTaskDialogContext.Provider>;
}

export function useEditTaskDialog() {
  const ctx = useContext(EditTaskDialogContext);
  if (!ctx) {
    throw new Error("useEditTaskDialog must be used within EditTaskDialogProvider");
  }
  return ctx;
}
