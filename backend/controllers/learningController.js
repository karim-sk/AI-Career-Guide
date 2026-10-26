const svc = require('../services/learningService');
const wrap = fn => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };

exports.list = wrap(async (req, res) => res.json({ success: true, activities: await svc.listActivities(req.user._id, req.query) }));
exports.create = wrap(async (req, res) => res.status(201).json({ success: true, activity: await svc.createActivity(req.user._id, req.body) }));
exports.start = wrap(async (req, res) => res.json({ success: true, activity: await svc.startActivity(req.user._id, req.params.id) }));
exports.complete = wrap(async (req, res) => {
  const r = await svc.completeActivity(req.user._id, req.params.id, req.body);
  res.json({
    success: true,
    message: r.alreadyCompleted ? 'This activity was already completed.' : 'Activity completed.',
    ...r
  });
});
exports.verificationStart = wrap(async (req, res) => res.status(201).json({ success: true, ...(await svc.startVerification(req.user._id, req.body)) }));
exports.verificationSubmit = wrap(async (req, res) => res.json({ success: true, ...(await svc.submitVerification(req.user._id, req.params.id, req.body && req.body.answers)) }));
exports.practical = wrap(async (req, res) => res.status(201).json({ success: true, ...(await svc.submitPractical(req.user._id, req.body)) }));
exports.evidence = wrap(async (req, res) => res.json({ success: true, evidence: await svc.evidenceSummary(req.user._id, req.query.journeyId) }));
exports.roadmapSummary = wrap(async (req, res) => res.json({ success: true, summary: await svc.roadmapSummary(req.user._id, req.params.roadmapId) }));
