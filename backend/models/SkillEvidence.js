const mongoose = require('mongoose');

/**
 * SkillEvidence — durable evidence records created by the backend (never by a frontend flag).
 * Assessment evidence is read directly from AssessmentResult; resume claims from Resume.
 *   verification : score from a server-graded SkillVerification  (counts as *demonstrated* if passed)
 *   course       : course completion recorded                    (counts as *partial* only)
 *   practical    : user-submitted project/practical link         (counts as *partial* only — not machine-verifiable)
 */
const skillEvidenceSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  skillId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', required: true },
  journeyId: { type: mongoose.Schema.Types.ObjectId, ref: 'CareerJourney', default: null },
  type:      { type: String, enum: ['verification', 'course', 'practical'], required: true },
  refId:     { type: String, required: true },          // activityId / verificationId — idempotency
  score:     { type: Number, default: null },
  passed:    { type: Boolean, default: null },
  url:       { type: String, default: '' },
  note:      { type: String, default: '' }
}, { timestamps: true });

skillEvidenceSchema.index({ userId: 1, type: 1, refId: 1 }, { unique: true });
skillEvidenceSchema.index({ userId: 1, skillId: 1 });

module.exports = mongoose.model('SkillEvidence', skillEvidenceSchema);
