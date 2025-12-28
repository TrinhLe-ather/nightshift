import { useMemo, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "@/components/layout";
import { KeyboardShortcutsDialog } from "@/web/components";
import {
  Dashboard,
  // NarrativeProject,
  // NarrativeStudio,
  Repos,
  Settings,
  TaskChat,
  Tasks,
  Terminal,
  Workflows,
  WorkflowDetail,
  WorkflowForm,
} from "@/web/pages";
import { useKeyboardShortcuts } from "@/web/hooks";

function App() {
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Define keyboard shortcuts
  const shortcuts = useMemo(
    () => [
      {
        key: "?",
        handler: () => setShowShortcuts(true),
      },
      {
        key: "Escape",
        handler: () => {
          setShowShortcuts(false);
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
          <Route path="/tasks/:id" element={<TaskChat />} />
          <Route path="/workflows" element={<Workflows />} />
          <Route path="/workflows/new" element={<WorkflowForm mode="create" />} />
          <Route path="/workflows/:id" element={<WorkflowDetail />} />
          <Route path="/workflows/:id/edit" element={<WorkflowForm mode="edit" />} />
          {/* <Route path="/narrative-studio" element={<NarrativeStudio />} />
          <Route path="/narrative-studio/:id" element={<NarrativeProject />} /> */}
          <Route path="/repos" element={<Repos />} />
          <Route path="/terminal" element={<Terminal />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>

      {/* Global Dialogs */}
      <KeyboardShortcutsDialog open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </>
  );
}

export default App;
