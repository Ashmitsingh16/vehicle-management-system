const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  lat: { type: Number, required: true, min: -90, max: 90 },
  lng: { type: Number, required: true, min: -180, max: 180 },
  lastUpdated: { type: Date, required: true },
  expiresAt: { type: Date, required: true, expires: 0 }
});
schema.index({ company: 1, user: 1 }, { unique: true });
module.exports = mongoose.model('TrackingSession', schema);
