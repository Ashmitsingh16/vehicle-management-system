const mongoose = require('mongoose');
const Company = require('../models/Company');
const User = require('../models/User');

// MongoDB commits both records or neither. No compensating deletion window.
module.exports = function registerCompany({ companyName, name, email, phone, password }) {
  return mongoose.connection.transaction(async session => {
    const [company] = await Company.create([{ name: companyName }], { session });
    const [user] = await User.create([{ name, email, phone, password, company: company._id, role: 'admin' }], { session });
    return { company, user };
  });
};
