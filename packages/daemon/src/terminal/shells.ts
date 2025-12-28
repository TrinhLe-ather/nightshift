import { existsSync } from "node:fs";

export interface ShellInfo {
  id: string;
  name: string;
  path: string;
}

const UNIX_SHELLS: ShellInfo[] = [
  { id: "zsh", name: "Zsh", path: "/bin/zsh" },
  { id: "bash", name: "Bash", path: "/bin/bash" },
  { id: "fish", name: "Fish", path: "/usr/local/bin/fish" },
  { id: "fish-opt", name: "Fish", path: "/opt/homebrew/bin/fish" },
  { id: "sh", name: "Sh", path: "/bin/sh" },
];

const WINDOWS_SHELLS: ShellInfo[] = [
  { id: "powershell", name: "PowerShell", path: "powershell.exe" },
  { id: "pwsh", name: "PowerShell Core", path: "pwsh.exe" },
  { id: "cmd", name: "Command Prompt", path: "cmd.exe" },
  { id: "gitbash", name: "Git Bash", path: "C:\\Program Files\\Git\\bin\\bash.exe" },
];

function isShellAvailable(shell: ShellInfo): boolean {
  const isWindows = process.platform === "win32";

  if (isWindows) {
    // On Windows, check common locations or rely on PATH
    if (shell.path.includes("\\")) {
      return existsSync(shell.path);
    }
    // For shells in PATH (powershell.exe, cmd.exe, pwsh.exe), assume available
    // cmd.exe and powershell.exe are always available on Windows
    if (shell.id === "cmd" || shell.id === "powershell") {
      return true;
    }
    // For pwsh, try to check if it exists
    try {
      Bun.spawnSync(["where", shell.path], { stdout: "ignore", stderr: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  // Unix: check if path exists
  return existsSync(shell.path);
}

export function getAvailableShells(): ShellInfo[] {
  const isWindows = process.platform === "win32";
  const candidates = isWindows ? WINDOWS_SHELLS : UNIX_SHELLS;

  const available: ShellInfo[] = [];
  const seenNames = new Set<string>();

  for (const shell of candidates) {
    if (isShellAvailable(shell) && !seenNames.has(shell.name)) {
      available.push(shell);
      seenNames.add(shell.name);
    }
  }

  return available;
}

export function getDefaultShell(): string {
  const isWindows = process.platform === "win32";

  if (isWindows) {
    return process.env.COMSPEC || "cmd.exe";
  }

  return process.env.SHELL || "/bin/bash";
}

export function resolveShell(shellId: string | null | undefined): string {
  if (!shellId || shellId === "auto") {
    return getDefaultShell();
  }

  const available = getAvailableShells();
  const shell = available.find((s) => s.id === shellId);

  if (shell) {
    return shell.path;
  }

  // Fallback to default if configured shell not found
  return getDefaultShell();
}
