# Supabase Setup

## Authentication

Enable email/password login:

1. Supabase Dashboard
2. Authentication
3. Providers
4. Enable Email

## Supabase Key Names

This app keeps simple environment variable names:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Use the keys shown in your Supabase dashboard like this:

- If Supabase shows a **publishable key**, put it in `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- If Supabase shows a legacy **anon key**, put it in `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- If Supabase shows a **secret key**, put it in `SUPABASE_SERVICE_ROLE_KEY`.
- If Supabase shows a legacy **service_role key**, put it in `SUPABASE_SERVICE_ROLE_KEY`.

Never expose the secret/service_role key in frontend/browser code.

For a beginner-friendly walkthrough, read `SUPABASE_KEYS_GUIDE.md`.

## Database

Run all migrations in this order:

```text
supabase/migrations/001_phase_1_mvp.sql
supabase/migrations/002_security_scope_fixes.sql
supabase/migrations/003_authorized_devices.sql
supabase/migrations/004_attendance_rpc_signature_fix.sql
supabase/migrations/005_attendance_read_policy_fix.sql
supabase/migrations/006_daily_reports_rls_and_hours_fix.sql
supabase/migrations/007_daily_report_review_fields.sql
```

It creates:

- `profiles`
- `departments`
- `attendance`
- `leave_requests`
- `tasks`
- `task_updates`
- `daily_reports`
- `audit_logs`
- `authorized_devices`

It also creates default departments:

- Administration
- Teaching
- Examination
- Accounts
- IT
- Admission
- Dispatch
- Other

## Security

Row Level Security is enabled.

Rules:

- Employees can see their own data.
- Admin and super admin can see all data.
- Supervisors can see assigned employees where possible.
- Employee task status changes happen through a database RPC function.
- Secret/service_role key is only used server-side for admin user creation and seed.

## First Admin

After migrations and `.env.local` are ready:

```powershell
npm run seed
```

This creates a Supabase Auth user and matching `profiles` record with role `super_admin`.
