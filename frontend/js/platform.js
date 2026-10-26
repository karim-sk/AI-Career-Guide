/* platform.js — shared helpers for Resume / Jobs / Verification UI (depends on api.js) */

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
/** Only http(s) links are ever rendered as hrefs. */
function safeHref(u) {
  try { const x = new URL(u); return (x.protocol === 'http:' || x.protocol === 'https:') && !x.username && !x.password ? x.toString() : ''; } catch (e) { return ''; }
}

const STATUS_LABEL = {
  demonstrated: 'Demonstrated', partial: 'Partially demonstrated', in_progress: 'Learning in progress',
  not_assessed: 'Not yet assessed', missing_evidence: 'Missing required evidence'
};
const STATUS_HELP = {
  demonstrated: 'Shown by a graded assessment.',
  partial: 'Some evidence (course, project, or a mid-range test score) — not fully demonstrated.',
  in_progress: 'You are currently learning this.',
  not_assessed: 'No test result yet. This does NOT mean you lack the skill.',
  missing_evidence: 'A graded assessment showed a gap.'
};
function statusChip(status, claimed) {
  const label = STATUS_LABEL[status] || status;
  const extra = status === 'not_assessed' && claimed ? ' (on resume)' : '';
  return `<span class="st st-${esc(status)}${claimed ? ' st-claimed' : ''}" title="${esc(STATUS_HELP[status] || '')}">${esc(label)}${extra}</span>`;
}
function verificationChip(v) {
  const map = { pending: ['st-pending', 'Verification pending'], verified: ['st-verified', 'Verified'], failed: ['st-failed', 'Check not passed'], unavailable: ['st-not_assessed', 'No test available'], not_required: ['st-not_assessed', 'No verification needed'] };
  const [cls, txt] = map[v] || map.not_required;
  return `<span class="st ${cls}">${txt}</span>`;
}
function scoreRing(score, confidence) {
  const cls = score >= 70 ? 'ring-high' : score >= 45 ? 'ring-mid' : 'ring-low';
  return `<div class="score-wrap" role="img" aria-label="Estimated match ${score} percent, ${esc(confidence)} confidence">
    <div class="score-ring ${cls}" style="--v:${Number(score) || 0}"><span>${Number(score) || 0}%</span></div>
    <div class="conf">${esc(confidence)} confidence</div></div>`;
}
function freshnessBadge(f) {
  if (!f) return '';
  const cls = f.label === 'live' ? 'tag-real' : f.label === 'sample' ? 'tag-sample' : 'tag-warn';
  const txt = { live: 'Live listing', cached: 'Cached', stale: 'May be outdated', sample: 'Sample data — not a real vacancy' }[f.label] || f.label;
  return `<span class="pl-badge ${cls}" title="${esc(f.description)}">${esc(txt)}</span>`;
}
function providerLabel(p) { return { adzuna: 'Adzuna', remotive: 'Remotive', arbeitnow: 'Arbeitnow', sample: 'Sample' }[p] || p; }
function fmtSalary(s) {
  if (!s || (s.min == null && s.max == null)) return '';
  const f = n => (n == null ? '' : Number(n).toLocaleString());
  return `${esc(s.currency || '')} ${f(s.min)}${s.max != null ? ' – ' + f(s.max) : ''}${s.period ? ' / ' + esc(s.period) : ''}`.trim();
}
function expText(e) {
  if (!e) return '';
  if (e.minYears != null) return `${e.minYears}${e.maxYears ? '–' + e.maxYears : '+'} yrs experience`;
  return e.level && e.level !== 'unknown' ? e.level.charAt(0).toUpperCase() + e.level.slice(1) + ' level' : '';
}
function mentorUrl(journeyId, jobId) {
  const p = new URLSearchParams(); if (journeyId) p.set('journeyId', journeyId); if (jobId) p.set('jobId', jobId);
  const q = p.toString(); return '/mentor.html' + (q ? '?' + q : '');
}

