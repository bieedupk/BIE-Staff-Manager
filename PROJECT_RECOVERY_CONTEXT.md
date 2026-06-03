# Project Recovery Context

## Local Recovery Note

Codex cloud/platform task creation timed out. Continue from this local repository state instead of rebuilding the project from scratch or relying on earlier cloud chat.

Snapshot date: 2026-05-22

## Product Direction

This project started as BIE Staff Manager for the Board of Islamic Education.

The long-term product direction is a universal white-label staff, institute, and office management tool. Board of Islamic Education is the current organization, not a permanent hardcoded product boundary.

## Current Scope

- Authentication
- Employee management
- Attendance
- Authorized device control
- Tasks
- Leave
- Daily reports
- Daily report review and rating
- PDF and print export
- Urdu and English support
- Admin dashboard
- Employee dashboard
- Audit logs

## Out Of Scope

Do not add Firebase, FlutterFlow, ERPNext, desktop monitoring, accounting, tax, CRM, custom domains, or unrelated modules while recovering and stabilizing the current MVP.

## Verified Repository Snapshot

- App stack: Next.js App Router, React, TypeScript, Tailwind, Supabase.
- Main source areas: `app/`, `components/`, `lib/`, `locales/`, `public/`, `scripts/`, and `supabase/migrations/`.
- Local environment file exists as `.env.local`; do not print or expose values.
- Current local migration files run from `001_phase_1_mvp.sql` through `007_daily_report_review_fields.sql`.
- Daily report submission, review/rating, and print-save-as-PDF surfaces already exist in the repository.

## Daily Report Recovery Inventory

- Employee page: `app/employee/daily-report/page.tsx`
- Admin review page: `app/admin/(panel)/daily-reports/page.tsx`
- Review rating control: `app/admin/daily-reports/review-rating.tsx`
- Report server actions: `app/actions/reports.ts`
- Print page: `app/admin/daily-reports/print/page.tsx`
- Print button: `app/admin/daily-reports/print/print-button.tsx`
- Types: `lib/types.ts`
- Daily report RLS and hours fix: `supabase/migrations/006_daily_reports_rls_and_hours_fix.sql`
- Review fields migration: `supabase/migrations/007_daily_report_review_fields.sql`

## Verification Run

These commands were run locally with Windows-safe npm invocation:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

All three commands passed on 2026-05-22.

## Current Recovery Risks

- The local migration list includes `007`, but this snapshot does not confirm whether every migration has already been applied to the connected Supabase project.
- The PDF flow currently appears to be the browser print page with Save as PDF rather than a separate generated PDF artifact.
- The admin daily-report page can filter by employee and department, but the current print link and print page carry only date and review status, so a filtered admin list can print a broader report set than the screen shows.
- End-to-end role, RLS, device authorization, attendance-to-report, review, Urdu, and print-preview flows still need a manual smoke test after confirming migration state.
- Git was not available on the current PowerShell path during this recovery inventory, so worktree status was not captured with `git status`.
