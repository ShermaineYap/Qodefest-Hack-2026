// Shared types for the Ask SHOU agent. This file is the written contract that
// docs/ask-shou-api.md and the extension team integrate against.

export type Locale = "en" | "ms";

export type Tier = "HIGH" | "MEDIUM" | "LOW" | "NOT_CHECKED";

export type SubjectType = "url" | "message";

export type SubjectSource = "text" | "pageUrl";

export type FollowUp = "already_paid";

export interface Signal {
  id: string;
  weight: number;
  detail?: Record<string, string>;
}

export interface DomainFacts {
  registrable: string;
  tld: string;
  subdomains: number;
  ipLiteral: boolean;
  punycode: boolean;
  privateHost: boolean;
}

export interface UrlScoreResult {
  score: number;
  floor: number;
  tier: Tier;
  signals: Signal[];
  domain: DomainFacts;
  needsExpand: boolean;
  display: string;
}

export interface MessageScoreResult {
  score: number;
  floor: number;
  tier: Tier;
  category: string;
  signals: Signal[];
  redactions: Record<string, number>;
  redactedText: string;
}

export interface ExpandHop {
  fromHost: string;
  toHost: string;
  status: number;
}

export interface ExpandResult {
  hops: ExpandHop[];
  finalHost: string | null;
  finalUrlScored: UrlScoreResult | null;
  blocked: boolean;
}

export interface ChatRequest {
  sessionId: string;
  text: string;
  pageUrl?: string;
  locale: Locale;
  policyId: string;
  surface?: string;
  clientVersion?: string;
  followUp?: FollowUp;
}

export type ToolName = "score_url" | "score_message" | "expand_url";

export type ToolOk = {
  tool: ToolName;
  ok: true;
  ms: number;
  result: UrlScoreResult | MessageScoreResult | ExpandResult;
};

export type ToolErr = {
  tool: ToolName;
  ok: false;
  code:
    | "TIMEOUT"
    | "SSRF_BLOCKED"
    | "UPSTREAM_5XX"
    | "UNPARSEABLE"
    | "BUDGET_EXCEEDED";
  notChecked: string;
  ms: number;
};

export type ToolCall = ToolOk | ToolErr;

export interface VerdictReason {
  signalId: string;
  source: "rule" | "model";
  text: string;
}

export interface VerdictAction {
  id: string;
  label: string;
  style: "primary";
  caption?: string;
}

export interface QuickReply {
  id: string;
  label: string;
}

export interface Verdict {
  tier: Tier;
  score: number | null;
  basis: "rules+model" | "rules_only" | "not_checked";
  subject: { type: SubjectType; source: SubjectSource; value: string };
  label: string;
  summary: string;
  reasons: VerdictReason[];
  checked: string[];
  notChecked: { id: string; why: string }[];
  actions: VerdictAction[];
  quickReplies: QuickReply[];
}

export interface ChatResponse {
  requestId: string;
  policyId: string;
  elapsedMs: number;
  verdict: Verdict;
  evidence: {
    toolCalls: ToolCall[];
    modelCalls: number;
    toolCallsUsed: number;
    mode: "model" | "mock";
  };
}

export interface ApiError {
  error: { code: string; message: string };
}

export type ParseResult =
  | { ok: true; value: ChatRequest }
  | { ok: false; code: "NO_INPUT" | "BAD_REQUEST" | "POLICY_MISSING"; message: string };

const LOCALES = new Set(["en", "ms"]);

export function parseChatRequest(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, code: "BAD_REQUEST", message: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.policyId !== "string" || b.policyId !== "shou-v1") {
    return { ok: false, code: "POLICY_MISSING", message: "policyId shou-v1 is required" };
  }
  if (typeof b.sessionId !== "string" || b.sessionId.length < 1 || b.sessionId.length > 128) {
    return { ok: false, code: "BAD_REQUEST", message: "sessionId is required" };
  }
  const locale = typeof b.locale === "string" && LOCALES.has(b.locale) ? b.locale : null;
  if (!locale) {
    return { ok: false, code: "BAD_REQUEST", message: "locale must be en or ms" };
  }
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (text.length > 2000) {
    return { ok: false, code: "BAD_REQUEST", message: "text is too long" };
  }
  let pageUrl: string | undefined;
  if (b.pageUrl !== undefined && b.pageUrl !== null) {
    if (typeof b.pageUrl !== "string" || b.pageUrl.length > 2048) {
      return { ok: false, code: "BAD_REQUEST", message: "pageUrl must be a URL string" };
    }
    pageUrl = b.pageUrl.trim();
  }
  if (text.length === 0 && !pageUrl) {
    return { ok: false, code: "NO_INPUT", message: "paste a link or a message" };
  }
  const followUp = b.followUp === "already_paid" ? "already_paid" : undefined;

  return {
    ok: true,
    value: {
      sessionId: b.sessionId,
      text,
      ...(pageUrl ? { pageUrl } : {}),
      locale: locale as Locale,
      policyId: "shou-v1",
      surface: typeof b.surface === "string" ? b.surface : "standalone",
      clientVersion: typeof b.clientVersion === "string" ? b.clientVersion : "0.1.0",
      ...(followUp ? { followUp } : {}),
    },
  };
}
