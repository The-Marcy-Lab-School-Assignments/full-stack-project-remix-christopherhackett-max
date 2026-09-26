import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getMe, login, register, logout } from './adapters/auth-adapters';
import AuthPage from './components/AuthPage';
import MenuPage from './components/MenuPage';
import MealListPage from './components/MealListPage';
import MealDetailPage from './components/MealDetailPage';
import AddMealPage from './components/AddMealPage';
import AccountPage from './components/AccountPage';
import DailyReportPage from './components/DailyReportPage';
import PlannerPage from './components/PlannerPage';
import './App.css';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // On every page load, check the server for an active session cookie.
  // React state doesn't survive a refresh; session cookies do.
  useEffect(() => {
    const checkForSession = async () => {
      const { data: user } = await getMe();
      setCurrentUser(user);
      setIsLoading(false);
    };
    checkForSession();
  }, []);

  const handleLogin = async (username, password) => {
    const { data: user, error } = await login(username, password);
    if (error) return error;
    setCurrentUser(user);
  };

  const handleRegister = async (username, password) => {
    const { data: user, error } = await register(username, password);
    if (error) return error;
    setCurrentUser(user);
  };

  const handleLogout = async () => {
    const { error } = await logout();
    if (error) return error;
    setCurrentUser(null);
  };

  const handleAccountUpdate = (user) => {
    setCurrentUser(user);
  };

  // Don't render routes until session check is complete —
  // prevents a flash of the login page for returning users
  if (isLoading) return <div className="loading-screen">LOADING...</div>;

  return (
    <BrowserRouter>
      <Routes>
        {/* Public route — redirect to menu if already logged in */}
        <Route
          path="/"
          element={currentUser
            ? <Navigate to="/menu" replace />
            : <AuthPage handleLogin={handleLogin} handleRegister={handleRegister} />}
        />

        {/* Protected routes — redirect to login if not logged in */}
        <Route
          path="/menu"
          element={currentUser
            ? <MenuPage currentUser={currentUser} handleLogout={handleLogout} />
            : <Navigate to="/" replace />}
        />
        <Route
          path="/meals"
          element={currentUser
            ? <MealListPage currentUser={currentUser} />
            : <Navigate to="/" replace />}
        />
        <Route
          path="/meals/:meal_id"
          element={currentUser
            ? <MealDetailPage />
            : <Navigate to="/" replace />}
        />
        <Route
          path="/meals/add"
          element={currentUser
            ? <AddMealPage currentUser={currentUser} />
            : <Navigate to="/" replace />}
        />
        <Route
          path="/report"
          element={currentUser
            ? <DailyReportPage currentUser={currentUser} />
            : <Navigate to="/" replace />}
        />
        <Route
          path="/plan"
          element={currentUser
            ? <PlannerPage />
            : <Navigate to="/" replace />}
        />
        <Route
          path="/account"
          element={currentUser
            ? (
              <AccountPage
                currentUser={currentUser}
                handleAccountUpdate={handleAccountUpdate}
                handleLogout={handleLogout}
              />
            )
            : <Navigate to="/" replace />}
        />

        {/* Catch-all — redirect unknown routes to root */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
