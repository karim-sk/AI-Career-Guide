/**
 * End-to-end integration test (real HTTP via supertest, real Mongoose models, real database).
 * External services are mocked: job-provider HTTP (deterministic fixtures) and the LLM (aiService).
 * Requires a MongoDB-compatible server (TEST_MONGODB_URI, default mongodb://127.0.0.1:27017). Skips if none is reachable.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_test_secret_test_secret_123';
process.env.JOB_PROVIDERS = 'remotive';
process.env.RESUME_STORAGE = process.env.RESUME_STORAGE || 'gridfs';
process.env.RESUME_MAX_MB = '1';
process.env.VERIFICATION_COOLDOWN_MINUTES = '0';

const request = require('supertest');
const JSZip = require('jszip');
const mongoose = require('mongoose');
const { connectTestDb, dropAndClose } = require('../helpers/db');

let app, ready = false;
const http = require('../../backend/services/jobs/http');
const aiService = require('../../backend/services/aiService');
const jobService = require('../../backend/services/jobService');
const { runSeed } = require('../../seed');

const REMOTIVE = { jobs: [
  { id: 101, url: 'https://remotive.com/remote-jobs/software-dev/backend-developer-101', title: 'Backend Developer (Node.js)', company_name: 'Acme Remote',
    tags: ['node', 'backend'], job_type: 'full_time', publication_date: '2025-01-10T10:00:00', candidate_required_location: 'Worldwide',
    description: '<p>2+ years of experience.</p><ul><li>JavaScript</li><li>Node.js</li><li>Express</li><li>MongoDB</li><li>REST APIs</li><li>Git</li><li>Docker</li><li>System Design</li></ul><p>Nice to have:</p><ul><li>Redis</li></ul>' },
  { id: 102, url: 'https://remotive.com/remote-jobs/software-dev/frontend-developer-102', title: 'Frontend Developer', company_name: 'Pixel Co',
    tags: ['react'], job_type: 'full_time', publication_date: '2025-01-09T10:00:00', candidate_required_location: 'USA',
    description: '<p>1+ years experience. HTML, CSS, JavaScript, React, TypeScript.</p>' }
] };
const mockProviders = (body = REMOTIVE) => http.setFetch(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(body) }));

async function makeDocx(text) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const paras = text.split('\n').map(l => `<w:p><w:r><w:t xml:space="preserve">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r></w:p>`).join('');
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}</w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}
async function makePdf(text) {
  const PDFDocument = require('pdfkit');
  return new Promise(resolve => {
    const doc = new PDFDocument(); const chunks = [];
    doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.fontSize(11).text(text); doc.end();
  });
}

const RESUME_TEXT = `Asha Verma
SKILLS
Languages: JavaScript, Python, SQL
Backend: Node.js, Express, REST APIs
Databases: MongoDB
Tools: Git, Docker
EXPERIENCE
Backend Developer - Acme Tech
Jan 2023 - Dec 2024
- Built REST APIs with Express and MongoDB
PROJECTS
Career Guide
- Implemented JWT authentication with Node.js
EDUCATION
B.Tech in Computer Science, Anna University
CERTIFICATIONS
- AWS Certified Cloud Practitioner`;

const mk = async () => {
  const email = `u${Date.now()}${Math.floor(Math.random() * 1e5)}@test.com`;
  const r = await request(app).post('/api/auth/register').send({ name: 'Test User', email, password: 'password123' });
  expect(r.status).toBe(201);
  return { token: r.body.token, auth: { Authorization: `Bearer ${r.body.token}` }, id: r.body.user._id || r.body.user.id };
};

beforeAll(async () => {
  ready = await connectTestDb();
  if (!ready) { console.warn('⚠ No MongoDB-compatible server reachable — integration tests skipped.'); return; }
  app = require('../../backend/server').app;
  await runSeed({ quiet: true });
}, 120000);
afterAll(async () => { if (ready) await dropAndClose(); http.setFetch(null); });
beforeEach(() => { jest.restoreAllMocks(); jobService.clearCache(); });

const t = (name, fn, ms = 60000) => test(name, async () => { if (!ready) return; await fn(); }, ms);

describe('seed', () => {
  t('is idempotent and non-destructive (ids stable, counts unchanged)', async () => {
    const Skill = require('../../backend/models/Skill'), Career = require('../../backend/models/Career'), Question = require('../../backend/models/Question');
    const before = { s: await Skill.countDocuments(), c: await Career.countDocuments(), q: await Question.countDocuments(), id: (await Skill.findOne({ name: 'Node.js' }))._id };
    await runSeed({ quiet: true });
    expect(await Skill.countDocuments()).toBe(before.s); expect(await Career.countDocuments()).toBe(before.c); expect(await Question.countDocuments()).toBe(before.q);
    expect(String((await Skill.findOne({ name: 'Node.js' }))._id)).toBe(String(before.id));
    expect(before.s).toBeGreaterThan(100); expect(before.c).toBeGreaterThanOrEqual(25);
  }, 120000);
});

describe('full career-development flow', () => {
  const S = {};   // shared state across ordered steps

  t('1-2. register, select Backend Developer journey (+ a second independent journey)', async () => {
    S.A = await mk();
    const careers = (await request(app).get('/api/careers').set(S.A.auth)).body.careers;
    S.backend = careers.find(c => c.title === 'Backend Developer'); S.frontend = careers.find(c => c.title === 'Frontend Developer');
    expect(S.backend && S.frontend).toBeTruthy();
    S.j1 = (await request(app).post('/api/journeys').set(S.A.auth).send({ careerId: S.backend._id })).body.journey;
    S.j2 = (await request(app).post('/api/journeys').set(S.A.auth).send({ careerId: S.frontend._id })).body.journey;
    expect(S.j1._id).not.toBe(S.j2._id);
  });

  t('5. existing assessment still works end-to-end (answers graded by the server)', async () => {
    const Assessment = require('../../backend/models/Assessment'), Question = require('../../backend/models/Question');
    const start = await request(app).post('/api/assessment/start').set(S.A.auth).send({ careerId: S.backend._id, journeyId: S.j1._id });
    expect(start.status).toBe(201);
    const a = await Assessment.findById(start.body.assessmentId);
    for (let i = 0; i < a.questions.length; i++) {
      const q = await Question.findById(a.questions[i].questionId);
      const r = await request(app).post(`/api/assessment/${a._id}/answer`).set(S.A.auth).send({ questionIndex: i, selectedAnswer: q.correctAnswer });
      expect(r.body.isCorrect).toBe(true);
    }
    const sub = await request(app).post(`/api/assessment/${a._id}/submit`).set(S.A.auth).send({});
    expect(sub.status).toBe(200); expect(sub.body.overallScore).toBe(100);
  });

  t('3-4. resume: reject bad uploads, accept DOCX + PDF, review before use', async () => {
    const bad = await request(app).post('/api/resume').set(S.A.auth).attach('resume', Buffer.from('MZ' + 'x'.repeat(400)), 'cv.pdf');
    expect(bad.status).toBe(415);
    const wrongExt = await request(app).post('/api/resume').set(S.A.auth).attach('resume', Buffer.from('hello world'), 'cv.txt');
    expect(wrongExt.status).toBe(415);
    const big = await request(app).post('/api/resume').set(S.A.auth).attach('resume', Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1.5 * 1024 * 1024, 32)]), 'big.pdf');
    expect(big.status).toBe(413);
    const noText = await request(app).post('/api/resume').set(S.A.auth).attach('resume', await makePdf(' '), 'blank.pdf');
    expect([400, 422]).toContain(noText.status);

    const docx = await request(app).post('/api/resume').set(S.A.auth).attach('resume', await makeDocx(RESUME_TEXT), 'cv.docx');
    expect(docx.status).toBe(201);
    expect(docx.body.resume.reviewStatus).toBe('pending');
    const names = docx.body.resume.skills.map(s => s.name);
    expect(names).toEqual(expect.arrayContaining(['Node.js', 'MongoDB', 'Docker', 'REST API']));
    expect(docx.body.resume.skills.find(s => s.name === 'Docker').evidence).toBe('listed');       // claim only
    expect(docx.body.resume.skills.find(s => s.name === 'Node.js').evidence).toBe('applied');
    expect(JSON.stringify(docx.body)).not.toMatch(/storage|fileId|sha256/);                       // internals never leak

    // PDF replaces DOCX (one resume per user)
    const pdf = await request(app).post('/api/resume').set(S.A.auth).attach('resume', await makePdf(RESUME_TEXT), 'cv.pdf');
    expect(pdf.status).toBe(201); expect(pdf.body.resume.fileType).toBe('pdf');
    expect(await mongoose.model('Resume').countDocuments({ userId: S.A.id })).toBe(1);
    S.resume = pdf.body.resume;
    expect(S.resume.skills.map(s => s.name)).toEqual(expect.arrayContaining(['Node.js', 'MongoDB']));
  });

  t('4. owner can download the stored file; resume is NOT used until confirmed', async () => {
    const dl = await request(app).get('/api/resume/file').set(S.A.auth);
    expect(dl.status).toBe(200); expect(dl.headers['content-type']).toMatch(/pdf/); expect(dl.headers['x-content-type-options']).toBe('nosniff');
    const { loadCandidateProfile } = require('../../backend/services/evidenceService');
    expect((await loadCandidateProfile(S.A.id, S.j1._id)).resumeStatus).toBe('pending_review');
    expect((await loadCandidateProfile(S.A.id, S.j1._id)).skills.get(String(S.resume.skills.find(s => s.name === 'Redis')?.skillId))).toBeUndefined();
  });

  t('4. user corrects and confirms the resume', async () => {
    const keep = S.resume.skills.filter(s => s.name !== 'Python').map(s => s.skillId);
    const r = await request(app).patch('/api/resume/review').set(S.A.auth).send({ skills: keep, totalExperienceYears: 2, confirm: true });
    expect(r.status).toBe(200); expect(r.body.resume.reviewStatus).toBe('confirmed');
    expect(r.body.resume.skills.map(s => s.name)).not.toContain('Python');
    const bad = await request(app).patch('/api/resume/review').set(S.A.auth).send({ skills: [{ $ne: null }] });
    expect(bad.status).toBe(400);
  });

  t('6-7. job recommendations from provider data with real apply links; provider failure is graceful', async () => {
    mockProviders();
    const r = await request(app).get(`/api/jobs/recommendations?journeyId=${S.j1._id}&query=backend`).set(S.A.auth);
    expect(r.status).toBe(200);
    expect(r.body.providers[0]).toMatchObject({ name: 'remotive', status: 'ok' });
    const be = r.body.items.find(i => i.job.title.startsWith('Backend Developer'));
    expect(be).toBeTruthy();
    expect(be.job.applyUrl).toBe('https://remotive.com/remote-jobs/software-dev/backend-developer-101');   // taken from provider data, not invented
    expect(be.job.isSample).toBe(false); expect(be.job.freshness.label).toBe('live'); expect(be.job.salary).toBeNull();
    expect(be.match.score).toBeGreaterThanOrEqual(0); expect(be.match.score).toBeLessThanOrEqual(100);
    S.job = be.job;
    // sorted by match
    const scores = r.body.items.map(i => i.match.score); expect(scores).toEqual([...scores].sort((a, b) => b - a));
    // unassessed ≠ deficiency
    const gapByName = Object.fromEntries(be.match.gaps.map(g => [g.name, g.status]));
    expect(gapByName['Docker']).toBe('not_assessed'); expect(gapByName['System Design']).toBe('not_assessed');
    expect(Object.values(gapByName)).not.toContain('missing_evidence');

    // provider outage → cached listings, clear notice, no crash
    jobService.clearCache();
    http.setFetch(async () => { throw new Error('ECONNRESET'); });
    const down = await request(app).get(`/api/jobs/recommendations?journeyId=${S.j1._id}&query=backend&refresh=1`).set(S.A.auth);
    expect(down.status).toBe(200); expect(down.body.providers[0].status).toBe('error'); expect(down.body.notice).toMatch(/unreachable/);
    expect(down.body.items.length).toBeGreaterThan(0);
    mockProviders();
  });

  t('8. job detail: evidence categories + next steps; recommendation cached until evidence changes', async () => {
    const d = await request(app).get(`/api/jobs/${S.job._id}?journeyId=${S.j1._id}`).set(S.A.auth);
    expect(d.status).toBe(200);
    const c = d.body.match.categories;
    expect(c.demonstrated.map(s => s.name)).toEqual(expect.arrayContaining(['JavaScript', 'Node.js']));
    expect(c.notAssessed.map(s => s.name)).toEqual(expect.arrayContaining(['Docker', 'System Design']));
    expect(c.missingEvidence).toHaveLength(0);
    expect(d.body.nextSteps.length).toBeGreaterThan(0);
    expect(d.body.match.explanation).toMatch(/not been assessed/);
    S.before = d.body.match.score;
    const JobRecommendation = require('../../backend/models/JobRecommendation');
    const rec1 = await JobRecommendation.findOne({ userId: S.A.id, jobId: S.job._id });
    await request(app).get(`/api/jobs/${S.job._id}?journeyId=${S.j1._id}`).set(S.A.auth);
    const rec2 = await JobRecommendation.findOne({ userId: S.A.id, jobId: S.job._id });
    expect(String(rec2.computedAt)).toBe(String(rec1.computedAt));      // not recomputed on every render
  });

  t('9-11. existing career roadmap + job-focused roadmap through the SAME generator; career roadmap untouched', async () => {
    const careerPhases = [{ phaseNumber: 1, title: 'Backend Basics', weeks: [{ weekNumber: 1, title: 'W1', topics: [{ title: 'HTTP', difficulty: 'Beginner' }], exercises: [] }] }];
    const spy = jest.spyOn(aiService, 'generateRoadmap').mockResolvedValueOnce({ success: true, data: { summary: 'career', phases: careerPhases } });
    const career = await request(app).post('/api/roadmap/generate').set(S.A.auth).send({ journeyId: S.j1._id });
    expect(career.status).toBe(201); expect(career.body.roadmap.kind).toBe('career'); S.careerRoadmap = career.body.roadmap;
    expect(spy.mock.calls[0][0].jobContext).toBeUndefined();                           // original behaviour unchanged

    const jobPhases = [
      { phaseNumber: 1, title: 'Docker Fundamentals', skills: ['Docker'], weeks: [{ weekNumber: 1, title: 'Containers', topics: [
        { title: 'Containers and images', difficulty: 'Beginner' }, { title: 'Containerize a Node.js app', difficulty: 'Intermediate' }], exercises: [{ title: 'Build and run a container' }] }] },
      { phaseNumber: 2, title: 'System Design', skills: ['System Design'], weeks: [{ weekNumber: 1, title: 'Basics', topics: [{ title: 'Caching and scaling', difficulty: 'Intermediate' }], exercises: [] }] }];
    jest.spyOn(aiService, 'generateRoadmap').mockResolvedValueOnce({ success: true, data: { summary: 'job plan', phases: jobPhases } });
    const prep = await request(app).post('/api/roadmap/generate-for-job').set(S.A.auth).send({ journeyId: S.j1._id, jobId: S.job._id });
    expect(prep.status).toBe(201); expect(prep.body.roadmap.kind).toBe('job');
    expect(prep.body.roadmap.jobContext.gapSkills.map(g => g.skillName)).toEqual(expect.arrayContaining(['Docker', 'System Design']));
    S.jobRoadmap = prep.body.roadmap;
    const calls = aiService.generateRoadmap.mock.calls; const ctx = calls[calls.length - 1][0];   // same spy is reused by spyOn
    expect(ctx.jobContext.title).toMatch(/Backend Developer/); expect(ctx.jobContext.gaps.map(g => g.name)).toContain('Docker');
    expect(ctx.jobContext.demonstrated).toContain('Node.js');

    // career roadmap still the active one & unchanged; job roadmap hidden from existing endpoints
    const got = await request(app).get(`/api/roadmap?journeyId=${S.j1._id}`).set(S.A.auth);
    expect(got.body.roadmap._id).toBe(S.careerRoadmap._id); expect(got.body.roadmap.kind).toBe('career');
    const all = await request(app).get('/api/roadmap/all').set(S.A.auth);
    expect(all.body.roadmaps.every(r => r.kind !== 'job')).toBe(true);

    // idempotent: second click re-uses the plan
    const again = await request(app).post('/api/roadmap/generate-for-job').set(S.A.auth).send({ journeyId: S.j1._id, jobId: S.job._id });
    expect(again.body.reused).toBe(true); expect(again.body.roadmap._id).toBe(S.jobRoadmap._id);
    expect(await mongoose.model('Roadmap').countDocuments({ userId: S.A.id, kind: 'job' })).toBe(1);
  });

  t('12. complete the Docker course: roadmap progress moves, skill is NOT verified, duplicate-safe', async () => {
    const CareerJourney = require('../../backend/models/CareerJourney'), SkillEvidence = require('../../backend/models/SkillEvidence'), LearningActivity = require('../../backend/models/LearningActivity');
    const docker = S.jobRoadmap.jobContext.gapSkills.find(g => g.skillName === 'Docker');
    S.dockerId = docker.skillId;
    const topic = S.jobRoadmap.phases[0].weeks[0].topics[0];
    const j1Before = await CareerJourney.findById(S.j1._id).lean(), j2Before = await CareerJourney.findById(S.j2._id).lean();

    const created = await request(app).post('/api/learning/activities').set(S.A.auth).send({
      title: 'Docker for Node developers', type: 'course', url: 'https://docs.docker.com/', skillId: S.dockerId, journeyId: S.j1._id, roadmapId: S.jobRoadmap._id, topicId: topic._id });
    expect(created.status).toBe(201); S.activity = created.body.activity;
    const dup = await request(app).post('/api/learning/activities').set(S.A.auth).send({
      title: 'Docker for Node developers', skillId: S.dockerId, journeyId: S.j1._id, roadmapId: S.jobRoadmap._id, topicId: topic._id });
    expect(dup.body.activity._id).toBe(S.activity._id);                                           // same record

    // two concurrent completions: integrity must hold on ANY backend (unique indexes + idempotent writes).
    // (Exactly-one-winner relies on MongoDB's per-document atomic findOneAndUpdate; FerretDB/SQLite used locally may let both through.)
    const [c1, c2] = await Promise.all([
      request(app).post(`/api/learning/activities/${S.activity._id}/complete`).set(S.A.auth).send({}),
      request(app).post(`/api/learning/activities/${S.activity._id}/complete`).set(S.A.auth).send({})]);
    expect([c1.status, c2.status]).toEqual([200, 200]);
    const first = [c1.body, c2.body].find(b => !b.alreadyCompleted);
    expect(first).toBeTruthy();                                                                  // at least one real completion
    const done = first;
    // a later (sequential) duplicate is deterministically reported as already completed
    const replay = await request(app).post(`/api/learning/activities/${S.activity._id}/complete`).set(S.A.auth).send({});
    expect(replay.body.alreadyCompleted).toBe(true);
    expect(done.activity.status).toBe('completed'); expect(done.activity.completedAt).toBeTruthy();
    expect(done.activity.verificationStatus).toBe('pending');                                    // completed ≠ verified
    expect(done.verification.message).toMatch(/NOT yet verified/);
    expect(done.roadmapProgress.completedTopics).toBe(1); expect(done.roadmapProgress.overallProgress).toBeGreaterThan(0);
    expect(await SkillEvidence.countDocuments({ userId: S.A.id, type: 'course' })).toBe(1);
    expect(await LearningActivity.countDocuments({ userId: S.A.id })).toBe(1);

    // skill evidence: partial only
    const ev = (await request(app).get(`/api/learning/evidence?journeyId=${S.j1._id}`).set(S.A.auth)).body.evidence;
    expect(ev.partial.map(s => s.name)).toContain('Docker'); expect(ev.demonstrated.map(s => s.name)).not.toContain('Docker');
    // match moved only by the "partial" credit
    expect(done.match.before).toBe(S.before); expect(done.match.after).toBeGreaterThan(done.match.before); S.afterCourse = done.match.after;

    // job roadmap progress did NOT leak into career journey progress; other journey untouched
    const j1After = await CareerJourney.findById(S.j1._id).lean(), j2After = await CareerJourney.findById(S.j2._id).lean();
    expect(j1After.progress).toBe(j1Before.progress);
    expect(JSON.stringify(j2After)).toBe(JSON.stringify(j2Before));
    const careerRm = await mongoose.model('Roadmap').findById(S.careerRoadmap._id);
    expect(careerRm.completedTopics).toBe(0);
  });

  t('13. verification: answers hidden, server-graded, failure keeps skill unverified, pass demonstrates it', async () => {
    const Question = require('../../backend/models/Question');
    const start = await request(app).post('/api/learning/verification/start').set(S.A.auth).send({ skillId: S.dockerId, activityId: S.activity._id, journeyId: S.j1._id, jobId: S.job._id });
    expect(start.status).toBe(201); expect(start.body.questions.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(start.body)).not.toMatch(/correctAnswer|explanation/);
    const resumed = await request(app).post('/api/learning/verification/start').set(S.A.auth).send({ skillId: S.dockerId, journeyId: S.j1._id });
    expect(resumed.body.verificationId).toBe(start.body.verificationId); expect(resumed.body.resumed).toBe(true);

    // a client-side "passed" flag is ignored; wrong answers fail
    const wrong = [];
    for (const q of start.body.questions) { const real = await Question.findById(q.questionId); wrong.push({ questionId: q.questionId, selectedAnswer: (real.correctAnswer + 1) % 4 }); }
    const fail = await request(app).post(`/api/learning/verification/${start.body.verificationId}/submit`).set(S.A.auth).send({ answers: wrong, passed: true, score: 100 });
    expect(fail.status).toBe(200); expect(fail.body.passed).toBe(false); expect(fail.body.score).toBe(0); expect(fail.body.review).toBeUndefined();
    let act = await mongoose.model('LearningActivity').findById(S.activity._id);
    expect(act.verificationStatus).toBe('failed');
    let ev = (await request(app).get(`/api/learning/evidence?journeyId=${S.j1._id}`).set(S.A.auth)).body.evidence;
    expect(ev.demonstrated.map(s => s.name)).not.toContain('Docker');

    // cooldown after a failure (configurable)
    process.env.VERIFICATION_COOLDOWN_MINUTES = '30';
    const blocked = await request(app).post('/api/learning/verification/start').set(S.A.auth).send({ skillId: S.dockerId, journeyId: S.j1._id });
    expect(blocked.status).toBe(429);
    process.env.VERIFICATION_COOLDOWN_MINUTES = '0';

    const retry = await request(app).post('/api/learning/verification/start').set(S.A.auth).send({ skillId: S.dockerId, activityId: S.activity._id, journeyId: S.j1._id, jobId: S.job._id });
    expect(retry.status).toBe(201);
    const right = [];
    for (const q of retry.body.questions) right.push({ questionId: q.questionId, selectedAnswer: (await Question.findById(q.questionId)).correctAnswer });
    const pass = await request(app).post(`/api/learning/verification/${retry.body.verificationId}/submit`).set(S.A.auth).send({ answers: right });
    expect(pass.body.passed).toBe(true); expect(pass.body.score).toBe(100); expect(pass.body.review.length).toBeGreaterThan(0);

    // replaying the submit is idempotent: same result, no duplicate evidence
    const replay = await request(app).post(`/api/learning/verification/${retry.body.verificationId}/submit`).set(S.A.auth).send({ answers: wrong });
    expect(replay.body.replay).toBe(true); expect(replay.body.passed).toBe(true);
    expect(await mongoose.model('SkillEvidence').countDocuments({ userId: S.A.id, type: 'verification', refId: retry.body.verificationId })).toBe(1);

    act = await mongoose.model('LearningActivity').findById(S.activity._id);
    expect(act.verificationStatus).toBe('verified');
    ev = (await request(app).get(`/api/learning/evidence?journeyId=${S.j1._id}`).set(S.A.auth)).body.evidence;
    expect(ev.demonstrated.map(s => s.name)).toContain('Docker');

    // 16-18. match recalculated per algorithm; System Design still a gap
    expect(pass.body.match.after).toBeGreaterThan(S.afterCourse);
    const d = await request(app).get(`/api/jobs/${S.job._id}?journeyId=${S.j1._id}`).set(S.A.auth);
    expect(d.body.match.score).toBe(pass.body.match.after);
    expect(d.body.match.categories.demonstrated.map(s => s.name)).toContain('Docker');
    expect(d.body.match.categories.notAssessed.map(s => s.name)).toContain('System Design');
    expect(d.body.nextSteps[0].name).toBe('System Design');

    // already demonstrated → no pointless re-verification
    const again = await request(app).post('/api/learning/verification/start').set(S.A.auth).send({ skillId: S.dockerId, journeyId: S.j1._id });
    expect(again.status).toBe(409);
  });

  t('13b. practical submission = partial evidence only; completion without a question bank = "unavailable"', async () => {
    const Skill = require('../../backend/models/Skill');
    const sd = await Skill.findOne({ name: 'System Design' });
    const pr = await request(app).post('/api/learning/practical').set(S.A.auth).send({ skillId: String(sd._id), url: 'https://github.com/example/design-doc', journeyId: S.j1._id });
    expect(pr.status).toBe(201); expect(pr.body.message).toMatch(/cannot be verified automatically/);
    expect((await request(app).post('/api/learning/practical').set(S.A.auth).send({ skillId: String(sd._id), url: 'javascript:alert(1)' })).status).toBe(400);
    const ev = (await request(app).get(`/api/learning/evidence?journeyId=${S.j1._id}`).set(S.A.auth)).body.evidence;
    expect(ev.partial.map(s => s.name)).toContain('System Design'); expect(ev.demonstrated.map(s => s.name)).not.toContain('System Design');

    const noBank = await Skill.findOne({ name: 'Terraform' }) || await Skill.findOne({ name: 'Wallet Integration' });
    const act = await request(app).post('/api/learning/activities').set(S.A.auth).send({ title: 'Wallet course', skillId: String(noBank._id), journeyId: S.j1._id });
    const done = await request(app).post(`/api/learning/activities/${act.body.activity._id}/complete`).set(S.A.auth).send({});
    expect(done.body.activity.verificationStatus).toBe('unavailable');
  });

  t('regenerating the job plan keeps completed topics', async () => {
    jest.spyOn(aiService, 'generateRoadmap').mockResolvedValueOnce({ success: true, data: { summary: 'v2', phases: [
      { phaseNumber: 1, title: 'Docker Fundamentals v2', skills: ['Docker'], weeks: [{ weekNumber: 1, title: 'C', topics: [{ title: 'Containers and images' }, { title: 'Docker networking' }], exercises: [] }] }] } });
    const r = await request(app).post('/api/roadmap/generate-for-job').set(S.A.auth).send({ journeyId: S.j1._id, jobId: S.job._id, regenerate: true });
    expect(r.status).toBe(201);
    const topics = r.body.roadmap.phases[0].weeks[0].topics;
    expect(topics.find(x => x.title === 'Containers and images').completed).toBe(true);         // preserved
    expect(topics.find(x => x.title === 'Docker networking').completed).toBe(false);
    expect(r.body.roadmap.version).toBe(2);
    expect(await mongoose.model('Roadmap').countDocuments({ userId: S.A.id, kind: 'job', jobActive: true })).toBe(1);
  });

  t('system fallback produces a job roadmap when AI is unavailable', async () => {
    jest.spyOn(aiService, 'generateRoadmap').mockResolvedValueOnce({ success: false, error: 'no key' });
    const r = await request(app).post('/api/roadmap/generate-for-job').set(S.A.auth).send({ journeyId: S.j1._id, jobId: S.job._id, regenerate: true });
    expect(r.status).toBe(201); expect(r.body.aiAvailable).toBe(false); expect(r.body.roadmap.generatedBy).toBe('system'); expect(r.body.roadmap.phases.length).toBeGreaterThan(0);
  });

  t('roadmap summary separates verified from unverified skills', async () => {
    const s = await request(app).get(`/api/learning/roadmap-summary/${S.jobRoadmap._id}`).set(S.A.auth);
    expect(s.status).toBe(200);
    expect(s.body.summary.note).toMatch(/does not by itself qualify/);
    expect(s.body.summary.match.applyUrl).toBe(S.job.applyUrl);
  });

  t('19-20. AI Mentor gets bounded job context; works without a job too (existing behaviour)', async () => {
    const spy = jest.spyOn(aiService, 'chatWithMentor').mockResolvedValue({ success: true, message: 'Docker networking explained.' });
    const withJob = await request(app).post('/api/mentor/chat').set(S.A.auth).send({ message: 'Explain Docker networking', journeyId: S.j1._id, jobId: S.job._id });
    expect(withJob.status).toBe(200); expect(withJob.body.message).toMatch(/Docker/);
    const ctx = spy.mock.calls[0][0];
    expect(ctx.jobContext.title).toMatch(/Backend Developer/); expect(ctx.jobContext.gaps.map(g => g.name)).toContain('System Design');
    expect(ctx.jobContext.excerpt.length).toBeLessThanOrEqual(500); expect(JSON.stringify(ctx)).not.toMatch(/Anna University|Asha Verma/);   // no resume leakage
    const plain = await request(app).post('/api/mentor/chat').set(S.A.auth).send({ message: 'What is REST?' });
    expect(plain.status).toBe(200); expect(spy.mock.calls[1][0].jobContext).toBeUndefined();
    expect((await request(app).post('/api/mentor/chat').set(S.A.auth).send({ message: 'x', jobId: 'nope' })).status).toBe(400);
  });

  t('save / unsave job, preferences, summary, providers', async () => {
    expect((await request(app).post(`/api/jobs/${S.job._id}/save`).set(S.A.auth)).body.saved).toBe(true);
    expect((await request(app).post(`/api/jobs/${S.job._id}/save`).set(S.A.auth)).status).toBe(200);              // idempotent
    expect((await request(app).get('/api/jobs/saved').set(S.A.auth)).body.jobs).toHaveLength(1);
    await request(app).delete(`/api/jobs/${S.job._id}/save`).set(S.A.auth);
    expect((await request(app).get('/api/jobs/saved').set(S.A.auth)).body.jobs).toHaveLength(0);
    const p = await request(app).put('/api/jobs/preferences').set(S.A.auth).send({ workModes: ['remote', 'teleport'], minSalary: 50000 });
    expect(p.body.preferences.workModes).toEqual(['remote']);
    const sum = await request(app).get(`/api/jobs/summary?journeyId=${S.j1._id}`).set(S.A.auth);
    expect(sum.body.resume.status).toBe('confirmed'); expect(sum.body.recommendations.count).toBeGreaterThan(0);
    expect((await request(app).get('/api/jobs/providers').set(S.A.auth)).body.providers.find(x => x.name === 'remotive').enabled).toBe(true);
  });

  t('filters and sorting', async () => {
    mockProviders();
    const remote = await request(app).get(`/api/jobs/recommendations?journeyId=${S.j1._id}&query=developer&workMode=remote`).set(S.A.auth);
    expect(remote.body.items.every(i => i.job.workMode === 'remote')).toBe(true);
    const hi = await request(app).get(`/api/jobs/recommendations?journeyId=${S.j1._id}&query=developer&minScore=99`).set(S.A.auth);
    expect(hi.body.items.every(i => i.match.score >= 99)).toBe(true);
    const kw = await request(app).get(`/api/jobs/recommendations?journeyId=${S.j1._id}&query=developer&keyword=pixel`).set(S.A.auth);
    expect(kw.body.items.map(i => i.job.company)).toEqual(['Pixel Co']);
  });

  t('22. second journey unchanged by everything above', async () => {
    const CareerJourney = require('../../backend/models/CareerJourney');
    const j2 = await CareerJourney.findById(S.j2._id);
    expect(j2.progress).toBe(0); expect(j2.status).toBe('NOT_STARTED');
    expect(await mongoose.model('Roadmap').countDocuments({ userId: S.A.id, journeyId: S.j2._id })).toBe(0);
    expect(await mongoose.model('LearningActivity').countDocuments({ userId: S.A.id, journeyId: S.j2._id })).toBe(0);
  });

  t('existing endpoints still work (dashboard, history, journeys, profile)', async () => {
    for (const url of ['/api/dashboard', '/api/journeys', '/api/journeys/history', '/api/assessment/history', '/api/profile', '/api/auth/me', '/api/health']) {
      const r = await request(app).get(url).set(S.A.auth); expect([200]).toContain(r.status);
    }
    expect((await request(app).get('/api/dashboard')).status).toBe(401);                          // JWT protection intact
  });

  describe('authorization & input safety', () => {
    t('another user cannot read or change anything of user A', async () => {
      const B = await mk();
      expect((await request(app).get('/api/resume').set(B.auth)).body.resume).toBeNull();
      expect((await request(app).patch('/api/resume/review').set(B.auth).send({ confirm: true })).status).toBe(404);
      expect((await request(app).get('/api/resume/file').set(B.auth)).status).toBe(404);
      expect((await request(app).post(`/api/learning/activities/${S.activity._id}/complete`).set(B.auth).send({})).status).toBe(404);
      expect((await request(app).post(`/api/learning/activities/${S.activity._id}/start`).set(B.auth).send({})).status).toBe(404);
      expect((await request(app).get(`/api/roadmap/by-id/${S.jobRoadmap._id}`).set(B.auth)).status).toBe(404);
      expect((await request(app).get(`/api/learning/roadmap-summary/${S.jobRoadmap._id}`).set(B.auth)).status).toBe(404);
      expect((await request(app).get(`/api/jobs/recommendations?journeyId=${S.j1._id}`).set(B.auth)).status).toBe(403);
      expect((await request(app).post('/api/roadmap/generate-for-job').set(B.auth).send({ journeyId: S.j1._id, jobId: S.job._id })).status).toBe(403);
      expect((await request(app).post('/api/learning/activities').set(B.auth).send({ title: 'xx', journeyId: S.j1._id })).status).toBe(403);
      expect((await request(app).post('/api/learning/activities').set(B.auth).send({ title: 'xx', roadmapId: S.jobRoadmap._id, topicId: S.jobRoadmap.phases[0].weeks[0].topics[0]._id })).status).toBe(404);
      const ver = (await request(app).post('/api/learning/verification/start').set(S.A.auth).send({ skillId: S.dockerId })).status;   // A is already demonstrated
      expect(ver).toBe(409);
      expect((await request(app).post(`/api/learning/verification/${S.activity._id}/submit`).set(B.auth).send({ answers: [] })).status).toBe(404);
    });
    t('malformed ids and operator injection are rejected', async () => {
      expect((await request(app).get('/api/jobs/not-an-id').set(S.A.auth)).status).toBe(400);
      expect((await request(app).get('/api/jobs/recommendations?journeyId[$ne]=1').set(S.A.auth)).status).toBe(400);
      expect((await request(app).post('/api/learning/activities').set(S.A.auth).send({ title: 'x', skillId: { $ne: null } })).status).toBe(400);
      expect((await request(app).post('/api/learning/verification/start').set(S.A.auth).send({ skillId: 'abc' })).status).toBe(400);
      expect((await request(app).post('/api/roadmap/generate-for-job').set(S.A.auth).send({ journeyId: S.j1._id, jobId: { $gt: '' } })).status).toBe(400);
      expect((await request(app).post('/api/learning/activities/' + S.activity._id + '/complete').set(S.A.auth).send({ certificateUrl: 'javascript:alert(1)' })).status).toBe(200);   // already completed → ignored safely
    });
    t('unauthenticated access is refused on every new route', async () => {
      for (const [m, u] of [['get', '/api/resume'], ['post', '/api/resume'], ['get', '/api/jobs/recommendations'], ['get', `/api/jobs/${S.job._id}`], ['post', '/api/learning/activities'], ['post', '/api/roadmap/generate-for-job'], ['get', '/api/learning/evidence']]) {
        expect((await request(app)[m](u)).status).toBe(401);
      }
    });
  });

  t('resume deletion removes data and the stored file; recommendations re-evaluate without it', async () => {
    const del = await request(app).delete('/api/resume').set(S.A.auth);
    expect(del.status).toBe(200);
    expect((await request(app).get('/api/resume').set(S.A.auth)).body.resume).toBeNull();
    expect(await mongoose.connection.db.collection('resumes.files').countDocuments({})).toBe(0);
    const d = await request(app).get(`/api/jobs/${S.job._id}?journeyId=${S.j1._id}`).set(S.A.auth);
    expect(d.body.resumeStatus).toBe('none');
  });
});
