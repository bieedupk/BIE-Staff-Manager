import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicSupabaseEnv } from "@/lib/env";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = (requestUrl.searchParams.get("type") || "recovery") as EmailOtpType;
  const next = safeNextPath(requestUrl.searchParams.get("next")) || "/reset-password";
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");

  if (error || errorDescription || !tokenHash) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "recovery");
    return NextResponse.redirect(loginUrl);
  }

  const { url, anonKey } = getPublicSupabaseEnv();
  if (!url || !anonKey) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "recovery");
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.redirect(new URL(next, request.url));

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type
  });

  if (verifyError) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "recovery");
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

function safeNextPath(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}
