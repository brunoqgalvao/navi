import { create } from "zustand";

export interface GitFile {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed" | "untracked";
  staged: boolean;
}

export interface GitCommit {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  timestamp: number;
}

export interface GitDiff {
  file: string;
  additions: number;
  deletions: number;
  hunks: string;
}

interface GitState {
  // State
  currentBranch: string;
  branches: string[];
  stagedFiles: GitFile[];
  unstagedFiles: GitFile[];
  untrackedFiles: GitFile[];
  commits: GitCommit[];
  isLoading: boolean;
  error: string | null;

  // Selected state
  selectedFile: string | null;
  selectedDiff: GitDiff | null;
  viewMode: "changes" | "history";

  // Actions
  setCurrentBranch: (branch: string) => void;
  setBranches: (branches: string[]) => void;
  setStagedFiles: (files: GitFile[]) => void;
  setUnstagedFiles: (files: GitFile[]) => void;
  setUntrackedFiles: (files: GitFile[]) => void;
  setCommits: (commits: GitCommit[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedFile: (file: string | null) => void;
  setSelectedDiff: (diff: GitDiff | null) => void;
  setViewMode: (mode: "changes" | "history") => void;
  reset: () => void;
}

const initialState = {
  currentBranch: "",
  branches: [],
  stagedFiles: [],
  unstagedFiles: [],
  untrackedFiles: [],
  commits: [],
  isLoading: false,
  error: null,
  selectedFile: null,
  selectedDiff: null,
  viewMode: "changes" as const,
};

export const useGitStore = create<GitState>((set) => ({
  ...initialState,

  setCurrentBranch: (branch) => set({ currentBranch: branch }),
  setBranches: (branches) => set({ branches }),
  setStagedFiles: (files) => set({ stagedFiles: files }),
  setUnstagedFiles: (files) => set({ unstagedFiles: files }),
  setUntrackedFiles: (files) => set({ untrackedFiles: files }),
  setCommits: (commits) => set({ commits }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setSelectedFile: (file) => set({ selectedFile: file }),
  setSelectedDiff: (diff) => set({ selectedDiff: diff }),
  setViewMode: (mode) => set({ viewMode: mode }),
  reset: () => set(initialState),
}));
