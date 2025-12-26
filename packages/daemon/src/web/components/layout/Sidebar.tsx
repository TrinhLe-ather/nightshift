import { NavLink, useLocation } from "react-router-dom";
import { FolderGit2, LayoutDashboard, ListTodo, Moon, Settings } from "@/components/ui/icons";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Kbd } from "@/components/ui/kbd";

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

function NavMenuItem({ item }: { item: NavItem }) {
  const location = useLocation();

  const isActive =
    item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);

  return (
    <SidebarMenuButton
      isActive={isActive}
      tooltip={item.label}
      render={<NavLink to={item.to} className="[&_svg]:size-5" />}
    >
      <item.icon size={24} />
      <span>{item.label}</span>
    </SidebarMenuButton>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      {/* Logo Header */}
      <SidebarHeader className="border-b border-sidebar-border hidden md:block">
        <div className="flex h-12 items-center gap-3 px-2">
          <Moon className="h-6 w-6 shrink-0 text-primary" />
          {!isCollapsed && (
            <span className="text-lg font-semibold text-foreground">Night Shift</span>
          )}
        </div>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.to} className="h-10">
                  <NavMenuItem item={item} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center justify-between gap-2 px-2 py-2">
          {!isCollapsed && (
            <div className="text-xs text-muted-foreground">
              Press <Kbd>?</Kbd> for shortcuts
            </div>
          )}
          <SidebarTrigger className="ml-auto" />
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
