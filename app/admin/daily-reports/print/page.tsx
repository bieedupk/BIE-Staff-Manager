import { Star } from "lucide-react";
import { PrintButton } from "@/app/admin/daily-reports/print/print-button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAdminProfile } from "@/lib/auth";
import { departmentTextForProfile, fetchEmployeeDepartmentsByEmployee } from "@/lib/employee-departments";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceRecord, DailyReport } from "@/lib/types";
import { formatDate, formatDateTime, formatTime, formatWorkedDuration, isAdminManagerRole, todayISO } from "@/lib/utils";

type Props = {
  searchParams?: Promise<{
    date?: string;
    status?: string;
  }>;
};

export default async function DailyReportsPrintPage({ searchParams }: Props) {
  const profile = await requireAdminProfile();
  const resolvedSearchParams = await searchParams;
  const reportDate = resolvedSearchParams?.date || todayISO();
  const statusFilter = dailyReportStatus(resolvedSearchParams?.status);
  const supabase = isAdminManagerRole(profile.role) ? createAdminClient() : await createClient();
  let reportQuery = supabase
    .from("daily_reports")
    .select("*, profiles(id, full_name, department, department_id, designation)")
    .eq("report_date", reportDate)
    .order("created_at", { ascending: false });
  if (statusFilter !== "all") reportQuery = reportQuery.eq("review_status", statusFilter);

  const { data } = await reportQuery;
  const reports = (data ?? []) as DailyReport[];
  const employeeIds = [...new Set(reports.map((report) => report.employee_id))];
  const assignmentsByEmployee = await fetchEmployeeDepartmentsByEmployee(supabase, employeeIds);
  const { data: attendanceRows } = employeeIds.length
    ? await supabase.from("attendance").select("*").eq("work_date", reportDate).in("employee_id", employeeIds)
    : { data: [] as AttendanceRecord[] };
  const attendanceByEmployee = new Map(((attendanceRows ?? []) as AttendanceRecord[]).map((record) => [record.employee_id, record]));
  const reviewedReports = reports.filter((report) => report.review_status === "reviewed");
  const ratedReports = reports.filter((report) => report.review_rating !== null);
  const averageRating = ratedReports.length
    ? (ratedReports.reduce((total, report) => total + (report.review_rating ?? 0), 0) / ratedReports.length).toFixed(1)
    : null;
  const generatedAt = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date());

  return (
    <div className="print-sheet">
      <style>{printStyles}</style>
      <div className="print-toolbar">
        <PrintButton />
      </div>
      <header className="print-header">
        <div>
          <p className="print-kicker">BIE Staff Manager</p>
          <h1>Daily Reports</h1>
        </div>
        <div className="print-meta">
          <p>Report date: {formatDate(reportDate)}</p>
          <p>Review status: {statusFilterLabel(statusFilter)}</p>
          <p>Generated: {generatedAt}</p>
        </div>
      </header>

      <section className="print-summary" aria-label="Daily report summary">
        <Summary label="Total reports" value={reports.length} />
        <Summary label="Reviewed" value={reviewedReports.length} />
        <Summary label="Pending review" value={reports.length - reviewedReports.length} />
        <Summary label="Average rating" value={averageRating ?? "-"} />
      </section>

      <section className="print-reports">
        {reports.length ? (
          reports.map((report) => (
            <article key={report.id} className="print-report">
              <div className="report-heading">
                <div>
                  <h2>{report.profiles?.full_name || "Employee"}</h2>
                  <p>
                    {report.profiles ? departmentTextForProfile(report.profiles, assignmentsByEmployee) : "Not assigned"} | {report.profiles?.designation || "-"}
                  </p>
                </div>
                <div className="report-hours">
                  <p>Attendance hours: {formatWorkedDuration(report.hours_worked)}</p>
                  <p>Check in: {formatTime(attendanceByEmployee.get(report.employee_id)?.check_in_at)}</p>
                  <p>Check out: {formatTime(attendanceByEmployee.get(report.employee_id)?.check_out_at)}</p>
                </div>
              </div>
              <div className="report-grid">
                <PrintText label="Work summary" value={report.work_summary} />
                <PrintText label="Tasks completed" value={report.tasks_completed} />
                <PrintText label="Pending work" value={report.pending_work} />
                <PrintText label="Challenges / issues" value={report.challenges || "None"} />
                <PrintText label="Tomorrow plan" value={report.tomorrow_plan || "-"} />
                <PrintText label="Review status" value={statusFilterLabel(report.review_status)} />
                <div className="report-field">
                  <strong>Rating</strong>
                  <RatingStars rating={report.review_rating} />
                </div>
                <PrintText label="Review comment" value={report.review_comment || "-"} />
              </div>
            </article>
          ))
        ) : (
          <EmptyState message="No reports found for selected date." />
        )}
      </section>

      <footer className="print-footer">Generated by Staff Manager</footer>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function PrintText({ label, value }: { label: string; value: string }) {
  return (
    <div className="report-field">
      <strong>{label}</strong>
      <p dir="auto">{value}</p>
    </div>
  );
}

function RatingStars({ rating }: { rating: number | null }) {
  if (!rating) return <p className="muted">Pending Review</p>;

  return (
    <div className="rating-stars" aria-label={`${rating} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} className={star <= rating ? "filled-star" : ""} aria-hidden="true" />
      ))}
      <span>{rating} / 5</span>
    </div>
  );
}

function dailyReportStatus(status?: string) {
  return status === "reviewed" || status === "pending_review" ? status : "all";
}

function statusFilterLabel(status: string) {
  if (status === "reviewed") return "Reviewed";
  if (status === "pending_review") return "Pending Review";
  return "All";
}

const printStyles = `
  .print-sheet {
    color: #0f172a;
    font-family: "Noto Nastaliq Urdu", "Noto Naskh Arabic", "Jameel Noori Nastaleeq", Arial, sans-serif;
    line-height: 1.55;
    margin: 0 auto;
    max-width: 920px;
  }
  .print-toolbar { display: flex; justify-content: flex-end; margin-bottom: 18px; }
  .print-header, .report-heading { align-items: start; display: flex; gap: 18px; justify-content: space-between; }
  .print-header { border-bottom: 2px solid #065f46; margin-bottom: 16px; padding-bottom: 14px; }
  .print-kicker { color: #047857; font-size: 13px; font-weight: 800; margin: 0; }
  h1, h2, p { margin-top: 0; }
  h1 { font-size: 30px; line-height: 1.2; margin-bottom: 0; }
  h2 { font-size: 19px; line-height: 1.3; margin-bottom: 4px; }
  .print-meta, .report-hours { color: #475569; font-size: 12px; font-weight: 600; text-align: right; }
  .print-meta p, .report-hours p, .report-heading p, .print-summary p { margin-bottom: 3px; }
  .print-summary { border: 1px solid #cbd5e1; display: grid; gap: 8px; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 18px; padding: 12px; }
  .print-summary p { color: #475569; font-size: 12px; font-weight: 700; }
  .print-summary strong { font-size: 20px; }
  .print-reports { display: grid; gap: 14px; }
  .print-report { border: 1px solid #cbd5e1; break-inside: avoid; padding: 14px; }
  .report-grid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 12px; }
  .report-field { border-top: 1px solid #e2e8f0; padding-top: 7px; }
  .report-field strong { display: block; font-size: 12px; margin-bottom: 3px; text-transform: uppercase; }
  .report-field p {
    font-size: 13px;
    line-height: 2;
    margin-bottom: 0;
    unicode-bidi: plaintext;
    white-space: pre-wrap;
  }
  .rating-stars { align-items: center; color: #b45309; display: flex; gap: 3px; font-size: 13px; font-weight: 700; }
  .rating-stars svg { height: 15px; width: 15px; }
  .filled-star { fill: currentColor; }
  .muted { color: #64748b; font-size: 13px; font-weight: 600; }
  .print-footer { border-top: 1px solid #cbd5e1; color: #475569; font-size: 12px; font-weight: 700; margin-top: 18px; padding-top: 10px; text-align: center; }
  @page { margin: 14mm; size: A4; }
  @media print {
    body { background: #fff !important; }
    aside, header.sticky, .print-control, .print-toolbar { display: none !important; }
    main { margin: 0 !important; padding: 0 !important; }
    .print-sheet { max-width: none; }
    .print-report { border-color: #94a3b8; }
  }
  @media (max-width: 720px) {
    .print-header, .report-heading { display: grid; }
    .print-meta, .report-hours { text-align: left; }
    .print-summary, .report-grid { grid-template-columns: 1fr; }
  }
`;
