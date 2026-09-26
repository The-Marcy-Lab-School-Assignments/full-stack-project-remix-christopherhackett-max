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

// from/to are 'YYYY-MM-DD'. Leave both out for the last 14 days.
export const fetchDailyTotals = async (from, to) => {
  const params = from && to ? `?${new URLSearchParams({ from, to })}` : '';
  return handleFetch(`/api/nutrition/daily${params}`);
};

export const fetchStreaks = async () => {
  return handleFetch('/api/nutrition/streaks');
};
