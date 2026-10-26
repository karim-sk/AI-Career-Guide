const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/roadmapController');
const { protect } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Job-plan generation calls the LLM → keep it bounded per client
const genLimiter = rateLimit({ windowMs: 60 * 1000, max: 6, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many plan requests. Please wait a minute.' } });

// NOTE: specific named routes MUST come before parameterized routes
router.post('/generate',                                protect, ctrl.generateRoadmap);
router.post('/recalculate',                             protect, ctrl.recalculateRoadmap);
router.post('/generate-for-job',                         protect, genLimiter, ctrl.generateJobRoadmap);
router.get('/job',                                      protect, ctrl.getJobRoadmap);
router.get('/by-id/:roadmapId',                         protect, ctrl.getRoadmapById);
router.get('/all',                                      protect, ctrl.getAllRoadmaps);
router.get('/',                                         protect, ctrl.getRoadmap);
router.put('/progress',                                 protect, ctrl.updateProgress);

// Topic-level completion
router.patch('/:roadmapId/topic/:topicId',              protect, ctrl.updateTopicCompletion);

// Exercise-level completion (new)
router.patch('/:roadmapId/exercise/:exerciseId',        protect, ctrl.updateExerciseCompletion);

module.exports = router;
