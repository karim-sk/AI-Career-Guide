# AI Career Navigator — Career Platform Upgrade

This document describes the resume → jobs → verification layer added on top of the existing app. Nothing was
replaced: authentication, `CareerJourney`, the assessment engine, the roadmap generator, the AI Mentor and the
dashboard are the same modules, extended in place.

## 1. Architecture

```
frontend (vanilla JS)            backend (Express)                         MongoDB
resume.html ───────────────────► routes/resume ► resumeController ─► resumeParser ─► Resume (+GridFS "resumes")
jobs.html / job.html ──────────► routes/jobs   ► jobController ────► recommendationService
                                                                        ├─ jobService ─► providers (Adzuna/Remotive/Arbeitnow/sample) ─► JobListing
                                                                        ├─ evidenceService ─► AssessmentResult, SkillEvidence, Resume, LearningActivity
                                                                        └─ matchingService (pure, deterministic) ─► JobRecommendation (cache)
job.html "Prepare for this job" ► routes/roadmap ► roadmapController.generateJobRoadmap ─► aiService.generateRoadmap (SAME generator)
roadmap.html?roadmapId= ───────► Roadmap (kind:"job")  – existing roadmap UI + job banner
dialogs (course / skill check) ► routes/learning ► learningService ─► LearningActivity, SkillVerification, SkillEvidence, Roadmap
mentor.html?jobId= ────────────► mentorController (adds bounded job context) ─► aiService.chatWithMentor
```

### Reused vs new
| Concern | Reused (extended) | New |
|---|---|---|
| Auth, JWT, error handler | `middleware/auth`, `errorHandler` | – |
| Skills / careers | `Skill`, `Career` (+aliases, slug, relations, resources, family) | `seed/skillCatalog.js`, `careersExpansion.js`, `questions/expansion.js` |
| Journeys | `CareerJourney` (untouched) | – |
| Roadmap | `Roadmap` (+`kind`, `jobContext`), `aiService.generateRoadmap` (+optional `jobContext`), `buildSystemRoadmap` fallback | `generateJobRoadmap`, `getJobRoadmap`, `getRoadmapById` |
| Mentor | `mentorController`, `aiService.chatWithMentor` (+optional `jobContext`) | – |
| Evidence | `AssessmentResult` is the single source for assessment scores | `SkillEvidence`, `SkillVerification`, `LearningActivity` |
| Resume / jobs | – | `Resume`, `JobListing`, `JobRecommendation`, `SavedJob` |

### How job roadmaps stay separate from career roadmaps
Job roadmaps are stored in the same `Roadmap` collection with `kind:"job"`, **`isActive:false`** and `jobActive:true`.
Every existing query asks for `isActive:true`, so existing endpoints never see them; `getAllRoadmaps` filters them out
explicitly; `syncJourneyProgress` returns early for them, so job progress can never overwrite journey progress.
Topic ticking on a job roadmap uses the existing `PATCH` routes unchanged.

## 2. Evidence model (course ≠ mastery)

| Status | Meaning | How it is reached |
|---|---|---|
| `demonstrated` | graded test ≥ 70 % | latest of: assessment score, passed skill check |
| `partial` | some evidence | test 40–69 %, **or** course completed, **or** practical link submitted, **or** resume skill used in a project/job |
| `in_progress` | learning now | an in-progress activity and nothing stronger |
| `not_assessed` | no test yet (`claimed` if on a confirmed resume / self-rated ≥ 50) | default — **never** treated as a deficiency |
| `missing_evidence` | test < 40 % | only a graded result can produce this |

Completing a course records `SkillEvidence(type:"course")` → **partial only**. `verificationStatus` becomes
`pending` (a question bank exists), `unavailable` (not enough questions) or `verified` (already demonstrated).
Only `submitVerification` (server-graded) creates `demonstrated` evidence. Client flags such as `passed:true` are ignored.

Integrity controls: answers are never sent before submit; explanations are only shown after a **pass**; cooldown after a
failure (`VERIFICATION_COOLDOWN_MINUTES`), daily cap, one open attempt per skill, idempotent submit.
**Limitation:** most skills have 3–4 questions, so a determined user could memorise a bank. Extend `seed/questions/*`
(the seed is idempotent) to raise assurance.

## 3. Matching algorithm (`services/matchingService.js`)

```
score = round( 100 × Σ w_i·s_i / Σ w_i )   over AVAILABLE dimensions only
```
| Dimension | Default weight | s_i |
|---|---|---|
| skills | 50 | 0.75·avg(required credit) + 0.25·avg(preferred credit) |
| experience | 20 | min(1, candidate years / years required) |
| projects | 15 | share of required skills with project/practical evidence |
| education | 10 | 1 if level ≥ required, 0.5 if one level below, else 0 |
| alignment | 5 | mean of: title↔career similarity, work-mode, location, salary preference (those available) |

