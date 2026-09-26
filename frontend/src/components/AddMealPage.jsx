import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MEAL_TYPES, guessMealType } from '../mealTypes';
import AddMealForm from './AddMealForm';

function AddMealPage() {
  const navigate = useNavigate();
  // "Add one" links from an empty section pass ?type=lunch.
  const [searchParams] = useSearchParams();
  const requestedType = searchParams.get('type');
  const defaultType = MEAL_TYPES.includes(requestedType) ? requestedType : guessMealType();

  return (
    <main className="p4-screen form-screen">
      <header className="page-header">
        <Link to="/menu" className="back-link">Back</Link>
        <h1>Add Meal</h1>
      </header>
      <section className="form-panel">
        <AddMealForm defaultType={defaultType} onMealAdded={() => navigate('/meals')} />
      </section>
      <div className="rainbow-bar" aria-hidden="true" />
    </main>
  );
}

export default AddMealPage;
