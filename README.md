# Nourish — Full-Stack Nutrition Tracker

Nourish is a full-stack nutrition tracking app built with React, Express, and Postgres. Users can register, log in, manage their account, and track meals with calories and macros.

The frontend uses a bold Persona 4-inspired visual style: yellow backgrounds, black diagonal panels, chunky type, dark menu/list rows, and colorful accent stripes.

---

## Mission Statement

Nourish is for anyone who wants a simple way to track meals and nutrition goals. Whether someone is counting calories, monitoring protein, or building healthier habits, Nourish gives them a personal meal log without extra noise.

---

## Features

**Authentication**
- Register with a username and password
- Log in and log out
- Stay logged in across page refreshes with session cookies
- Protect app pages from unauthenticated users

**Account**
- View the logged-in username
- Update username
- Optionally update password
- Delete the account
- Delete related meals automatically when an account is deleted

**My Meals**
- Save meals to your collection with a type (breakfast, lunch, dinner, or snack), calories, macros, and an optional photo
- Saving a meal doesn't log it as eaten; "Log it" does, whenever you actually eat it
- My Meals lists your saved meals grouped by type, most-eaten first, with how many times you've eaten each
- History lists everything you've eaten, grouped by day with times and daily totals
- Remove a meal from My Meals without losing the times you ate it
- Open a meal's detail page for its macro breakdown and eating stats

**Daily Report**
- Daily calorie and macro totals for the last 7, 14, or 30 days
- Days are grouped in the user's own timezone, so late-night meals land on the right day
- Days with nothing logged are shown instead of skipped
- 7-day rolling calorie average that ignores days with nothing logged
- Current and longest logging streaks

**Meal Planner**
- Weekly Monday–Sunday calendar with breakfast, lunch, dinner, and snack slots
- Fill any slot by picking one of your saved meals, move between weeks, and remove plans
- "Log it" turns a plan into a logged meal and marks the plan as followed
- Each day compares planned calories to what was actually eaten
- Week scores: percent of plans followed and average calories over or under plan (finished days only)

See [DECISIONS.md](DECISIONS.md) for how the report and planner are built and why.

**Frontend Views**
- Login/Register page
- Main Menu page
- My Meals page (My Meals and History tabs)
- Add Meal page
- Meal Detail page
- Account page
- Daily Report page
- Meal Planner page

---

## Tech Stack

**Frontend**
- React
- React Router
- Vite
- CSS

**Backend**
- Express
- Postgres
- cookie-session
- bcrypt

---

## Schema

```txt
users
─────────────────────────────
user_id       SERIAL PRIMARY KEY
username      TEXT UNIQUE NOT NULL
password_hash TEXT NOT NULL
timezone      TEXT NOT NULL DEFAULT 'America/New_York'

saved_meals          -- your collection: each meal once
─────────────────────────────
saved_meal_id SERIAL PRIMARY KEY
user_id    INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE
name       TEXT NOT NULL      -- unique per user, ignoring case
meal_type  TEXT NOT NULL      -- breakfast | lunch | dinner | snack
calories   INTEGER NOT NULL
protein_g  INTEGER NOT NULL DEFAULT 0
carbs_g    INTEGER NOT NULL DEFAULT 0
fat_g      INTEGER NOT NULL DEFAULT 0
photo_data TEXT
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

meals                -- each time something was eaten
─────────────────────────────
meal_id     SERIAL PRIMARY KEY
saved_meal_id INTEGER REFERENCES saved_meals(saved_meal_id) ON DELETE SET NULL
name        TEXT NOT NULL
calories    INTEGER NOT NULL
protein_g   INTEGER NOT NULL DEFAULT 0
carbs_g     INTEGER NOT NULL DEFAULT 0
fat_g       INTEGER NOT NULL DEFAULT 0
photo_data  TEXT
logged_at   TIMESTAMPTZ DEFAULT NOW()
user_id     INTEGER REFERENCES users(user_id) ON DELETE CASCADE

planned_meals
─────────────────────────────
planned_meal_id SERIAL PRIMARY KEY
user_id    INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE
plan_date  DATE NOT NULL
slot       TEXT NOT NULL  -- breakfast | lunch | dinner | snack
name       TEXT NOT NULL
calories   INTEGER NOT NULL
protein_g  INTEGER NOT NULL DEFAULT 0
carbs_g    INTEGER NOT NULL DEFAULT 0
fat_g      INTEGER NOT NULL DEFAULT 0
meal_id    INTEGER UNIQUE REFERENCES meals(meal_id) ON DELETE SET NULL
saved_meal_id INTEGER REFERENCES saved_meals(saved_meal_id) ON DELETE SET NULL
UNIQUE (user_id, plan_date, slot)

meals_local (view)
─────────────────────────────
every meals column, plus the user's timezone and
local_day = (logged_at AT TIME ZONE timezone)::date
```

