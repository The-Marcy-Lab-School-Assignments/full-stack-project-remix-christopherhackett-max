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

export const fetchMeal = async (meal_id) => {
  return handleFetch(`/api/meals/${meal_id}`);
};

export const createMeal = async (name, calories, protein_g, carbs_g, fat_g, photo_data = null) => {
  return handleFetch('/api/meals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, calories, protein_g, carbs_g, fat_g, photo_data }),
  });
};

export const deleteMeal = async (meal_id) => {
  return handleFetch(`/api/meals/${meal_id}`, { method: 'DELETE' });
};
