/**
 * Job service: provider fan-out, normalization, caching, dedupe, persistence and graceful degradation.
 *  - Provider results are cached in-memory per (provider, query, location, page) for JOB_CACHE_TTL_MINUTES.
 *  - Normalized listings are upserted into MongoDB (JobListing) — this is also the fallback cache when providers fail.
 *  - Failures are reported per provider; the app never crashes because a provider is down.
 */
const JobListing = require('../models/JobListing');
const { enabledProviders } = require('./jobs/providers');
const { normalizeJob } = require('./jobs/jobNormalizer');
const { getIndex } = require('./skillNormalizer');

const ttlMs = (providerName) => {
  const base = (parseInt(process.env.JOB_CACHE_TTL_MINUTES, 10) || 60) * 60 * 1000;
  return providerName === 'remotive' ? Math.max(base, 6 * 60 * 60 * 1000) : base;   // Remotive asks for low request volume
};
const STALE_DAYS = () => parseInt(process.env.JOB_STALE_DAYS, 10) || 21;

const cache = new Map();   // key → { at, raws }
function clearCache() { cache.clear(); }

async function fetchProvider(p, params, force) {
  const key = [p.name, params.query || '', params.location || '', params.page || 1].join('|');
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < ttlMs(p.name)) return { raws: hit.raws, cached: true };
  const raws = await p.search(params);
  cache.set(key, { at: Date.now(), raws });
  return { raws, cached: false };
}

async function upsertListing(l) {
  const { firstSeenAt, ...fields } = l;
  const now = new Date();
  return JobListing.findOneAndUpdate(
    { provider: l.provider, externalId: l.externalId },
    { $set: { ...fields, status: 'active', lastSeenAt: now, lastFetchedAt: now }, $setOnInsert: { firstSeenAt: now } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

function freshness(job, liveIds = new Set()) {
  if (job.isSample) return { label: 'sample', description: 'Sample/test data — not a real vacancy' };
  const ageDays = (Date.now() - new Date(job.lastSeenAt || job.lastFetchedAt || 0)) / 86400000;
  if (liveIds.has(String(job._id))) return { label: 'live', description: 'Fetched from the provider just now' };
  if (ageDays > STALE_DAYS()) return { label: 'stale', description: `Last seen ${Math.floor(ageDays)} days ago — may no longer be open` };
  return { label: 'cached', description: `Last fetched ${ageDays < 1 ? 'today' : Math.floor(ageDays) + ' day(s) ago'} — availability not re-checked` };
}

/** Dedupe across providers: keep the freshest, prefer non-sample. */
function dedupe(list) {
  const seen = new Map();
  for (const j of list) {
    const k = j.dedupeKey || `${j.provider}:${j.externalId}`;
    const cur = seen.get(k);
    if (!cur || (cur.isSample && !j.isSample) || (!!cur.isSample === !!j.isSample && new Date(j.lastSeenAt) > new Date(cur.lastSeenAt))) seen.set(k, j);
  }
  return [...seen.values()];
}

/**
 * Fetch (and persist) listings for a query. Returns { jobs, providers[], fromCacheOnly }.
 * `jobs` are Mongoose docs (lean-able) with a transient `freshness` computed by callers via freshness().
 */
async function fetchJobs({ query = '', location = '', page = 1, limit = 20, force = false } = {}) {
  const providers = enabledProviders();
  const report = [];
  const liveIds = new Set();
  const saved = [];
  const index = await getIndex();

  const settled = await Promise.allSettled(providers.map(p => fetchProvider(p, { query, location, page, limit }, force)));

  for (let i = 0; i < providers.length; i++) {
    const p = providers[i], r = settled[i];
    if (r.status === 'rejected') {
      report.push({ name: p.name, label: p.label, status: 'error', message: r.reason && r.reason.message || 'Provider error', count: 0 });
      continue;
    }
    let count = 0;
    for (const raw of r.value.raws) {
      const l = normalizeJob(raw, index);
      if (!l) continue;
      try { const doc = await upsertListing(l); saved.push(doc); if (!r.value.cached) liveIds.add(String(doc._id)); count++; }
      catch (e) { /* a single bad record must not break the batch */ }
    }
    report.push({ name: p.name, label: p.label, status: r.value.cached ? 'cached' : 'ok', count });
  }

  let jobs = dedupe(saved);
  let fromCacheOnly = false;
  if (!jobs.length && report.every(x => x.status === 'error')) {
    // every provider failed → serve previously stored listings (clearly labelled as cached/stale)
    jobs = await cachedJobs({ query, limit });
    fromCacheOnly = true;
  }
  return { jobs, providers: report, liveIds, fromCacheOnly };
}

async function cachedJobs({ query = '', limit = 20 } = {}) {
  const toks = String(query).toLowerCase().split(/[^a-z0-9+#.]+/).filter(t => t.length > 2 && !['developer', 'engineer'].includes(t));
  const filter = { status: 'active' };
  if (toks.length) filter.$or = toks.flatMap(t => {
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    return [{ title: re }, { tags: re }];
  });
  return JobListing.find(filter).sort({ lastSeenAt: -1 }).limit(limit * 2);
}

const getJob = id => JobListing.findById(id);

module.exports = { fetchJobs, cachedJobs, getJob, freshness, dedupe, clearCache, upsertListing, STALE_DAYS };
