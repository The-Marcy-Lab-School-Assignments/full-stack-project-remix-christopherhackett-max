// Like the other adapters, but a failed request keeps the server's error
// message (e.g. "There is already a lunch planned for that day.") so the
// planner can show it.
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

// week is any 'YYYY-MM-DD' in the week, or null for the current week.
export const fetchWeek = async (week = null) => {
  const params = week ? `?${new URLSearchParams({ week })}` : '';
  return handleFetch(`/api/plans${params}`);
};

export const createPlan = async (plan) => {
  return handleFetch('/api/plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(plan),
  });
};

export const deletePlan = async (planned_meal_id) => {
  return handleFetch(`/api/plans/${planned_meal_id}`, { method: 'DELETE' });
};

export const logPlan = async (planned_meal_id) => {
  return handleFetch(`/api/plans/${planned_meal_id}/log`, { method: 'POST' });
};
