// A failed request keeps the server's error message (e.g. 'You already have a
// meal called "Toast".') so pages can show it.
const handleFetch = async (url, options = {}) => {
  try {
    const response = await fetch(url, {
      credentials: 'include',
      ...options,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || `Fetch failed. ${response.status} ${response.statusText}`);
    }
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const fetchSavedMeals = async () => {
  return handleFetch('/api/saved-meals');
};

export const fetchSavedMeal = async (saved_meal_id) => {
  return handleFetch(`/api/saved-meals/${saved_meal_id}`);
};

export const createSavedMeal = async (meal) => {
  return handleFetch('/api/saved-meals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meal),
  });
};

export const deleteSavedMeal = async (saved_meal_id) => {
  return handleFetch(`/api/saved-meals/${saved_meal_id}`, { method: 'DELETE' });
};
