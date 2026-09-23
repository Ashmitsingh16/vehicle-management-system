const mongoose = require('mongoose');
const Member = require('../models/Member');
const Vehicle = require('../models/Vehicle');
const failure = (status, message) => Object.assign(new Error(message), { status });
// Both operations write the same owner document. Concurrent transactions conflict
// and retry with a fresh snapshot, preventing dangling vehicle references.
async function lockOwner(id, company, session) {
  const owner = await Member.findOneAndUpdate({ _id: id, company },
    { $inc: { ownershipRevision: 1 } }, { session, new: true });
  if (!owner) throw failure(404, 'Owner not found in your company');
}
exports.createVehicle = data => mongoose.connection.transaction(async session => {
  await lockOwner(data.owner, data.company, session);
  const [vehicle] = await Vehicle.create([data], { session });
  return vehicle;
});
exports.deleteMember = (id, company) => mongoose.connection.transaction(async session => {
  await lockOwner(id, company, session);
  if (await Vehicle.exists({ owner: id, company }).session(session))
    throw failure(409, 'Remove or reassign this member\'s vehicles first');
  return Member.findOneAndDelete({ _id: id, company }, { session });
});
