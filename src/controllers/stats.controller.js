import mongoose from 'mongoose';
import { WorkoutSession } from '../models/WorkoutSession.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { dayStart } from '../utils/date.js';

/** Epley estimate, so a heavy triple and a light set of 12 stay comparable. */
const estimate1RM = (weight, reps) =>
  weight > 0 && reps > 0 ? Math.round(weight * (1 + reps / 30) * 10) / 10 : 0;

function rangeFrom(days) {
  const to = dayStart(new Date());
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (Math.min(Number(days) || 30, 365) - 1));
  return { from, to };
}

/** Headline numbers for the home screen. */
export const getOverview = asyncHandler(async (req, res) => {
  const owner = new mongoose.Types.ObjectId(req.userId);
  const { from } = rangeFrom(req.query.days || 30);

  const weekStart = dayStart(new Date());
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());

  const [totals, thisWeek, streakDocs] = await Promise.all([
    WorkoutSession.aggregate([
      { $match: { owner, status: 'completed', date: { $gte: from } } },
      {
        $group: {
          _id: null,
          workouts: { $sum: 1 },
          volume: { $sum: '$totalVolume' },
          sets: { $sum: '$totalSets' },
          reps: { $sum: '$totalReps' },
          durationSec: { $sum: '$totalDurationSec' },
        },
      },
    ]),
    WorkoutSession.countDocuments({ owner, status: 'completed', date: { $gte: weekStart } }),
    WorkoutSession.find({ owner, status: 'completed' })
      .sort({ date: -1 })
      .limit(120)
      .select('date')
      .lean(),
  ]);

  // Consecutive calendar days with a completed workout, allowing today to be empty.
  const dayKeys = new Set(streakDocs.map((d) => d.date.toISOString().slice(0, 10)));
  let streak = 0;
  const cursor = dayStart(new Date());
  if (!dayKeys.has(cursor.toISOString().slice(0, 10))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (dayKeys.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  const t = totals[0] || {};
  res.json({
    success: true,
    data: {
      rangeDays: Math.min(Number(req.query.days) || 30, 365),
      workouts: t.workouts || 0,
      totalVolume: Math.round((t.volume || 0) * 10) / 10,
      totalSets: t.sets || 0,
      totalReps: t.reps || 0,
      totalDurationSec: t.durationSec || 0,
      workoutsThisWeek: thisWeek,
      currentStreakDays: streak,
    },
  });
});

/** Volume, sets and duration per day, for the bar chart. */
export const getVolumeTrend = asyncHandler(async (req, res) => {
  const owner = new mongoose.Types.ObjectId(req.userId);
  const { from, to } = rangeFrom(req.query.days || 30);

  const rows = await WorkoutSession.aggregate([
    { $match: { owner, status: 'completed', date: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        volume: { $sum: '$totalVolume' },
        sets: { $sum: '$totalSets' },
        reps: { $sum: '$totalReps' },
        durationSec: { $sum: '$totalDurationSec' },
        workouts: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, dayKey: '$_id', volume: 1, sets: 1, reps: 1, durationSec: 1, workouts: 1 } },
  ]);

  res.json({ success: true, data: rows });
});

/** How training volume splits across muscle groups. */
export const getMuscleSplit = asyncHandler(async (req, res) => {
  const owner = new mongoose.Types.ObjectId(req.userId);
  const { from, to } = rangeFrom(req.query.days || 30);

  const rows = await WorkoutSession.aggregate([
    { $match: { owner, status: 'completed', date: { $gte: from, $lte: to } } },
    { $unwind: '$entries' },
    {
      $lookup: {
        from: 'exercises',
        localField: 'entries.exercise',
        foreignField: '_id',
        as: 'ex',
      },
    },
    { $unwind: '$ex' },
    { $unwind: '$ex.primaryMuscles' },
    { $unwind: '$entries.sets' },
    // Warm-up work is excluded here as it is from volume and PRs: a block of
    // arm circles should not read as shoulder training in the split.
    { $match: { 'entries.sets.completed': true, 'entries.sets.isWarmup': false } },
    {
      $group: {
        _id: '$ex.primaryMuscles',
        sets: { $sum: 1 },
        volume: {
          $sum: { $multiply: ['$entries.sets.weight', '$entries.sets.reps'] },
        },
      },
    },
    { $sort: { volume: -1 } },
    { $project: { _id: 0, muscle: '$_id', sets: 1, volume: { $round: ['$volume', 1] } } },
  ]);

  res.json({ success: true, data: rows });
});

/**
 * Per-session history for one exercise: top weight, best estimated 1RM,
 * total volume and the raw sets. This is the progression chart.
 */
export const getExerciseProgress = asyncHandler(async (req, res) => {
  const exerciseId = new mongoose.Types.ObjectId(req.params.exerciseId);
  const limit = Math.min(Number(req.query.limit) || 30, 200);

  const sessions = await WorkoutSession.find({
    owner: req.userId,
    status: 'completed',
    'entries.exercise': exerciseId,
  })
    .sort({ date: -1 })
    .limit(limit)
    .select('date entries')
    .lean();

  const points = sessions
    .map((s) => {
      const entry = s.entries.find((e) => String(e.exercise) === String(exerciseId));
      if (!entry) return null;

      const working = entry.sets.filter((set) => set.completed && !set.isWarmup);
      if (working.length === 0) return null;

      let topWeight = 0;
      let best1RM = 0;
      let volume = 0;
      let reps = 0;

      for (const set of working) {
        topWeight = Math.max(topWeight, set.weight || 0);
        best1RM = Math.max(best1RM, estimate1RM(set.weight, set.reps));
        volume += (set.weight || 0) * (set.reps || 0);
        reps += set.reps || 0;
        for (const d of set.drops || []) {
          volume += (d.weight || 0) * (d.reps || 0);
          reps += d.reps || 0;
        }
      }

      return {
        sessionId: s._id,
        date: s.date,
        dayKey: s.date.toISOString().slice(0, 10),
        topWeight,
        estimated1RM: best1RM,
        totalVolume: Math.round(volume * 10) / 10,
        totalReps: reps,
        setCount: working.length,
        sets: working.map((set) => ({
          setNumber: set.setNumber,
          weight: set.weight,
          reps: set.reps,
          unit: set.unit,
          setType: set.setType,
          drops: set.drops,
          durationSec: set.durationSec,
          restSec: set.restSec,
        })),
      };
    })
    .filter(Boolean)
    .reverse(); // oldest first, so the chart reads left to right

  res.json({ success: true, data: points });
});


/* ------------------------------ progress -------------------------------- */

/**
 * What makes two workouts comparable.
 *
 * Chest day against leg day says nothing, so sessions are only ever measured
 * against the last one that trained the same thing: the same plan day where
 * there is one, otherwise the same muscles, otherwise the same name.
 */
function comparisonKey(session) {
  if (session.planDayId) return `day:${session.planDayId}`;
  const muscles = [...(session.muscleGroups || [])].map((m) => m.toLowerCase()).sort();
  if (muscles.length > 0) return `mus:${muscles.join('+')}`;
  return `title:${(session.title || '').trim().toLowerCase()}`;
}

/** Working totals only - warm-ups are preparation, not progress. */
function workingTotals(session) {
  let volume = 0;
  let sets = 0;
  let reps = 0;
  let workSec = 0;
  let restSec = 0;

  for (const entry of session.entries || []) {
    if (entry.kind === 'warmup') continue;
    for (const set of entry.sets || []) {
      if (!set.completed || set.isWarmup) continue;
      sets += 1;
      reps += set.reps || 0;
      volume += (set.weight || 0) * (set.reps || 0);
      for (const d of set.drops || []) {
        volume += (d.weight || 0) * (d.reps || 0);
        reps += d.reps || 0;
      }
      workSec += set.durationSec || 0;
      restSec += set.restSec || 0;
    }
  }
  return { volume: Math.round(volume * 10) / 10, sets, reps, workSec, restSec };
}

/** Per-exercise working volume, so a session can be read lift by lift. */
function exerciseTotals(session) {
  const map = new Map();
  for (const entry of session.entries || []) {
    if (entry.kind === 'warmup') continue;
    const id = String(entry.exercise);
    const row = map.get(id) || { exercise: id, name: entry.exerciseName || '', volume: 0, sets: 0, reps: 0 };
    for (const set of entry.sets || []) {
      if (!set.completed || set.isWarmup) continue;
      row.sets += 1;
      row.reps += set.reps || 0;
      row.volume += (set.weight || 0) * (set.reps || 0);
      for (const d of set.drops || []) {
        row.volume += (d.weight || 0) * (d.reps || 0);
        row.reps += d.reps || 0;
      }
    }
    row.volume = Math.round(row.volume * 10) / 10;
    map.set(id, row);
  }
  return map;
}

/** Percent change, to one decimal. Null when there is nothing to compare to. */
function changePct(current, previous) {
  if (previous == null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/**
 * Progress against the last comparable workout.
 *
 * Two questions: is the work going up (volume), and is it taking less time to
 * do it (duration, and seconds per set so the comparison survives a session
 * with a different number of sets).
 */
export const getProgress = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 12, 40);

  // Enough history that recent sessions can each find their predecessor.
  const sessions = await WorkoutSession.find({ owner: req.userId, status: 'completed' })
    .sort({ date: -1, startedAt: -1 })
    .limit(80)
    .select('title date startedAt planDayId muscleGroups sequence totalDurationSec entries')
    .lean();

  const ordered = [...sessions].reverse(); // oldest first, so "previous" means it
  const docById = new Map(ordered.map((s) => [String(s._id), s]));

  const lastByKey = new Map();
  const comparisons = [];

  for (const session of ordered) {
    const key = comparisonKey(session);
    const totals = workingTotals(session);
    const durationSec = session.totalDurationSec || 0;
    const secPerSet = totals.sets > 0 ? Math.round(durationSec / totals.sets) : null;
    const previous = lastByKey.get(key) || null;

    comparisons.push({
      sessionId: session._id,
      previousSessionId: previous?.sessionId || null,
      title: session.title,
      date: session.date,
      startedAt: session.startedAt,
      ...totals,
      durationSec,
      secPerSet,
      previous,
      // Up is good.
      volumePct: previous ? changePct(totals.volume, previous.volume) : null,
      // Down is good: the same work finished sooner.
      durationPct: previous ? changePct(durationSec, previous.durationSec) : null,
      restPct: previous ? changePct(totals.restSec, previous.restSec) : null,
      secPerSetPct:
        previous && secPerSet != null && previous.secPerSet != null
          ? changePct(secPerSet, previous.secPerSet)
          : null,
      setsDelta: previous ? totals.sets - previous.sets : null,
    });

    lastByKey.set(key, {
      sessionId: session._id,
      date: session.date,
      ...totals,
      durationSec,
      secPerSet,
    });
  }

  const compared = comparisons.filter((c) => c.previous);
  const latest = compared.length > 0 ? compared[compared.length - 1] : null;

  if (latest) {
    // Lift by lift, but only for the pair actually on screen.
    const currentEx = exerciseTotals(docById.get(String(latest.sessionId)));
    const previousEx = exerciseTotals(docById.get(String(latest.previousSessionId)));

    latest.exercises = [...currentEx.values()]
      .map((row) => {
        const before = previousEx.get(row.exercise);
        return {
          ...row,
          previousVolume: before?.volume ?? null,
          previousSets: before?.sets ?? null,
          changePct: before ? changePct(row.volume, before.volume) : null,
        };
      })
      .sort((a, b) => b.volume - a.volume);
  }

  res.json({
    success: true,
    data: {
      latest,
      // Oldest first, so a chart reads left to right.
      history: compared.slice(-limit).map((c) => ({
        sessionId: c.sessionId,
        date: c.date,
        title: c.title,
        volume: c.volume,
        sets: c.sets,
        durationSec: c.durationSec,
        secPerSet: c.secPerSet,
        volumePct: c.volumePct,
        durationPct: c.durationPct,
      })),
      // How many of the recent comparable sessions moved the right way.
      improvingCount: compared.slice(-limit).filter((c) => (c.volumePct ?? 0) > 0).length,
      comparedCount: compared.slice(-limit).length,
    },
  });
});

