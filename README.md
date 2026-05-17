# Nourish — Full-Stack Nutrition Tracker


A full-stack nutrition tracking app built with React, Express, and Postgres. Demonstrates session-based authentication, session rehydration, auth-dependent data fetching, and conditional rendering — the same patterns used across full-stack projects.

---

## Mission Statement

Nourish is for anyone who wants a simple, no-nonsense way to track their daily food intake and nutrition goals. Whether you're counting calories, monitoring protein, or just trying to build healthier habits, Nourish gives you a clean personal log to record meals and review your progress — no premium paywalls, no noise, just the data you need.

---

## User Stories

**Auth**
- A user can register for an account with a username and password
- A user can log in to an existing account
- A user can log out
- A returning user who has an active session is automatically logged in when they revisit the app

**Nutrition Logs**
- A logged-in user can see all of their logged meals
- A logged-in user can add a new meal entry with a name, calories, protein, carbs, and fat
- A logged-in user can delete a meal entry
- A logged-in user can see a daily summary of their total calories and macros

---

## Schema

```
users
─────────────────────────────
user_id       SERIAL PRIMARY KEY
username      TEXT UNIQUE NOT NULL
password_hash TEXT NOT NULL

meals
─────────────────────────────
meal_id     SERIAL PRIMARY KEY
name        TEXT NOT NULL
calories    INTEGER NOT NULL
protein_g   INTEGER NOT NULL DEFAULT 0
carbs_g     INTEGER NOT NULL DEFAULT 0
fat_g       INTEGER NOT NULL DEFAULT 0
logged_at   TIMESTAMPTZ DEFAULT NOW()
user_id     INTEGER REFERENCES users(user_id) ON DELETE CASCADE
```

A user has many meals. Deleting a user cascades to delete all of their meal entries.

---

## API Contract

### Auth Endpoints

| Method | Endpoint             | Request Body             | Response                          |
| ------ | -------------------- | ------------------------ | --------------------------------- |
| POST   | `/api/auth/register` | `{ username, password }` | `{ user_id, username }`           |
| POST   | `/api/auth/login`    | `{ username, password }` | `{ user_id, username }`           |
| DELETE | `/api/auth/logout`   | —                        | `{ message }`                     |
| GET    | `/api/auth/me`       | —                        | `{ user_id, username }` or `null` |

### Meal Endpoints (all require authentication)

| Method | Endpoint           | Request Body                              | Response                                                          |
| ------ | ------------------ | ----------------------------------------- | ----------------------------------------------------------------- |
| GET    | `/api/meals`       | —                                         | `[{ meal_id, name, calories, protein_g, carbs_g, fat_g, logged_at, user_id }]` |
| POST   | `/api/meals`       | `{ name, calories, protein_g, carbs_g, fat_g }` | `{ meal_id, name, calories, protein_g, carbs_g, fat_g, logged_at, user_id }` |
| DELETE | `/api/meals/:meal_id` | —                                      | `{ meal_id, name, calories, protein_g, carbs_g, fat_g, logged_at, user_id }` |

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

Start the server:

```sh
npm run dev
```

The server runs on `http://localhost:8080`.

### 3. Frontend

In a second terminal:

```sh
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`. The Vite dev proxy forwards all `/api` requests to the Express server so session cookies work correctly.

---

## Seed Users

After running `npm run db:seed`, these accounts are available:

| Username  | Password    |
| --------- | ----------- |
| yu        | password123 |
| chie      | password123 |

---

## Application Structure

```
nourish/
├── frontend/               # React app (Vite)
│   ├── src/
│   │   ├── App.jsx         # Root component: currentUser state, session rehydration, auth handlers
│   │   ├── adapters/
│   │   │   ├── auth-adapters.js  # Fetch adapters for /api/auth/* endpoints
│   │   │   └── meal-adapters.js  # Fetch adapters for /api/meals/* endpoints
│   │   └── components/
│   │       ├── AuthPage.jsx      # Login + Register forms (shown when logged out)
│   │       ├── MealPage.jsx      # Main app container (shown when logged in)
│   │       ├── AddMealForm.jsx   # Form to log a new meal
│   │       ├── MealList.jsx      # Renders a list of MealItems
│   │       ├── MealItem.jsx      # Single meal entry: name, macros, delete button
│   │       └── DailySummary.jsx  # Totals bar: calories, protein, carbs, fat
│   └── vite.config.js      # Proxies /api requests to Express in development
└── server/                 # Express + Postgres API
    ├── index.js            # App entry point, route definitions
    ├── controllers/
    │   ├── authControllers.js  # register, login, logout, getMe
    │   └── mealControllers.js  # list, create, delete meals
    ├── models/
    │   ├── userModel.js    # SQL queries for the users table
    │   └── mealModel.js    # SQL queries for the meals table
    ├── middleware/
    │   ├── checkAuthentication.js  # Blocks unauthenticated requests
    │   └── logRoutes.js            # Logs each incoming request
    └── db/
        ├── pool.js         # Postgres connection pool
        └── seed.js         # Creates tables and inserts sample data
```

---

## Roadmap

Stretch features to build next:

- **Calorie / macro goals** — let users set a daily calorie and macro target and display progress toward it
- **Edit meal entries** — add a PATCH endpoint and inline edit form so users can correct logged values
- **Date filtering** — filter the meal list by a specific date to review past days
- **Nutrition search** — integrate a third-party food API (e.g. Open Food Facts) to auto-fill macro data by food name