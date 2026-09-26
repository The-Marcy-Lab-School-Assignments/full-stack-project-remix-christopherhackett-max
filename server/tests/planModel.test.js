import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { createSchema } from '../db/schema';
import planModel from '../models/planModel';
import nutritionModel from '../models/nutritionModel';
import { createPlan, createSavedMeal, createUser, localDay, logMealAt } from './helpers';

// Mar 9, 2026 is a Monday. Weeks in these tests run Mar 9 to Mar 15.

const dayOf = (week, day) => week.days.find((row) => row.day === day);

const mealCount = async (user_id) => {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM meals WHERE user_id = $1', [user_id]);
  return rows[0].count;
};

beforeEach(async () => {
  await createSchema(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('getWeek', () => {
  it.each([
    ['a Monday', '2026-03-09'],
    ['a Wednesday', '2026-03-11'],
    ['a Sunday', '2026-03-15'],
  ])('returns Monday to Sunday for %s', async (_, day) => {
    const yu = await createUser('yu', 'America/New_York');

    const week = await planModel.getWeek(yu, day);

    expect(week.week_start).toBe('2026-03-09');
    expect(week.days.map((row) => row.day)).toEqual([
      '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-14', '2026-03-15',
    ]);
  });

  it('totals plans and meals separately so a join cannot multiply them', async () => {
    // 2 plans and 3 meals on one day. Joining raw rows would make 6 pairs and
    // report 3600 planned and 3600 eaten calories.
    const yu = await createUser('yu', 'America/New_York');
    await createPlan(yu, '2026-03-10', 'lunch', 500);
    await createPlan(yu, '2026-03-10', 'dinner', 700);
    for (const time of ['08:00', '12:00', '18:00']) await logMealAt(yu, `2026-03-10 ${time}`, 400);

    const day = dayOf(await planModel.getWeek(yu, '2026-03-10'), '2026-03-10');

    expect(day).toMatchObject({
      planned_count: 2, planned_calories: 1200, actual_meals: 3, actual_calories: 1200, calorie_diff: 0,
    });
  });

  it("counts meals on the user's local day", async () => {
    // 23:30 on Mar 10 in New York is Mar 11 in UTC.
    const yu = await createUser('yu', 'America/New_York');
    await createPlan(yu, '2026-03-10', 'snack', 300);
    await logMealAt(yu, '2026-03-10 23:30', 350);

    const week = await planModel.getWeek(yu, '2026-03-10');

    expect(dayOf(week, '2026-03-10')).toMatchObject({ actual_calories: 350, calorie_diff: 50 });
    expect(dayOf(week, '2026-03-11').actual_calories).toBe(0);
  });

  it('leaves calorie_diff empty unless the day has both a plan and a logged meal', async () => {
    const yu = await createUser('yu', 'America/New_York');
    await createPlan(yu, '2026-03-10', 'lunch', 500);
    await logMealAt(yu, '2026-03-11 12:00', 500);

    const week = await planModel.getWeek(yu, '2026-03-10');

    expect(dayOf(week, '2026-03-10').calorie_diff).toBeNull();
    expect(dayOf(week, '2026-03-11').calorie_diff).toBeNull();
  });

  it('counts a plan as followed only while its logged meal exists', async () => {
    const yu = await createUser('yu', 'America/New_York');
    const meal_id = await logMealAt(yu, '2026-03-10 12:00', 500);
    await createPlan(yu, '2026-03-10', 'lunch', 500, meal_id);

    expect(dayOf(await planModel.getWeek(yu, '2026-03-10'), '2026-03-10').followed_count).toBe(1);

    // ON DELETE SET NULL clears the link when the meal is deleted.
    await pool.query('DELETE FROM meals WHERE meal_id = $1', [meal_id]);

    expect(dayOf(await planModel.getWeek(yu, '2026-03-10'), '2026-03-10').followed_count).toBe(0);
  });

  it('summarizes a finished week', async () => {
    // 4 plans, 3 followed. Diffs: Mar 9 is +100, Mar 10 is -300, Mar 11 has
    // no meals so it is left out. Average diff (100 - 300) / 2 = -100.
    const yu = await createUser('yu', 'America/New_York');
    const breakfast = await logMealAt(yu, '2026-03-09 08:00', 400);
    const lunch = await logMealAt(yu, '2026-03-09 12:00', 700);
    const dinner = await logMealAt(yu, '2026-03-10 19:00', 500);
    await createPlan(yu, '2026-03-09', 'breakfast', 400, breakfast);
    await createPlan(yu, '2026-03-09', 'lunch', 600, lunch);
    await createPlan(yu, '2026-03-10', 'dinner', 800, dinner);
    await createPlan(yu, '2026-03-11', 'dinner', 800);

    const { summary } = await planModel.getWeek(yu, '2026-03-09');

    expect(summary).toEqual({ planned_meals: 4, followed_meals: 3, follow_rate: 75, avg_calorie_diff: -100 });
  });

  it("leaves today's and future plans out of the summary", async () => {
    const yu = await createUser('yu', 'America/New_York');
    const today = await localDay(yu);
    await createPlan(yu, today, 'dinner', 600);

    const week = await planModel.getWeek(yu, null);

    expect(dayOf(week, today)).toMatchObject({ is_today: true, is_past: false, planned_count: 1 });
    expect(week.summary).toEqual({ planned_meals: 0, followed_meals: 0, follow_rate: null, avg_calorie_diff: null });
  });

  it("returns only the user's own plans, in slot order", async () => {
    const yu = await createUser('yu', 'America/New_York');
    const chie = await createUser('chie', 'America/New_York');
    await createPlan(yu, '2026-03-10', 'dinner', 700);
    await createPlan(yu, '2026-03-10', 'breakfast', 300);
    await createPlan(chie, '2026-03-10', 'lunch', 9000);

    const day = dayOf(await planModel.getWeek(yu, '2026-03-10'), '2026-03-10');

    expect(day.plans.map((plan) => plan.slot)).toEqual(['breakfast', 'dinner']);
    expect(day.planned_calories).toBe(1000);
  });
});

describe('create', () => {
  it("copies the saved meal's name and numbers onto the plan", async () => {
    const yu = await createUser('yu', 'America/New_York');
    const salad = await createSavedMeal(yu, 'Salad', 'lunch', 400);

    const plan = await planModel.create(yu, { plan_date: '2026-03-10', slot: 'lunch', saved_meal_id: salad });

    expect(plan).toMatchObject({ plan_date: '2026-03-10', slot: 'lunch', name: 'Salad', calories: 400, saved_meal_id: salad });
  });

  it('refuses a second plan for the same slot and day', async () => {
    const yu = await createUser('yu', 'America/New_York');
    const salad = await createSavedMeal(yu, 'Salad', 'lunch', 400);
    const plan = { plan_date: '2026-03-10', slot: 'lunch', saved_meal_id: salad };

    await planModel.create(yu, plan);

    expect(await planModel.create(yu, plan)).toEqual({ error: 'slot_taken' });
  });

  it("refuses another user's saved meal", async () => {
    const yu = await createUser('yu', 'America/New_York');
    const chie = await createUser('chie', 'America/New_York');
    const chiesMeal = await createSavedMeal(chie, 'Salad', 'lunch', 400);

    expect(await planModel.create(yu, { plan_date: '2026-03-10', slot: 'lunch', saved_meal_id: chiesMeal }))
      .toEqual({ error: 'meal_not_found' });
  });
});

describe('logAsMeal', () => {
  it("logs today's plan at the current time and links the meal", async () => {
    const yu = await createUser('yu', 'America/New_York');
    const today = await localDay(yu);
    const planId = await createPlan(yu, today, 'lunch', 450);

    const { plan, meal } = await planModel.logAsMeal(planId, yu);

    expect(plan.meal_id).toBe(meal.meal_id);
    expect(meal.calories).toBe(450);
    expect(Date.now() - new Date(meal.logged_at).getTime()).toBeLessThan(60000);
    const [report] = await nutritionModel.dailyTotals(yu, today, today);
    expect(report.calories).toBe(450);
  });

  it("logs an earlier day's plan at that slot's time in the user's timezone", async () => {
    const chie = await createUser('chie', 'America/Los_Angeles');
    const threeDaysAgo = await localDay(chie, -3);
    const planId = await createPlan(chie, threeDaysAgo, 'dinner', 600);

    const { meal } = await planModel.logAsMeal(planId, chie);

    const { rows } = await pool.query(
      "SELECT local_day, TO_CHAR(logged_at AT TIME ZONE timezone, 'HH24:MI') AS local_time FROM meals_local WHERE meal_id = $1",
      [meal.meal_id],
    );
    expect(rows[0]).toEqual({ local_day: threeDaysAgo, local_time: '19:00' });
  });

  it('refuses plans for future days without creating a meal', async () => {
    const yu = await createUser('yu', 'America/New_York');
    const planId = await createPlan(yu, await localDay(yu, 1), 'lunch', 450);

    expect(await planModel.logAsMeal(planId, yu)).toEqual({ error: 'future' });
    expect(await mealCount(yu)).toBe(0);
  });

  it('refuses to log the same plan twice', async () => {
    const yu = await createUser('yu', 'America/New_York');
    const planId = await createPlan(yu, await localDay(yu), 'lunch', 450);

    await planModel.logAsMeal(planId, yu);

    expect(await planModel.logAsMeal(planId, yu)).toEqual({ error: 'already_logged' });
    expect(await mealCount(yu)).toBe(1);
  });

  it('logs only once when two requests arrive at the same moment', async () => {
    // Without the row lock, both requests could read meal_id as NULL and each
    // create a meal.
    const yu = await createUser('yu', 'America/New_York');
    const planId = await createPlan(yu, await localDay(yu), 'lunch', 450);

    const results = await Promise.all([planModel.logAsMeal(planId, yu), planModel.logAsMeal(planId, yu)]);

    expect(results.filter((result) => result.meal)).toHaveLength(1);
    expect(results.filter((result) => result.error === 'already_logged')).toHaveLength(1);
    expect(await mealCount(yu)).toBe(1);
  });

  it("treats another user's plan as not found", async () => {
    const yu = await createUser('yu', 'America/New_York');
    const chie = await createUser('chie', 'America/New_York');
    const planId = await createPlan(chie, await localDay(chie), 'lunch', 450);

    expect(await planModel.logAsMeal(planId, yu)).toEqual({ error: 'not_found' });
  });
});

describe('destroy', () => {
  it('keeps the meal that was logged from the plan', async () => {
    const yu = await createUser('yu', 'America/New_York');
    const planId = await createPlan(yu, await localDay(yu), 'lunch', 450);
    await planModel.logAsMeal(planId, yu);

    expect(await planModel.destroy(planId, yu)).toMatchObject({ planned_meal_id: planId });
    expect(await mealCount(yu)).toBe(1);
  });

  it("does not delete another user's plan", async () => {
    const yu = await createUser('yu', 'America/New_York');
    const chie = await createUser('chie', 'America/New_York');
    const planId = await createPlan(chie, '2026-03-10', 'lunch', 450);

    expect(await planModel.destroy(planId, yu)).toBeNull();
  });
});
