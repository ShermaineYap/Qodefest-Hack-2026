export type Tier = "LOW" | "MEDIUM" | "HIGH" | "NOT_CHECKED";
export type Lang = "en" | "ms";

export type Signal = { id: string; weight: number; floor: number; en: string; ms: string };

export type UrlResult = {
  input: string;
  finalUrl: string;
  host: string;
  registrable: string;
  score: number;
  floor: number;
  signals: Signal[];
  expanded: boolean;
  officialFor?: string;
};

export type MessageResult = { score: number; floor: number; signals: Signal[] };

export type ToolCall = { name: "expand_url" | "score_url" | "score_message"; ok: boolean; ms: number; summary: string };

export type Verdict = {
  tier: Tier;
  score: number;
  title: string;
  bullets: string[];
  checked: string[];
  notChecked: string[];
  action: { label: string; kind: "go_back" | "open" | "call_997" | "try_again" | "ask_trusted" };
  quickReplies: string[];
  contact: { label: string; phone: string } | null;
};

export type ChatRequest = { message: string; pageUrl?: string; lang?: Lang };

export type ChatResponse = {
  verdict: Verdict;
  toolCalls: ToolCall[];
  model: { used: boolean; name: string | null; calls: number; raisedTo?: Tier };
  degraded: boolean;
  ms: number;
};
