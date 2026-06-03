# Deployment

Recommended hosting: Vercel.

## Deploy to Vercel

1. Push the project to GitHub.
2. Go to `https://vercel.com`.
3. Import the GitHub project.
4. Add environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SEED_ADMIN_EMAIL=
SEED_ADMIN_PASSWORD=
SEED_ADMIN_NAME=
```

Use either the Supabase publishable key or legacy anon key for `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
Use either the Supabase secret key or legacy service_role key for `SUPABASE_SERVICE_ROLE_KEY`.

5. Deploy.

## Important

- Do not expose `SUPABASE_SERVICE_ROLE_KEY` in client components.
- Run the Supabase SQL migration before using the deployed app.
- Use Supabase Auth email/password for staff login.

## Production Build Locally

```powershell
npm run build
npm run start
```
