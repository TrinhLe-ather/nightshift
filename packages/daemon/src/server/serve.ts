import { loadConfig } from "@/config";

import { findAvailablePort, serverOptions } from "./index";

export const serve = async () => {
  const config = loadConfig();

  let actualPort: number;
  try {
    actualPort = await findAvailablePort(config.port, 11);
    if (actualPort !== config.port) {
      console.log(`Port ${config.port} in use, using port ${actualPort} instead`);
    }
  } catch {
    console.error(`Could not find available port between ${config.port} and ${config.port + 10}`);
    process.exit(1);
  }

  const server = Bun.serve({
    port: actualPort,
    ...serverOptions,
  });

  console.log(`Night Shift running at http://localhost:${server.port}`);
};

serve().catch((error) => {
  console.error("Could not start dev server:", error);
  process.exit(1);
});
