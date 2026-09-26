const pool = require('../db/pool');

// Rolling averages look back this many days, including the current day.
const ROLLING_WINDOW_DAYS = 7;

// Returns one row per calendar day from `from` to `to` (inclusive) for a user.
// Grain: one row per user per local day. Days with no meals are included with
// zero totals, so a gap in logging shows up as a gap instead of disappearing.
//
// from/to are 'YYYY-MM-DD' strings or null. When null, the range defaults to
// the 14 days ending today in the user's timezone.
module.exports.dailyTotals = async (user_id, from, to) => {
  const query = `
    WITH bounds AS (
      -- "Today" depends on where the user is, not on the server clock.
      SELECT
        u.timezone,
        COALESCE($3::date, (NOW() AT TIME ZONE u.timezone)::date) AS to_day,
        COALESCE($2::date, COALESCE($3::date, (NOW() AT TIME ZONE u.timezone)::date) - 13) AS from_day
      FROM users u
      WHERE u.user_id = $1
    ),
    days AS (
      -- Start the calendar ${ROLLING_WINDOW_DAYS - 1} days early so the rolling
      -- average on the first requested day still sees a full window. Those
      -- lead-in days are dropped in the final SELECT.
      SELECT gs::date AS day
      FROM bounds,
        generate_series(from_day - ${ROLLING_WINDOW_DAYS - 1}, to_day, INTERVAL '1 day') AS gs
    ),
    meals_by_local_day AS (
      -- logged_at is a UTC instant. Converting it to the user's timezone
      -- before taking the date assigns late-night meals to the right day.
      SELECT
        (m.logged_at AT TIME ZONE b.timezone)::date AS day,
        m.calories, m.protein_g, m.carbs_g, m.fat_g
      FROM meals m
      CROSS JOIN bounds b
      WHERE m.user_id = $1
        -- Compare against UTC instants (not the converted date) so the
        -- (user_id, logged_at) index can be used.
        AND m.logged_at >= ((b.from_day - ${ROLLING_WINDOW_DAYS - 1})::timestamp AT TIME ZONE b.timezone)
        AND m.logged_at <  ((b.to_day + 1)::timestamp AT TIME ZONE b.timezone)
    ),
    daily AS (
      -- LEFT JOIN from the calendar keeps days with no meals. COUNT(m.day)
      -- counts only matched meals, so empty days get 0 rather than 1.
      SELECT
        d.day,
        COUNT(m.day)::int                   AS meal_count,
        COALESCE(SUM(m.calories), 0)::int   AS calories,
        COALESCE(SUM(m.protein_g), 0)::int  AS protein_g,
        COALESCE(SUM(m.carbs_g), 0)::int    AS carbs_g,
        COALESCE(SUM(m.fat_g), 0)::int      AS fat_g
      FROM days d
      LEFT JOIN meals_by_local_day m ON m.day = d.day
      GROUP BY d.day
    ),
    with_rolling AS (
      -- The rolling average skips days with nothing logged: AVG ignores NULLs,
      -- and a forgotten day is missing data, not a zero-calorie day.
      -- ROWS (not RANGE) is safe because the calendar has exactly one row per day.
      SELECT
        daily.*,
        ROUND(AVG(CASE WHEN meal_count > 0 THEN calories END) OVER seven_days)::int AS calories_7d_avg,
        (COUNT(*) FILTER (WHERE meal_count > 0) OVER seven_days)::int              AS days_logged_7d
      FROM daily
      WINDOW seven_days AS (ORDER BY day ROWS BETWEEN ${ROLLING_WINDOW_DAYS - 1} PRECEDING AND CURRENT ROW)
    )
    SELECT
      TO_CHAR(r.day, 'YYYY-MM-DD') AS day,
      r.meal_count, r.calories, r.protein_g, r.carbs_g, r.fat_g,
      r.calories_7d_avg, r.days_logged_7d
    FROM with_rolling r
    CROSS JOIN bounds b
    WHERE r.day >= b.from_day
    ORDER BY r.day
  `;
  const { rows } = await pool.query(query, [user_id, from, to]);
  return rows;
};

// Returns { current_streak, longest_streak } in days for a user.
// A streak is a run of consecutive local days with at least one meal logged.
module.exports.streaks = async (user_id) => {
  const query = `
    WITH logged_days AS (
      SELECT DISTINCT (m.logged_at AT TIME ZONE u.timezone)::date AS day
      FROM meals m
      JOIN users u USING (user_id)
      WHERE m.user_id = $1
    ),
    islands AS (
      -- Gaps and islands: within a run of consecutive days, day and row number
      -- both go up by 1, so their difference stays constant. That difference
      -- labels each run.
      SELECT day, day - (ROW_NUMBER() OVER (ORDER BY day))::int AS island
      FROM logged_days
    ),
    runs AS (
      SELECT MAX(day) AS last_day, COUNT(*)::int AS length
      FROM islands
      GROUP BY island
    ),
    today AS (
      SELECT (NOW() AT TIME ZONE timezone)::date AS day FROM users WHERE user_id = $1
    )
    -- A streak is still current if it reaches today or yesterday: the user
    -- may simply not have logged today's meals yet.
    SELECT
      COALESCE(MAX(r.length) FILTER (WHERE r.last_day >= t.day - 1), 0) AS current_streak,
      COALESCE(MAX(r.length), 0) AS longest_streak
    FROM today t
    LEFT JOIN runs r ON TRUE
  `;
  const { rows } = await pool.query(query, [user_id]);
  return rows[0];
};
