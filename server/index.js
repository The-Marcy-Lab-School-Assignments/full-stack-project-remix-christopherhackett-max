const app = require('./app');
const pool = require('./db/pool');
const { ensureSchema } = require('./db/schema');

const PORT = process.env.PORT || 8080;

// Create any missing tables, columns, or views before accepting requests.
ensureSchema(pool)
  .then(() => {
    app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Error preparing database schema:', err);
    process.exit(1);
  });
