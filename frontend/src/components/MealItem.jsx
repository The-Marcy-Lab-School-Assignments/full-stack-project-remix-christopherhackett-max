import { Link } from 'react-router-dom';
import { deleteMeal } from '../adapters/meal-adapters';

const formatTime = (loggedAt, timezone) => new Date(loggedAt).toLocaleTimeString('en-US', {
  hour: 'numeric', minute: '2-digit', timeZone: timezone,
});

function MealItem({ meal, loadMeals, timezone }) {
  const handleDelete = async () => {
    const { error } = await deleteMeal(meal.meal_id);
    if (error) return console.error(error);
    loadMeals();
  };

  return (
    <li className="meal-row">
      <Link to={`/meals/${meal.meal_id}`} className="meal-row-link">
        <span className="meal-row-name">
          <small>{formatTime(meal.logged_at, timezone)}</small>
          {meal.name}
        </span>
        <strong>{meal.calories}</strong>
      </Link>
      <button className="delete-btn" type="button" onClick={handleDelete}>Delete</button>
    </li>
  );
}

export default MealItem;
