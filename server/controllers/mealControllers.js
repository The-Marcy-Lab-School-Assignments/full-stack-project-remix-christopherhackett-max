const mealModel = require('../models/mealModel');
const { isValidId } = require('../utils/validation');

module.exports.listMeals = async (req, res, next) => {
  try {
    const meals = await mealModel.listByUser(req.session.user_id);
    res.send(meals);
  } catch (err) {
    next(err);
  }
};

module.exports.getMeal = async (req, res, next) => {
  try {
    const { meal_id } = req.params;
    if (!isValidId(meal_id)) return res.status(404).send({ error: 'Meal not found.' });
    const meal = await mealModel.findByUser(meal_id, req.session.user_id);
    if (!meal) return res.status(404).send({ error: 'Meal not found.' });
    res.send(meal);
  } catch (err) {
    next(err);
  }
};

// POST /api/meals { saved_meal_id }
// Logs one of the user's saved meals as eaten right now.
module.exports.logMeal = async (req, res, next) => {
  try {
    const { saved_meal_id } = req.body;
    if (!isValidId(String(saved_meal_id))) {
      return res.status(400).send({ error: 'saved_meal_id must be the id of one of your saved meals.' });
    }

    const meal = await mealModel.logSavedMeal(saved_meal_id, req.session.user_id);
    if (!meal) return res.status(404).send({ error: 'Saved meal not found.' });
    res.status(201).send(meal);
  } catch (err) {
    next(err);
  }
};

module.exports.deleteMeal = async (req, res, next) => {
  try {
    const { meal_id } = req.params;
    if (!isValidId(meal_id)) return res.status(404).send({ error: 'Meal not found.' });

    // First find the meal to verify ownership
    const meal = await mealModel.find(meal_id);
    if (!meal) return res.status(404).send({ error: 'Meal not found.' });
    if (meal.user_id !== req.session.user_id) {
      return res.status(403).send({ error: 'Not authorized.' });
    }

    // Destroy the meal only after ownership has been verified
    const deletedMeal = await mealModel.destroy(meal_id);
    res.send(deletedMeal);
  } catch (err) {
    next(err);
  }
};
