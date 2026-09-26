import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { createSchema, ensureSchema } from '../db/schema';

// ensureSchema runs on every server start against whatever database exists,
// so it has to upgrade old databases and be safe to repeat.

const dropEverything = async () => {
  await pool.query('DROP VIEW IF EXISTS meals_local');
  await pool.query('DROP TABLE IF EXISTS planned_meals, meals, saved_meals, users');
};

// The schema from the first version of the app: no timezone column, no
// photo_data, no saved meals, no planned_meals, no view.
const createOriginalSchema = async () => {
  await pool.query('CREATE TABLE users (user_id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL)');
  await pool.query(`
    CREATE TABLE meals (
      meal_id SERIAL PRIMARY KEY, name TEXT NOT NULL, calories INTEGER NOT NULL,
      protein_g INTEGER NOT NULL DEFAULT 0, carbs_g INTEGER NOT NULL DEFAULT 0, fat_g INTEGER NOT NULL DEFAULT 0,
      logged_at TIMESTAMPTZ DEFAULT NOW(), user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE
    )
  `);
  await pool.query("INSERT INTO users (username, password_hash) VALUES ('yu', 'x')");
};

beforeEach(dropEverything);

afterAll(async () => {
  await dropEverything();
  await pool.end();
});

describe('ensureSchema', () => {
  it('upgrades a database created by the original seed without losing data', async () => {
    await createOriginalSchema();
    await pool.query("INSERT INTO meals (name, calories, user_id, logged_at) VALUES ('Toast', 200, 1, '2026-03-10 23:30-04')");

    await ensureSchema(pool);

    const { rows } = await pool.query('SELECT name, photo_data, timezone, local_day FROM meals_local');
    expect(rows).toEqual([{ name: 'Toast', photo_data: null, timezone: 'America/New_York', local_day: '2026-03-10' }]);
    await pool.query("INSERT INTO planned_meals (user_id, plan_date, slot, name, calories) VALUES (1, '2026-03-10', 'lunch', 'Salad', 400)");
  });

  it('builds saved meals from existing meals and links them, guessing the type from the time eaten', async () => {
    // Oatmeal eaten twice (the most recent copy's numbers win); toast at 23:30 is a snack.
    await createOriginalSchema();
    await pool.query(`
      INSERT INTO meals (name, calories, user_id, logged_at) VALUES
        ('Oatmeal', 300, 1, '2026-03-09 08:00-04'),
        ('oatmeal', 320, 1, '2026-03-10 08:00-04'),
        ('Toast', 200, 1, '2026-03-10 23:30-04')
    `);

    await ensureSchema(pool);

    const { rows: saved } = await pool.query('SELECT name, meal_type, calories FROM saved_meals ORDER BY meal_type');
    const { rows: [{ unlinked }] } = await pool.query('SELECT COUNT(*)::int AS unlinked FROM meals WHERE saved_meal_id IS NULL');
    expect(saved).toEqual([
      { name: 'oatmeal', meal_type: 'breakfast', calories: 320 },
      { name: 'Toast', meal_type: 'snack', calories: 200 },
    ]);
    expect(unlinked).toBe(0);
  });

  it("prefers a plan's slot over a guessed type", async () => {
    // A database from before saved meals, with a planner: Toast eaten at
    // 23:30 (would guess snack) but planned for breakfast.
    await createOriginalSchema();
    await pool.query("INSERT INTO meals (name, calories, user_id, logged_at) VALUES ('Toast', 200, 1, '2026-03-10 23:30-04')");
    await pool.query(`
      CREATE TABLE planned_meals (
        planned_meal_id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(user_id),
        plan_date DATE NOT NULL, slot TEXT NOT NULL, name TEXT NOT NULL, calories INTEGER NOT NULL,
        protein_g INTEGER NOT NULL DEFAULT 0, carbs_g INTEGER NOT NULL DEFAULT 0, fat_g INTEGER NOT NULL DEFAULT 0,
        meal_id INTEGER UNIQUE REFERENCES meals(meal_id) ON DELETE SET NULL, UNIQUE (user_id, plan_date, slot)
      )
    `);
    await pool.query("INSERT INTO planned_meals (user_id, plan_date, slot, name, calories) VALUES (1, '2026-03-11', 'breakfast', 'Toast', 200)");

    await ensureSchema(pool);

    const { rows } = await pool.query('SELECT name, meal_type FROM saved_meals');
    expect(rows).toEqual([{ name: 'Toast', meal_type: 'breakfast' }]);
  });

  it('does not bring back a deleted saved meal on the next start', async () => {
    // Deleting a saved meal clears its links on purpose. If the backfill ran
    // on every start, it would rebuild the meal from that history.
    await createOriginalSchema();
    await pool.query("INSERT INTO meals (name, calories, user_id) VALUES ('Toast', 200, 1)");
    await ensureSchema(pool);

    await pool.query('DELETE FROM saved_meals');
    await ensureSchema(pool);

    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM saved_meals');
    expect(rows[0].count).toBe(0);
  });

  it('can run again on an up-to-date database', async () => {
    await createSchema(pool);
    await ensureSchema(pool);
    await ensureSchema(pool);
  });

  it('still starts after a new column is added to meals', async () => {
    // CREATE OR REPLACE VIEW would fail here, because the view's m.* would now
    // put the new column where timezone used to be.
    await createSchema(pool);
    await pool.query('ALTER TABLE meals ADD COLUMN notes TEXT');

    await ensureSchema(pool);

    const { rows } = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'meals_local'");
    expect(rows.map((row) => row.column_name)).toContain('notes');
  });
});