`saved_meals` is the collection (the dimension); `meals` and `planned_meals` record what was eaten and what was planned (the facts). Each eaten meal and each plan copies the saved meal's name and numbers when it's created, the way a receipt keeps the price paid, so history stays accurate if a saved meal is removed. Removing a saved meal clears those links and nothing else.

A user has many meals. Deleting a user cascades to delete all of that user's meal entries. `timezone` is an IANA name such as `America/Los_Angeles`, captured from the browser at registration. It decides which calendar day each meal belongs to. An index on `meals (user_id, logged_at)` supports the report queries.

A user has many planned meals, at most one per slot per day. `meal_id` links a plan to the meal logged from it; deleting that meal clears the link. The `meals_local` view is the single definition of which local day a meal belongs to, shared by the report and the planner.

The server creates any missing tables, columns, indexes, and views on startup (`ensureSchema` in `server/db/schema.js`), so an existing database is upgraded without reseeding. The first time it adds saved meals to an older database, it builds them from the meals already logged and planned, and links everything.

---

## API Contract

### Auth Endpoints

| Method | Endpoint             | Request Body             | Response                          |
| ------ | -------------------- | ------------------------ | --------------------------------- |
| POST   | `/api/auth/register` | `{ username, password, timezone? }` | `{ user_id, username, timezone }` |
| POST   | `/api/auth/login`    | `{ username, password }` | `{ user_id, username, timezone }` |
| GET    | `/api/auth/me`       | —                        | `{ user_id, username, timezone }` or `null` |
| PATCH  | `/api/auth/me`       | `{ username, password }` | `{ user_id, username, timezone }` |
| DELETE | `/api/auth/me`       | —                        | `{ user_id, username }`           |
| DELETE | `/api/auth/logout`   | —                        | `{ message }`                     |

### Saved Meal Endpoints

All require authentication.

| Method | Endpoint                          | Request Body | Response |
| ------ | --------------------------------- | ------------ | -------- |
| GET    | `/api/saved-meals`                | — | `[{ saved_meal_id, name, meal_type, calories, protein_g, carbs_g, fat_g, has_photo, times_eaten, last_eaten_at }]`, ordered by type, then most eaten |
| POST   | `/api/saved-meals`                | `{ name, meal_type, calories, protein_g, carbs_g, fat_g, photo_data }` | The new saved meal. `409` if you already have a meal with that name (ignoring case) |
| GET    | `/api/saved-meals/:saved_meal_id` | — | The saved meal with `photo_data`, `times_eaten`, `last_eaten_at` |
| DELETE | `/api/saved-meals/:saved_meal_id` | — | The removed saved meal. Eaten meals and plans keep their copies |

### Meal Endpoints (what was eaten)

All require authentication.

| Method | Endpoint              | Request Body        | Response |
| ------ | --------------------- | ------------------- | -------- |
| GET    | `/api/meals`          | —                   | `[{ meal_id, saved_meal_id, name, calories, protein_g, carbs_g, fat_g, logged_at, user_id }]`, newest first |
| POST   | `/api/meals`          | `{ saved_meal_id }` | Logs that saved meal as eaten now. `404` if it isn't one of yours |
| GET    | `/api/meals/:meal_id` | —                   | One eaten meal |
| DELETE | `/api/meals/:meal_id` | —                   | The deleted meal |

### Nutrition Report Endpoints

Both require authentication.

| Method | Endpoint                 | Query                                   | Response |
| ------ | ------------------------ | --------------------------------------- | -------- |
| GET    | `/api/nutrition/daily`   | `from`, `to` as `YYYY-MM-DD` (optional, send both or neither; max 366 days; defaults to the last 14 days) | `[{ day, meal_count, calories, protein_g, carbs_g, fat_g, calories_7d_avg, days_logged_7d }]`, one entry per day |
| GET    | `/api/nutrition/streaks` | —                                       | `{ current_streak, longest_streak }` |

### Meal Plan Endpoints

All require authentication.

| Method | Endpoint                           | Request                                                   | Response |
| ------ | ---------------------------------- | --------------------------------------------------------- | -------- |
| GET    | `/api/plans?week=YYYY-MM-DD`       | `week` is any date in the week (optional, defaults to this week) | `{ week_start, days: [{ day, is_past, is_today, planned_count, planned_calories, followed_count, actual_meals, actual_calories, calorie_diff, plans: [...] }], summary: { planned_meals, followed_meals, follow_rate, avg_calorie_diff } }` |
| POST   | `/api/plans`                       | `{ plan_date, slot, saved_meal_id }` | The new plan, with the saved meal's name and numbers. `404` if the saved meal isn't yours, `409` if that slot is already planned |
| DELETE | `/api/plans/:planned_meal_id`      | —                                                         | The deleted plan |
| POST   | `/api/plans/:planned_meal_id/log`  | —                                                         | `{ plan, meal }`. `409` if already logged, `400` for a future day |

