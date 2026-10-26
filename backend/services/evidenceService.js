/**
 * Evidence model — turns raw records into a per-skill status.
 *
 *   demonstrated     latest test score (assessment or server-graded verification) ≥ 70
 *   partial          test score 40–69, OR course completed, OR practical link submitted, OR resume claim with applied context
 *   in_progress      a learning activity for the skill is in progress (and nothing stronger)
 *   not_assessed     no test evidence. `claimed:true` if listed on a confirmed resume / self-rated ≥ 50
 *   missing_evidence latest test score < 40 (an actual assessed gap — never used for merely unassessed skills)
 *
 * Course completion NEVER yields "demonstrated". Only a backend-graded test can.
 */
const crypto = require('crypto');
const cfg = require('../config/jobMatching');

/** Pure: classify a single skill from gathered facts. */
function classifySkill(f) {
  const sources = [];
  if (f.testScore != null) sources.push(`${f.testSource || 'assessment'}: ${f.testScore}%`);
  if (f.courseCompleted) sources.push('course completed');
  if (f.practical) sources.push('practical submitted');
  if (f.resume) sources.push(f.resume === 'applied' ? 'resume (used in project/experience)' : 'resume (listed)');
  if (f.inProgress) sources.push('learning in progress');
  if (f.selfRating != null && f.selfRating >= 50) sources.push('self-rated');

  let status, claimed = false;
  if (f.testScore != null) {
    status = f.testScore >= cfg.DEMONSTRATED_MIN ? 'demonstrated' : f.testScore >= cfg.PARTIAL_MIN ? 'partial' : 'missing_evidence';
  } else if (f.courseCompleted || f.practical || f.resume === 'applied') {
    status = 'partial';
  } else if (f.inProgress) {
    status = 'in_progress';
  } else {
    status = 'not_assessed';
    claimed = f.resume === 'listed' || (f.selfRating != null && f.selfRating >= 50);
  }
  return { status, claimed, sources, score: f.testScore != null ? f.testScore : null };
}

const levelFromText = text => {
  const t = String(text || '').toLowerCase();
  if (/ph\.?d|doctorate/.test(t)) return 'phd';
  if (/master|m\.?tech|m\.?sc|\bmca\b|\bmba\b/.test(t)) return 'master';
  if (/bachelor|b\.?tech|b\.?sc|\bbca\b|b\.?e\b|\bbs\b/.test(t)) return 'bachelor';
  if (/diploma/.test(t)) return 'diploma';
  if (/high school|12th|hsc/.test(t)) return 'highschool';
  return null;
};

