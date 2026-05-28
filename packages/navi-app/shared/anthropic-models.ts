export type AnthropicModelOption = {
  value: string;
  displayName: string;
  description: string;
  provider: "anthropic";
};

type CuratedAnthropicModel = AnthropicModelOption & {
  aliases: readonly string[];
  order: number;
  shortLabel: string;
};

type ModelOptionLike = {
  value: string;
  displayName: string;
  description: string;
  provider?: string;
};

export const CLAUDE_OPUS_4_8 = "claude-opus-4-8";
export const CLAUDE_OPUS_4_7 = "claude-opus-4-7";
export const CLAUDE_SONNET_4_6 = "claude-sonnet-4-6";
export const CLAUDE_HAIKU_4_5 = "claude-haiku-4-5";

export const DEFAULT_CLAUDE_MODEL = CLAUDE_OPUS_4_8;
export const DEFAULT_CLAUDE_FAST_MODEL = CLAUDE_SONNET_4_6;
export const DEFAULT_CLAUDE_LIGHT_MODEL = CLAUDE_HAIKU_4_5;

const CURATED_ANTHROPIC_MODELS: CuratedAnthropicModel[] = [
  {
    value: CLAUDE_OPUS_4_8,
    displayName: "Claude Opus 4.8",
    shortLabel: "Opus 4.8",
    description: "Most capable for complex work",
    provider: "anthropic",
    aliases: ["default", "opus"],
    order: 0,
  },
  {
    value: CLAUDE_OPUS_4_7,
    displayName: "Claude Opus 4.7",
    shortLabel: "Opus 4.7",
    description: "Previous Opus snapshot",
    provider: "anthropic",
    aliases: [],
    order: 1,
  },
  {
    value: CLAUDE_SONNET_4_6,
    displayName: "Claude Sonnet 4.6",
    shortLabel: "Sonnet 4.6",
    description: "Best balance of speed and capability",
    provider: "anthropic",
    aliases: ["sonnet"],
    order: 2,
  },
  {
    value: CLAUDE_HAIKU_4_5,
    displayName: "Claude Haiku 4.5",
    shortLabel: "Haiku 4.5",
    description: "Fastest for quick answers",
    provider: "anthropic",
    aliases: ["haiku"],
    order: 3,
  },
];

const curatedByValue = new Map(CURATED_ANTHROPIC_MODELS.map((model) => [model.value, model]));

const canonicalByAlias = new Map<string, string>();
for (const model of CURATED_ANTHROPIC_MODELS) {
  canonicalByAlias.set(model.value, model.value);
  for (const alias of model.aliases) {
    canonicalByAlias.set(alias, model.value);
  }
}

function stripModelMetadata(model: CuratedAnthropicModel): AnthropicModelOption {
  return {
    value: model.value,
    displayName: model.displayName,
    description: model.description,
    provider: model.provider,
  };
}

export function normalizeAnthropicModelValue(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  return canonicalByAlias.get(trimmed) ?? trimmed;
}

export function getAnthropicModelInfo(value: string | null | undefined): AnthropicModelOption | null {
  const normalized = normalizeAnthropicModelValue(value);
  const model = curatedByValue.get(normalized);
  return model ? stripModelMetadata(model) : null;
}

export function getAnthropicModelShortLabel(value: string | null | undefined): string | null {
  const normalized = normalizeAnthropicModelValue(value);
  return curatedByValue.get(normalized)?.shortLabel ?? null;
}

export function getCuratedAnthropicModels(): AnthropicModelOption[] {
  return CURATED_ANTHROPIC_MODELS.map(stripModelMetadata);
}

export function mergeAnthropicModelOptions(models: readonly ModelOptionLike[]): ModelOptionLike[] {
  const merged = new Map<string, ModelOptionLike>();

  for (const model of models) {
    const normalizedValue = normalizeAnthropicModelValue(model.value);
    if (!normalizedValue) continue;

    const curated = curatedByValue.get(normalizedValue);
    if (curated) {
      merged.set(curated.value, stripModelMetadata(curated));
      continue;
    }

    if (!merged.has(normalizedValue)) {
      merged.set(normalizedValue, {
        ...model,
        value: normalizedValue,
        provider: model.provider ?? "anthropic",
      });
    }
  }

  for (const model of CURATED_ANTHROPIC_MODELS) {
    if (!merged.has(model.value)) {
      merged.set(model.value, stripModelMetadata(model));
    }
  }

  return Array.from(merged.values()).sort((left, right) => {
    const leftOrder = curatedByValue.get(left.value)?.order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = curatedByValue.get(right.value)?.order ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.displayName.localeCompare(right.displayName);
  });
}
