# NightShift

A daemon-based task automation system for Claude Code. NightShift runs as a local daemon that manages a task queue, executes tasks via Claude Code, and provides a web UI for monitoring and control.

## Features

- **Task Queue** - Add tasks via CLI or API, managed in a SQLite database
- **Parallel Execution** - Run multiple tasks concurrently using git worktrees
- **Web Dashboard** - Monitor tasks, sessions, and repositories in real-time
- **Git Integration** - Automatic commits, pushes, and PR creation
- **Session Logging** - Detailed execution logs for debugging

## Installation

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/sipherxyz/nightshift/main/packages/daemon/scripts/install.sh | bash
```

This installs the `nightshift` binary to `~/.nightshift/bin`. Add it to your PATH:

```bash
export PATH="$HOME/.nightshift/bin:$PATH"
```

### Windows

```powershell
irm https://raw.githubusercontent.com/sipherxyz/nightshift/main/packages/daemon/scripts/install.ps1 | iex
```

This installs `nightshift.exe` to `~\.nightshift\bin` and adds it to your PATH automatically.

**Options:**
```powershell
# Install specific version
.\install.ps1 -Version 0.2.0

# Skip PATH update
.\install.ps1 -NoPathUpdate
```

**Requirements:** [Claude Code](https://claude.ai/code) CLI must be installed and authenticated.

## Quick Start

```bash
# Start the daemon (opens web UI in browser)
nightshift start

# Check daemon and task status
nightshift status

# Stop the daemon
nightshift stop
```

### CLI Commands

| Command | Description |
|---------|-------------|
| `nightshift start` | Start the daemon (background by default) |
| `nightshift start -i` | Start in foreground (interactive mode) |
| `nightshift stop` | Stop the daemon gracefully |
| `nightshift restart` | Restart the daemon |
| `nightshift status` | Show daemon status and active tasks |
| `nightshift update` | Check and install latest update |
| `nightshift repos list` | List configured repositories |
| `nightshift repos add /path` | Add a repository |
| `nightshift config` | Open settings in browser |
| `nightshift doctor` | Validate system setup |
| `nightshift version` | Show current version |

### Web UI

The web dashboard is available at `http://localhost:3847` when the daemon is running. Use it to:

- View and manage tasks
- Monitor execution sessions
- Configure repositories and settings

<img width="1177" height="857" alt="image" src="https://github.com/user-attachments/assets/8cd813e1-a06c-4912-8723-18ef137be963" />

<img width="1177" height="858" alt="image" src="https://github.com/user-attachments/assets/2e92c0ff-1be8-4562-853c-7e3e7f9a964c" />

<img width="1174" height="857" alt="image" src="https://github.com/user-attachments/assets/f520bd61-4686-4084-aa37-65d264e5c6da" />

### LAN Access (Mobile)

Connect to NightShift from your mobile device on the same Wi-Fi network.

**Enable LAN access:**

1. Add `"allowLan": true` to your config file (`~/.nightshift/config.json`)
2. Restart the daemon
3. The CLI will display a PIN and local IP address
4. On your mobile device, navigate to the URL or scan the QR code from Settings
5. Enter the 4-digit PIN to authenticate

**Windows Firewall Setup:**

On Windows, you need to allow incoming connections on port 3847. Run this command in an **Administrator PowerShell**:

```powershell
netsh advfirewall firewall add rule name="NightShift LAN Access" dir=in action=allow protocol=tcp localport=3847
```

You can verify the setup with `nightshift doctor`.

---

## Development

### Project Structure

```
nightshift/
├── packages/
│   ├── daemon/     # CLI daemon with embedded web server
│   ├── shared/     # Cross-boundary contracts (types, schemas)
│   ├── admin/      # Control Center UI (Phase 1)
│   └── backend/    # Convex functions (Phase 1)
```

### Prerequisites

- [Bun](https://bun.sh/) v1.3.5+
- [Claude Code](https://claude.ai/code) CLI installed

### Setup

```bash
# Clone the repository
git clone https://github.com/sipherxyz/nightshift.git
cd nightshift

# Install dependencies
bun install
```

### Running the Daemon

```bash
# Start daemon in development mode with hot reload
bun run daemon dev

# Run CLI commands in development
bun run daemon cli status
bun run daemon cli add "your task prompt"
```

### Database Commands

```bash
bun run daemon db:generate   # Generate migrations
bun run daemon db:migrate    # Run migrations
bun run daemon db:push       # Push schema changes
bun run daemon db:studio     # Open Drizzle Studio
```

### Build

```bash
# Build all packages
bun run build

# Build daemon executable only
bun run daemon build
# Output: packages/daemon/dist/nightshift
```

### Code Quality

```bash
bun run typecheck   # Type check all packages (tsgo)
bun run lint        # Lint all packages (oxlint)
bun run format      # Format all packages (oxfmt)
```

## Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript
- **Database:** SQLite + Drizzle ORM
- **API:** oRPC (type-safe RPC)
- **Web UI:** React 19, TanStack Query, Tailwind v4
