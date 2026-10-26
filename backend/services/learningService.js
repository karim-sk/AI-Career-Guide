/**
 * Learning activities, completion and server-side skill verification.
 *
 *  completeActivity   atomic + idempotent. Records completion, ticks the linked roadmap topic, recalculates roadmap progress,
 *                     stores COURSE evidence (partial only) and decides whether verification is pending / unavailable / not required.
 *  startVerification  picks questions from the Question bank (answers never sent to the client)
 *  submitVerification grades on the server; only a passing score creates "demonstrated" evidence
 *  submitPractical    records a user-submitted project link as PARTIAL evidence (cannot be machine-verified)
 */
const crypto = require('crypto');
const LearningActivity = require('../models/LearningActivity');
const SkillEvidence = require('../models/SkillEvidence');
const SkillVerification = require('../models/SkillVerification');
const Question = require('../models/Question');
const Skill = require('../models/Skill');
const Roadmap = require('../models/Roadmap');
const CareerJourney = require('../models/CareerJourney');
const JobListing = require('../models/JobListing');
const cfg = require('../config/jobMatching');
const { isId, httpError } = require('../utils/ids');
const { safeUrl } = require('./jobs/http');
const { loadCandidateProfile } = require('./evidenceService');
const recommendation = require('./recommendationService');

// 0 is a legitimate value (disables the cooldown) → don't use `|| default`
const intEnv = (name, def) => { const n = parseInt(process.env[name], 10); return Number.isFinite(n) && n >= 0 ? n : def; };
const COOLDOWN_MIN = () => intEnv('VERIFICATION_COOLDOWN_MINUTES', 30);
const DAILY_CAP = () => intEnv('VERIFICATION_DAILY_CAP', 6) || 6;

const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
const activityKey = ({ roadmapId, topicId, journeyId, skillId, title }) =>
  topicId ? `t:${roadmapId}:${topicId}` : `s:${journeyId || 'none'}:${skillId || 'none'}:${slug(title)}`;

async function ownJourney(userId, journeyId) {
  if (!journeyId) return null;
  if (!isId(journeyId)) throw httpError(400, 'Invalid journeyId.');
  const j = await CareerJourney.findOne({ _id: journeyId, userId });
  if (!j) throw httpError(403, 'Journey not found or access denied.');
  return j;
}

function findTopic(roadmap, topicId) {
  for (const p of roadmap.phases) for (const w of p.weeks || []) for (const t of w.topics || []) {
    if (String(t._id) === String(topicId)) return t;
  }
  return null;
}

