export async function isPortAvailable(port: number): Promise<boolean> {
  try {
    const server = Bun.serve({
      port,
      fetch() {
        return new Response();
      },
    });
    server.stop(true);
    return true;
  } catch {
    return false;
  }
}

export async function findAvailablePort(
  preferredPort: number,
  maxAttempts = 10
): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = preferredPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(
    `Could not find available port starting from ${preferredPort}`
  );
}
