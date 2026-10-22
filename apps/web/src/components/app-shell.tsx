"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell, BriefcaseBusiness, CheckCircle2, ChevronDown, CircleAlert, Compass, FileText,
  Gauge, LayoutDashboard, ListChecks, LogOut, Menu, MessagesSquare, Moon, Search,
  Settings, ShieldCheck, Sparkles, Sun, UserRound, X,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Logo } from "@/components/logo";
import { useAuth, useTheme } from "@/components/providers";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { Progress } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api";
import type { NotificationItem, Task } from "@/lib/types";
import { cn, formatDateTime, humanize, initials, relativeTime } from "@/lib/utils";

const NAV: { label: string; items: { href: string; label: string; icon: React.ElementType }[] }[] = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/discover", label: "Discover jobs", icon: Compass },
      { href: "/tracker", label: "Application tracker", icon: ListChecks },
      { href: "/interview-coach", label: "Interview coach", icon: MessagesSquare },
      { href: "/insights", label: "Career insights", icon: Gauge },
    ],
  },
  {
    label: "Career",
    items: [
      { href: "/profile", label: "Career profile", icon: UserRound },
      { href: "/master-cv", label: "Master CV", icon: FileText },
      { href: "/documents", label: "Documents", icon: BriefcaseBusiness },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/settings/ai", label: "AI provider", icon: Sparkles },
      { href: "/settings", label: "General", icon: Settings },
      { href: "/settings/privacy", label: "Privacy & data", icon: ShieldCheck },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const { resolved, toggle } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const [tasksOpen, setTasksOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const previousStatuses = React.useRef<Record<string, string>>({});

  React.useEffect(() => { setMobileOpen(false); }, [pathname]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!loading && !user) router.replace("/sign-in");
  }, [loading, user, router]);

  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api.get<Task[]>("/tasks?limit=10"),
    enabled: Boolean(user),
    refetchInterval: (query) => {
      const tasks = query.state.data ?? [];
      return tasks.some((task) => task.status === "queued" || task.status === "running") ? 2500 : 30_000;
    },
  });

  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ items: NotificationItem[]; unread: number }>("/notifications?limit=15"),
    enabled: Boolean(user),
    refetchInterval: 25_000,
  });

  // Announce genuine task transitions, not invented progress.
  React.useEffect(() => {
    const tasks = tasksQuery.data ?? [];
    for (const task of tasks) {
      const previous = previousStatuses.current[task.id];
      if (previous && previous !== task.status) {
        if (task.status === "completed") {
          toast({ title: "Background task completed", description: task.title, tone: "success" });
          void queryClient.invalidateQueries();
        } else if (task.status === "failed") {
          toast({ title: "Background task failed", description: task.error || task.title, tone: "error" });
        }
      }
      previousStatuses.current[task.id] = task.status;
    }
  }, [tasksQuery.data, toast, queryClient]);

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--brand)] border-t-transparent" aria-hidden="true" />
          Loading your workspace…
        </div>
      </div>
    );
  }

  if (!user) return null;

  const activeTasks = (tasksQuery.data ?? []).filter(
    (task) => task.status === "queued" || task.status === "running");
  const unread = notificationsQuery.data?.unread ?? 0;

  return (
    <div className="min-h-dvh bg-[var(--bg)]">
      <a href="#main" className="skip-link">Skip to content</a>

      {/* Sidebar */}
      <aside id="sidebar"
             aria-label="Primary"
             className={cn(
               "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r bg-[var(--surface)] transition-transform lg:translate-x-0",
               mobileOpen ? "translate-x-0" : "-translate-x-full"
             )}>
        <div className="flex h-16 items-center justify-between border-b px-5">
          <Link href="/dashboard" aria-label="CareerPilot AI dashboard">
            <Logo />
          </Link>
          <button type="button" onClick={() => setMobileOpen(false)}
                  className="rounded-md p-1 text-[var(--muted)] lg:hidden" aria-label="Close navigation">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link href={item.href} aria-current={active ? "page" : undefined}
                            className={cn(
                              "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                              active
                                ? "bg-[var(--surface-2)] font-medium text-[var(--fg)]"
                                : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
                            )}>
                        <span className={cn("grid h-6 w-6 place-items-center rounded-md",
                          active ? "bg-[var(--brand)] text-[#061007]" : "bg-[var(--surface-2)]")}>
                          <item.icon className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {!user.onboarding_completed ? (
          <div className="mx-3 mb-3 rounded-xl border border-[var(--brand)]/30 bg-[var(--surface-2)] p-3">
            <p className="text-xs font-semibold">Finish onboarding</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Complete your profile to unlock accurate matching.
            </p>
            <Link href="/onboarding">
              <Button size="sm" className="mt-2 w-full">Continue setup</Button>
            </Link>
          </div>
        ) : null}

        <div className="border-t p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span aria-hidden="true"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-xs font-bold text-[#061007]">
              {initials(user.display_name || user.email, user.email)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.display_name || "Your account"}</p>
              <p className="truncate text-xs text-[var(--muted)]">{user.email}</p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Sign out" onClick={async () => {
              await logout();
              router.push("/");
            }}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          {!user.email_verified ? (
            <Link href="/settings" className="mt-1 inline-flex items-center gap-1 px-2 text-[11px] text-[var(--warning)]">
              <CircleAlert className="h-3 w-3" aria-hidden="true" /> Email not verified
            </Link>
          ) : null}
        </div>
      </aside>

      {mobileOpen ? (
        <button type="button" aria-label="Close navigation overlay"
                className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />
      ) : null}

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-[var(--surface)]/95 px-4 backdrop-blur lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation"
                  onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>

          <button type="button" onClick={() => setSearchOpen(true)}
                  className="flex h-9 flex-1 max-w-md items-center gap-2 rounded-lg border bg-[var(--bg)] px-3 text-left text-sm text-[var(--muted)] hover:border-[var(--border-strong)]"
                  aria-label="Search jobs, documents and applications">
            <Search className="h-4 w-4" aria-hidden="true" />
            Search workspace…
            <kbd className="ml-auto hidden rounded border px-1.5 py-0.5 text-[10px] font-mono sm:block">⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Open background tasks"
                    onClick={() => setTasksOpen(true)} className="relative">
              {activeTasks.length ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--brand)] border-t-transparent" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              )}
              {activeTasks.length ? (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--brand)] px-1 text-[10px] font-bold text-[#061007]">
                  {activeTasks.length}
                </span>
              ) : null}
            </Button>

            <Button variant="ghost" size="icon" aria-label={`Theme: ${resolved}. Switch theme`}
                    onClick={toggle}>
              {resolved === "dark" ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
            </Button>

            <div className="relative">
              <Button variant="ghost" size="icon" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                      aria-expanded={notificationsOpen}
                      onClick={() => { setNotificationsOpen((value) => !value); setMenuOpen(false); }}>
                <Bell className="h-5 w-5" aria-hidden="true" />
                {unread ? (
                  <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </Button>
              {notificationsOpen ? (
                <Popover onClose={() => setNotificationsOpen(false)} label="Notifications" width="w-80">
                  <div className="flex items-center justify-between border-b p-3">
                    <p className="text-sm font-semibold">Notifications</p>
                    <button type="button" className="cp-link text-xs"
                            onClick={async () => {
                              await api.post("/notifications/read-all");
                              await queryClient.invalidateQueries({ queryKey: ["notifications"] });
                            }}>
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {(notificationsQuery.data?.items ?? []).length ? (
                      notificationsQuery.data?.items.map((item) => (
                        <Link key={item.id} href={item.link || "/dashboard"}
                              onClick={async () => {
                                setNotificationsOpen(false);
                                if (!item.read_at) {
                                  await api.post(`/notifications/${item.id}/read`);
                                  await queryClient.invalidateQueries({ queryKey: ["notifications"] });
                                }
                              }}
                              className="block border-b p-3 last:border-0 hover:bg-[var(--surface-2)]">
                          <p className={cn("text-xs", !item.read_at && "font-semibold")}>{item.title}</p>
                          {item.body ? <p className="mt-0.5 text-xs text-[var(--muted)]">{item.body}</p> : null}
                          <p className="mt-1 text-[10px] text-[var(--muted)]">{relativeTime(item.created_at)}</p>
                        </Link>
                      ))
                    ) : (
                      <p className="p-4 text-sm text-[var(--muted)]">No notifications yet.</p>
                    )}
                  </div>
                </Popover>
              ) : null}
            </div>

            <div className="relative">
              <button type="button" onClick={() => { setMenuOpen((value) => !value); setNotificationsOpen(false); }}
                      aria-expanded={menuOpen} aria-haspopup="menu"
                      className="ml-1 flex items-center gap-1.5 rounded-full border p-1 pr-2 text-sm">
                <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-[var(--brand)] text-[11px] font-bold text-[#061007]">
                  {initials(user.display_name || user.email, user.email)}
                </span>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">Account menu</span>
              </button>
              {menuOpen ? (
                <Popover onClose={() => setMenuOpen(false)} label="Account" width="w-56">
                  <div className="border-b p-3">
                    <p className="truncate text-sm font-semibold">{user.display_name || "Your account"}</p>
                    <p className="truncate text-xs text-[var(--muted)]">{user.email}</p>
                  </div>
                  <div className="p-1" role="menu">
                    <Link href="/settings" role="menuitem" className="block rounded-md px-3 py-2 text-sm hover:bg-[var(--surface-2)]">General settings</Link>
                    <Link href="/settings/ai" role="menuitem" className="block rounded-md px-3 py-2 text-sm hover:bg-[var(--surface-2)]">AI provider</Link>
                    <Link href="/settings/privacy" role="menuitem" className="block rounded-md px-3 py-2 text-sm hover:bg-[var(--surface-2)]">Privacy &amp; data</Link>
                    <button type="button" role="menuitem"
                            className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
                            onClick={async () => { await logout(); router.push("/"); }}>
                      Sign out
                    </button>
                  </div>
                </Popover>
              ) : null}
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[92rem] px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>

      <TasksDialog open={tasksOpen} onClose={() => setTasksOpen(false)} tasks={tasksQuery.data ?? []}
                   onChanged={() => void queryClient.invalidateQueries({ queryKey: ["tasks"] })} />

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function Popover({ children, onClose, label, width }: {
  children: React.ReactNode; onClose: () => void; label: string; width: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div ref={ref} role="dialog" aria-label={label}
         className={cn("absolute right-0 top-12 z-50 overflow-hidden rounded-xl border bg-[var(--surface)] shadow-xl", width)}>
      {children}
    </div>
  );
}

function TasksDialog({ open, onClose, tasks, onChanged }: {
  open: boolean; onClose: () => void; tasks: Task[]; onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState("");
  const action = async (task: Task, kind: "cancel" | "retry") => {
    setBusy(task.id);
    try {
      await api.post(`/tasks/${task.id}/${kind}`);
      onChanged();
      toast({ title: kind === "cancel" ? "Cancellation requested" : "Task re-queued", tone: "success" });
    } catch (caught) {
      toast({ title: "Action failed", description: caught instanceof ApiError ? caught.message : undefined, tone: "error" });
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Background tasks" size="lg"
            description="Real task state from the server. Nothing here is simulated.">
      <div className="space-y-2">
        {tasks.length ? tasks.map((task) => (
          <div key={task.id} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{task.title}</p>
              <Badge tone={task.status === "completed" ? "success" : task.status === "failed" ? "danger"
                : task.status === "running" ? "info" : "neutral"}>
                {task.status}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {task.task_type.replace(/_/g, " ")} · queued {formatDateTime(task.queued_at)}
              {task.attempts ? ` · attempt ${task.attempts}/${task.max_attempts}` : ""}
            </p>
            {task.progress !== null && task.status === "running" ? (
              <div className="mt-2">
                <Progress value={task.progress} label={task.progress_note || "Working"} />
              </div>
            ) : null}
            {task.error ? <p className="mt-1 text-xs text-[var(--danger)]">{task.error}</p> : null}
            {(task.status === "queued" || task.status === "running") ? (
              <Button size="sm" variant="outline" className="mt-2" loading={busy === task.id}
                      onClick={() => void action(task, "cancel")}>Cancel</Button>
            ) : null}
            {task.status === "failed" || task.status === "cancelled" ? (
              <Button size="sm" variant="outline" className="mt-2" loading={busy === task.id}
                      onClick={() => void action(task, "retry")}>Retry</Button>
            ) : null}
          </div>
        )) : <p className="text-sm text-[var(--muted)]">No background tasks yet.</p>}
      </div>
    </Dialog>
  );
}

function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const query = useQuery({
    queryKey: ["search", q],
    queryFn: () => api.get<{
      jobs: { id: string; title: string; company: string }[];
      documents: { id: string; title: string; doc_type: string; status: string }[];
      applications: { id: string; company: string; role_title: string; status: string }[];
    }>(`/search?q=${encodeURIComponent(q)}`),
    enabled: open && q.trim().length >= 2,
  });

  return (
    <Dialog open={open} onClose={() => { setQ(""); onClose(); }} title="Search workspace"
            description="Find saved jobs, documents and applications.">
      <Input autoFocus value={q} onChange={(event) => setQ(event.target.value)}
             placeholder="Type at least 2 characters…" aria-label="Search query" />
      <div className="mt-3 space-y-3">
        {q.trim().length >= 2 && query.isLoading ? <p className="text-sm text-[var(--muted)]">Searching…</p> : null}
        {query.data?.jobs.length ? (
          <div>
            <p className="cp-label">Jobs</p>
            {query.data.jobs.map((job) => (
              <button key={job.id} type="button"
                      onClick={() => { router.push(`/jobs/${job.id}`); onClose(); setQ(""); }}
                      className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-2)]">
                {job.title} <span className="text-xs text-[var(--muted)]">· {job.company}</span>
              </button>
            ))}
          </div>
        ) : null}
        {query.data?.applications.length ? (
          <div>
            <p className="cp-label">Applications</p>
            {query.data.applications.map((application) => (
              <button key={application.id} type="button"
                      onClick={() => { router.push(`/tracker?application=${application.id}`); onClose(); setQ(""); }}
                      className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-2)]">
                {application.role_title} <span className="text-xs text-[var(--muted)]">· {application.company}</span>
              </button>
            ))}
          </div>
        ) : null}
        {query.data?.documents.length ? (
          <div>
            <p className="cp-label">Documents</p>
            {query.data.documents.map((document) => (
              <button key={document.id} type="button"
                      onClick={() => { router.push(`/documents/${document.id}`); onClose(); setQ(""); }}
                      className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-2)]">
                {document.title} <span className="text-xs text-[var(--muted)]">· {humanize(document.status)}</span>
              </button>
            ))}
          </div>
        ) : null}
        {q.trim().length >= 2 && !query.isLoading && !query.data?.jobs.length
          && !query.data?.applications.length && !query.data?.documents.length ? (
          <p className="text-sm text-[var(--muted)]">No matches in your workspace.</p>
        ) : null}
      </div>
    </Dialog>
  );
}
