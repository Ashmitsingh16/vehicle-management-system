const mongoose = require('mongoose');

const EmergencySchema = new mongoose.Schema({
  type: { 
    type: String, 
    required: true,
    enum: ['accident', 'breakdown', 'medical', 'security', 'fire', 'other']
  },
  severity: { 
    type: String, 
    required: true,
    enum: ['low', 'medium', 'high', 'critical']
  },
  description: { type: String },
  location: {
    lat: { type: Number },
    lng: { type: Number },
    address: { type: String }
  },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Optional, if logged in
  status: {
    type: String,
    enum: ['active', 'resolved', 'false_alarm'],
    default: 'active'
  },
  createdAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date }
});

module.exports = mongoose.model('Emergency', EmergencySchema);
