const planModel = require('../models/planModel');
const { isValidDate, isValidId } = require('../utils/validation');

// GET /api/plans?week=YYYY-MM-DD
// Any date in the week works; the response starts on that week's Monday.
// Without it, returns the current week in the user's timezone.
module.exports.getWeek = async (req, res, next) => {
  try {
    const { week = null } = req.query;
    if (week !== null && !isValidDate(week)) {
      return res.status(400).send({ error: 'week must be a real date in YYYY-MM-DD format.' });
    }

    const plan = await planModel.getWeek(req.session.user_id, week);
    res.send(plan);
  } catch (err) {
    next(err);
  }
};

// POST /api/plans { plan_date, slot, saved_meal_id }
module.exports.createPlan = async (req, res, next) => {
  try {
    const { plan_date, slot, saved_meal_id } = req.body;
    if (!isValidDate(plan_date)) {
      return res.status(400).send({ error: 'plan_date must be a real date in YYYY-MM-DD format.' });
    }
    if (!planModel.SLOTS.includes(slot)) {
      return res.status(400).send({ error: `slot must be one of: ${planModel.SLOTS.join(', ')}.` });
    }
    if (!isValidId(String(saved_meal_id))) {
      return res.status(400).send({ error: 'saved_meal_id must be the id of one of your saved meals.' });
    }

    const plan = await planModel.create(req.session.user_id, { plan_date, slot, saved_meal_id });
    if (plan.error === 'meal_not_found') return res.status(404).send({ error: 'Saved meal not found.' });
    if (plan.error === 'slot_taken') {
      return res.status(409).send({ error: `There is already a ${slot} planned for that day.` });
    }
    res.status(201).send(plan);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/plans/:planned_meal_id
// Another user's plan gets the same 404 as a missing one, so ids can't be
// probed to find out which plans exist.
module.exports.deletePlan = async (req, res, next) => {
  try {
    const { planned_meal_id } = req.params;
    if (!isValidId(planned_meal_id)) return res.status(404).send({ error: 'Plan not found.' });

    const plan = await planModel.destroy(planned_meal_id, req.session.user_id);
    if (!plan) return res.status(404).send({ error: 'Plan not found.' });
    res.send(plan);
  } catch (err) {
    next(err);
  }
};

const LOG_ERRORS = {
  not_found: [404, 'Plan not found.'],
  already_logged: [409, 'This plan has already been logged.'],
  future: [400, "You can't log a meal for a day that hasn't happened yet."],
};

// POST /api/plans/:planned_meal_id/log
// Creates a meal from the plan and marks the plan as followed.
module.exports.logPlan = async (req, res, next) => {
  try {
    const { planned_meal_id } = req.params;
    if (!isValidId(planned_meal_id)) return res.status(404).send({ error: 'Plan not found.' });

    const result = await planModel.logAsMeal(planned_meal_id, req.session.user_id);
    if (result.error) {
      const [status, message] = LOG_ERRORS[result.error];
      return res.status(status).send({ error: message });
    }
    res.status(201).send(result);
  } catch (err) {
    next(err);
  }
};
