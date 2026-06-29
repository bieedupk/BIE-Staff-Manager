import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminManagerProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuditLog } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export default async function AdminAuditLogsPage() {
  await requireAdminManagerProfile();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <>
        <PageHeader title="Audit Logs" subtitle="Review admin and employee actions from the system." backHref="/admin/dashboard" />
        <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          Unable to load audit logs right now. Please try again shortly. Error: {error.message}
        </section>
      </>
    );
  }

  const logs = (data ?? []) as AuditLog[];

  return (
    <>
      <PageHeader title="Audit Logs" subtitle="Review admin and employee actions from the system." backHref="/admin/dashboard" />
      <section className="grid gap-3">
        {logs.length ? (
          logs.map((log) => (
            <article key={log.id} className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-extrabold text-slate-950">{renderActionTitle(log.action, log.entity_type)}</h2>
                  <p className="text-sm font-medium text-slate-500">
                    {log.entity_type} • {log.profiles?.full_name || "System"}
                  </p>
                </div>
                <p className="text-sm font-bold text-slate-500">{formatDateTime(log.created_at)}</p>
              </div>

              {isAttendanceCorrectionLog(log) ? (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-extrabold text-slate-950">Attendance Corrected</h3>
                      <p className="text-sm font-medium text-slate-600">Changed by {log.profiles?.full_name || "System"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {isSyntheticAbsentCorrection(log) ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                          Created from absent record
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-white/80 bg-white/80 p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Changed at</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{formatDateTime(log.created_at)}</p>
                    </div>
                    <div className="rounded-lg border border-white/80 bg-white/80 p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Reason</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{formatAuditValue(log.details?.correction_reason)}</p>
                    </div>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-lg border border-emerald-100 bg-white">
                    <div className="grid grid-cols-[1.2fr_1fr_1fr] border-b border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                      <span>Field</span>
                      <span>Old</span>
                      <span>New</span>
                    </div>
                    {renderAttendanceChangeRows(log.details).map((row) => (
                      <div key={row.field} className="grid grid-cols-[1.2fr_1fr_1fr] border-b border-slate-100 px-3 py-2 text-sm text-slate-700 last:border-b-0">
                        <span className="font-semibold">{row.label}</span>
                        <span>{formatAuditValue(row.oldValue)}</span>
                        <span>{formatAuditValue(row.newValue)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                    <span className="font-semibold text-slate-700">{renderActionTitle(log.action, log.entity_type)}</span>
                    <span>•</span>
                    <span>Changed by {log.profiles?.full_name || "System"}</span>
                  </div>
                  {log.details ? (
                    <pre className="mt-3 overflow-auto rounded-lg bg-white p-3 text-xs text-slate-600">{JSON.stringify(log.details, null, 2)}</pre>
                  ) : null}
                </div>
              )}
            </article>
          ))
        ) : (
          <EmptyState message="No audit logs found." />
        )}
      </section>
    </>
  );
}

function isAttendanceCorrectionLog(log: AuditLog) {
  return log.action === "attendance_corrected" && log.entity_type === "attendance";
}

function isSyntheticAbsentCorrection(log: AuditLog) {
  return Boolean(log.details?.created_from_synthetic_absent);
}

function renderActionTitle(action: string, entityType: string) {
  if (action === "attendance_corrected") return "Attendance Corrected";
  return action.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderAttendanceChangeRows(details: Record<string, unknown> | null | undefined) {
  const rows = [
    { field: "work_date", label: "Work date", oldValue: details?.old_work_date, newValue: details?.new_work_date },
    { field: "check_in_at", label: "Check in", oldValue: details?.old_check_in_at, newValue: details?.new_check_in_at },
    { field: "check_out_at", label: "Check out", oldValue: details?.old_check_out_at, newValue: details?.new_check_out_at },
    { field: "status", label: "Status", oldValue: details?.old_status, newValue: details?.new_status },
    { field: "total_hours", label: "Total hours", oldValue: details?.old_total_hours, newValue: details?.new_total_hours }
  ];

  return rows.filter((row) => hasDifferentAuditValues(row.oldValue, row.newValue));
}

function hasDifferentAuditValues(oldValue: unknown, newValue: unknown) {
  const oldText = normalizeAuditValue(oldValue);
  const newText = normalizeAuditValue(newValue);

  if (!oldText && !newText) return false;
  return oldText !== newText;
}

function normalizeAuditValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  return String(value);
}

function formatAuditValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "-";
    const parsedDate = new Date(trimmed);
    if (!Number.isNaN(parsedDate.getTime())) return formatDateTime(trimmed);
    return trimmed;
  }
  return String(value);
}
