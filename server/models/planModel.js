const pool = require('../db/pool');

module.exports.SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];

// When a plan for an earlier day is logged, the meal is stamped at this local
// time on the plan's day. Plans for today are stamped with the current time.
const SLOT_TIMES = { breakfast: '08:00', lunch: '12:30', snack: '15:30', dinner: '19:00' };

// Postgres error code for a UNIQUE constraint violation.
const UNIQUE_VIOLATION = '23505';

// Returns the Monday-to-Sunday week containing `day` ('YYYY-MM-DD', or null
// for this week in the user's timezone), with the plans for each day and how
// they compare to what was actually logged.
module.exports.getWeek = async (user_id, day) => {
  const daysQuery = `
    WITH bounds AS (
      SELECT
        u.timezone,
        t.today,
        -- ISODOW is 1 for Monday through 7 for Sunday, so this steps back to Monday.
        picked.day - (EXTRACT(ISODOW FROM picked.day)::int - 1) AS week_start
      FROM users u
      CROSS JOIN LATERAL (SELECT (NOW() AT TIME ZONE u.timezone)::date AS today) t
      CROSS JOIN LATERAL (SELECT COALESCE($2::date, t.today) AS day) picked
      WHERE u.user_id = $1
    ),
    days AS (
      SELECT b.week_start + offset_days AS day
      FROM bounds b, generate_series(0, 6) AS offset_days
    ),
    -- Plans and meals are each rolled up to one row per day BEFORE they are
    -- joined. Joining the raw rows would pair every plan with every meal on
    -- the same day: 3 plans and 4 meals would make 12 rows, and every sum
    -- would be inflated.
    planned AS (
      SELECT
        p.plan_date AS day,
        COUNT(*)::int          AS planned_count,
        SUM(p.calories)::int   AS planned_calories,
        COUNT(p.meal_id)::int  AS followed_count
      FROM planned_meals p
      CROSS JOIN bounds b
      WHERE p.user_id = $1
        AND p.plan_date BETWEEN b.week_start AND b.week_start + 6
      GROUP BY p.plan_date
    ),
    actual AS (
      SELECT
        m.local_day AS day,
        COUNT(*)::int         AS actual_meals,
        SUM(m.calories)::int  AS actual_calories
      FROM meals_local m
      CROSS JOIN bounds b
      WHERE m.user_id = $1
        AND m.logged_at >= (b.week_start::timestamp AT TIME ZONE b.timezone)
        AND m.logged_at <  ((b.week_start + 7)::timestamp AT TIME ZONE b.timezone)
      GROUP BY m.local_day
    )
    SELECT
      d.day,
      d.day < b.today  AS is_past,
      d.day = b.today  AS is_today,
      COALESCE(p.planned_count, 0)    AS planned_count,
      COALESCE(p.planned_calories, 0) AS planned_calories,
      COALESCE(p.followed_count, 0)   AS followed_count,
      COALESCE(a.actual_meals, 0)     AS actual_meals,
      COALESCE(a.actual_calories, 0)  AS actual_calories,
      -- Only comparable when there was both a plan and something logged.
      CASE WHEN p.planned_count > 0 AND a.actual_meals > 0
        THEN a.actual_calories - p.planned_calories
      END AS calorie_diff
    FROM days d
    CROSS JOIN bounds b
    LEFT JOIN planned p ON p.day = d.day
    LEFT JOIN actual a ON a.day = d.day
    ORDER BY d.day
  `;
  const { rows: days } = await pool.query(daysQuery, [user_id, day]);
  const week_start = days[0].day;

  const plansQuery = `
    SELECT planned_meal_id, plan_date, slot, name, calories, protein_g, carbs_g, fat_g, meal_id
    FROM planned_meals
    WHERE user_id = $1
      AND plan_date BETWEEN $2::date AND $2::date + 6
    ORDER BY plan_date, array_position($3::text[], slot)
  `;
  const { rows: plans } = await pool.query(plansQuery, [user_id, week_start, module.exports.SLOTS]);

  const plansByDay = {};
  for (const plan of plans) (plansByDay[plan.plan_date] ??= []).push(plan);

  return {
    week_start,
    days: days.map((row) => ({ ...row, plans: plansByDay[row.day] || [] })),
    summary: summarizeWeek(days),
  };
};

