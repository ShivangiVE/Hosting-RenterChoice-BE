# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — run with nodemon (`server.js`)
- `npm start` — run with node
- `npm run seed:admin` — create the Master Admin user (`scripts/createAdmin.js`) if none exists
- One-off maintenance/backfill scripts live in `scripts/` and are run directly, e.g. `node scripts/runServiceAgreementCycleSweepOnce.js`. They load `.env` and connect to Mongo themselves.

There is no test suite, linter, or build step. Node `>=24.22.2 <25` is required (see `engines`). The code is CommonJS (`require`/`module.exports`).

## Environment

Config comes from `.env` via `dotenv`. Key variables: `MONGO_URI`, `JWT_SECRET`, `PORT` (default 5000), `CORS_ORIGIN` (comma-separated; defaults to `http://localhost:5173`, used by both Express and Socket.IO), `EMAIL_USER`/`EMAIL_PASS` (nodemailer), `FIREBASE_SERVICE_ACCOUNT_BASE64` (push; optional, startup continues without it), `USE_S3` + `AWS_*` (otherwise files are stored under local `uploads/`, served statically at `/uploads`), `DOCUMENT_EXTRACTION_PROVIDER` (`local` = pdf-parse/tesseract, or `textract`), `PAYMENT_INFO_ENCRYPTION_KEY`, `OTP_HASH_SECRET`, `PORTFOLIO_NOTIFY_TOKEN_SECRET`, plus several frontend URL vars (`CLIENT_URL`, `FRONTEND_URL`, `WEB_APP_URL`, ...) used in email links.

## Architecture

Express 5 + Mongoose 8 + Socket.IO backend for a property-management platform (work orders, portfolios/buildings, accounts/invoicing, contacts/vendors, notes & documents, chat, notifications).

**Startup** (`server.js`): connect Mongo → init Socket.IO (`socket.js`) → init Firebase → start cron jobs → listen. `app.js` wires every router under `/api/...` and mounts `errorHandler` last.

**Layering:** `src/routes` → `src/controllers` → `src/services` / `src/domain` / `src/utils` → `src/models`. Routes are grouped by feature folder and apply `protect` (JWT) then `authorize(...roles)` from `src/middleware/authMiddleware.js`. Controllers are usually wrapped with `src/middleware/asyncHandler.js` so thrown errors reach `errorHandler`, which maps Mongo duplicate keys (409), validation errors, CastErrors, and `err.statusCode`/`err.errorCode` into a uniform response. Responses use `sendSuccess`/`sendError` from `src/utils/response.js` (`{ status, message, data }` / `{ status: false, message, code }`).

**Roles & access** (`src/constants/roles.js`, `src/constants/permissions.js`): a single `User` model holds all users, distinguished by `role`. Internal roles: `Admin` (Master Admin), Brokerage roles (`BrokerageAdmin`, `BrokerageAccounts`, `BrokerageUser`), `OfficeAdmin` (Team Admin), and team roles (`RepairsTeam`, `AccountsTeam`, `InternalTeam`, ...). External roles: `Vendor`, `Owner`, `Tenant`. Use the exported role arrays (e.g. `WORK_ORDER_ROLES`, `ACCOUNTS_ROLES`) in `authorize()` rather than hard-coding lists. Brokerage/Team hierarchy lives in `Team.js`; scoping helpers are in `src/utils` (`companyScope`, `buildCompanyScopeFilter`, `resolveTeamUserIds`, `portfolioAccess/`).

**Auth/sessions:** JWTs carry `platform` (`web`, `impersonate`, ...) and `portal` (`internal`/`external`). Web tokens enforce single-login via `internalWebSessionVersion` / `externalWebSessionVersion` on the user — bumping the version invalidates existing sessions. "Login As" impersonation tokens stay valid only while the impersonator is active and on the same session version. The same checks are duplicated in the Socket.IO handshake in `socket.js`; keep both in sync when changing auth.

