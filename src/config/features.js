/**
 * The parts of the app a user can switch on or off in their profile.
 *
 * The server only stores the switches; what each one hides is the app's
 * business. Which are on by default lives in the app too, with one rule kept
 * here: accounts created before features could be switched keep all of them
 * on, and only new sign-ups start with the advanced ones off. That is what
 * `featureDefaults` on the account records - 'standard' for a new sign-up,
 * absent (everything on) for an account that already existed.
 */
export const FEATURE_KEYS = [
  // Basic: on by default.
  'diet',
  'goals',
  'bodyTracking',
  'setupNotes',
  'swapReorder',
  'missedDay',
  'smartFlow',
  'keepScreenOn',
  'workoutAlerts',
  'homeStats',
  'warmupBlock',
  'detailedTiming',
  // Advanced: off by default for new sign-ups.
  'supersets',
  'specialSetTypes',
  'repsInReserve',
  'progressiveOverload',
  'deloadDays',
  'secondWorkout',
];
