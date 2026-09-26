# Decisions: Daily Report

Notes on the choices behind the daily nutrition report (`/api/nutrition/daily`,
`/api/nutrition/streaks`, and the Report page). The queries live in
[server/models/nutritionModel.js](server/models/nutritionModel.js) and the
tests in [server/tests/nutritionModel.test.js](server/tests/nutritionModel.test.js).

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

## What I'd do next

- Let users change their timezone on the Account page.
- Daily goals. Goals change over time, so a goal needs `effective_from` and
  `effective_to` dates, and each past day should be judged against the goal
  that was active that day.
- A weekly meal-plan calendar, plus a planned-versus-actual comparison.
