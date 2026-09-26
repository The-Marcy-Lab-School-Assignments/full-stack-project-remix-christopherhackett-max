const bcrypt = require('bcrypt');
const pool = require('./pool');
const { createSchema } = require('./schema');

const SALT_ROUNDS = 8;
const HISTORY_DAYS = 60;

// Small seeded random number generator (mulberry32) so every seed run
// produces the same history. That keeps numbers reproducible when checking
// report output by hand.
const createRandom = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const pick = (random, items) => items[Math.floor(random() * items.length)];

// [name, calories, protein_g, carbs_g, fat_g]
const MEAL_LIBRARY = {
  breakfast: [
    ['Oatmeal with berries', 320, 8, 58, 6],
    ['Greek yogurt parfait', 290, 20, 38, 5],
    ['Scrambled eggs and toast', 410, 24, 30, 20],
    ['Banana peanut butter toast', 380, 12, 48, 16],
  ],
  lunch: [
    ['Grilled chicken salad', 450, 42, 18, 22],
    ['Turkey sandwich', 520, 34, 52, 16],
    ['Chicken burrito bowl', 640, 44, 70, 18],
    ['Tuna rice bowl', 560, 38, 64, 12],
  ],
  dinner: [
    ['Salmon with quinoa', 480, 42, 36, 14],
    ['Brown rice and broccoli', 410, 14, 78, 4],
    ['Beef stir fry', 620, 40, 54, 24],
    ['Chicken pasta', 700, 46, 80, 18],
  ],
  snack: [
    ['Protein shake', 200, 30, 10, 4],
    ['Apple and almonds', 250, 6, 26, 14],
    ['Instant ramen', 380, 8, 52, 14],
  ],
};

// Each user gets a different logging pattern so the report has something to
// show. Times are local wall-clock times in the user's timezone.
const USER_PROFILES = [
  {
    username: 'yu',
    timezone: 'America/New_York',
    randomSeed: 4,
    // Missed days break the logging streak.
    skippedDaysAgo: [9, 20, 21, 35],
    logChance: 1,
    meals: [
      ['breakfast', '08:00'],
      ['lunch', '12:30'],
      ['dinner', '19:00'],
    ],
    // 23:30 in New York is 03:30 UTC the next day, so a report that groups by
    // the UTC date would put these snacks on the wrong day.
    lateSnack: { time: '23:30', chance: 0.3 },
  },
  {
    username: 'chie',
    timezone: 'America/Los_Angeles',
    randomSeed: 8,
    skippedDaysAgo: [2, 3],
    // Logs about three days out of four.
    logChance: 0.75,
    meals: [
      ['breakfast', '07:30'],
      ['lunch', '12:00'],
      // 17:30 in Los Angeles is 00:30 UTC the next day: every dinner crosses
      // the UTC date line.
      ['dinner', '17:30'],
    ],
    lateSnack: { time: '00:15', chance: 0.2 },
  },
];

const buildMealRows = (profile, user_id) => {
  const random = createRandom(profile.randomSeed);
  const rows = [];

  for (let daysAgo = HISTORY_DAYS - 1; daysAgo >= 0; daysAgo--) {
    if (profile.skippedDaysAgo.includes(daysAgo)) continue;
    if (random() > profile.logChance) continue;

    const slots = [...profile.meals];
    if (random() < profile.lateSnack.chance) slots.push(['snack', profile.lateSnack.time]);

    for (const [slot, localTime] of slots) {
      const [name, calories, protein_g, carbs_g, fat_g] = pick(random, MEAL_LIBRARY[slot]);
      rows.push({ name, calories, protein_g, carbs_g, fat_g, user_id, daysAgo, localTime });
    }
  }

  return rows;
};

const seed = async () => {
  await createSchema(pool);

  const users = [];
  for (const profile of USER_PROFILES) {
    const passwordHash = await bcrypt.hash('password123', SALT_ROUNDS);
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash, timezone) VALUES ($1, $2, $3) RETURNING user_id, username, timezone',
      [profile.username, passwordHash, profile.timezone],
    );
    users.push({ ...rows[0], profile });
  }

  const mealRows = users.flatMap((user) => buildMealRows(user.profile, user.user_id));
  const column = (key) => mealRows.map((row) => row[key]);

  // Dates are relative to "today" in each user's own timezone. A local date
  // plus a local time is a timestamp without time zone; AT TIME ZONE turns it
  // into the correct UTC instant. Meals later today than right now are skipped.
  const { rowCount } = await pool.query(`
    INSERT INTO meals (name, calories, protein_g, carbs_g, fat_g, user_id, logged_at)
    SELECT * FROM (
      SELECT
        m.name, m.calories, m.protein_g, m.carbs_g, m.fat_g, user_id,
        (((NOW() AT TIME ZONE u.timezone)::date - m.days_ago) + m.local_time) AT TIME ZONE u.timezone AS logged_at
      FROM unnest($1::text[], $2::int[], $3::int[], $4::int[], $5::int[], $6::int[], $7::int[], $8::time[])
        AS m(name, calories, protein_g, carbs_g, fat_g, user_id, days_ago, local_time)
      JOIN users u USING (user_id)
    ) AS generated
    WHERE logged_at <= NOW()
  `, [
    column('name'), column('calories'), column('protein_g'), column('carbs_g'),
    column('fat_g'), column('user_id'), column('daysAgo'), column('localTime'),
  ]);

  return { users, mealCount: rowCount };
};

seed()
  .then(({ users, mealCount }) => {
    console.log('Database seeded successfully.');
    console.log(`  Users: ${users.map((u) => `${u.username} (${u.timezone})`).join(', ')}`);
    console.log(`  Meals: ${mealCount} across the last ${HISTORY_DAYS} days`);
  })
  .catch((err) => {
    console.error('Error seeding database:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
