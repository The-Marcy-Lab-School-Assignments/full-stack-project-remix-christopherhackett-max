const userModel = require('../models/userModel');

// Requires a session for a user who still exists. A session cookie can outlive
// its account: delete the account in one browser and another browser still
// holds a valid cookie for it. Treat that as logged out.
const checkAuthentication = async (req, res, next) => {
  try {
    if (!req.session.user_id) {
      return res.status(401).send({ error: 'You must be logged in.' });
    }
    const user = await userModel.find(req.session.user_id);
    if (!user) {
      req.session = null;
      return res.status(401).send({ error: 'You must be logged in.' });
    }
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = checkAuthentication;
