const pool = require('../db/pool');

// Returns all meals for a specific user, ordered by most recently logged
module.exports.listByUser = async (user_id) => {
  const query = `
    SELECT * FROM meals
    WHERE user_id = $1
    ORDER BY logged_at DESC
  `;
  const { rows } = await pool.query(query, [user_id]);
  return rows;
};

// Returns a single meal row (used for ownership checks before delete)
module.exports.find = async (meal_id) => {
  const query = 'SELECT * FROM meals WHERE meal_id = $1';
  const { rows } = await pool.query(query, [meal_id]);
  return rows[0] || null;
};

// Returns one meal only when it belongs to the current user.
module.exports.findByUser = async (meal_id, user_id) => {
  const query = 'SELECT * FROM meals WHERE meal_id = $1 AND user_id = $2';
  const { rows } = await pool.query(query, [meal_id, user_id]);
  return rows[0] || null;
};

// Creates a new meal entry. Returns the full meal row.
module.exports.create = async (name, calories, protein_g, carbs_g, fat_g, photo_data, user_id) => {
  const query = `
    INSERT INTO meals (name, calories, protein_g, carbs_g, fat_g, photo_data, user_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;
  const { rows } = await pool.query(query, [name, calories, protein_g, carbs_g, fat_g, photo_data, user_id]);
  return rows[0];
};

// Deletes a meal by id. Returns the deleted row.
module.exports.destroy = async (meal_id) => {
  const query = 'DELETE FROM meals WHERE meal_id = $1 RETURNING *';
  const { rows } = await pool.query(query, [meal_id]);
  return rows[0] || null;
};
