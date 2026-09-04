# Workout Tracker API

Express 4 + Mongoose 8, ES modules, JWT auth. Every collection is scoped by `owner`,
so the API is multi-user from the ground up.

```bash
npm install
npm run seed     # 876 exercises + 62 foods (idempotent)
npm run dev      # http://localhost:4000, restarts on change
npm start        # production
```

## Layout

```
src/
├── server.js            boot + graceful shutdown
├── app.js               middleware stack, mounts /api/v1
├── config/
│   ├── env.js           validated environment, fails fast on missing vars
│   └── db.js            Mongo connection, global lean-virtuals plugin, DNS override
├── models/              User, Exercise, Plan, WorkoutSession, Food,
│                        DietPlan, DietLog, Goal, BodyMetric
├── controllers/         one per resource, all wrapped in asyncHandler
├── routes/              thin: auth guard + zod validation + controller
├── middleware/          requireAuth, validate(schema), error handler
├── utils/               ApiError, jwt, date helpers
└── seed/                seedExercises.js, seedFoods.js, foods.data.js
```

## Environment

| Variable | Notes |
|---|---|
| `MONGODB_URI` | Atlas SRV string. **Required.** |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | **Required.** The values in `.env` are placeholders — replace them. |
| `JWT_ACCESS_EXPIRES` / `JWT_REFRESH_EXPIRES` | Default `7d` / `90d`. |
| `PORT` | Default `4000`. |
| `HOST` | Interface to bind. Default `0.0.0.0` so the emulator (`10.0.2.2`) and phones on the LAN can reach it; use `127.0.0.1` to restrict to this machine. |
| `API_PREFIX` | Where the API mounts. Default `/api/v1`. Accepts `api/v2` or `/api/v2/` and normalises it. **Change this and the mobile app's `API_BASE_URL` must match.** |
| `CORS_ORIGIN` | `*`, or a comma-separated list. |
| `DNS_SERVERS` | Optional, e.g. `8.8.8.8,1.1.1.1`. Only needed when the system resolver refuses the SRV lookups that `mongodb+srv://` requires. |

`GET /` reports the live `basePath` and `health` path, so you can always confirm what
the running server is actually serving.

`.env` is gitignored here (it holds the database password); `.env.example` is the
tracked template. This differs from the mobile app, whose `.env` is tracked — it is a
build asset and contains no secrets.

## Conventions

- Success: `{ "success": true, "data": ... }`, with `meta` added for paginated lists.
- Failure: `{ "success": false, "error": { "message": "...", "details": [...] } }`.
  Validation failures return 400 with a `details` array of `{ path, message }`.
- Request bodies and query strings are validated with zod before reaching a controller;
  a validated query lands on `req.validatedQuery`.
- Auth is `Authorization: Bearer <accessToken>`. On 401 the client posts its refresh
  token to `/auth/refresh` to get a new pair.
- Login and registration are rate limited to 30 attempts per 15 minutes per IP.

## Design decisions worth knowing

**Drop sets.** A set stores `drops: [{ weight, reps }]`. The `isDropSet` virtual is
`forceDropSet || drops.length >= 2` — a single weight reduction is treated as a
back-off unless the user explicitly flags it, exactly as specified.

**Roll-ups.** `WorkoutSession.recalculate()` runs in a `pre('save')` hook and keeps
`totalVolume`, `totalSets`, `totalReps`, `workDurationSec` and `restDurationSec` on the
document, so list and stats endpoints never walk the nested sets. Warm-up sets are
excluded from PR and progression queries but still count toward session totals.

**Session targets are snapshotted.** When a workout starts from a plan, each entry
copies the plan's `targetSets` / rep range / weight / rest. Editing the plan afterwards
does not rewrite what you were aiming for in past sessions.

**Diet macros are snapshotted** on the log item at log time, for the same reason.
`GET /diet/log` materialises the day's planned meals as unticked rows on first read.

**Timing.** `POST .../sets` stores each set's `durationSec`; the rest that follows is
written separately via `POST .../sets/:setId/rest` when the user starts the next set.
`POST /sessions/:id/finish` accepts a client `totalDurationSec` and applies it with a
direct `updateOne` after `save()`, so the pre-save hook cannot overwrite it.

**Goals.** `POST /goals/sync` reads the real best weight/reps out of completed sessions
(and the latest bodyweight) and records a checkpoint when it beats the stored value.
Progress direction is inferred from `startValue` vs `targetValue` when not given.

## Seeding

`npm run seed:exercises` downloads
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) (876 exercises, public
domain, no key) and upserts on the source id in chunks of 200. Images stay as CDN URLs
rather than being copied into the database. Re-run it any time.

`npm run seed:foods` upserts the starter food catalogue in `seed/foods.data.js` —
edit that file to add your own staples.

## Security notes

- `.env` is gitignored but currently contains a real database password in plain text.
  Rotate it before sharing this repository, and set real JWT secrets.
- `helmet`, `compression` and a JSON body limit of 2 MB are enabled.
- There is no email verification or password reset yet.
