import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { logMeal } from '../adapters/meal-adapters';
import { fetchSavedMeal } from '../adapters/saved-meal-adapters';

function MacroStat({ label, value, max }) {
  const percent = Math.min(100, Math.round((Number(value || 0) / max) * 100));

  return (
    <div className="macro-stat">
      <span>{label}</span>
      <div className="stat-track">
        <div style={{ width: `${percent}%` }} />
      </div>
      <strong>{value}g</strong>
    </div>
  );
}

const formatDate = (timestamp) => new Date(timestamp).toLocaleDateString('en-US', {
  weekday: 'short', month: 'short', day: 'numeric',
});

// One saved meal: its numbers, and how often it has been eaten.
function MealDetailPage() {
  const { saved_meal_id } = useParams();
  const [meal, setMeal] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadMeal = async () => {
    const { data, error: fetchError } = await fetchSavedMeal(saved_meal_id);
    if (fetchError) {
      setError('Could not load this meal.');
    } else {
      setMeal(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadMeal();
  }, [saved_meal_id]);

  const handleLog = async () => {
    const { error: logError } = await logMeal(meal.saved_meal_id);
    setNotice(logError ? 'Could not log this meal.' : 'Logged as eaten just now.');
    loadMeal();
  };

  return (
    <main className="p4-screen detail-screen">
      <header className="page-header">
        <Link to="/meals" className="back-link">Back</Link>
        <h1>Status</h1>
      </header>

      {isLoading && <p className="panel-message">Loading stats...</p>}
      {error && <p className="error">{error}</p>}
      {meal && (
        <section className="status-card">
          <div className="meal-portrait" aria-hidden="true">
            {meal.photo_data
              ? <img src={meal.photo_data} alt="" />
              : <span>{meal.name.charAt(0)}</span>}
          </div>
          <div className="status-info">
            <p className="small-label">{meal.meal_type}</p>
            <h2>{meal.name}</h2>
            <div className="calorie-badge">{meal.calories} CAL</div>
            <MacroStat label="Protein" value={meal.protein_g} max={80} />
            <MacroStat label="Carbs" value={meal.carbs_g} max={120} />
            <MacroStat label="Fat" value={meal.fat_g} max={60} />
            <p className="meal-eaten-stats">
              {meal.times_eaten === 0
                ? 'Not eaten yet.'
                : `Eaten ${meal.times_eaten === 1 ? 'once' : `${meal.times_eaten} times`}. Last on ${formatDate(meal.last_eaten_at)}.`}
            </p>
            {notice && <p className="success" role="status">{notice}</p>}
            <button type="button" className="account-action" onClick={handleLog}>Log it</button>
          </div>
        </section>
      )}
    </main>
  );
}

export default MealDetailPage;
