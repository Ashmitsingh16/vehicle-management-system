const crypto = require('crypto');
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: String,
  count: { type: Number, required: true },
  expiresAt: { type: Date, required: true, expires: 0 }
}, { versionKey: false });
const Counter = mongoose.models.RequestLimit || mongoose.model('RequestLimit', schema);

// Shared MongoDB counters survive restarts and coordinate multiple API processes.
function createLimiter({ scope, limit, windowMs = 15 * 60 * 1000, key = req => req.ip, now = Date.now, store = Counter }) {
  return async (req, res, next) => {
    const identity = key(req);
    if (!identity) return next();
    const timestamp = now();
    const window = Math.floor(timestamp / windowMs);
    const reset = (window + 1) * windowMs;
    const digest = crypto.createHash('sha256').update(`${scope}:${identity}:${window}`).digest('hex');
    try {
      const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(reset + 60000) } };
      let counter;
      try {
        counter = await store.findOneAndUpdate({ _id: digest }, update, { new: true, upsert: true });
      } catch (err) {
        if (err.code !== 11000) throw err;
        // Concurrent first requests may compete to create the same bucket.
        counter = await store.findOneAndUpdate({ _id: digest }, { $inc: { count: 1 } }, { new: true });
      }
      if (!counter) throw new Error('Rate-limit counter unavailable');
      if (counter.count > limit) {
        res.set('Retry-After', String(Math.max(1, Math.ceil((reset - timestamp) / 1000))));
        return res.status(429).json({ message: 'Too many requests. Please try again later.', msg: 'Too many requests. Please try again later.' });
      }
      next();
    } catch (err) {
      res.status(503).json({ message: 'Request protection is temporarily unavailable. Please retry.', msg: 'Please retry later.' });
    }
  };
}
const emailKey = req => typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : null;
const userKey = req => String(req.user?._id || req.userId || req.ip);
const authIpLimiter = createLimiter({ scope: 'vehicle-management-system:auth-ip', limit: 100 });
const authAccountLimiter = createLimiter({ scope: 'vehicle-management-system:auth-account', limit: 10, key: emailKey });
const resetAccountLimiter = createLimiter({ scope: 'vehicle-management-system:reset-account', limit: 3, key: emailKey });
const notificationLimiter = createLimiter({ scope: 'vehicle-management-system:notification-account', limit: 30, key: userKey });
const notificationIpLimiter = createLimiter({ scope: 'vehicle-management-system:notification-ip', limit: 100 });
const contactIpLimiter = createLimiter({ scope: 'vehicle-management-system:contact-ip', limit: 5 });
function configureProxy(app) {
  const value = process.env.TRUST_PROXY_HOPS || '0';
  if (!/^(0|[1-9][0-9]?)$/.test(value)) throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 99');
  app.set('trust proxy', Number(value));
}
module.exports = { createLimiter, authIpLimiter, authAccountLimiter, resetAccountLimiter,
  notificationLimiter, notificationIpLimiter, contactIpLimiter, configureProxy };
