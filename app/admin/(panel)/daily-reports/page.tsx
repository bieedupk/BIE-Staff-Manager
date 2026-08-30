import { Star } from "lucide-react";
import { resetTestDailyReport, reviewDailyReport } from "@/app/actions/reports";
import { ReviewRating } from "@/app/admin/daily-reports/review-rating";
import { ResetTestReportButton } from "@/app/admin/daily-reports/reset-test-report-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireAdminProfile } from "@/lib/auth";
import { departmentTextForProfile, fetchEmployeeDepartmentsByEmployee } from "@/lib/employee-departments";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceRecord, DailyReport, Department, Profile } from "@/lib/types";
import { formatDate, formatDateTime, isAdminManagerRole, todayISO } from "@/lib/utils";

type Props = {
  searchParams?: Promise<{
    date?: string;
    employee?: string;
    department?: string;
    status?: string;
    daily_report_review_success?: string;
    daily_report_review_error?: string;
    daily_report_reset_success?: string;
    daily_report_reset_error?: string;
  }>;
};

export default async function AdminDailyReportsPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const profile = await requireAdminProfile();
  const sessionSupabase = await createClient();
  const isAdminManager = isAdminManagerRole(profile.role);
  const adminSupabase = isAdminManager ? createAdminClient() : null;
  const lookupSupabase = adminSupabase ?? sessionSupabase;
  const reportSupabase = adminSupabase ?? sessionSupabase;
  const reportDate = resolvedSearchParams?.date || todayISO();
  const employeeFilter = resolvedSearchParams?.employee || "";
  const departmentFilter = resolvedSearchParams?.department || "";
  const statusFilter = dailyReportStatus(resolvedSearchParams?.status);

  let rawReportsQuery = reportSupabase
    .from("daily_reports")
    .select("*")
    .eq("report_date", reportDate)
    .order("created_at", { ascending: false });

  if (employeeFilter) rawReportsQuery = rawReportsQuery.eq("employee_id", employeeFilter);
  if (statusFilter !== "all") rawReportsQuery = rawReportsQuery.eq("review_status", statusFilter);

  let sessionReportsQuery: any = null;
  if (adminSupabase) {
    let sessionQuery = sessionSupabase
      .from("daily_reports")
      .select("*")
      .eq("report_date", reportDate)
      .order("created_at", { ascending: false });

    if (employeeFilter) sessionQuery = sessionQuery.eq("employee_id", employeeFilter);
    if (statusFilter !== "all") sessionQuery = sessionQuery.eq("review_status", statusFilter);
    sessionReportsQuery = sessionQuery;
  }

  const [
    { data: employees },
    { data: departments },
    { data: rawReportData, error: rawReportsError },
    sessionReportsResult
  ] = await Promise.all([
    lookupSupabase.from("profiles").select("*").eq("role", "employee").eq("status", "active").order("full_name"),
    lookupSupabase.from("departments").select("*").eq("is_active", true).order("sort_order", { ascending: true, nullsFirst: false }).order("name"),
    rawReportsQuery,
    sessionReportsQuery ? sessionReportsQuery : Promise.resolve(null)
  ]);

  const rawReportRows = (rawReportData ?? []) as DailyReport[];
  const rawReportReadSource: "admin" | "session" = adminSupabase ? "admin" : "session";
  const sessionReportRows: DailyReport[] | null = sessionReportsResult ? ((sessionReportsResult.data ?? []) as DailyReport[]) : null;
  const sessionReportsError: { code?: string; message?: string } | null = sessionReportsResult ? sessionReportsResult.error : null;

  const rawEmployeeIds = [...new Set(rawReportRows.map((report) => report.employee_id))];
  const reviewProfileIds = [...new Set(rawReportRows.flatMap((report) => (report.reviewed_by ? [report.reviewed_by] : [])))];
  const reportProfileIds = [...new Set([...rawEmployeeIds, ...reviewProfileIds])];

  const [
    { data: reportProfileRows, error: reportProfilesError },
    assignmentsByEmployee,
    { data: attendanceRows }
  ] = await Promise.all([
    reportProfileIds.length
      ? lookupSupabase
          .from("profiles")
          .select("id, full_name, department, department_id, designation")
          .in("id", reportProfileIds)
      : Promise.resolve({ data: [] as Array<Pick<Profile, "id" | "full_name" | "department" | "department_id" | "designation">>, error: null }),
    fetchEmployeeDepartmentsByEmployee(lookupSupabase, reportProfileIds),
    rawEmployeeIds.length
      ? lookupSupabase.from("attendance").select("*").eq("work_date", reportDate).in("employee_id", rawEmployeeIds)
      : Promise.resolve({ data: [] as AttendanceRecord[] })
  ]);

  const reportProfilesById = new Map(
    ((reportProfileRows ?? []) as Array<Pick<Profile, "id" | "full_name" | "department" | "department_id" | "designation">>).map((employee) => [
      employee.id,
      employee
    ])
  );
  const enrichedReports = rawReportRows.map((report) => ({
    ...report,
    profiles: reportProfilesById.get(report.employee_id) ?? null
  })) as DailyReport[];
  let reports = enrichedReports;
  if (departmentFilter) {
    reports = reports.filter(
      (report) => report.profiles && departmentTextForProfile(report.profiles, assignmentsByEmployee, "").split(", ").includes(departmentFilter)
    );
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[daily-reports:admin]", {
      selectedDate: reportDate,
      statusFilter,
      adminProfileId: profile.id,
      adminRole: profile.role,
      rawReportReadSource,
      sessionRawReportsCount: sessionReportRows?.length ?? null,
      rawReportsCount: rawReportRows.length,
      enrichedReportsCount: enrichedReports.length,
      displayedReportsCount: reports.length,
      reportProfilesCount: reportProfileRows?.length ?? 0,
      missingReportProfilesCount: Math.max(rawEmployeeIds.length - (reportProfileRows?.length ?? 0), 0),
      sessionErrorCode: sessionReportsError?.code ?? null,
      sessionErrorMessage: sessionReportsError?.message ?? null,
      rawErrorCode: rawReportsError?.code ?? null,
      rawErrorMessage: rawReportsError?.message ?? null,
      profileErrorCode: reportProfilesError?.code ?? null,
      profileErrorMessage: reportProfilesError?.message ?? null
    });
  }

  const attendanceByEmployee = new Map(((attendanceRows ?? []) as AttendanceRecord[]).map((record) => [record.employee_id, record]));

  return (
    <>
      <PageHeader title="Daily Reports" subtitle="Filter employee reports by date, employee, and department." backHref="/admin/dashboard" />
      <DailyReportReviewMessage
        success={resolvedSearchParams?.daily_report_review_success}
        error={resolvedSearchParams?.daily_report_review_error}
      />
      <DailyReportReviewMessage success={resolvedSearchParams?.daily_report_reset_success} error={resolvedSearchParams?.daily_report_reset_error} />

      <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
        <p className="mb-4 text-sm font-bold text-slate-600">
          Selected date: {formatDate(reportDate)} ({reportDate})
        </p>
        <form className="grid gap-3 md:grid-cols-5">
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Date
            <input name="date" type="date" defaultValue={reportDate} className="min-h-11 rounded-lg border border-slate-300 px-3" />
          </label>
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Employee
            <select name="employee" defaultValue={employeeFilter} className="min-h-11 rounded-lg border border-slate-300 px-3">
              <option value="">All employees</option>
              {((employees ?? []) as Profile[]).map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Department
            <select name="department" defaultValue={departmentFilter} className="min-h-11 rounded-lg border border-slate-300 px-3">
              <option value="">All departments</option>
              {((departments ?? []) as Department[]).map((department) => (
                <option key={department.id} value={department.name}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Review status
            <select name="status" defaultValue={statusFilter} className="min-h-11 rounded-lg border border-slate-300 px-3">
              <option value="all">All</option>
              <option value="pending_review">Pending Review</option>
              <option value="reviewed">Reviewed</option>
            </select>
          </label>
          <button className="self-end min-h-11 rounded-lg bg-bie-700 px-4 font-extrabold text-white">Filter</button>
        </form>
      </section>

      {process.env.ENABLE_TEST_RESET === "true" && isAdminManager ? (
        <section className="mt-5 rounded-lg border border-amber-200 bg-white p-4 shadow-soft">
          <h2 className="font-extrabold text-slate-950">Temporary Testing Tool</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">Temporary admin-only reset for one employee report on one date.</p>
          <form action={resetTestDailyReport} className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <input type="hidden" name="date" value={reportDate} />
            <input type="hidden" name="employee" value={employeeFilter} />
            <input type="hidden" name="department" value={departmentFilter} />
            <input type="hidden" name="status" value={statusFilter} />
            <label className="grid gap-1 text-sm font-bold text-slate-700">
              Report date
              <input
                name="report_date"
                type="date"
                defaultValue={reportDate}
                required
                className="min-h-11 rounded-lg border border-slate-300 px-3"
              />
            </label>
            <label className="grid gap-1 text-sm font-bold text-slate-700">
              Employee
              <select name="reset_employee_id" defaultValue={employeeFilter} required className="min-h-11 rounded-lg border border-slate-300 px-3">
                <option value="">Select employee</option>
                {((employees ?? []) as Profile[]).map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name}
                  </option>
                ))}
              </select>
            </label>
            <ResetTestReportButton />
          </form>
        </section>
      ) : null}

      <section className="mt-5 grid gap-4">
        {reports.length ? (
          reports.map((report) => {
            const reviewLocked = isDailyReportReviewLocked(report);
            const reviewer = report.reviewed_by ? reportProfilesById.get(report.reviewed_by) : null;

            return (
              <article key={report.id} className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-extrabold text-slate-950">{report.profiles?.full_name || "Unknown employee"}</h2>
                    <p className="text-sm font-medium text-slate-500">
                      {report.profiles ? departmentTextForProfile(report.profiles, assignmentsByEmployee) : "Not assigned"} | {report.profiles?.designation || "-"} | {formatDate(report.report_date)} |
                      Attendance: {report.hours_worked} hrs
                    </p>
                  </div>
                  <div className="text-sm font-bold text-slate-500">
                    {reviewLocked ? (
                      <>
                        <p className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-extrabold text-emerald-800">Reviewed</p>
                        {report.reviewed_at ? <p className="mt-2">{formatDateTime(report.reviewed_at)}</p> : null}
                      </>
                    ) : (
                      <p className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-extrabold text-amber-800">Pending Review</p>
                    )}
                  </div>
                </div>
                <details className="group mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <summary className="cursor-pointer list-none text-sm font-extrabold text-bie-700">
                    <span className="group-open:hidden">View Details</span>
                    <span className="hidden group-open:inline">Hide Details</span>
                  </summary>
                  <div className="mt-3 grid gap-2 text-sm text-slate-700">
                    <ReportText label="Attendance hours" value={`${report.hours_worked} hrs`} />
                    <ReportText label="Check in" value={formatDateTime(attendanceByEmployee.get(report.employee_id)?.check_in_at)} />
                    <ReportText label="Check out" value={formatDateTime(attendanceByEmployee.get(report.employee_id)?.check_out_at)} />
                    <ReportText label="Work summary" value={report.work_summary} />
                    <ReportText label="Tasks completed" value={report.tasks_completed} />
                    <ReportText label="Pending work" value={report.pending_work} />
                    <ReportText label="Challenges / issues" value={report.challenges || "None"} />
                    <ReportText label="Tomorrow plan" value={report.tomorrow_plan || "-"} />
                    <ReportText label="Review status" value={reviewLocked ? "Reviewed" : "Pending Review"} />
                  </div>
                  {reviewLocked ? (
                    <div className="mt-4 grid gap-2 rounded-lg bg-white p-3 text-sm text-slate-700">
                      <p className="font-extrabold text-slate-950">Review locked</p>
                      <p className="font-semibold text-slate-600">This report has already been reviewed and is locked.</p>
                      <RatingStars rating={report.review_rating} />
                      <ReportText label="Review comment" value={report.review_comment || "-"} />
                      {report.reviewed_at ? <ReportText label="Reviewed at" value={formatDateTime(report.reviewed_at)} /> : null}
                      {report.reviewed_by ? <ReportText label="Reviewed by" value={reviewer?.full_name || "Profile unavailable"} /> : null}
                    </div>
                  ) : (
                    <form action={reviewDailyReport} className="mt-4 grid gap-3">
                      <input type="hidden" name="id" value={report.id} />
                      <input type="hidden" name="date" value={reportDate} />
                      <input type="hidden" name="employee" value={employeeFilter} />
                      <input type="hidden" name="department" value={departmentFilter} />
                      <input type="hidden" name="status" value={statusFilter} />
                      <ReviewRating initialRating={null} />
                      <label className="grid gap-1 text-sm font-bold text-slate-700">
                        Review comment
                        <textarea name="review_comment" className="rounded-lg border border-slate-300 px-3 py-2" dir="auto" />
                      </label>
                      <div>
                        <SubmitButton pendingText="Saving Review..." className="min-h-10 rounded-lg bg-bie-700 px-4 text-sm font-extrabold text-white transition hover:bg-bie-800 disabled:opacity-50">
                          Save Review
                        </SubmitButton>
                      </div>
                    </form>
                  )}
                </details>
              </article>
            );
          })
        ) : (
          <EmptyState message="No reports found for selected date." />
        )}
      </section>
    </>
  );
}

