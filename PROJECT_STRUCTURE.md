# Project Structure

```text
app/
  actions/              Server actions for CRUD and audit logging
  admin/                Admin and supervisor pages
  employee/             Employee pages
  auth/                 Supabase auth redirect/callback routes
  login/                Public login page
  forgot-password/      Public password reset page
components/
  auth/                 Login and forgot password forms
  layout/               App shell, sign out, language toggle, PWA register
  ui/                   Shared UI blocks
lib/
  supabase/             Browser, server, and admin Supabase clients
  auth.ts               Role guards and profile loading
  i18n.ts               English/Urdu support
  types.ts              App TypeScript types
  utils.ts              Dates, role helpers, badge classes
locales/
  en.json               English labels
  ur.json               Urdu labels
public/
  manifest.webmanifest  PWA manifest
  sw.js                 Basic service worker
scripts/
  seed-super-admin.ts   Creates first super admin
supabase/
  migrations/           PostgreSQL schema and RLS
SUPABASE_KEYS_GUIDE.md   Beginner guide for Supabase URL and key names
```

## Migration Order

```text
supabase/migrations/001_phase_1_mvp.sql
supabase/migrations/002_security_scope_fixes.sql
supabase/migrations/003_authorized_devices.sql
supabase/migrations/004_attendance_rpc_signature_fix.sql
supabase/migrations/005_attendance_read_policy_fix.sql
supabase/migrations/006_daily_reports_rls_and_hours_fix.sql
supabase/migrations/007_daily_report_review_fields.sql
```

## Page Groups

Public:

- `/login`
- `/forgot-password`

Admin:

- `/admin/dashboard`
- `/admin/employees`
- `/admin/attendance`
- `/admin/tasks`
- `/admin/leaves`
- `/admin/daily-reports`
- `/admin/departments`
- `/admin/audit-logs`
- `/admin/settings`

Employee:

- `/employee/dashboard`
- `/employee/attendance`
- `/employee/tasks`
- `/employee/daily-report`
- `/employee/leave`
- `/employee/profile`
