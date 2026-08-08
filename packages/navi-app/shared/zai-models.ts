export type ZaiModelOption = {
  value: string;
  displayName: string;
  description: string;
  provider: "zai";
};

export const GLM_5_2_1M = "glm-5.2[1m]";
export const GLM_5_2 = "glm-5.2";
export const GLM_5_1 = "glm-5.1";
export const GLM_5_TURBO = "glm-5-turbo";
export const GLM_5 = "glm-5";
export const GLM_4_7 = "glm-4.7";
export const GLM_4_7_FLASH = "glm-4.7-flash";
export const GLM_4_7_FLASHX = "glm-4.7-flashx";
export const GLM_4_6 = "glm-4.6";
export const GLM_4_5 = "glm-4.5";
export const GLM_4_5_AIR = "glm-4.5-air";
export const GLM_4_5_X = "glm-4.5-x";
export const GLM_4_5_AIRX = "glm-4.5-airx";
export const GLM_4_5_FLASH = "glm-4.5-flash";
export const GLM_4_32B_0414_128K = "glm-4-32b-0414-128k";

export const ZAI_ANTHROPIC_BASE_URL = "https://api.z.ai/api/anthropic";
export const ZAI_API_TIMEOUT_MS = "3000000";

const CURATED_ZAI_MODELS: ZaiModelOption[] = [
  {
    value: GLM_5_2_1M,
    displayName: "GLM-5.2 (1M)",
    description: "Flagship long-horizon coding model with 1M context",
    provider: "zai",
  },
  {
    value: GLM_5_2,
    displayName: "GLM-5.2",
    description: "Flagship coding model",
    provider: "zai",
  },
  {
    value: GLM_5_TURBO,
    displayName: "GLM-5 Turbo",
    description: "Advanced coding model for complex agent tasks",
    provider: "zai",
  },
  {
    value: GLM_5_1,
    displayName: "GLM-5.1",
    description: "Strong coding model with 200K context",
    provider: "zai",
  },
  {
    value: GLM_5,
    displayName: "GLM-5",
    description: "Agentic planning and coding model",
    provider: "zai",
  },
  {
    value: GLM_4_7,
    displayName: "GLM-4.7",
    description: "Routine coding model with lower quota usage",
    provider: "zai",
  },
  {
    value: GLM_4_7_FLASHX,
    displayName: "GLM-4.7 FlashX",
    description: "Fast GLM-4.7 variant",
    provider: "zai",
  },
  {
    value: GLM_4_7_FLASH,
    displayName: "GLM-4.7 Flash",
    description: "Lightweight GLM-4.7 variant",
    provider: "zai",
  },
  {
    value: GLM_4_6,
    displayName: "GLM-4.6",
    description: "General coding model",
    provider: "zai",
  },
  {
    value: GLM_4_5,
    displayName: "GLM-4.5",
    description: "Strong reasoning model",
    provider: "zai",
  },
  {
    value: GLM_4_5_AIR,
    displayName: "GLM-4.5 Air",
    description: "Cost-effective lightweight model",
    provider: "zai",
  },
  {
    value: GLM_4_5_AIRX,
    displayName: "GLM-4.5 AirX",
    description: "Fast lightweight model",
    provider: "zai",
  },
  {
    value: GLM_4_5_X,
    displayName: "GLM-4.5 X",
    description: "Ultra-fast GLM-4.5 variant",
    provider: "zai",
  },
  {
    value: GLM_4_5_FLASH,
    displayName: "GLM-4.5 Flash",
    description: "Free lightweight model",
    provider: "zai",
  },
  {
    value: GLM_4_32B_0414_128K,
    displayName: "GLM-4 32B 128K",
    description: "Efficient 32B model with 128K context",
    provider: "zai",
  },
];

export function getCuratedZaiModels(): ZaiModelOption[] {
  return [...CURATED_ZAI_MODELS];
}

export function isZaiModel(value: string | null | undefined): boolean {
  return value?.trim().startsWith("glm-") ?? false;
}

export function usesZaiOneMillionContext(value: string | null | undefined): boolean {
  return value?.includes("[1m]") ?? false;
}
