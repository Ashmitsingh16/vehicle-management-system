const express = require('express');
const router = express.Router();
const Emergency = require('../models/Emergency');
const nodemailer = require('nodemailer');

// @route   POST /api/emergency
// @desc    Trigger an emergency alert
// @access  Public
router.post('/', async (req, res) => {
  try {
    const { type, severity, description, location, recipientEmail, userId } = req.body;

    const newEmergency = new Emergency({
      type,
      severity,
      description,
      location,
      user: userId
    });

    const emergency = await newEmergency.save();
    
    // Send email using Nodemailer
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.EMAIL_HOST || 'smtp.gmail.com',
          port: process.env.EMAIL_PORT || 587,
          secure: process.env.EMAIL_PORT == 465,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });

        const mapsUrl = location && location.lat && location.lng 
          ? `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}` 
          : 'Location not available';

        const mailOptions = {
          from: `"Vehicle Emergency Alert" <${process.env.EMAIL_USER}>`,
          to: recipientEmail || process.env.EMAIL_USER, // Sending to user inputted email, fallback to self
          subject: `🚨 EMERGENCY ALERT: ${type.toUpperCase()} (${severity.toUpperCase()})`,
          html: `
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
          `
        };

        await transporter.sendMail(mailOptions);
        console.log('Emergency email sent successfully!');
      } catch (emailErr) {
        console.error('Failed to send email:', emailErr);
      }
    } else {
      console.log('Email credentials not configured in .env. Skipping email alert.');
    }

    console.log('🚨 EMERGENCY TRIGGERED:', emergency);

    res.json(emergency);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/emergency
// @desc    Get all active emergencies
// @access  Public
router.get('/', async (req, res) => {
  try {
    const emergencies = await Emergency.find().sort({ createdAt: -1 });
    res.json(emergencies);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/emergency/:id/resolve
// @desc    Resolve an emergency
// @access  Public
router.put('/:id/resolve', async (req, res) => {
  try {
    const emergency = await Emergency.findById(req.params.id);
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
