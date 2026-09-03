"use client";

import React from "react";
import Link from "next/link";
import { CalendarCheck, UserCheck, UserX, Clock3, Timer, Gauge, BriefcaseBusiness, TrendingUp, TrendingDown, Minus, Download } from "lucide-react";
import { formatDurationMinutes, formatDate, formatTime, todayISOInTimezone } from "@/lib/utils";
import { ActivityBarsChart } from "./activity-bars-chart";
import { PunctualityLineChart } from "./punctuality-line-chart";
import { AttendanceRateCard } from "./attendance-rate-card";
import { ReportStatusPanel } from "./report-status-panel";
import { parseTimeToMinutes } from "@/lib/utils";
import type { ReportComparison, MetricComparison } from "@/lib/attendance-report";

type DashboardProps = {
  employeeId: string;
  type: string;
  timezone: string;
  resolvedParams: { date?: string; month?: string; year?: string };
  reportLabelMain: string;
  reportLabelSub: string;
  currentReport: any;
  previousReport: any;
  comparison: ReportComparison;
  trendData: any[];
  trendTitle: string;
  workingHoursData: any[];
  hoursTitle: string;
  checkInTrendData: any[];
  currentAvgMins: number;
  scheduledMins: number;
  yearlyMonthsData: any[];
  periodInfo: any;
};

