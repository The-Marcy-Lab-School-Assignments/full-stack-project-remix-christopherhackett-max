import { Link } from 'react-router-dom';

function MenuPage({ currentUser, handleLogout }) {
  return (
    <main className="p4-screen menu-screen">
      <div className="speed-lines" aria-hidden="true" />
      <section className="menu-layout">
        <div className="profile-strip">
          <p className="small-label">Welcome back</p>
          <h1>{currentUser.username}</h1>
          <p>Status: Nourished</p>
        </div>

        <nav className="side-menu" aria-label="Main menu">
          <Link to="/meals">View Meals</Link>
          <Link to="/meals/add">Add Meal</Link>
          <Link to="/account">Account</Link>
          <button type="button" onClick={handleLogout} className="menu-button danger">
            Log Out
          </button>
        </nav>
      </section>
      <div className="rainbow-bar" aria-hidden="true" />
    </main>
  );
}

export default MenuPage;
