const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
require('dotenv').config();

const logRoutes = require('./middleware/logRoutes');
const checkAuthentication = require('./middleware/checkAuthentication');
const authControllers = require('./controllers/authControllers');
const mealControllers = require('./controllers/mealControllers');
const nutritionControllers = require('./controllers/nutritionControllers');
const planControllers = require('./controllers/planControllers');

const app = express();

// ====================================
// Middleware
// ====================================

// Request logs would drown out test output.
if (process.env.NODE_ENV !== 'test') app.use(logRoutes);
app.use(cookieSession({ name: 'session', secret: process.env.SESSION_SECRET }));
app.use(express.json({ limit: '5mb' }));

// In production, serve the built React app from frontend/dist.
// In development, Vite's dev server handles the frontend on a separate port
// and proxies /api requests to this server.
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// ====================================
// Auth routes
// ====================================

app.post('/api/auth/register', authControllers.register);
app.post('/api/auth/login', authControllers.login);
app.get('/api/auth/me', authControllers.getMe);
app.patch('/api/auth/me', checkAuthentication, authControllers.updateAccount);
app.delete('/api/auth/me', checkAuthentication, authControllers.deleteAccount);
app.delete('/api/auth/logout', authControllers.logout);

// ====================================
// Meal routes (all require authentication)
// ====================================

app.get('/api/meals', checkAuthentication, mealControllers.listMeals);
app.post('/api/meals', checkAuthentication, mealControllers.createMeal);
app.get('/api/meals/:meal_id', checkAuthentication, mealControllers.getMeal);
app.delete('/api/meals/:meal_id', checkAuthentication, mealControllers.deleteMeal);

// ====================================
// Nutrition report routes (all require authentication)
// ====================================

app.get('/api/nutrition/daily', checkAuthentication, nutritionControllers.getDailyTotals);
app.get('/api/nutrition/streaks', checkAuthentication, nutritionControllers.getStreaks);

// ====================================
// Meal plan routes (all require authentication)
// ====================================

app.get('/api/plans', checkAuthentication, planControllers.getWeek);
app.post('/api/plans', checkAuthentication, planControllers.createPlan);
app.delete('/api/plans/:planned_meal_id', checkAuthentication, planControllers.deletePlan);
app.post('/api/plans/:planned_meal_id/log', checkAuthentication, planControllers.logPlan);

// ====================================
// Frontend fallback
// ====================================

// React Router handles pages like /meals and /report in the browser. When one
// of those URLs is loaded directly, send the app shell so a refresh works.
// Unknown /api routes still get a JSON 404.
app.use('/api', (req, res) => res.status(404).send({ error: 'Not found.' }));
app.get('*', (req, res, next) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'), (err) => err && next());
});

// ====================================
// Global Error Handler
// ====================================

// Errors from body parsing (malformed JSON, body too large) carry a 4xx
// status and are the client's fault. Anything else is a server bug.
const handleError = (err, req, res, next) => {
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).send({ error: 'Invalid request body.' });
  }
  console.error(err);
  res.status(500).send({ message: 'Internal Server Error' });
};
app.use(handleError);

module.exports = app;
