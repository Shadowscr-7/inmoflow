"use client";

import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { api, Notification as ApiNotification } from "@/lib/api";
import {
  LayoutDashboard,
  Users,
  Kanban,
  Activity,
  Radio,
  FileText,
  Zap,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Building2,
  Bell,
  GitBranch,
  Globe,
  UserCircle,
  Bot,
  Sun,
  Moon,
  CalendarDays,
  Upload,
  BarChart3,
  RefreshCcw,
  Tag,
  Settings2,
  Trophy,
  Wallet,
  Clock,
  Store,
  MessageSquare,
} from "lucide-react";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { Spinner } from "@/components/ui/spinner";

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  /** Restrict visibility to these roles. If omitted, visible to all. */
  roles?: string[];
  /** If set, only show for these plans (STARTER, PROFESSIONAL, CUSTOM). ADMIN always sees all. */
  minPlan?: "PROFESSIONAL" | "CUSTOM";
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Leads", href: "/dashboard/leads", icon: Users, roles: ["ADMIN", "BUSINESS", "AGENT"] },
  { label: "Embudo", href: "/dashboard/pipeline", icon: Kanban, roles: ["ADMIN", "BUSINESS", "AGENT"] },
  { label: "Propiedades", href: "/dashboard/properties", icon: Building2, roles: ["ADMIN", "BUSINESS", "AGENT"] },
  { label: "Visitas", href: "/dashboard/visits", icon: CalendarDays, roles: ["ADMIN", "BUSINESS", "AGENT"] },
  { label: "Actividad", href: "/dashboard/activity", icon: Activity },
  { label: "Seguimientos", href: "/dashboard/follow-ups", icon: RefreshCcw, roles: ["ADMIN", "BUSINESS"] },
  { label: "Tags", href: "/dashboard/tags", icon: Tag, roles: ["ADMIN", "BUSINESS"] },
  { label: "Campos custom", href: "/dashboard/custom-fields", icon: Settings2, roles: ["ADMIN", "BUSINESS"] },
  { label: "Etapas embudo", href: "/dashboard/stages", icon: GitBranch, roles: ["ADMIN", "BUSINESS"] },
  { label: "Fuentes", href: "/dashboard/lead-sources", icon: Globe, roles: ["ADMIN", "BUSINESS"] },
  { label: "Canales", href: "/dashboard/channels", icon: Radio, roles: ["ADMIN", "BUSINESS", "AGENT"] },
  { label: "Plantillas", href: "/dashboard/templates", icon: FileText, roles: ["ADMIN", "BUSINESS", "AGENT"] },
  { label: "Automatizaciones", href: "/dashboard/rules", icon: Zap, roles: ["ADMIN", "BUSINESS", "AGENT"] },
  { label: "Cola pendiente", href: "/dashboard/queued-actions", icon: Clock, roles: ["ADMIN", "BUSINESS"] },
  { label: "Importar", href: "/dashboard/import", icon: Upload, roles: ["ADMIN", "BUSINESS"] },
  { label: "Reportes", href: "/dashboard/reports", icon: BarChart3, roles: ["ADMIN", "BUSINESS"] },
  { label: "Mensajes", href: "/dashboard/messages", icon: MessageSquare, roles: ["ADMIN", "BUSINESS"] },
  { label: "Rendimiento", href: "/dashboard/agent-performance", icon: Trophy, roles: ["ADMIN", "BUSINESS"] },
  { label: "Comisiones", href: "/dashboard/commissions", icon: Wallet, roles: ["ADMIN", "BUSINESS", "AGENT"] },
  { label: "Agente IA", href: "/dashboard/ai-agent", icon: Bot, roles: ["ADMIN", "BUSINESS"], minPlan: "PROFESSIONAL" },
  { label: "MercadoLibre", href: "/dashboard/mercadolibre", icon: Store, roles: ["ADMIN", "BUSINESS"] },
  { label: "Usuarios", href: "/dashboard/settings", icon: Settings, roles: ["ADMIN", "BUSINESS"] },
  { label: "Mi perfil", href: "/dashboard/profile", icon: UserCircle },
];

const PLAN_RANK: Record<string, number> = {
  STARTER: 1,
  PROFESSIONAL: 2,
  CUSTOM: 3,
};

