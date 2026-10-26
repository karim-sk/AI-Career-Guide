const mongoose = require('mongoose');

const skillSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Skill name is required'],
    unique: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['Frontend', 'Backend', 'Database', 'Language', 'DevOps', 'AI/ML', 'Security', 'Fundamentals', 'Blockchain', 'Cloud',
           'Testing', 'Mobile', 'Data', 'Architecture', 'Tools']
  },
  description: {
    type: String,
    default: ''
  },
  icon: {
    type: String,
    default: '💡'
  },
  // ── Catalog metadata (added for resume / job matching) ───────────────────
  slug:          { type: String, trim: true, lowercase: true, index: true },
  aliases:       { type: [String], default: [] },       // synonyms used by the normalizer
  ambiguous:     { type: Boolean, default: false },     // short/common word: only matched in list context
  relatedSkills: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }],
  prerequisites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }],
  resources: [{
    title: String, url: String,
    type: { type: String, enum: ['documentation', 'course', 'tutorial', 'video', 'practice', 'book', 'other'], default: 'documentation' }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Skill', skillSchema);
