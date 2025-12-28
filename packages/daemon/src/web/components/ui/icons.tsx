import { HugeiconsIcon, type HugeiconsIconProps } from "@hugeicons/react";
import {
  Activity01Icon,
  AlertCircleIcon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  BubbleChatIcon,
  Cancel01Icon,
  CancelCircleIcon,
  CheckListIcon,
  Tick02Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Copy01Icon,
  DashboardSquare01Icon,
  Delete02Icon,
  Download01Icon,
  File01Icon,
  FileAddIcon,
  FileEditIcon,
  Folder02Icon,
  FolderSearchIcon,
  GitBranchIcon,
  GitCompareIcon,
  GitPullRequestIcon,
  Globe02Icon,
  InformationCircleIcon,
  LinkSquare01Icon,
  Loading03Icon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  PlusSignIcon,
  QrCode01Icon,
  Refresh01Icon,
  Search01Icon,
  Sent02Icon,
  Settings01Icon,
  ComputerTerminal01Icon,
  SidebarRightIcon,
  ViewIcon,
  Wifi01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

type IconProps = Omit<HugeiconsIconProps, "icon"> & {
  className?: string;
};

function makeIcon(displayName: string, icon: HugeiconsIconProps["icon"]) {
  function Icon({ className, ...props }: IconProps) {
    return <HugeiconsIcon icon={icon} className={cn(className)} {...props} />;
  }
  Icon.displayName = displayName;
  return Icon;
}

// Mappings: lucide-react name -> hugeicons equivalent (best-effort).
export const Search = makeIcon("Search", Search01Icon);
export const ChevronDown = makeIcon("ChevronDown", ArrowDown01Icon);
export const ChevronLeft = makeIcon("ChevronLeft", ArrowLeft01Icon);
export const ChevronRight = makeIcon("ChevronRight", ArrowRight01Icon);
export const ArrowLeft = makeIcon("ArrowLeft", ArrowLeft01Icon);
export const ExternalLink = makeIcon("ExternalLink", LinkSquare01Icon);

export const GitBranch = makeIcon("GitBranch", GitBranchIcon);
export const GitPullRequest = makeIcon("GitPullRequest", GitPullRequestIcon);
export const FileDiff = makeIcon("FileDiff", GitCompareIcon);

export const Loader2 = makeIcon("Loader2", Loading03Icon);
export const Terminal = makeIcon("Terminal", ComputerTerminal01Icon);

export const Folder = makeIcon("Folder", Folder02Icon);
export const FolderGit2 = makeIcon("FolderGit2", Folder02Icon);

export const LayoutDashboard = makeIcon("LayoutDashboard", DashboardSquare01Icon);
export const ListTodo = makeIcon("ListTodo", CheckListIcon);
export const Workflow = makeIcon("Workflow", Activity01Icon);

export const Moon = makeIcon("Moon", MoonIcon);
export const Settings = makeIcon("Settings", Settings01Icon);

export const AlertCircle = makeIcon("AlertCircle", AlertCircleIcon);
export const Check = makeIcon("Check", Tick02Icon);
export const CheckCircle2 = makeIcon("CheckCircle2", CheckmarkCircle02Icon);
export const Download = makeIcon("Download", Download01Icon);
export const RefreshCw = makeIcon("RefreshCw", Refresh01Icon);

export const Plus = makeIcon("Plus", PlusSignIcon);
export const Trash2 = makeIcon("Trash2", Delete02Icon);

export const X = makeIcon("X", Cancel01Icon);
export const XCircle = makeIcon("XCircle", CancelCircleIcon);

export const Clock = makeIcon("Clock", Clock01Icon);
export const Activity = makeIcon("Activity", Activity01Icon);
export const Pause = makeIcon("Pause", PauseIcon);
export const Play = makeIcon("Play", PlayIcon);
export const Info = makeIcon("Info", InformationCircleIcon);
export const MessageSquare = makeIcon("MessageSquare", BubbleChatIcon);
export const Send = makeIcon("Send", Sent02Icon);
export const ChevronUp = makeIcon("ChevronUp", ArrowUp01Icon);
export const SidebarRight = makeIcon("SidebarRight", SidebarRightIcon);

// File icons
export const File = makeIcon("File", File01Icon);
export const FileEdit = makeIcon("FileEdit", FileEditIcon);
export const FileCode = makeIcon("FileCode", FileEditIcon);
export const FilePlus = makeIcon("FilePlus", FileAddIcon);
export const FolderSearch = makeIcon("FolderSearch", FolderSearchIcon);
export const Globe = makeIcon("Globe", Globe02Icon);
export const Eye = makeIcon("Eye", ViewIcon);

// Edit icons
export const Pencil = makeIcon("Pencil", FileEditIcon);

// LAN/Network icons
export const Wifi = makeIcon("Wifi", Wifi01Icon);
export const QrCode = makeIcon("QrCode", QrCode01Icon);
export const Copy = makeIcon("Copy", Copy01Icon);
