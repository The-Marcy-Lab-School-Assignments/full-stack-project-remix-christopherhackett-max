// Input checks shared by the meal, plan, and report controllers.

const MIN_YEAR = 1900;
const MAX_YEAR = 2999;

// True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30).
// The year range also keeps out 0000, which JavaScript accepts but Postgres
// does not.
module.exports.isValidDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

const MAX_NAME_LENGTH = 100;
const MAX_CALORIES = 10000;
const MAX_MACRO_GRAMS = 1000;

const isWholeNumberInRange = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;

// Validates the name and nutrition fields shared by meals and planned meals.
// Returns { values } with a trimmed name and macros defaulted to 0, or
// { error } with a message for the client. Numbers must be JSON numbers:
// the columns are INTEGER, so 12.5 or "12" would fail in Postgres anyway.
module.exports.parseNutrition = (body) => {
  const { name, calories, protein_g = 0, carbs_g = 0, fat_g = 0 } = body;
  const cleanName = typeof name === 'string' ? name.trim() : '';

  if (!cleanName) return { error: 'Name is required.' };
  if (cleanName.length > MAX_NAME_LENGTH) return { error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` };
  if (calories === undefined) return { error: 'Calories is required.' };
  if (!isWholeNumberInRange(calories, MAX_CALORIES)) {
    return { error: `Calories must be a whole number from 0 to ${MAX_CALORIES}.` };
  }
  for (const [field, value] of [['protein_g', protein_g], ['carbs_g', carbs_g], ['fat_g', fat_g]]) {
    if (!isWholeNumberInRange(value, MAX_MACRO_GRAMS)) {
      return { error: `${field} must be a whole number from 0 to ${MAX_MACRO_GRAMS}.` };
    }
  }

  return { values: { name: cleanName, calories, protein_g, carbs_g, fat_g } };
};

// Route params arrive as strings. Postgres rejects non-numeric ids for an
// INTEGER column with an error, so check them first and answer 404 instead.
module.exports.isValidId = (value) => /^\d{1,9}$/.test(value);
