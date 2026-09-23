module.exports = (req, res, next) => req.companyRole === 'admin' ? next() : res.status(403).json({ msg: 'Company admin access required' });
