const mongoose = require('mongoose');

/**
 * JobListing — normalized copy of a vacancy returned by a permitted provider API.
 * Acts as the cache/dedup store. Nothing here is invented: every field comes from the provider
 * (or is derived deterministically from provider text). `isSample` marks local test fixtures.
 */
const jobSkillSchema = new mongoose.Schema({
  skillId: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', required: true },
  name:    { type: String, required: true }
}, { _id: false });

const jobListingSchema = new mongoose.Schema({
  provider:   { type: String, required: true },
  externalId: { type: String, required: true },
  title:      { type: String, required: true, trim: true },
  company:    { type: String, default: '' },
  description:{ type: String, default: '' },          // plain text, truncated
  location:   { type: String, default: '' },
  workMode:   { type: String, enum: ['remote', 'hybrid', 'onsite', 'unknown'], default: 'unknown' },
  employmentType: { type: String, default: '' },      // full-time | part-time | contract | internship | ''
  experience: {
    minYears: { type: Number, default: null },
    maxYears: { type: Number, default: null },
    level:    { type: String, enum: ['intern', 'junior', 'mid', 'senior', 'lead', 'unknown'], default: 'unknown' }
  },
  educationRequirement: { type: String, enum: ['none', 'bachelor', 'master', 'phd', 'unknown'], default: 'unknown' },
  requiredSkills:  { type: [jobSkillSchema], default: [] },
  preferredSkills: { type: [jobSkillSchema], default: [] },
  tags:       { type: [String], default: [] },
  salary: {
    min: { type: Number, default: null }, max: { type: Number, default: null },
    currency: { type: String, default: '' }, period: { type: String, default: '' }
  },
  postedAt:   { type: Date, default: null },
  applyUrl:   { type: String, default: null },         // real employer / provider URL, or null (samples)
  sourceUrl:  { type: String, default: null },
  dedupeKey:  { type: String, index: true },
  isSample:   { type: Boolean, default: false },
  status:     { type: String, enum: ['active', 'expired'], default: 'active' },
  firstSeenAt:   { type: Date, default: Date.now },
  lastSeenAt:    { type: Date, default: Date.now },
  lastFetchedAt: { type: Date, default: Date.now }
}, { timestamps: true });

jobListingSchema.index({ provider: 1, externalId: 1 }, { unique: true });
jobListingSchema.index({ lastSeenAt: -1 });

module.exports = mongoose.model('JobListing', jobListingSchema);
