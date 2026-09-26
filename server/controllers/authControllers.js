const userModel = require('../models/userModel');

const clearSessionCookies = (req, res) => {
  req.session = null;
  res.clearCookie('session', { path: '/' });
  res.clearCookie('session.sig', { path: '/' });
};

module.exports.register = async (req, res, next) => {
  try {
    const { username, password, timezone } = req.body;
    if (!username || !password) {
      return res.status(400).send({ error: 'Username and password are required.' });
    }
    if (timezone !== undefined && !(await userModel.isValidTimezone(timezone))) {
      return res.status(400).send({ error: 'Unknown timezone.' });
    }

    const existingUser = await userModel.findByUsername(username);
    if (existingUser) {
      return res.status(400).send({ error: 'Username already taken.' });
    }

    const user = await userModel.create(username, password, timezone);
    req.session.user_id = user.user_id;
    res.status(201).send(user);
  } catch (err) {
    next(err);
  }
};

module.exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const user = await userModel.validatePassword(username, password);
    if (!user) return res.status(401).send({ error: 'Invalid credentials.' });
    req.session.user_id = user.user_id;
    res.send(user);
  } catch (err) {
    next(err);
  }
};

// Returns the logged-in user object, or null if no session exists.
// Returning JSON null (200) keeps the response format consistent — the frontend
// can always call response.json() without hitting a parse error.
module.exports.getMe = async (req, res, next) => {
  try {
    if (!req.session.user_id) return res.json(null);
    const user = await userModel.find(req.session.user_id);
    res.json(user);
  } catch (err) {
    next(err);
  }
};

module.exports.updateAccount = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const cleanUsername = username?.trim();
    const cleanPassword = password?.trim();

    if (!cleanUsername) {
      return res.status(400).send({ error: 'Username is required.' });
    }

    const existingUser = await userModel.findByUsername(cleanUsername);
    if (existingUser && existingUser.user_id !== req.session.user_id) {
      return res.status(400).send({ error: 'Username already taken.' });
    }

    const user = await userModel.update(req.session.user_id, cleanUsername, cleanPassword);
    if (!user) return res.status(404).send({ error: 'User not found.' });
    res.send(user);
  } catch (err) {
    next(err);
  }
};

module.exports.deleteAccount = async (req, res, next) => {
  try {
    const deletedUser = await userModel.destroy(req.session.user_id);
    if (!deletedUser) return res.status(404).send({ error: 'User not found.' });
    clearSessionCookies(req, res);
    res.send(deletedUser);
  } catch (err) {
    next(err);
  }
};

module.exports.logout = (req, res) => {
  clearSessionCookies(req, res);
  res.send({ message: 'Logged out.' });
};
