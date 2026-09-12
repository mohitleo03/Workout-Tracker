/**
 * Fills in the calorie estimate on workouts that were finished before there
 * was one.
 *
 * Every completed session already holds what the estimate is made of - the
 * sets, their durations, the rest between them, the warm-up block - so this
 * reads nothing new. It only writes the `energy` field, and only where it is
 * missing. Nothing else on a session is touched and nothing is ever removed.
 *
 *   node src/scripts/backfillEnergy.js            # report only, writes nothing
 *   node src/scripts/backfillEnergy.js --write
 */
import 'dotenv/config';
import { connectDB, disconnectDB } from '../config/db.js';
import { WorkoutSession } from '../models/WorkoutSession.js';
import { estimateFor } from '../services/energy.js';

const write = process.argv.includes('--write');

async function main() {
  await connectDB();

  const sessions = await WorkoutSession.find({
    status: 'completed',
    $or: [{ energy: null }, { 'energy.estimatedKcal': null }],
  }).sort({ date: 1 });

  console.log(
    `${sessions.length} completed workout(s) with no estimate` +
      (write ? '' : ' - dry run, pass --write to save')
  );

  let filled = 0;
  let skipped = 0;

  for (const session of sessions) {
    const energy = await estimateFor(session, session.owner);

    // No bodyweight on record means no honest estimate. Better a dash in the
    // app than a number invented from an average.
    if (!energy) {
      skipped += 1;
      continue;
    }

    const when = session.date.toISOString().slice(0, 10);
    console.log(
      `  ${when}  ${String(session.title || 'Workout').padEnd(28)} ` +
        `~${energy.estimatedKcal} kcal`
    );

    if (write) {
      // updateOne, not save(): saving re-runs recalculate(), which would
      // rewrite the totals of a workout recorded months ago. Only the field
      // that is missing gets written.
      await WorkoutSession.updateOne({ _id: session._id }, { $set: { energy } });
    }
    filled += 1;
  }

  console.log(
    `\n${write ? 'Filled' : 'Would fill'} ${filled}` +
      (skipped ? `, skipped ${skipped} with no bodyweight on record` : '')
  );

  await disconnectDB();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDB();
  process.exit(1);
});
