# BIE Staff Manager

Simple cloud-based staff management web app for Board of Islamic Education.

Phase 1 includes only:

- Supabase email/password login
- Role-based routing
- Employee accounts
- Attendance check in/check out
- Leave requests and approval
- Task assignment and progress tracking
- Daily work reports
- Admin dashboard and monitoring
- English/Urdu language toggle with RTL support
- PWA manifest and service worker

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- Supabase Auth
- Supabase PostgreSQL
- Supabase Row Level Security
- Vercel deployment
- PWA support

## Quick Start

```powershell
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

For full beginner setup, read:

- `SETUP_WINDOWS.md`
- `SUPABASE_SETUP.md`
- `SUPABASE_KEYS_GUIDE.md`
- `DEPLOYMENT.md`
- `TESTING.md`
- `PROJECT_STRUCTURE.md`

## Database Migration Order

Run Supabase SQL migrations in this order:

```text
supabase/migrations/001_phase_1_mvp.sql
supabase/migrations/002_security_scope_fixes.sql
supabase/migrations/003_authorized_devices.sql
supabase/migrations/004_attendance_rpc_signature_fix.sql
supabase/migrations/005_attendance_read_policy_fix.sql
supabase/migrations/006_daily_reports_rls_and_hours_fix.sql
supabase/migrations/007_daily_report_review_fields.sql
```

## Required Environment Variables

Copy `.env.example` to `.env.local` and fill:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SEED_ADMIN_EMAIL=
SEED_ADMIN_PASSWORD=
SEED_ADMIN_NAME=
```

Supabase may show either newer or legacy key names:

- Put the browser/client **publishable key** or legacy **anon key** in `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Put the server/admin **secret key** or legacy **service_role key** in `SUPABASE_SERVICE_ROLE_KEY`.

Never put the secret/service role key in browser code.

## Scripts

```powershell
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run seed
```

## Create First Super Admin

After running all SQL migrations in Supabase and filling `.env.local`:

```powershell
npm run seed
```

Then login at `/login` with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.
