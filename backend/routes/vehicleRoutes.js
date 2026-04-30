const express = require('express');
const router = express.Router();
const Vehicle = require('../models/Vehicle');

// @route   GET /api/vehicles
// @desc    Get all vehicles
// @access  Public
router.get('/', async (req, res) => {
  try {
    const vehicles = await Vehicle.find().populate('owner', 'name email');
    res.json(vehicles);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/vehicles
// @desc    Add a new vehicle
// @access  Public
router.post('/', async (req, res) => {
  try {
    const { make, model, year, license, owner } = req.body;

    // Check if license plate already exists
    const existing = await Vehicle.findOne({ license });
    if (existing) {
      return res.status(400).json({ msg: 'A vehicle with this license plate already exists.' });
    }

    const vehicle = new Vehicle({ make, model, year, license, owner });
    await vehicle.save();

    const populated = await vehicle.populate('owner', 'name email');
    res.status(201).json(populated);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/vehicles/:id
// @desc    Delete a vehicle
// @access  Public
router.delete('/:id', async (req, res) => {
  try {
    const vehicle = await Vehicle.findByIdAndDelete(req.params.id);
    if (!vehicle) return res.status(404).json({ msg: 'Vehicle not found' });
    res.json({ msg: 'Vehicle removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') return res.status(404).json({ msg: 'Vehicle not found' });
    res.status(500).send('Server Error');
  }
});

module.exports = router;