// ── Activities ───────────────────────────────────────────────────────────────
async function createActivity(userId, body) {
  const { title, type, url, journeyId, skillId, roadmapId, topicId, jobId } = body || {};
  if (!title || typeof title !== 'string' || title.trim().length < 2) throw httpError(400, 'title is required.');
  const journey = await ownJourney(userId, journeyId);

  let skill = null;
  if (skillId) {
    if (!isId(skillId)) throw httpError(400, 'Invalid skillId.');
    skill = await Skill.findById(skillId).select('name');
    if (!skill) throw httpError(404, 'Skill not found.');
  }
  let roadmap = null, topic = null;
  if (roadmapId || topicId) {
    if (!isId(roadmapId) || !isId(topicId)) throw httpError(400, 'roadmapId and topicId must both be valid ids.');
    roadmap = await Roadmap.findOne({ _id: roadmapId, userId });
    if (!roadmap) throw httpError(404, 'Roadmap not found or access denied.');
    topic = findTopic(roadmap, topicId);
    if (!topic) throw httpError(404, 'Topic not found in roadmap.');
    if (journey && roadmap.journeyId && String(roadmap.journeyId) !== String(journey._id)) throw httpError(400, 'Roadmap does not belong to this journey.');
  }
  if (jobId && !isId(jobId)) throw httpError(400, 'Invalid jobId.');

  const fields = {
    userId, journeyId: journey ? journey._id : (roadmap && roadmap.journeyId) || null,
    skillId: skill ? skill._id : null, skillName: skill ? skill.name : '',
    jobId: jobId || (roadmap && roadmap.jobContext && roadmap.jobContext.jobId) || null,
    roadmapId: roadmap ? roadmap._id : null, topicId: topic ? topic._id : null,
    title: title.trim().slice(0, 200),
    type: ['course', 'documentation', 'tutorial', 'exercise', 'project', 'certification'].includes(type) ? type : 'course',
    url: url ? (safeUrl(url) || '') : ''
  };
  fields.activityKey = activityKey({ roadmapId: fields.roadmapId, topicId: fields.topicId, journeyId: fields.journeyId, skillId: fields.skillId, title: fields.title });

  // Upsert on the idempotency key → double-clicks / retries never create duplicates
  const activity = await LearningActivity.findOneAndUpdate(
    { userId, activityKey: fields.activityKey },
    { $setOnInsert: fields },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return activity;
}

async function startActivity(userId, id) {
  const a = await owned(userId, id);
  if (a.status === 'not_started') {
    a.status = 'in_progress'; a.startedAt = new Date(); await a.save();
  }
  return a;
}

async function owned(userId, id) {
  if (!isId(id)) throw httpError(400, 'Invalid activity id.');
  const a = await LearningActivity.findOne({ _id: id, userId });
  if (!a) throw httpError(404, 'Activity not found or access denied.');
  return a;
}

async function verificationAvailable(skillId) {
  if (!skillId) return false;
  const n = await Question.countDocuments({ skillId, isActive: true });
  return n >= cfg.VERIFICATION_MIN_QUESTIONS;
}

async function completeActivity(userId, id, body = {}) {
  const act = await owned(userId, id);
  const { syncJourneyProgress, buildProgressSummary } = require('../controllers/roadmapController');

  const progressOf = async () => {
    if (!act.roadmapId) return null;
    const rm = await Roadmap.findOne({ _id: act.roadmapId, userId });
    return rm ? buildProgressSummary(rm) : null;
  };

  if (act.status === 'completed') {
    return { activity: act, alreadyCompleted: true, roadmapProgress: await progressOf(), verification: await verificationInfo(userId, act), match: null };
  }

  const certificateUrl = body.certificateUrl ? safeUrl(body.certificateUrl) : '';
  if (body.certificateUrl && !certificateUrl) throw httpError(400, 'certificateUrl must be a valid http(s) link.');
  const previous = { status: act.status, startedAt: act.startedAt };

  // 1) atomic claim — only one concurrent request can flip the status
  const claimed = await LearningActivity.findOneAndUpdate(
    { _id: act._id, userId, status: { $ne: 'completed' } },
    { $set: { status: 'completed', completedAt: new Date(), startedAt: act.startedAt || new Date(), certificateUrl: certificateUrl || '', notes: String(body.notes || '').slice(0, 1000) } },
    { new: true }
  );
  if (!claimed) {
    const cur = await LearningActivity.findById(act._id);
    return { activity: cur, alreadyCompleted: true, roadmapProgress: await progressOf(), verification: await verificationInfo(userId, cur), match: null };
  }

  try {
    // 2) roadmap topic + progress (existing single-source-of-truth recalculation)
    let roadmapProgress = null;
    if (claimed.roadmapId && claimed.topicId) {
      const rm = await Roadmap.findOne({ _id: claimed.roadmapId, userId });
      if (rm) {
        const topic = findTopic(rm, claimed.topicId);
        if (topic) { topic.completed = true; topic.completedAt = topic.completedAt || new Date(); if (!topic.startedAt) topic.startedAt = new Date(); }
        rm.recalculateProgress();
        await rm.save();
        await syncJourneyProgress(userId, rm);      // no-op for job roadmaps
        roadmapProgress = buildProgressSummary(rm);
      }
    } else roadmapProgress = await progressOf();

    // 3) evidence: course completion = PARTIAL only
    if (claimed.skillId) {
      await SkillEvidence.findOneAndUpdate(
        { userId, type: 'course', refId: String(claimed._id) },
        { $setOnInsert: { userId, skillId: claimed.skillId, journeyId: claimed.journeyId, type: 'course', refId: String(claimed._id), url: certificateUrl || claimed.url || '', note: claimed.title } },
        { upsert: true }
      );
    }

    // 4) verification status
    let verificationStatus = 'not_required';
    if (claimed.skillId) {
      const profile = await loadCandidateProfile(userId, claimed.journeyId);
      const st = profile.skills.get(String(claimed.skillId));
      if (st && st.status === 'demonstrated') verificationStatus = 'verified';
      else verificationStatus = (await verificationAvailable(claimed.skillId)) ? 'pending' : 'unavailable';
    }
    claimed.verificationStatus = verificationStatus;
    if (verificationStatus === 'verified') claimed.verifiedAt = new Date();
    await claimed.save();

    // 5) refresh the affected job match (profile hash changed because evidence did)
    const match = claimed.jobId ? await safeRefresh(userId, claimed.journeyId, claimed.jobId) : null;
    return { activity: claimed, alreadyCompleted: false, roadmapProgress, verification: await verificationInfo(userId, claimed), match };
  } catch (err) {
    // compensate so the UI never sees a success state for a half-applied update
    await LearningActivity.updateOne({ _id: act._id, userId }, { $set: { status: previous.status, startedAt: previous.startedAt, completedAt: null, verificationStatus: 'not_required' } });
    throw err;
  }
}

async function safeRefresh(userId, journeyId, jobId) {
  try {
    const r = await recommendation.refreshJob(userId, journeyId, jobId);
    return r ? { jobId: String(jobId), before: r.before, after: r.after, changed: r.before !== null && r.before !== r.after } : null;
  } catch (e) { return null; }
}

async function verificationInfo(userId, act) {
  if (!act.skillId) return { status: 'not_required', available: false, message: 'No skill is linked to this activity.' };
  const available = await verificationAvailable(act.skillId);
  const msg = {
    verified: `${act.skillName} is demonstrated by a graded assessment.`,
    pending: `Course recorded. ${act.skillName} is NOT yet verified — take the skill check to demonstrate it.`,
    unavailable: `Course recorded. No verification test exists for ${act.skillName} yet, so it stays "partially demonstrated".`,
    failed: `The last ${act.skillName} check was not passed. You can retry after the cooldown.`,
    not_required: 'No verification required.'
  }[act.verificationStatus] || '';
  return { status: act.verificationStatus, available, message: msg };
}

// ── Verification ─────────────────────────────────────────────────────────────
function pickQuestions(all) {
  const by = { easy: [], medium: [], hard: [] };
  all.forEach(q => (by[q.difficulty] || by.medium).push(q));
  Object.values(by).forEach(a => a.sort(() => Math.random() - 0.5));
  const picked = [...by.easy.slice(0, 2), ...by.medium.slice(0, 2), ...by.hard.slice(0, 2)];
  const rest = all.filter(q => !picked.includes(q));
  rest.sort(() => Math.random() - 0.5);
  return [...picked, ...rest].slice(0, cfg.VERIFICATION_MAX_QUESTIONS).sort(() => Math.random() - 0.5);
}

const clientView = (v, qs) => ({
  verificationId: v._id, skillId: v.skillId, status: v.status, passThreshold: v.passThreshold,
  questions: v.questions.map(item => {
    const q = qs.find(x => String(x._id) === String(item.questionId));
    return q ? { questionId: q._id, question: q.question, options: q.options, difficulty: q.difficulty } : null;
  }).filter(Boolean)
});

async function startVerification(userId, body = {}) {
  const { skillId, activityId, journeyId, jobId } = body;
  if (!isId(skillId)) throw httpError(400, 'skillId is required.');
  if (journeyId) await ownJourney(userId, journeyId);
  if (activityId) { const a = await owned(userId, activityId); if (String(a.skillId) !== String(skillId)) throw httpError(400, 'Activity is linked to a different skill.'); }
  const skill = await Skill.findById(skillId).select('name');
  if (!skill) throw httpError(404, 'Skill not found.');

  const profile = await loadCandidateProfile(userId, journeyId || null);
  const st = profile.skills.get(String(skillId));
  if (st && st.status === 'demonstrated') throw httpError(409, `${skill.name} is already demonstrated — no verification needed.`);

  // resume an unfinished attempt instead of creating duplicates
  const open = await SkillVerification.findOne({ userId, skillId, status: 'in-progress' });
  if (open) {
    const qs = await Question.find({ _id: { $in: open.questions.map(q => q.questionId) } }).lean();
    return { ...clientView(open, qs), resumed: true, skillName: skill.name };
  }

  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const recent = await SkillVerification.find({ userId, skillId, completedAt: { $gte: since } }).sort({ completedAt: -1 }).lean();
  if (recent.length >= DAILY_CAP()) throw httpError(429, 'Daily verification limit reached for this skill. Try again tomorrow.');
  const lastFail = recent.find(r => r.status === 'failed');
  if (lastFail && Date.now() - new Date(lastFail.completedAt) < COOLDOWN_MIN() * 60000) {
    const mins = Math.ceil(COOLDOWN_MIN() - (Date.now() - new Date(lastFail.completedAt)) / 60000);
    throw httpError(429, `Please review the topic first. You can retry in about ${mins} minute(s).`);
  }

  const bank = await Question.find({ skillId, isActive: true }).lean();
  if (bank.length < cfg.VERIFICATION_MIN_QUESTIONS) throw httpError(422, `No verification test is available for ${skill.name} yet.`);
  const chosen = pickQuestions(bank);
  const v = await SkillVerification.create({
    userId, skillId, journeyId: journeyId || null, activityId: activityId || null, jobId: jobId && isId(jobId) ? jobId : null,
    questions: chosen.map(q => ({ questionId: q._id })), passThreshold: cfg.VERIFICATION_PASS
  });
  return { ...clientView(v, chosen), resumed: false, skillName: skill.name };
}

async function submitVerification(userId, id, answers) {
  if (!isId(id)) throw httpError(400, 'Invalid verification id.');
  const v = await SkillVerification.findOne({ _id: id, userId });
  if (!v) throw httpError(404, 'Verification not found or access denied.');
  const skill = await Skill.findById(v.skillId).select('name');

  if (v.status !== 'in-progress') {                          // idempotent replay
    return resultView(v, skill, null, true);
  }
  if (!Array.isArray(answers) || answers.length > 20) throw httpError(400, 'answers must be an array.');
  const given = new Map();
  for (const a of answers) {
    if (!a || !isId(String(a.questionId)) || !Number.isInteger(a.selectedAnswer) || a.selectedAnswer < 0 || a.selectedAnswer > 3) throw httpError(400, 'Each answer needs a questionId and selectedAnswer (0-3).');
    given.set(String(a.questionId), a.selectedAnswer);
  }

  const qs = await Question.find({ _id: { $in: v.questions.map(q => q.questionId) } }).lean();
  let correct = 0;
  const graded = v.questions.map(item => {
    const q = qs.find(x => String(x._id) === String(item.questionId));
    const sel = given.has(String(item.questionId)) ? given.get(String(item.questionId)) : null;
    const ok = !!q && sel === q.correctAnswer;
    if (ok) correct++;
    return { questionId: item.questionId, selectedAnswer: sel, isCorrect: ok };
  });
  const score = Math.round((correct / graded.length) * 100);
  const passed = score >= v.passThreshold;

  // atomic transition — a concurrent duplicate submit loses the race and just reads the stored result
  const done = await SkillVerification.findOneAndUpdate(
    { _id: v._id, userId, status: 'in-progress' },
    { $set: { questions: graded, score, status: passed ? 'passed' : 'failed', completedAt: new Date() } },
    { new: true }
  );
  if (!done) return resultView(await SkillVerification.findById(v._id), skill, null, true);

  await SkillEvidence.findOneAndUpdate(
    { userId, type: 'verification', refId: String(v._id) },
    { $setOnInsert: { userId, skillId: v.skillId, journeyId: v.journeyId, type: 'verification', refId: String(v._id), score, passed, note: `Skill check: ${correct}/${graded.length}` } },
    { upsert: true }
  );

  const actUpdate = { verificationStatus: passed ? 'verified' : 'failed', verificationId: v._id };
  if (passed) actUpdate.verifiedAt = new Date();
  if (v.activityId) await LearningActivity.updateOne({ _id: v.activityId, userId }, { $set: actUpdate });
  if (passed) {   // verification is skill-level: every completed activity for this skill that was pending becomes verified
    await LearningActivity.updateMany({ userId, skillId: v.skillId, status: 'completed', verificationStatus: 'pending' }, { $set: { verificationStatus: 'verified', verifiedAt: new Date(), verificationId: v._id } });
  }

  const match = v.jobId ? await safeRefresh(userId, v.journeyId, v.jobId) : null;
  return resultView(done, skill, match, false, qs);
}

function resultView(v, skill, match, replay, qs) {
  const passed = v.status === 'passed';
  return {
    verificationId: v._id, skillId: v.skillId, skillName: skill ? skill.name : '', status: v.status, passed,
    score: v.score, passThreshold: v.passThreshold, replay,
    correctCount: v.questions.filter(q => q.isCorrect).length, total: v.questions.length,
    message: passed
      ? `${skill ? skill.name : 'Skill'} is now demonstrated (${v.score}%).`
      : `Score ${v.score}% — below the ${v.passThreshold}% needed. The skill stays unverified; review the topic and retry after the cooldown. (Answers are not revealed on a failed attempt.)`,
    // explanations only on a pass → a failed attempt can't be used to harvest answers
    review: passed && qs ? v.questions.map(item => {
      const q = qs.find(x => String(x._id) === String(item.questionId));
      return q ? { question: q.question, correctOption: q.options[q.correctAnswer], explanation: q.explanation, wasCorrect: item.isCorrect } : null;
    }).filter(Boolean) : undefined,
    match
  };
}

// ── Practical evidence ───────────────────────────────────────────────────────
async function submitPractical(userId, body = {}) {
  const { skillId, url, description, journeyId, activityId } = body;
  if (!isId(skillId)) throw httpError(400, 'skillId is required.');
  const link = safeUrl(url);
  if (!link) throw httpError(400, 'A valid http(s) link to your project/repository is required.');
  if (journeyId) await ownJourney(userId, journeyId);
  const skill = await Skill.findById(skillId).select('name');
  if (!skill) throw httpError(404, 'Skill not found.');
  const ref = crypto.createHash('sha1').update(`${skillId}|${link}`).digest('hex');
  await SkillEvidence.findOneAndUpdate(
    { userId, type: 'practical', refId: ref },
    { $setOnInsert: { userId, skillId, journeyId: journeyId || null, type: 'practical', refId: ref, url: link, note: String(description || '').slice(0, 300) } },
    { upsert: true }
  );
  if (activityId && isId(activityId)) await LearningActivity.updateOne({ _id: activityId, userId }, { $set: { certificateUrl: link } });
  return { skillName: skill.name, message: `Practical work recorded as partial evidence for ${skill.name}. It cannot be verified automatically — take the skill check to demonstrate it.` };
}

// ── Reads ────────────────────────────────────────────────────────────────────
async function listActivities(userId, { journeyId, status, limit = 50 } = {}) {
  const q = { userId };
  if (journeyId) { if (!isId(journeyId)) throw httpError(400, 'Invalid journeyId.'); q.journeyId = journeyId; }
  if (status) q.status = String(status);
  return LearningActivity.find(q).sort({ updatedAt: -1 }).limit(Math.min(limit, 100));
}

/** Evidence overview + roadmap-completion summary used by the UI. */
async function evidenceSummary(userId, journeyId) {
  const profile = await loadCandidateProfile(userId, journeyId || null);
  const skills = [...profile.skills.values()];
  const by = st => skills.filter(s => s.status === st).map(s => ({ skillId: s.skillId, name: s.name, claimed: s.claimed, sources: s.sources, score: s.score }));
  return {
    resumeStatus: profile.resumeStatus, years: profile.years,
    demonstrated: by('demonstrated'), partial: by('partial'), inProgress: by('in_progress'),
    notAssessed: by('not_assessed'), missingEvidence: by('missing_evidence')
  };
}

async function roadmapSummary(userId, roadmapId) {
  if (!isId(roadmapId)) throw httpError(400, 'Invalid roadmap id.');
  const rm = await Roadmap.findOne({ _id: roadmapId, userId });
  if (!rm) throw httpError(404, 'Roadmap not found or access denied.');
  const acts = await LearningActivity.find({ userId, roadmapId }).lean();
  const profile = await loadCandidateProfile(userId, rm.journeyId);
  const gapSkills = (rm.jobContext && rm.jobContext.gapSkills) || [];
  const verified = [], unverified = [];
  for (const g of gapSkills) {
    const st = profile.skills.get(String(g.skillId));
    (st && st.status === 'demonstrated' ? verified : unverified).push({ skillId: g.skillId, name: g.skillName, status: st ? st.status : 'not_assessed' });
  }
  let match = null;
  if (rm.jobContext && rm.jobContext.jobId) {
    const job = await JobListing.findById(rm.jobContext.jobId);
    if (job) { const r = await recommendation.getOrCompute(userId, rm.journeyId, job, profile); match = { score: r.rec.score, explanation: r.rec.explanation, applyUrl: job.applyUrl, jobId: job._id }; }
  }
  return {
    complete: rm.overallProgress >= 100, overallProgress: rm.overallProgress,
    completedActivities: acts.filter(a => a.status === 'completed').map(a => ({ title: a.title, skillName: a.skillName, completedAt: a.completedAt, verificationStatus: a.verificationStatus })),
    verifiedSkills: verified, unverifiedSkills: unverified, match,
    note: 'Completing a roadmap does not by itself qualify you for a role; verified skills and the job requirements decide your match.'
  };
}

module.exports = { createActivity, startActivity, completeActivity, startVerification, submitVerification, submitPractical, listActivities, evidenceSummary, roadmapSummary, activityKey };
