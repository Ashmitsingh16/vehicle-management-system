const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getJwtSecret } = require('../config/jwt');

module.exports = async function auth(req, res, next) {
  const header = req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }
  let decoded;
  try {
    decoded = jwt.verify(header.slice(7), getJwtSecret());
    if (!decoded.user || !/^[a-f0-9]{24}$/i.test(decoded.user.id)) throw new Error('Invalid user');
  } catch (err) {
    return res.status(401).json({ msg: 'Token is not valid' });
  }
  try {
    // Read current permissions instead of trusting stale company/role claims.
    const user = await User.findById(decoded.user.id);
    if (!user || !user.company) return res.status(401).json({ msg: 'Account no longer exists' });
    if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ msg: 'Password changed. Please log in again.' });
    }
    req.userId = String(user._id);
    req.companyId = String(user.company);
    req.companyRole = user.role;
    next();
  } catch (err) {
    res.status(503).json({ msg: 'Unable to verify account. Please retry.' });
  }
};