export function ReportDashboard({
  employeeId,
  type,
  timezone,
  resolvedParams,
  reportLabelMain,
  reportLabelSub,
  currentReport,
  previousReport,
  comparison,
  trendData,
  trendTitle,
  workingHoursData,
  hoursTitle,
  checkInTrendData,
  currentAvgMins,
  scheduledMins,
  yearlyMonthsData,
  periodInfo,
}: DashboardProps) {
  const animationKey = `${type}-${resolvedParams.date || resolvedParams.month || resolvedParams.year || "default"}`;

  const activityData: any[] = [];
  const punctualityData: any[] = [];

  if (type === "yearly") {
    // 12 months guarantee
    const yearStr = periodInfo.current.from.substring(0, 4);
    for (let m = 1; m <= 12; m++) {
      const monthStr = m.toString().padStart(2, "0");
      const mDateStr = `${yearStr}-${monthStr}-01`;
      const label = new Date(`${mDateStr}T00:00:00Z`).toLocaleString('en', { month: 'short' });
      
      const existing = yearlyMonthsData.find(d => d.month === label);
      if (existing) {
        activityData.push({
          label: existing.month.substring(0, 3),
          worked: existing.report.totals.totalWorkingMinutes,
          scheduled: existing.report.totals.eligibleDays * scheduledMins,
          overtime: existing.report.totals.totalOvertimeMinutes,
          dateStr: existing.month,
          isAbsent: false,
          isPresent: false,
          isLate: false,
          isHalfDay: false,
          isPending: false
        });
      } else {
        activityData.push({
          label: label,
          worked: 0,
          scheduled: 0,
          overtime: 0,
          dateStr: label,
          isAbsent: false,
          isPresent: false,
          isLate: false,
          isHalfDay: false,
          isPending: true // Future months are pending
        });
      }
    }
  } else {
    // Weekly or Monthly: generate all days between from and fullEnd
    const startDate = new Date(`${periodInfo.current.from}T00:00:00Z`);
    const endDate = new Date(`${periodInfo.current.fullEnd}T00:00:00Z`);
    
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateIso = currentDate.toISOString().split("T")[0];
      const existing = currentReport.daily.find((d: any) => d.date === dateIso);
      
      const label = type === "monthly" 
        ? parseInt(dateIso.substring(8), 10).toString() 
        : new Date(`${dateIso}T00:00:00Z`).toLocaleDateString('en', { weekday: 'short' });

      if (existing) {
        activityData.push({
          label,
          worked: existing.workedMinutes,
          scheduled: existing.isPending ? 0 : scheduledMins,
          overtime: existing.overtimeMinutes,
          dateStr: formatDate(existing.date),
          isAbsent: existing.isAbsent || false,
          isPresent: existing.isPresent || false,
          isLate: existing.isLate || false,
          isHalfDay: existing.isHalfDay || false,
          isPending: existing.isPending || false
        });
        
        punctualityData.push({
          label,
          actualMinutes: existing.checkIn ? parseTimeToMinutes(formatTime(existing.checkIn, timezone)) : null,
          scheduledMinutes: 8 * 60 + 30,
          actualTimeStr: existing.checkIn ? formatTime(existing.checkIn, timezone) : null,
          scheduledTimeStr: "08:30 AM",
          isLate: existing.isLate || false,
          isAbsent: existing.isAbsent || false,
          isPresent: existing.isPresent || false,
          isPending: existing.isPending || false,
          dateStr: formatDate(existing.date)
        });
      } else {
        activityData.push({
          label,
          worked: 0,
          scheduled: 0,
          overtime: 0,
          dateStr: formatDate(dateIso),
          isAbsent: false,
          isPresent: false,
          isLate: false,
          isHalfDay: false,
          isPending: true
        });
        
        punctualityData.push({
          label,
          actualMinutes: null,
          scheduledMinutes: 8 * 60 + 30,
          actualTimeStr: null,
          scheduledTimeStr: "08:30 AM",
          isLate: false,
          isAbsent: false,
          isPresent: false,
          isPending: true,
          dateStr: formatDate(dateIso)
        });
      }
      
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }
  }

  return (
    <div className="grid gap-5">
      {/* Report Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1">
          <Link
            href={`/admin/employees/${employeeId}/reports?type=weekly`}
            className={`px-4 py-1.5 text-sm font-semibold rounded ${type === "weekly" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            Weekly
          </Link>
          <Link
            href={`/admin/employees/${employeeId}/reports?type=monthly`}
            className={`px-4 py-1.5 text-sm font-semibold rounded ${type === "monthly" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            Monthly
          </Link>
          <Link
            href={`/admin/employees/${employeeId}/reports?type=yearly`}
            className={`px-4 py-1.5 text-sm font-semibold rounded ${type === "yearly" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
          >
            Yearly
          </Link>
        </div>

        <div className="flex flex-col sm:items-end gap-2">
          <form className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="type" value={type} />
            {type === "weekly" && (
              <input 
                type="date" 
                name="date" 
                defaultValue={resolvedParams.date || todayISOInTimezone(timezone)} 
                className="rounded-md border border-slate-300 px-3 py-1 text-sm bg-slate-50 text-slate-900"
                max={todayISOInTimezone(timezone)}
              />
            )}
            {type === "monthly" && (
              <input 
                type="month" 
                name="month" 
                defaultValue={resolvedParams.month || todayISOInTimezone(timezone).substring(0, 7)} 
                className="rounded-md border border-slate-300 px-3 py-1 text-sm bg-slate-50 text-slate-900"
                max={todayISOInTimezone(timezone).substring(0, 7)}
              />
            )}
            {type === "yearly" && (
              <input 
                type="number" 
                name="year" 
                min="2020" 
                max={todayISOInTimezone(timezone).substring(0, 4)} 
                defaultValue={resolvedParams.year || todayISOInTimezone(timezone).substring(0, 4)} 
                className="rounded-md border border-slate-300 px-3 py-1 text-sm w-24 bg-slate-50 text-slate-900"
              />
            )}
            <button type="submit" className="rounded-md bg-bie-700 px-4 py-1 text-sm font-semibold text-white transition hover:bg-bie-800">
              Go
            </button>
            <a
              href={`/api/admin/employees/${employeeId}/reports/pdf?type=${type}${resolvedParams.date ? `&date=${resolvedParams.date}` : ''}${resolvedParams.month ? `&month=${resolvedParams.month}` : ''}${resolvedParams.year ? `&year=${resolvedParams.year}` : ''}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              <Download className="h-4 w-4" /> Download PDF
            </a>
          </form>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-900">{reportLabelMain}</p>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{reportLabelSub}</p>
          </div>
        </div>
      </div>

      <div key={animationKey} className="contents">
        <div className="mb-2 mt-4 motion-safe:animate-fade-up" style={{ animationDelay: '0ms' }}>
          <h2 className="text-xl font-extrabold text-slate-900">{type === "weekly" ? "Weekly" : type === "monthly" ? "Monthly" : "Yearly"} Attendance Report</h2>
        </div>

        {/* Metric Cards - 8 KPIs */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="motion-safe:animate-fade-up opacity-0" style={{ animationDelay: '50ms' }}>
            <MetricCard 
              icon={TrendingUp}
              label="Attendance Rate" 
              value={`${Math.round(currentReport.ratios.attendanceRate)}%`} 
              comparison={comparison.attendanceRate}
              format="percentage"
              accent="emerald"
              sparkData={trendData.map(d => d.value)}
            />
          </div>
          <div className="motion-safe:animate-fade-up opacity-0" style={{ animationDelay: '100ms' }}>
            <MetricCard 
              icon={UserCheck}
              label="Present Days" 
              value={currentReport.totals.presentDays} 
              rawMetricComparison={{...comparison.absentDays, delta: currentReport.totals.presentDays - previousReport.totals.presentDays, direction: (currentReport.totals.presentDays - previousReport.totals.presentDays > 0) ? "improved" : (currentReport.totals.presentDays - previousReport.totals.presentDays < 0 ? "declined" : "unchanged"), current: currentReport.totals.presentDays, previous: previousReport.totals.presentDays}}
              accent="emerald"
            />
          </div>
          <div className="motion-safe:animate-fade-up opacity-0" style={{ animationDelay: '150ms' }}>
            <MetricCard 
              icon={UserX}
              label="Absent Days" 
              value={currentReport.totals.absentDays} 
              rawMetricComparison={comparison.absentDays}
              accent="red"
            />
          </div>
          <div className="motion-safe:animate-fade-up opacity-0" style={{ animationDelay: '200ms' }}>
            <MetricCard 
              icon={Timer}
              label="Late Arrivals" 
              value={currentReport.totals.lateDays} 
              rawMetricComparison={comparison.lateDays}
              accent="amber"
            />
          </div>
          <div className="motion-safe:animate-fade-up opacity-0" style={{ animationDelay: '250ms' }}>
            <MetricCard 
              icon={CalendarCheck}
              label="Half Days" 
              value={currentReport.totals.halfDays} 
              rawMetricComparison={comparison.halfDays}
              accent="orange"
            />
          </div>
          <div className="motion-safe:animate-fade-up opacity-0" style={{ animationDelay: '300ms' }}>
            <MetricCard 
              icon={Gauge}
              label="Punctuality" 
              value={`${Math.round(currentReport.ratios.punctualityRate)}%`} 
              rawMetricComparison={comparison.punctualityRate}
              format="percentage"
              accent="emerald"
            />
          </div>
          <div className="motion-safe:animate-fade-up opacity-0" style={{ animationDelay: '350ms' }}>
            <MetricCard 
              icon={BriefcaseBusiness}
              label="Working Hours" 
              value={formatDurationMinutes(currentAvgMins)} 
              comparisonText="Avg per day"
              accent="blue"
              sparkData={workingHoursData.map(d => Math.min(100, (d.value / Math.max(scheduledMins, 1)) * 100))}
            />
          </div>
          <div className="motion-safe:animate-fade-up opacity-0" style={{ animationDelay: '400ms' }}>
            <MetricCard 
              icon={Clock3}
              label="Overtime" 
              value={formatDurationMinutes(currentReport.totals.totalOvertimeMinutes)} 
              rawMetricComparison={comparison.overtimeMinutes}
              format="minutes"
              accent="slate"
            />
          </div>
        </section>

        {/* Charts & Summaries */}
        <div className="grid gap-5 lg:grid-cols-[2fr_1fr] motion-safe:animate-fade-up opacity-0" style={{ animationDelay: '450ms' }}>
          {/* Primary Graph */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <ActivityBarsChart data={activityData} title={type === 'weekly' ? 'Weekly Attendance Activity' : type === 'monthly' ? 'Monthly Attendance Activity' : 'Yearly Attendance Activity'} animationKey={animationKey} />
          </div>

          {/* Radial Gauge */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <AttendanceRateCard 
              rate={currentReport.ratios.attendanceRate} 
              comparison={comparison.attendanceRate}
              label={type === 'yearly' ? 'YTD Attendance' : type === 'monthly' ? 'MTD Attendance' : 'Weekly Attendance'}
              animationKey={animationKey}
            />
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2 motion-safe:animate-fade-up opacity-0" style={{ animationDelay: '500ms' }}>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <ReportStatusPanel 
              present={currentReport.totals.presentDays}
              late={currentReport.totals.lateDays}
              halfDay={currentReport.totals.halfDays}
              absent={currentReport.totals.absentDays}
              eligible={currentReport.totals.eligibleDays}
              animationKey={animationKey}
            />
          </div>
          
          {type !== "yearly" && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <PunctualityLineChart data={punctualityData} title="Check-in & Punctuality" animationKey={animationKey} />
            </div>
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-2 motion-safe:animate-fade-up opacity-0" style={{ animationDelay: '550ms' }}>
          {/* Attendance Insights */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h3 className="mb-4 text-sm font-bold text-slate-700">Attendance Insights</h3>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm text-slate-700">
              <InsightItem 
                metric="Attendance" 
                comparison={comparison.attendanceRate} 
                format="percentage_points" 
              />
              <InsightItem 
                metric="Late arrivals" 
                comparison={comparison.lateDays} 
                format="count" 
              />
              <InsightItem 
                metric="Punctuality" 
                comparison={comparison.punctualityRate} 
                format="percentage_points" 
              />
              <InsightItem 
                metric="Overtime" 
                comparison={comparison.overtimeMinutes} 
                format="minutes" 
              />
            </ul>
          </div>
        </div>

        {/* Detailed History */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm mt-4 motion-safe:animate-fade-up opacity-0" style={{ animationDelay: '600ms' }}>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">{type === "yearly" ? "Yearly Summary Table" : "Daily Attendance History"}</h2>
              <p className="text-xs text-slate-500">
                {type === "yearly" ? "Month-by-month attendance aggregations." : "Underlying daily records for the selected period."}
              </p>
            </div>
            <Link 
              href={`/admin/employees/${employeeId}/attendance?from=${periodInfo.current.from}&to=${periodInfo.current.to}`}
              className="text-sm font-bold text-bie-700 hover:underline"
            >
              View Full Attendance Tab
            </Link>
          </div>
          
          {type !== "yearly" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-xs font-extrabold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Check In</th>
                    <th className="px-5 py-3">Check Out</th>
                    <th className="px-5 py-3">Working Duration</th>
                    <th className="px-5 py-3">Overtime</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {currentReport.daily.map((row: any) => (
                    <tr key={row.date} className="transition hover:bg-slate-50">
                      <td className="px-5 py-3 font-semibold text-slate-900">{formatDate(row.date)}</td>
                      <td className="px-5 py-3 text-slate-600">
                        {row.isPending ? "-" : (row.checkIn ? formatTime(row.checkIn, timezone) : "-")}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {row.isPending ? "-" : (row.checkOut ? formatTime(row.checkOut, timezone) : "-")}
                      </td>
                      <td className="px-5 py-3 text-slate-700 font-medium">
                        {formatDurationMinutes(row.workedMinutes)}
                      </td>
                      <td className="px-5 py-3 text-slate-700 font-medium">
                        {formatDurationMinutes(row.overtimeMinutes)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {row.isPending && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Pending</span>}
                          {row.isPresent && <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Present</span>}
                          {row.isAbsent && <span className="rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">Absent</span>}
                          {row.isLate && <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Late</span>}
                          {row.isHalfDay && <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-800">Half Day</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {currentReport.daily.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-sm font-medium text-slate-500">
                        No attendance records found for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-xs font-extrabold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3">Month</th>
                    <th className="px-5 py-3">Eligible Days</th>
                    <th className="px-5 py-3 text-emerald-700">Present</th>
                    <th className="px-5 py-3 text-red-700">Absent</th>
                    <th className="px-5 py-3 text-amber-700">Late</th>
                    <th className="px-5 py-3 text-orange-700">Half Days</th>
                    <th className="px-5 py-3">Working Hours</th>
                    <th className="px-5 py-3">Overtime</th>
                    <th className="px-5 py-3">Att. Rate</th>
                    <th className="px-5 py-3">Punct. Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {yearlyMonthsData.map(({ month, report }) => (
                    <tr key={month} className="transition hover:bg-slate-50">
                      <td className="px-5 py-3 font-semibold text-slate-900">{month}</td>
                      <td className="px-5 py-3 text-slate-600">{report.totals.eligibleDays}</td>
                      <td className="px-5 py-3 text-slate-600">{report.totals.presentDays}</td>
                      <td className="px-5 py-3 text-slate-600">{report.totals.absentDays}</td>
                      <td className="px-5 py-3 text-slate-600">{report.totals.lateDays}</td>
                      <td className="px-5 py-3 text-slate-600">{report.totals.halfDays}</td>
                      <td className="px-5 py-3 text-slate-700 font-medium">
                        {formatDurationMinutes(report.totals.totalWorkingMinutes)}
                      </td>
                      <td className="px-5 py-3 text-slate-700 font-medium">
                        {formatDurationMinutes(report.totals.totalOvertimeMinutes)}
                      </td>
                      <td className="px-5 py-3 text-slate-900 font-bold">
                        {Math.round(report.ratios.attendanceRate)}%
                      </td>
                      <td className="px-5 py-3 text-slate-900 font-bold">
                        {Math.round(report.ratios.punctualityRate)}%
                      </td>
                    </tr>
                  ))}
                  {yearlyMonthsData.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-5 py-8 text-center text-sm font-medium text-slate-500">
                        No monthly data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InsightItem({ metric, comparison, format }: { metric: string; comparison: MetricComparison; format: "count" | "percentage_points" | "minutes" }) {
  if (comparison.direction === "unchanged" || comparison.delta === 0) {
    return (
      <li className="flex items-start gap-2">
        <span className="mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400"></span>
        <span>{metric} remained unchanged.</span>
      </li>
    );
  }

  const absDelta = Math.abs(comparison.delta);
  let valueStr = "";
  if (format === "percentage_points") {
    valueStr = `${Math.round(absDelta)} percentage points`;
  } else if (format === "minutes") {
    valueStr = `${Math.floor(absDelta / 60)} hours and ${absDelta % 60} minutes`;
  } else {
    valueStr = `${absDelta}`;
  }

  const isPositiveMetric = metric === "Attendance" || metric === "Punctuality";
  const increased = comparison.delta > 0;
  
  let verb = increased ? "increased" : "decreased";
  if (format === "percentage_points") {
    verb = (increased && isPositiveMetric) || (!increased && !isPositiveMetric) ? "improved" : "declined";
  }

  if (metric === "Overtime") {
    verb = increased ? "increased" : "decreased";
  } else if (!isPositiveMetric && format === "count") {
    if (increased) verb = "increased";
    if (!increased) verb = "decreased";
  }

  const color = comparison.direction === "improved" ? "bg-emerald-400" : comparison.direction === "declined" ? "bg-red-400" : "bg-slate-400";

  return (
    <li className="flex items-start gap-2">
      <span className={`mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full ${color}`}></span>
      <span>{metric} {verb} by {valueStr} compared with the previous comparable period.</span>
    </li>
  );
}

function MetricCard({ 
  icon: Icon,
  label, 
  value, 
  rawMetricComparison,
  comparison, 
  comparisonText,
  format = "number",
  accent = "slate",
  sparkData
}: { 
  icon: React.ElementType;
  label: string; 
  value: React.ReactNode; 
  rawMetricComparison?: MetricComparison;
  comparison?: MetricComparison | null;
  comparisonText?: string;
  format?: "number" | "percentage" | "minutes";
  accent?: "emerald" | "red" | "amber" | "orange" | "blue" | "slate";
  sparkData?: number[]; 
}) {
  const comp = rawMetricComparison || comparison;
  let indicator = null;
  
  if (comp && comp.direction !== "unchanged" && comp.delta !== 0) {
    let deltaDisplay = "";
    if (format === "percentage") {
      deltaDisplay = `${Math.abs(Math.round(comp.delta))}%`;
    } else if (format === "minutes") {
      deltaDisplay = formatDurationMinutes(Math.abs(comp.delta));
    } else {
      deltaDisplay = `${Math.abs(comp.delta)}`;
    }

    if (comp.direction === "improved") {
      indicator = (
        <div className="mt-1 flex items-center text-[10px] font-semibold text-emerald-600">
          <TrendingUp className="w-3 h-3 mr-1" /> {deltaDisplay} vs prev <span className="ml-1 rounded bg-emerald-100 px-1 py-0.5 text-[8px] uppercase tracking-wider text-emerald-700">Improved</span>
        </div>
      );
    } else if (comp.direction === "declined") {
      indicator = (
        <div className="mt-1 flex items-center text-[10px] font-semibold text-red-600">
          <TrendingDown className="w-3 h-3 mr-1" /> {deltaDisplay} vs prev <span className="ml-1 rounded bg-red-100 px-1 py-0.5 text-[8px] uppercase tracking-wider text-red-700">Declined</span>
        </div>
      );
    } else if (comp.direction === "neutral") {
      const sign = comp.delta > 0 ? "+" : "-";
      indicator = (
        <div className="mt-1 flex items-center text-[10px] font-semibold text-slate-500">
          {comp.delta > 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />} {sign}{deltaDisplay} vs prev
        </div>
      );
    }
  } else if (comp && (comp.direction === "unchanged" || comp.delta === 0)) {
    indicator = (
      <div className="mt-1 flex items-center text-[10px] font-semibold text-slate-400">
        <Minus className="w-3 h-3 mr-1" /> No change
      </div>
    );
  } else if (comparisonText) {
    indicator = (
      <div className="mt-1 flex items-center text-[10px] font-semibold text-slate-400">
        {comparisonText}
      </div>
    );
  }

  const iconColors = {
    emerald: "text-emerald-600 bg-emerald-100",
    red: "text-red-600 bg-red-100",
    amber: "text-amber-600 bg-amber-100",
    orange: "text-orange-600 bg-orange-100",
    blue: "text-blue-600 bg-blue-100",
    slate: "text-slate-600 bg-slate-100"
  };

  const sparkColors = {
    emerald: "bg-emerald-300",
    red: "bg-red-300",
    amber: "bg-amber-300",
    orange: "bg-orange-300",
    blue: "bg-blue-300",
    slate: "bg-slate-300"
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconColors[accent]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
            <p className="text-xl font-extrabold text-slate-900 leading-tight">{value}</p>
          </div>
        </div>
      </div>
      
      <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-2 h-6">
        <div>{indicator}</div>
        
        {sparkData && sparkData.length > 0 && (
          <div className="flex items-end gap-0.5 h-full opacity-80 w-16 justify-end">
            {sparkData.slice(-14).map((val, i) => (
              <div 
                key={i} 
                className={`w-1 rounded-t-[1px] ${sparkColors[accent]}`} 
                style={{ height: `${Math.max(10, Math.min(100, val))}%` }} 
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
