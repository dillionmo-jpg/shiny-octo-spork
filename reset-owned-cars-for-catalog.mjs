import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

const root = process.cwd();
const targetArg = process.argv[2];

async function main() {
  let catalogId = String(targetArg || '').trim();
  if (!catalogId) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    catalogId = String(await rl.question('Catalog car ID to reset owned copies for: ')).trim();
    rl.close();
  }
  if (!catalogId) throw new Error('Missing catalog car ID. Example: node tools/reset-owned-cars-for-catalog.mjs 121');

  const dbPath = path.join(root, 'data', 'json-db', 'game_cars.json');
  if (!fs.existsSync(dbPath)) throw new Error(`Missing ${path.relative(root, dbPath)}`);
  const rows = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  if (!Array.isArray(rows)) throw new Error('game_cars.json must be an array.');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(root, 'data', 'json-db-backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `game_cars.before-reset-${catalogId}.${stamp}.json`);
  fs.copyFileSync(dbPath, backupPath);

  let count = 0;
  for (const row of rows) {
    if (String(row.catalog_car_id || '') !== catalogId) continue;
    row.parts_xml = '';
    row.engine_parts_xml = '';
    row.engine_type_id = 0;
    row.updated_at = new Date().toISOString();
    count++;
  }

  fs.writeFileSync(dbPath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  console.log(`[backup] ${path.relative(root, backupPath)}`);
  console.log(`[reset] ${count} owned car(s) with catalog_car_id=${catalogId}`);
  console.log('Restart the server and log back in.');
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`);
  process.exit(1);
});
