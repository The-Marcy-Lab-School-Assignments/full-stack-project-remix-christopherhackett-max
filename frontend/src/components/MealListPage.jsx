import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchAllMeals, logMeal } from '../adapters/meal-adapters';
import { deleteSavedMeal, fetchSavedMeals } from '../adapters/saved-meal-adapters';
import MealList from './MealList';
import SavedMealList from './SavedMealList';

// Two tabs: My Meals (the saved collection) and History (what was eaten).
// The tab lives in the URL (?tab=history) so a refresh keeps it.
function MealListPage({ currentUser }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'history' ? 'history' : 'saved';
  const [savedMeals, setSavedMeals] = useState([]);
  const [meals, setMeals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadMeals = async () => {
    setError(null);
    const [saved, eaten] = await Promise.all([fetchSavedMeals(), fetchAllMeals()]);
    if (saved.error || eaten.error) {
      setError('Could not load meals.');
    } else {
      setSavedMeals(saved.data);
      setMeals(eaten.data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadMeals();
  }, []);

  const handleLog = async (meal) => {
    const { error: logError } = await logMeal(meal.saved_meal_id);
    setNotice(logError ? `Could not log ${meal.name}.` : `Logged ${meal.name}.`);
    loadMeals();
  };

  const handleRemove = async (meal) => {
    const shouldRemove = window.confirm(`Remove ${meal.name} from My Meals? Your history keeps the times you ate it.`);
    if (!shouldRemove) return;
    const { error: removeError } = await deleteSavedMeal(meal.saved_meal_id);
    setNotice(removeError ? `Could not remove ${meal.name}.` : `Removed ${meal.name}.`);
    loadMeals();
  };

  const showTab = (next) => {
    setNotice(null);
    setSearchParams(next === 'history' ? { tab: 'history' } : {});
  };

  return (
    <main className="p4-screen list-screen">
      <header className="page-header">
        <Link to="/menu" className="back-link">Back</Link>
        <h1>Item</h1>
      </header>

      <section className="inventory-panel">
        <div className="panel-title-row meal-tabs" role="tablist" aria-label="Meals">
          <button type="button" role="tab" aria-selected={tab === 'saved'} className={tab === 'saved' ? 'active' : ''} onClick={() => showTab('saved')}>
            My Meals
          </button>
          <button type="button" role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => showTab('history')}>
            History
          </button>
          <Link to="/meals/add" className="meal-tabs-add">+ Add</Link>
        </div>
        {notice && <p className="panel-message success-message" role="status">{notice}</p>}
        {isLoading && <p className="panel-message">Loading meals...</p>}
        {error && <p className="error">{error}</p>}
        {!isLoading && !error && tab === 'saved' && (
          <SavedMealList savedMeals={savedMeals} onLog={handleLog} onRemove={handleRemove} />
        )}
        {!isLoading && !error && tab === 'history' && (
          <MealList meals={meals} loadMeals={loadMeals} timezone={currentUser?.timezone} />
        )}
      </section>
      <div className="rainbow-bar vertical" aria-hidden="true" />
    </main>
  );
}

export default MealListPage;
