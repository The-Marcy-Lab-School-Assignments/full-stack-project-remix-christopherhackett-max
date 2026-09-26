# Decisions

Notes on the choices behind the two SQL-heavy features: the daily nutrition
report and the weekly meal planner.

- Report queries: [server/models/nutritionModel.js](server/models/nutritionModel.js)
- Planner queries: [server/models/planModel.js](server/models/planModel.js)
- Schema and the `meals_local` view: [server/db/schema.js](server/db/schema.js)
- Tests: [server/tests/](server/tests/)

# Part 1: Daily Report

## The question

"How am I eating day to day?" A user wants daily calorie and macro totals, a
smoothed trend that isn't thrown off by one big day, and a sense of whether
they are logging consistently.

## 1. Grain: one row per user per local day

Every row in the report is one user on one calendar day. Settling that first
made the rest of the decisions easier: each question below is really "what
belongs in this row?"

## 2. "Day" means the user's day, not the server's

`meals.logged_at` is a `TIMESTAMPTZ`, which Postgres stores as a UTC instant.
Taking the date of that instant directly assigns meals to UTC days. For a user
in New York, anything after 8 PM (EDT) lands on the next day. For a user in
Los Angeles, every dinner after 5 PM does.

The fix is a `timezone` column on `users` (an IANA name such as
`America/Los_Angeles`). The query converts each meal with
`logged_at AT TIME ZONE timezone` before taking the date. The browser sends its
timezone at registration, and the server checks it against
`pg_timezone_names`.

How much it matters in the seed data: chie (Los Angeles) logged meals on
**48** local days. Grouping by UTC date reports **57**, because her dinners
spill into the next UTC day and make it look like a logged day.

Considered and rejected:
- **Group by the server's timezone.** Correct only for users who live where
  the server does.
- **Store a precomputed `local_date` column on meals.** It would go stale if a
  user moves and changes their timezone.

## 3. Days with no meals still get a row

Grouping the `meals` table can only produce days that have meals, so a missed
day silently disappears. The query builds a calendar with `generate_series`
and `LEFT JOIN`s meals onto it, so a missed day shows up as a row with zeros.

`COUNT(m.day)` rather than `COUNT(*)`: after a `LEFT JOIN`, an empty day still
has one row (the calendar row), so `COUNT(*)` would report one meal.
`COUNT(m.day)` counts only matched meals.

## 4. The 7-day rolling average skips days with nothing logged

A day with no meals is most likely a day the user didn't log, not a day they
ate nothing. Counting it as 0 would drag the average down and make a missed
log look like a fasting day. The window uses
`AVG(CASE WHEN meal_count > 0 THEN calories END)`. `AVG` ignores NULLs, so empty
days drop out. `days_logged_7d` is returned next to it, so the UI can show how
many days the average is based on.

Two edge cases in the window:
- **The start of the range.** A report starting Mar 10 still needs Mar 4 to 9
  for Mar 10's average. The calendar starts 6 days early, and those lead-in
  rows are dropped at the end. Without this, the first days of any range would
  average over fewer days than the rest.
- **`ROWS` versus `RANGE`.** `ROWS BETWEEN 6 PRECEDING` counts rows, not days.
  That's only correct because the calendar guarantees exactly one row per day.
  On the raw meals table it would mean "the last 7 meals".

## 5. Streaks use gaps and islands

A streak is a run of consecutive local days with at least one meal. Within a
run, the date and `ROW_NUMBER()` both increase by 1 each day, so
`day - row_number` stays the same across the run and changes after any gap.
Grouping by that difference gives one group per run, and `COUNT(*)` is its
length.

A streak counts as current if its last day is today or yesterday. On a
Tuesday morning, a user who logged every day through Monday hasn't broken
their streak. They just haven't eaten yet.

## 6. Filtering on UTC instants, not converted dates

