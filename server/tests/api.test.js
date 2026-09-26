import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import pool from '../db/pool';
import { createSchema } from '../db/schema';

// HTTP-level checks: authentication, ownership, and input validation. The SQL
// itself is covered by the model tests.

// Registers a user and returns an agent that keeps the session cookie.
const signUp = async (username, timezone = 'America/New_York') => {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ username, password: 'pw', timezone }).expect(201);
  return agent;
};

const todayIn = (timezone) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());

const shiftDay = (day, offset) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

const chickenSalad = { name: 'Chicken salad', meal_type: 'lunch', calories: 450, protein_g: 40 };

// Saves a meal through the API and returns its id.
const saveMeal = async (agent, meal = chickenSalad) => {
  const { body } = await agent.post('/api/saved-meals').send(meal).expect(201);
  return body.saved_meal_id;
};

const lunchPlan = (plan_date, saved_meal_id, overrides = {}) => ({ plan_date, slot: 'lunch', saved_meal_id, ...overrides });

beforeEach(async () => {
  await createSchema(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('authentication', () => {
  it.each([
    ['GET', '/api/meals'],
    ['POST', '/api/meals'],
    ['GET', '/api/saved-meals'],
    ['POST', '/api/saved-meals'],
    ['DELETE', '/api/saved-meals/1'],
    ['GET', '/api/nutrition/daily'],
    ['GET', '/api/nutrition/streaks'],
    ['GET', '/api/plans'],
    ['POST', '/api/plans'],
    ['DELETE', '/api/plans/1'],
    ['POST', '/api/plans/1/log'],
  ])('rejects %s %s without a session', async (method, url) => {
    await request(app)[method.toLowerCase()](url).expect(401);
  });

  it('stores the timezone sent at registration', async () => {
    const { body } = await request(app)
      .post('/api/auth/register')
      .send({ username: 'naoto', password: 'pw', timezone: 'Asia/Tokyo' })
      .expect(201);

    expect(body).toMatchObject({ username: 'naoto', timezone: 'Asia/Tokyo' });
  });

  it('treats a session for a deleted account as logged out', async () => {
    // Two browsers share an account. One deletes it; the other's cookie is
    // still signed and valid, but the user no longer exists.
    const firstBrowser = await signUp('yu');
    const secondBrowser = request.agent(app);
    await secondBrowser.post('/api/auth/login').send({ username: 'yu', password: 'pw' }).expect(200);

    await firstBrowser.delete('/api/auth/me').expect(200);

    await secondBrowser.get('/api/plans').expect(401);
    await secondBrowser.get('/api/saved-meals').expect(401);
  });

  it('rejects an unknown timezone', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'naoto', password: 'pw', timezone: 'Mars/Olympus' })
      .expect(400);
  });
});

describe('saved meals', () => {
  it('saves a meal without logging it as eaten', async () => {
    const agent = await signUp('yu');

    await saveMeal(agent);

    const { body: savedMeals } = await agent.get('/api/saved-meals').expect(200);
    const { body: eaten } = await agent.get('/api/meals').expect(200);
    expect(savedMeals).toEqual([expect.objectContaining({ name: 'Chicken salad', meal_type: 'lunch', times_eaten: 0 })]);
    expect(eaten).toEqual([]);
  });

  it.each([
    ['calories as text', { ...chickenSalad, calories: 'abc' }],
    ['fractional calories', { ...chickenSalad, calories: 12.5 }],
    ['negative protein', { ...chickenSalad, protein_g: -5 }],
    ['a blank name', { ...chickenSalad, name: '   ' }],
    ['an unknown meal type', { ...chickenSalad, meal_type: 'brunch' }],
    ['a missing meal type', { name: 'Toast', calories: 200 }],
    ['a photo that is not an image', { ...chickenSalad, photo_data: 'data:text/html,hi' }],
  ])('rejects %s', async (_, body) => {
    const agent = await signUp('yu');
    const { body: response } = await agent.post('/api/saved-meals').send(body).expect(400);
    expect(response.error).toBeTruthy();
  });

  it('answers 409 for a name already saved, ignoring case', async () => {
    const agent = await signUp('yu');
    await saveMeal(agent);
    await agent.post('/api/saved-meals').send({ ...chickenSalad, name: 'CHICKEN SALAD' }).expect(409);
  });

  it("hides other users' saved meals behind a 404", async () => {
    const yu = await signUp('yu');
    const chie = await signUp('chie');
    const id = await saveMeal(chie);

    await yu.get(`/api/saved-meals/${id}`).expect(404);
    await yu.delete(`/api/saved-meals/${id}`).expect(404);
    await yu.post('/api/meals').send({ saved_meal_id: id }).expect(404);
    await yu.post('/api/plans').send(lunchPlan('2026-03-10', id)).expect(404);
  });

  it('answers 404 for a non-numeric id instead of a database error', async () => {
    const agent = await signUp('yu');
    await agent.get('/api/saved-meals/abc').expect(404);
    await agent.delete('/api/saved-meals/abc').expect(404);
  });
});

