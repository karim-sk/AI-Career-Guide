/**
 * Deterministic job-matching engine (pure functions — no DB, no LLM).
 *
 * Score = 100 × Σ(weight_i × s_i) / Σ(weight_i over AVAILABLE dimensions)
 * Dimensions: skills, experience, projects, education, alignment.
 * Missing-data policy: a dimension whose inputs are unavailable (job doesn't state a requirement, or the
 * candidate has not supplied the data) is EXCLUDED and the remaining weights are renormalized. It is never
 * silently treated as a mismatch. Hard requirements that are not met are surfaced separately as `warnings`.
 */
const cfg = require('../config/jobMatching');

const STATUS_ORDER = ['missing_evidence', 'not_assessed', 'in_progress', 'partial', 'demonstrated'];
const clamp01 = x => Math.max(0, Math.min(1, x));
const tokens = s => String(s || '').toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').split(' ').filter(t => t.length > 1 && !['and', 'the', 'for', 'with', 'senior', 'junior', 'jr', 'sr', 'lead', 'intern'].includes(t));

function skillEntry(candidate, skill, importance) {
  const ev = (candidate.skills && (candidate.skills.get ? candidate.skills.get(String(skill.skillId)) : candidate.skills[String(skill.skillId)])) || null;
  return {
    skillId: String(skill.skillId), name: skill.name, importance,
    status: ev ? ev.status : 'not_assessed',
    claimed: !!(ev && ev.claimed),
    sources: ev ? ev.sources || [] : [],
    score: ev && ev.score != null ? ev.score : null
  };
}

const credit = e => (e.status === 'not_assessed' && e.claimed) ? cfg.STATUS_CREDIT.claimed : cfg.STATUS_CREDIT[e.status] || 0;
const avgCredit = list => list.length ? list.reduce((a, e) => a + credit(e), 0) / list.length : null;

function skillsDimension(job, candidate) {
  const required = (job.requiredSkills || []).map(s => skillEntry(candidate, s, 'required'));
  const preferred = (job.preferredSkills || []).filter(p => !required.some(r => r.skillId === String(p.skillId))).map(s => skillEntry(candidate, s, 'preferred'));
  const req = avgCredit(required), pref = avgCredit(preferred);
  let score = null;
  if (req != null && pref != null) score = cfg.REQUIRED_SHARE * req + (1 - cfg.REQUIRED_SHARE) * pref;
  else if (req != null) score = req;
  else if (pref != null) score = pref;
  return { available: score != null, score, required, preferred };
}

function experienceDimension(job, candidate) {
  const exp = job.experience || {};
  let needed = exp.minYears != null ? exp.minYears : cfg.EXPERIENCE_BY_LEVEL[exp.level || 'unknown'];
  if (needed == null) return { available: false, reason: 'The listing does not state an experience requirement.' };
  if (candidate.years == null) return { available: false, reason: 'Your experience level is unknown (add it to your profile or confirm your resume).' };
  const score = needed <= 0 ? 1 : clamp01(candidate.years / needed);
  return { available: true, score, needed, have: candidate.years };
}

function projectsDimension(job, candidate) {
  const req = job.requiredSkills || [];
  if (!req.length) return { available: false, reason: 'No required skills could be identified in the listing.' };
  if (!candidate.projectEvidenceAvailable) return { available: false, reason: 'No confirmed resume or practical evidence yet.' };
  const ids = candidate.projectSkillIds || new Set();
  const covered = req.filter(s => ids.has(String(s.skillId))).length;
  return { available: true, score: covered / req.length, covered, total: req.length };
}

function educationDimension(job, candidate) {
  const need = job.educationRequirement;
  const rank = cfg.EDUCATION_RANK;
  if (!need || need === 'none' || need === 'unknown' || !rank[need]) return { available: false, reason: 'The listing does not state an education requirement.' };
  if (!candidate.educationLevel || !rank[candidate.educationLevel]) return { available: false, reason: 'Your education level is unknown.' };
  const have = rank[candidate.educationLevel], want = rank[need];
  const score = have >= want ? 1 : have === want - 1 ? 0.5 : 0;
  return { available: true, score, need, have: candidate.educationLevel };
}

function alignmentDimension(job, candidate) {
  const parts = [];
  const jt = new Set(tokens(job.title));
  const targets = [candidate.careerTitle, ...(candidate.careerAliases || [])].filter(Boolean);
  if (targets.length && jt.size) {
    let best = 0;
    const titleLc = String(job.title || '').toLowerCase();
    for (const t of targets) {
      if (titleLc.includes(String(t).toLowerCase())) { best = 1; break; }
      const tt = new Set(tokens(t));
      const inter = [...tt].filter(x => jt.has(x)).length;
      const union = new Set([...tt, ...jt]).size;
      if (union) best = Math.max(best, inter / union);
    }
    parts.push(best);
  }
  const prefs = candidate.preferences || {};
  if (prefs.workModes && prefs.workModes.length && job.workMode && job.workMode !== 'unknown') parts.push(prefs.workModes.includes(job.workMode) ? 1 : 0);
  if (prefs.locations && prefs.locations.length && job.workMode !== 'remote' && job.location) {
    const loc = job.location.toLowerCase();
    parts.push(prefs.locations.some(l => loc.includes(String(l).toLowerCase())) ? 1 : 0);
  }
  if (prefs.minSalary && job.salary && job.salary.max != null) parts.push(job.salary.max >= prefs.minSalary ? 1 : 0);
  if (!parts.length) return { available: false, reason: 'No career or preference information to compare.' };
  return { available: true, score: parts.reduce((a, b) => a + b, 0) / parts.length };
}

