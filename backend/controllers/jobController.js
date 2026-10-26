const JobListing = require('../models/JobListing');
const JobRecommendation = require('../models/JobRecommendation');
const SavedJob = require('../models/SavedJob');
const User = require('../models/User');
const Resume = require('../models/Resume');
const LearningActivity = require('../models/LearningActivity');
const CareerJourney = require('../models/CareerJourney');
const Roadmap = require('../models/Roadmap');
const rec = require('../services/recommendationService');
const jobService = require('../services/jobService');
const { providerStatus } = require('../services/jobs/providers');
const { loadCandidateProfile } = require('../services/evidenceService');
const { rankGaps } = require('../services/matchingService');
const { isId, httpError } = require('../utils/ids');

const wrap = fn => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };

async function checkJourney(userId, journeyId) {
  if (!journeyId) return null;
  if (!isId(journeyId)) throw httpError(400, 'Invalid journeyId.');
  const j = await CareerJourney.findOne({ _id: journeyId, userId });
  if (!j) throw httpError(403, 'Journey not found or access denied.');
  return j;
}
const str = v => (typeof v === 'string' ? v.slice(0, 100) : '');

// GET /api/jobs/providers
exports.providers = wrap(async (req, res) => res.json({ success: true, providers: providerStatus() }));

// GET /api/jobs/recommendations
exports.recommendations = wrap(async (req, res) => {
  const q = req.query;
  await checkJourney(req.user._id, q.journeyId);
  const out = await rec.recommend(req.user._id, q.journeyId || null, {
    query: str(q.query), location: str(q.location), page: q.page, limit: q.limit, refresh: q.refresh === '1' || q.refresh === 'true',
    workMode: ['remote', 'hybrid', 'onsite'].includes(q.workMode) ? q.workMode : '',
    jobType: str(q.jobType), experience: ['entry', 'mid', 'senior'].includes(q.experience) ? q.experience : '',
    minScore: Math.max(0, Math.min(100, Number(q.minScore) || 0)), minSalary: Number(q.minSalary) || 0,
    keyword: str(q.keyword), sort: q.sort === 'date' ? 'date' : 'match'
  });
  const savedIds = new Set((await SavedJob.find({ userId: req.user._id }).select('jobId').lean()).map(s => String(s.jobId)));
  out.items.forEach(i => { i.saved = savedIds.has(String(i.job._id)); });
  const anyReal = out.items.some(i => !i.job.isSample);
  res.json({
    success: true, ...out, count: out.items.length,
    notice: out.items.length && !anyReal ? 'These are sample/test records, not real vacancies.' :
      out.fromCacheOnly ? 'Job providers are unreachable right now — showing previously fetched listings. Availability is not guaranteed.' : undefined
  });
});

// GET /api/jobs/:id?journeyId=
exports.detail = wrap(async (req, res) => {
  if (!isId(req.params.id)) throw httpError(400, 'Invalid job id.');
  await checkJourney(req.user._id, req.query.journeyId);
  const job = await JobListing.findById(req.params.id);
  if (!job) throw httpError(404, 'Job not found.');
  const profile = await loadCandidateProfile(req.user._id, req.query.journeyId || null);
  const { rec: r } = await rec.getOrCompute(req.user._id, req.query.journeyId || null, job, profile);
  const shaped = rec.shape(job, r, new Set());
  const detail = { ...shaped.job, description: job.description, educationRequirement: job.educationRequirement, tags: job.tags };
  const gaps = rankGaps(r.skillBreakdown);
  const roadmap = req.query.journeyId
    ? await Roadmap.findOne({ userId: req.user._id, journeyId: req.query.journeyId, kind: 'job', 'jobContext.jobId': job._id, jobActive: true }).select('overallProgress _id').lean()
    : null;
  const saved = !!(await SavedJob.findOne({ userId: req.user._id, jobId: job._id }));
  res.json({
    success: true, job: detail, saved,
    match: { ...shaped.match, breakdown: r.breakdown, skillBreakdown: r.skillBreakdown, categories: {
      demonstrated: r.skillBreakdown.demonstrated, partial: r.skillBreakdown.partial, inProgress: r.skillBreakdown.inProgress,
      notAssessed: r.skillBreakdown.notAssessed, missingEvidence: r.skillBreakdown.missingEvidence
    } },
    nextSteps: gaps.slice(0, 4).map(g => ({
      skillId: g.skillId, name: g.name, status: g.status, importance: g.importance,
      suggestion: g.status === 'missing_evidence' ? `Learn ${g.name} — your assessment showed a gap — then verify it.`
        : g.status === 'not_assessed' ? `Take a ${g.name} skill check to find out where you stand.`
        : g.status === 'in_progress' ? `Finish your ${g.name} learning, then verify it.`
        : `Verify ${g.name} with a skill check to turn partial evidence into demonstrated.`
    })),
    preparationPlan: roadmap ? { roadmapId: roadmap._id, progress: roadmap.overallProgress } : null,
    resumeStatus: profile.resumeStatus
  });
});

