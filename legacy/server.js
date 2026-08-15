require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files (photos)
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Serve User portal at /
app.use('/user', express.static(path.join(__dirname, 'public/user')));

// Serve Admin portal at /admin-panel
app.use('/admin-panel', express.static(path.join(__dirname, 'public/admin')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/complaints', require('./routes/complaints'));

// Root redirect
app.get('/', (req, res) => res.redirect('/user'));

// MongoDB connect + seed admin
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ MongoDB connected');

    // Seed default admin if none exists
    const User = require('./models/User');
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      await User.create({
        name: 'Admin',
        email: 'admin@cleantrack.com',
        phone: '9999999999',
        password: 'admin123',
        role: 'admin'
      });
      console.log('✅ Default admin created: admin@cleantrack.com / admin123');
    }

    app.listen(PORT, () => console.log(`🚀 CleanTrack running at http://localhost:${PORT}`));
  })
  .catch(err => console.error('❌ MongoDB error:', err.message));
