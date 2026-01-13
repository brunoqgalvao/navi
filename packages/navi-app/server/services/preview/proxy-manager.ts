/**
 * Proxy Manager
 *
 * Manages Traefik reverse proxy for routing preview subdomains
 * to their respective containers.
 */
import { exec } from "child_process";
import { promisify } from "util";

import type { PreviewConfig } from "./types";

const execAsync = promisify(exec);

/**
 * Execute docker command
 */
async function docker(args: string, timeout = 30000): Promise<string> {
  const { stdout } = await execAsync(`docker ${args}`, { timeout });
  return stdout.trim();
}

const TRAEFIK_CONTAINER_NAME = "navi-proxy";

export class ProxyManager {
  private config: PreviewConfig;

  constructor(config: PreviewConfig) {
    this.config = config;
  }

  /**
   * Check if Traefik proxy is running
   */
  async isRunning(): Promise<boolean> {
    try {
      const output = await docker(
        `ps --filter "name=${TRAEFIK_CONTAINER_NAME}" --format "{{.Names}}"`
      );
      return output.includes(TRAEFIK_CONTAINER_NAME);
    } catch {
      return false;
    }
  }

  /**
   * Start Traefik proxy container
   */
  async start(): Promise<void> {
    // Check if already running
    if (await this.isRunning()) {
      return;
    }

    // Remove any existing stopped container
    try {
      await docker(`rm -f ${TRAEFIK_CONTAINER_NAME}`, 5000);
    } catch {
      // Ignore - container might not exist
    }

    const args = [
      "run", "-d",
      "--name", TRAEFIK_CONTAINER_NAME,
      "--restart", "unless-stopped",

      // Labels
      "--label", "navi.preview.proxy=true",

      // Port mapping
      "-p", `${this.config.proxyPort}:${this.config.proxyPort}`,

      // Mount Docker socket for dynamic container discovery
      "-v", "/var/run/docker.sock:/var/run/docker.sock:ro",

      // Network
      "--network", this.config.networkName,

      // Traefik image
      "traefik:v3.0",

      // Traefik CLI arguments
      "--api.dashboard=false",
      "--api.insecure=false",

      // Enable ping endpoint for health checks
      "--ping=true",
      `--ping.entryPoint=web`,

      // Entry point for web traffic
      `--entrypoints.web.address=:${this.config.proxyPort}`,

      // Docker provider for dynamic routing
      "--providers.docker=true",
      "--providers.docker.exposedbydefault=false",
      `--providers.docker.network=${this.config.networkName}`,

      // Logging
      "--log.level=WARN",
    ];

    await docker(args.join(" "), 60000);

    // Wait for Traefik to be ready
    await this.waitForReady();
  }

  /**
   * Stop Traefik proxy container
   */
  async stop(): Promise<void> {
    try {
      await docker(`stop ${TRAEFIK_CONTAINER_NAME}`, 10000);
      await docker(`rm ${TRAEFIK_CONTAINER_NAME}`, 5000);
    } catch {
      // Ignore errors
    }
  }

  /**
   * Wait for Traefik to be ready
   */
  async waitForReady(timeoutMs = 30000): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        // Check if container is running
        const status = await docker(
          `inspect ${TRAEFIK_CONTAINER_NAME} --format '{{.State.Status}}'`
        );

        if (status === "running") {
          // Try to hit the ping endpoint
          try {
            await execAsync(
              `curl -sf http://localhost:${this.config.proxyPort}/ping`,
              { timeout: 2000 }
            );
            return; // Success!
          } catch {
            // Ping not ready yet, wait and retry
          }
        }
      } catch {
        // Container not ready yet
      }

      await new Promise((r) => setTimeout(r, 500));
    }
  }

  /**
   * Get Traefik health status
   */
  async getHealth(): Promise<{
    running: boolean;
    containerId?: string;
    uptime?: number;
  }> {
    try {
      const running = await this.isRunning();
      if (!running) {
        return { running: false };
      }

      const info = await docker(
        `inspect ${TRAEFIK_CONTAINER_NAME} --format '{{.Id}} {{.State.StartedAt}}'`
      );
      const [containerId, startedAt] = info.split(" ");

      const uptime = Date.now() - new Date(startedAt).getTime();

      return {
        running: true,
        containerId,
        uptime,
      };
    } catch {
      return { running: false };
    }
  }

  /**
   * Restart Traefik proxy
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Get all routed services (containers with Traefik labels)
   */
  async getRoutedServices(): Promise<
    Array<{
      name: string;
      slug: string;
      host: string;
    }>
  > {
    try {
      const output = await docker(
        `ps --filter "label=traefik.enable=true" --filter "label=navi.preview=true" --format '{{.Names}} {{.Label "navi.slug"}}'`
      );

      return output
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [name, slug] = line.split(" ");
          return {
            name,
            slug,
            host: `${slug}.preview.localhost`,
          };
        });
    } catch {
      return [];
    }
  }
}
