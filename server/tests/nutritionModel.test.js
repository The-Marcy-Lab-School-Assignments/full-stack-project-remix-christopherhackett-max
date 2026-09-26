import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { createSchema } from '../db/schema';
import nutritionModel from '../models/nutritionModel';
import { createUser, logMealAt, logMealDaysAgo } from './helpers';

// Every fixture is small enough to check by hand: the expected numbers in each
// test can be worked out from the meals inserted just above them.

const byDay = (rows) => Object.fromEntries(rows.map((row) => [row.day, row]));

beforeEach(async () => {
  await createSchema(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('dailyTotals', () => {
  it('returns one row per day in the range, including days with no meals', async () => {
    const yu = await createUser('yu', 'America/New_York');
    await logMealAt(yu, '2026-03-10 12:00', 600);

    const rows = await nutritionModel.dailyTotals(yu, '2026-03-10', '2026-03-12');

    expect(rows.map((row) => row.day)).toEqual(['2026-03-10', '2026-03-11', '2026-03-12']);
    expect(byDay(rows)['2026-03-11']).toMatchObject({ meal_count: 0, calories: 0 });
  });

  it('sums every meal logged on the same day', async () => {
    const yu = await createUser('yu', 'America/New_York');
    await logMealAt(yu, '2026-03-10 08:00', 300, 10);
    await logMealAt(yu, '2026-03-10 13:00', 500, 30);
    await logMealAt(yu, '2026-03-10 19:00', 700, 40);

    const [day] = await nutritionModel.dailyTotals(yu, '2026-03-10', '2026-03-10');

    expect(day).toMatchObject({ meal_count: 3, calories: 1500, protein_g: 80 });
  });

  it("assigns a late-night meal to the user's local day, not the UTC day", async () => {
    // 23:30 in New York on Mar 10 is 03:30 UTC on Mar 11.
    const yu = await createUser('yu', 'America/New_York');
    await logMealAt(yu, '2026-03-10 23:30', 400);

    const days = byDay(await nutritionModel.dailyTotals(yu, '2026-03-10', '2026-03-11'));

    expect(days['2026-03-10'].calories).toBe(400);
    expect(days['2026-03-11'].calories).toBe(0);
  });

  it('places the same UTC instant on different days for users in different timezones', async () => {
    // 2026-03-11 04:30 UTC is 00:30 Mar 11 in New York but 21:30 Mar 10 in Los Angeles.
    const yu = await createUser('yu', 'America/New_York');
    const chie = await createUser('chie', 'America/Los_Angeles');
    await logMealAt(yu, '2026-03-11 00:30', 400);
    await logMealAt(chie, '2026-03-10 21:30', 400);

    const yuDays = byDay(await nutritionModel.dailyTotals(yu, '2026-03-10', '2026-03-11'));
    const chieDays = byDay(await nutritionModel.dailyTotals(chie, '2026-03-10', '2026-03-11'));

    expect(yuDays['2026-03-11'].calories).toBe(400);
    expect(chieDays['2026-03-10'].calories).toBe(400);
  });

  it('keeps meals just past the range boundary out of the last day', async () => {
    const yu = await createUser('yu', 'America/New_York');
    await logMealAt(yu, '2026-03-12 23:59', 100);
    await logMealAt(yu, '2026-03-13 00:01', 900);

    const rows = await nutritionModel.dailyTotals(yu, '2026-03-12', '2026-03-12');

    expect(rows).toHaveLength(1);
    expect(rows[0].calories).toBe(100);
  });

  it('handles the daylight saving day (Mar 8, 2026 has 23 hours in New York)', async () => {
    const yu = await createUser('yu', 'America/New_York');
    await logMealAt(yu, '2026-03-08 23:30', 450);
    await logMealAt(yu, '2026-03-09 00:30', 550);

    const days = byDay(await nutritionModel.dailyTotals(yu, '2026-03-07', '2026-03-09'));

    expect(Object.keys(days)).toEqual(['2026-03-07', '2026-03-08', '2026-03-09']);
    expect(days['2026-03-08'].calories).toBe(450);
    expect(days['2026-03-09'].calories).toBe(550);
  });

  it("does not count another user's meals", async () => {
    const yu = await createUser('yu', 'America/New_York');
    const chie = await createUser('chie', 'America/New_York');
    await logMealAt(yu, '2026-03-10 12:00', 500);
    await logMealAt(chie, '2026-03-10 12:00', 9000);

    const [day] = await nutritionModel.dailyTotals(yu, '2026-03-10', '2026-03-10');

    expect(day.calories).toBe(500);
  });

  describe('7-day rolling average', () => {
    it('averages only the days with meals logged', async () => {
      // Logged 1000 on Mar 4 and 2000 on Mar 10, nothing in between.
      // Averaging over all 7 days would give 3000 / 7 = 429. Skipping the
      // empty days gives (1000 + 2000) / 2 = 1500.
      const yu = await createUser('yu', 'America/New_York');
      await logMealAt(yu, '2026-03-04 12:00', 1000);
      await logMealAt(yu, '2026-03-10 12:00', 2000);

      const [day] = await nutritionModel.dailyTotals(yu, '2026-03-10', '2026-03-10');

      expect(day).toMatchObject({ calories_7d_avg: 1500, days_logged_7d: 2 });
    });

    it('looks back before the start of the requested range', async () => {
      // The range starts Mar 10, but the window for Mar 10 is Mar 4 to Mar 10.
      const yu = await createUser('yu', 'America/New_York');
      await logMealAt(yu, '2026-03-05 12:00', 1200);
      await logMealAt(yu, '2026-03-10 12:00', 1800);

      const rows = await nutritionModel.dailyTotals(yu, '2026-03-10', '2026-03-11');

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ day: '2026-03-10', calories_7d_avg: 1500 });
    });

    it('drops days older than 7 days out of the window', async () => {
      // Mar 3 is 7 days before Mar 10, one day outside the window.
      const yu = await createUser('yu', 'America/New_York');
      await logMealAt(yu, '2026-03-03 12:00', 5000);
      await logMealAt(yu, '2026-03-10 12:00', 1000);

      const [day] = await nutritionModel.dailyTotals(yu, '2026-03-10', '2026-03-10');

      expect(day).toMatchObject({ calories_7d_avg: 1000, days_logged_7d: 1 });
    });

    it('is null when nothing was logged in the window', async () => {
      const yu = await createUser('yu', 'America/New_York');

      const [day] = await nutritionModel.dailyTotals(yu, '2026-03-10', '2026-03-10');

      expect(day).toMatchObject({ calories_7d_avg: null, days_logged_7d: 0 });
    });
  });
});

describe('streaks', () => {
  it('returns zeros for a user with no meals', async () => {
    const yu = await createUser('yu', 'America/New_York');

    expect(await nutritionModel.streaks(yu)).toEqual({ current_streak: 0, longest_streak: 0 });
  });

  it('finds the current and longest runs of consecutive days', async () => {
    // Logged today, 1 and 2 days ago (current run of 3), skipped 3 days ago,
    // then logged 4 to 8 days ago (older run of 5).
    const yu = await createUser('yu', 'America/New_York');
    for (const daysAgo of [0, 1, 2, 4, 5, 6, 7, 8]) await logMealDaysAgo(yu, daysAgo);

    expect(await nutritionModel.streaks(yu)).toEqual({ current_streak: 3, longest_streak: 5 });
  });

  it('counts several meals on one day as a single day', async () => {
    const yu = await createUser('yu', 'America/New_York');
    for (const daysAgo of [0, 0, 0, 1]) await logMealDaysAgo(yu, daysAgo);

    expect(await nutritionModel.streaks(yu)).toEqual({ current_streak: 2, longest_streak: 2 });
  });

  it('keeps a streak current when the last meal was yesterday', async () => {
    const yu = await createUser('yu', 'America/New_York');
    for (const daysAgo of [1, 2]) await logMealDaysAgo(yu, daysAgo);

    expect((await nutritionModel.streaks(yu)).current_streak).toBe(2);
  });

  it('ends the current streak after a full missed day', async () => {
    const yu = await createUser('yu', 'America/New_York');
    for (const daysAgo of [2, 3, 4]) await logMealDaysAgo(yu, daysAgo);

    expect(await nutritionModel.streaks(yu)).toEqual({ current_streak: 0, longest_streak: 3 });
  });
});
