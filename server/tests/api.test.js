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

const lunchPlan = (plan_date, overrides = {}) => ({
  plan_date, slot: 'lunch', name: 'Chicken salad', calories: 450, protein_g: 40, ...overrides,
});

beforeEach(async () => {
  await createSchema(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('authentication', () => {
  it.each([
    ['GET', '/api/meals'],
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
    await secondBrowser.post('/api/plans').send(lunchPlan('2026-03-10')).expect(401);
  });

  it('rejects an unknown timezone', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'naoto', password: 'pw', timezone: 'Mars/Olympus' })
      .expect(400);
  });
});

describe('meal validation', () => {
  it.each([
    ['calories as text', { name: 'Toast', calories: 'abc' }],
    ['fractional calories', { name: 'Toast', calories: 12.5 }],
    ['negative protein', { name: 'Toast', calories: 200, protein_g: -5 }],
    ['a blank name', { name: '   ', calories: 200 }],
    ['a photo that is not an image', { name: 'Toast', calories: 200, photo_data: 'data:text/html,hi' }],
  ])('rejects %s', async (_, body) => {
    const agent = await signUp('yu');
    const { body: response } = await agent.post('/api/meals').send(body).expect(400);
    expect(response.error).toBeTruthy();
  });

  it('answers 404 for a non-numeric meal id instead of a database error', async () => {
    const agent = await signUp('yu');
    await agent.get('/api/meals/abc').expect(404);
    await agent.delete('/api/meals/abc').expect(404);
  });
});

describe('meal plans', () => {
  it('creates a plan and shows it in its week', async () => {
    const agent = await signUp('yu');
    const today = todayIn('America/New_York');

    const { body: plan } = await agent.post('/api/plans').send(lunchPlan(today)).expect(201);
    const { body: week } = await agent.get(`/api/plans?week=${today}`).expect(200);

    expect(plan).toMatchObject({ plan_date: today, slot: 'lunch', calories: 450, meal_id: null });
    expect(week.days).toHaveLength(7);
    expect(week.days.find((day) => day.day === today).plans[0].planned_meal_id).toBe(plan.planned_meal_id);
  });

  it('answers 409 when the slot is already planned', async () => {
    const agent = await signUp('yu');
    await agent.post('/api/plans').send(lunchPlan('2026-03-10')).expect(201);
    await agent.post('/api/plans').send(lunchPlan('2026-03-10')).expect(409);
  });

  it.each([
    ['an invalid date', lunchPlan('2026-02-30')],
    ['year 0000', lunchPlan('0000-01-03')],
    ['an unknown slot', lunchPlan('2026-03-10', { slot: 'brunch' })],
    ['calories as text', lunchPlan('2026-03-10', { calories: '450' })],
  ])('rejects %s', async (_, body) => {
    const agent = await signUp('yu');
    await agent.post('/api/plans').send(body).expect(400);
  });

  it.each(['next-tuesday', '0000-01-03'])('rejects the week %s', async (week) => {
    // JavaScript accepts year 0000 but Postgres has no year 0.
    const agent = await signUp('yu');
    await agent.get(`/api/plans?week=${week}`).expect(400);
  });

  it('logs a plan for today and shows it as followed', async () => {
    const agent = await signUp('yu');
    const today = todayIn('America/New_York');
    const { body: plan } = await agent.post('/api/plans').send(lunchPlan(today)).expect(201);

    const { body: logged } = await agent.post(`/api/plans/${plan.planned_meal_id}/log`).expect(201);
    const { body: week } = await agent.get('/api/plans').expect(200);

    expect(logged.meal).toMatchObject({ name: 'Chicken salad', calories: 450 });
    expect(week.days.find((day) => day.day === today)).toMatchObject({ followed_count: 1, actual_calories: 450 });
    await agent.post(`/api/plans/${plan.planned_meal_id}/log`).expect(409);
  });

  it('refuses to log a plan for tomorrow', async () => {
    const agent = await signUp('yu');
    const tomorrow = shiftDay(todayIn('America/New_York'), 1);
    const { body: plan } = await agent.post('/api/plans').send(lunchPlan(tomorrow)).expect(201);

    await agent.post(`/api/plans/${plan.planned_meal_id}/log`).expect(400);
  });

  it("hides other users' plans behind a 404", async () => {
    const yu = await signUp('yu');
    const chie = await signUp('chie');
    const { body: plan } = await chie.post('/api/plans').send(lunchPlan('2026-03-10')).expect(201);

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
  await agent.post('/api/meals').set('Content-Type', 'application/json').send('{bad').expect(400);
});

it('answers unknown API routes with a JSON 404', async () => {
  const { body } = await request(app).get('/api/nope').expect(404);
  expect(body).toEqual({ error: 'Not found.' });
});
