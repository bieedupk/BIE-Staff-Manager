import { redirect } from "next/navigation";
import { DeviceAccessClient } from "./client";
import { verifyEmployeeDeviceAccess, currentDeviceRequestInfo } from "@/lib/authorized-devices";
import { getProfileByUserId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DeviceAccessPage({
  searchParams
}: {
  searchParams?: Promise<{ action?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await getProfileByUserId(user.id);

  if (!profile || profile.status !== "active" || profile.role !== "employee") {
    redirect("/login");
  }

  const deviceInfo = await currentDeviceRequestInfo();
  const deviceAccess = await verifyEmployeeDeviceAccess(profile, deviceInfo);
  const resolvedParams = await searchParams;

  if (deviceAccess.allowed && resolvedParams?.action !== "replacement") {
    redirect("/employee/dashboard");
  }

  // Get device states
  const { data: activeDevice } = await supabase
    .from("authorized_devices")
    .select("id, device_name, credential_id")
    .eq("employee_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const { data: pendingRequest } = await supabase
    .from("device_registration_requests")
    .select("id, registration_code, status, device_name, requested_at, expires_at")
    .eq("employee_id", user.id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-center text-2xl font-extrabold text-slate-900">Device Access</h1>

        {deviceAccess.code === "mobile" ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {deviceAccess.message || "Mobile access is blocked. Please use an office computer."}
          </div>
        ) : (
          <DeviceAccessClient
            hasActiveDevice={!!activeDevice && !!activeDevice.credential_id}
            activeDeviceName={activeDevice?.device_name}
            pendingRequest={pendingRequest}
          />
        )}
      </div>
    </main>
  );
}
