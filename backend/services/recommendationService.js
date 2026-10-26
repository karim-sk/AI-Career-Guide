/**
 * Recommendation orchestration (DB-backed).
 * Match scores are cached in JobRecommendation keyed by (user, journey, job) and stamped with `profileHash`.
 * A recommendation is STALE if the candidate evidence/weights changed (hash differs) → recomputed lazily.
 */
const JobRecommendation = require('../models/JobRecommendation');
const JobListing = require('../models/JobListing');
const CareerJourney = require('../models/CareerJourney');
const Career = require('../models/Career');
const { computeMatch, rankGaps } = require('./matchingService');
const { loadCandidateProfile } = require('./evidenceService');
const cfg = require('../config/jobMatching');
const jobService = require('./jobService');

const asPlain = d => (d && d.toObject ? d.toObject() : d);

async function matchAndStore(userId, journeyId, job, profile) {
  const jobObj = asPlain(job);
  const m = computeMatch(jobObj, profile);
  const doc = await JobRecommendation.findOneAndUpdate(
    { userId, journeyId: journeyId || null, jobId: jobObj._id },
    { $set: { score: m.score, confidence: m.confidence, breakdown: m.breakdown, skillBreakdown: m.skillBreakdown, warnings: m.warnings,
              explanation: m.explanation, profileHash: profile.hash, weightsVersion: cfg.WEIGHTS_VERSION, computedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return doc;
}

/** Return a fresh recommendation for a single job (recomputing if the stored one is stale). */
async function getOrCompute(userId, journeyId, job, profile) {
  const existing = await JobRecommendation.findOne({ userId, journeyId: journeyId || null, jobId: job._id });
  if (existing && existing.profileHash === profile.hash) return { rec: existing, recomputed: false };
  return { rec: await matchAndStore(userId, journeyId, job, profile), recomputed: true, previousScore: existing ? existing.score : null };
}

/** Search keywords for a journey: the career title (+ first alias) — user can override with their own query. */
async function defaultQueryForJourney(userId, journeyId) {
  if (!journeyId) return '';
  const j = await CareerJourney.findOne({ _id: journeyId, userId }).lean();
  return j ? j.careerName : '';
}

function shapeJob(job, liveIds) {
  const j = asPlain(job);
  return {
      _id: j._id, title: j.title, company: j.company, location: j.location, workMode: j.workMode, employmentType: j.employmentType,
      experience: j.experience, salary: j.salary && (j.salary.min != null || j.salary.max != null) ? j.salary : null,
      postedAt: j.postedAt, applyUrl: j.applyUrl, sourceUrl: j.sourceUrl, provider: j.provider, isSample: j.isSample,
      requiredSkills: j.requiredSkills, preferredSkills: j.preferredSkills,
      freshness: jobService.freshness(j, liveIds), lastFetchedAt: j.lastFetchedAt
  };
}

function shape(job, rec, liveIds) {
  const r = asPlain(rec);
  return {
    job: shapeJob(job, liveIds),
    match: {
      score: r.score, confidence: r.confidence, explanation: r.explanation, warnings: r.warnings,
      matching: [...(r.skillBreakdown.demonstrated || []), ...(r.skillBreakdown.partial || [])].map(s => ({ name: s.name, status: s.status })),
      gaps: rankGaps(r.skillBreakdown).map(s => ({ skillId: s.skillId, name: s.name, status: s.status, importance: s.importance, claimed: s.claimed })),
      computedAt: r.computedAt
    }
  };
}

/**
 * Personalised job list for (user, journey).
 * opts: query, location, page, limit, refresh (force provider re-fetch), filters, sort
 */
async function recommend(userId, journeyId, opts = {}) {
  const profile = await loadCandidateProfile(userId, journeyId);
  const query = (opts.query && opts.query.trim()) || await defaultQueryForJourney(userId, journeyId);
  const limit = Math.min(parseInt(opts.limit, 10) || 20, 50);

  const fetched = await jobService.fetchJobs({ query, location: opts.location || '', page: parseInt(opts.page, 10) || 1, limit, force: !!opts.refresh });
  let jobs = fetched.jobs.filter(j => j.status !== 'expired');

  const items = [];
  for (const job of jobs) {
    const { rec } = await getOrCompute(userId, journeyId, job, profile);
    items.push(shape(job, rec, fetched.liveIds));
  }

  // filters
  const f = opts;
  let out = items.filter(({ job, match }) => {
    if (f.workMode && job.workMode !== f.workMode) return false;
    if (f.jobType && job.employmentType !== f.jobType) return false;
    if (f.minScore && match.score < Number(f.minScore)) return false;
    if (f.experience) {
      const lvl = job.experience.level, min = job.experience.minYears;
      if (f.experience === 'entry' && !((min != null && min <= 1) || ['intern', 'junior'].includes(lvl))) return false;
      if (f.experience === 'mid' && !((min != null && min >= 2 && min <= 5) || lvl === 'mid')) return false;
      if (f.experience === 'senior' && !((min != null && min >= 5) || ['senior', 'lead'].includes(lvl))) return false;
    }
    if (f.minSalary && !(job.salary && job.salary.max != null && job.salary.max >= Number(f.minSalary))) return false;
    if (f.keyword) {
      const k = String(f.keyword).toLowerCase();
      if (!(`${job.title} ${job.company}`.toLowerCase().includes(k) || job.requiredSkills.some(s => s.name.toLowerCase().includes(k)))) return false;
    }
    return true;
  });

  const sort = opts.sort || 'match';
  if (sort === 'date') out.sort((a, b) => new Date(b.job.postedAt || 0) - new Date(a.job.postedAt || 0));
  else out.sort((a, b) => b.match.score - a.match.score);

  return { items: out, providers: fetched.providers, fromCacheOnly: fetched.fromCacheOnly, query, resumeStatus: profile.resumeStatus, profileHash: profile.hash };
}

/** Recompute the stored match for one job after evidence changed; returns { before, after }. */
async function refreshJob(userId, journeyId, jobId) {
  const job = await JobListing.findById(jobId);
  if (!job) return null;
  const profile = await loadCandidateProfile(userId, journeyId);
  const prev = await JobRecommendation.findOne({ userId, journeyId: journeyId || null, jobId });
  const rec = await matchAndStore(userId, journeyId, job, profile);
  return { before: prev ? prev.score : null, after: rec.score, rec };
}

module.exports = { recommend, getOrCompute, refreshJob, matchAndStore, shape, shapeJob, defaultQueryForJourney };
