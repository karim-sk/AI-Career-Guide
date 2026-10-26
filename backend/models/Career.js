const mongoose = require('mongoose');

const careerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Career title is required'],
    unique: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  icon: {
    type: String,
    default: '🎯'
  },
  requiredSkills: [{
    skillId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Skill',
      required: true
    },
    requiredLevel: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    priority: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low'],
      default: 'medium'
    },
    category: {
      type: String,
      default: ''
    }
  }],
  avgSalary: {
    type: String,
    default: ''
  },
  jobDemand: {
    type: String,
    enum: ['very-high', 'high', 'medium', 'low'],
    default: 'high'
  },
  family: { type: String, default: '' },          // e.g. 'Web', 'Cloud & DevOps', 'Data & AI'
  aliases: { type: [String], default: [] },       // alternative job titles used for job matching
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Career', careerSchema);
