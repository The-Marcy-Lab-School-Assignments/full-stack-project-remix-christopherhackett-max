const bcrypt = require('bcrypt');
const pool = require('./pool');

const SALT_ROUNDS = 8;

const seed = async () => {
  await pool.query('DROP TABLE IF EXISTS meals');
  await pool.query('DROP TABLE IF EXISTS users');

  await pool.query(`
    CREATE TABLE users (
      user_id       SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE meals (
      meal_id     SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      calories    INTEGER NOT NULL,
      protein_g   INTEGER NOT NULL DEFAULT 0,
      carbs_g     INTEGER NOT NULL DEFAULT 0,
      fat_g       INTEGER NOT NULL DEFAULT 0,
      photo_data  TEXT,
      logged_at   TIMESTAMPTZ DEFAULT NOW(),
      user_id     INTEGER REFERENCES users(user_id) ON DELETE CASCADE
    )
  `);

  const [yuHash, chieHash] = await Promise.all([
    bcrypt.hash('password123', SALT_ROUNDS),
    bcrypt.hash('password123', SALT_ROUNDS),
  ]);

  const { rows: users } = await pool.query(`
    INSERT INTO users (username, password_hash) VALUES
      ('yu',   $1),
      ('chie', $2)
    RETURNING user_id, username
  `, [yuHash, chieHash]);

  const [yu, chie] = users;

  await pool.query(`
    INSERT INTO meals (name, calories, protein_g, carbs_g, fat_g, user_id) VALUES
      ('Oatmeal with berries',     320,  8, 58,  6, $1),
      ('Grilled chicken breast',   280, 52,  0,  6, $1),
      ('Brown rice and broccoli',  410, 14, 78,  4, $1),
      ('Greek yogurt parfait',     290, 20, 38,  5, $2),
      ('Salmon with quinoa',       480, 42, 36, 14, $2),
      ('Protein shake',            200, 30, 10,  4, $2)
  `, [yu.user_id, chie.user_id]);

  return users;
};

seed()
  .then((users) => {
    console.log('Database seeded successfully.');
    console.log(`  Users: ${users.map((u) => u.username).join(', ')}`);
  })
  .catch((err) => {
    console.error('Error seeding database:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
