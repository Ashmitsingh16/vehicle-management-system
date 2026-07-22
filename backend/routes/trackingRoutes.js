const express = require('express');
const router = express.Router();

// In-memory store for active tracking sessions (for demo purposes)
// In production, you'd use Redis or a similar in-memory datastore
const activeTracking = new Map();

// @route   POST /api/tracking/start
// @desc    Start tracking a user/vehicle
// @access  Public
router.post('/start', (req, res) => {
  const { id, lat, lng } = req.body;
  if (!id || !lat || !lng) {
    return res.status(400).json({ msg: 'Missing tracking data' });
  }

  activeTracking.set(id, { lat, lng, lastUpdated: Date.now() });
  res.json({ msg: 'Tracking started', data: activeTracking.get(id) });
});

// @route   POST /api/tracking/update
// @desc    Update location
// @access  Public
router.post('/update', (req, res) => {
  const { id, lat, lng } = req.body;
  if (!id || !lat || !lng) {
    return res.status(400).json({ msg: 'Missing tracking data' });
  }

  if (activeTracking.has(id)) {
    activeTracking.set(id, { lat, lng, lastUpdated: Date.now() });
    res.json({ msg: 'Location updated', data: activeTracking.get(id) });
  } else {
    res.status(404).json({ msg: 'Tracking session not found. Please start tracking first.' });
  }
});

// @route   POST /api/tracking/stop
// @desc    Stop tracking
// @access  Public
router.post('/stop', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ msg: 'Missing ID' });
  }

  if (activeTracking.has(id)) {
    activeTracking.delete(id);
    res.json({ msg: 'Tracking stopped' });
  } else {
    res.status(404).json({ msg: 'Tracking session not found' });
  }
});

// @route   GET /api/tracking/active
// @desc    Get all active tracking sessions
// @access  Public
router.get('/active', (req, res) => {
  const sessions = Object.fromEntries(activeTracking);
  res.json(sessions);
});

module.exports = router;
