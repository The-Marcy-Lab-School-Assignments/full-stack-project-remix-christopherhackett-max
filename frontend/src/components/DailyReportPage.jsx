import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDailyTotals, fetchStreaks } from '../adapters/nutrition-adapters';

const RANGE_OPTIONS = [7, 14, 30];

// 'YYYY-MM-DD' for today in the given timezone. The en-CA locale formats
// dates in that order.
const todayIn = (timezone) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());

const shiftDay = (day, offset) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

// Day strings are calendar dates, so format them in UTC to avoid the browser's
// own timezone moving them by a day.
const pluralDays = (count) => (count === 1 ? 'day' : 'days');

const formatDay = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
  weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'UTC',
});

function DayRow({ day, maxCalories }) {
  const isEmpty = day.meal_count === 0;
  const percent = maxCalories ? Math.round((day.calories / maxCalories) * 100) : 0;

  return (
    <li className={`report-row${isEmpty ? ' empty' : ''}`}>
      <span className="report-day">{formatDay(day.day)}</span>
      <div className="stat-track" aria-hidden="true">
        <div style={{ width: `${percent}%` }} />
      </div>
      <strong>{isEmpty ? 'No log' : `${day.calories} CAL`}</strong>
      <span className="report-avg">
        {day.calories_7d_avg === null ? '7D avg —' : `7D avg ${day.calories_7d_avg}`}
      </span>
    </li>
  );
}

function DailyReportPage({ currentUser }) {
  const [rangeDays, setRangeDays] = useState(14);
  const [days, setDays] = useState([]);
  const [streaks, setStreaks] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Switching ranges quickly starts a new request before the old one
    // returns. The cleanup marks the old one stale so a slow 7-day response
    // can't overwrite the 30-day one that replaced it.
    let isStale = false;

    const loadReport = async () => {
      setIsLoading(true);
      setError(null);
      const to = todayIn(currentUser.timezone);
      const from = shiftDay(to, -(rangeDays - 1));
      const [daily, streak] = await Promise.all([fetchDailyTotals(from, to), fetchStreaks()]);
      if (isStale) return;
      if (daily.error || streak.error) {
        setError('Could not load your report.');
      } else {
        setDays(daily.data);
        setStreaks(streak.data);
      }
      setIsLoading(false);
    };

    loadReport();
    return () => {
      isStale = true;
    };
  }, [rangeDays, currentUser.timezone]);

  const loggedDays = days.filter((day) => day.meal_count > 0);
  const averageCalories = loggedDays.length
    ? Math.round(loggedDays.reduce((sum, day) => sum + day.calories, 0) / loggedDays.length)
    : null;
  const maxCalories = Math.max(0, ...days.map((day) => day.calories));

  return (
    <main className="p4-screen report-screen">
      <header className="page-header">
        <Link to="/menu" className="back-link">Back</Link>
        <h1>Report</h1>
      </header>

      <section className="report-summary" aria-label="Summary">
        <div className="report-stat">
          <span className="small-label">Current streak</span>
          <strong>{streaks ? streaks.current_streak : '—'}</strong>
          <span>{pluralDays(streaks?.current_streak)}</span>
        </div>
        <div className="report-stat">
          <span className="small-label">Best streak</span>
          <strong>{streaks ? streaks.longest_streak : '—'}</strong>
          <span>{pluralDays(streaks?.longest_streak)}</span>
        </div>
        <div className="report-stat">
          <span className="small-label">Avg per logged day</span>
          <strong>{averageCalories ?? '—'}</strong>
          <span>{loggedDays.length} of {days.length} days logged</span>
        </div>
      </section>

      <section className="inventory-panel report-panel">
        <div className="panel-title-row report-title-row">
          <span>Last {rangeDays} days</span>
          <div className="range-picker" role="group" aria-label="Date range">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={option === rangeDays ? 'active' : ''}
                aria-pressed={option === rangeDays}
                onClick={() => setRangeDays(option)}
              >
                {option}D
              </button>
            ))}
          </div>
        </div>
        {isLoading && <p className="panel-message">Loading report...</p>}
        {error && <p className="error panel-message">{error}</p>}
        {!isLoading && !error && (
          <ul className="report-list">
            {[...days].reverse().map((day) => (
              <DayRow key={day.day} day={day} maxCalories={maxCalories} />
            ))}
          </ul>
        )}
        <p className="report-footnote">
          Days follow your timezone ({currentUser.timezone}). The 7-day average skips days with nothing logged.
        </p>
      </section>
      <div className="rainbow-bar vertical" aria-hidden="true" />
    </main>
  );
}

export default DailyReportPage;
