import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tests rebuild the schema, so they must never touch the dev database.
    // dotenv does not override variables that are already set, so these win
    // over server/.env. PG_CONNECTION_STRING is cleared so a deploy URL in
    // .env can never be used by the test suite.
    env: {
      PGDATABASE: 'nourish_test',
      PG_CONNECTION_STRING: '',
    },
    // All test files share one database.
    fileParallelism: false,
  },
});
