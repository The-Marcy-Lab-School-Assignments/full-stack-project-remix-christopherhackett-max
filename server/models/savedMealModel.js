const pool = require('../db/pool');

module.exports.MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

// Postgres error code for a UNIQUE constraint violation.
const UNIQUE_VIOLATION = '23505';

// Returns every saved meal for a user, ordered breakfast → snack and then by
// how often it has been eaten. Photos are left out: they are large, and the
// list only needs to know whether one exists.
module.exports.listByUser = async (user_id) => {
  const query = `
    SELECT
      s.saved_meal_id, s.name, s.meal_type,
      s.calories, s.protein_g, s.carbs_g, s.fat_g,
      s.photo_data IS NOT NULL AS has_photo,
      COUNT(m.meal_id)::int AS times_eaten,
      MAX(m.logged_at)      AS last_eaten_at
    FROM saved_meals s
    LEFT JOIN meals m ON m.saved_meal_id = s.saved_meal_id
    WHERE s.user_id = $1
    -- Grouping by the primary key lets the query select any saved_meals column.
    GROUP BY s.saved_meal_id
    ORDER BY array_position($2::text[], s.meal_type), times_eaten DESC, lower(s.name)
  `;
  const { rows } = await pool.query(query, [user_id, module.exports.MEAL_TYPES]);
  return rows;
};

// Returns one saved meal the user owns, with its photo and eating stats, or null.
module.exports.findByUser = async (saved_meal_id, user_id) => {
  const query = `
    SELECT
      s.*,
      COUNT(m.meal_id)::int AS times_eaten,
      MAX(m.logged_at)      AS last_eaten_at
    FROM saved_meals s
    LEFT JOIN meals m ON m.saved_meal_id = s.saved_meal_id
    WHERE s.saved_meal_id = $1 AND s.user_id = $2
    GROUP BY s.saved_meal_id
  `;
  const { rows } = await pool.query(query, [saved_meal_id, user_id]);
  return rows[0] || null;
};

// Saves a meal to the user's collection. Returns the new row, or null when
// the user already has a meal with that name.
module.exports.create = async (user_id, { name, meal_type, calories, protein_g, carbs_g, fat_g, photo_data }) => {
  const query = `
    INSERT INTO saved_meals (user_id, name, meal_type, calories, protein_g, carbs_g, fat_g, photo_data)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;
  try {
    const { rows } = await pool.query(query, [user_id, name, meal_type, calories, protein_g, carbs_g, fat_g, photo_data]);
    return rows[0];
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) return null;
    throw err;
  }
};

// Removes a meal from the user's collection. Returns the deleted row, or null.
// Meals already eaten and plans already made keep their own copies, so history
// is unchanged; their link to the saved meal is cleared (ON DELETE SET NULL).
module.exports.destroy = async (saved_meal_id, user_id) => {
  const query = 'DELETE FROM saved_meals WHERE saved_meal_id = $1 AND user_id = $2 RETURNING *';
  const { rows } = await pool.query(query, [saved_meal_id, user_id]);
  return rows[0] || null;
};
