# Next Actions

## Immediate Safe Sequence

1. Confirm the connected Supabase project has local migrations through `007_daily_report_review_fields.sql` applied before changing the daily report review flow.
2. Smoke test the existing daily report path with real roles and data:
   - employee check in and check out
   - employee daily report submit
   - admin or assigned supervisor daily report review with 1-5 rating and comment
   - employee review visibility
   - admin print page and browser Save as PDF
   - mixed English and Urdu readability in print preview
3. Fix the first reproduced issue from that smoke test with the narrowest code and migration change that fits the current repo patterns.

## Current Exact Next Safe Fix

Do not rebuild daily reports. First verify migration `007` is applied in Supabase. Then make the narrow print-filter fix: preserve employee and department filters from the admin daily-report page into the print route so print and browser Save as PDF reflect the filtered admin result set.

The current code already contains the review fields, UI, server action, and print page, while lint, typecheck, and production build pass locally.

## Commands

Run project checks from Windows PowerShell with `npm.cmd`:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

Run the app locally when smoke testing:

```powershell
npm.cmd run dev
```

## Guardrails

- Keep `.env.local` values private.
- Do not add Firebase, FlutterFlow, ERPNext, desktop monitoring, accounting, tax, CRM, custom domains, or unrelated modules.
- Prefer generic staff and organization wording in new work unless Board of Islamic Education text is required as a current default.
