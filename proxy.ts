import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasPublicSupabaseEnv } from "@/lib/env";

const protectedPrefixes = ["/admin", "/employee"];
const publicRecoveryPrefixes = ["/forgot-password", "/reset-password", "/auth/callback", "/auth/confirm", "/login"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request
  });
  const isPublicRecoveryRoute = publicRecoveryPrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix));
  const isProtected = protectedPrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix));

  if (isPublicRecoveryRoute) {
    return response;
  }

  if (!isProtected) {
    return response;
  }

  if (!hasPublicSupabaseEnv()) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("setup", "missing-supabase-env");
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          const isRememberMe = request.cookies.get("bie_remember_me")?.value === "1";
          cookiesToSet.forEach(({ name, value, options }) => {
            const cookieOptions = isRememberMe
              ? options
              : { ...options, maxAge: undefined, expires: undefined };
            response.cookies.set(name, value, cookieOptions);
          });
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon.svg).*)"]
};
