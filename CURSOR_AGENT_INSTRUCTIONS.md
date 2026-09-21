# Task: Build a Proctored, Timed Exam Platform (Web3Bridge Assessment)

You are building a web app that delivers a timed, in-class, monitored exam to students, plus an instructor dashboard. The question bank is in `web3_exam_questions.json` (100 questions: `mcq`, `multi`, `open`). Read that file first, especially `meta`.

## 1. Tech stack
- Next.js 14+ (App Router), TypeScript, Tailwind CSS
- Prisma + PostgreSQL (SQLite is fine for local dev)
- Server-side sessions (httpOnly cookie). No third-party auth needed.
- Server-Sent Events or WebSocket (or 5s polling as fallback) for live admin monitoring
- `zod` for validation

## 2. Critical security rule
**Never send `answer`, `explanation` or `rubric` to a student's browser.** Strip them server-side. All grading happens on the server. Verify in the network tab that student API responses do not contain these fields.

## 3. Roles
**Student**: logs in with full name + email + a per-exam access code given by the instructor. One active session per student (a new login invalidates the old one and logs a violation).

**Admin (instructor)**: logs in with email/password from env vars (`ADMIN_EMAIL`, `ADMIN_PASSWORD`). Protected `/admin` routes.

## 4. Data model (Prisma)
- `Exam`: id, title, durationMinutes, accessCode, status (`DRAFT|OPEN|RUNNING|CLOSED`), config (JSON: questions per section, shuffle flags, maxViolations), createdAt
- `Question`: id (e.g. "f01"), section, difficulty, type, text, code?, options (JSON), answer (JSON), explanation, rubric (JSON), points
- `Attempt`: id, examId, studentName, studentEmail, questionIds (JSON, ordered), optionOrder (JSON map for shuffled options), startedAt, deadlineAt, submittedAt, status (`IN_PROGRESS|SUBMITTED|AUTO_SUBMITTED`), autoScore, manualScore, totalScore
- `Answer`: attemptId, questionId, value (JSON), updatedAt, manualScore?, manualFeedback?
- `ViolationEvent`: id, attemptId, type, detail, createdAt

Seed the DB by importing `web3_exam_questions.json` (an admin "Import questions" button plus a `prisma/seed.ts` script). Points: `mcq`/`multi` use `meta.pointsByDifficulty`; `open` uses its own `points`.

## 4a. Exam configuration
Admin can create an exam and choose:
- Duration in minutes (default 90)
- Access code (auto-generate a 6-character code)
- How many questions per section to draw (default: all 100). Each student gets a **random selection and order** to reduce copying between neighbours. Persist it in `Attempt.questionIds`.
- Shuffle answer options per student (persist in `optionOrder` and map back when grading)
- Max violations before auto-submit (default 3)

## 5. Student flow
1. `/` login page: name, email, access code.
2. `/exam/lobby`: rules page listing all monitoring behaviour (be transparent), and a "Waiting for instructor" state until the admin sets the exam to `RUNNING`. Show a "Start exam" button that requests fullscreen and starts the attempt.
3. `/exam/take`: 
   - One question at a time, with a question navigator (answered / unanswered / flagged for review).
   - Sticky countdown timer. **The server is the source of truth**: `deadlineAt = startedAt + duration`. The client syncs with the server time on load and every 30s. The timer must survive refresh.
   - Autosave each answer via debounce (~1s) to `PUT /api/attempt/answer`. Show a "Saved" indicator. Reject writes after `deadlineAt` or once submitted.
   - Code blocks rendered in a monospace, non-selectable block with syntax highlighting (`shiki` or `prism`).
   - `open` questions use a textarea (no rich paste).
   - Submit button with a confirm dialog. On timer expiry, auto-submit.
4. `/exam/done`: "Submitted" screen. Do NOT show the score or answers unless the admin enables release.

## 6. Anti-cheating and monitoring (client + server)
Implement all of these, and log every event to `ViolationEvent` with a timestamp:

| Check | How | Action |
|---|---|---|
| Tab switch / window hidden | `document.visibilitychange` (hidden) | Log `TAB_HIDDEN`, show blocking warning modal, count a strike |
| Window loses focus | `window.blur` | Log `WINDOW_BLUR`, count a strike (debounce so tab-hide + blur count once) |
| Leaves fullscreen | `fullscreenchange` | Log `FULLSCREEN_EXIT`, block the exam UI with an overlay until fullscreen is restored, count a strike |
| Copy / cut / paste | `copy`, `cut`, `paste` events | `preventDefault()`, log `CLIPBOARD` (no strike on first, warn) |
| Right-click / text selection on questions | `contextmenu`, CSS `user-select: none` on question and code areas | Prevent, log |
| Shortcuts | keydown for `F12`, `Ctrl/Cmd+C/V/X/P/S/U/A`, `Ctrl+Shift+I/J/C`, `PrintScreen` | Prevent, log `SHORTCUT` |
| DevTools (heuristic) | window inner/outer size delta, plus a `debugger` timing check every few seconds | Log `DEVTOOLS_SUSPECTED` |
| Multiple sessions | Server tracks the active session token | Old session is kicked; log `DUPLICATE_SESSION` |
| Heartbeat | Client pings `POST /api/attempt/heartbeat` every 10s | If no heartbeat for 60s, log `OFFLINE`; flag the student as disconnected on the admin dashboard |
| Page unload | `beforeunload` | Show a prompt; log `RELOAD_OR_CLOSE` |

