import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-emerald-50 via-white to-slate-100 px-4 py-8">
      <section className="w-full max-w-md rounded-lg border border-emerald-100 bg-white p-6 shadow-soft">
        <div className="mb-6">
          <div className="mb-3 grid size-12 place-items-center rounded-lg bg-bie-700 text-lg font-extrabold text-white">
            BIE
          </div>
          <h1 className="text-2xl font-extrabold text-slate-950">Reset Password</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Enter your account email.</p>
        </div>
        <ForgotPasswordForm />
        <Link href="/login" className="mt-4 block text-center text-sm font-bold text-bie-700">
          Back to login
        </Link>
      </section>
    </main>
  );
}
