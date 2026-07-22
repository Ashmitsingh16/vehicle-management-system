const mongoose = require('mongoose');

// A "Member" is a person tracked inside a company's dashboard (e.g. a vehicle
// owner or family member). They do NOT log in — that's what the User/auth
// model is for. Keeping these separate means adding a member never needs a
// password and login accounts never get cluttered with non-login people.
const MemberSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  createdAt: { type: Date, default: Date.now }
});

MemberSchema.index({ email: 1, company: 1 }, { unique: true });

module.exports = mongoose.model('Member', MemberSchema);
