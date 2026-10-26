/**
 * Provider adapters. Each exposes:  { name, label, configured(), search({query, location, page, limit}) → raw[] }
 * Raw shape: { provider, externalId, title, company, description, location, remote, employmentType, tags[],
 *              salary{min,max,currency,period}|null, postedAt, applyUrl, sourceUrl }
 * Only documented public APIs are used (no scraping):
 *   • Adzuna  — https://developer.adzuna.com/        (needs ADZUNA_APP_ID / ADZUNA_APP_KEY)
 *   • Remotive— https://remotive.com/api/remote-jobs (public; remote jobs; please keep requests low & link back)
 *   • Arbeitnow — https://www.arbeitnow.com/api/job-board-api (public; Europe + remote)
 */
const { getJson, safeUrl } = require('./http');

const GENERIC = new Set(['developer', 'engineer', 'software', 'senior', 'junior', 'jr', 'sr', 'lead', 'specialist', 'analyst', 'associate', 'the', 'and', 'of']);
const queryTokens = q => String(q || '').toLowerCase().split(/[^a-z0-9+#.]+/).filter(t => t && !GENERIC.has(t));
function relevant(raw, query) {
  const toks = queryTokens(query);
  if (!toks.length) return true;
  const hay = `${raw.title} ${(raw.tags || []).join(' ')}`.toLowerCase();
  const body = String(raw.description || '').toLowerCase();
  return toks.some(t => hay.includes(t)) || toks.every(t => body.includes(t));
}

// ── Adzuna ───────────────────────────────────────────────────────────────────
const adzuna = {
  name: 'adzuna', label: 'Adzuna',
  configured: () => !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
  async search({ query, location, page = 1, limit = 20 }) {
    const country = (process.env.ADZUNA_COUNTRY || 'in').toLowerCase();
    const p = new URLSearchParams({
      app_id: process.env.ADZUNA_APP_ID, app_key: process.env.ADZUNA_APP_KEY,
      results_per_page: String(Math.min(limit, 50)), 'content-type': 'application/json'
    });
    if (query) p.set('what', query);
    if (location) p.set('where', location);
    const data = await getJson('adzuna', `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(country)}/search/${Math.max(1, page)}?${p}`);
    return (data.results || []).map(j => ({
      provider: 'adzuna', externalId: String(j.id), title: j.title, company: j.company && j.company.display_name || '',
      description: j.description || '', location: j.location && j.location.display_name || '', remote: null,
      employmentType: [j.contract_time, j.contract_type].filter(Boolean).join(' ').replace(/_/g, '-'),
      tags: j.category && j.category.label ? [j.category.label] : [],
      // Adzuna estimates salaries when absent (salary_is_predicted = "1"); only real figures are surfaced.
      salary: (j.salary_min || j.salary_max) && String(j.salary_is_predicted) !== '1'
        ? { min: j.salary_min || null, max: j.salary_max || null, currency: country === 'in' ? 'INR' : country === 'gb' ? 'GBP' : 'USD', period: 'year' } : null,
      postedAt: j.created ? new Date(j.created) : null, applyUrl: safeUrl(j.redirect_url), sourceUrl: safeUrl(j.redirect_url)
    }));
  }
};

// ── Remotive ─────────────────────────────────────────────────────────────────
const remotive = {
  name: 'remotive', label: 'Remotive',
  configured: () => true,
  async search({ query, limit = 20 }) {
    const p = new URLSearchParams({ category: 'software-dev', limit: String(Math.min(limit * 2, 100)) });
    if (query) p.set('search', query);
    const data = await getJson('remotive', `https://remotive.com/api/remote-jobs?${p}`);
    return (data.jobs || []).map(j => ({
      provider: 'remotive', externalId: String(j.id), title: j.title, company: j.company_name || '',
      description: j.description || '', location: j.candidate_required_location || 'Remote', remote: true,
      employmentType: String(j.job_type || '').replace(/_/g, '-'), tags: j.tags || [],
      salary: null, salaryText: j.salary || '',
      postedAt: j.publication_date ? new Date(j.publication_date) : null, applyUrl: safeUrl(j.url), sourceUrl: safeUrl(j.url)
    })).slice(0, limit * 2);
  }
};

// ── Arbeitnow ────────────────────────────────────────────────────────────────
const arbeitnow = {
  name: 'arbeitnow', label: 'Arbeitnow',
  configured: () => true,
  async search({ query, page = 1 }) {
    const data = await getJson('arbeitnow', `https://www.arbeitnow.com/api/job-board-api?page=${Math.max(1, page)}`);
    return (data.data || []).map(j => ({
      provider: 'arbeitnow', externalId: String(j.slug), title: j.title, company: j.company_name || '',
      description: j.description || '', location: j.location || '', remote: !!j.remote,
      employmentType: (j.job_types || []).join(' ').replace(/_/g, '-'), tags: j.tags || [],
      salary: null, postedAt: j.created_at ? new Date(j.created_at * 1000) : null,
      applyUrl: safeUrl(j.url), sourceUrl: safeUrl(j.url)
    })).filter(r => relevant(r, query));
  }
};

// ── Sample (local development / tests ONLY — never presented as real vacancies) ──
const sample = {
  name: 'sample', label: 'Sample data (not real vacancies)',
  configured: () => true,
  async search({ query }) {
    const rows = require('./sampleJobs');
    return rows.map(r => ({ ...r, provider: 'sample', isSample: true, applyUrl: null, sourceUrl: null, postedAt: new Date() }))
      .filter(r => !query || relevant(r, query) || true);
  }
};

const ALL = { adzuna, remotive, arbeitnow, sample };

function enabledProviders(env = process.env) {
  const list = (env.JOB_PROVIDERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const names = list.length ? list : (adzuna.configured() ? ['adzuna', 'remotive', 'arbeitnow'] : ['remotive', 'arbeitnow']);
  return names.map(n => ALL[n]).filter(Boolean);
}
function providerStatus() {
  return Object.values(ALL).map(p => ({ name: p.name, label: p.label, configured: p.configured(), enabled: enabledProviders().some(e => e.name === p.name) }));
}

module.exports = { ALL, enabledProviders, providerStatus, relevant };
