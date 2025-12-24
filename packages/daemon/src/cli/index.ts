/**
 * Night Shift CLI
 *
 * Main entry point for CLI command parsing and routing.
 */

import { startCommand } from "./commands/start";
import { stopCommand } from "./commands/stop";
import { statusCommand } from "./commands/status";
import { versionCommand } from "./commands/version";
import { doctorCommand } from "./commands/doctor";
import { configCommand } from "./commands/config";
import { addCommand } from "./commands/add";
import { reposCommand } from "./commands/repos";

/**
 * Display help message
 */
function showHelp(): void {
  console.log(`
Night Shift - AI Agent Task Automation

Usage:
  nightshift <command>

Commands:
  start      Start the daemon (opens web UI in browser)
  stop       Stop the daemon gracefully
  status     Show daemon status and active tasks
  add        Add a new task to the queue
  repos      Manage configured repositories
  config     Open settings page in browser
  doctor     Validate system setup and prerequisites
  version    Show current version
  help       Show this help message

Examples:
  nightshift start
  nightshift status
  nightshift add "Fix the login bug"
  nightshift repos add /path/to/repo
  nightshift repos list
  nightshift doctor
  nightshift stop
`);
}

/**
 * Main CLI entry point
 */
export async function cli(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "start":
      await startCommand();
      break;

    case "stop":
      await stopCommand();
      break;

    case "status":
      await statusCommand();
      break;

    case "add":
      await addCommand();
      break;

    case "repos":
      await reposCommand();
      break;

    case "config":
      await configCommand();
      break;

    case "doctor":
      await doctorCommand();
      break;

    case "version":
    case "-v":
    case "--version":
      versionCommand();
      break;

    case "help":
    case "-h":
    case "--help":
    case undefined:
      showHelp();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "nightshift help" for usage information');
      process.exit(1);
  }
}
