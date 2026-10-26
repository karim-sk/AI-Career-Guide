const mongoose = require('mongoose');

/**
 * JobRecommendation — a *cached* match result for (user, journey, job).
 * `profileHash` fingerprints the candidate evidence + weights used; if the evidence changes the
 * hash changes and the record is treated as stale and recomputed.
 */
const jobRecommendationSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  journeyId: { type: mongoose.Schema.Types.ObjectId, ref: 'CareerJourney', default: null },
  jobId:     { type: mongoose.Schema.Types.ObjectId, ref: 'JobListing', required: true },

  score:       { type: Number, min: 0, max: 100, required: true },
  confidence:  { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  breakdown:   { type: mongoose.Schema.Types.Mixed, default: {} },
  skillBreakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
  warnings:    { type: [String], default: [] },
  explanation: { type: String, default: '' },

  profileHash:   { type: String, required: true },
  weightsVersion:{ type: String, default: 'v1' },
  computedAt:    { type: Date, default: Date.now }
}, { timestamps: true });

jobRecommendationSchema.index({ userId: 1, journeyId: 1, jobId: 1 }, { unique: true });
jobRecommendationSchema.index({ userId: 1, journeyId: 1, score: -1 });

module.exports = mongoose.model('JobRecommendation', jobRecommendationSchema);
