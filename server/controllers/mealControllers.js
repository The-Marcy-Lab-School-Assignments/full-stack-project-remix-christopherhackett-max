const mealModel = require('../models/mealModel');
const { isValidId, parseNutrition } = require('../utils/validation');

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

module.exports.createMeal = async (req, res, next) => {
  try {
    const { photo_data = null } = req.body;
    const { values, error } = parseNutrition(req.body);

    if (error) return res.status(400).send({ error });
    if (photo_data !== null && (typeof photo_data !== 'string' || !photo_data.startsWith('data:image/'))) {
      return res.status(400).send({ error: 'Photo must be an image.' });
    }

    const { name, calories, protein_g, carbs_g, fat_g } = values;
    const meal = await mealModel.create(name, calories, protein_g, carbs_g, fat_g, photo_data, req.session.user_id);
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
