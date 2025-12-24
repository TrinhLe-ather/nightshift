# NightShift

A daemon-based task automation system for Claude Code.

## Project Structure

```
nightshift/
├── packages/
│   ├── daemon/     # Primary package - CLI daemon (Phase 0)
│   ├── shared/     # Cross-boundary contracts
│   ├── admin/      # Control Center UI (Phase 1)
│   └── backend/    # Convex functions (Phase 1)
```

## Development

### Prerequisites

- [Bun](https://bun.sh/) (latest stable)

### Setup

```bash
bun install
```

### Commands

```bash
# Type check all packages
bun run typecheck

# Run daemon in development
bun run dev

# Build daemon executable
bun run build
```

## Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript
- **Package Manager:** Bun (native workspaces)
