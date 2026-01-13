/**
 * Preview Service
 *
 * Main orchestrator for the containerized preview system.
 * Manages container lifecycle, Traefik proxy, and preview state.
 */
import {
  detectRuntime,
  ensureRuntimeRunning,
  getInstallInstructions,
} from "./runtime-detector";
import { detectFramework, describeFramework } from "./framework-detector";
import { ContainerManager } from "./container-manager";
import { ProxyManager } from "./proxy-manager";
import type {
  PreviewContainer,
  PreviewConfig,
  PreviewState,
  RuntimeInfo,
  DEFAULT_PREVIEW_CONFIG,
} from "./types";

// Re-export types and utilities
export * from "./types";
export { getInstallInstructions } from "./runtime-detector";
export { loadPreviewSpec, type PreviewSpec } from "./spec";
export { autoDetectPreviewConfig, getOrDetectPreviewConfig } from "./auto-detect";

class PreviewService {
  private state: PreviewState;
  private containerManager: ContainerManager;
  private proxyManager: ProxyManager;
  private idleChecker?: NodeJS.Timeout;
  private healthChecker?: NodeJS.Timeout;

  constructor(config: Partial<PreviewConfig> = {}) {
    const fullConfig: PreviewConfig = {
      maxContainers: config.maxContainers ?? 5,
      idleTimeoutMs: config.idleTimeoutMs ?? 30 * 60 * 1000,
      cleanupTimeoutMs: config.cleanupTimeoutMs ?? 2 * 60 * 60 * 1000,
      memoryLimitMb: config.memoryLimitMb ?? 1024,
      cpuLimit: config.cpuLimit ?? 2,
      proxyPort: config.proxyPort ?? 4000,
      networkName: config.networkName ?? "navi-preview-net",
    };

    this.state = {
      initialized: false,
      runtime: { runtime: "none", running: false },
      proxyRunning: false,
      containers: new Map(),
      config: fullConfig,
    };

    this.containerManager = new ContainerManager(fullConfig);
    this.proxyManager = new ProxyManager(fullConfig);
  }

  /**
   * Initialize the preview system
   * Detects runtime but doesn't start anything
   */
  async initialize(): Promise<RuntimeInfo> {
    const runtime = await detectRuntime();
    this.state.runtime = runtime;
    this.state.initialized = true;

    if (runtime.runtime !== "none" && runtime.running) {
      // Restore any existing containers from Docker
      await this.restoreContainers();

      // Check if proxy is already running
      this.state.proxyRunning = await this.proxyManager.isRunning();

      // Start background checkers
      this.startIdleChecker();
      this.startHealthChecker();
    }

    return runtime;
  }

  /**
   * Ensure the system is ready to create containers
   */
  async ensureReady(): Promise<void> {
    if (!this.state.initialized) {
      await this.initialize();
    }

    if (this.state.runtime.runtime === "none") {
      throw new Error(getInstallInstructions());
    }

    // Ensure runtime is running (will start Colima if needed)
    this.state.runtime = await ensureRuntimeRunning(this.state.runtime);

    // NOTE: Using direct port mapping (no Traefik proxy needed)
    // This simplifies local development and avoids network/image pull issues
    // Each container will get a unique port (4001, 4002, etc.)
    this.state.proxyRunning = true; // Mark as ready
  }

