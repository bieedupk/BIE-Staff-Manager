import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminManagerProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuditLog } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminAuditLogsPage() {
  await requireAdminManagerProfile();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*, profiles(full_name)")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
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
          logs.map((log) => {
            const summary = getActionSummary(log);
            const changedBy = log.profiles?.full_name || "System";
            const reason = extractReason(log.details);
            const technicalDetails = log.details ? JSON.stringify(log.details, null, 2) : null;
            const attendanceRows = renderAttendanceChangeRows(log.details);

            return (
              <article key={log.id} className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-extrabold text-slate-950">{summary} — Changed by {changedBy}</h2>
                    <p className="mt-1 text-sm font-medium text-slate-500">
                      {formatEntityLabel(log.entity_type)} • {formatDateTime(log.created_at)}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-slate-500">Changed at {formatDateTime(log.created_at)}</p>
                </div>

                {isAttendanceCorrectionLog(log) ? (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-extrabold text-slate-950">Attendance correction details</h3>
                        <p className="text-sm font-medium text-slate-600">Review the field changes recorded for this correction.</p>
                      </div>
                      {isSyntheticAbsentCorrection(log) ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                          Created from absent record
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-white/80 bg-white/80 p-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Changed at</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{formatDateTime(log.created_at)}</p>
                      </div>
                      <div className="rounded-lg border border-white/80 bg-white/80 p-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Reason</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{formatAuditValue(reason)}</p>
                      </div>
                    </div>

                    {attendanceRows.length ? (
                      <div className="mt-4 overflow-hidden rounded-lg border border-emerald-100 bg-white">
                        <div className="grid grid-cols-[1.2fr_1fr_1fr] border-b border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                          <span>Field</span>
                          <span>Old</span>
                          <span>New</span>
                        </div>
                        {attendanceRows.map((row) => (
                          <div key={row.field} className="grid grid-cols-[1.2fr_1fr_1fr] border-b border-slate-100 px-3 py-2 text-sm text-slate-700 last:border-b-0">
                            <span className="font-semibold">{row.label}</span>
                            <span>{formatAuditValue(row.oldValue)}</span>
                            <span>{formatAuditValue(row.newValue)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-slate-600">No changed fields were recorded for this correction.</p>
                    )}

                    {technicalDetails ? (
                      <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Technical details</summary>
                        <pre className="mt-3 overflow-auto rounded-lg bg-white p-3 text-xs text-slate-600">{technicalDetails}</pre>
                      </details>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-white/80 bg-white/80 p-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Changed at</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{formatDateTime(log.created_at)}</p>
                      </div>
                      {reason ? (
                        <div className="rounded-lg border border-white/80 bg-white/80 p-3">
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Reason</p>
                          <p className="mt-1 text-sm font-semibold text-slate-800">{formatAuditValue(reason)}</p>
                        </div>
                      ) : null}
                    </div>

                    {technicalDetails ? (
                      <details className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Technical details</summary>
                        <pre className="mt-3 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{technicalDetails}</pre>
                      </details>
                    ) : null}
                  </div>
                )}
              </article>
            );
          })
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

function getActionSummary(log: AuditLog) {
  if (isAttendanceCorrectionLog(log)) {
    const details = log.details ?? {};
    const oldCheckIn = normalizeAuditValue(details.old_check_in_at);
    const newCheckIn = normalizeAuditValue(details.new_check_in_at);
    const oldCheckOut = normalizeAuditValue(details.old_check_out_at);
    const newCheckOut = normalizeAuditValue(details.new_check_out_at);
    const oldStatus = normalizeAuditValue(details.old_status);
    const newStatus = normalizeAuditValue(details.new_status);
    const changedFields = [
      oldCheckIn !== newCheckIn ? "check_in_at" : null,
      oldCheckOut !== newCheckOut ? "check_out_at" : null,
      oldStatus !== newStatus ? "status" : null,
      normalizeAuditValue(details.old_work_date) !== normalizeAuditValue(details.new_work_date) ? "work_date" : null,
      normalizeAuditValue(details.old_total_hours) !== normalizeAuditValue(details.new_total_hours) ? "total_hours" : null
    ].filter(Boolean);

    if (Boolean(details.created_from_synthetic_absent)) {
      return "Absent attendance corrected";
    }

    if (oldStatus === "Absent" && newStatus === "Present") {
      return "Absent attendance corrected";
    }

    if (changedFields.length === 1 && changedFields[0] === "check_in_at") {
      return "Check-in time modified";
    }

    if (changedFields.length === 1 && changedFields[0] === "check_out_at") {
      return "Check-out time modified";
    }

    if (changedFields.includes("status") && changedFields.length === 1) {
      return "Attendance status changed";
    }

    if (changedFields.length > 1) {
      return "Attendance updated";
    }

    return "Attendance updated";
  }

  const actionSummaryMap: Record<string, string> = {
    attendance_corrected: "Attendance updated",
    employee_access_blocked: "Employee access blocked",
    employee_access_unblocked: "Employee access unblocked",
    employee_device_reset: "Employee device reset",
    profile_updated: "Employee profile updated",
    leave_request_updated: "Leave request updated",
    task_updated: "Task updated",
    settings_updated: "Settings updated",
    system_action_recorded: "System action recorded"
  };

  return actionSummaryMap[log.action] || formatActionName(log.action);
}

function formatEntityLabel(entityType: string) {
  return entityType.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatActionName(action: string) {
  const normalized = action.replace(/_/g, " ").trim();
  if (!normalized) return "System action recorded";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractReason(details: Record<string, unknown> | null | undefined) {
  if (!details) return null;

  const possibleFields = ["correction_reason", "reason", "note", "comment", "message"];
  for (const field of possibleFields) {
    if (typeof details[field] === "string") {
      const trimmed = details[field]?.trim();
      if (trimmed) return trimmed;
    }
  }

  return null;
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