**Real-time** (`socket.js`): users join `user:<id>`, `conversation:<id>`, and `workorder:<id>` rooms. Use `require("./socket").getIO()` from controllers/services to emit. Chat sending is gated by `src/domain/chatPolicy.js` (e.g. tenant chat closes after work order closure).

**Background jobs:** processors in `src/processors/*` self-register via `registerJob({ name, cronExpression, task })` (`src/jobs/registry.js`); `src/jobs/reminder.job.js` requires them and schedules all with node-cron. To add a job, create a processor that calls `registerJob` and add its `require` to `reminder.job.js`. `invoiceDraftCleanup.job.js` is started separately.

**Notifications:** notification types/events/categories are defined per domain in `src/constants/notifications/*.js` and merged by `registry.js`. `services/notificationService.createNotification` is the entry point; delivery fans out to in-app (socket), email, push (Firebase), and digest queues according to `NotificationPreference`. Reminders (`NotificationReminderSchedule`) are driven by the registries in `src/registries/` (cycle, resolver = "still pending?", escalation); broadcast alert rules live in `src/registries/rules/`.

**Work orders:** statuses are dynamic (`WODynamicStatus` collection, looked up by name) rather than an enum; state transitions/appointment rules live in `src/domain/`. Invoices can be extracted from uploaded PDFs/images via `services/documentExtraction` (pluggable provider) and `services/invoiceExtraction`.

**Files:** multer upload middlewares are in `src/middleware/*Upload.js`; validate file signatures with `utils/fileSignatureValidator.js`, and store via `utils/storageService.js` (local vs S3 toggle). Sensitive vendor bank/payment fields are encrypted with `utils/fieldEncryption.js`.

## Repo notes

- Commented-out blocks marked "Development" vs "Production" (CORS, socket origin, static uploads) are intentional toggles; the active code is the production config.
- `eng.traineddata` at the root is Tesseract OCR language data cached by tesseract.js for the local extraction provider.
- `uploads/` and `backups/` are git-ignored runtime data.
## Rules for changing code (always follow)

### Safety
- Make minimal, targeted edits (Find/Replace style). Never rewrite whole files unless asked.
- Never change existing behaviour, response shapes or route paths unless explicitly asked. If a change could affect other callers (web, mobile app), say so first.
- Show a plan first for anything touching more than one file.
- Never read, print or edit `.env` / `.env.*`, and never run commands that reference them.
- Never run scripts in `scripts/`, migrations, `git commit/push/checkout/reset`, or any delete on the database without asking. Never use `deleteMany({})`.
- Never log secrets, tokens or full bank account numbers (only last 4).

### Conventions
- Add new role lists only in `src/constants/roles.js` (e.g. `LPM_ELIGIBLE_ROLES`, `PAYMENT_INFO_REVIEWER_ROLES`).
- New notification types: add them in `src/constants/notifications/<feature>.js` and register through `registry.js`.
- Reuse shared helpers before writing new ones:
  - `controllers/workOrder/workOrderQueryBuilder.js` → `buildWorkOrderFilter`, `buildServiceAgreementFilter`, `buildOpenWorkOrderMatch` (the one "open work order" rule for all cards).
  - `utils/teamUserProfile.js` (edit team user name/LPM), `utils/lpm.js` (`setLpmStatus`), `utils/toggleUserStatus.js`, `utils/resolveCompanyVendorIds.js`.
- Validate ids with `mongoose.isValidObjectId` → 400. Records outside the caller's scope → 404 (don't reveal they exist).
- Enforce business rules atomically (`findOneAndUpdate` with a filter that includes the rule) instead of read-then-save for status changes.
- Audit important changes with `AuditService.logActivity(...)`; an audit failure must never fail the request (`.catch(...)`).
- Dashboard/card counts: `countDocuments` on indexed fields, independent queries in `Promise.all`.

### Known quirks (don't "fix" without asking)
- `controllers/externlusers` (typo) vs `routes/externalUsers`; folders with `&` (`notes&Documents`); two routers share `/api/submissions`.