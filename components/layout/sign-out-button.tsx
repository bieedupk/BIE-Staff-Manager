"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ label = "Sign Out" }: { label?: string }) {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    document.cookie = "bie_remember_me=; path=/; max-age=0; SameSite=Lax";
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-emerald-50"
    >
      <LogOut size={16} />
      {label}
    </button>
  );
}
