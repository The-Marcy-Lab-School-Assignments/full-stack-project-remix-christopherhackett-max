import pool from '../db/pool';

// Fixture helpers shared by the test files. Times are wall-clock times in the
// user's own timezone, which is how the report tests reason about days.

export const createUser = async (username, timezone) => {
  const { rows } = await pool.query(
    "INSERT INTO users (username, password_hash, timezone) VALUES ($1, 'x', $2) RETURNING user_id",
    [username, timezone],
  );
  return rows[0].user_id;
};

// localTime is a wall-clock time in the user's timezone, e.g. '2026-03-10 23:30'.
export const logMealAt = async (user_id, localTime, calories, protein_g = 0) => {
  const { rows } = await pool.query(`
    INSERT INTO meals (name, calories, protein_g, user_id, logged_at)
    SELECT 'Test meal', $2, $3, $1, $4::timestamp AT TIME ZONE timezone
    FROM users WHERE user_id = $1
    RETURNING meal_id
  `, [user_id, calories, protein_g, localTime]);
  return rows[0].meal_id;
};

// Logs a meal at noon local time, daysAgo days before today in the user's timezone.
export const logMealDaysAgo = async (user_id, daysAgo) => {
  await pool.query(`
    INSERT INTO meals (name, calories, user_id, logged_at)
    SELECT 'Test meal', 500, $1,
      (((NOW() AT TIME ZONE timezone)::date - $2::int) + TIME '12:00') AT TIME ZONE timezone
    FROM users WHERE user_id = $1
  `, [user_id, daysAgo]);
};

// 'YYYY-MM-DD' for today plus `offset` days, in the user's timezone.
export const localDay = async (user_id, offset = 0) => {
  const { rows } = await pool.query(
    'SELECT (NOW() AT TIME ZONE timezone)::date + $2::int AS day FROM users WHERE user_id = $1',
    [user_id, offset],
  );
  return rows[0].day;
};

export const createPlan = async (user_id, plan_date, slot, calories, meal_id = null) => {
  const { rows } = await pool.query(`
    INSERT INTO planned_meals (user_id, plan_date, slot, name, calories, meal_id)
    VALUES ($1, $2, $3, 'Planned meal', $4, $5)
    RETURNING planned_meal_id
  `, [user_id, plan_date, slot, calories, meal_id]);
  return rows[0].planned_meal_id;
};
