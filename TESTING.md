# Testing Phase 1

## Commands

Run these before deployment:

```powershell
npm run lint
npm run typecheck
npm run build
```

## Login Test

1. Run both Supabase migrations.
2. Run `npm run seed`.
3. Open `/login`.
4. Login as the seeded super admin.
5. Confirm you land on `/admin/dashboard`.

## Employee Test

1. Admin opens `/admin/employees`.
2. Create an employee with email and temporary password.
3. Sign out.
4. Login as the employee.
5. Confirm employee lands on `/employee/dashboard`.

## Attendance Test

1. Employee clicks Check In.
2. Refresh page.
3. Confirm status appears.
4. Employee clicks Check Out.
5. Confirm total hours appears.
6. Admin opens `/admin/attendance`.
7. Confirm employee appears in today's attendance.

## Leave Test

1. Employee opens `/employee/leave`.
2. Submit leave request.
3. Admin opens `/admin/leaves`.
4. Approve or reject request.
5. Employee confirms updated status.

## Task Test

1. Admin opens `/admin/tasks`.
2. Assign task to employee.
3. Employee opens `/employee/tasks`.
4. Update task status and note.
5. Admin confirms progress.

## Daily Report Test

1. Employee checks in and checks out for the report date.
2. Employee opens `/employee/daily-report`.
3. Submit the report and confirm hours come from attendance.
4. Admin opens `/admin/daily-reports`.
5. Filter by date or employee.
6. Save a 1-5 star rating and review comment.
7. Employee confirms the rating and review comment are visible.
8. Admin opens the date print page and uses browser Save as PDF.
9. Confirm mixed English and Urdu report text is readable on screen and in print preview.
