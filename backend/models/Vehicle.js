const mongoose = require('mongoose');

const VehicleSchema = new mongoose.Schema({
  make: { type: String, required: true, trim: true },
  model: { type: String, required: true, trim: true },
  year: { type: Number, required: true, min: 1886, validate: value => Number.isInteger(value) && value <= new Date().getFullYear() + 1 },
  license: { type: String, required: true, maxlength: 32, set: value => typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  createdAt: { type: Date, default: Date.now }
});

VehicleSchema.index({ license: 1, company: 1 }, { unique: true });

module.exports = mongoose.model('Vehicle', VehicleSchema);