  /**
   * Start a preview for a branch (branch-scoped, not session-scoped)
   * @param cachedConfig - Optional cached config from database (JSON string)
   * @returns The preview container and optionally the newly detected config
   */
  async startPreview(
    sessionId: string,
    projectId: string,
    projectPath: string,
    branch: string,
    cachedConfig?: string | null
  ): Promise<{ preview: PreviewContainer; detectedConfig?: string }> {
    await this.ensureReady();

    // BRANCH-SCOPED: Check if we already have a preview for this branch+project
    const existing = this.findPreviewByBranch(projectId, branch);
    if (existing) {
      // If paused, unpause it
      if (existing.status === "paused") {
        await this.unpausePreview(existing.id);
        return { preview: existing };
      }
      // If running or starting, return as-is (don't create duplicate!)
      if (existing.status === "running" || existing.status === "starting") {
        existing.lastAccessedAt = Date.now();
        return { preview: existing };
      }
      // Otherwise, clean it up and create new
      await this.stopPreview(existing.id);
    }

    // Check max containers limit
    if (this.state.containers.size >= this.state.config.maxContainers) {
      await this.evictOldestContainer();
    }

    // Detect framework
    // Force npm for container since Alpine only has npm installed
    const framework = await detectFramework(projectPath, true);

    // Create container (will auto-detect config if not cached)
    const { container, detectedConfig } = await this.containerManager.createContainer(
      sessionId,
      projectId,
      projectPath,
      branch,
      framework,
      cachedConfig
    );

    this.state.containers.set(container.id, container);

    // Start health polling for this container
    this.pollContainerHealth(container.id);

    return { preview: container, detectedConfig };
  }

  /**
   * Stop a preview
   */
  async stopPreview(id: string): Promise<void> {
    const container = this.state.containers.get(id);
    if (!container) return;

    await this.containerManager.stopContainer(container.containerId);
    // Release the port so it can be reused
    this.containerManager.releasePort(container.port);
    this.state.containers.delete(id);
  }

  /**
   * Stop preview by session ID
   */
  async stopPreviewBySession(sessionId: string): Promise<void> {
    const container = this.findPreviewBySession(sessionId);
    if (container) {
      await this.stopPreview(container.id);
    }
  }

  /**
   * Pause a preview (for idle containers)
   */
  async pausePreview(id: string): Promise<void> {
    const container = this.state.containers.get(id);
    if (!container || container.status !== "running") return;

    await this.containerManager.pauseContainer(container.containerId);
    container.status = "paused";
  }

  /**
   * Unpause a preview
   */
  async unpausePreview(id: string): Promise<void> {
    const container = this.state.containers.get(id);
    if (!container || container.status !== "paused") return;

    await this.containerManager.unpauseContainer(container.containerId);
    container.status = "running";
    container.lastAccessedAt = Date.now();
  }

  /**
   * Get preview by session ID
   */
  getPreviewBySession(sessionId: string): PreviewContainer | undefined {
    return this.findPreviewBySession(sessionId);
  }

  /**
   * Get preview by branch (branch-scoped lookup)
   */
  getPreviewByBranch(projectId: string, branch: string): PreviewContainer | undefined {
    return this.findPreviewByBranch(projectId, branch);
  }

  /**
   * Stop preview by branch
   */
  async stopPreviewByBranch(projectId: string, branch: string): Promise<void> {
    const container = this.findPreviewByBranch(projectId, branch);
    if (container) {
      await this.stopPreview(container.id);
    }
  }

  /**
   * Get preview logs
   */
  async getLogs(id: string, tail = 100): Promise<string[]> {
    const container = this.state.containers.get(id);
    if (!container) return [];

    return this.containerManager.getLogs(container.containerId, tail);
  }

  /**
   * Mark preview as accessed (resets idle timer)
   */
  markAccessed(id: string): void {
    const container = this.state.containers.get(id);
    if (container) {
      container.lastAccessedAt = Date.now();
    }
  }

  /**
   * Get current state
   */
  getState(): {
    initialized: boolean;
    runtime: RuntimeInfo;
    proxyRunning: boolean;
    containerCount: number;
    config: PreviewConfig;
  } {
    return {
      initialized: this.state.initialized,
      runtime: this.state.runtime,
      proxyRunning: this.state.proxyRunning,
      containerCount: this.state.containers.size,
      config: this.state.config,
    };
  }

  /**
   * List all previews
   */
  listPreviews(): PreviewContainer[] {
    return Array.from(this.state.containers.values());
  }

  /**
   * Shutdown the preview system
   */
  async shutdown(): Promise<void> {
    if (this.idleChecker) {
      clearInterval(this.idleChecker);
    }
    if (this.healthChecker) {
      clearInterval(this.healthChecker);
    }

    await this.containerManager.cleanupAll();
    await this.proxyManager.stop();

    this.state.containers.clear();
    this.state.proxyRunning = false;
  }

  // Private methods