describe('logging meals', () => {
  it('logs a saved meal as eaten now and counts it', async () => {
    const agent = await signUp('yu');
    const id = await saveMeal(agent);

    const { body: meal } = await agent.post('/api/meals').send({ saved_meal_id: id }).expect(201);
    const { body: savedMeal } = await agent.get(`/api/saved-meals/${id}`).expect(200);

    expect(meal).toMatchObject({ saved_meal_id: id, name: 'Chicken salad', calories: 450 });
    expect(savedMeal.times_eaten).toBe(1);
  });

  it.each([['missing', {}], ['text', { saved_meal_id: 'abc' }], ['fractional', { saved_meal_id: 1.5 }]])(
    'rejects a %s saved_meal_id',
    async (_, body) => {
      const agent = await signUp('yu');
      await agent.post('/api/meals').send(body).expect(400);
    },
  );

  it('keeps eaten history when the saved meal is deleted', async () => {
    const agent = await signUp('yu');
    const id = await saveMeal(agent);
    await agent.post('/api/meals').send({ saved_meal_id: id }).expect(201);

    await agent.delete(`/api/saved-meals/${id}`).expect(200);

    const { body: eaten } = await agent.get('/api/meals').expect(200);
    expect(eaten).toEqual([expect.objectContaining({ name: 'Chicken salad', calories: 450, saved_meal_id: null })]);
  });

  it("hides other users' eaten meals behind a 404 and doesn't delete them", async () => {
    const yu = await signUp('yu');
    const chie = await signUp('chie');
    const saladId = await saveMeal(chie);
    const { body: meal } = await chie.post('/api/meals').send({ saved_meal_id: saladId }).expect(201);

    await yu.get(`/api/meals/${meal.meal_id}`).expect(404);
    await yu.delete(`/api/meals/${meal.meal_id}`).expect(404);

    const { body: chiesMeals } = await chie.get('/api/meals').expect(200);
    expect(chiesMeals).toHaveLength(1);
  });

  it('answers 404 for a non-numeric meal id instead of a database error', async () => {
    const agent = await signUp('yu');
    await agent.get('/api/meals/abc').expect(404);
    await agent.delete('/api/meals/abc').expect(404);
  });
});

