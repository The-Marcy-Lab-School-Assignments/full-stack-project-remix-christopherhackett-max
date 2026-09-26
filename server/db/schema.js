// Table definitions shared by the seed script and the test suite, so both
// always build the same schema.

module.exports.createSchema = async (pool) => {
  await pool.query('DROP TABLE IF EXISTS meals');
  await pool.query('DROP TABLE IF EXISTS users');

  // timezone is an IANA name (e.g. 'America/New_York'). It decides which
  // calendar day a meal belongs to, since logged_at is stored in UTC.
  await pool.query(`
    CREATE TABLE users (
      user_id       SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      timezone      TEXT NOT NULL DEFAULT 'America/New_York'
    )
  `);

  await pool.query(`
    CREATE TABLE meals (
      meal_id     SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      calories    INTEGER NOT NULL,
      protein_g   INTEGER NOT NULL DEFAULT 0,
      carbs_g     INTEGER NOT NULL DEFAULT 0,
      fat_g       INTEGER NOT NULL DEFAULT 0,
      photo_data  TEXT,
      logged_at   TIMESTAMPTZ DEFAULT NOW(),
      user_id     INTEGER REFERENCES users(user_id) ON DELETE CASCADE
    )
  `);

  // Every report query filters meals by user and time range.
  await pool.query('CREATE INDEX meals_user_logged_at_idx ON meals (user_id, logged_at)');
};