The range filter compares `logged_at` against the range boundaries converted
to UTC instants, instead of comparing the converted local date. Both return
the same rows, but wrapping the column in a conversion stops Postgres from
using the `(user_id, logged_at)` index.

## 7. Validation

`from` and `to` must be sent together, must be real dates (`2026-02-30` is
rejected), must be in order, and can span at most 366 days. Without them the
report defaults to the last 14 days, where "today" means today in the user's
timezone.

## How it's tested

Each test inserts a few meals whose totals can be checked by hand, then
asserts the exact output. The cases are:
- a late-night meal staying on its local day;
- the same UTC instant falling on different days for two users;
- meals at 23:59 and 00:01 across the range boundary;
- the daylight saving day (Mar 8, 2026 is 23 hours long in New York);
- the rolling average skipping empty days and looking back before the range;
- streak edge cases.

To check that the tests actually catch bugs, I temporarily broke the query two
ways. Grouping by UTC date failed the four timezone tests. Averaging over
empty days failed the four rolling-average tests.

# Part 2: Meal Planner

## The question

"Did I eat what I planned?" A user plans breakfast, lunch, dinner, and a snack
for each day of the week, then wants to see how closely they followed the
plan, day by day and for the week.

## 8. A plan is a DATE, a meal is a TIMESTAMPTZ

`planned_meals.plan_date` is a `DATE`: "dinner on Tuesday" is a calendar day,
not a moment in time, and has no timezone. `meals.logged_at` is the opposite:
the exact instant something was eaten. Comparing the two means turning meals
into local days first (the same `meals_local` view the report uses) and then
matching on date.

`pg` turns `DATE` columns into JavaScript `Date` objects at local midnight by
default. Serialized to JSON, `2026-09-21` can come out as
`2026-09-21T04:00:00.000Z`, and code that reads it back can land on the wrong
day. [server/db/pool.js](server/db/pool.js) tells `pg` to leave dates as
`'YYYY-MM-DD'` strings.

## 9. One definition of "which day was this meal"

The report and the planner both need to know which local day each meal
belongs to. If each query did its own `AT TIME ZONE` conversion, a later fix to
one could make them disagree. So the conversion lives in a single view,
`meals_local` (see [schema.js](server/db/schema.js)), and both features read
from it. This is the same idea as a semantic layer: define a metric once and
make every consumer use that definition.

## 10. One plan per slot per day

`UNIQUE (user_id, plan_date, slot)` enforces it in the database. The API
doesn't check first and then insert. It inserts, and turns the unique
violation (Postgres error `23505`) into a 409. Checking first has a race: two
requests can both see the slot is empty and both insert. The constraint also
works as the index for loading a user's week.

## 11. "Followed" means logged from the plan

Two ways to decide if a plan was followed:
- **Match by name or calories.** The user planned "Chicken salad" and logged
  "chicken salad w/ ranch". Fuzzy, and easy to get wrong in both directions.
- **An explicit link.** The planner's "Log it" button creates the meal from the
  plan and stores its id in `planned_meals.meal_id`.

I chose the link. It's unambiguous, and it's cheap to count:
`COUNT(meal_id)` counts only non-NULL values. `meal_id` is `UNIQUE`, so one
meal can't satisfy two plans. It's `ON DELETE SET NULL`, so deleting the meal
makes the plan unfollowed again instead of leaving a link to nothing. Deleting
a plan keeps its meal: the plan was only the intention, and the meal is what
actually happened.

## 12. Aggregate before joining (avoiding fan-out)