function dailyReportStatus(status?: string) {
  return status === "reviewed" || status === "pending_review" ? status : "all";
}

function isDailyReportReviewLocked(report: DailyReport) {
  return report.review_status === "reviewed" || report.reviewed_at !== null || report.review_rating !== null;
}

function ReportText({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <strong>{label}:</strong>{" "}
      <span dir="auto" style={{ unicodeBidi: "plaintext", lineHeight: 1.9 }}>
        {value}
      </span>
    </p>
  );
}

function RatingStars({ rating }: { rating: number | null }) {
  if (!rating) return <p className="font-semibold text-slate-500">No rating yet.</p>;

  return (
    <div className="flex items-center gap-1 text-amber-600" aria-label={`${rating} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} className={`h-4 w-4 ${star <= rating ? "fill-current" : ""}`} aria-hidden="true" />
      ))}
      <span className="ml-1 font-semibold text-slate-600">{ratingLabel(rating)}</span>
    </div>
  );
}

function ratingLabel(rating: number) {
  return ["Poor", "Needs Improvement", "Average", "Good", "Excellent"][rating - 1];
}

function DailyReportReviewMessage({ success, error }: { success?: string; error?: string }) {
  if (success) {
    return <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{success}</div>;
  }

  if (error) {
    return <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>;
  }

  return null;
}
