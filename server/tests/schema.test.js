import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { createSchema, ensureSchema } from '../db/schema';

// ensureSchema runs on every server start against whatever database exists,
// so it has to upgrade old databases and be safe to repeat.

const dropEverything = async () => {
  await pool.query('DROP VIEW IF EXISTS meals_local');
  await pool.query('DROP TABLE IF EXISTS planned_meals, meals, users');
};

beforeEach(dropEverything);

afterAll(async () => {
  await dropEverything();
  await pool.end();
});

describe('ensureSchema', () => {
  it('upgrades a database created by the original seed without losing data', async () => {
    // The schema from the first version of the app: no timezone column, no
    // photo_data, no planned_meals, no view.
    await pool.query('CREATE TABLE users (user_id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL)');
    await pool.query(`
      CREATE TABLE meals (
        meal_id SERIAL PRIMARY KEY, name TEXT NOT NULL, calories INTEGER NOT NULL,
        protein_g INTEGER NOT NULL DEFAULT 0, carbs_g INTEGER NOT NULL DEFAULT 0, fat_g INTEGER NOT NULL DEFAULT 0,
        logged_at TIMESTAMPTZ DEFAULT NOW(), user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE
      )
    `);
    await pool.query("INSERT INTO users (username, password_hash) VALUES ('yu', 'x')");
    await pool.query("INSERT INTO meals (name, calories, user_id, logged_at) VALUES ('Toast', 200, 1, '2026-03-10 23:30-04')");

    await ensureSchema(pool);

    const { rows } = await pool.query('SELECT name, photo_data, timezone, local_day FROM meals_local');
    expect(rows).toEqual([{ name: 'Toast', photo_data: null, timezone: 'America/New_York', local_day: '2026-03-10' }]);
    await pool.query("INSERT INTO planned_meals (user_id, plan_date, slot, name, calories) VALUES (1, '2026-03-10', 'lunch', 'Salad', 400)");
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
