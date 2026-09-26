const handleFetch = async (url, options = {}) => {
  try {
    const response = await fetch(url, {
      credentials: 'include',
      ...options,
    });
    if (!response.ok) throw new Error(`Fetch failed. ${response.status} ${response.statusText}`);
    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const getMe = async () => {
  return handleFetch('/api/auth/me');
};

// Sends the browser's timezone so the server knows which calendar day
// each meal belongs to.
export const register = async (username, password) => {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return handleFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, timezone }),
  });
};

export const login = async (username, password) => {
  return handleFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
};

export const logout = async () => {
  return handleFetch('/api/auth/logout', { method: 'DELETE' });
};

export const updateAccount = async (username, password) => {
  return handleFetch('/api/auth/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
};

export const deleteAccount = async () => {
  return handleFetch('/api/auth/me', { method: 'DELETE' });
};
