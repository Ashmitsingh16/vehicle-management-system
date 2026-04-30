const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Middleware to protect routes (placeholder, you should implement proper JWT verification)
const auth = (req, res, next) => {
  // Simple pass-through for now, implement proper JWT verification
  next();
};

// @route   GET /api/users
// @desc    Get all users
// @access  Public (should be protected in prod)
router.get('/', async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/users
// @desc    Add or return existing user (Dashboard)
// @access  Public
router.post('/', async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    let user = await User.findOne({ email });
    if (user) {
      // If user exists, update their details optionally or just return them
      user.name = name || user.name;
      user.phone = phone || user.phone;
      await user.save();
      return res.json(user);
    }
    user = new User({
      name,
      email,
      phone,
      password: 'defaultPassword123!' // required by the model
    });
    await user.save();
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ msg: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') return res.status(404).json({ msg: 'User not found' });
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/users/:id/contacts
// @desc    Add emergency contact to user
// @access  Private
router.post('/:id/contacts', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    user.emergencyContacts.push(req.body);
    await user.save();
    res.json(user.emergencyContacts);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete user
// @access  Public
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });
    res.json({ msg: 'User removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
