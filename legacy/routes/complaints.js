const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Complaint = require('../models/Complaint');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');

// Multer config for photo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../public/uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// POST /api/complaints — submit new complaint (user)
router.post('/', protect, upload.single('photo'), async (req, res) => {
  try {
    const { area, address, landmark, wasteType, description, priority } = req.body;

    // Duplicate detection: same area + same wasteType in last 48 hrs
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const duplicate = await Complaint.findOne({
      area,
      wasteType,
      status: { $ne: 'Resolved' },
      createdAt: { $gte: twoDaysAgo }
    });

    const complaintData = {
      user: req.user._id,
      userName: req.user.name,
      userPhone: req.user.phone,
      userEmail: req.user.email,
      area, address, landmark, wasteType, description,
      priority: priority || 'Medium',
      isDuplicate: !!duplicate,
      duplicateOf: duplicate ? duplicate._id : null,
      statusHistory: [{ status: 'Pending', changedBy: req.user.name, note: 'Complaint submitted' }]
    };

    if (req.file) {
      complaintData.photo = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: '/uploads/' + req.file.filename
      };
    }

    const complaint = await Complaint.create(complaintData);

    // Award points to user
    await req.user.awardPoints(50, 'complaint_submitted');

    res.status(201).json({
      success: true,
      message: duplicate
        ? 'Complaint submitted and merged with existing report. +50 points!'
        : 'Complaint submitted successfully! +50 points!',
      complaint,
      isDuplicate: !!duplicate,
      pointsAwarded: 50,
      newPoints: req.user.points + 50
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/complaints/my — get logged-in user's complaints
router.get('/my', protect, async (req, res) => {
  try {
    const complaints = await Complaint.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, count: complaints.length, complaints });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/complaints — admin: get all complaints with filters
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const { status, priority, area, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (area) filter.area = { $regex: area, $options: 'i' };

    const skip = (page - 1) * limit;
    const [complaints, total] = await Promise.all([
      Complaint.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Complaint.countDocuments(filter)
    ]);

    res.json({ success: true, total, page: Number(page), complaints });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/complaints/:id — get single complaint (admin or owner)
router.get('/:id', protect, async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });

    const isOwner = complaint.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ success: false, message: 'Access denied.' });

    res.json({ success: true, complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/complaints/:id/status — admin updates status
router.patch('/:id/status', protect, adminOnly, async (req, res) => {
  try {
    const { status, assignedWorker, adminNotes } = req.body;
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });

    complaint.status = status;
    if (assignedWorker) complaint.assignedWorker = assignedWorker;
    if (adminNotes) complaint.adminNotes = adminNotes;
    if (status === 'Resolved') complaint.resolvedAt = new Date();

    complaint.statusHistory.push({
      status,
      changedBy: req.user.name,
      note: adminNotes || `Status updated to ${status}`
    });

    await complaint.save();
    res.json({ success: true, message: 'Status updated.', complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/complaints/admin/stats — MIS dashboard stats
router.get('/admin/stats', protect, adminOnly, async (req, res) => {
  try {
    const [total, pending, inProgress, resolved, byArea, byType, byPriority, recent] = await Promise.all([
      Complaint.countDocuments(),
      Complaint.countDocuments({ status: 'Pending' }),
      Complaint.countDocuments({ status: 'In Progress' }),
      Complaint.countDocuments({ status: 'Resolved' }),
      Complaint.aggregate([{ $group: { _id: '$area', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 7 }]),
      Complaint.aggregate([{ $group: { _id: '$wasteType', count: { $sum: 1 } } }]),
      Complaint.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
      Complaint.find().sort({ createdAt: -1 }).limit(7).select('complaintId area wasteType priority status createdAt userName')
    ]);

    // Last 7 days trend
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const start = new Date(d.setHours(0,0,0,0));
      const end = new Date(d.setHours(23,59,59,999));
      const count = await Complaint.countDocuments({ createdAt: { $gte: start, $lte: end } });
      trend.push({ date: start.toLocaleDateString('en-IN', { weekday: 'short' }), count });
    }

    res.json({
      success: true,
      stats: { total, pending, inProgress, resolved, resolutionRate: total > 0 ? Math.round((resolved / total) * 100) : 0 },
      byArea, byType, byPriority, trend, recent
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/complaints/admin/leaderboard
router.get('/admin/leaderboard', protect, async (req, res) => {
  try {
    const leaders = await User.find({ role: 'user' })
      .sort({ points: -1 }).limit(10)
      .select('name points level totalReports badges');
    res.json({ success: true, leaderboard: leaders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
