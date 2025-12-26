/**
 * Server Module
 *
 * Exports server configuration and utilities.
 */

export { serverOptions } from "./options";

/**
 * Find an available port starting from the given port.
 * Tries ports sequentially up to startPort + maxTries.
 *
 * @param startPort - Port to start trying from
 * @param maxTries - Maximum number of ports to try
 * @returns Available port number
 * @throws Error if no port is available
 */
export async function findAvailablePort(startPort: number, maxTries: number = 10): Promise<number> {
  for (let i = 0; i < maxTries; i++) {
    const port = startPort + i;
    const isAvailable = await checkPortAvailable(port);
    if (isAvailable) {
      return port;
    }
  }
  throw new Error(`No available port found between ${startPort} and ${startPort + maxTries - 1}`);
}

/**
 * Check if a port is available by attempting to bind to it.
 *
 * @param port - Port number to check
 * @returns true if port is available, false otherwise
 */
async function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const server = Bun.serve({
        port,
        hostname: "127.0.0.1",
        fetch: () => new Response(""),
      });
      server.stop();
      resolve(true);
    } catch {
      resolve(false);
    }
  });
}
