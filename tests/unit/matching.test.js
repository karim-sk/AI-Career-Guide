const { computeMatch, rankGaps } = require('../../backend/services/matchingService');
const { classifySkill } = require('../../backend/services/evidenceService');

const S = (id, name) => ({ skillId: id, name });
const job = (over = {}) => ({
  title: 'Backend Developer', description: '', workMode: 'remote', educationRequirement: 'unknown',
  requiredSkills: [S('js', 'JavaScript'), S('node', 'Node.js'), S('docker', 'Docker'), S('sd', 'System Design')],
  preferredSkills: [S('redis', 'Redis')], experience: { minYears: 2 }, ...over
});
const cand = (skills, over = {}) => ({
  skills: new Map(Object.entries(skills).map(([k, v]) => [k, { skillId: k, name: k, sources: [], ...v }])),
  years: 3, projectEvidenceAvailable: true, projectSkillIds: new Set(['node']), careerTitle: 'Backend Developer', careerAliases: [], preferences: {}, ...over
});

describe('evidence classification', () => {
  test('course completion alone is partial, never demonstrated', () => expect(classifySkill({ courseCompleted: true }).status).toBe('partial'));
  test('resume claim alone is not_assessed + claimed', () => expect(classifySkill({ resume: 'listed' })).toMatchObject({ status: 'not_assessed', claimed: true }));
  test('no evidence is not_assessed — NOT missing_evidence', () => expect(classifySkill({}).status).toBe('not_assessed'));
  test('only a low TEST score is missing_evidence', () => expect(classifySkill({ testScore: 20 }).status).toBe('missing_evidence'));
  test('test score thresholds', () => {
    expect(classifySkill({ testScore: 70 }).status).toBe('demonstrated');
    expect(classifySkill({ testScore: 69 }).status).toBe('partial');
    expect(classifySkill({ testScore: 40 }).status).toBe('partial');
    expect(classifySkill({ testScore: 39 }).status).toBe('missing_evidence');
  });
  test('test result outranks a course/resume claim', () => expect(classifySkill({ testScore: 90, courseCompleted: true, resume: 'listed' }).status).toBe('demonstrated'));
  test('in-progress only shows when nothing stronger exists', () => {
    expect(classifySkill({ inProgress: true }).status).toBe('in_progress');
    expect(classifySkill({ inProgress: true, courseCompleted: true }).status).toBe('partial');
  });
});

