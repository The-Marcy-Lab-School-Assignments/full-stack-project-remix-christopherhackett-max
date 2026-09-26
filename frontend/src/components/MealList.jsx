import MealItem from './MealItem';

// 'YYYY-MM-DD' for the day a meal was eaten, in the user's timezone. Grouping
// by this (not the UTC date) keeps a late dinner under the right day, matching
// the Daily Report.
const localDay = (loggedAt, timezone) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(loggedAt));

const formatDay = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
});

function MealList({ meals, loadMeals, timezone }) {
  if (meals.length === 0) {
    return <p className="panel-message">No meals logged yet.</p>;
  }

  // Meals arrive newest first, so days come out newest first too.
  const days = [];
  for (const meal of meals) {
    const day = localDay(meal.logged_at, timezone);
    if (days.at(-1)?.day !== day) days.push({ day, meals: [] });
    days.at(-1).meals.push(meal);
  }

  return (
    <div className="meal-days">
      {days.map(({ day, meals: dayMeals }) => (
        <section key={day} className="meal-day" aria-label={formatDay(day)}>
          <h2 className="meal-day-header">
            <span>{formatDay(day)}</span>
            <span>{dayMeals.reduce((sum, meal) => sum + meal.calories, 0)} CAL</span>
          </h2>
          <ul className="meal-list">
            {dayMeals.map((meal) => (
              <MealItem key={meal.meal_id} meal={meal} loadMeals={loadMeals} timezone={timezone} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default MealList;