Credit per status: demonstrated 1 · partial 0.6 · claimed-only 0.35 · in-progress 0.3 · not-assessed 0 · missing 0.
**Missing-data policy:** a dimension with no data (job states no experience requirement, candidate has no resume, …) is
excluded and the other weights are renormalised — it is never scored as a mismatch. Unmet hard requirements (years,
degree, certifications, work mode, assessed gaps in required skills) are returned separately as `warnings`.
`confidence` = share of total weight that was computable (≥ 0.8 high, ≥ 0.5 medium, else low).
Weights: `MATCH_WEIGHTS` env (validated, falls back to defaults). They are design defaults, not validated against
hiring outcomes.

**Caching:** `JobRecommendation` stores a `profileHash` (SHA-1 of all evidence + weights). A stored score is reused until the
hash changes (new evidence, resume confirmed/deleted, preference change) and is then recomputed lazily — never on every render.
Evidence is user-level (a verified Docker skill counts in every journey); progress, roadmaps and activities stay per journey.

## 4. Job data

Providers (`services/jobs/providers.js`) call **documented public APIs** only: Adzuna (keys), Remotive, Arbeitnow.
`normalizeJob` drops any listing without a valid http(s) apply URL. Only provider-supplied salaries are shown (Adzuna's
*predicted* salaries are ignored). Required vs preferred skills are derived from the listing text by sentence-level rules.
Freshness labels: `live` (fetched this request) · `cached` · `stale` (> `JOB_STALE_DAYS`) · `sample`.
If every provider fails, previously stored listings are returned with a notice; the app never errors out.
`sample` records have `applyUrl:null` and are labelled as not real vacancies.

## 5. API summary (all require `Authorization: Bearer <jwt>`)

**Resume** — `POST /api/resume` (multipart `resume`, ≤ 5 MB, pdf/docx) · `GET /api/resume` · `PATCH /api/resume/review`
`{skills:[skillId], totalExperienceYears, education[], certifications[], confirm}` · `GET /api/resume/file` · `DELETE /api/resume`

**Jobs** — `GET /api/jobs/providers` · `GET /api/jobs/recommendations?journeyId&query&location&workMode&experience&jobType&minScore&minSalary&keyword&sort=match|date&page&limit&refresh=1`
· `GET /api/jobs/:id?journeyId` · `POST /api/jobs/:id/refresh` · `POST|DELETE /api/jobs/:id/save` · `GET /api/jobs/saved`
· `GET|PUT /api/jobs/preferences` · `GET /api/jobs/summary?journeyId`

**Roadmap (extended)** — `POST /api/roadmap/generate-for-job {journeyId, jobId, regenerate?}` (idempotent; regenerate keeps completed topics)
· `GET /api/roadmap/job?jobId&journeyId` · `GET /api/roadmap/by-id/:roadmapId`

**Learning** — `GET|POST /api/learning/activities` · `POST /api/learning/activities/:id/start|complete {certificateUrl?, notes?}`
· `POST /api/learning/verification/start {skillId, activityId?, journeyId?, jobId?}` · `POST /api/learning/verification/:id/submit {answers:[{questionId, selectedAnswer}]}`
· `POST /api/learning/practical {skillId, url, description?}` · `GET /api/learning/evidence?journeyId` · `GET /api/learning/roadmap-summary/:roadmapId`

**Mentor (extended)** — `POST /api/mentor/chat {message, sessionId?, journeyId?, topicContext?, jobId?}`

Errors use the existing `{ success:false, message }` shape; ids are validated strictly (objects/operators are rejected).

## 6. Security & privacy
- Upload: memory storage only (nothing touches disk), size limit, extension + **magic-byte** validation, DOCX structure check, PDF text via `pdfjs-dist` with `isEvalSupported:false` (no script execution), page cap.
- Stored contact details: none (email/phone/address are never extracted). Resume is only used after the user confirms it. Delete removes the document **and** the GridFS file.
- Owner-only access on every resource (`userId` in every query; journeys verified). Resume download streams to the owner with `nosniff`, `no-store`.
- Resume text, job descriptions and provider content are treated as untrusted: they are never put into instructions; the mentor/roadmap prompts label them as data and the mentor receives only bounded fields (≤ 12 skills, 500-char excerpt) — never the resume.
- Rate limits: uploads, job searches, learning writes, plan generation. External URLs are rendered only if `http(s)`; links use `rel="noopener noreferrer nofollow"`.
- No secrets in code; provider keys only via env; logs never contain resume text.

## 7. Operations
```bash
npm install
cp .env.example .env            # set MONGODB_URI, JWT_SECRET, AI key; optional ADZUNA_*
npm run seed                    # idempotent, NON-destructive (upserts by name/title/question)
npm run seed:report             # coverage report (no DB needed)
npm start                       # or: npm run dev
npm test                        # unit + integration (integration needs a MongoDB-compatible server)
```
Integration tests use `TEST_MONGODB_URI` (default `mongodb://127.0.0.1:27017`) and a throw-away database; they self-skip if no server is reachable.

**Render:** no new services needed. Add the env vars above in the dashboard. Resumes are stored in MongoDB (GridFS) so the ephemeral disk is not used. Run `npm run seed` once after deploy (safe to repeat).
**Breaking change in tooling:** the old `seed` script deleted all skills/careers/questions. The new one never deletes anything.
