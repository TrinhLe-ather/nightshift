import { useState, useCallback, useMemo } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./Sidebar";
import { Moon } from "../ui/icons";
import { NewTaskDialogProvider } from "@/web/contexts/newTaskDialog";
import { NewTaskDialog } from "../NewTaskDialog";
import { useKeyboardShortcuts } from "@/web/hooks";

export function Layout() {
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);

  const openNewTaskDialog = useCallback(() => setShowNewTaskDialog(true), []);
  const closeNewTaskDialog = useCallback(() => setShowNewTaskDialog(false), []);

  // Keyboard shortcuts for new task dialog
  const shortcuts = useMemo(
    () => [
      {
        key: "k",
        meta: true,
        handler: openNewTaskDialog,
      },
    ],
    [openNewTaskDialog],
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <NewTaskDialogProvider
      value={{
        isOpen: showNewTaskDialog,
        setOpen: setShowNewTaskDialog,
        open: openNewTaskDialog,
        close: closeNewTaskDialog,
      }}
    >
      <SidebarProvider
        className="overflow-hidden h-svh"
        style={{ "--sidebar-width-icon": "3.5rem" } as React.CSSProperties}
      >
        <AppSidebar />
        <SidebarInset className="relative overflow-hidden">
          {/* Global grid pattern background */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.02]">
            <div
              className="h-full w-full"
              style={{
                backgroundImage:
                  "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
            />
          </div>

          <div className="md:hidden shrink-0 border-b border-border bg-card text-card-foreground sticky top-0 z-20">
            <div className="flex h-12 items-center gap-2 px-3 pt-[env(safe-area-inset-top)]">
              <SidebarTrigger />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground flex items-center gap-2">
                  <Moon className="h-6 w-6 shrink-0 text-primary" />
                  <span className="text-lg font-semibold text-foreground">Night Shift</span>
                </div>
              </div>
              <div className="w-8" />
            </div>
          </div>
          <Outlet />
        </SidebarInset>
      </SidebarProvider>

      {/* Global NewTaskDialog */}
      <NewTaskDialog open={showNewTaskDialog} onOpenChange={setShowNewTaskDialog} />
    </NewTaskDialogProvider>
  );
}
