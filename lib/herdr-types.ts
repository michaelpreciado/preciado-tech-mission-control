export type HerdrKind = 'codex' | 'claude' | 'opencode';
export type HerdrAgent = { id: string; name: string; kind: string; status: string; cwd: string; focused: boolean };
export type HerdrSnapshot = {
  available: boolean;
  agents: HerdrAgent[];
  workspaces: { id: string; name: string; cwd: string }[];
  generatedAt: string;
  error?: string;
};
