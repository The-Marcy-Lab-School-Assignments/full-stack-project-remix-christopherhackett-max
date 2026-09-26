import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPlan, deletePlan, fetchWeek, logPlan } from '../adapters/plan-adapters';
import PlanForm from './PlanForm';

const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];

const shiftDay = (day, offset) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

// Day strings are calendar dates, so format them in UTC to avoid the browser's
// own timezone moving them by a day.
const formatDay = (day, options) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });

const signed = (value) => (value > 0 ? `+${value}` : `${value}`);

function PlanSlot({ day, slot, plan, onAdd, onLog, onDelete }) {
  const isFuture = !day.is_past && !day.is_today;

  if (!plan) {
    return (
      <li className="plan-slot empty">
        <span className="plan-slot-label">{slot}</span>
        <button type="button" className="plan-add" onClick={() => onAdd(day.day, slot)}>+ Add</button>
      </li>
    );
  }

  const isLogged = plan.meal_id !== null;
  // A past plan that was never logged counts as missed.
  const status = isLogged ? 'logged' : day.is_past ? 'missed' : 'pending';

  return (
    <li className={`plan-slot ${status}`}>
      <span className="plan-slot-label">{slot}</span>
      <strong className="plan-name">{plan.name}</strong>
      <span className="plan-cal">{plan.calories} CAL</span>
      <div className="plan-actions">
        {isLogged && <span className="plan-badge">Eaten</span>}
        {!isLogged && !isFuture && (
          <button type="button" className="plan-log" onClick={() => onLog(plan)}>Log it</button>
        )}
        <button
          type="button"
          className="plan-delete"
          onClick={() => onDelete(plan)}
          aria-label={`Remove ${plan.name} from ${slot}`}
        >
          ×
        </button>
      </div>
    </li>
  );
}

function PlanDay({ day, ...slotHandlers }) {
  const weekday = formatDay(day.day, { weekday: 'short' });
  const plansBySlot = Object.fromEntries(day.plans.map((plan) => [plan.slot, plan]));
  const hasHappened = day.is_past || day.is_today;

  return (
    <section
      className={`plan-day ${weekday.toLowerCase()}${day.is_today ? ' today' : ''}${day.is_past ? ' past' : ''}`}
      aria-label={formatDay(day.day, { weekday: 'long', month: 'long', day: 'numeric' })}
    >
      <header className="plan-day-header">
        <span className="plan-date">{formatDay(day.day, { day: 'numeric' })}</span>
        <span className="plan-weekday">{weekday}</span>
        {day.is_today && <span className="today-tag">Today</span>}
      </header>
      <ul className="plan-slots">
        {SLOTS.map((slot) => (
          <PlanSlot key={slot} day={day} slot={slot} plan={plansBySlot[slot]} {...slotHandlers} />
        ))}
      </ul>
      <footer className="plan-day-footer">
        <span>Plan {day.planned_calories}</span>
        {hasHappened && <span>Ate {day.actual_calories}</span>}
        {/* Today isn't over, so comparing it to the full day's plan would
            always look like undereating. Only finished days get a verdict. */}
        {day.calorie_diff !== null && day.is_past && (
          <span className={`plan-diff${day.calorie_diff > 0 ? ' over' : ''}`}>{signed(day.calorie_diff)}</span>
        )}
        {day.is_today && day.planned_count > 0 && <span className="plan-progress">In progress</span>}
      </footer>
    </section>
  );
}

function PlannerPage() {
  // null means "the current week", which the server works out in the user's timezone.
  const [weekOf, setWeekOf] = useState(null);
  const [week, setWeek] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [adding, setAdding] = useState(null);

  // Numbers each request so only the newest one updates the page. Clicking
  // Next twice fast sends two requests, and they can come back out of order.
  const latestRequest = useRef(0);

  const loadWeek = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setError(null);
    const { data, error: fetchError } = await fetchWeek(weekOf);
    if (requestId !== latestRequest.current) return;
    if (fetchError) {
      setError('Could not load this week.');
    } else {
      setWeek(data);
    }
    setIsLoading(false);
  }, [weekOf]);

  useEffect(() => {
    setIsLoading(true);
    loadWeek();
  }, [loadWeek]);

  const runAction = async (request) => {
    setActionError(null);
    const { error: requestError } = await request();
    if (requestError) setActionError(requestError.message);
    await loadWeek();
  };

  const handleAdd = (day, slot) => setAdding({ day, slot });
  const handleLog = (plan) => runAction(() => logPlan(plan.planned_meal_id));
  const handleDelete = (plan) => runAction(() => deletePlan(plan.planned_meal_id));

  const handleSubmitPlan = async (fields) => {
    const { error: requestError } = await createPlan({ ...fields, plan_date: adding.day, slot: adding.slot });
    if (requestError) return requestError.message;
    setAdding(null);
    await loadWeek();
    return null;
  };

  const summary = week?.summary;

  return (
    <main className="p4-screen planner-screen">
      <header className="page-header">
        <Link to="/menu" className="back-link">Back</Link>
        <h1>Planner</h1>
      </header>

      <nav className="week-nav" aria-label="Week">
        <button type="button" onClick={() => setWeekOf(shiftDay(week.week_start, -7))} disabled={!week}>
          ◀ Prev
        </button>
        <p>
          <span className="small-label">Week of</span>
          <strong>{week ? formatDay(week.week_start, { month: 'long', day: 'numeric' }) : '—'}</strong>
        </p>
        <button type="button" onClick={() => setWeekOf(shiftDay(week.week_start, 7))} disabled={!week}>
          Next ▶
        </button>
        <button type="button" className="week-today" onClick={() => setWeekOf(null)} disabled={weekOf === null}>
          This week
        </button>
      </nav>

      {summary && (
        <section className="report-summary planner-summary" aria-label="Week summary">
          <div className="report-stat">
            <span className="small-label">Plan followed</span>
            <strong>{summary.follow_rate === null ? '—' : `${summary.follow_rate}%`}</strong>
            <span>
              {summary.planned_meals
                ? `${summary.followed_meals} of ${summary.planned_meals} planned meals`
                : 'No finished plans this week'}
            </span>
          </div>
          <div className="report-stat">
            <span className="small-label">Avg vs plan</span>
            <strong>{summary.avg_calorie_diff === null ? '—' : signed(summary.avg_calorie_diff)}</strong>
            <span>calories per day</span>
          </div>
        </section>
      )}

      {isLoading && <p className="panel-message">Loading week...</p>}
      {error && <p className="error panel-message">{error}</p>}
      {actionError && <p className="error panel-message" role="alert">{actionError}</p>}
      {week && !isLoading && (
        <div className="plan-week">
          {week.days.map((day) => (
            <PlanDay key={day.day} day={day} onAdd={handleAdd} onLog={handleLog} onDelete={handleDelete} />
          ))}
        </div>
      )}
      <p className="panel-message plan-footnote">
        Scores count finished days only. A plan counts as followed when you log it with Log it.
      </p>

      {adding && (
        <PlanForm
          dayLabel={formatDay(adding.day, { weekday: 'long', month: 'long', day: 'numeric' })}
          slot={adding.slot}
          onSubmit={handleSubmitPlan}
          onCancel={() => setAdding(null)}
        />
      )}
      <div className="rainbow-bar" aria-hidden="true" />
    </main>
  );
}

export default PlannerPage;
