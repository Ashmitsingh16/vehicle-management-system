const jwt = require('jsonwebtoken');

// Verifies the JWT from the Authorization header and attaches
// req.userId and req.companyId so every route can scope data safely.
module.exports = function auth(req, res, next) {
  const header = req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  const token = header.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.userId = decoded.user.id;
    req.companyId = decoded.user.companyId;
    req.companyRole = decoded.user.role;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};
