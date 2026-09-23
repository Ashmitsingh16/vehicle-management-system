const express = require('express');
const router = express.Router();
const { notificationLimiter, notificationIpLimiter } = require('../middleware/rateLimit');
const Emergency = require('../models/Emergency');
const auth = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');

router.use(auth);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// @route   POST /api/emergency
// @desc    Trigger an emergency alert
// @access  Private
router.post('/', notificationIpLimiter, notificationLimiter, async (req, res) => {
  try {
    const { type, severity, description, location, recipientEmail } = req.body;

    if (!['accident', 'breakdown', 'medical', 'security', 'fire', 'other'].includes(type) ||
        !['low', 'medium', 'high', 'critical'].includes(severity) ||
        (description !== undefined && typeof description !== 'string') ||
        (recipientEmail && (typeof recipientEmail !== 'string' || /[\r\n]/.test(recipientEmail)))) {
      return res.status(400).json({ msg: 'Invalid emergency details' });
    }
    if (location != null && (!Number.isFinite(location.lat) || !Number.isFinite(location.lng) ||
        Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180)) {
      return res.status(400).json({ msg: 'Invalid location coordinates' });
    }

    if (recipientEmail && (recipientEmail.length > 2000 || recipientEmail.split(',').length > 20)) {
      return res.status(400).json({ msg: 'Send to at most 20 email recipients' });
    }

    const newEmergency = new Emergency({
      type,
      severity,
      description,
      location,
      user: req.userId,
      company: req.companyId
    });

    const emergency = await newEmergency.save();

    const mapsUrl = location && Number.isFinite(location.lat) && Number.isFinite(location.lng)
      ? `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`
      : 'Location not available';

    const htmlContent = `
        <h2>🚨 Vehicle Emergency Alert</h2>
        <p><strong>Type:</strong> ${type}</p>
        <p><strong>Severity:</strong> ${severity}</p>
        <p><strong>Description:</strong> ${escapeHtml(description || 'No description provided.')}</p>
        <hr />
        <h3>📍 Location Details</h3>
        ${mapsUrl !== 'Location not available'
          ? `<p>The user has shared their real-time location.</p>
             <a href="${mapsUrl}" style="background-color:#ff4757;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;font-weight:bold;">Get Directions to User</a>
             <br /><br />
             <p><small>Coordinates: ${location.lat}, ${location.lng}</small></p>`
          : '<p>Location coordinates are not available.</p>'}
      `;

    let notificationStatus = 'not_requested';
    if (recipientEmail) {
      try {
        await sendMail({
          to: recipientEmail,
          subject: `🚨 EMERGENCY ALERT: ${type.toUpperCase()} (${severity.toUpperCase()})`,
          html: htmlContent
        });
        notificationStatus = 'accepted';
      } catch (emailErr) {
        notificationStatus = 'failed';
        console.error('Failed to send emergency email:', emailErr.message);
      }
    } else {
      console.log('No recipient email provided. Skipping email alert.');
    }

    emergency.notificationStatus = notificationStatus;
    await emergency.save();
    res.status(201).json(emergency);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/emergency
// @desc    Get all active emergencies for the logged-in company
// @access  Private
router.get('/', async (req, res) => {
  try {
    const emergencies = await Emergency.find({ company: req.companyId, status: 'active' }).sort({ createdAt: -1 });
    res.json(emergencies);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/emergency/:id/resolve
// @desc    Resolve an emergency
// @access  Private
router.put('/:id/resolve', require('../middleware/adminOnly'), async (req, res) => {
  try {
    const emergency = await Emergency.findOne({ _id: req.params.id, company: req.companyId });
    if (!emergency) return res.status(404).json({ msg: 'Emergency not found' });

    emergency.status = 'resolved';
    emergency.resolvedAt = Date.now();
    await emergency.save();

    res.json(emergency);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
