import { useCallback, useMemo, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "@/components/layout";
import { CommandPalette, KeyboardShortcutsDialog } from "@/web/components";
import {
  Dashboard,
  Repos,
  Settings,
  TaskChat,
  Tasks,
  Workflows,
  WorkflowDetail,
  WorkflowForm,
} from "@/web/pages";
import { useKeyboardShortcuts } from "@/web/hooks";
import { CommandPaletteProvider } from "@/web/contexts/commandPalette";

function App() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  const openCommandPalette = useCallback(() => setShowCommandPalette(true), []);
  const closeCommandPalette = useCallback(() => setShowCommandPalette(false), []);

  // Define keyboard shortcuts
  const shortcuts = useMemo(
    () => [
      {
        key: "k",
        meta: true,
        handler: openCommandPalette,
      },
      {
        key: "?",
        handler: () => setShowShortcuts(true),
      },
      {
        key: "Escape",
        handler: () => {
          setShowShortcuts(false);
          closeCommandPalette();
        },
        preventDefault: false,
      },
    ],
    [closeCommandPalette, openCommandPalette],
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <CommandPaletteProvider
      value={{
        isOpen: showCommandPalette,
        setOpen: setShowCommandPalette,
        open: openCommandPalette,
        close: closeCommandPalette,
      }}
    >
      <>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/tasks/:id" element={<TaskChat />} />
            <Route path="/workflows" element={<Workflows />} />
            <Route path="/workflows/new" element={<WorkflowForm mode="create" />} />
            <Route path="/workflows/:id" element={<WorkflowDetail />} />
            <Route path="/workflows/:id/edit" element={<WorkflowForm mode="edit" />} />
            <Route path="/repos" element={<Repos />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>

        {/* Global Dialogs */}
        <KeyboardShortcutsDialog open={showShortcuts} onClose={() => setShowShortcuts(false)} />
        <CommandPalette open={showCommandPalette} onClose={closeCommandPalette} />
      </>
    </CommandPaletteProvider>
  );
}

export default App;
