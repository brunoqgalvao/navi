/**
 * Dynamic SDK loader for @anthropic-ai/claude-agent-sdk
 *
 * This module handles loading the Claude Agent SDK at runtime rather than
 * at module initialization time. This is necessary because when the server
 * is compiled with `bun build --compile`, static imports of the SDK fail
 * since the SDK is bundled as a resource, not in node_modules.
 *
 * In Tauri mode, the SDK is located at:
 *   ${TAURI_RESOURCE_DIR}/resources/claude-agent-sdk/
 *
 * In development mode, it's imported normally from node_modules.
 */

import { join } from "path";
import { existsSync } from "fs";

let sdkModule: any = null;
let sdkLoadError: Error | null = null;

function getSdkPath(): string | null {
  // Check Tauri resource directory first
  if (process.env.TAURI_RESOURCE_DIR) {
    const resourceDir = process.env.TAURI_RESOURCE_DIR;
    const candidates = [
      join(resourceDir, "resources", "claude-agent-sdk", "index.js"),
      join(resourceDir, "claude-agent-sdk", "index.js"),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  // In non-Tauri mode, return null to use normal import
  return null;
}

/**
 * Lazily load and return the Claude Agent SDK.
 * Caches the module after first successful load.
 */
export async function getSDK(): Promise<typeof import("@anthropic-ai/claude-agent-sdk")> {
  if (sdkModule) {
    return sdkModule;
  }

  if (sdkLoadError) {
    throw sdkLoadError;
  }

  try {
    const sdkPath = getSdkPath();

    if (sdkPath) {
      // Load from Tauri resources
      console.log(`[SDK Loader] Loading SDK from: ${sdkPath}`);
      sdkModule = await import(sdkPath);
    } else {
      // Normal import from node_modules (development mode)
      sdkModule = await import("@anthropic-ai/claude-agent-sdk");
    }

    return sdkModule;
  } catch (error) {
    sdkLoadError = error as Error;
    console.error("[SDK Loader] Failed to load SDK:", error);
    throw error;
  }
}

/**
 * Check if the SDK is available without throwing.
 */
export async function isSDKAvailable(): Promise<boolean> {
  try {
    await getSDK();
    return true;
  } catch {
    return false;
  }
}