function getBreadcrumb(pathname: string): string {
  const item = NAV_ITEMS.find(
    (i) => pathname === i.href || (i.href !== "/dashboard" && pathname.startsWith(i.href))
  );
  return item?.label ?? "Dashboard";
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { token, user, isLoading, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [tenantPlan, setTenantPlan] = useState<string>("CUSTOM"); // default to show everything until loaded

  // Fetch tenant plan
  useEffect(() => {
    if (!token || !user) return;
    if (user.role === "ADMIN") {
      setTenantPlan("CUSTOM"); // ADMIN sees everything
      return;
    }
    api.getPlanLimits(token)
      .then((res) => setTenantPlan(res.plan))
      .catch(() => { /* plan info non-critical */ });
  }, [token, user]);

  // Filter nav items by role AND plan
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    // Role check
    if (item.roles && !item.roles.includes(user?.role ?? "")) return false;
    // Plan check (ADMIN bypasses)
    if (item.minPlan && user?.role !== "ADMIN") {
      const required = PLAN_RANK[item.minPlan] ?? 0;
      const current = PLAN_RANK[tenantPlan] ?? 0;
      if (current < required) return false;
    }
    return true;
  });

  // Fetch notifications
  const loadNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.getNotifications(token, { limit: "20" });
      setNotifications(res.data);
      setUnreadCount(res.unread);
    } catch {
      // Silently fail
    }
  }, [token]);

  // Poll every 30 seconds
  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30_000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markRead = async (id: string) => {
    if (!token) return;
    try {
      await api.markNotificationRead(token, id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  };

  const markAllRead = async () => {
    if (!token) return;
    try {
      await api.markAllNotificationsRead(token);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {}
  };

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [user, isLoading, router]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-sm text-gray-400">Cargando InmoFlow...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const initials = (user.name ?? user.email ?? "U")
    .split(" ")
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="flex min-h-screen">
          {/* Mobile overlay */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden animate-fade-in"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Sidebar */}
          <aside
            className={`
              fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white flex flex-col
              transform transition-transform duration-300 ease-in-out
              lg:relative lg:translate-x-0
              ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
            `}
          >
            {/* Logo */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <Image src="/images/logo.png" alt="InmoFlow" width={140} height={36} className="h-8 w-auto" priority />
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 lg:hidden"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
              {visibleNavItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                      ${isActive
                        ? "bg-brand-600 text-white shadow-lg shadow-brand-600/20"
                        : "text-gray-400 hover:bg-gray-800 hover:text-white"
                      }
                    `}
                  >
                    <Icon className="w-[18px] h-[18px] shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Bottom: avatar + logout */}
            <div className="p-3 border-t border-gray-800">
              <div className="flex items-center gap-3 px-3 py-2 mb-1">
                <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">{user.name ?? user.email}</p>
                  <p className="text-xs text-gray-500 truncate">{user.role ?? "Administrador"}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
              >
                <LogOut className="w-[18px] h-[18px]" />
                Cerrar sesión
              </button>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Top bar */}
            <header className="sticky top-0 z-30 flex items-center gap-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200/60 dark:border-gray-700/60 px-4 sm:px-6 h-16">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Breadcrumb */}
              <div className="flex items-center gap-1.5 text-sm">
                <Image src="/images/logo.png" alt="InmoFlow" width={90} height={24} className="h-5 w-auto hidden sm:inline" />
                <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 hidden sm:inline" />
                <span className="font-medium text-gray-700 dark:text-gray-200">{getBreadcrumb(pathname)}</span>
              </div>

              <div className="flex-1" />

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              {/* Notification bell */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setShowNotifDropdown((v) => !v)}
                  className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  title="Notificaciones"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-red-500 rounded-full leading-none">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </button>

                {showNotifDropdown && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl z-50 overflow-hidden animate-fade-in">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notificaciones</h3>
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllRead}
                          className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                        >
                          Marcar todas como leídas
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-gray-400">
                          <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          Sin notificaciones
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <button
                            key={n.id}
                            onClick={() => {
                              if (!n.read) markRead(n.id);
                              if (n.entity === "lead" && n.entityId) {
                                router.push(`/dashboard/leads/${n.entityId}`);
                                setShowNotifDropdown(false);
                              }
                            }}
                            className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                              !n.read ? "bg-blue-50/40 dark:bg-blue-900/20" : ""
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              {!n.read && (
                                <span className="mt-1.5 w-2 h-2 rounded-full bg-brand-500 shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm ${!n.read ? "font-semibold text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300"}`}>
                                  {n.title}
                                </p>
                                {n.message && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
                                )}
                                <p className="text-[11px] text-gray-400 mt-1">
                                  {new Date(n.createdAt).toLocaleString("es-AR", {
                                    day: "2-digit",
                                    month: "short",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* User pill (desktop) */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <div className="w-6 h-6 rounded-full bg-brand-600 flex items-center justify-center text-[10px] font-bold text-white">
                  {initials}
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200 max-w-[120px] truncate">
                  {user.name ?? user.email}
                </span>
              </div>
            </header>

            {/* Page content */}
            <main className="flex-1 overflow-auto">
              <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto animate-fade-in">
                {children}
              </div>
            </main>
          </div>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
