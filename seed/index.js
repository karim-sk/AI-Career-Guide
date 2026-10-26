/**
 * Idempotent, NON-destructive seed.
 *   npm run seed          → upsert skills, careers, questions (safe to run any number of times)
 *   npm run seed:report   → coverage report only (no database connection needed)
 *
 * Guarantees
 *  - Nothing is ever deleted. Existing documents keep their _id (user results/roadmaps reference them).
 *  - Skills are matched by `name`, careers by `title`, questions by (skillId, question text).
 *  - Existing careers keep their requiredSkills untouched; we only add `family` and `aliases`.
 */
require('dotenv').config();

const skillCatalog = require('./skillCatalog');
const careersData = require('./careersData');
const { existingCareerMeta, newCareers } = require('./careersExpansion');
const htmlCssJs = require('./questions/htmlCssJs');
const reactNode = require('./questions/reactNode');
const other = require('./questions/other');
const expansion = require('./questions/expansion');

const allQuestions = [...htmlCssJs, ...reactNode, ...other, ...expansion];
const allCareers = [...careersData.map(c => ({ ...c, ...(existingCareerMeta[c.title] || {}), _existing: true })), ...newCareers];

function coverageReport() {
  const perSkill = {};
  allQuestions.forEach(q => { perSkill[q.skillName] = (perSkill[q.skillName] || 0) + 1; });
  const noQ = skillCatalog.filter(s => !perSkill[s.name]).map(s => s.name);
  const careerIssues = [];
  allCareers.forEach(c => c.requiredSkills.forEach(r => {
    if (!perSkill[r.skillName]) careerIssues.push(`${c.title} → ${r.skillName} (no questions)`);
  }));
  const thin = Object.entries(perSkill).filter(([, n]) => n < 4).map(([k, n]) => `${k} (${n})`);
  console.log('\n📋 Catalog coverage report');
  console.log(`   Skills: ${skillCatalog.length}   Careers: ${allCareers.length}   Questions: ${allQuestions.length}`);
  console.log(`   Skills with assessment questions: ${Object.keys(perSkill).length}/${skillCatalog.length}`);
  console.log(`   Skills with < 4 questions (verification needs ≥ 3): ${thin.length ? thin.join(', ') : 'none'}`);
  console.log(`   Skills WITHOUT questions (usable for job matching/resume, not assessable yet): ${noQ.length}`);
  if (careerIssues.length) { console.log('   ⚠ Career requirements without questions:'); careerIssues.forEach(i => console.log('     - ' + i)); }
  else console.log('   ✔ Every career requirement has assessment questions');
  return { perSkill, noQ, careerIssues };
}

/** Seeds an already-connected mongoose instance. Used by `npm run seed` and by the integration tests. */
async function runSeed({ quiet = false } = {}) {
  const log = (...a) => { if (!quiet) console.log(...a); };
  const Skill = require('../backend/models/Skill');
  const Career = require('../backend/models/Career');
  const Question = require('../backend/models/Question');


  // ── Skills ────────────────────────────────────────────────────────────────
  // Sequential upserts (small catalog; avoids giant bulk commands and keeps behaviour identical on any Mongo-compatible server)
  let skillsCreated = 0;
  for (const s of skillCatalog) {
    const r = await Skill.updateOne(
      { name: s.name },
      { $set: { category: s.category, description: s.description, icon: s.icon, slug: s.slug,
                aliases: s.aliases, ambiguous: s.ambiguous, resources: s.resources } },
      { upsert: true }
    );
    if (r.upsertedCount) skillsCreated++;
  }
  const skills = await Skill.find({}).select('name');
  const idByName = {};
  skills.forEach(s => { idByName[s.name] = s._id; });
  log(`🌱 Skills     — created: ${skillsCreated}, existing: ${skillCatalog.length - skillsCreated}`);

  // relations (second pass, needs ids)
  for (const s of skillCatalog) {
    if (!s.relatedNames.length && !s.prerequisiteNames.length) continue;
    await Skill.updateOne({ name: s.name }, { $set: {
      relatedSkills: s.relatedNames.map(n => idByName[n]).filter(Boolean),
      prerequisites: s.prerequisiteNames.map(n => idByName[n]).filter(Boolean)
    } });
  }

  // ── Careers ───────────────────────────────────────────────────────────────
  let created = 0, updated = 0;
  for (const c of allCareers) {
    const existing = await Career.findOne({ title: c.title });
    if (existing) {
      // never touch requiredSkills of an existing career
      await Career.updateOne({ _id: existing._id }, { $set: { family: c.family || '', aliases: (c.aliases || []).map(a => a.toLowerCase()) } });
      updated++;
    } else {
      const requiredSkills = c.requiredSkills
        .filter(rs => idByName[rs.skillName])
        .map(rs => ({ skillId: idByName[rs.skillName], requiredLevel: rs.requiredLevel, priority: rs.priority, category: rs.category }));
      await Career.create({
        title: c.title, icon: c.icon, description: c.description, avgSalary: c.avgSalary, jobDemand: c.jobDemand,
        family: c.family || '', aliases: (c.aliases || []).map(a => a.toLowerCase()), requiredSkills
      });
      created++;
    }
  }
  log(`🌱 Careers    — created: ${created}, existing (metadata refreshed only): ${updated}`);

  // ── Questions ─────────────────────────────────────────────────────────────
  let qCreated = 0, qTotal = 0;
  for (const q of allQuestions) {
    if (!idByName[q.skillName]) continue;
    qTotal++;
    const r = await Question.updateOne(
      { skillId: idByName[q.skillName], question: q.question },
      { $setOnInsert: {
        skillId: idByName[q.skillName], question: q.question, options: q.options, correctAnswer: q.correctAnswer,
        difficulty: q.difficulty, explanation: q.explanation || '', points: q.points || 1, isActive: true
      } },
      { upsert: true }
    );
    if (r.upsertedCount) qCreated++;
  }
  log(`🌱 Questions  — created: ${qCreated}, existing: ${qTotal - qCreated}`);

  if (!quiet) coverageReport();
  log('\n✅ Seed complete (nothing was deleted).\n');
}

async function seed() {
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB connected for seeding (non-destructive upsert mode)');
  await runSeed();
  await mongoose.disconnect();
}


if (require.main === module) {
  if (process.argv.includes('--report')) {
    coverageReport();
  } else {
    seed().then(() => process.exit(0)).catch(err => { console.error('❌ Seeding error:', err.message); process.exit(1); });
  }
}

module.exports = { runSeed, coverageReport, skillCatalog, allCareers, allQuestions };
