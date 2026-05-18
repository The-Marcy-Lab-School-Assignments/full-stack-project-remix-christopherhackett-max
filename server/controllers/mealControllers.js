const mealModel = require('../models/mealModel');

module.exports.listMeals = async (req, res, next) => {
  try {
    const meals = await mealModel.listByUser(req.session.user_id);
    res.send(meals);
  } catch (err) {
    next(err);
  }
};

module.exports.createMeal = async (req, res, next) => {
  try {
    const { name, calories, protein_g = 0, carbs_g = 0, fat_g = 0 } = req.body;

    if (!name) return res.status(400).send({ error: 'Name is required.' });
    if (calories === undefined) return res.status(400).send({ error: 'Calories is required.' });

    const meal = await mealModel.create(name, calories, protein_g, carbs_g, fat_g, req.session.user_id);
    res.status(201).send(meal);
  } catch (err) {
    next(err);
  }
};

module.exports.deleteMeal = async (req, res, next) => {
  try {
    const { meal_id } = req.params;

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