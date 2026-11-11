// Headless procedure check: dry-runs every rig operating procedure against the
// mechanical rules (no browser needed). Exit code 1 on any failure.
import { runProcedureChecks, runFullCycleCheck } from '../src/sim/checks.js';

const { results, runs } = runProcedureChecks();
results.push(runFullCycleCheck());
let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n      ${r.detail}`);
}
if (process.argv.includes('--steps')) {
  for (const [name, run] of Object.entries(runs)) {
    console.log(`\n${name} (${run.result.time.toFixed(1)} s simulated):`);
    run.labels.forEach((l, i) => console.log(`  ${String(i + 1).padStart(2)}. ${l}`));
  }
}
console.log(`\n${results.length - failed}/${results.length} procedure checks passed`);
process.exit(failed ? 1 : 0);
