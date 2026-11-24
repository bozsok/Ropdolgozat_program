const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

console.log('================================================================');
console.log('   OKOSKODÓ TELJES INTEGRÁCIÓS ÉS REGRESSZIÓS TESZTCSOMAG       ');
console.log('================================================================\n');

// 1. Műveletenként teljesen elkülönített, egyedi ideiglenes tesztkönyvtár létrehozása (Report 18 / 4. pont)
const testRunId = `okoskodo_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
const isolatedDir = path.join(os.tmpdir(), testRunId);
fs.mkdirSync(isolatedDir, { recursive: true });

const isolatedDbPath = path.join(isolatedDir, 'ropdolgozat_isolated.db');
const isolatedUploadsDir = path.join(isolatedDir, 'uploads_isolated');
fs.mkdirSync(isolatedUploadsDir, { recursive: true });

console.log(`✓ Elszigetelt tesztkörnyezet létrehozva: ${isolatedDir}`);
console.log(`✓ Teszt adatbázis: ${isolatedDbPath}`);
console.log(`✓ Teszt feltöltési mappa: ${isolatedUploadsDir}\n`);

const testFiles = [
  'scratch/test_full_system.js',
  'scratch/test_report12_fixes.js',
  'scratch/test_socrative_import.js',
  'scratch/test_merge_quizzes.js',
  'scratch/test_report14_fixes.js',
  'scratch/test_diagnostics.js',
  'scratch/test_teacher_paced.js',
  'scratch/test_open_navigation.js'
];

let allPassed = true;
const projectRoot = path.join(__dirname, '..');

for (const testFile of testFiles) {
  const fullPath = path.join(projectRoot, testFile);
  console.log(`\n>>> Futtatás: ${testFile} ...`);

  const result = spawnSync(process.execPath, [fullPath], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      DB_PATH: isolatedDbPath,
      UPLOADS_DIR: isolatedUploadsDir
    }
  });

  if (result.status !== 0) {
    console.error(`\n❌ HIBA: A(z) ${testFile} hibakóddal fejeződött be: ${result.status}`);
    allPassed = false;
    break;
  }
}

// Takarítás a tesztlefutás után (Report 18 / 4. pont)
try {
  fs.rmSync(isolatedDir, { recursive: true, force: true });
  console.log(`\n✓ Elszigetelt tesztkönyvtár sikeresen kitakarítva: ${isolatedDir}`);
} catch (cleanupErr) {
  console.warn(`Figyelmeztetés a tesztkönyvtár takarításakor:`, cleanupErr.message);
}

if (!allPassed) {
  console.error('\n❌ A tesztcsomag futtatása hibával zárult!');
  process.exit(1);
} else {
  console.log('\n================================================================');
  console.log('🎉 MINDEN TESZTSOROZAT (100%) HIBÁTLANUL LEFUTOTT! 🎉');
  console.log('================================================================\n');
  process.exit(0);
}
