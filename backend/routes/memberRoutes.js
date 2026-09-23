const express = require('express');
const router = express.Router();
const Member = require('../models/Member');
const Vehicle = require('../models/Vehicle');
const auth = require('../middleware/auth');

router.use(auth);
const adminOnly = require('../middleware/adminOnly'); // every route below requires a valid token

// @route   GET /api/members
// @desc    Get all members for the logged-in user's company
router.get('/', async (req, res) => {
  try {
    const members = await Member.find({ company: req.companyId });
    res.json(members);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ msg: err.message });
    if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ msg: 'Invalid input' });
    if (err.code === 11000) return res.status(409).json({ msg: 'This record already exists' });
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/members
// @desc    Add or update a member within the company
router.post('/', adminOnly, async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    let member = await Member.findOne({ email, company: req.companyId });
    if (member) {
      member.name = name || member.name;
      member.phone = phone || member.phone;
      await member.save();
      return res.json(member);
    }
    member = new Member({ name, email, phone, company: req.companyId });
    await member.save();
    res.json(member);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ msg: err.message });
    if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ msg: 'Invalid input' });
    if (err.code === 11000) return res.status(409).json({ msg: 'This record already exists' });
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/members/:id
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    if (await Vehicle.exists({ owner: req.params.id, company: req.companyId })) {
      return res.status(409).json({ msg: 'Remove or reassign this member\'s vehicles first' });
    }
    const member = await require('../services/vehicleOwnership').deleteMember(req.params.id, req.companyId);
    if (!member) return res.status(404).json({ msg: 'Member not found' });
    res.json({ msg: 'Member removed' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ msg: err.message });
    if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ msg: 'Invalid input' });
    if (err.code === 11000) return res.status(409).json({ msg: 'This record already exists' });
    console.error(err.message);
    if (err.kind === 'ObjectId') return res.status(404).json({ msg: 'Member not found' });
    res.status(500).send('Server Error');
  }
});

module.exports = router;