describe('job matching', () => {
  const base = cand({ js: { status: 'demonstrated' }, node: { status: 'demonstrated' }, docker: { status: 'not_assessed' } });

  test('score is an integer within 0–100', () => {
    const m = computeMatch(job(), base);
    expect(Number.isInteger(m.score)).toBe(true); expect(m.score).toBeGreaterThanOrEqual(0); expect(m.score).toBeLessThanOrEqual(100);
  });
  test('deterministic', () => expect(computeMatch(job(), base).score).toBe(computeMatch(job(), base).score));
  test('breakdown points sum to the score (±1 rounding)', () => {
    const m = computeMatch(job(), base);
    const sum = Object.values(m.breakdown).reduce((a, d) => a + d.points, 0);
    expect(Math.abs(sum - m.score)).toBeLessThanOrEqual(1);
  });
  test('effective weights of available dimensions sum to 1', () => {
    const m = computeMatch(job(), base);
    const w = Object.values(m.breakdown).reduce((a, d) => a + d.effectiveWeight, 0);
    expect(w).toBeCloseTo(1, 2);
  });
  test('unavailable dimensions are excluded, not scored as zero', () => {
    const m = computeMatch(job(), base);   // no education requirement stated
    expect(m.breakdown.education.available).toBe(false); expect(m.breakdown.education.effectiveWeight).toBe(0);
  });
  test('perfect evidence gives a higher score than no evidence', () => {
    const all = cand({ js: { status: 'demonstrated' }, node: { status: 'demonstrated' }, docker: { status: 'demonstrated' }, sd: { status: 'demonstrated' }, redis: { status: 'demonstrated' } }, { projectSkillIds: new Set(['js', 'node', 'docker', 'sd']) });
    expect(computeMatch(job(), all).score).toBeGreaterThan(computeMatch(job(), cand({})).score);
    expect(computeMatch(job(), all).score).toBe(100);
  });
  test('verifying a skill raises the score by the configured credit only', () => {
    const before = computeMatch(job(), cand({ js: { status: 'demonstrated' }, node: { status: 'demonstrated' }, docker: { status: 'partial' } })).score;
    const after = computeMatch(job(), cand({ js: { status: 'demonstrated' }, node: { status: 'demonstrated' }, docker: { status: 'demonstrated' } })).score;
    expect(after).toBeGreaterThan(before);
  });
  test('unassessed skills are listed as notAssessed, never as missingEvidence', () => {
    const m = computeMatch(job(), base);
    expect(m.skillBreakdown.notAssessed.map(e => e.name)).toEqual(expect.arrayContaining(['System Design', 'Docker']));
    expect(m.skillBreakdown.missingEvidence).toHaveLength(0);
    expect(m.explanation).toMatch(/not been assessed/);
  });
  test('assessed failure IS missingEvidence and raises a warning', () => {
    const m = computeMatch(job(), cand({ docker: { status: 'missing_evidence', score: 20 } }));
    expect(m.skillBreakdown.missingEvidence.map(e => e.name)).toContain('Docker');
    expect(m.warnings.join(' ')).toMatch(/Docker/);
  });
  test('explanation counts agree with the breakdown', () => {
    const m = computeMatch(job(), base);
    const matched = m.skillBreakdown.demonstrated.length + m.skillBreakdown.partial.length;
    expect(m.explanation).toContain(`${matched} of ${m.skillBreakdown.totals.required + m.skillBreakdown.totals.preferred}`);
  });
  test('experience shortfall becomes an eligibility WARNING, not a hidden penalty', () => {
    const m = computeMatch(job({ experience: { minYears: 8 } }), base);
    expect(m.warnings.join(' ')).toMatch(/8\+ years/);
  });
  test('unknown candidate experience → dimension unavailable (not a mismatch)', () => {
    expect(computeMatch(job(), cand({}, { years: null })).breakdown.experience.available).toBe(false);
  });
  test('education requirement compared when both known', () => {
    const m = computeMatch(job({ educationRequirement: 'master' }), cand({}, { educationLevel: 'bachelor' }));
    expect(m.breakdown.education.score).toBe(0.5); expect(m.warnings.join(' ')).toMatch(/master/);
  });
  test('weights are configurable', () => {
    const a = computeMatch(job(), base, { skills: 100, experience: 0, projects: 0, education: 0, alignment: 0 });
    const b = computeMatch(job(), base, { skills: 0, experience: 100, projects: 0, education: 0, alignment: 0 });
    expect(a.score).not.toBe(b.score); expect(b.score).toBe(100);
  });
  test('job with no recognised skills → low confidence, still valid score', () => {
    const m = computeMatch(job({ requiredSkills: [], preferredSkills: [] }), base);
    expect(m.confidence).toBe('low'); expect(m.score).toBeLessThanOrEqual(100);
  });
  test('work-mode preference mismatch warns', () => {
    const m = computeMatch(job(), cand({}, { preferences: { workModes: ['onsite'] } }));
    expect(m.warnings.join(' ')).toMatch(/Work mode/);
  });
  test('rankGaps puts required before preferred and weakest evidence first', () => {
    const m = computeMatch(job(), cand({ docker: { status: 'missing_evidence' }, js: { status: 'partial' } }));
    const g = rankGaps(m.skillBreakdown);
    expect(g[0].name).toBe('Docker');
    expect(g[g.length - 1].importance).toBe('preferred');
    expect(g.map(x => x.name)).not.toContain('Node.js' && 'zzz');
  });
});
