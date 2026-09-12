/**
 * Estimated energy cost of a workout.
 *
 * Reps and weight cannot be turned into calories directly: the mechanical work
 * of a set is tiny next to what the body actually spends. A hard set of ten
 * bench at 60 kg is about 2.5 kcal of physics and roughly ten times that in
 * reality, because the lowering, the stabilising and the elevated heart rate
 * between reps cost far more than the bar's travel.
 *
 * So time is the base and the logged numbers choose the intensity:
 *
 *     kcal/min = (MET - 1) x 3.5 x bodyweight_kg / 200
 *
 * The `- 1` makes it **net**: the calories the workout added, on top of what
 * would have been spent sitting still. Gross figures read 15-20% higher and
 * flatter the user into eating them back.
 */

/** Resting metabolic baseline, subtracted so the result is what was added. */
const RESTING_MET = 1;

/** Between sets: no longer working, but nowhere near rest. */
const MET_REST_SHORT = 2.5; // under a minute - barely recovered
const MET_REST_LONG = 2.0;

/** Mobility drills and light preparation. */
const MET_WARMUP = 3.0;

/** Where a working set starts before intensity is taken into account. */
const MET_SET_BASE = 4.5;

/** Nothing a person does with a barbell justifies more than this. */
const MET_SET_CAP = 8.0;

/** Cardio machines, by what the exercise is called. */
const CARDIO_METS = [
  [/jump rope|skipping/, 11.0],
  [/run|jog|sprint/, 8.5],
  [/stair|step mill/, 8.0],
  [/row/, 7.0],
  [/cycl|bicycl|bike|spin/, 7.0],
  [/swim/, 7.0],
  [/elliptical|cross trainer/, 5.0],
  [/walk/, 3.8],
];

const DEFAULT_CARDIO_MET = 6.0;

function cardioMet(name) {
  const lower = String(name || '').toLowerCase();
  for (const [pattern, met] of CARDIO_METS) {
    if (pattern.test(lower)) return met;
  }
  return DEFAULT_CARDIO_MET;
}

/**
 * How hard one working set was, as a MET.
 *
 * Four signals, all of them already logged. The load one is the strongest
 * because it is measured against this user's own best rather than a table:
 * 85% of *your* best is a different event from 85% of someone else's.
 */
export function setMet(set, { bestE1RM = null, mechanic = null } = {}) {
  let met = MET_SET_BASE;

  const weight = set.weight || 0;
  const reps = set.reps || 0;

  if (bestE1RM > 0 && weight > 0 && reps > 0) {
    // Epley, the same estimate the personal records use.
    const e1rm = weight * (1 + reps / 30);
    const intensity = e1rm / bestE1RM;

    if (intensity >= 0.85) met += 2.0;
    else if (intensity >= 0.7) met += 1.2;
    else if (intensity >= 0.55) met += 0.6;
  }

  // A squat recruits far more muscle than a curl for the same minute.
  if (mechanic === 'compound') met += 0.8;

  // Density: a short rest leaves the next set starting from further behind.
  const rest = set.restSec || 0;
  if (rest > 0 && rest < 60) met += 0.6;
  else if (rest > 0 && rest < 120) met += 0.3;

  // Longer sets sit higher metabolically than heavy triples.
  if (reps >= 12) met += 0.4;

  return Math.min(met, MET_SET_CAP);
}

/** Net kcal for one stretch of time at one intensity. */
function kcal(met, seconds, bodyWeightKg) {
  if (!(seconds > 0) || !(bodyWeightKg > 0)) return 0;
  const minutes = seconds / 60;
  return Math.max(0, (met - RESTING_MET) * 3.5 * bodyWeightKg * minutes) / 200;
}

/**
 * The whole session, broken down by what was being done.
 *
 * Returns null when there is no bodyweight to scale by - the estimate is
 * meaningless without it, and inventing an average would be a number the user
 * has no way to tell is wrong.
 *
 * @param {object}  session            a workout with its entries and sets
 * @param {number}  bodyWeightKg       most recently recorded
 * @param {Map}     bestE1RMByExercise exerciseId -> best estimated 1RM
 * @param {Map}     mechanicByExercise exerciseId -> 'compound' | 'isolation'
 */
export function estimateSessionCalories(
  session,
  { bodyWeightKg, bestE1RMByExercise = new Map(), mechanicByExercise = new Map() } = {}
) {
  if (!(bodyWeightKg > 0)) return null;

  let workKcal = 0;
  let restKcal = 0;
  let cardioKcal = 0;
  let workSec = 0;
  let restSec = 0;
  let cardioSec = 0;

  for (const entry of session.entries || []) {
    // The warm-up block is timed as a whole, not set by set.
    if (entry.kind === 'warmup') continue;

    const id = String(entry.exercise);
    const isCardio = entry.kind === 'cardio';

    for (const set of entry.sets || []) {
      if (!set.completed) continue;

      const duration = set.durationSec || 0;
      const rest = set.restSec || 0;

      if (isCardio) {
        cardioKcal += kcal(cardioMet(entry.exerciseName), duration, bodyWeightKg);
        cardioSec += duration;
      } else {
        const met = setMet(set, {
          bestE1RM: bestE1RMByExercise.get(id) ?? null,
          mechanic: mechanicByExercise.get(id) ?? null,
        });
        workKcal += kcal(met, duration, bodyWeightKg);
        workSec += duration;
      }

      restKcal += kcal(rest < 60 ? MET_REST_SHORT : MET_REST_LONG, rest, bodyWeightKg);
      restSec += rest;
    }
  }

  const warmupSec = session.warmupSec || 0;
  const warmupKcal = kcal(MET_WARMUP, warmupSec, bodyWeightKg);

  const total = workKcal + restKcal + cardioKcal + warmupKcal;
  const round = (n) => Math.round(n * 10) / 10;

  return {
    estimatedKcal: Math.round(total),
    workKcal: round(workKcal),
    restKcal: round(restKcal),
    cardioKcal: round(cardioKcal),
    warmupKcal: round(warmupKcal),
    countedSec: workSec + restSec + cardioSec + warmupSec,
    bodyWeightKg,
    computedAt: new Date(),
  };
}
