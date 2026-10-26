const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const ctrl = require('../controllers/jobController');
const { protect } = require('../middleware/auth');

// Provider calls are the expensive/rate-limited part → limit per client
const searchLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many job searches. Please wait a moment.' } });

router.get('/providers', protect, ctrl.providers);
router.get('/recommendations', protect, searchLimiter, ctrl.recommendations);
router.get('/summary', protect, ctrl.summary);
router.get('/saved', protect, ctrl.saved);
router.get('/preferences', protect, ctrl.getPrefs);
router.put('/preferences', protect, ctrl.setPrefs);
router.get('/:id', protect, ctrl.detail);
router.post('/:id/refresh', protect, searchLimiter, ctrl.refresh);
router.post('/:id/save', protect, ctrl.save);
router.delete('/:id/save', protect, ctrl.unsave);

module.exports = router;