/** Gather all evidence for a user from the database. */
async function loadCandidateProfile(userId, journeyId = null) {
  const User = require('../models/User');
  const Resume = require('../models/Resume');
  const AssessmentResult = require('../models/AssessmentResult');
  const SkillEvidence = require('../models/SkillEvidence');
  const LearningActivity = require('../models/LearningActivity');
  const CareerJourney = require('../models/CareerJourney');
  const Career = require('../models/Career');
  const Skill = require('../models/Skill');

  const [user, resume, results, evidence, active] = await Promise.all([
    User.findById(userId).lean(),
    Resume.findOne({ userId }).lean(),
    AssessmentResult.find({ userId }).sort({ completedAt: -1 }).limit(25).select('skillScores completedAt').lean(),
    SkillEvidence.find({ userId }).lean(),
    LearningActivity.find({ userId, status: 'in_progress' }).select('skillId').lean()
  ]);

  const journey = journeyId ? await CareerJourney.findOne({ _id: journeyId, userId }).lean() : null;
  const career = journey ? await Career.findById(journey.careerId).select('title aliases').lean()
                         : (user && user.careerGoal ? await Career.findById(user.careerGoal).select('title aliases').lean() : null);

  const facts = new Map();   // skillId → facts
  const names = new Map();
  const get = id => { id = String(id); if (!facts.has(id)) facts.set(id, {}); return facts.get(id); };
  const newer = (f, score, at, src) => { if (!f.testAt || at > f.testAt) { f.testScore = score; f.testAt = at; f.testSource = src; } };

  for (const r of results) for (const s of r.skillScores || []) {
    if (!s.skillId) continue;
    newer(get(s.skillId), s.score, new Date(r.completedAt || 0), 'assessment');
    if (s.skillName) names.set(String(s.skillId), s.skillName);
  }
  for (const e of evidence) {
    const f = get(e.skillId);
    if (e.type === 'verification' && e.score != null) newer(f, e.score, new Date(e.createdAt || 0), 'verification');
    if (e.type === 'course') f.courseCompleted = true;
    if (e.type === 'practical') f.practical = true;
  }
  for (const a of active) if (a.skillId) get(a.skillId).inProgress = true;

  const resumeConfirmed = !!(resume && resume.reviewStatus === 'confirmed' && resume.parseStatus !== 'failed');
  const projectSkillIds = new Set();
  if (resumeConfirmed) for (const s of resume.skills || []) {
    const f = get(s.skillId);
    f.resume = s.evidence === 'applied' ? 'applied' : (f.resume || 'listed');
    names.set(String(s.skillId), s.name);
    if (s.evidence === 'applied') projectSkillIds.add(String(s.skillId));
  }
  for (const e of evidence) if (e.type === 'practical') projectSkillIds.add(String(e.skillId));

  for (const s of (user && user.skills) || []) if (s.skillId && s.selfRating >= 50) get(s.skillId).selfRating = s.selfRating;
  for (const s of (journey && journey.selectedSkills) || []) if (s.skillId && s.selfRating >= 50) get(s.skillId).selfRating = Math.max(get(s.skillId).selfRating || 0, s.selfRating);

  const unnamed = [...facts.keys()].filter(id => !names.has(id));
  if (unnamed.length) (await Skill.find({ _id: { $in: unnamed } }).select('name').lean()).forEach(s => names.set(String(s._id), s.name));

  const skills = new Map();
  for (const [id, f] of facts) skills.set(id, { skillId: id, name: names.get(id) || id, ...classifySkill(f) });

  let years = null;
  if (resumeConfirmed && resume.totalExperienceYears != null) years = resume.totalExperienceYears;
  else if (user && user.experienceLevel && cfg.EXPERIENCE_BY_PROFILE[user.experienceLevel] != null) years = cfg.EXPERIENCE_BY_PROFILE[user.experienceLevel];

  let educationLevel = null;
  if (resumeConfirmed) {
    const rank = cfg.EDUCATION_RANK;
    educationLevel = (resume.education || []).map(e => e.level).filter(l => rank[l]).sort((a, b) => rank[b] - rank[a])[0] || null;
  }
  if (!educationLevel && user) educationLevel = levelFromText(user.education);

  const profile = {
    skills, years, educationLevel,
    certifications: resumeConfirmed ? resume.certifications || [] : [],
    projectSkillIds,
    projectEvidenceAvailable: resumeConfirmed || projectSkillIds.size > 0,
    careerTitle: career ? career.title : '',
    careerAliases: career ? career.aliases || [] : [],
    preferences: (user && user.jobPreferences) || {},
    resumeConfirmed,
    resumeStatus: !resume ? 'none' : resumeConfirmed ? 'confirmed' : 'pending_review',
    journeyId: journey ? String(journey._id) : null
  };
  profile.hash = hashProfile(profile);
  return profile;
}

function hashProfile(p) {
  const skills = [...p.skills.values()].map(s => [s.skillId, s.status, s.claimed ? 1 : 0, s.score]).sort((a, b) => a[0].localeCompare(b[0]));
  const payload = JSON.stringify({
    skills, y: p.years, e: p.educationLevel, c: (p.certifications || []).length, r: p.resumeConfirmed,
    ps: [...p.projectSkillIds].sort(), t: p.careerTitle, pr: p.preferences, w: cfg.loadWeights(), v: cfg.WEIGHTS_VERSION
  });
  return crypto.createHash('sha1').update(payload).digest('hex');
}

module.exports = { classifySkill, loadCandidateProfile, hashProfile, levelFromText };
