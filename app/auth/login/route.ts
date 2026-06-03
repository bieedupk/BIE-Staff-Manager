import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { deviceRequestInfoFromRequest, verifyEmployeeDeviceAccess } from "@/lib/authorized-devices";
import { getProfileByUserId, homeForRole } from "@/lib/auth";
import {
  authServiceUnavailableMessage,
  getServerSupabaseEnv,
  isValidSupabaseUrl,
  missingSupabaseEnvMessage
} from "@/lib/env";

type AuthCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

function safeNextPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;

  const nextPath = value.trim();
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) return null;

  return nextPath;
}

function withAuthCookies(response: NextResponse, cookies: AuthCookie[], headers: Record<string, string>) {
  cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

function devAuthLog(message: string, details?: Record<string, string | boolean>) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[auth/login]", message, details || "");
}

function stringFromUnknown(value: unknown) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidates = [record.message, record.error_description, record.details];
    const message = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());

    if (typeof message === "string") return message;
    return "";
  }

  return String(value);
}

function safeLoginError(error: unknown) {
  const message = stringFromUnknown(error);
  const normalized = message.toLowerCase();
  const code = error && typeof error === "object" && "code" in error ? String(error.code || "") : "";

  if (
    code === "invalid_credentials" ||
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid email or password")
  ) {
    return "Invalid email or password.";
  }

  if (
    normalized.includes("fetch failed") ||
    normalized.includes("network") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("dns") ||
    normalized.includes("enotfound")
  ) {
    return authServiceUnavailableMessage;
  }

  return message || "Login failed. Please try again.";
}

function safeAuthErrorDetails(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code || "") : "";
  return {
    message: safeLoginError(error),
    code
  };
}

function isSupabaseNetworkLog(args: unknown[]) {
  return args.some((arg) => {
    if (!(arg instanceof Error)) return false;

    const message = arg.message.toLowerCase();
    const cause = arg.cause instanceof Error ? arg.cause.message.toLowerCase() : "";

    return (
      message.includes("fetch failed") ||
      message.includes("failed to fetch") ||
      cause.includes("connect timeout") ||
      cause.includes("enotfound")
    );
  });
}

async function quietSupabaseNetworkLogs<T>(callback: () => Promise<T>) {
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (isSupabaseNetworkLog(args)) return;
    originalConsoleError(...args);
  };

  try {
    return await callback();
  } finally {
    console.error = originalConsoleError;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url, anonKey, serviceRoleKey } = getServerSupabaseEnv();
    devAuthLog("auth route reached", {
      supabaseUrlExists: Boolean(url),
      anonKeyExists: Boolean(anonKey),
      serviceKeyExistsServerSide: Boolean(serviceRoleKey)
    });

    if (!isValidSupabaseUrl(url) || !anonKey || !serviceRoleKey) {
      return NextResponse.json({ error: missingSupabaseEnvMessage }, { status: 500 });
    }

    const formData = await request.formData();
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const nextPath = safeNextPath(formData.get("next"));
    devAuthLog("login email", { email });

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const authCookies: AuthCookie[] = [];
    let authHeaders: Record<string, string> = {};
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: AuthCookie[], headers: Record<string, string>) {
          authCookies.splice(0, authCookies.length, ...cookiesToSet);
          authHeaders = { ...authHeaders, ...headers };
        }
      }
    });

    const { error: signInError } = await quietSupabaseNetworkLogs(() =>
      supabase.auth.signInWithPassword({
        email,
        password
      })
    );

    if (signInError) {
      devAuthLog("Supabase auth error", safeAuthErrorDetails(signInError));
      return NextResponse.json({ error: safeLoginError(signInError) }, { status: 400 });
    }

    const {
      data: { user },
      error: userError
    } = await quietSupabaseNetworkLogs(() => supabase.auth.getUser());

    if (userError || !user) {
      if (userError) devAuthLog("Supabase auth error", safeAuthErrorDetails(userError));
      await supabase.auth.signOut();
      return withAuthCookies(
        NextResponse.json({ error: "Login could not be verified. Please try again." }, { status: 401 }),
        authCookies,
        authHeaders
      );
    }

    const profile = await getProfileByUserId(user.id, { includeDisabled: true });

    if (profile?.status === "disabled") {
      await supabase.auth.signOut();
      return withAuthCookies(
        NextResponse.json({ error: "Your account is disabled. Please contact administration." }, { status: 403 }),
        authCookies,
        authHeaders
      );
    }

    if (!profile || profile.status !== "active") {
      await supabase.auth.signOut();
      return withAuthCookies(
        NextResponse.json({ error: "Your account is inactive or missing a staff profile." }, { status: 403 }),
        authCookies,
        authHeaders
      );
    }

    const deviceAccess = await verifyEmployeeDeviceAccess(profile, deviceRequestInfoFromRequest(request), {
      logMobileBlocked: true
    });

    if (!deviceAccess.allowed) {
      await supabase.auth.signOut();
      return withAuthCookies(
        NextResponse.json({ error: deviceAccess.message || "This device is not authorized." }, { status: 403 }),
        authCookies,
        authHeaders
      );
    }

    return withAuthCookies(
      NextResponse.json({
        redirectTo: nextPath || homeForRole(profile.role)
      }),
      authCookies,
      authHeaders
    );
  } catch (error) {
    const message = stringFromUnknown(error);

    if (message === missingSupabaseEnvMessage) {
      return NextResponse.json({ error: missingSupabaseEnvMessage }, { status: 500 });
    }

    if (
      message.toLowerCase().includes("fetch failed") ||
      message.toLowerCase().includes("failed to parse url") ||
      message.toLowerCase().includes("invalid url")
    ) {
      return NextResponse.json({ error: authServiceUnavailableMessage }, { status: 503 });
    }

    return NextResponse.json({ error: "Login failed. Please try again." }, { status: 500 });
  }
}
