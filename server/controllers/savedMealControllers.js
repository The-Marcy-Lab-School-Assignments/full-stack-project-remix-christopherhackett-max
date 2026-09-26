const savedMealModel = require('../models/savedMealModel');
const { isValidId, parseNutrition } = require('../utils/validation');

// GET /api/saved-meals
module.exports.listSavedMeals = async (req, res, next) => {
  try {
    const savedMeals = await savedMealModel.listByUser(req.session.user_id);
    res.send(savedMeals);
  } catch (err) {
    next(err);
  }
};

// GET /api/saved-meals/:saved_meal_id
module.exports.getSavedMeal = async (req, res, next) => {
  try {
    const { saved_meal_id } = req.params;
    if (!isValidId(saved_meal_id)) return res.status(404).send({ error: 'Saved meal not found.' });

    const savedMeal = await savedMealModel.findByUser(saved_meal_id, req.session.user_id);
    if (!savedMeal) return res.status(404).send({ error: 'Saved meal not found.' });
    res.send(savedMeal);
  } catch (err) {
    next(err);
  }
};

// POST /api/saved-meals { name, meal_type, calories, protein_g, carbs_g, fat_g, photo_data }
// Saves a meal to the collection. It does not log it as eaten.
module.exports.createSavedMeal = async (req, res, next) => {
  try {
    const { meal_type, photo_data = null } = req.body;
    const { values, error } = parseNutrition(req.body);

    if (error) return res.status(400).send({ error });
    if (!savedMealModel.MEAL_TYPES.includes(meal_type)) {
      return res.status(400).send({ error: `meal_type must be one of: ${savedMealModel.MEAL_TYPES.join(', ')}.` });
    }
    if (photo_data !== null && (typeof photo_data !== 'string' || !photo_data.startsWith('data:image/'))) {
      return res.status(400).send({ error: 'Photo must be an image.' });
    }

    const savedMeal = await savedMealModel.create(req.session.user_id, { ...values, meal_type, photo_data });
    if (!savedMeal) return res.status(409).send({ error: `You already have a meal called "${values.name}".` });
    res.status(201).send(savedMeal);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/saved-meals/:saved_meal_id
// Removes it from the collection. Past meals and plans keep their copies.
module.exports.deleteSavedMeal = async (req, res, next) => {
  try {
    const { saved_meal_id } = req.params;
    if (!isValidId(saved_meal_id)) return res.status(404).send({ error: 'Saved meal not found.' });

    const savedMeal = await savedMealModel.destroy(saved_meal_id, req.session.user_id);
    if (!savedMeal) return res.status(404).send({ error: 'Saved meal not found.' });
    res.send(savedMeal);
  } catch (err) {
    next(err);
  }
};
