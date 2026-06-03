import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { hasPublicSupabaseEnv, missingSupabaseEnvMessage } from "@/lib/env";
import { getLocale } from "@/lib/i18n";

export default async function LoginPage() {
  const locale = await getLocale();
  const supabaseConfigured = hasPublicSupabaseEnv();

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-emerald-50 via-white to-slate-100 px-4 py-8">
      <section className="w-full max-w-md rounded-lg border border-emerald-100 bg-white p-6 shadow-soft">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 grid size-12 place-items-center rounded-lg bg-bie-700 text-lg font-extrabold text-white">
              BIE
            </div>
            <h1 className="text-2xl font-extrabold text-slate-950">BIE Staff Manager</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">Board of Islamic Education</p>
          </div>
          <LanguageToggle locale={locale} />
        </div>
        {!supabaseConfigured ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
            {missingSupabaseEnvMessage}
          </div>
        ) : null}
        <LoginForm supabaseConfigured={supabaseConfigured} />
        <Link href="/forgot-password" className="mt-4 block text-center text-sm font-bold text-bie-700">
          Forgot password?
        </Link>
      </section>
    </main>
  );
}
