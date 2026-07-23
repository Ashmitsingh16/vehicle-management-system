const express = require('express');
const router = express.Router();
const Emergency = require('../models/Emergency');
const auth = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');

router.use(auth);

// @route   POST /api/emergency
// @desc    Trigger an emergency alert
// @access  Private
router.post('/', async (req, res) => {
  try {
    const { type, severity, description, location, recipientEmail } = req.body;

    const newEmergency = new Emergency({
      type,
      severity,
      description,
      location,
      user: req.userId,
      company: req.companyId
    });

    const emergency = await newEmergency.save();

    const mapsUrl = location && location.lat && location.lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`
      : 'Location not available';

    const htmlContent = `
        <h2>🚨 Vehicle Emergency Alert</h2>
        <p><strong>Type:</strong> ${type}</p>
        <p><strong>Severity:</strong> ${severity}</p>
        <p><strong>Description:</strong> ${description || 'No description provided.'}</p>
        <hr />
        <h3>📍 Location Details</h3>
        ${mapsUrl !== 'Location not available'
          ? `<p>The user has shared their real-time location.</p>
             <a href="${mapsUrl}" style="background-color:#ff4757;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;font-weight:bold;">Get Directions to User</a>
             <br /><br />
             <p><small>Coordinates: ${location.lat}, ${location.lng}</small></p>`
          : '<p>Location coordinates are not available.</p>'}
      `;

    if (recipientEmail) {
      try {
        await sendMail({
          to: recipientEmail,
          subject: `🚨 EMERGENCY ALERT: ${type.toUpperCase()} (${severity.toUpperCase()})`,
          html: htmlContent
        });
        console.log('Emergency email sent successfully!');
      } catch (emailErr) {
        console.error('Failed to send emergency email:', emailErr.message);
      }
    } else {
      console.log('No recipient email provided. Skipping email alert.');
    }

    console.log('🚨 EMERGENCY TRIGGERED:', emergency);

    res.json(emergency);
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
    const emergencies = await Emergency.find({ company: req.companyId }).sort({ createdAt: -1 });
    res.json(emergencies);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/emergency/:id/resolve
// @desc    Resolve an emergency
// @access  Private
router.put('/:id/resolve', async (req, res) => {
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
