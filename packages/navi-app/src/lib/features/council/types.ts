/**
 * LLM Council Types
 */

export interface CouncilMember {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "google";
  model: string;
  icon: string;
  color: string;
  available?: boolean;
}

export interface CouncilResponse {
  memberId: string;
  memberName: string;
  response: string;
  latencyMs: number;
  error?: string;
  tokenCount?: number;
}

export interface CouncilResult {
  prompt: string;
  responses: CouncilResponse[];
  totalLatencyMs: number;
  timestamp: string;
}

export interface CouncilProvider {
  id: string;
  name: string;
  available: boolean;
}
