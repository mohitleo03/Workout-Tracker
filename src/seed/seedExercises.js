/**
 * Seeds the shared exercise catalog from free-exercise-db.
 *
 *   https://github.com/yuhonas/free-exercise-db  (Unlicense / public domain)
 *
 * 870+ exercises with instructions and 2 tutorial photos each, served straight
 * off the GitHub CDN - no API key, no rate limit, no attribution requirement.
 * Safe to re-run: everything is upserted on externalId.
 */
import { connectDB, disconnectDB } from '../config/db.js';
import { Exercise } from '../models/Exercise.js';

const DATA_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

/** Extra search terms so "incline bench" and "abs" find the right things. */
function buildAliases(item) {
  const aliases = new Set();
  const name = item.name.toLowerCase();

  if (item.primaryMuscles?.includes('abdominals')) aliases.add('abs');
  if (item.primaryMuscles?.includes('quadriceps')) aliases.add('quads');
  if (item.primaryMuscles?.includes('shoulders')) aliases.add('delts');
  if (name.includes('barbell')) aliases.add('bb');
  if (name.includes('dumbbell')) aliases.add('db');
  if (name.includes('e-z curl')) aliases.add('ez bar');

  return [...aliases];
}

async function run() {
  console.log('[seed] fetching exercise catalog...');
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error(`Failed to download catalog: HTTP ${res.status}`);
  const items = await res.json();
  console.log(`[seed] downloaded ${items.length} exercises`);

  await connectDB();

  const ops = items.map((item) => {
    const doc = {
      name: item.name,
      searchName: item.name.toLowerCase().trim(),
      aliases: buildAliases(item),
      primaryMuscles: item.primaryMuscles || [],
      secondaryMuscles: item.secondaryMuscles || [],
      equipment: item.equipment || 'other',
      category: item.category || 'strength',
      force: item.force || null,
      mechanic: item.mechanic || null,
      level: item.level || 'intermediate',
      instructions: item.instructions || [],
      images: (item.images || []).map((p) => IMAGE_BASE + p),
      owner: null,
      isCustom: false,
      externalId: item.id,
      source: 'free-exercise-db',
    };

    return {
      updateOne: {
        filter: { externalId: item.id, owner: null },
        update: { $set: doc },
        upsert: true,
      },
    };
  });

  console.log('[seed] writing to MongoDB...');
  let inserted = 0;
  let modified = 0;

  // Chunked so a slow Atlas link never blows the 16MB command limit.
  const CHUNK = 200;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const result = await Exercise.bulkWrite(ops.slice(i, i + CHUNK), { ordered: false });
    inserted += result.upsertedCount;
    modified += result.modifiedCount;
    process.stdout.write(`\r[seed] ${Math.min(i + CHUNK, ops.length)}/${ops.length}`);
  }

  const total = await Exercise.countDocuments({ owner: null });
  console.log(`\n[seed] done - ${inserted} inserted, ${modified} updated, ${total} in catalog`);

  await disconnectDB();
}

run().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
