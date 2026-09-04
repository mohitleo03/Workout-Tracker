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
api/
└── server.js            Vercel serverless entry (connect, then hand to Express)
vercel.json              catch-all rewrite + function settings
src/
├── server.js            local boot + graceful shutdown
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

## Deploying to Vercel

The repo is deployment-ready: `api/server.js` is the serverless entry, `vercel.json`
rewrites every path to it, and `src/server.js` stays as the local equivalent.

### 1. Open Atlas to Vercel — do this first

Vercel functions get **dynamic outbound IPs**, so an allowlist of your home IP will
reject them and every request will return 503.

> Atlas → **Network Access** → **Add IP Address** → **Allow access from anywhere**
> (`0.0.0.0/0`) → Confirm.

That is the standard setup for serverless, and it is why a strong database password
matters — see *Security notes*.

### 2. Set environment variables

Vercel does not read `.env` (it is in `.vercelignore`). Add these under
**Project Settings → Environment Variables**, for Production *and* Preview:

| Variable | Value |
|---|---|
| `MONGODB_URI` | your Atlas SRV string |
| `JWT_ACCESS_SECRET` | a long random string — **not** the placeholder in `.env` |
| `JWT_REFRESH_SECRET` | a different long random string |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | `*`, or your web origin once you have one |
| `API_PREFIX` | `/api/v1` (optional; this is the default) |

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

**Do not set `PORT`, `HOST` or `DNS_SERVERS`.** Vercel manages the first two, and
`DNS_SERVERS` exists only to work around a local resolver that refuses SRV lookups —
Vercel's resolver handles them correctly, so setting it there only adds latency and
a failure mode.

### 3. Deploy

```bash
# Git integration (recommended): push, then "Add New Project" on vercel.com
git init && git add . && git commit -m "Workout Tracker API"
git remote add origin <your-repo-url> && git push -u origin main

# or straight from this folder
npx vercel --prod
```

Leave the build settings empty — there is no build step, and `vercel.json` already
declares the function.

### 4. Check it

```bash
curl https://<your-project>.vercel.app/                     # {"basePath":"/api/v1",...}
curl https://<your-project>.vercel.app/api/v1/health        # {"success":true,...}
```

### 5. Point the app at it

In `Workout-Tracker-Mobile-App/.env`:

```ini
API_BASE_URL=https://<your-project>.vercel.app/api/v1
```

Full restart of the app. Since this is HTTPS, the cleartext-HTTP exemptions that only
apply to debug builds stop mattering — release builds work against it as-is.

### Seeding a deployed database

Vercel gives you no shell, so run the seeds **locally against the same Atlas cluster**:

```bash
npm run seed     # writes to whatever MONGODB_URI in .env points at
```

The catalogue lives in the database, not the deployment, so this is a one-off.

### What behaves differently on serverless

- **Cold starts.** The first request after idling pays the Mongo handshake —
  roughly 3-4s measured locally, then ~3ms while warm. The connection is cached on
  `globalThis`, so a warm container reuses the open socket rather than re-dialling.
- **Rate limiting is per-instance.** `express-rate-limit` keeps counters in memory,
  so the 30-attempts-per-15-minutes login limit applies per function instance, not
  globally. Fine as a speed bump; move to a shared store if you need a real limit.
- **`autoIndex` is off in production** (indexes come from the seed run), so cold
  starts do not spend time reconciling indexes.
- **No background work.** Anything long-running would need Vercel Cron or a queue;
  the API has none today.
- **`maxDuration` is 30s** in `vercel.json`, comfortably above a cold start.

## Security notes

- `.env` is gitignored and `.vercelignore`d, but it currently contains a real database
  password in plain text. **Rotate it before this repo goes anywhere**, and replace the
  placeholder JWT secrets — anyone holding `JWT_ACCESS_SECRET` can mint valid tokens
  for any user.
- Opening Atlas to `0.0.0.0/0` (required for Vercel) means the database password is the
  only thing standing between the internet and your data. Make it long and unique.
- `helmet`, `compression` and a JSON body limit of 2 MB are enabled; `trust proxy` is
  set to 1 so client IPs are read correctly behind Vercel's proxy.
- There is no email verification or password reset yet.
