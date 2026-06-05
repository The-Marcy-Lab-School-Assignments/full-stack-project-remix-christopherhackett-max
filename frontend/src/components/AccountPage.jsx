import { Link } from 'react-router-dom';
import { useState } from 'react';
import { deleteAccount, updateAccount } from '../adapters/auth-adapters';

function AccountPage({ currentUser, handleAccountUpdate, handleLogout }) {
  const [username, setUsername] = useState(currentUser.username);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setErrorMessage(null);

    const { data: user, error } = await updateAccount(username, password);
    if (error) {
      setErrorMessage('Could not update account. Username may already be taken.');
      return;
    }

    handleAccountUpdate(user);
    setPassword('');
    setMessage('Account updated.');
  };

  const handleDelete = async () => {
    const shouldDelete = window.confirm('Delete your account and all saved meals?');
    if (!shouldDelete) return;

    const { error } = await deleteAccount();
    if (error) {
      setErrorMessage('Could not delete account.');
      return;
    }

    handleLogout();
  };

  return (
    <main className="p4-screen detail-screen">
      <header className="page-header">
        <Link to="/menu" className="back-link">Back</Link>
        <h1>Account</h1>
      </header>

      <section className="status-card account-card">
        <div className="meal-portrait" aria-hidden="true">
          <span>{currentUser.username.charAt(0)}</span>
        </div>
        <div className="status-info">
          <p className="small-label">User Data</p>
          <h2>{currentUser.username}</h2>
          <form className="account-form" onSubmit={handleSubmit}>
            <label htmlFor="account-username">Username</label>
            <input
              id="account-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />

            <label htmlFor="account-password">New Password</label>
            <input
              id="account-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to keep current"
            />

            {message && <p className="success">{message}</p>}
            {errorMessage && <p className="error">{errorMessage}</p>}

            <div className="account-actions">
              <button type="submit" className="account-action">Save</button>
              <button type="button" className="account-action" onClick={handleLogout}>
                Log Out
              </button>
              <button type="button" className="account-action danger" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}

export default AccountPage;