// POST /api/jobs/:id/refresh { journeyId }
exports.refresh = wrap(async (req, res) => {
  if (!isId(req.params.id)) throw httpError(400, 'Invalid job id.');
  const journeyId = req.body && req.body.journeyId;
  await checkJourney(req.user._id, journeyId);
  const r = await rec.refreshJob(req.user._id, journeyId || null, req.params.id);
  if (!r) throw httpError(404, 'Job not found.');
  res.json({ success: true, before: r.before, after: r.after, score: r.rec.score, explanation: r.rec.explanation });
});

// Saved jobs
exports.save = wrap(async (req, res) => {
  if (!isId(req.params.id)) throw httpError(400, 'Invalid job id.');
  if (!(await JobListing.exists({ _id: req.params.id }))) throw httpError(404, 'Job not found.');
  await SavedJob.updateOne({ userId: req.user._id, jobId: req.params.id }, { $setOnInsert: { userId: req.user._id, jobId: req.params.id } }, { upsert: true });
  res.json({ success: true, saved: true });
});
exports.unsave = wrap(async (req, res) => {
  if (!isId(req.params.id)) throw httpError(400, 'Invalid job id.');
  await SavedJob.deleteOne({ userId: req.user._id, jobId: req.params.id });
  res.json({ success: true, saved: false });
});
exports.saved = wrap(async (req, res) => {
  const items = await SavedJob.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100).populate('jobId');
  res.json({ success: true, jobs: items.filter(i => i.jobId).map(i => rec.shapeJob(i.jobId, new Set())) });
});

// Preferences
exports.getPrefs = wrap(async (req, res) => {
  const u = await User.findById(req.user._id).select('jobPreferences experienceLevel education');
  res.json({ success: true, preferences: u.jobPreferences || {}, experienceLevel: u.experienceLevel, education: u.education });
});
exports.setPrefs = wrap(async (req, res) => {
  const b = req.body || {};
  const list = (v, allowed) => (Array.isArray(v) ? v.filter(x => typeof x === 'string').map(x => x.trim().slice(0, 60)).filter(x => x && (!allowed || allowed.includes(x))).slice(0, 10) : []);
  const prefs = {
    locations: list(b.locations), workModes: list(b.workModes, ['remote', 'hybrid', 'onsite']),
    jobTypes: list(b.jobTypes, ['full-time', 'part-time', 'contract', 'internship']),
    minSalary: Number.isFinite(Number(b.minSalary)) && Number(b.minSalary) > 0 ? Number(b.minSalary) : null
  };
  await User.updateOne({ _id: req.user._id }, { $set: { jobPreferences: prefs } });
  res.json({ success: true, preferences: prefs });
});

// GET /api/jobs/summary?journeyId=  — cheap dashboard data (no provider calls)
exports.summary = wrap(async (req, res) => {
  const userId = req.user._id, journeyId = req.query.journeyId || null;
  await checkJourney(userId, journeyId);
  const [resume, recCount, best, saved, recent] = await Promise.all([
    Resume.findOne({ userId }).select('reviewStatus parseStatus uploadedAt skills').lean(),
    JobRecommendation.countDocuments({ userId, ...(journeyId ? { journeyId } : {}) }),
    JobRecommendation.findOne({ userId, ...(journeyId ? { journeyId } : {}) }).sort({ score: -1 }).select('score jobId').populate('jobId', 'title company').lean(),
    SavedJob.countDocuments({ userId }),
    LearningActivity.find({ userId }).sort({ updatedAt: -1 }).limit(5).select('title status verificationStatus skillName updatedAt').lean()
  ]);
  res.json({
    success: true,
    resume: resume ? { status: resume.reviewStatus, parse: resume.parseStatus, skills: resume.skills.length, uploadedAt: resume.uploadedAt } : null,
    recommendations: { count: recCount, best: best && best.jobId ? { score: best.score, title: best.jobId.title, company: best.jobId.company } : null },
    savedJobs: saved, recentActivities: recent
  });
});
