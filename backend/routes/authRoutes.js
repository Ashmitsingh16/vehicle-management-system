const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Company = require('../models/Company');
const { sendMail } = require('../utils/mailer');

const auth = require('../middleware/auth');

function signToken(user) {
  const payload = { user: { id: user.id, companyId: user.company, role: user.role } };
  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'secret',
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
}

// @route   POST /api/auth/register
// @desc    Register a new company + its first (admin) user
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { companyName, name, email, phone, password } = req.body;

    if (!companyName || !name || !email || !password) {
      return res.status(400).json({ msg: 'companyName, name, email and password are required' });
    }

    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: 'An account with this email already exists' });
    }

    const company = await Company.create({ name: companyName });

    user = new User({ name, email, phone, password, company: company._id, role: 'admin' });
    await user.save();

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      company: { id: company.id, name: company.name }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).populate('company', 'name');
    if (!user) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      company: { id: user.company._id, name: user.company.name }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST /api/auth/team
// @desc    Admin adds another login user (e.g. a driver) to their own company
// @access  Private (admin only)
router.post('/team', auth, async (req, res) => {
  try {
    if (req.companyRole !== 'admin') {
      return res.status(403).json({ msg: 'Only a company admin can add team members' });
    }
    const { name, email, phone, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ msg: 'name, email and password are required' });
    }

    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: 'An account with this email already exists' });
    }

    user = new User({
      name, email, phone, password,
      company: req.companyId,
      role: role === 'admin' ? 'admin' : 'member'
    });
    await user.save();

    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Email a password reset link (valid 1 hour). Always returns a
//          generic success message so we don't reveal which emails exist.
// @access  Public
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const genericMsg = { msg: 'If an account exists for that email, a reset link has been sent.' };
  try {
    if (!email) return res.status(400).json({ msg: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.json(genericMsg); // don't leak whether the email exists

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/?resetToken=${rawToken}`;

    try {
      await sendMail({
        to: user.email,
        subject: 'Reset your Vehicle Management System password',
        html: `
          <p>Hi ${user.name},</p>
          <p>Click the link below to reset your password. This link expires in 1 hour.</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>If you didn't request this, you can safely ignore this email.</p>
        `
      });
    } catch (mailErr) {
      console.error('Failed to send reset email:', mailErr.message);
      // Don't fail the request just because email isn't configured yet —
      // still clear the token so it doesn't linger unused, and let the admin know.
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();
      return res.status(500).json({ msg: 'Could not send reset email. Email sending may not be configured yet.' });
    }

    res.json(genericMsg);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST /api/auth/reset-password/:token
// @desc    Set a new password using a valid reset token
// @access  Public
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ msg: 'Password must be at least 6 characters' });
    }

    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ msg: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    user.password = password; // pre-save hook hashes it
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ msg: 'Password updated successfully. You can now log in.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
