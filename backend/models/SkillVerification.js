const mongoose = require('mongoose');

/** Server-graded mini-assessment used to verify one skill. Correct answers never leave the server before submit. */
const skillVerificationSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  skillId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', required: true },
  journeyId:  { type: mongoose.Schema.Types.ObjectId, ref: 'CareerJourney', default: null },
  activityId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningActivity', default: null },
  jobId:      { type: mongoose.Schema.Types.ObjectId, ref: 'JobListing', default: null },

  status: { type: String, enum: ['in-progress', 'passed', 'failed'], default: 'in-progress' },
  questions: [{
    questionId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    selectedAnswer: { type: Number, default: null },
    isCorrect:      { type: Boolean, default: null }
  }],
  score:         { type: Number, default: null },     // 0-100
  passThreshold: { type: Number, default: 70 },
  completedAt:   { type: Date, default: null },
  startedAt:     { type: Date, default: Date.now }
}, { timestamps: true });

skillVerificationSchema.index({ userId: 1, skillId: 1, status: 1 });

module.exports = mongoose.model('SkillVerification', skillVerificationSchema);
