/**
 * Job-matching configuration (all values are documented in docs/JOB_MATCHING.md).
 * Weights are initial design values, configurable through MATCH_WEIGHTS='{"skills":50,"experience":20,...}'.
 */
const DEFAULT_WEIGHTS = { skills: 50, experience: 20, projects: 15, education: 10, alignment: 5 };

function loadWeights() {
  const raw = process.env.MATCH_WEIGHTS;
  if (!raw) return { ...DEFAULT_WEIGHTS };
  try {
    const parsed = JSON.parse(raw);
    const out = {};
    for (const k of Object.keys(DEFAULT_WEIGHTS)) {
      const v = Number(parsed[k]);
      out[k] = Number.isFinite(v) && v >= 0 ? v : DEFAULT_WEIGHTS[k];
    }
    if (Object.values(out).every(v => v === 0)) return { ...DEFAULT_WEIGHTS };
    return out;
  } catch { return { ...DEFAULT_WEIGHTS }; }
}

module.exports = {
  loadWeights,
  DEFAULT_WEIGHTS,
  WEIGHTS_VERSION: 'v1',
  // test score thresholds (percent) used to classify assessed skills
  DEMONSTRATED_MIN: 70,
  PARTIAL_MIN: 40,
  VERIFICATION_PASS: 70,
  VERIFICATION_MIN_QUESTIONS: 3,
  VERIFICATION_MAX_QUESTIONS: 6,
  // credit per evidence status inside the skills dimension (0..1)
  STATUS_CREDIT: { demonstrated: 1, partial: 0.6, claimed: 0.35, in_progress: 0.3, not_assessed: 0, missing_evidence: 0 },
  REQUIRED_SHARE: 0.75,           // within the skills dimension: required 75% / preferred 25%
  EXPERIENCE_BY_LEVEL: { intern: 0, junior: 0, mid: 3, senior: 5, lead: 7, unknown: null },
  EXPERIENCE_BY_PROFILE: { fresher: 0, junior: 1.5, mid: 4, senior: 8 },
  EDUCATION_RANK: { highschool: 1, diploma: 2, bachelor: 3, master: 4, phd: 5 }
};