function computeMatch(job, candidate, weights = cfg.loadWeights()) {
  const dims = {
    skills: skillsDimension(job, candidate),
    experience: experienceDimension(job, candidate),
    projects: projectsDimension(job, candidate),
    education: educationDimension(job, candidate),
    alignment: alignmentDimension(job, candidate)
  };

  const totalW = Object.keys(dims).filter(k => dims[k].available).reduce((a, k) => a + (weights[k] || 0), 0);
  const breakdown = {};
  let score = 0;
  for (const k of Object.keys(dims)) {
    const d = dims[k], w = weights[k] || 0;
    const eff = d.available && totalW > 0 ? w / totalW : 0;
    const points = d.available ? eff * d.score * 100 : 0;
    score += points;
    breakdown[k] = {
      weight: w, available: d.available, effectiveWeight: Math.round(eff * 1000) / 1000,
      score: d.available ? Math.round(d.score * 1000) / 1000 : null,
      points: Math.round(points * 10) / 10,
      note: d.available ? undefined : d.reason,
      detail: ['needed', 'have', 'covered', 'total', 'need'].reduce((o, f) => (d[f] !== undefined ? { ...o, [f]: d[f] } : o), {})
    };
  }
  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  const sk = dims.skills;
  const all = [...sk.required, ...sk.preferred];
  const group = st => all.filter(e => e.status === st && !(st === 'not_assessed' && e.claimed));
  const skillBreakdown = {
    demonstrated: group('demonstrated'),
    partial: group('partial'),
    inProgress: group('in_progress'),
    notAssessed: all.filter(e => e.status === 'not_assessed'),   // includes resume-claimed-only
    missingEvidence: group('missing_evidence'),
    totals: { required: sk.required.length, preferred: sk.preferred.length }
  };

  const warnings = [];
  if (dims.experience.available && dims.experience.have < dims.experience.needed * 0.6)
    warnings.push(`Listing asks for about ${dims.experience.needed}+ years of experience; your profile shows about ${dims.experience.have}.`);
  if (dims.education.available && dims.education.score < 1)
    warnings.push(`Listing asks for a ${dims.education.need} degree or equivalent; your profile shows ${dims.education.have}.`);
  if (/certif/i.test(job.description || '') && !(candidate.certifications || []).length)
    warnings.push('The listing mentions certifications; none are recorded on your profile.');
  if (candidate.preferences && candidate.preferences.workModes && candidate.preferences.workModes.length && job.workMode && job.workMode !== 'unknown' && !candidate.preferences.workModes.includes(job.workMode))
    warnings.push(`Work mode (${job.workMode}) differs from your preference.`);
  const missReq = skillBreakdown.missingEvidence.filter(e => e.importance === 'required');
  if (missReq.length) warnings.push(`Assessment results show a gap in required skill(s): ${missReq.map(e => e.name).join(', ')}.`);

  const availW = Object.keys(dims).filter(k => dims[k].available).reduce((a, k) => a + (weights[k] || 0), 0);
  const sumW = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const coverage = availW / sumW;
  let confidence = coverage >= 0.8 ? 'high' : coverage >= 0.5 ? 'medium' : 'low';
  if (!sk.available) confidence = 'low';

  return { score: finalScore, confidence, breakdown, skillBreakdown, warnings, explanation: buildExplanation(finalScore, skillBreakdown, dims, sk), weightsVersion: cfg.WEIGHTS_VERSION };
}

function buildExplanation(score, sb, dims, sk) {
  const total = sk.required.length + sk.preferred.length;
  const names = list => list.slice(0, 4).map(e => e.name).join(', ');
  const parts = [];
  if (!total) {
    parts.push('No specific technical skills could be identified in this listing, so the score relies on the other available factors.');
  } else {
    const d = sb.demonstrated.length, p = sb.partial.length;
    parts.push(`${d + p} of ${total} required/preferred skills have evidence in your profile (${d} demonstrated, ${p} partial).`);
    const attention = [...sb.missingEvidence, ...sb.inProgress];
    if (attention.length) parts.push(`${names(attention)} still need${attention.length === 1 ? 's' : ''} attention.`);
    if (sb.notAssessed.length) parts.push(`${names(sb.notAssessed)} ${sb.notAssessed.length === 1 ? 'has' : 'have'} not been assessed yet — that is not the same as lacking the skill.`);
  }
  if (dims.experience.available) parts.push(`Experience: about ${dims.experience.have} years vs ${dims.experience.needed}+ requested.`);
  parts.push('This is an estimate from the information available, not a prediction of hiring outcome.');
  return parts.join(' ');
}

/** Ordered list of gap skills for roadmap generation / UI (required before preferred; weakest evidence first). */
function rankGaps(skillBreakdown) {
  const rank = st => STATUS_ORDER.indexOf(st);
  const all = [...skillBreakdown.missingEvidence, ...skillBreakdown.notAssessed, ...skillBreakdown.inProgress, ...skillBreakdown.partial];
  return all
    .map(e => ({ ...e }))
    .sort((a, b) => (a.importance === b.importance ? 0 : a.importance === 'required' ? -1 : 1) || rank(a.status) - rank(b.status) || a.name.localeCompare(b.name));
}

module.exports = { computeMatch, rankGaps, skillsDimension, STATUS_ORDER };
