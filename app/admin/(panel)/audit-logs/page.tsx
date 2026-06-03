import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminManagerProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AuditLog } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export default async function AdminAuditLogsPage() {
  await requireAdminManagerProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("*, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  const logs = (data ?? []) as AuditLog[];

  return (
    <>
      <PageHeader title="Audit Logs" subtitle="Basic history of important admin and employee actions." backHref="/admin/dashboard" />
      <section className="grid gap-3">
        {logs.length ? (
          logs.map((log) => (
            <article key={log.id} className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-extrabold text-slate-950">{log.action}</h2>
                  <p className="text-sm font-medium text-slate-500">
                    {log.entity_type} - {log.profiles?.full_name || "System"}
                  </p>
                </div>
                <p className="text-sm font-bold text-slate-500">{formatDateTime(log.created_at)}</p>
              </div>
              {log.details ? <pre className="mt-3 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{JSON.stringify(log.details, null, 2)}</pre> : null}
            </article>
          ))
        ) : (
          <EmptyState message="No audit logs found." />
        )}
      </section>
    </>
  );
}
