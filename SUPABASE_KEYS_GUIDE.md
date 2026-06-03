# Supabase Keys Guide

This app keeps simple environment variable names, but you can use either the newer Supabase key names or the legacy key names.

## 1. Project URL

1. Open your Supabase project.
2. Go to **Project Settings**.
3. Open **API Keys** or **API**.
4. Copy the **Project URL**.
5. Put it in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
```

## 2. Publishable / Anon Key

This is the public browser/client key.

Use one of these:

- If Supabase shows **publishable key**, copy it.
- If Supabase shows legacy **anon key**, copy it.

Put that value in:

```env
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

This key is allowed in frontend code because it is a low-privilege public key. Supabase Row Level Security still controls what users can read or write.

## 3. Secret / Service Role Key

This is the private server/admin key.

Use one of these:

- If Supabase shows **secret key**, copy it.
- If Supabase shows legacy **service_role key**, copy it.

Put that value in:

```env
SUPABASE_SERVICE_ROLE_KEY=your-secret-or-service-role-key
```

Never expose this key in frontend/browser code. Never paste it into client components. Never share it publicly.

In this app, `SUPABASE_SERVICE_ROLE_KEY` is used only by:

- `scripts/seed-super-admin.ts`
- `lib/supabase/admin.ts`

## Complete `.env.local` Example

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-secret-or-service-role-key

SEED_ADMIN_EMAIL=admin@bie.test
SEED_ADMIN_PASSWORD=Admin@123456
SEED_ADMIN_NAME=BIE Super Admin
```
