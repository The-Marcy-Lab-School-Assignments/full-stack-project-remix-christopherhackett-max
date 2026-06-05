import MealItem from './MealItem';

function MealList({ meals, loadMeals }) {
  if (meals.length === 0) {
    return <p className="panel-message">No meals logged yet.</p>;
  }

  return (
    <ul className="meal-list">
      {meals.map((meal) => (
        <MealItem
          key={meal.meal_id}
          meal={meal}
          loadMeals={loadMeals}
        />
      ))}
    </ul>
  );
}

export default MealList;
