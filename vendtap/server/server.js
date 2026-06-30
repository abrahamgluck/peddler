// Server entry point. Ensures the schema exists, then starts listening.
import { createApp } from './src/app.js';
import { initSchema } from './src/db.js';
import { seedIfEmpty } from './src/seed.js';

const PORT = process.env.PORT || 4000;

async function main() {
  await initSchema();
  // Optional: auto-seed demo data on first boot (used by one-click deploys).
  if (process.env.SEED_ON_START === '1') await seedIfEmpty();
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Vendtap API listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
