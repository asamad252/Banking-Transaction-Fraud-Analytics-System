// Train the Isolation Forest on everything in the database and store the scores.
//   npm run train              (uses the default 2% contamination)
//   npm run train -- 0.015     (flag roughly 1.5% of transactions)
import 'dotenv/config';
import { pool } from '../src/db.js';
import { retrainAll } from '../src/fraud.js';

const contamination = process.argv[2] ? Number(process.argv[2]) : undefined;

try {
  const run = await retrainAll({ contamination });
  console.log(`Trained on ${run.trained_rows} transactions; flagged ${run.flagged_rows}.`);
  if (run.metrics?.precision !== undefined) {
    console.log(
      `Against the seed's planted anomalies: precision ${(run.metrics.precision * 100).toFixed(1)}%, ` +
      `recall ${(run.metrics.recall * 100).toFixed(1)}%.`,
    );
  }
} catch (err) {
  console.error(`Training failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
