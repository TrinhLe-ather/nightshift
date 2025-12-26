import { createContext, useContext, type ReactNode } from "react";

export type CommandPaletteContextValue = {
  isOpen: boolean;
  setOpen: (next: boolean) => void;
  open: () => void;
  close: () => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function CommandPaletteProvider({
  value,
  children,
}: {
  value: CommandPaletteContextValue;
  children: ReactNode;
}) {
  return <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>;
}

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  }
  return ctx;
}