Numbers must be whole numbers (calories 0–10,000, macros 0–1,000 g). Invalid input gets a `400` with an `error` message.

---

## Setup

### 1. Database

Create a local Postgres database:

```sh
createdb nourish_db
```

### 2. Server

```sh
cd server
npm install
cp .env.template .env
```

Open `.env` and fill in your Postgres credentials and a session secret. Then seed the database:

```sh
npm run db:seed
```

The seed creates two users, each with 15 saved meals and 60 days of meal history ending today, including skipped days and late-night meals, plus a meal plan for `yu` covering last week and this week. It is deterministic, so every run produces the same meals.

Start the server:

```sh
npm start
```

The server runs on `http://localhost:8080`.

### 3. Frontend

In a second terminal:

```sh
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`. The Vite dev proxy forwards `/api` requests to the Express server so session cookies work correctly.

### 4. Tests

The server tests run against a separate database, which they drop and rebuild on every run:

```sh
createdb nourish_test
cd server
npm test
```

---

## Seed Users

After running `npm run db:seed`, these accounts are available:

| Username | Password    | Timezone            |
| -------- | ----------- | ------------------- |
| yu       | password123 | America/New_York    |
| chie     | password123 | America/Los_Angeles |

---

## Application Structure

```txt
nourish/
├── frontend/                     # React app
│   ├── src/
│   │   ├── App.jsx               # Router, currentUser state, session rehydration
│   │   ├── App.css               # Persona-inspired visual system
│   │   ├── mealTypes.js          # Meal types and a time-of-day default
│   │   ├── adapters/
│   │   │   ├── auth-adapters.js  # Fetch adapters for /api/auth/* endpoints
│   │   │   ├── meal-adapters.js  # Fetch adapters for /api/meals/* endpoints
│   │   │   ├── saved-meal-adapters.js # Fetch adapters for /api/saved-meals/*
│   │   │   ├── nutrition-adapters.js # Fetch adapters for /api/nutrition/* endpoints
│   │   │   └── plan-adapters.js  # Fetch adapters for /api/plans/* endpoints
│   │   └── components/
│   │       ├── AuthPage.jsx      # Login and register forms
│   │       ├── MenuPage.jsx      # Main menu after login
│   │       ├── AccountPage.jsx   # View, update, logout, and delete account
│   │       ├── MealListPage.jsx  # My Meals and History tabs
│   │       ├── SavedMealList.jsx # Saved meals grouped by type, with Log it
│   │       ├── AddMealPage.jsx   # Page wrapper for the add meal form
│   │       ├── AddMealForm.jsx   # Form to save a meal to My Meals
│   │       ├── MealList.jsx      # History: eaten meals grouped by day
│   │       ├── MealItem.jsx      # One eaten meal row and delete button
│   │       ├── MealDetailPage.jsx # One saved meal: macros and eating stats
│   │       ├── DailyReportPage.jsx # Daily totals, rolling average, streaks
│   │       ├── PlannerPage.jsx   # Weekly meal-plan calendar
│   │       ├── MealPicker.jsx    # Pick a saved meal for a planner slot
│   │       └── MealPage.jsx      # Compatibility wrapper for meal list page
│   └── vite.config.js            # Proxies /api requests to Express in development
└── server/                       # Express + Postgres API
    ├── index.js                  # Prepares the schema, then starts the server
    ├── app.js                    # Express app: middleware and routes
    ├── controllers/
    │   ├── authControllers.js    # register, login, logout, get/update/delete account
    │   ├── mealControllers.js    # list, log, get, delete eaten meals
    │   ├── savedMealControllers.js # list, save, get, remove saved meals
    │   ├── nutritionControllers.js # daily report and streaks, with query validation
    │   └── planControllers.js    # meal plan week, create, delete, log
    ├── models/
    │   ├── userModel.js          # SQL queries for users
    │   ├── mealModel.js          # SQL queries for eaten meals
    │   ├── savedMealModel.js     # SQL queries for saved meals
    │   ├── nutritionModel.js     # Daily totals, rolling average, and streak SQL
    │   └── planModel.js          # Week view, planned vs actual, logging a plan
    ├── middleware/
    │   ├── checkAuthentication.js
    │   └── logRoutes.js
    ├── db/
    │   ├── pool.js
    │   ├── schema.js             # Tables and views; ensureSchema runs on startup
    │   └── seed.js               # 60 days of generated meal history
    ├── utils/
    │   └── validation.js         # Shared input checks
    └── tests/
        ├── helpers.js            # Fixture helpers
        ├── nutritionModel.test.js
        ├── planModel.test.js
        ├── savedMealModel.test.js
        ├── schema.test.js        # Upgrading older databases
        └── api.test.js           # HTTP checks: auth, validation, ownership
```

---

## Roadmap

- Edit existing meal entries
- Let users change their timezone on the Account page
- Add goal tracking for calories, protein, carbs, and fat
- Copy last week's meal plan into this week
- Add nutrition search or food API integration
