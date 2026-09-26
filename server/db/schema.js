// The database schema, in one place. The server runs ensureSchema on startup,
// and the seed script and test suite use createSchema to start from empty.

const DEFAULT_TIMEZONE = 'America/New_York';

// Creates anything that is missing and leaves existing data alone, so it is
// safe to run on every server start.
module.exports.ensureSchema = async (pool) => {
  // timezone is an IANA name (e.g. 'America/New_York'). It decides which
  // calendar day a meal belongs to, since logged_at is stored in UTC.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id       SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      timezone      TEXT NOT NULL DEFAULT '${DEFAULT_TIMEZONE}'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS meals (
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

  // Columns added after the first version of the app. Older databases get
  // them here.
  await pool.query('ALTER TABLE meals ADD COLUMN IF NOT EXISTS photo_data TEXT');
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT '${DEFAULT_TIMEZONE}'`);

  // Every report query filters meals by user and time range.
  await pool.query('CREATE INDEX IF NOT EXISTS meals_user_logged_at_idx ON meals (user_id, logged_at)');

  // A plan is for a calendar day, not a moment in time, so plan_date is a
  // DATE with no timezone. meals.logged_at is the opposite: an exact instant.
  //
  // meal_id links a plan to the meal logged from it. That link is how the app
  // knows the plan was followed. If the meal is deleted, the link is cleared
  // and the plan counts as not followed again.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS planned_meals (
      planned_meal_id SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      plan_date  DATE NOT NULL,
      slot       TEXT NOT NULL CHECK (slot IN ('breakfast', 'lunch', 'dinner', 'snack')),
      name       TEXT NOT NULL,
      calories   INTEGER NOT NULL CHECK (calories >= 0),
      protein_g  INTEGER NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
      carbs_g    INTEGER NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
      fat_g      INTEGER NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
      meal_id    INTEGER UNIQUE REFERENCES meals(meal_id) ON DELETE SET NULL,
      -- One plan per slot per day. This also serves as the index for
      -- looking up a user's week.
      UNIQUE (user_id, plan_date, slot)
    )
  `);

  // The single definition of "which local day does a meal belong to". The
  // daily report and the plan comparison both read from this view, so they
  // can never disagree about which day a meal was eaten.
  //
  // Dropped and recreated rather than CREATE OR REPLACE: Postgres expands
  // m.* when the view is created, and REPLACE can only add columns at the end.
  // A new meals column would land before timezone and make REPLACE fail.
  // Both statements run in one query so no request sees the view missing.
  await pool.query(`
    DROP VIEW IF EXISTS meals_local;
    CREATE VIEW meals_local AS
    SELECT
      m.*,
      u.timezone,
      (m.logged_at AT TIME ZONE u.timezone)::date AS local_day
    FROM meals m
    JOIN users u USING (user_id)
  `);
};

// Drops everything and rebuilds from scratch.
module.exports.createSchema = async (pool) => {
  await pool.query('DROP VIEW IF EXISTS meals_local');
  await pool.query('DROP TABLE IF EXISTS planned_meals, meals, users');
  await module.exports.ensureSchema(pool);
};
