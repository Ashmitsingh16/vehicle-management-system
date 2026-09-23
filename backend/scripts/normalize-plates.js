// Stop API writes before running --apply. Defaults to a read-only report.
require('dotenv').config();
const mongoose = require('mongoose');
const Vehicle = require('../models/Vehicle');
(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const rows = await Vehicle.collection.find({}).toArray();
  const keys = new Set(); const changes = []; const conflicts = [];
  for (const row of rows) {
    const plate = typeof row.license === 'string' ? row.license.replace(/\s+/g, '').toUpperCase() : '';
    const key = `${row.company}:${plate}`;
    if (!plate || plate.length > 32 || keys.has(key)) conflicts.push(String(row._id));
    keys.add(key);
    if (plate !== row.license) changes.push({ id: row._id, old: row.license, plate });
  }
  console.log(JSON.stringify({ changes: changes.length, conflictingRecordIds: conflicts }, null, 2));
  if (conflicts.length) throw new Error('Resolve invalid or duplicate plates before applying normalization. No records changed.');
  if (process.argv.includes('--apply')) {
    await mongoose.connection.transaction(async session => {
      for (const change of changes) {
        const result = await Vehicle.collection.updateOne({ _id: change.id, license: change.old }, { $set: { license: change.plate } }, { session });
        if (result.matchedCount !== 1) throw new Error('Records changed during migration. Stop API writes and retry.');
      }
    });
    console.log('Plate normalization complete');
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
