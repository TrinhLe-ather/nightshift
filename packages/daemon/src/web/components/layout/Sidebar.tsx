import { NavLink } from "react-router-dom";
import { FolderGit2, LayoutDashboard, ListTodo, Moon, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
}

const navItems: NavItem[] = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/tasks", icon: ListTodo, label: "Tasks" },
  { to: "/repos", icon: FolderGit2, label: "Repos" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-[var(--color-border)] px-6">
        <Moon className="h-6 w-6 text-[var(--color-accent)]" />
        <span className="text-lg font-semibold text-[var(--color-text-primary)]">Night Shift</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]",
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-[var(--color-border)] p-4">
        <div className="text-xs text-[var(--color-text-muted)]">
          Press <kbd className="rounded bg-[var(--color-surface-hover)] px-1.5 py-0.5">?</kbd> for
          keyboard shortcuts
        </div>
      </div>
    </aside>
  );
}
