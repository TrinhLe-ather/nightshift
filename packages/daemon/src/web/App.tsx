import { useMemo, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "@/components/layout";
import { CommandPalette, KeyboardShortcutsDialog } from "@/web/components";
import { Dashboard, Repos, Settings, TaskDetail, Tasks } from "@/web/pages";
import { useKeyboardShortcuts } from "@/web/hooks";

function App() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // Define keyboard shortcuts
  const shortcuts = useMemo(
    () => [
      {
        key: "k",
        meta: true,
        handler: () => setShowCommandPalette(true),
      },
      {
        key: "?",
        handler: () => setShowShortcuts(true),
      },
      {
        key: "Escape",
        handler: () => {
          setShowShortcuts(false);
          setShowCommandPalette(false);
        },
        preventDefault: false,
      },
    ],
    [],
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />
          <Route path="/repos" element={<Repos />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>

      {/* Global Dialogs */}
      <KeyboardShortcutsDialog open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <CommandPalette open={showCommandPalette} onClose={() => setShowCommandPalette(false)} />
    </>
  );
}

export default App;
