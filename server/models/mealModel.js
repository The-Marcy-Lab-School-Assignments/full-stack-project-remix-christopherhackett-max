const pool = require('../db/pool');

// Returns every meal a user has eaten, most recent first. Photos are left out
// because they are large and the history list doesn't show them.
module.exports.listByUser = async (user_id) => {
  const query = `
    SELECT meal_id, saved_meal_id, name, calories, protein_g, carbs_g, fat_g, logged_at, user_id
    FROM meals
    WHERE user_id = $1
    ORDER BY logged_at DESC
  `;
  const { rows } = await pool.query(query, [user_id]);
  return rows;
};

// Returns one meal only when it belongs to the current user.
module.exports.findByUser = async (meal_id, user_id) => {
  const query = 'SELECT * FROM meals WHERE meal_id = $1 AND user_id = $2';
  const { rows } = await pool.query(query, [meal_id, user_id]);
  return rows[0] || null;
};

// Logs one of the user's saved meals as eaten right now. Copies the saved
// meal's name and numbers onto the new row so history stays accurate if the
// saved meal changes later. Returns the new row, or null if the saved meal
// doesn't exist or belongs to someone else.
module.exports.logSavedMeal = async (saved_meal_id, user_id) => {
  const query = `
    INSERT INTO meals (name, calories, protein_g, carbs_g, fat_g, user_id, saved_meal_id)
    SELECT name, calories, protein_g, carbs_g, fat_g, user_id, saved_meal_id
    FROM saved_meals
    WHERE saved_meal_id = $1 AND user_id = $2
    RETURNING meal_id, saved_meal_id, name, calories, protein_g, carbs_g, fat_g, logged_at, user_id
  `;
  const { rows } = await pool.query(query, [saved_meal_id, user_id]);
  return rows[0] || null;
};

// Deletes a meal the user owns. Returns the deleted row, or null when it
// doesn't exist or belongs to someone else. Ownership is checked in the same
// statement that deletes, so there's no gap between checking and deleting.
module.exports.destroy = async (meal_id, user_id) => {
  const query = 'DELETE FROM meals WHERE meal_id = $1 AND user_id = $2 RETURNING *';
  const { rows } = await pool.query(query, [meal_id, user_id]);
  return rows[0] || null;
};
