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

export const fetchAllMeals = async () => {
  return handleFetch('/api/meals');
};

// Logs one of your saved meals as eaten right now.
export const logMeal = async (saved_meal_id) => {
  return handleFetch('/api/meals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ saved_meal_id }),
  });
};

export const deleteMeal = async (meal_id) => {
  return handleFetch(`/api/meals/${meal_id}`, { method: 'DELETE' });
};
