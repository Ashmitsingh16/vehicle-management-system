const express = require('express');
const router = express.Router();
const Vehicle = require('../models/Vehicle');
const auth = require('../middleware/auth');

router.use(auth);

// @route   GET /api/vehicles
router.get('/', async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ company: req.companyId }).populate('owner', 'name email');
    res.json(vehicles);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/vehicles
router.post('/', async (req, res) => {
  try {
    const { make, model, year, license, owner } = req.body;

    const existing = await Vehicle.findOne({ license, company: req.companyId });
    if (existing) {
      return res.status(400).json({ msg: 'A vehicle with this license plate already exists.' });
    }

    const vehicle = new Vehicle({ make, model, year, license, owner, company: req.companyId });
    await vehicle.save();

    const populated = await vehicle.populate('owner', 'name email');
    res.status(201).json(populated);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/vehicles/:id
router.delete('/:id', async (req, res) => {
  try {
    const vehicle = await Vehicle.findOneAndDelete({ _id: req.params.id, company: req.companyId });
    if (!vehicle) return res.status(404).json({ msg: 'Vehicle not found' });
    res.json({ msg: 'Vehicle removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') return res.status(404).json({ msg: 'Vehicle not found' });
    res.status(500).send('Server Error');
  }
});

module.exports = router;
