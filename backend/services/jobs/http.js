/** Small HTTP helper for job providers: timeout, size cap, injectable fetch (for tests). */
let fetchImpl = (...args) => global.fetch(...args);
const setFetch = fn => { fetchImpl = fn || ((...a) => global.fetch(...a)); };

const TIMEOUT_MS = () => parseInt(process.env.JOB_PROVIDER_TIMEOUT_MS, 10) || 8000;
const MAX_BYTES = 6 * 1024 * 1024;

class ProviderError extends Error {
  constructor(provider, message, status) { super(message); this.provider = provider; this.status = status; }
}

async function getJson(provider, url, headers = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS());
  try {
    const res = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': 'AI-Career-Navigator/1.0', ...headers }, signal: ctrl.signal });
    if (res.status === 429) throw new ProviderError(provider, `${provider} rate limit reached. Try again later.`, 429);
    if (!res.ok) throw new ProviderError(provider, `${provider} responded with HTTP ${res.status}.`, res.status);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new ProviderError(provider, `${provider} response too large.`);
    try { return JSON.parse(text); } catch { throw new ProviderError(provider, `${provider} returned invalid JSON.`); }
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if (err.name === 'AbortError') throw new ProviderError(provider, `${provider} timed out.`);
    throw new ProviderError(provider, `${provider} is unreachable.`);
  } finally { clearTimeout(timer); }
}

/** Only http(s) URLs without embedded credentials are ever surfaced as links. */
function safeUrl(u) {
  try {
    const url = new URL(String(u));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.toString();
  } catch { return null; }
}

module.exports = { getJson, setFetch, safeUrl, ProviderError };