The per-day comparison needs planned totals and eaten totals side by side.
The tempting query joins `planned_meals` to meals on the date and sums both.
That's wrong: with 2 plans and 3 meals on a day, the join makes 2 × 3 = 6
rows, and every sum is inflated (each plan's calories counted 3 times, each
meal's twice).

The fix is to roll each table up to one row per day first (the `planned` and
`actual` CTEs), then join those. One row per day on each side can't multiply.
A test with exactly 2 plans and 3 meals catches the mistake.

## 13. Logging a plan is one transaction with a row lock

"Log it" does two writes: insert a meal, then set the plan's `meal_id`. If the
second failed after the first succeeded, there'd be a meal with no link, and
the plan would still offer "Log it". So both run in a transaction:
`BEGIN`, both writes, `COMMIT`, and `ROLLBACK` on any error.

A double-click sends two requests at once. Both could read `meal_id IS NULL`
before either writes, and both would create a meal. `SELECT ... FOR UPDATE`
locks the plan row, so the second request waits until the first commits, then
sees the link and gets a 409. The test fires two requests together and expects
exactly one meal. With the lock removed, that test failed 5 out of 5 runs.

Timestamps: a plan for today is logged at the current time. A plan for an
earlier day is logged at a fixed time for its slot (dinner at 19:00) on that
day, in the user's timezone, so it lands on the right day in both features.
Future plans can't be logged.

## 14. Week summary counts finished days only

The follow rate and average calorie difference only count days before today.
Today's dinner hasn't been missed yet, and comparing a half-eaten day to the
full day's plan would always look like undereating. The planner shows today
as "In progress" instead of a number. When a week has no finished plans, the
scores show "—" and not 0%. No data is different from a bad week.

## 15. Other people's plans look like missing ones

Deleting or logging someone else's plan returns 404, the same as a plan that
doesn't exist. A 403 would confirm the id belongs to somebody, which lets
anyone probe which ids exist. The query filters on both `planned_meal_id` and
`user_id`, so ownership is checked in the same statement that does the work.

## How it's tested

- [planModel.test.js](server/tests/planModel.test.js): week boundaries
  (Monday, Wednesday, and Sunday input), the 2-plans-3-meals fan-out case,
  local-day matching, followed or unfollowed after a meal is deleted, the week
  summary with hand-computed numbers, logging for today, past, and future days,
  double logging, simultaneous logging, and ownership.
- [api.test.js](server/tests/api.test.js): every protected route answers 401
  without a session, plus validation (text calories, fractional or negative
  numbers, bad dates and slots, non-numeric ids) and ownership over HTTP.

# Found in code review

A review pass after both features were built turned up five bugs. None were
in the report or planner math. They were all at the edges: startup, input,
sessions, and timing. Each fix now has a test that fails without it.

1. **The view would have broken the next schema change.** `meals_local` was
   created with `CREATE OR REPLACE VIEW ... SELECT m.*`. Postgres expands
   `m.*` into a fixed column list when the view is created, and REPLACE can
   only add columns at the end. Adding any column to `meals` would have made
   `ensureSchema` fail, and the server would refuse to start. Fix: drop and
   recreate the view.
2. **Year 0000 passed validation and crashed the query.** JavaScript's `Date`
   accepts `0000-01-03`; Postgres has no year 0. The result was a 500 instead
   of a 400. Fix: dates must fall between 1900 and 2999.
3. **Deleted accounts kept working sessions.** Delete your account in one
   browser and another browser still has a valid, signed cookie for it. The
   planner then crashed with a 500. Fix: `checkAuthentication` confirms the
   user still exists and treats a missing one as logged out.
4. **Malformed JSON returned 500.** The error handler ignored the 400 status
   that Express's body parser attaches. Fix: pass client errors (4xx) through.
5. **Fast clicks could show stale data.** Clicking 7D then 30D sends two
   requests. If the 7-day response arrived second, it overwrote the 30-day one.
   Fix: each page ignores responses from requests that have since been
   replaced.

# What I'd do next

- Let users change their timezone on the Account page. Past meals would move
  to new days automatically, since days are computed and not stored.
- Daily goals. Goals change over time, so a goal needs `effective_from` and
  `effective_to` dates, and each past day should be judged against the goal
  that was active that day.
- Copy last week's plan into this week.
