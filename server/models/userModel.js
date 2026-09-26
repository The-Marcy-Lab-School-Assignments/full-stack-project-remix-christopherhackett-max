const bcrypt = require('bcrypt');
const pool = require('../db/pool');

const SALT_ROUNDS = 8;
const DEFAULT_TIMEZONE = 'America/New_York';

// True when Postgres recognizes the name, e.g. 'America/Chicago'.
module.exports.isValidTimezone = async (timezone) => {
  const { rows } = await pool.query('SELECT 1 FROM pg_timezone_names WHERE name = $1', [timezone]);
  return rows.length > 0;
};

// Creates a new user. Returns { user_id, username, timezone } — never exposes password_hash.
module.exports.create = async (username, password, timezone = DEFAULT_TIMEZONE) => {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const query = `
    INSERT INTO users (username, password_hash, timezone)
    VALUES ($1, $2, $3)
    RETURNING user_id, username, timezone
  `;
  const { rows } = await pool.query(query, [username, passwordHash, timezone]);
  return rows[0];
};

// Returns { user_id, username, timezone } or null
module.exports.find = async (user_id) => {
  const query = 'SELECT user_id, username, timezone FROM users WHERE user_id = $1';
  const { rows } = await pool.query(query, [user_id]);
  return rows[0] || null;
};

// Returns { user_id, username } or null — used to check if a username is taken
module.exports.findByUsername = async (username) => {
  const query = 'SELECT user_id, username FROM users WHERE username = $1';
  const { rows } = await pool.query(query, [username]);
  return rows[0] || null;
};

// Updates username and optionally password. Returns { user_id, username }.
module.exports.update = async (user_id, username, password) => {
  if (password) {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const query = `
      UPDATE users
      SET username = $1, password_hash = $2
      WHERE user_id = $3
      RETURNING user_id, username, timezone
    `;
    const { rows } = await pool.query(query, [username, passwordHash, user_id]);
    return rows[0] || null;
  }

  const query = `
    UPDATE users
    SET username = $1
    WHERE user_id = $2
    RETURNING user_id, username, timezone
  `;
  const { rows } = await pool.query(query, [username, user_id]);
  return rows[0] || null;
};

// Deletes the current user. Meals are removed by ON DELETE CASCADE.
module.exports.destroy = async (user_id) => {
  const query = 'DELETE FROM users WHERE user_id = $1 RETURNING user_id, username';
  const { rows } = await pool.query(query, [user_id]);
  return rows[0] || null;
};

// Verifies a password against the stored hash. Returns { user_id, username, timezone } if
// valid, or null if the username doesn't exist or the password is wrong.
module.exports.validatePassword = async (username, password) => {
  const query = 'SELECT * FROM users WHERE username = $1';
  const { rows } = await pool.query(query, [username]);
  const user = rows[0];
  if (!user) return null;
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) return null;
  return { user_id: user.user_id, username: user.username, timezone: user.timezone };
};
