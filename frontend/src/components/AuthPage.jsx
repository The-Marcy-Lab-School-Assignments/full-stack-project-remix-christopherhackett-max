import { useState } from 'react';

function LoginForm({ handleLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const error = await handleLogin(username, password);
    if (error) {
      setErrorMessage('Invalid username or password.');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Log In</h2>
      <input
        type="text"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {errorMessage && <p className="error">{errorMessage}</p>}
      <button type="submit">Log In</button>
    </form>
  );
}

function RegisterForm({ handleRegister }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const error = await handleRegister(username, password);
    if (error) {
      setErrorMessage('Could not register. Username may already be taken.');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Register</h2>
      <input
        type="text"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {errorMessage && <p className="error">{errorMessage}</p>}
      <button type="submit">Register</button>
    </form>
  );
}

function AuthPage({ handleLogin, handleRegister }) {
  return (
    <main className="p4-screen auth-screen">
      <div className="title-card">
        <p className="small-label">Press start by signing in</p>
        <h1>Nourish</h1>
      </div>
      <section id="auth-section" aria-label="Authentication">
        <LoginForm handleLogin={handleLogin} />
        <RegisterForm handleRegister={handleRegister} />
      </section>
      <div className="rainbow-bar" aria-hidden="true" />
    </main>
  );
}

export default AuthPage;