describe('meal plans', () => {
  it('plans a saved meal and shows it in its week', async () => {
    const agent = await signUp('yu');
    const id = await saveMeal(agent);
    const today = todayIn('America/New_York');

    const { body: plan } = await agent.post('/api/plans').send(lunchPlan(today, id)).expect(201);
    const { body: week } = await agent.get(`/api/plans?week=${today}`).expect(200);

    expect(plan).toMatchObject({ plan_date: today, slot: 'lunch', saved_meal_id: id, name: 'Chicken salad', calories: 450, meal_id: null });
    expect(week.days).toHaveLength(7);
    expect(week.days.find((day) => day.day === today).plans[0].planned_meal_id).toBe(plan.planned_meal_id);
  });

  it('answers 409 when the slot is already planned', async () => {
    const agent = await signUp('yu');
    const id = await saveMeal(agent);
    await agent.post('/api/plans').send(lunchPlan('2026-03-10', id)).expect(201);
    await agent.post('/api/plans').send(lunchPlan('2026-03-10', id)).expect(409);
  });

  it.each([
    ['an invalid date', (id) => lunchPlan('2026-02-30', id)],
    ['year 0000', (id) => lunchPlan('0000-01-03', id)],
    ['an unknown slot', (id) => lunchPlan('2026-03-10', id, { slot: 'brunch' })],
    ['a missing saved meal', () => lunchPlan('2026-03-10', undefined)],
  ])('rejects %s', async (_, makeBody) => {
    const agent = await signUp('yu');
    const id = await saveMeal(agent);
    await agent.post('/api/plans').send(makeBody(id)).expect(400);
  });

  it.each(['next-tuesday', '0000-01-03'])('rejects the week %s', async (week) => {
    // JavaScript accepts year 0000 but Postgres has no year 0.
    const agent = await signUp('yu');
    await agent.get(`/api/plans?week=${week}`).expect(400);
  });

  it('logs a plan for today and shows it as followed', async () => {
    const agent = await signUp('yu');
    const id = await saveMeal(agent);
    const today = todayIn('America/New_York');
    const { body: plan } = await agent.post('/api/plans').send(lunchPlan(today, id)).expect(201);

    const { body: logged } = await agent.post(`/api/plans/${plan.planned_meal_id}/log`).expect(201);
    const { body: week } = await agent.get('/api/plans').expect(200);

    expect(logged.meal).toMatchObject({ name: 'Chicken salad', calories: 450, saved_meal_id: id });
    expect(week.days.find((day) => day.day === today)).toMatchObject({ followed_count: 1, actual_calories: 450 });
    await agent.post(`/api/plans/${plan.planned_meal_id}/log`).expect(409);
  });

  it('refuses to log a plan for tomorrow', async () => {
    const agent = await signUp('yu');
    const id = await saveMeal(agent);
    const tomorrow = shiftDay(todayIn('America/New_York'), 1);
    const { body: plan } = await agent.post('/api/plans').send(lunchPlan(tomorrow, id)).expect(201);

    await agent.post(`/api/plans/${plan.planned_meal_id}/log`).expect(400);
  });

  it("hides other users' plans behind a 404", async () => {
    const yu = await signUp('yu');
    const chie = await signUp('chie');
    const id = await saveMeal(chie);
    const { body: plan } = await chie.post('/api/plans').send(lunchPlan('2026-03-10', id)).expect(201);

    await yu.delete(`/api/plans/${plan.planned_meal_id}`).expect(404);
    await yu.post(`/api/plans/${plan.planned_meal_id}/log`).expect(404);
    await chie.delete(`/api/plans/${plan.planned_meal_id}`).expect(200);
  });

  it('answers 404 for a non-numeric plan id', async () => {
    const agent = await signUp('yu');
    await agent.delete('/api/plans/abc').expect(404);
  });
});

describe('daily report validation', () => {
  it.each([
    ['only one date', '?from=2026-03-01'],
    ['an impossible date', '?from=2026-02-30&to=2026-03-01'],
    ['dates out of order', '?from=2026-03-10&to=2026-03-01'],
    ['a range over a year', '?from=2024-01-01&to=2026-01-01'],
    ['year 0000', '?from=0000-01-01&to=0000-01-05'],
  ])('rejects %s', async (_, query) => {
    const agent = await signUp('yu');
    await agent.get(`/api/nutrition/daily${query}`).expect(400);
  });
});

it('answers malformed JSON with a 400, not a server error', async () => {
  const agent = await signUp('yu');
  await agent.post('/api/plans').set('Content-Type', 'application/json').send('{bad').expect(400);
  await agent.post('/api/saved-meals').set('Content-Type', 'application/json').send('{bad').expect(400);
});

it('answers unknown API routes with a JSON 404', async () => {
  const { body } = await request(app).get('/api/nope').expect(404);
  expect(body).toEqual({ error: 'Not found.' });
});
