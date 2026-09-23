const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();
router.use(auth);
const scope = req => ({ _id: req.userId, company: req.companyId });

router.get('/', async (req, res, next) => {
  try {
    const user = await User.findOne(scope(req)).select('emergencyContacts');
    if (!user) return res.status(404).json({ msg: 'Account not found' });
    res.json(user.emergencyContacts);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, phone, relation } = req.body;
    if (typeof name !== 'string' || !name.trim() || name.length > 100 ||
        typeof phone !== 'string' || !/^[+0-9 ()-]{3,40}$/.test(phone.trim()) ||
        !['family', 'friend', 'colleague', 'emergency', 'other'].includes(relation)) {
      return res.status(400).json({ msg: 'Provide a name, valid phone number and relationship' });
    }
    const contact = { _id: new mongoose.Types.ObjectId(), name: name.trim(), phone: phone.trim(), relation };
    const user = await User.findOneAndUpdate({ ...scope(req), 'emergencyContacts.99': { $exists: false },
      'emergencyContacts.phone': { $ne: contact.phone } }, { $push: { emergencyContacts: contact } },
      { new: true, runValidators: true }).select('emergencyContacts');
    if (!user) return res.status(409).json({ msg: 'Contact already exists or the 100-contact limit was reached' });
    res.status(201).json(user.emergencyContacts.find(item => String(item._id) === String(contact._id)));
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ msg: 'Invalid contact ID' });
    const user = await User.findOneAndUpdate({ ...scope(req), 'emergencyContacts._id': req.params.id },
      { $pull: { emergencyContacts: { _id: req.params.id } } }, { new: true }).select('_id');
    if (!user) return res.status(404).json({ msg: 'Contact not found' });
    res.json({ msg: 'Contact removed', id: req.params.id });
  } catch (err) { next(err); }
});
module.exports = router;
