/**
 * Dynamic SDK loader for @anthropic-ai/claude-agent-sdk
 *
 * Loads the SDK at runtime rather than at module initialization time and
 * caches the module (or the load error) after the first attempt.
 */

let sdkModule: any = null;
let sdkLoadError: Error | null = null;

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
    sdkModule = await import("@anthropic-ai/claude-agent-sdk");
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
