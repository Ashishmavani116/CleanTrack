const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Phone is required'],
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  points: {
    type: Number,
    default: 0
  },
  level: {
    type: Number,
    default: 1
  },
  badges: [{
    name: String,
    icon: String,
    earnedAt: { type: Date, default: Date.now }
  }],
  totalReports: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before save
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Award points and update level/badges
userSchema.methods.awardPoints = async function(points, reason) {
  this.points += points;
  this.totalReports += 1;

  // Level up every 200 points
  this.level = Math.floor(this.points / 200) + 1;

  // Badge awards
  const badges = [];
  if (this.totalReports === 1) badges.push({ name: 'First Report', icon: '🌱' });
  if (this.totalReports === 5) badges.push({ name: 'Active Citizen', icon: '⚡' });
  if (this.totalReports === 10) badges.push({ name: 'Top Reporter', icon: '🏆' });
  if (this.totalReports === 25) badges.push({ name: 'City Hero', icon: '🦸' });
  if (this.points >= 500) badges.push({ name: 'Eco Warrior', icon: '🔥' });

  badges.forEach(b => {
    const already = this.badges.find(x => x.name === b.name);
    if (!already) this.badges.push(b);
  });

  await this.save();
};

module.exports = mongoose.model('User', userSchema);
