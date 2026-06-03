import { cookies } from "next/headers";
import en from "@/locales/en.json";
import ur from "@/locales/ur.json";

export type Locale = "en" | "ur";

const dictionaries = { en, ur };

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get("bie_lang")?.value;
  return value === "ur" ? "ur" : "en";
}

export function getDictionary(locale: Locale = "en") {
  return dictionaries[locale];
}

export function getDirection(locale: Locale = "en") {
  return locale === "ur" ? "rtl" : "ltr";
}

export function t(key: keyof typeof en, locale: Locale = "en") {
  return dictionaries[locale][key] || dictionaries.en[key] || key;
}
