const mongoose = require('mongoose');

/**
 * Resume — one document per user. Holds the *extracted, structured* information
 * plus secure file metadata. Binary content lives in GridFS (see services/resumeStorage.js),
 * never inside this document. Contact details (email/phone/address) are NOT extracted or stored.
 */
const resumeSkillSchema = new mongoose.Schema({
  skillId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', required: true },
  name:      { type: String, required: true },
  // Where the skill was seen: skills_section | experience | project | certification | summary
  sources:   { type: [String], default: [] },
  // listed  = only in a skills list (a claim)
  // applied = also appears inside a project / experience description (claim with context)
  evidence:  { type: String, enum: ['listed', 'applied'], default: 'listed' },
  userAdded: { type: Boolean, default: false }
}, { _id: false });

const resumeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

  originalName: { type: String, default: '' },
  mimeType:     { type: String, default: '' },
  fileType:     { type: String, enum: ['pdf', 'docx'], required: true },
  size:         { type: Number, default: 0 },
  sha256:       { type: String, default: '' },
  storage: {
    provider: { type: String, enum: ['gridfs', 'none'], default: 'none' },
    fileId:   { type: mongoose.Schema.Types.ObjectId, default: null }
  },

  parseStatus: { type: String, enum: ['parsed', 'partial', 'failed'], default: 'parsed' },
  parseError:  { type: String, default: '' },

  fullName: { type: String, default: '' },
  education: [{
    degree: String, institution: String, raw: String,
    level:  { type: String, enum: ['highschool', 'diploma', 'bachelor', 'master', 'phd', 'other'], default: 'other' }
  }],
  experience: [{
    title: String, company: String, durationText: String,
    years: { type: Number, default: 0 },
    isInternship: { type: Boolean, default: false },
    skills: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }]
  }],
  totalExperienceYears: { type: Number, default: 0 },
  projects: [{
    name: String, description: String,
    skills: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }]
  }],
  certifications: { type: [String], default: [] },
  achievements:   { type: [String], default: [] },
  skills:         { type: [resumeSkillSchema], default: [] },
  unmappedSkills: { type: [String], default: [] },   // terms in the skills section not in our catalog

  reviewStatus: { type: String, enum: ['pending', 'confirmed'], default: 'pending' },
  reviewedAt:   { type: Date, default: null },
  uploadedAt:   { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Resume', resumeSchema);
