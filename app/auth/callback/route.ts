import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicSupabaseEnv } from "@/lib/env";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");
  const next = safeNextPath(requestUrl.searchParams.get("next")) || "/reset-password";

  // If Supabase returned an error query param (e.g. otp_expired, access_denied)
  if (error || errorDescription) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "recovery");
    return NextResponse.redirect(loginUrl);
  }

  const { url, anonKey } = getPublicSupabaseEnv();
  let response = NextResponse.redirect(new URL(next, request.url));

  if (url && anonKey) {
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

    if (tokenHash && type) {
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

    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("error", "recovery");
        return NextResponse.redirect(loginUrl);
      }

      return response;
    }
  }

  return response;
}

function safeNextPath(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}
