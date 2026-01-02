export interface GitStatus {
  isGitRepo: boolean;
  gitNotInstalled?: boolean;
  branch: string;
  staged: GitFileChange[];
  modified: GitFileChange[];
  untracked: { path: string }[];
  ahead: number;
  behind: number;
}

export interface GitFileChange {
  path: string;
  status: string;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

export interface GitBranches {
  current: string;
  local: string[];
  remote: string[];
}

export const STATUS_LABELS: Record<string, string> = {
  M: "Modified",
  A: "Added",
  D: "Deleted",
  R: "Renamed",
  C: "Copied",
  U: "Updated",
  "?": "Untracked",
};

export const STATUS_COLORS: Record<string, string> = {
  M: "text-yellow-600 bg-yellow-50",
  A: "text-green-600 bg-green-50",
  D: "text-red-600 bg-red-50",
  R: "text-blue-600 bg-blue-50",
  C: "text-purple-600 bg-purple-50",
  U: "text-orange-600 bg-orange-50",
  "?": "text-gray-600 bg-gray-50",
};
