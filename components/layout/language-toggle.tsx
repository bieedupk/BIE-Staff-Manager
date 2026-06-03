"use client";

import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";

export function LanguageToggle({ locale }: { locale: Locale }) {
  const router = useRouter();

  function changeLanguage(nextLocale: Locale) {
    document.cookie = `bie_lang=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
    document.documentElement.dir = nextLocale === "ur" ? "rtl" : "ltr";
    router.refresh();
  }

  return (
    <div className="inline-flex rounded-lg border border-emerald-200 bg-white p-1 text-xs font-bold shadow-sm">
      <button
        type="button"
        onClick={() => changeLanguage("en")}
        className={`rounded-md px-3 py-2 ${locale === "en" ? "bg-bie-600 text-white" : "text-slate-600"}`}
      >
        English
      </button>
      <button
        type="button"
        onClick={() => changeLanguage("ur")}
        className={`rounded-md px-3 py-2 ${locale === "ur" ? "bg-bie-600 text-white" : "text-slate-600"}`}
      >
        اردو
      </button>
    </div>
  );
}