/** Best ever weight / 1RM / volume per exercise. */
export const getPersonalRecords = asyncHandler(async (req, res) => {
  const owner = new mongoose.Types.ObjectId(req.userId);

  const rows = await WorkoutSession.aggregate([
    { $match: { owner, status: 'completed' } },
    { $unwind: '$entries' },
    { $unwind: '$entries.sets' },
    { $match: { 'entries.sets.completed': true, 'entries.sets.isWarmup': false } },
    {
      $addFields: {
        est1RM: {
          $multiply: [
            '$entries.sets.weight',
            { $add: [1, { $divide: ['$entries.sets.reps', 30] }] },
          ],
        },
      },
    },
    { $sort: { est1RM: -1 } },
    {
      $group: {
        _id: '$entries.exercise',
        exerciseName: { $first: '$entries.exerciseName' },
        bestWeight: { $max: '$entries.sets.weight' },
        bestReps: { $max: '$entries.sets.reps' },
        best1RM: { $max: '$est1RM' },
        prWeight: { $first: '$entries.sets.weight' },
        prReps: { $first: '$entries.sets.reps' },
        prDate: { $first: '$date' },
        totalSets: { $sum: 1 },
      },
    },
    {
      $lookup: { from: 'exercises', localField: '_id', foreignField: '_id', as: 'ex' },
    },
    { $unwind: { path: '$ex', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        exerciseId: '$_id',
        exerciseName: { $ifNull: ['$ex.name', '$exerciseName'] },
        images: '$ex.images',
        primaryMuscles: '$ex.primaryMuscles',
        bestWeight: 1,
        bestReps: 1,
        best1RM: { $round: ['$best1RM', 1] },
        prWeight: 1,
        prReps: 1,
        prDate: 1,
        totalSets: 1,
      },
    },
    { $sort: { best1RM: -1 } },
    { $limit: 100 },
  ]);

  // The best single session's worth of an exercise, alongside the best single
  // set. Volume answers "my heaviest day of chest press"; e1RM answers "my
  // strongest set" - they are different records and both are worth keeping.
  const volumeRows = await WorkoutSession.aggregate([
    { $match: { owner, status: 'completed' } },
    { $unwind: '$entries' },
    { $unwind: '$entries.sets' },
    { $match: { 'entries.sets.completed': true, 'entries.sets.isWarmup': false } },
    {
      $group: {
        _id: { exercise: '$entries.exercise', session: '$_id' },
        date: { $first: '$date' },
        volume: {
          $sum: { $multiply: ['$entries.sets.weight', '$entries.sets.reps'] },
        },
        sets: { $sum: 1 },
      },
    },
    { $sort: { volume: -1 } },
    {
      $group: {
        _id: '$_id.exercise',
        bestVolume: { $first: '$volume' },
        bestVolumeSets: { $first: '$sets' },
        bestVolumeDate: { $first: '$date' },
      },
    },
  ]);

  const volumeById = new Map(volumeRows.map((r) => [String(r._id), r]));

  res.json({
    success: true,
    data: rows.map((r) => {
      const v = volumeById.get(String(r.exerciseId));
      return {
        ...r,
        bestVolume: v ? Math.round(v.bestVolume * 10) / 10 : 0,
        bestVolumeSets: v?.bestVolumeSets ?? 0,
        bestVolumeDate: v?.bestVolumeDate ?? null,
      };
    }),
  });
});
