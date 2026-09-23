const express = require('express');
const router = express.Router();
const { authIpLimiter, authAccountLimiter, resetAccountLimiter } = require('../middleware/rateLimit');
router.use(['/login', '/register', '/reset-password'], authIpLimiter, authAccountLimiter);
router.use('/forgot-password', authIpLimiter, resetAccountLimiter);
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const registerCompany = require('../services/registerCompany');
const { sendMail } = require('../utils/mailer');

const auth = require('../middleware/auth');
const { getJwtSecret } = require('../config/jwt');

function signToken(user) {
  const payload = { tokenVersion: user.tokenVersion || 0, user: { id: user.id, companyId: user.company._id || user.company, role: user.role } };
  return jwt.sign(
    payload,
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
}

// @route   POST /api/auth/register
// @desc    Register a new company + its first (admin) user
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { companyName, name, phone, password } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim() : '';

    if (![companyName, name, phone].every(value => typeof value === 'string' && value.trim()) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ msg: 'Company, name, phone, valid email and a password of at least 6 characters are required' });
    }

    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: 'An account with this email already exists' });
    }

    const registration = await registerCompany({ companyName, name, email, phone, password });
    user = registration.user;
    const company = registration.company;

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      company: { id: company.id, name: company.name }
    });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ msg: 'An account with this email already exists' });
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    if (!email || typeof password !== 'string') return res.status(400).json({ msg: 'Email and password are required' });

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
    const { name, phone, password, role } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    if (![name, phone].every(value => typeof value === 'string' && value.trim()) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ msg: 'Name, phone, valid email and a password of at least 6 characters are required' });
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
    if (typeof email !== 'string' || !email.trim()) return res.status(400).json({ msg: 'Email is required' });

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
    if (typeof password !== 'string' || password.length < 6) {
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
