import { existsSync } from "node:fs";

export interface ShellInfo {
  id: string;
  name: string;
  path: string;
  /** Optional arguments to pass when spawning the shell */
  args?: string[];
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
  // WSL shells are added dynamically via getWslShells()
];

/**
 * Get list of installed WSL distributions
 */
function getWslDistros(): string[] {
  try {
    const result = Bun.spawnSync(["wsl", "--list", "--quiet"], {
      stdout: "pipe",
      stderr: "ignore",
    });

    if (result.exitCode !== 0) {
      return [];
    }

    const output = result.stdout.toString();
    // WSL outputs UTF-16LE, parse it and filter empty lines
    return output
      .replace(/\0/g, "") // Remove null bytes from UTF-16
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line !== "Windows Subsystem for Linux");
  } catch {
    return [];
  }
}

/**
 * Check if WSL is available on the system
 */
function isWslAvailable(): boolean {
  try {
    const result = Bun.spawnSync(["wsl", "--status"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get WSL shells dynamically based on installed distros
 */
function getWslShells(): ShellInfo[] {
  if (!isWslAvailable()) {
    return [];
  }

  const shells: ShellInfo[] = [
    { id: "wsl", name: "WSL (Default)", path: "wsl.exe" },
  ];

  const distros = getWslDistros();
  for (const distro of distros) {
    shells.push({
      id: `wsl-${distro.toLowerCase()}`,
      name: `WSL ${distro}`,
      path: "wsl.exe",
      args: ["-d", distro],
    });
  }

  return shells;
}

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

  // On Windows, add dynamically detected WSL shells
  if (isWindows) {
    const wslShells = getWslShells();
    for (const shell of wslShells) {
      available.push(shell);
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
  return resolveShellInfo(shellId).path;
}

/**
 * Resolve shell ID to full ShellInfo (includes args for WSL)
 */
export function resolveShellInfo(shellId: string | null | undefined): ShellInfo {
  const defaultShell: ShellInfo = {
    id: "default",
    name: "Default Shell",
    path: getDefaultShell(),
  };

  if (!shellId || shellId === "auto") {
    return defaultShell;
  }

  const available = getAvailableShells();
  const shell = available.find((s) => s.id === shellId);

  if (shell) {
    return shell;
  }

  // Fallback to default if configured shell not found
  return defaultShell;
}
