import { Link } from 'react-router-dom';
import { MEAL_TYPES } from '../mealTypes';

function SavedMealRow({ meal, onLog, onRemove }) {
  return (
    <li className="meal-row saved-meal-row">
      <Link to={`/meals/${meal.saved_meal_id}`} className="meal-row-link">
        <span className="meal-row-name">
          <small>{meal.times_eaten === 1 ? 'Eaten once' : `Eaten ${meal.times_eaten} times`}</small>
          {meal.name}
        </span>
        <strong>{meal.calories}</strong>
      </Link>
      <div className="saved-meal-actions">
        <button type="button" className="log-btn" onClick={() => onLog(meal)}>Log it</button>
        <button type="button" className="delete-btn" onClick={() => onRemove(meal)} aria-label={`Remove ${meal.name} from My Meals`}>
          Remove
        </button>
      </div>
    </li>
  );
}

// Saved meals grouped under Breakfast, Lunch, Dinner and Snack.
function SavedMealList({ savedMeals, onLog, onRemove }) {
  return (
    <div className="meal-days">
      {MEAL_TYPES.map((type) => {
        const meals = savedMeals.filter((meal) => meal.meal_type === type);
        return (
          <section key={type} className="meal-day" aria-label={type}>
            <h2 className="meal-day-header">
              <span>{type}</span>
              <span>{meals.length} saved</span>
            </h2>
            {meals.length > 0 ? (
              <ul className="meal-list">
                {meals.map((meal) => (
                  <SavedMealRow key={meal.saved_meal_id} meal={meal} onLog={onLog} onRemove={onRemove} />
                ))}
              </ul>
            ) : (
              <p className="panel-message">
                No {type} meals saved yet. <Link to={`/meals/add?type=${type}`}>Add one</Link>
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

export default SavedMealList;
