const express = require('express');
const router = express.Router();
const Vehicle = require('../models/Vehicle');
const Member = require('../models/Member');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');

router.use(auth);
const adminOnly = require('../middleware/adminOnly');

// @route   GET /api/vehicles
router.get('/', async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ company: req.companyId }).populate({ path: 'owner', select: 'name email', match: { company: req.companyId } });
    res.json(vehicles);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ msg: err.message });
    if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ msg: 'Invalid input' });
    if (err.code === 11000) return res.status(409).json({ msg: 'This record already exists' });
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/vehicles
router.post('/', adminOnly, async (req, res) => {
  try {
    const { make, model, year, owner } = req.body;
    if (typeof req.body.license !== 'string' || !req.body.license.trim()) return res.status(400).json({ msg: 'License plate is required' });
    const license = req.body.license.replace(/\s+/g, '').toUpperCase();

    if (!mongoose.isObjectIdOrHexString(owner) ||
        !await Member.exists({ _id: owner, company: req.companyId })) {
      return res.status(400).json({ msg: 'Choose an owner from your company' });
    }

    const existing = await Vehicle.findOne({ license, company: req.companyId });
    if (existing) {
      return res.status(400).json({ msg: 'A vehicle with this license plate already exists.' });
    }

    const vehicle = await require('../services/vehicleOwnership').createVehicle({ make, model, year, license, owner, company: req.companyId });

    const populated = await vehicle.populate({ path: 'owner', select: 'name email', match: { company: req.companyId } });
    res.status(201).json(populated);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ msg: err.message });
    if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ msg: 'Invalid input' });
    if (err.code === 11000) return res.status(409).json({ msg: 'This record already exists' });
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/vehicles/:id
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const vehicle = await Vehicle.findOneAndDelete({ _id: req.params.id, company: req.companyId });
    if (!vehicle) return res.status(404).json({ msg: 'Vehicle not found' });
    res.json({ msg: 'Vehicle removed' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ msg: err.message });
    if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ msg: 'Invalid input' });
    if (err.code === 11000) return res.status(409).json({ msg: 'This record already exists' });
    console.error(err.message);
    if (err.kind === 'ObjectId') return res.status(404).json({ msg: 'Vehicle not found' });
    res.status(500).send('Server Error');
  }
});

module.exports = router;
