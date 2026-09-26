// The database schema, in one place. The server runs ensureSchema on startup,
// and the seed script and test suite use createSchema to start from empty.

const DEFAULT_TIMEZONE = 'America/New_York';
const MEAL_TYPES = "('breakfast', 'lunch', 'dinner', 'snack')";

// Postgres error codes for rows that break a NOT NULL or CHECK rule.
const NOT_NULL_VIOLATION = '23502';
const CHECK_VIOLATION = '23514';

// Rules on eaten meals. The names match what Postgres gives the inline CHECKs
// in CREATE TABLE meals, so existing and new databases end up the same.
const MEAL_CHECKS = {
  meals_calories_check: 'calories >= 0',
  meals_protein_g_check: 'protein_g >= 0',
  meals_carbs_g_check: 'carbs_g >= 0',
  meals_fat_g_check: 'fat_g >= 0',
};

// Older versions of the app created meals without NOT NULL on user_id and
// logged_at and without CHECKs. A meal with no logged_at has no local_day and
// silently drops out of every report, so the database should refuse one.
//
// Adding a rule fails if an existing row already breaks it, and a bad old row
// shouldn't stop the server from starting. So each CHECK is added NOT VALID
// (enforced for new rows only) and then validated against old rows separately.
// Any rule old rows break is logged instead of failing startup.
const tightenMealsTable = async (pool) => {
  for (const column of ['user_id', 'logged_at']) {
    try {
      await pool.query(`ALTER TABLE meals ALTER COLUMN ${column} SET NOT NULL`);
    } catch (err) {
      if (err.code !== NOT_NULL_VIOLATION) throw err;
      console.warn(`Some meals have no ${column}, so it can't be made required yet. Fix those rows and restart.`);
    }
  }
  for (const [name, rule] of Object.entries(MEAL_CHECKS)) {
    const { rows } = await pool.query(
      "SELECT 1 FROM pg_constraint WHERE conname = $1 AND conrelid = 'meals'::regclass",
      [name],
    );
    if (rows.length === 0) await pool.query(`ALTER TABLE meals ADD CONSTRAINT ${name} CHECK (${rule}) NOT VALID`);
    try {
      // Does nothing when the rule is already validated.
      await pool.query(`ALTER TABLE meals VALIDATE CONSTRAINT ${name}`);
    } catch (err) {
      if (err.code !== CHECK_VIOLATION) throw err;
      console.warn(`Some existing meals break "${rule}". New meals must follow it; fix the old rows and restart.`);
    }
  }
};

// Adds a column that links existing rows to saved_meals, and fills in those
// links, the first time only. Runs in a transaction so a failure part way
// can't leave the column added but the rows unlinked.
//
// "First time only" matters: deleting a saved meal sets these links to NULL
// on purpose. Backfilling on every start would bring deleted meals back.
const addSavedMealLink = async (pool, table, backfill) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'saved_meal_id'",
      [table],
    );
    if (rows.length === 0) {
      await client.query(`
        ALTER TABLE ${table}
        ADD COLUMN saved_meal_id INTEGER REFERENCES saved_meals(saved_meal_id) ON DELETE SET NULL
      `);
      await backfill(client);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Links rows to the saved meal with the same (case-insensitive) name.
const linkByName = (table) => `
  UPDATE ${table} t
  SET saved_meal_id = s.saved_meal_id
  FROM saved_meals s
  WHERE s.user_id = t.user_id AND lower(s.name) = lower(t.name) AND t.saved_meal_id IS NULL
`;

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

  // A user's collection of meals: each one saved once, with its type. This is
  // the dimension. meals (what was eaten, and when) and planned_meals (what
  // was planned) are facts that point at it.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_meals (
      saved_meal_id SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      meal_type  TEXT NOT NULL CHECK (meal_type IN ${MEAL_TYPES}),
      calories   INTEGER NOT NULL CHECK (calories >= 0),
      protein_g  INTEGER NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
      carbs_g    INTEGER NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
      fat_g      INTEGER NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
      photo_data TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // One saved meal per name, ignoring case: "Oatmeal" and "oatmeal" are the same meal.
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS saved_meals_user_name_idx ON saved_meals (user_id, lower(name))');

  // Each row is one time a meal was eaten. It keeps its own copy of the name
  // and numbers, like a receipt keeps the price paid, so history stays true
  // even if the saved meal changes or is deleted.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meals (
      meal_id     SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      calories    INTEGER NOT NULL CHECK (calories >= 0),
      protein_g   INTEGER NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
      carbs_g     INTEGER NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
      fat_g       INTEGER NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
      photo_data  TEXT,
      logged_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE
    )
  `);

  // Columns added after the first version of the app. Older databases get
  // them here.
  await pool.query('ALTER TABLE meals ADD COLUMN IF NOT EXISTS photo_data TEXT');
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT '${DEFAULT_TIMEZONE}'`);
  await tightenMealsTable(pool);

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
      slot       TEXT NOT NULL CHECK (slot IN ${MEAL_TYPES}),
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

  // Link plans and eaten meals to saved meals. Databases from before saved
  // meals existed get their saved meals built from what's already there.
  // Plans go first because a plan's slot is a reliable meal type.
  await addSavedMealLink(pool, 'planned_meals', async (client) => {
    await client.query(`
      INSERT INTO saved_meals (user_id, name, meal_type, calories, protein_g, carbs_g, fat_g)
      SELECT DISTINCT ON (user_id, lower(name))
        user_id, name, slot, calories, protein_g, carbs_g, fat_g
      FROM planned_meals
      ORDER BY user_id, lower(name), plan_date DESC
      ON CONFLICT (user_id, lower(name)) DO NOTHING
    `);
    await client.query(linkByName('planned_meals'));
  });
  await addSavedMealLink(pool, 'meals', async (client) => {
    // Eaten meals have no slot, so the type is guessed from the local time of
    // the most recent time each meal was eaten. Old rows with negative numbers
    // are skipped: saved_meals refuses them, and one bad row would otherwise
    // stop the server from starting. Those meals stay in history, unlinked.
    await client.query(`
      INSERT INTO saved_meals (user_id, name, meal_type, calories, protein_g, carbs_g, fat_g, photo_data)
      SELECT DISTINCT ON (m.user_id, lower(m.name))
        m.user_id, m.name,
        CASE
          WHEN local_hour BETWEEN 4 AND 10 THEN 'breakfast'
          WHEN local_hour BETWEEN 11 AND 15 THEN 'lunch'
          WHEN local_hour BETWEEN 16 AND 21 THEN 'dinner'
          ELSE 'snack'
        END,
        m.calories, m.protein_g, m.carbs_g, m.fat_g, m.photo_data
      FROM (
        SELECT m.*, EXTRACT(HOUR FROM m.logged_at AT TIME ZONE u.timezone) AS local_hour
        FROM meals m
        JOIN users u USING (user_id)
        WHERE m.calories >= 0 AND m.protein_g >= 0 AND m.carbs_g >= 0 AND m.fat_g >= 0
      ) m
      ORDER BY m.user_id, lower(m.name), m.logged_at DESC
      ON CONFLICT (user_id, lower(name)) DO NOTHING
    `);
    await client.query(linkByName('meals'));
  });

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
  await pool.query('DROP TABLE IF EXISTS planned_meals, meals, saved_meals, users');
  await module.exports.ensureSchema(pool);
};
