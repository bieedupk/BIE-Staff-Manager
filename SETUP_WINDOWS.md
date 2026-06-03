# Windows Beginner Setup

Follow these steps in order.

## 1. Install Node.js LTS

1. Go to `https://nodejs.org`
2. Download the LTS version.
3. Install it with default options.
4. Open PowerShell and check:

```powershell
node -v
npm -v
```

## 2. Install Git

1. Go to `https://git-scm.com/download/win`
2. Install Git with default options.
3. Check:

```powershell
git --version
```

## 3. Install VS Code

1. Go to `https://code.visualstudio.com`
2. Download and install VS Code.
3. Open this project folder in VS Code.

## 4. Create Supabase Project

1. Go to `https://supabase.com`
2. Create an account.
3. Create a new project.
4. Save your project password somewhere safe.

## 5. Run SQL Migrations

1. In Supabase, open SQL Editor.
2. Open these project files one by one:

```text
supabase/migrations/001_phase_1_mvp.sql
supabase/migrations/002_security_scope_fixes.sql
supabase/migrations/003_authorized_devices.sql
supabase/migrations/004_attendance_rpc_signature_fix.sql
supabase/migrations/005_attendance_read_policy_fix.sql
supabase/migrations/006_daily_reports_rls_and_hours_fix.sql
supabase/migrations/007_daily_report_review_fields.sql
```

3. Copy the SQL from the first file.
4. Paste it into Supabase SQL Editor.
5. Click Run.
6. Repeat the same steps for each remaining file in order.

## 6. Copy Supabase Keys

In Supabase:

1. Open Project Settings.
2. Open API Keys or API.
3. Copy:
   - Project URL
   - publishable key or legacy anon key
   - secret key or legacy service_role key

Put the publishable/anon key in `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
Put the secret/service_role key in `SUPABASE_SERVICE_ROLE_KEY`.
Keep the secret/service_role key private.

For screenshots/labels to look for, read `SUPABASE_KEYS_GUIDE.md`.

## 7. Create `.env.local`

Copy `.env.example` and rename it to:

```text
.env.local
```

Fill it like this:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-secret-or-service-role-key
SEED_ADMIN_EMAIL=admin@bie.edu
SEED_ADMIN_PASSWORD=change-this-strong-password
SEED_ADMIN_NAME=BIE Super Admin
```

## 8. Install Project Packages

In PowerShell inside the project folder:

```powershell
npm install
```

## 9. Create First Super Admin

```powershell
npm run seed
```

## 10. Run the App

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

Login using `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.
