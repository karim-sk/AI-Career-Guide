const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/learningController');
const { protect } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const writeLimiter = rateLimit({ windowMs: 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.' } });

router.get('/activities', protect, ctrl.list);
router.post('/activities', protect, writeLimiter, ctrl.create);
router.post('/activities/:id/start', protect, writeLimiter, ctrl.start);
router.post('/activities/:id/complete', protect, writeLimiter, ctrl.complete);

router.post('/verification/start', protect, writeLimiter, ctrl.verificationStart);
router.post('/verification/:id/submit', protect, writeLimiter, ctrl.verificationSubmit);
router.post('/practical', protect, writeLimiter, ctrl.practical);

router.get('/evidence', protect, ctrl.evidence);
router.get('/roadmap-summary/:roadmapId', protect, ctrl.roadmapSummary);

module.exports = router;
