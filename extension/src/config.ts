// Public demo gateway. The hostname is an ephemeral Cloudflare quick tunnel: refresh it from
// server/README.md ("Deployment") whenever the tunnel restarts.
export const API_BASE = 'https://sophisticated-blues-undertaken-mechanics.trycloudflare.com';

// For local development, run server/gateway on :4000 and switch to 'http://localhost:4000'.
export const SCORE_PATH = '/risk/link';
export const SCORE_TIMEOUT_MS = 8000;

// Lantern Assistant chat in the side panel: the gateway's model-backed message check (D-013),
// on the same host as /risk/link, so the extension needs one address and one host permission.
export const AGENT_PATH = '/agent/message';
export const AGENT_TIMEOUT_MS = 22000;
