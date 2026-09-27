import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deviceRequestInfoFromRequest, verifyEmployeeDeviceAccess } from "@/lib/authorized-devices";
import { getProfileByUserId, homeForRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const profile = await getProfileByUserId(user.id, { includeDisabled: true });

  if (profile?.status === "disabled") {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=disabled", request.url));
  }

  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=inactive", request.url));
  }

  const deviceAccess = await verifyEmployeeDeviceAccess(profile, deviceRequestInfoFromRequest(request), {
    logMobileBlocked: true
  });

  if (!deviceAccess.allowed) {
    if (deviceAccess.code === "mobile") {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=employee_mobile", request.url));
    }
    return NextResponse.redirect(new URL("/device-access", request.url));
  }

  return NextResponse.redirect(new URL(homeForRole(profile.role), request.url));
}