**Strike policy:** each strike shows a full-screen warning ("Strike X of N. Return to the exam"). At `maxViolations` strikes the attempt is **auto-submitted** and marked `AUTO_SUBMITTED`. Strikes are counted **server-side** (the client only reports events), so they cannot be reset by clearing the browser state.

Add a short comment in the code noting that browsers cannot fully prevent cheating (for example a phone or a second device), so the exam is meant to run on lab machines under physical supervision. Also add a README note recommending Safe Exam Browser for a stricter lockdown.

## 7. Grading
- `mcq`: full points if the selected option (after un-shuffling) matches `answer`.
- `multi`: full points only if the selected set exactly equals `answer` (no partial credit).
- `open`: `manualScore` set by the instructor in the admin UI (0 to `points`), using the rubric.
- `autoScore` is computed server-side on submit. `totalScore = autoScore + manualScore`.

## 8. Admin dashboard (`/admin`)
- **Exams**: create, edit config, open/start/stop/close an exam. "Start for everyone" sets `RUNNING` and computes each student's deadline from when they click Start.
- **Live monitor**: table of students with status (waiting, in progress, offline, submitted), progress (answered / total), time remaining, strike count, and last violation. Click a student to see a full violation timeline. Buttons: "Add time to student", "Force submit", "Reset attempt" (with confirm).
- **Grading page**: for each student, list `open` answers next to the rubric with a score input and feedback field. Filter to "ungraded".
- **Results**: sortable table with auto score, manual score, total, %, strikes. Export CSV. A toggle to release results and explanations to students.
- **Question bank**: list, search, filter by section/difficulty. Import JSON and preview before saving.

## 9. API surface (suggested)
- `POST /api/auth/student` and `POST /api/auth/admin`
- `GET /api/exam/status`
- `POST /api/attempt/start`
- `GET /api/attempt/questions` (sanitized: no answers)
- `PUT /api/attempt/answer`
- `POST /api/attempt/event` (violation)
- `POST /api/attempt/heartbeat`
- `POST /api/attempt/submit`
- `GET /api/admin/live` (SSE) and the usual admin CRUD routes
Validate every input with zod. Rate-limit the student endpoints. Reject any request after `deadlineAt` or submission.

## 10. UX and quality bar
- Clean, minimal, high-contrast UI, usable on 1366x768 lab screens. Light and dark mode are optional.
- Accessible: keyboard navigation for options, visible focus states, ARIA labels.
- Handle network loss gracefully: queue autosaves and retry; show an "offline, reconnecting" banner.
- Server-authoritative timing everywhere.
- Add a `README.md` covering setup, env vars (`DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET`), how to import questions, and how to run an exam day.

## 11. Suggested build order
1. Prisma schema + seed from JSON
2. Admin auth + exam creation + question import
3. Student login + lobby + attempt creation (random selection, option shuffle)
4. Exam UI: navigation, timer, autosave, sanitized question endpoint
5. Grading engine + submit / auto-submit
6. Anti-cheat client hooks + violation logging + strike policy
7. Admin live monitor (SSE) + student violation timeline
8. Manual grading UI + results + CSV export
9. Polish, tests, README

## 12. Acceptance tests (verify before finishing)
- [ ] The student network responses contain no `answer`, `explanation` or `rubric`.
- [ ] Refreshing mid-exam keeps the timer accurate and all answers intact.
- [ ] Switching tabs shows a warning and increments the server-side strike count; reaching max strikes auto-submits.
- [ ] Exiting fullscreen blocks the exam until it is restored.
- [ ] Copy/paste/right-click/F12 are blocked and logged.
- [ ] Two different students receive different question orders and option orders, and both grade correctly.
- [ ] Logging in twice as the same student kicks the first session.
- [ ] Submitting after the deadline is rejected by the server.
- [ ] `multi` grading is exact-match; `open` questions show as ungraded until scored.
- [ ] The CSV export matches the on-screen results.

Ask me before making any major change to the data model or scoring rules. Otherwise proceed step by step and commit after each milestone.
