const mongoose = require('mongoose');

/**
 * LearningActivity — a course / tutorial / task the user works on.
 * Completion and verification are SEPARATE:
 *   status             : not_started → in_progress → completed
 *   verificationStatus : not_required | unavailable | pending | verified | failed
 * Completing an activity never sets verificationStatus to "verified"; only a backend-graded
 * SkillVerification (or nothing) can do that.
 */
const learningActivitySchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  journeyId: { type: mongoose.Schema.Types.ObjectId, ref: 'CareerJourney', default: null },
  skillId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', default: null },
  skillName: { type: String, default: '' },
  jobId:     { type: mongoose.Schema.Types.ObjectId, ref: 'JobListing', default: null },
  roadmapId: { type: mongoose.Schema.Types.ObjectId, ref: 'Roadmap', default: null },
  topicId:   { type: mongoose.Schema.Types.ObjectId, default: null },

  title: { type: String, required: true, trim: true, maxlength: 200 },
  type:  { type: String, enum: ['course', 'documentation', 'tutorial', 'exercise', 'project', 'certification'], default: 'course' },
  url:   { type: String, default: '' },

  status:     { type: String, enum: ['not_started', 'in_progress', 'completed'], default: 'not_started' },
  startedAt:  { type: Date, default: null },
  completedAt:{ type: Date, default: null },
  certificateUrl: { type: String, default: '' },
  notes:      { type: String, default: '', maxlength: 1000 },

  verificationStatus: { type: String, enum: ['not_required', 'unavailable', 'pending', 'verified', 'failed'], default: 'not_required' },
  verificationId:     { type: mongoose.Schema.Types.ObjectId, ref: 'SkillVerification', default: null },
  verifiedAt:         { type: Date, default: null },

  // Idempotency key — see learningService.activityKey()
  activityKey: { type: String, required: true }
}, { timestamps: true });

learningActivitySchema.index({ userId: 1, activityKey: 1 }, { unique: true });
learningActivitySchema.index({ userId: 1, journeyId: 1, updatedAt: -1 });

module.exports = mongoose.model('LearningActivity', learningActivitySchema);
