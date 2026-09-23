const mongoose = require('mongoose');

// Readiness must reflect database availability, not only a running HTTP process.
module.exports = function health(connection = mongoose.connection) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      if (connection.readyState !== 1 || !connection.db) throw new Error('Unavailable');
      await connection.db.command({ ping: 1 }, { timeoutMS: 2000 });
      return res.json({ status: 'OK' });
    } catch {
      return res.status(503).json({ status: 'unavailable' });
    }
  };
};