// Week totals. Only finished days count, since a plan for today or later
// can't have been missed yet.
const summarizeWeek = (days) => {
  const finished = days.filter((row) => row.is_past);
  const planned = finished.reduce((sum, row) => sum + row.planned_count, 0);
  const followed = finished.reduce((sum, row) => sum + row.followed_count, 0);
  const compared = finished.filter((row) => row.calorie_diff !== null);

  return {
    planned_meals: planned,
    followed_meals: followed,
    follow_rate: planned ? Math.round((followed / planned) * 100) : null,
    avg_calorie_diff: compared.length
      ? Math.round(compared.reduce((sum, row) => sum + row.calorie_diff, 0) / compared.length)
      : null,
  };
};

// Creates a plan. Returns the new row, or null when that slot on that day
// already has a plan.
module.exports.create = async (user_id, { plan_date, slot, name, calories, protein_g, carbs_g, fat_g }) => {
  const query = `
    INSERT INTO planned_meals (user_id, plan_date, slot, name, calories, protein_g, carbs_g, fat_g)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;
  try {
    const { rows } = await pool.query(query, [user_id, plan_date, slot, name, calories, protein_g, carbs_g, fat_g]);
    return rows[0];
  } catch (err) {
    // Let the UNIQUE constraint catch duplicates instead of checking first:
    // a check-then-insert can race with a second request.
    if (err.code === UNIQUE_VIOLATION) return null;
    throw err;
  }
};

// Deletes a plan the user owns. Returns the deleted row, or null. A meal
// already logged from this plan is kept: the plan was only the intention.
module.exports.destroy = async (planned_meal_id, user_id) => {
  const query = 'DELETE FROM planned_meals WHERE planned_meal_id = $1 AND user_id = $2 RETURNING *';
  const { rows } = await pool.query(query, [planned_meal_id, user_id]);
  return rows[0] || null;
};

// Logs a plan as an eaten meal and links the two.
// Returns { plan, meal } on success or { error: 'not_found' | 'already_logged' | 'future' }.
//
// Creating the meal and linking it are two writes that must both happen or
// neither. They run in one transaction, and the plan row is locked
// (FOR UPDATE) so two clicks at once can't log the same plan twice.
module.exports.logAsMeal = async (planned_meal_id, user_id) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(`
      SELECT p.*, u.timezone,
        p.plan_date = (NOW() AT TIME ZONE u.timezone)::date AS is_today,
        p.plan_date > (NOW() AT TIME ZONE u.timezone)::date AS is_future
      FROM planned_meals p
      JOIN users u USING (user_id)
      WHERE p.planned_meal_id = $1 AND p.user_id = $2
      FOR UPDATE OF p
    `, [planned_meal_id, user_id]);
    const plan = rows[0];

    const error = !plan ? 'not_found' : plan.meal_id ? 'already_logged' : plan.is_future ? 'future' : null;
    if (error) {
      await client.query('ROLLBACK');
      return { error };
    }

    const { rows: [meal] } = await client.query(`
      INSERT INTO meals (name, calories, protein_g, carbs_g, fat_g, user_id, logged_at)
      VALUES ($1, $2, $3, $4, $5, $6,
        CASE WHEN $7 THEN NOW() ELSE ($8::date + $9::time) AT TIME ZONE $10 END)
      RETURNING *
    `, [
      plan.name, plan.calories, plan.protein_g, plan.carbs_g, plan.fat_g, user_id,
      plan.is_today, plan.plan_date, SLOT_TIMES[plan.slot], plan.timezone,
    ]);

    const { rows: [linkedPlan] } = await client.query(
      'UPDATE planned_meals SET meal_id = $1 WHERE planned_meal_id = $2 RETURNING *',
      [meal.meal_id, planned_meal_id],
    );

    await client.query('COMMIT');
    return { plan: linkedPlan, meal };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
