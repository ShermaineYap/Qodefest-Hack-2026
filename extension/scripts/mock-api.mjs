import crypto from 'node:crypto';
import http from 'node:http';

const PORT = 4000;
const MAX_BODY_BYTES = 64 * 1024;

const HIGH_SIGNALS = new Set([
  'deny_list',
  'brand_impersonation',
  'credential_harvest',
  'lookalike_characters',
  'userinfo_obfuscation',
  'insecure_login',
]);

const MEDIUM_SIGNALS = new Set([
  'suspicious_tld',
  'shortener',
  'open_redirect',
  'ip_literal',
  'many_subdomains',
  'hyphen_heavy',
]);

const HIGH = { tier: 'high', score: 90 };
const MEDIUM = { tier: 'medium', score: 55 };
const LOW = { tier: 'low', score: 10 };

const COPY = {
  high: {
    headline: 'This looks like a scam link. Do not enter your password or bank details.',
    sentences: [
      'The address shows several warning signs.',
      'Do not enter your password or bank details.',
    ],
    checked: ['domain', 'path type', 'lookalike characters', 'local rules'],
  },
  medium: {
    headline: 'This link looks off. Open it only if you were expecting it.',
    sentences: [
      'Some details of this address look unusual.',
      'Open it only if you were expecting it.',
    ],
    checked: ['domain', 'path type', 'lookalike characters', 'local rules'],
  },
  low: {
    headline: 'Nothing unusual about this link.',
    sentences: ['The address did not match any known scam patterns.'],
    checked: ['domain', 'local rules'],
  },
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function localSignalsOf(payload) {
  const signals = payload && typeof payload === 'object' ? payload.localSignals : undefined;
  if (!Array.isArray(signals)) return [];
  return signals.filter((signal) => typeof signal === 'string');
}

function verdictFor(signals) {
  if (signals.some((signal) => HIGH_SIGNALS.has(signal))) return HIGH;
  if (signals.some((signal) => MEDIUM_SIGNALS.has(signal))) return MEDIUM;
  return LOW;
}

function buildVerdict(payload) {
  const signals = localSignalsOf(payload);
  const { tier, score } = verdictFor(signals);
  const copy = COPY[tier];
  const verdict = {
    request_id: 'req_' + crypto.randomUUID(),
    tier,
    score,
    headline: copy.headline,
    sentences: [...copy.sentences],
    checked: [...copy.checked],
    held_for_review: false,
  };
  if (signals.length > 0) verdict.category = signals[0];
  return verdict;
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function logRequest(req, status, detail) {
  console.log(`${req.method} ${req.url} -> ${status} ${detail}`);
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url ?? '/', `http://localhost:${PORT}`).pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
    });
    res.end();
    logRequest(req, 204, 'preflight');
    return;
  }

  if (req.method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { ok: true });
    logRequest(req, 200, 'health');
    return;
  }

  if (req.method === 'POST' && pathname === '/risk/link') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: 'invalid_json' });
      logRequest(req, 400, 'invalid JSON body');
      return;
    }

    const verdict = buildVerdict(payload);
    const host = typeof payload?.host === 'string' ? payload.host : '(no host)';
    sendJson(res, 200, verdict);
    logRequest(req, 200, `${verdict.tier} ${host}`);
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
  logRequest(req, 404, 'unknown route');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `mock-api: port ${PORT} is already in use. Stop the other process or run the real gateway there.`,
    );
  } else {
    console.error(`mock-api: could not start server: ${error.message}`);
  }
  process.exitCode = 1;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock-api: canned Link Guard scoring on http://localhost:${PORT}`);
  console.log(`mock-api: POST /risk/link, GET /health. Dev aid only.`);
});