// ── Accessible modal ──────────────────────────────────────────────────────────
function openModal(html, { label = 'Dialog', onClose } = {}) {
  const prev = document.activeElement;
  const back = document.createElement('div'); back.className = 'pl-backdrop';
  back.innerHTML = `<div class="pl-modal" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1">${html}</div>`;
  document.body.appendChild(back);
  const modal = back.firstElementChild; modal.focus();
  const close = () => { document.removeEventListener('keydown', onKey); back.remove(); if (prev && prev.focus) prev.focus(); if (onClose) onClose(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  return { modal, close };
}

// ── Log a completed course ────────────────────────────────────────────────────
/** ctx: { skillId, skillName, journeyId, jobId?, roadmapId?, topicId?, defaultTitle?, onDone(result) } */
function logCourseDialog(ctx) {
  const { modal, close } = openModal(`
    <h2>Log a completed course</h2>
    <p class="text-muted text-sm">For <strong>${esc(ctx.skillName)}</strong>. Completing a course is recorded as <em>partial</em> evidence; the skill is only “demonstrated” after you pass a skill check.</p>
    <div style="margin:1rem 0"><label class="pl-label" for="lc-title">Course / activity name</label>
      <input id="lc-title" class="pl-input" maxlength="200" value="${esc(ctx.defaultTitle || '')}" placeholder="e.g. Docker for Node developers"></div>
    <div style="margin:1rem 0"><label class="pl-label" for="lc-url">Course link (optional)</label>
      <input id="lc-url" class="pl-input" type="url" placeholder="https://…"></div>
    <div style="margin:1rem 0"><label class="pl-label" for="lc-cert">Certificate link (optional)</label>
      <input id="lc-cert" class="pl-input" type="url" placeholder="https://…"></div>
    <div id="lc-msg" class="form-error" role="alert"></div>
    <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem">
      <button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="lc-save">Mark completed</button></div>`, { label: 'Log completed course' });
  modal.querySelector('#lc-title').focus();
  modal.querySelector('#lc-save').addEventListener('click', async e => {
    const btn = e.currentTarget, msg = modal.querySelector('#lc-msg');
    const title = modal.querySelector('#lc-title').value.trim();
    if (title.length < 2) { msg.textContent = 'Please enter a name.'; return; }
    btn.disabled = true; btn.textContent = 'Saving…'; msg.textContent = '';
    try {
      const body = { title, type: 'course', url: modal.querySelector('#lc-url').value.trim() || undefined,
        skillId: ctx.skillId, journeyId: ctx.journeyId, jobId: ctx.jobId, roadmapId: ctx.roadmapId, topicId: ctx.topicId };
      const created = await api.createActivity(body);
      const cert = modal.querySelector('#lc-cert').value.trim();
      const done = await api.completeActivity(created.activity._id, cert ? { certificateUrl: cert } : {});
      close();
      showToast(done.alreadyCompleted ? 'Already completed.' : 'Course recorded.', 'success');
      if (ctx.onDone) ctx.onDone(done);
      if (done.verification && done.verification.status === 'pending') {
        verifyDialog({ skillId: ctx.skillId, skillName: ctx.skillName, journeyId: ctx.journeyId, jobId: ctx.jobId, activityId: done.activity._id, onDone: ctx.onDone, offer: true });
      }
    } catch (err) { msg.textContent = err.message; btn.disabled = false; btn.textContent = 'Mark completed'; }
  });
}

// ── Skill verification (server-graded) ────────────────────────────────────────
/** ctx: { skillId, skillName, journeyId?, jobId?, activityId?, onDone(result), offer? } */
function verifyDialog(ctx) {
  if (ctx.offer) {
    const { modal, close } = openModal(`<h2>Verify ${esc(ctx.skillName)}?</h2>
      <p class="text-muted text-sm">Your course is recorded, but <strong>${esc(ctx.skillName)} is not verified yet</strong>. A short skill check (graded on the server) turns it into demonstrated evidence and updates your job match.</p>
      <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem"><button class="btn btn-ghost" data-close>Later</button><button class="btn btn-primary" id="vo-go">Take skill check</button></div>`, { label: 'Offer skill check' });
    modal.querySelector('#vo-go').addEventListener('click', () => { close(); verifyDialog({ ...ctx, offer: false }); });
    return;
  }
  const { modal, close } = openModal(`<h2>Skill check: ${esc(ctx.skillName)}</h2><div id="vf-body"><div class="pl-skeleton"></div></div>`, { label: 'Skill check' });
  const body = modal.querySelector('#vf-body');

  (async () => {
    try {
      const start = await api.startVerification({ skillId: ctx.skillId, journeyId: ctx.journeyId, jobId: ctx.jobId, activityId: ctx.activityId });
      body.innerHTML = `<p class="text-muted text-sm">${start.questions.length} questions · ${start.passThreshold}% needed to pass. Answers are graded on the server. If you do not pass, the correct answers are not shown.</p>
        <form id="vf-form">${start.questions.map((q, i) => `
          <fieldset class="pl-q"><legend>${i + 1}. ${esc(q.question)}</legend>
            ${q.options.map((o, k) => `<label class="pl-opt"><input type="radio" name="q${i}" value="${k}" required> <span>${esc(o)}</span></label>`).join('')}
          </fieldset>`).join('')}
          <div id="vf-msg" class="form-error" role="alert"></div>
          <div style="display:flex;gap:.5rem;justify-content:flex-end"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="vf-submit">Submit answers</button></div></form>`;
      body.querySelector('[data-close]').addEventListener('click', close);
      body.querySelector('#vf-form').addEventListener('submit', async e => {
        e.preventDefault();
        const btn = body.querySelector('#vf-submit'); btn.disabled = true; btn.textContent = 'Grading…';
        const answers = start.questions.map((q, i) => ({ questionId: q.questionId, selectedAnswer: Number((body.querySelector(`input[name=q${i}]:checked`) || {}).value) }));
        try {
          const r = await api.submitVerification(start.verificationId, answers);
          body.innerHTML = `<div class="pl-notice ${r.passed ? 'ok' : 'warn'}" role="status"><strong>${r.passed ? '✅ Passed' : 'Not passed'} — ${r.score}%</strong> (${r.correctCount}/${r.total})<br>${esc(r.message)}</div>
            ${r.match && r.match.before != null ? `<p>Job match: <strong>${r.match.before}%</strong> → <strong>${r.match.after}%</strong></p>` : ''}
            ${(r.review || []).map(x => `<div class="pl-q"><strong>${esc(x.question)}</strong><br><span class="text-success">✔ ${esc(x.correctOption)}</span><br><span class="text-muted text-sm">${esc(x.explanation || '')}</span></div>`).join('')}
            <div style="text-align:right"><button class="btn btn-primary" data-close>Close</button></div>`;
          body.querySelector('[data-close]').addEventListener('click', close);
          if (ctx.onDone) ctx.onDone(r);
        } catch (err) { body.querySelector('#vf-msg').textContent = err.message; btn.disabled = false; btn.textContent = 'Submit answers'; }
      });
    } catch (err) {
      body.innerHTML = `<div class="pl-notice ${err.status === 409 ? 'ok' : 'warn'}" role="alert">${esc(err.message)}</div><div style="text-align:right"><button class="btn btn-primary" data-close>Close</button></div>`;
      body.querySelector('[data-close]').addEventListener('click', () => { close(); if (err.status === 409 && ctx.onDone) ctx.onDone({}); });
    }
  })();
}

// ── Practical evidence ────────────────────────────────────────────────────────
function practicalDialog(ctx) {
  const { modal, close } = openModal(`<h2>Submit practical work: ${esc(ctx.skillName)}</h2>
    <p class="text-muted text-sm">Link a repository or project. It is saved as <em>partial</em> evidence — it cannot be verified automatically, so take the skill check to demonstrate the skill.</p>
    <div style="margin:1rem 0"><label class="pl-label" for="pr-url">Project link</label><input id="pr-url" type="url" class="pl-input" placeholder="https://github.com/…"></div>
    <div style="margin:1rem 0"><label class="pl-label" for="pr-d">Short description (optional)</label><input id="pr-d" class="pl-input" maxlength="300"></div>
    <div id="pr-msg" class="form-error" role="alert"></div>
    <div style="display:flex;gap:.5rem;justify-content:flex-end"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="pr-save">Save</button></div>`, { label: 'Submit practical work' });
  modal.querySelector('#pr-save').addEventListener('click', async () => {
    try {
      const r = await api.submitPractical({ skillId: ctx.skillId, journeyId: ctx.journeyId, url: modal.querySelector('#pr-url').value.trim(), description: modal.querySelector('#pr-d').value.trim() });
      close(); showToast(r.message, 'success', 5000); if (ctx.onDone) ctx.onDone(r);
    } catch (err) { modal.querySelector('#pr-msg').textContent = err.message; }
  });
}

/** Journey <select> helper → resolves selected journeyId (URL param wins, else first in-progress, else first). */
async function loadJourneyPicker(selectEl) {
  const urlJ = new URLSearchParams(location.search).get('journeyId');
  let journeys = [];
  try { journeys = (await api.getJourneys()).journeys || []; } catch (e) { /* ignore */ }
  selectEl.innerHTML = journeys.length
    ? journeys.map(j => `<option value="${esc(j._id)}">${esc(j.careerName)}</option>`).join('')
    : '<option value="">No career journey yet</option>';
  const pick = journeys.find(j => j._id === urlJ) || journeys.find(j => j.status === 'IN_PROGRESS') || journeys[0];
  if (pick) selectEl.value = pick._id;
  return { journeys, journeyId: pick ? pick._id : '' };
}
