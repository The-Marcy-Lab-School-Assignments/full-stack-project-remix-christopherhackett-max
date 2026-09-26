import { Link } from 'react-router-dom';
import { deleteMeal } from '../adapters/meal-adapters';

const formatTime = (loggedAt, timezone) => new Date(loggedAt).toLocaleTimeString('en-US', {
  hour: 'numeric', minute: '2-digit', timeZone: timezone,
});

function RowLink({ savedMealId, children }) {
  if (savedMealId === null) return <div className="meal-row-link">{children}</div>;
  return <Link to={`/meals/${savedMealId}`} className="meal-row-link">{children}</Link>;
}

function MealItem({ meal, loadMeals, timezone }) {
  const handleDelete = async () => {
    const { error } = await deleteMeal(meal.meal_id);
    if (error) return console.error(error);
    loadMeals();
  };

  return (
    <li className="meal-row">
      {/* Links to the saved meal it came from. A meal whose saved meal was
          removed from My Meals has nothing to link to. */}
      <RowLink savedMealId={meal.saved_meal_id}>
        <span className="meal-row-name">
          <small>{formatTime(meal.logged_at, timezone)}</small>
          {meal.name}
        </span>
        <strong>{meal.calories}</strong>
      </RowLink>
      <button className="delete-btn" type="button" onClick={handleDelete}>Delete</button>
    </li>
  );
}

export default MealItem;
