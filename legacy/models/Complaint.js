const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  complaintId: {
    type: String,
    unique: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: String,
  userPhone: String,
  userEmail: String,

  area: {
    type: String,
    required: [true, 'Area is required']
  },
  address: {
    type: String,
    required: [true, 'Address is required']
  },
  landmark: String,

  wasteType: {
    type: String,
    enum: ['Plastic / Dry Waste', 'Organic / Wet Waste', 'Mixed Waste', 'Construction Debris', 'Hazardous Waste'],
    required: true
  },

  description: {
    type: String,
    required: [true, 'Description is required']
  },

  priority: {
    type: String,
    enum: ['High', 'Medium', 'Low'],
    default: 'Medium'
  },

  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Resolved'],
    default: 'Pending'
  },

  photo: {
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    path: String
  },

  assignedWorker: String,
  adminNotes: String,

  isDuplicate: {
    type: Boolean,
    default: false
  },
  duplicateOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Complaint',
    default: null
  },

  resolvedAt: Date,
  statusHistory: [{
    status: String,
    changedAt: { type: Date, default: Date.now },
    changedBy: String,
    note: String
  }],

  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Auto-generate complaint ID
complaintSchema.pre('save', async function(next) {
  if (!this.complaintId) {
    const count = await mongoose.model('Complaint').countDocuments();
    this.complaintId = 'CT' + String(count + 1001).padStart(4, '0');
  }
  next();
});

// Auto-assign priority based on area keywords
complaintSchema.pre('save', function(next) {
  const highPriorityAreas = ['hospital', 'school', 'market', 'railway', 'station', 'bus stand', 'midc'];
  const areaLower = (this.area + ' ' + this.address).toLowerCase();
  const isHighPriority = highPriorityAreas.some(k => areaLower.includes(k));
  if (isHighPriority && this.isNew) this.priority = 'High';
  next();
});

module.exports = mongoose.model('Complaint', complaintSchema);
