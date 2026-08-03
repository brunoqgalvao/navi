export interface AccountGauge {
  kind: "session" | "weekly_all" | "weekly_scoped" | string;
  percent: number;
  severity: "normal" | "warning" | "critical" | string;
  resetsAt: string | null;
  scopeModel: string | null;
  isActive: boolean;
}

export interface CcxAccount {
  accountUuid: string;
  email: string;
  needsLogin: boolean;
  lastPoll: string | null;
  snapshot?: {
    fetchedAt: string;
    source: string;
    model: string;
    gauges: AccountGauge[];
  };
}

export interface AccountsStatus {
  available: boolean;
  error?: string;
  activeAccount?: string;
  syncPending?: boolean;
  accounts?: Record<string, CcxAccount>;
}

export interface StatsGauge {
  kind: string;
  scopeModel: string | null;
  now: number;
  avg: number;
  peak: number;
  sparkline: string | null;
}

export interface CodexUsage {
  available: boolean;
  fetchedAt?: string;
  planType?: string;
  primary?: { usedPercent: number; windowMinutes: number; resetsAt: number };
  secondary?: { usedPercent: number; windowMinutes: number; resetsAt: number } | null;
  totalTokens?: number;
}

export interface UsageResponse {
  claude:
    | { available: true; header: string; accounts: Record<string, StatsGauge[]> }
    | { available: false; error?: string };
  codex: CodexUsage;
}
