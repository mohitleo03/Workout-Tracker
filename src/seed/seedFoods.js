/** Seeds the shared food catalog. Safe to re-run - upserted on name + owner:null. */
import { connectDB, disconnectDB } from '../config/db.js';
import { Food } from '../models/Food.js';
import { FOODS } from './foods.data.js';

async function run() {
  await connectDB();

  const ops = FOODS.map((f) => {
    const searchName = f.name.toLowerCase().trim();
    return {
      updateOne: {
        filter: { searchName, owner: null },
        update: {
          $set: {
            ...f,
            searchName,
            brand: f.brand || '',
            sodium: f.sodium || 0,
            owner: null,
            isCustom: false,
          },
        },
        upsert: true,
      },
    };
  });

  const result = await Food.bulkWrite(ops, { ordered: false });
  const total = await Food.countDocuments({ owner: null });
  console.log(
    `[seed] foods - ${result.upsertedCount} inserted, ${result.modifiedCount} updated, ${total} in catalog`
  );

  await disconnectDB();
}

run().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
