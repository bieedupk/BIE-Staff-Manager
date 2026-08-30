import { Star } from "lucide-react";
import { submitDailyReport } from "@/app/actions/reports";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireEmployeeProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DailyReport } from "@/lib/types";
import { formatDate, todayISO } from "@/lib/utils";

export default async function EmployeeDailyReportPage({
  searchParams
}: {
  searchParams?: Promise<{
    daily_report_success?: string;
    daily_report_error?: string;
  }>;
}) {
  const profile = await requireEmployeeProfile();
  const supabase = await createClient();
  const [resolvedSearchParams, { data }] = await Promise.all([
    searchParams,
    supabase
      .from("daily_reports")
      .select("*")
      .eq("employee_id", profile.id)
      .order("report_date", { ascending: false })
      .limit(10)
  ]);
  const reports = (data ?? []) as DailyReport[];

  return (
    <>
      <PageHeader
        title="Daily Report"
        subtitle="Submit your daily work summary, completed tasks, pending work, challenges, and tomorrow plan."
        backHref="/employee/dashboard"
      />
      <DailyReportMessage success={resolvedSearchParams?.daily_report_success} error={resolvedSearchParams?.daily_report_error} />
      <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
        <h2 className="font-extrabold text-slate-950">Submit Report</h2>
        <form action={submitDailyReport} className="mt-4 grid gap-3 md:grid-cols-2">
          <Input name="report_date" label="Report date" type="date" defaultValue={todayISO()} required />
          <CalculatedHours />
          <Textarea name="work_summary" label="Work summary" required />
          <Textarea name="tasks_completed" label="Tasks completed" required />
          <Textarea name="pending_work" label="Pending work" required />
          <Textarea name="challenges" label="Challenges" />
          <Textarea name="tomorrow_plan" label="Tomorrow plan" />
          <div className="md:col-span-2">
            <button className="min-h-11 rounded-lg bg-bie-700 px-4 font-extrabold text-white">Submit report</button>
          </div>
        </form>
      </section>

      <section className="mt-5 rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
        <h2 className="font-extrabold text-slate-950">Recent Reports</h2>
        <div className="mt-4 grid gap-3">
          {reports.length ? (
            reports.map((report) => (
              <article key={report.id} className="rounded-lg border border-slate-200 p-3">
                <h3 className="font-extrabold text-slate-950">{formatDate(report.report_date)}</h3>
                <p className="mt-2 text-sm font-medium text-slate-500">Hours: {report.hours_worked}</p>
                <details className="group mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                  <summary className="cursor-pointer list-none font-extrabold text-bie-700">
                    <span className="group-open:hidden">View Details</span>
                    <span className="hidden group-open:inline">Hide Details</span>
                  </summary>
                  <div className="mt-3 grid gap-2">
                    <ReportText label="Work summary" value={report.work_summary} />
                    <ReportText label="Tasks completed" value={report.tasks_completed} />
                    <ReportText label="Pending work" value={report.pending_work} />
                    <ReportText label="Challenges / issues" value={report.challenges || "None"} />
                    <ReportText label="Tomorrow plan" value={report.tomorrow_plan || "-"} />
                    <ReportText label="Attendance hours" value={`${report.hours_worked} hrs`} />
                  </div>
                  <div className="mt-3 rounded-lg bg-white p-3">
                    {isDailyReportReviewLocked(report) ? (
                      <>
                        <p className="font-extrabold text-slate-950">Reviewed</p>
                        <RatingStars rating={report.review_rating} />
                        <ReportText label="Review comment" value={report.review_comment || "-"} />
                      </>
                    ) : (
                      <p className="font-bold text-slate-500">Pending Review</p>
                    )}
                  </div>
                </details>
              </article>
            ))
          ) : (
            <EmptyState message="No daily reports submitted yet." />
          )}
        </div>
      </section>
    </>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  const { label, ...inputProps } = props;
  return (
    <label className="grid gap-1 text-sm font-bold text-slate-700">
      {label}
      <input {...inputProps} className="min-h-11 rounded-lg border border-slate-300 px-3" />
    </label>
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; name: string }) {
  const { label, ...textareaProps } = props;
  return (
    <label className="grid gap-1 text-sm font-bold text-slate-700 md:col-span-2">
      {label}
      <textarea {...textareaProps} className="rounded-lg border border-slate-300 px-3 py-2" dir="auto" />
    </label>
  );
}

function CalculatedHours() {
  return (
    <div className="grid gap-1 text-sm font-bold text-slate-700">
      Hours worked
      <div className="flex min-h-11 items-center rounded-lg border border-slate-300 bg-slate-50 px-3 font-semibold text-slate-600">
        Calculated from attendance after checkout
      </div>
    </div>
  );
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
  if (!rating) return <p className="mt-2 font-semibold text-slate-500">No rating recorded.</p>;

  return (
    <div className="mt-2 flex items-center gap-1 text-amber-600" aria-label={`${rating} of 5 stars`}>
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

function isDailyReportReviewLocked(report: DailyReport) {
  return report.review_status === "reviewed" || report.reviewed_at !== null || report.review_rating !== null;
}

function DailyReportMessage({ success, error }: { success?: string; error?: string }) {
  if (success) {
    return (
      <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
        {success}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
        {error}
      </div>
    );
  }

  return null;
}
