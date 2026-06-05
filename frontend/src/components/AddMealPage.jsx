import { Link, useNavigate } from 'react-router-dom';
import AddMealForm from './AddMealForm';

function AddMealPage() {
  const navigate = useNavigate();

  return (
    <main className="p4-screen form-screen">
      <header className="page-header">
        <Link to="/menu" className="back-link">Back</Link>
        <h1>Add Meal</h1>
      </header>
      <section className="form-panel">
        <AddMealForm onMealAdded={() => navigate('/meals')} />
      </section>
      <div className="rainbow-bar" aria-hidden="true" />
    </main>
  );
}

export default AddMealPage;
