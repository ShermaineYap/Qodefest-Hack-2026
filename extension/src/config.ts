// Public demo gateway. The hostname is an ephemeral Cloudflare quick tunnel: refresh it from
// server/README.md ("Deployment") whenever the tunnel restarts.
export const API_BASE = 'https://sophisticated-blues-undertaken-mechanics.trycloudflare.com';

// For local development, run server/gateway on :4000 and switch to 'http://localhost:4000'.
export const SCORE_PATH = '/risk/link';
export const SCORE_TIMEOUT_MS = 8000;

// Lantern Assistant (agentic chat box: server/index.ts locally, api/agent/chat.ts on Vercel).
// For local development run `npm run dev` at the repo root and use 'http://localhost:8787'.
export const ASSISTANT_BASE = 'https://lantern-assistant.vercel.app';
export const ASSISTANT_PATH = '/api/agent/chat';
export const ASSISTANT_TIMEOUT_MS = 13000;
