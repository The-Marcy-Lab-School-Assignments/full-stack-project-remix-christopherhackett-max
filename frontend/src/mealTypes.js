export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

// A sensible default type for a meal being added right now.
export const guessMealType = (date = new Date()) => {
  const hour = date.getHours();
  if (hour >= 4 && hour <= 10) return 'breakfast';
  if (hour >= 11 && hour <= 15) return 'lunch';
  if (hour >= 16 && hour <= 21) return 'dinner';
  return 'snack';
};
