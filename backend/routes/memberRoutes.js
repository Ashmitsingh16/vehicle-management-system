const express = require('express');
const router = express.Router();
const Member = require('../models/Member');
const auth = require('../middleware/auth');

router.use(auth); // every route below requires a valid token

// @route   GET /api/members
// @desc    Get all members for the logged-in user's company
router.get('/', async (req, res) => {
  try {
    const members = await Member.find({ company: req.companyId });
    res.json(members);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/members
// @desc    Add or update a member within the company
router.post('/', async (req, res) => {
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
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/members/:id
router.delete('/:id', async (req, res) => {
  try {
    const member = await Member.findOneAndDelete({ _id: req.params.id, company: req.companyId });
    if (!member) return res.status(404).json({ msg: 'Member not found' });
    res.json({ msg: 'Member removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') return res.status(404).json({ msg: 'Member not found' });
    res.status(500).send('Server Error');
  }
});

module.exports = router;
