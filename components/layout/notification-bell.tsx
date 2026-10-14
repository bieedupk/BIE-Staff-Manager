"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { PushAlertsControl } from "@/components/layout/push-alerts-control";
import { createClient } from "@/lib/supabase/client";

type Notification = {
  id: string;
  title: string;
  body: string;
  href: string;
  created_at: string;
  read_at: string | null;
};

export function NotificationBell({ profileId }: { profileId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [listResult, countResult] = await Promise.all([
      supabase.from("notifications")
        .select("id, title, body, href, created_at, read_at")
        .eq("recipient_id", profileId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", profileId)
        .is("read_at", null)
    ]);

    if (listResult.error || countResult.error) {
      setError("Notifications could not be loaded. Try again shortly.");
    } else {
      setItems((listResult.data ?? []) as Notification[]);
      setUnreadCount(countResult.count ?? 0);
      setError("");
    }
    setLoading(false);
  }, [profileId, supabase]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => { void refresh(); }, 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function markRead(id?: string) {
    const { error: updateError } = await supabase.rpc("mark_notifications_read", { p_id: id ?? null });
    if (updateError) {
      setError("Could not mark the notification as read.");
      return false;
    }
    await refresh();
    return true;
  }

  async function openItem(item: Notification) {
    if (!item.read_at) await markRead(item.id);
    setOpen(false);
    // Notification destinations are written by server-side event triggers.
    if (item.href.startsWith("/admin/") || item.href.startsWith("/employee/") || item.href === "/device-access") {
      router.push(item.href);
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        aria-controls="staff-notification-list"
        onClick={() => { setOpen((value) => !value); void refresh(); }}
        className="relative inline-flex size-11 items-center justify-center rounded-xl border border-emerald-200 bg-white text-slate-700 shadow-xs hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700"
      >
        <Bell size={20} aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="absolute -right-2 -top-2 flex min-w-6 items-center justify-center rounded-full bg-rose-600 px-1 text-xs font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div id="staff-notification-list" className="absolute right-0 top-14 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="font-bold text-slate-900">Notifications</h2>
              <p className="text-xs text-slate-500">{unreadCount} unread</p>
            </div>
            <button
              type="button"
              disabled={unreadCount === 0}
              onClick={() => void markRead()}
              className="inline-flex items-center gap-1 text-xs font-semibold text-bie-700 disabled:opacity-40"
            >
              <CheckCheck size={15} aria-hidden="true" /> Mark all read
            </button>
          </div>
          <PushAlertsControl profileId={profileId} />
          {error ? <p role="alert" className="px-4 py-2 text-sm text-rose-700">{error}</p> : null}
          <div className="max-h-96 overflow-y-auto">
            {loading ? <p className="px-4 py-6 text-sm text-slate-500">Loading…</p> : null}
            {!loading && items.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">No notifications yet.</p> : null}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void openItem(item)}
                className={`w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-emerald-50 ${item.read_at ? "" : "bg-emerald-50/60"}`}
              >
                <span className="block text-sm font-semibold text-slate-900">{item.title}</span>
                <span className="mt-1 block text-sm leading-5 text-slate-700">{item.body}</span>
                <span className="mt-1 block text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</span>
              </button>
            ))}
          </div>
          {items.length === 20 ? <p className="border-t px-4 py-2 text-xs text-slate-500">Showing 20 recent notifications.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
