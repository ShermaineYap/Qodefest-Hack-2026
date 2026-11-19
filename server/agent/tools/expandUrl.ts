// Follow redirect headers, never page content. Max 5 hops, 2 s per hop, no
// cookies, no referrer, private addresses blocked.

import type { ExpandHop, ExpandResult } from "../contract.ts";
import { assertFetchable, originOf } from "../../lib/ssrf.ts";
import { scoreUrl } from "./scoreUrl.ts";

export class ToolFailure extends Error {
  code: "TIMEOUT" | "SSRF_BLOCKED" | "UPSTREAM_5XX" | "UNPARSEABLE";
  notChecked: string;

  constructor(
    code: "TIMEOUT" | "SSRF_BLOCKED" | "UPSTREAM_5XX" | "UNPARSEABLE",
    notChecked: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolFailure";
    this.code = code;
    this.notChecked = notChecked;
  }
}

export interface ExpandOptions {
  /** Our own demo origin, the one local exception to the SSRF guard. */
  allowOrigin?: string | null;
  maxHops?: number;
  hopTimeoutMs?: number;
  totalBudgetMs?: number;
}

export async function expandUrl(
  startUrl: string,
  options: ExpandOptions = {},
): Promise<ExpandResult> {
  const maxHops = options.maxHops ?? 5;
  const hopTimeoutMs = options.hopTimeoutMs ?? 2000;
  const totalBudgetMs = options.totalBudgetMs ?? 6000;
  const started = Date.now();
  const hops: ExpandHop[] = [];
  let current: URL;
  try {
    current = new URL(startUrl);
  } catch {
    throw new ToolFailure("UNPARSEABLE", "where_the_link_goes", "not a URL");
  }

  for (let hop = 0; hop <= maxHops; hop += 1) {
    const guard = assertFetchable(current, options.allowOrigin ?? null);
    if (!guard.ok) {
      throw new ToolFailure("SSRF_BLOCKED", "where_the_link_goes", "blocked address");
    }
    if (Date.now() - started > totalBudgetMs) {
      throw new ToolFailure("TIMEOUT", "where_the_link_goes", "redirect budget spent");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), hopTimeoutMs);
    let response: Response;
    try {
      response = await fetch(current.toString(), {
        method: "HEAD",
        redirect: "manual",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
        headers: {
          "user-agent": "ShouLinkCheck/0.1 (demo; redirect headers only)",
          accept: "text/html",
        },
      });
      if (response.status === 405 || response.status === 501) {
        response = await fetch(current.toString(), {
          method: "GET",
          redirect: "manual",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
          headers: {
            "user-agent": "ShouLinkCheck/0.1 (demo; redirect headers only)",
            accept: "text/html",
          },
        });
      }
    } catch (error) {
      // If we already have the redirect target from a Location header, that
      // host is still evidence even when the target itself will not load.
      if (hops.length > 0) {
        const scored = scoreUrl(current.toString());
        if (scored) {
          return { hops, finalHost: current.hostname, finalUrlScored: scored, blocked: false };
        }
      }
      if (controller.signal.aborted) {
        throw new ToolFailure("TIMEOUT", "where_the_link_goes", "hop timed out");
      }
      throw new ToolFailure(
        "UPSTREAM_5XX",
        "where_the_link_goes",
        error instanceof Error ? error.message : "fetch failed",
      );
    } finally {
      clearTimeout(timer);
    }

    const location = response.headers.get("location");
    const isRedirect = response.status >= 300 && response.status < 400 && location;
    if (!isRedirect) {
      const finalScored = scoreUrl(current.toString());
      return {
        hops,
        finalHost: current.hostname,
        finalUrlScored: finalScored,
        blocked: false,
      };
    }

    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      throw new ToolFailure("UNPARSEABLE", "where_the_link_goes", "bad redirect target");
    }
    hops.push({
      fromHost: current.hostname,
      toHost: next.hostname,
      status: response.status,
    });
    current = next;
  }

  throw new ToolFailure("UNPARSEABLE", "where_the_link_goes", "too many redirects");
}

export function originAllowed(current: URL, allowOrigin: string | null): boolean {
  return allowOrigin !== null && originOf(current) === allowOrigin;
}
