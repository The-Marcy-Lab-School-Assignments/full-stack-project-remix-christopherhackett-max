import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import pool from '../db/pool';
import { createSchema } from '../db/schema';
import savedMealModel from '../models/savedMealModel';
import mealModel from '../models/mealModel';
import { createPlan, createSavedMeal, createUser } from './helpers';

beforeEach(async () => {
  await createSchema(pool);
});

afterAll(async () => {
  await pool.end();
});

const salad = { name: 'Salad', meal_type: 'lunch', calories: 400, protein_g: 20, carbs_g: 30, fat_g: 10, photo_data: null };

describe('listByUser', () => {
  it('orders by meal type, then by how often each meal was eaten', async () => {
    const yu = await createUser('yu', 'America/New_York');
    const dinner = await createSavedMeal(yu, 'Pasta', 'dinner', 700);
    const toast = await createSavedMeal(yu, 'Toast', 'breakfast', 200);
    const oats = await createSavedMeal(yu, 'Oats', 'breakfast', 300);
    await mealModel.logSavedMeal(oats, yu);
    await mealModel.logSavedMeal(oats, yu);
    await mealModel.logSavedMeal(toast, yu);

    const list = await savedMealModel.listByUser(yu);

    expect(list.map((meal) => [meal.name, meal.times_eaten])).toEqual([['Oats', 2], ['Toast', 1], ['Pasta', 0]]);
    expect(list[2].saved_meal_id).toBe(dinner);
  });

  it('counts each meal once even when eaten many times (no fan-out into the list)', async () => {
    const yu = await createUser('yu', 'America/New_York');
    const oats = await createSavedMeal(yu, 'Oats', 'breakfast', 300);
    for (let i = 0; i < 3; i++) await mealModel.logSavedMeal(oats, yu);

    const list = await savedMealModel.listByUser(yu);

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ times_eaten: 3, calories: 300 });
  });

  it("leaves out photos and other users' meals", async () => {
    const yu = await createUser('yu', 'America/New_York');
    const chie = await createUser('chie', 'America/New_York');
    await savedMealModel.create(yu, { ...salad, photo_data: 'data:image/png;base64,AAAA' });
    await createSavedMeal(chie, 'Soup', 'dinner', 300);

    const list = await savedMealModel.listByUser(yu);

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Salad', has_photo: true });
    expect(list[0]).not.toHaveProperty('photo_data');
  });
});

describe('create', () => {
  it('treats names that differ only in case as the same meal', async () => {
    const yu = await createUser('yu', 'America/New_York');

    expect(await savedMealModel.create(yu, salad)).toMatchObject({ name: 'Salad' });
    expect(await savedMealModel.create(yu, { ...salad, name: 'SALAD' })).toBeNull();
  });

  it('lets two users save meals with the same name', async () => {
    const yu = await createUser('yu', 'America/New_York');
    const chie = await createUser('chie', 'America/New_York');

    await savedMealModel.create(yu, salad);

    expect(await savedMealModel.create(chie, salad)).toMatchObject({ name: 'Salad' });
  });
});

describe('logSavedMeal', () => {
  it("copies the saved meal's numbers onto the eaten meal", async () => {
    const yu = await createUser('yu', 'America/New_York');
    const saved = await savedMealModel.create(yu, salad);

    const meal = await mealModel.logSavedMeal(saved.saved_meal_id, yu);

    expect(meal).toMatchObject({ name: 'Salad', calories: 400, protein_g: 20, carbs_g: 30, fat_g: 10, saved_meal_id: saved.saved_meal_id });
  });

  it("returns null for another user's saved meal and logs nothing", async () => {
    const yu = await createUser('yu', 'America/New_York');
    const chie = await createUser('chie', 'America/New_York');
    const chiesMeal = await createSavedMeal(chie, 'Soup', 'dinner', 300);

    expect(await mealModel.logSavedMeal(chiesMeal, yu)).toBeNull();
    expect(await mealModel.listByUser(yu)).toEqual([]);
  });
});

describe('destroy', () => {
  it('keeps eaten meals and plans, with their own copies, and clears the link', async () => {
    const yu = await createUser('yu', 'America/New_York');
    const saved = await savedMealModel.create(yu, salad);
    await mealModel.logSavedMeal(saved.saved_meal_id, yu);
    const planId = await createPlan(yu, '2026-03-10', 'lunch', 400);
    await pool.query('UPDATE planned_meals SET saved_meal_id = $1 WHERE planned_meal_id = $2', [saved.saved_meal_id, planId]);

    await savedMealModel.destroy(saved.saved_meal_id, yu);

    const [meal] = await mealModel.listByUser(yu);
    const { rows: [plan] } = await pool.query('SELECT saved_meal_id, calories FROM planned_meals WHERE planned_meal_id = $1', [planId]);
    expect(meal).toMatchObject({ name: 'Salad', calories: 400, saved_meal_id: null });
    expect(plan).toEqual({ saved_meal_id: null, calories: 400 });
  });

  it("does not delete another user's saved meal", async () => {
    const yu = await createUser('yu', 'America/New_York');
    const chie = await createUser('chie', 'America/New_York');
    const chiesMeal = await createSavedMeal(chie, 'Soup', 'dinner', 300);

    expect(await savedMealModel.destroy(chiesMeal, yu)).toBeNull();
  });
});
