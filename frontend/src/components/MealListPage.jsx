import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAllMeals } from '../adapters/meal-adapters';
import MealList from './MealList';

function MealListPage() {
  const [meals, setMeals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadMeals = async () => {
    setIsLoading(true);
    setError(null);
    const { data, error: fetchError } = await fetchAllMeals();
    if (fetchError) {
      setError('Could not load meals.');
    } else {
      setMeals(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadMeals();
  }, []);

  return (
    <main className="p4-screen list-screen">
      <header className="page-header">
        <Link to="/menu" className="back-link">Back</Link>
        <h1>Item</h1>
      </header>

      <section className="inventory-panel">
        <div className="panel-title-row">
          <span>Meal</span>
          <span>CAL</span>
        </div>
        {isLoading && <p className="panel-message">Loading meals...</p>}
        {error && <p className="error">{error}</p>}
        {!isLoading && !error && <MealList meals={meals} loadMeals={loadMeals} />}
      </section>
      <div className="rainbow-bar vertical" aria-hidden="true" />
    </main>
  );
}

export default MealListPage;
