import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSavedMeals } from '../adapters/saved-meal-adapters';

// Pick one of your saved meals for a planner slot. Shows meals of the slot's
// type first; "Show all types" lets you plan, say, leftovers from dinner for lunch.
function MealPicker({ dayLabel, slot, onPick, onCancel }) {
  const [savedMeals, setSavedMeals] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await fetchSavedMeals();
      if (error) setErrorMessage('Could not load your meals.');
      else setSavedMeals(data);
    };
    load();
  }, []);

  const handlePick = async (meal) => {
    setIsSaving(true);
    const error = await onPick(meal);
    setIsSaving(false);
    if (error) setErrorMessage(error);
  };

  const choices = (savedMeals || []).filter((meal) => showAll || meal.meal_type === slot);

  return (
    <div className="plan-form-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="plan-form meal-picker"
        role="dialog"
        aria-modal="true"
        aria-label={`Choose a ${slot} for ${dayLabel}`}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="small-label">{dayLabel}</p>
        <h2>Plan {slot}</h2>
        <label className="picker-toggle">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show all types
        </label>
        {savedMeals === null && !errorMessage && <p>Loading your meals...</p>}
        {savedMeals !== null && choices.length === 0 && (
          <p>
            No {showAll ? '' : `${slot} `}meals saved yet. <Link to={`/meals/add?type=${slot}`}>Add one to My Meals</Link>
          </p>
        )}
        {choices.length > 0 && (
          <ul className="picker-list">
            {choices.map((meal) => (
              <li key={meal.saved_meal_id}>
                <button type="button" onClick={() => handlePick(meal)} disabled={isSaving}>
                  <span>
                    {meal.name}
                    {showAll && <small>{meal.meal_type}</small>}
                  </span>
                  <strong>{meal.calories} CAL</strong>
                </button>
              </li>
            ))}
          </ul>
        )}
        {errorMessage && <p className="error">{errorMessage}</p>}
        <div className="account-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default MealPicker;