  private findPreviewBySession(sessionId: string): PreviewContainer | undefined {
    for (const container of Array.from(this.state.containers.values())) {
      if (container.sessionId === sessionId) {
        return container;
      }
    }
    return undefined;
  }

  private findPreviewByBranch(projectId: string, branch: string): PreviewContainer | undefined {
    for (const container of Array.from(this.state.containers.values())) {
      if (container.projectId === projectId && container.branch === branch) {
        return container;
      }
    }
    return undefined;
  }

  private async evictOldestContainer(): Promise<void> {
    let oldest: PreviewContainer | null = null;

    for (const container of Array.from(this.state.containers.values())) {
      const accessTime = container.lastAccessedAt || container.startedAt || 0;
      const oldestTime = oldest?.lastAccessedAt || oldest?.startedAt || Infinity;

      if (accessTime < oldestTime) {
        oldest = container;
      }
    }

    if (oldest) {
      await this.stopPreview(oldest.id);
    }
  }

  private async pollContainerHealth(id: string): Promise<void> {
    const container = this.state.containers.get(id);
    if (!container) return;

    const maxWaitMs = 120000; // 2 minutes max
    const pollIntervalMs = 2000;
    const start = Date.now();

    const poll = async () => {
      // Check if container still exists in our state
      const current = this.state.containers.get(id);
      if (!current) return;

      // Check if we've exceeded max wait time
      if (Date.now() - start > maxWaitMs) {
        current.status = "error";
        current.error = "Container failed to become healthy within timeout";
        console.error(`[Preview] Container ${current.slug} failed health check`);
        return;
      }

      // Check container health by hitting the URL directly
      let healthy = false;
      if (current.url) {
        try {
          const response = await fetch(current.url, {
            method: 'HEAD',
            signal: AbortSignal.timeout(5000)
          });
          healthy = response.ok;
        } catch {
          healthy = false;
        }
      }

      if (healthy) {
        current.status = "running";
        return;
      }

      // Check if container is still running
      const status = await this.containerManager.getContainerStatus(
        current.containerId
      );

      if (status === "stopped" || status === "error" || status === null) {
        current.status = "error";
        current.error = "Container exited unexpectedly";

        // Get last logs for debugging
        try {
          const logs = await this.containerManager.getLogs(
            current.containerId,
            20
          );
          console.error(
            `[Preview] Container ${current.slug} exited. Last logs:\n${logs.join("\n")}`
          );
        } catch {
          // Ignore log errors
        }
        return;
      }

      // Still starting, poll again
      setTimeout(poll, pollIntervalMs);
    };

    // Start polling
    setTimeout(poll, pollIntervalMs);
  }

  private startIdleChecker(): void {
    this.idleChecker = setInterval(async () => {
      const now = Date.now();

      for (const [id, container] of Array.from(this.state.containers.entries())) {
        const idleTime =
          now - (container.lastAccessedAt || container.startedAt || 0);

        // Pause if idle too long and running
        if (
          container.status === "running" &&
          idleTime > this.state.config.idleTimeoutMs
        ) {
          await this.pausePreview(id);
        }

        // Remove if paused too long
        if (
          container.status === "paused" &&
          idleTime > this.state.config.cleanupTimeoutMs
        ) {
          await this.stopPreview(id);
        }
      }
    }, 60000); // Check every minute
  }

  private startHealthChecker(): void {
    this.healthChecker = setInterval(async () => {
      for (const [id, container] of Array.from(this.state.containers.entries())) {
        if (container.status !== "running") continue;

        const status = await this.containerManager.getContainerStatus(
          container.containerId
        );

        if (status !== "running") {
          container.status = status || "error";
        }
      }
    }, 30000); // Check every 30 seconds
  }

  private async restoreContainers(): Promise<void> {
    try {
      const containerIds = await this.containerManager.listContainers();

      // For now, just clean them up on startup
      // TODO: Could restore state from container labels
      for (const id of containerIds) {
        await this.containerManager.stopContainer(id);
      }
    } catch (error) {
      console.error("[Preview] Failed to restore containers:", error);
    }
  }
}

// Singleton instance
export const previewService = new PreviewService();
