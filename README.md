# Web3Bridge Proctored Exam Platform

Timed, monitored in-class exam for Web3Bridge assessments, with an instructor dashboard for live monitoring, grading, and results.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Prisma + SQLite (swap `DATABASE_URL` for PostgreSQL in production)
- httpOnly signed session cookies (`jose`)
- Server-Sent Events for the admin live monitor
- `zod` validation, in-memory rate limits on student endpoints

## Setup

```bash
cp .env.example .env
# edit ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_SECRET, DATABASE_URL

npm install
npm run db:push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (students) and [http://localhost:3000/admin/login](http://localhost:3000/admin/login) (instructor).

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Prisma connection string (`file:./dev.db` for SQLite) |
| `ADMIN_EMAIL` | Instructor login email |
| `ADMIN_PASSWORD` | Instructor login password |
| `SESSION_SECRET` | HMAC secret for session cookies (min 16 chars) |

## Importing questions

The bank lives in `web3_exam_questions.json`. Seeding:

```bash
npm run db:seed
```

Admins can also paste JSON on **Admin → Question bank** (preview, then import). Points for `mcq`/`multi` come from `meta.pointsByDifficulty`; `open` questions use their own `points`.

**Critical:** `answer`, `explanation`, and `rubric` are never sent to student clients. Grading is server-side only.

## Exam day checklist

1. Seed / verify the question bank.
2. Create an exam in Admin; note the access code.
3. Set status to **OPEN** so students can enter the lobby.
4. When ready, set status to **RUNNING** (“Start for everyone”).
5. Watch **Live monitor** for progress, strikes, and disconnects.
6. After submissions, grade open-ended answers, then **Release results** and export CSV.

Each student gets a random question order and (by default) shuffled options. Their timer starts when they click **Start exam** (deadline = start + duration). The server clock is authoritative.

## Anti-cheat notes

The client logs tab switches, focus loss, fullscreen exit, clipboard use, shortcuts, and rough DevTools heuristics. Strikes are counted **server-side**. Browsers cannot fully prevent cheating (e.g. a second device), so run this on supervised lab machines.

For a stricter lockdown, use [Safe Exam Browser](https://safeexambrowser.org/) (or equivalent) to lock down the workstation.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `start` | Production build & serve |
| `npm run db:push` | Apply Prisma schema |
| `npm run db:seed` | Import `web3_exam_questions.json` |
| `npm run db:reset` | Wipe DB and re-seed |
