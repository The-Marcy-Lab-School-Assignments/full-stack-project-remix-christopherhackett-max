const nutritionModel = require('../models/nutritionModel');
const { isValidDate } = require('../utils/validation');

const MAX_RANGE_DAYS = 366;

const daysBetween = (from, to) => (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000;

// GET /api/nutrition/daily?from=YYYY-MM-DD&to=YYYY-MM-DD
// Both dates are optional, but must be sent together. Without them the report
// covers the last 14 days in the user's timezone.
module.exports.getDailyTotals = async (req, res, next) => {
  try {
    const { from = null, to = null } = req.query;

    if ((from === null) !== (to === null)) {
      return res.status(400).send({ error: 'Send both from and to, or neither.' });
    }
    if (from !== null) {
      if (!isValidDate(from) || !isValidDate(to)) {
        return res.status(400).send({ error: 'Dates must be real dates in YYYY-MM-DD format.' });
      }
      if (from > to) return res.status(400).send({ error: 'from must be on or before to.' });
      if (daysBetween(from, to) >= MAX_RANGE_DAYS) {
        return res.status(400).send({ error: `Range cannot be longer than ${MAX_RANGE_DAYS} days.` });
      }
    }

    const days = await nutritionModel.dailyTotals(req.session.user_id, from, to);
    res.send(days);
  } catch (err) {
    next(err);
  }
};

// GET /api/nutrition/streaks
module.exports.getStreaks = async (req, res, next) => {
  try {
    const streaks = await nutritionModel.streaks(req.session.user_id);
    res.send(streaks);
  } catch (err) {
    next(err);
  }
};
