const http = require('../../backend/services/jobs/http');
const { normalizeJob, htmlToText } = require('../../backend/services/jobs/jobNormalizer');
const providers = require('../../backend/services/jobs/providers');
const { index } = require('../helpers/catalog');

afterEach(() => { http.setFetch(null); delete process.env.ADZUNA_APP_ID; delete process.env.ADZUNA_APP_KEY; });
const mockFetch = (body, status = 200) => http.setFetch(async () => ({ ok: status < 400, status, text: async () => JSON.stringify(body) }));

describe('job normalization', () => {
  const raw = { provider: 'remotive', externalId: '1', title: 'Senior <b>Node.js</b> Engineer', company: 'Acme &amp; Co', location: 'Worldwide', remote: true,
    description: '<p>5+ years of experience required.</p><ul><li>Node.js</li><li>MongoDB</li></ul><p>Nice to have:</p><ul><li>Docker</li></ul><p>Bachelor degree in CS.</p>',
    applyUrl: 'https://example.com/apply/1', postedAt: '2025-01-01' };

  test('html → text, entities decoded, scripts stripped', () => {
    expect(htmlToText('<p>A &amp; B</p><script>alert(1)</script>')).toBe('A & B');
  });
  test('extracts experience, level, work mode, education', () => {
    const j = normalizeJob(raw, index);
    expect(j.experience).toMatchObject({ minYears: 5, level: 'senior' }); expect(j.workMode).toBe('remote'); expect(j.educationRequirement).toBe('bachelor');
    expect(j.company).toBe('Acme & Co');
  });
  test('splits required vs preferred skills', () => {
    const j = normalizeJob(raw, index);
    expect(j.requiredSkills.map(s => s.name)).toEqual(expect.arrayContaining(['Node.js', 'MongoDB']));
    expect(j.preferredSkills.map(s => s.name)).toEqual(['Docker']);
  });
  test('apply link must be real: unsafe or missing URLs drop the listing', () => {
    expect(normalizeJob({ ...raw, applyUrl: 'javascript:alert(1)' }, index)).toBeNull();
    expect(normalizeJob({ ...raw, applyUrl: null }, index)).toBeNull();
    expect(normalizeJob({ ...raw, applyUrl: 'https://user:pw@evil.com/x' }, index)).toBeNull();
  });
  test('application URL comes straight from provider data', () => { expect(normalizeJob(raw, index).applyUrl).toBe('https://example.com/apply/1'); });
  test('sample records never get an apply link and are flagged', () => {
    const j = normalizeJob({ ...raw, isSample: true, applyUrl: 'https://x.com' }, index);
    expect(j.isSample).toBe(true); expect(j.applyUrl).toBeNull();
  });
  test('salary is only present when the provider supplied it', () => { expect(normalizeJob(raw, index).salary.min).toBeNull(); });
  test('same job from two providers shares a dedupeKey', () => {
    const a = normalizeJob(raw, index), b = normalizeJob({ ...raw, provider: 'arbeitnow', externalId: 'zz' }, index);
    expect(a.dedupeKey).toBe(b.dedupeKey);
  });
});

describe('providers (mocked HTTP)', () => {
  test('remotive maps fields and keeps the real url', async () => {
    mockFetch({ jobs: [{ id: 7, url: 'https://remotive.com/remote-jobs/7', title: 'Dev', company_name: 'X', tags: ['node'], job_type: 'full_time', publication_date: '2025-01-01T00:00:00', candidate_required_location: 'USA', description: '<p>x</p>' }] });
    const r = await providers.ALL.remotive.search({ query: 'node' });
    expect(r[0]).toMatchObject({ provider: 'remotive', externalId: '7', applyUrl: 'https://remotive.com/remote-jobs/7', remote: true });
  });
  test('arbeitnow filters by relevance client-side', async () => {
    mockFetch({ data: [{ slug: 'a', title: 'Node.js Backend Dev', company_name: 'A', description: '', url: 'https://www.arbeitnow.com/jobs/a', tags: [], remote: false, location: 'Berlin', created_at: 1700000000 },
                       { slug: 'b', title: 'Pastry Chef', company_name: 'B', description: 'cakes', url: 'https://www.arbeitnow.com/jobs/b', tags: [], remote: false, location: 'Berlin', created_at: 1700000000 }] });
    const r = await providers.ALL.arbeitnow.search({ query: 'node backend' });
    expect(r.map(x => x.externalId)).toEqual(['a']);
  });
  test('adzuna ignores predicted salaries and requires credentials', async () => {
    expect(providers.ALL.adzuna.configured()).toBe(false);
    process.env.ADZUNA_APP_ID = 'id'; process.env.ADZUNA_APP_KEY = 'key';
    expect(providers.ALL.adzuna.configured()).toBe(true);
    let calledUrl; http.setFetch(async url => { calledUrl = url; return { ok: true, status: 200, text: async () => JSON.stringify({ results: [
      { id: 1, title: 'A', company: { display_name: 'C' }, location: { display_name: 'Chennai' }, description: 'd', redirect_url: 'https://www.adzuna.in/land/1', created: '2025-01-01T00:00:00Z', salary_min: 5, salary_max: 9, salary_is_predicted: '1' },
      { id: 2, title: 'B', company: { display_name: 'C' }, location: { display_name: 'Chennai' }, description: 'd', redirect_url: 'https://www.adzuna.in/land/2', created: '2025-01-01T00:00:00Z', salary_min: 500000, salary_max: 900000, salary_is_predicted: '0' }] }) }; });
    const r = await providers.ALL.adzuna.search({ query: 'node', location: 'Chennai' });
    expect(r[0].salary).toBeNull(); expect(r[1].salary.min).toBe(500000);
    expect(calledUrl).toContain('/jobs/in/search/1');
  });
  test('HTTP errors, rate limits, bad JSON and timeouts raise ProviderError (never crash)', async () => {
    mockFetch({}, 500); await expect(providers.ALL.remotive.search({})).rejects.toThrow(/HTTP 500/);
    mockFetch({}, 429); await expect(providers.ALL.remotive.search({})).rejects.toThrow(/rate limit/);
    http.setFetch(async () => ({ ok: true, status: 200, text: async () => '<html>' })); await expect(providers.ALL.remotive.search({})).rejects.toThrow(/invalid JSON/);
    http.setFetch(async () => { throw new Error('ECONNRESET'); }); await expect(providers.ALL.remotive.search({})).rejects.toThrow(/unreachable/);
  });
  test('provider selection honours JOB_PROVIDERS', () => {
    expect(providers.enabledProviders({ JOB_PROVIDERS: 'sample' }).map(p => p.name)).toEqual(['sample']);
    expect(providers.enabledProviders({ JOB_PROVIDERS: 'remotive,bogus' }).map(p => p.name)).toEqual(['remotive']);
  });
});
