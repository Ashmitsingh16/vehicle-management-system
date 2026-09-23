const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const TrackingSession = require('../models/TrackingSession');
router.use(auth);

function ownSession(req, res, next) {
  if (req.body.id !== undefined && req.body.id !== req.userId) {
    return res.status(403).json({ msg: 'You can only change your own tracking session' });
  }
  next();
}
function coordinates(req, res, next) {
  const { lat, lng } = req.body;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ msg: 'Valid numeric latitude and longitude are required' });
  }
  next();
}
function scope(req) { return { user: req.userId, company: req.companyId }; }
function position(req) {
  return { lat: req.body.lat, lng: req.body.lng, lastUpdated: new Date(), expiresAt: new Date(Date.now() + 60000) };
}
router.post('/start', ownSession, coordinates, async (req, res, next) => {
  try {
    const session = await TrackingSession.findOneAndUpdate(scope(req), { $set: position(req) },
      { upsert: true, new: true, runValidators: true });
    res.json({ msg: 'Tracking started', data: session });
  } catch (err) { next(err); }
});
router.post('/update', ownSession, coordinates, async (req, res, next) => {
  try {
    const session = await TrackingSession.findOneAndUpdate(
      { ...scope(req), expiresAt: { $gt: new Date() } }, { $set: position(req) }, { new: true, runValidators: true });
    if (!session) return res.status(404).json({ msg: 'Tracking session expired. Start tracking again.' });
    res.json({ msg: 'Location updated', data: session });
  } catch (err) { next(err); }
});
router.post('/stop', ownSession, async (req, res, next) => {
  try {
    await TrackingSession.deleteOne(scope(req));
    res.json({ msg: 'Tracking stopped' });
  } catch (err) { next(err); }
});
router.get('/active', async (req, res, next) => {
  try {
    const sessions = await TrackingSession.find({ company: req.companyId, expiresAt: { $gt: new Date() } });
    res.json(Object.fromEntries(sessions.map(s => [String(s.user), {
      lat: s.lat, lng: s.lng, lastUpdated: new Date(s.lastUpdated).getTime()
    }])));
  } catch (err) { next(err); }
});
module.exports = router;
