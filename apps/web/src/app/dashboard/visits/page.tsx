"use client";

import { useAuth } from "@/lib/auth";
import { api, Visit, Property, Lead } from "@/lib/api";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Calendar, Plus, X, Clock, MapPin, User, ChevronLeft, ChevronRight,
  Edit2, Trash2, Check, XCircle, AlertTriangle, MessageSquare, CalendarDays,
  List, RefreshCw, Link2, Link2Off,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/errors";

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  CONFIRMED: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  COMPLETED: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  NO_SHOW: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
};
const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Programada", CONFIRMED: "Confirmada", COMPLETED: "Completada",
  CANCELLED: "Cancelada", NO_SHOW: "No asistió",
};
const STATUS_BG_SOLID: Record<string, string> = {
  SCHEDULED: "bg-blue-500", CONFIRMED: "bg-green-500",
  COMPLETED: "bg-gray-400", CANCELLED: "bg-red-400", NO_SHOW: "bg-yellow-400",
};
const STATUS_ICONS: Record<string, typeof Calendar> = {
  SCHEDULED: Clock, CONFIRMED: Check, COMPLETED: Check, CANCELLED: XCircle, NO_SHOW: AlertTriangle,
};

// Timeline: visible hours
const HOUR_START = 7;
const HOUR_END = 22;
const PX_PER_HOUR = 64;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function get4Weeks(date: Date): Date[] {
  const d = getMondayOf(date);
  return Array.from({ length: 28 }, (_, i) => {
    const dd = new Date(d);
    dd.setDate(d.getDate() + i);
    return dd;
  });
}

function getWeekDays(date: Date): Date[] {
  const d = getMondayOf(date);
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(d);
    dd.setDate(d.getDate() + i);
    return dd;
  });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(d: Date) {
  if (d.getDate() === 1) return d.toLocaleDateString("es", { day: "numeric", month: "short" });
  return d.toLocaleDateString("es", { day: "numeric" });
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Returns top offset (px) from HOUR_START for a given date */
function timeToTop(date: Date): number {
  const h = date.getHours() + date.getMinutes() / 60;
  return (h - HOUR_START) * PX_PER_HOUR;
}

/** Returns height (px) for a duration in minutes */
function durationToHeight(startStr: string, endStr: string | undefined | null): number {
  if (!endStr) return PX_PER_HOUR; // default 1h
  const ms = new Date(endStr).getTime() - new Date(startStr).getTime();
  const mins = ms / 60000;
  return Math.max((mins / 60) * PX_PER_HOUR, 20);
}

const COUNTRY_CODES = [
  { code: "+54", label: "🇦🇷 +54", country: "Argentina" },
  { code: "+591", label: "🇧🇴 +591", country: "Bolivia" },
  { code: "+55", label: "🇧🇷 +55", country: "Brasil" },
  { code: "+56", label: "🇨🇱 +56", country: "Chile" },
  { code: "+57", label: "🇨🇴 +57", country: "Colombia" },
  { code: "+506", label: "🇨🇷 +506", country: "Costa Rica" },
  { code: "+593", label: "🇪🇨 +593", country: "Ecuador" },
  { code: "+503", label: "🇸🇻 +503", country: "El Salvador" },
  { code: "+502", label: "🇬🇹 +502", country: "Guatemala" },
  { code: "+504", label: "🇭🇳 +504", country: "Honduras" },
  { code: "+52", label: "🇲🇽 +52", country: "México" },
  { code: "+505", label: "🇳🇮 +505", country: "Nicaragua" },
  { code: "+507", label: "🇵🇦 +507", country: "Panamá" },
  { code: "+595", label: "🇵🇾 +595", country: "Paraguay" },
  { code: "+51", label: "🇵🇪 +51", country: "Perú" },
  { code: "+1", label: "🇺🇸 +1", country: "USA/Canadá" },
  { code: "+598", label: "🇺🇾 +598", country: "Uruguay" },
  { code: "+58", label: "🇻🇪 +58", country: "Venezuela" },
  { code: "+34", label: "🇪🇸 +34", country: "España" },
];

// ─── View types ───────────────────────────────────────────────────────────────

type ViewType = "month" | "week" | "day" | "agenda";

// ─── Timeline Column ─────────────────────────────────────────────────────────

function TimelineColumn({
  day,
  visits,
  today,
  onClickVisit,
  onClickCreate,
}: {
  day: Date;
  visits: Visit[];
  today: Date;
  onClickVisit: (v: Visit) => void;
  onClickCreate: (day: Date, hour: number) => void;
}) {
  const isToday = isSameDay(day, today);
  const totalH = (HOUR_END - HOUR_START) * PX_PER_HOUR;

  // Sort by start time
  const sorted = [...visits].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="flex-1 relative" style={{ height: totalH }}>
      {/* Hour grid lines */}
      {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => (
        <div
          key={i}
          className="absolute w-full border-t border-gray-100 dark:border-gray-800"
          style={{ top: i * PX_PER_HOUR }}
        />
      ))}

      {/* Clickable hour slots */}
      {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
        <div
          key={i}
          className="absolute w-full hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 cursor-pointer transition-colors"
          style={{ top: i * PX_PER_HOUR, height: PX_PER_HOUR }}
          onClick={() => onClickCreate(day, HOUR_START + i)}
        />
      ))}

      {/* Today indicator */}
      {isToday && (() => {
        const now = new Date();
        const top = timeToTop(now);
        if (top < 0 || top > totalH) return null;
        return (
          <div
            className="absolute w-full z-20 flex items-center gap-1 pointer-events-none"
            style={{ top }}
          >
            <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
            <div className="flex-1 border-t-2 border-red-500" />
          </div>
        );
      })()}

      {/* Events */}
      {sorted.map((v) => {
        const start = new Date(v.date);
        const top = timeToTop(start);
        const height = durationToHeight(v.date, v.endDate);
        if (top < 0 || top > totalH) return null;
        const Icon = STATUS_ICONS[v.status] ?? Clock;
        const bgClass = STATUS_BG_SOLID[v.status] ?? "bg-indigo-500";
        return (
          <div
            key={v.id}
            onClick={(e) => { e.stopPropagation(); onClickVisit(v); }}
            className={`absolute left-1 right-1 z-10 rounded-md px-1.5 py-1 cursor-pointer text-white text-xs overflow-hidden shadow ${bgClass} hover:opacity-90 transition-opacity`}
            style={{ top: Math.max(top, 0), height: Math.max(height, 20) }}
          >
            <div className="flex items-center gap-0.5 font-semibold leading-tight">
              <Icon className="h-3 w-3 shrink-0" />
              <span>{formatTime(v.date)}</span>
              {v.createdByAi && <span className="ml-auto text-[9px] bg-white/30 px-1 rounded">IA</span>}
            </div>
            {height > 30 && <p className="truncate leading-tight mt-0.5">{v.lead?.name ?? "Sin nombre"}</p>}
            {height > 46 && v.property && <p className="truncate leading-tight opacity-80 text-[10px]">{v.property.title}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────

function WeekView({
  days,
  visits,
  today,
  onClickVisit,
  onClickCreate,
}: {
  days: Date[];
  visits: Visit[];
  today: Date;
  onClickVisit: (v: Visit) => void;
  onClickCreate: (day: Date, hour: number) => void;
}) {
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

  return (
    <div className="border dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-900">
      {/* Header row */}
      <div className="flex border-b dark:border-gray-700">
        {/* Hour gutter */}
        <div className="w-14 shrink-0 border-r dark:border-gray-700" />
        {days.map((d) => {
          const isToday = isSameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className={`flex-1 text-center py-2 text-xs font-semibold border-r last:border-r-0 dark:border-gray-700 ${
                isToday ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400" : "text-gray-500"
              }`}
            >
              <div>{["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"][d.getDay() === 0 ? 6 : d.getDay() - 1]}</div>
              <div className={`text-base font-bold ${isToday ? "text-indigo-600" : "text-gray-700 dark:text-gray-300"}`}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable body */}
      <div className="overflow-y-auto" style={{ maxHeight: "65vh" }}>
        <div className="flex">
          {/* Hour labels */}
          <div className="w-14 shrink-0 border-r dark:border-gray-700">
            {hours.map((h) => (
              <div key={h} style={{ height: PX_PER_HOUR }} className="border-b dark:border-gray-800 text-[10px] text-gray-400 px-1 pt-0.5">
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {/* Columns */}
          {days.map((d) => {
            const dayVisits = visits.filter((v) => isSameDay(new Date(v.date), d));
            return (
              <div key={d.toISOString()} className="flex-1 border-r last:border-r-0 dark:border-gray-700">
                <TimelineColumn
                  day={d}
                  visits={dayVisits}
                  today={today}
                  onClickVisit={onClickVisit}
                  onClickCreate={onClickCreate}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Agenda View ─────────────────────────────────────────────────────────────

function AgendaView({
  visits,
  today,
  onClickVisit,
}: {
  visits: Visit[];
  today: Date;
  onClickVisit: (v: Visit) => void;
}) {
  const sorted = [...visits].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const upcoming = sorted.filter((v) => new Date(v.date) >= new Date(today.setHours(0, 0, 0, 0)));

  if (upcoming.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 dark:text-gray-500">
        <Calendar className="mx-auto h-10 w-10 mb-3 opacity-40" />
        <p>No hay visitas próximas en este rango</p>
      </div>
    );
  }

  // Group by day
  const groups: Map<string, Visit[]> = new Map();
  for (const v of upcoming) {
    const key = new Date(v.date).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }

  return (
    <div className="space-y-4">
      {Array.from(groups.entries()).map(([dateKey, dayVisits]) => {
        const d = new Date(dateKey);
        const isToday = isSameDay(d, today);
        return (
          <div key={dateKey}>
            <div className={`text-xs font-bold uppercase tracking-wide mb-2 ${isToday ? "text-indigo-600" : "text-gray-500"}`}>
              {isToday ? "Hoy — " : ""}
              {d.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}
            </div>
            <div className="space-y-2">
              {dayVisits.map((v) => {
                const Icon = STATUS_ICONS[v.status] ?? Clock;
                return (
                  <div
                    key={v.id}
                    onClick={() => onClickVisit(v)}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer hover:shadow-sm transition-shadow ${STATUS_COLORS[v.status] ?? ""}`}
                  >
                    <div className="shrink-0 mt-0.5">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{formatTime(v.date)}</span>
                        {v.endDate && <span className="text-xs opacity-70">– {formatTime(v.endDate)}</span>}
                        <span className="text-xs opacity-70">{STATUS_LABELS[v.status]}</span>
                      </div>
                      <p className="font-medium text-sm truncate">{v.lead?.name ?? "Sin nombre"}</p>
                      {v.property && <p className="text-xs opacity-70 truncate">{v.property.title}</p>}
                      {v.address && (
                        <p className="text-xs opacity-70 flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3" />{v.address}
                        </p>
                      )}
                    </div>
                    {v.createdByAi && (
                      <span className="text-[10px] font-bold bg-purple-200 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 px-1.5 py-0.5 rounded shrink-0">IA</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Month View (existing 4-week grid) ───────────────────────────────────────

function MonthView({
  calendarDays,
  visits,
  today,
  onClickVisit,
  onClickCreate,
}: {
  calendarDays: Date[];
  visits: Visit[];
  today: Date;
  onClickVisit: (v: Visit) => void;
  onClickCreate: (day: Date) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-7 gap-2 mb-1">
        {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map((name) => (
          <div key={name} className="text-center text-xs font-semibold text-gray-500 dark:text-gray-400 py-1">{name}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {calendarDays.map((day) => {
          const dayVisits = visits.filter((v) => isSameDay(new Date(v.date), day));
          const isToday = isSameDay(day, today);
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[90px] rounded-xl border p-2 ${
                isToday
                  ? "border-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20 dark:border-indigo-600"
                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium ${isToday ? "text-indigo-600 dark:text-indigo-400" : "text-gray-600 dark:text-gray-400"}`}>
                  {formatDate(day)}
                </span>
                <button
                  onClick={() => onClickCreate(new Date(day))}
                  className="p-0.5 text-gray-400 hover:text-indigo-600 rounded"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-1">
                {dayVisits.map((v) => {
                  const Icon = STATUS_ICONS[v.status] ?? Clock;
                  return (
                    <div
                      key={v.id}
                      onClick={() => onClickVisit(v)}
                      className={`p-1.5 rounded-lg cursor-pointer text-xs ${STATUS_COLORS[v.status] ?? "bg-gray-100"} hover:opacity-80`}
                    >
                      <div className="flex items-center gap-1 font-medium">
                        <Icon className="h-3 w-3" /> {formatTime(v.date)}
                        {v.createdByAi && (
                          <span className="ml-auto text-[9px] bg-purple-200 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 px-1 rounded">IA</span>
                        )}
                      </div>
                      <p className="truncate mt-0.5">{v.lead?.name ?? "Sin nombre"}</p>
                      {v.property && <p className="truncate opacity-75">{v.property.title}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VisitsPage() {
  const { token, user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();

  // Data
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ today: number; thisWeek: number } | null>(null);

  // Calendar state
  const [viewType, setViewType] = useState<ViewType>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const today = new Date();

  // Google Calendar
  const [gcalConnected, setGcalConnected] = useState<boolean | null>(null);
  const [gcalLoading, setGcalLoading] = useState(false);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Visit | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [newLeadMode, setNewLeadMode] = useState(false);
  const [phoneCountryCode, setPhoneCountryCode] = useState("+54");

  // ── Date range for API ──────────────────────────────

  const { from, to, calendarDays, weekDays } = (() => {
    if (viewType === "month") {
      const days = get4Weeks(currentDate);
      return {
        from: days[0].toISOString(),
        to: new Date(days[27].getTime() + 86400000).toISOString(),
        calendarDays: days,
        weekDays: [] as Date[],
      };
    }
    if (viewType === "week") {
      const days = getWeekDays(currentDate);
      return {
        from: days[0].toISOString(),
        to: new Date(days[6].getTime() + 86400000).toISOString(),
        calendarDays: [] as Date[],
        weekDays: days,
      };
    }
    if (viewType === "day") {
      const start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      return {
        from: start.toISOString(),
        to: new Date(start.getTime() + 86400000).toISOString(),
        calendarDays: [] as Date[],
        weekDays: [start],
      };
    }
    // agenda: next 30 days
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    return {
      from: start.toISOString(),
      to: new Date(start.getTime() + 30 * 86400000).toISOString(),
      calendarDays: [] as Date[],
      weekDays: [] as Date[],
    };
  })();

  // ── Load data ───────────────────────────────────────

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [v, s] = await Promise.all([
        api.getVisits(token, { from, to }),
        api.getVisitStats(token),
      ]);
      setVisits(v);
      setStats(s);
    } catch { toast.error("Error al cargar visitas"); }
    setLoading(false);
  }, [token, from, to]);

  useEffect(() => { load(); }, [load]);

  // ── Google Calendar status ──────────────────────────

  useEffect(() => {
    if (!token) return;
    fetch("/api/calendar/google/status", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setGcalConnected((d as { connected?: boolean }).connected ?? false))
      .catch(() => setGcalConnected(false));
  }, [token]);

  const handleGcalConnect = async () => {
    if (!token) return;
    setGcalLoading(true);
    try {
      const res = await fetch("/api/calendar/google/auth-url", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { url?: string };
      if (data.url) window.location.href = data.url;
    } catch { toast.error("Error al obtener URL de Google"); }
    setGcalLoading(false);
  };

  const handleGcalDisconnect = async () => {
    if (!token) return;
    const ok = await confirm({ title: "Desconectar Google Calendar", message: "¿Desconectar la sincronización con Google Calendar?", confirmLabel: "Desconectar", danger: true });
    if (!ok) return;
    setGcalLoading(true);
    try {
      await fetch("/api/calendar/google", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setGcalConnected(false);
      toast.success("Google Calendar desconectado");
    } catch { toast.error("Error al desconectar"); }
    setGcalLoading(false);
  };

  // ── Navigation ──────────────────────────────────────

  const navigate = (delta: number) => {
    const d = new Date(currentDate);
    if (viewType === "month") d.setDate(d.getDate() + delta * 28);
    else if (viewType === "week") d.setDate(d.getDate() + delta * 7);
    else if (viewType === "day") d.setDate(d.getDate() + delta);
    setCurrentDate(d);
  };

  const navLabel = () => {
    if (viewType === "month") {
      const days = get4Weeks(currentDate);
      return `${days[0].toLocaleDateString("es", { day: "numeric", month: "short" })} — ${days[27].toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}`;
    }
    if (viewType === "week") {
      const days = getWeekDays(currentDate);
      return `${days[0].toLocaleDateString("es", { day: "numeric", month: "short" })} — ${days[6].toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}`;
    }
    if (viewType === "day") {
      return currentDate.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    }
    return "Próximos 30 días";
  };

  // ── Modal helpers ───────────────────────────────────

  const loadFormData = async () => {
    if (!token) return;
    try {
      const [l, p] = await Promise.all([
        api.getLeads(token, { limit: "200" }),
        api.getProperties(token, { limit: "200", status: "ACTIVE" }),
      ]);
      setLeads(l.data);
      setProperties(p.data);
    } catch { toast.error("Error al cargar formulario"); }
  };

  const openCreate = (day?: Date, hour?: number) => {
    loadFormData();
    setEditing(null);
    setNewLeadMode(false);
    setPhoneCountryCode("+54");
    const d = day ? new Date(day) : new Date();
    d.setHours(hour ?? 10, 0, 0, 0);
    setForm({ date: toLocalInput(d), agentId: user?.id, sendWhatsappReminder: false });
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (v: Visit) => {
    loadFormData();
    setEditing(v);
    setNewLeadMode(false);
    setForm({
      leadId: v.leadId, propertyId: v.propertyId ?? "",
      date: toLocalInput(new Date(v.date)),
      endDate: v.endDate ? toLocalInput(new Date(v.endDate)) : "",
      status: v.status, notes: v.notes ?? "", address: v.address ?? "",
    });
    setFormErrors({});
    setShowModal(true);
  };

  const handleSave = async () => {
    const errors: Record<string, string> = {};
    if (!editing) {
      if (newLeadMode) {
        if (!form.newLeadName && !form.newLeadPhone && !form.newLeadEmail)
          errors.newLead = "Ingresá al menos nombre, teléfono o email";
      } else {
        if (!form.leadId) errors.leadId = "Seleccioná un lead";
      }
    }
    if (!form.date) errors.date = "La fecha es obligatoria";
    if (form.endDate && form.date && new Date(form.endDate as string) <= new Date(form.date as string))
      errors.endDate = "La fecha fin debe ser posterior a la fecha inicio";

    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (!token || !form.date) return;

    setSaving(true);
    try {
      const data: Record<string, unknown> = { ...form };
      if (!data.propertyId) delete data.propertyId;
      if (!editing) delete data.status;
      if (data.date) data.date = new Date(data.date as string).toISOString();
      if (data.endDate) data.endDate = new Date(data.endDate as string).toISOString();
      else delete data.endDate;

      if (editing) {
        delete data.leadId;
        await api.updateVisit(token, editing.id, data);
        toast.success("Visita actualizada");
      } else {
        if (newLeadMode) delete data.leadId;
        await api.createVisit(token, data);
        toast.success("Visita agendada");
      }
      setShowModal(false);
      load();
    } catch (e: unknown) { toast.error(getErrorMessage(e)); }
    setSaving(false);
  };

  const handleDelete = async (v: Visit) => {
    const ok = await confirm({ title: "Eliminar visita", message: "¿Eliminar esta visita?", confirmLabel: "Eliminar", danger: true });
    if (!ok || !token) return;
    try {
      await api.deleteVisit(token, v.id);
      toast.success("Visita eliminada");
      load();
    } catch (e: unknown) { toast.error(getErrorMessage(e)); }
  };

  const canSave = form.date && (
    editing ||
    (newLeadMode ? (form.newLeadName || form.newLeadPhone || form.newLeadEmail) : form.leadId)
  );

  // ── View tabs config ────────────────────────────────

  const VIEW_TABS: { key: ViewType; label: string; icon: typeof Calendar }[] = [
    { key: "month", label: "Mes", icon: CalendarDays },
    { key: "week", label: "Semana", icon: Calendar },
    { key: "day", label: "Día", icon: Clock },
    { key: "agenda", label: "Agenda", icon: List },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Calendar className="h-7 w-7 text-indigo-500" /> Agenda de Visitas
          </h1>
          {stats && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Hoy: {stats.today} · Esta semana: {stats.thisWeek}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Google Calendar */}
          {gcalConnected === null ? null : gcalConnected ? (
            <button
              onClick={handleGcalDisconnect}
              disabled={gcalLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
            >
              <Link2 className="h-3.5 w-3.5" />
              Google Calendar ✓
            </button>
          ) : (
            <button
              onClick={handleGcalConnect}
              disabled={gcalLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
            >
              {gcalLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
              Conectar Google Calendar
            </button>
          )}

          <button
            onClick={() => openCreate()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> Nueva visita
          </button>
        </div>
      </div>

      {/* View selector + navigation */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* View tabs */}
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs font-medium">
          {VIEW_TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setViewType(t.key)}
                className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${
                  viewType === t.key
                    ? "bg-indigo-600 text-white"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Navigation (hidden for agenda) */}
        {viewType !== "agenda" && (
          <>
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-gray-300" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-1 rounded-lg text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 hover:bg-indigo-200"
            >
              Hoy
            </button>
            <button onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <ChevronRight className="h-5 w-5 text-gray-600 dark:text-gray-300" />
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">{navLabel()}</span>
          </>
        )}
      </div>

      {/* Calendar views */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <>
          {viewType === "month" && (
            <MonthView
              calendarDays={calendarDays}
              visits={visits}
              today={today}
              onClickVisit={openEdit}
              onClickCreate={(day) => openCreate(day)}
            />
          )}
          {viewType === "week" && (
            <WeekView
              days={weekDays}
              visits={visits}
              today={today}
              onClickVisit={openEdit}
              onClickCreate={(day, hour) => openCreate(day, hour)}
            />
          )}
          {viewType === "day" && (
            <WeekView
              days={weekDays}
              visits={visits}
              today={today}
              onClickVisit={openEdit}
              onClickCreate={(day, hour) => openCreate(day, hour)}
            />
          )}
          {viewType === "agenda" && (
            <AgendaView
              visits={visits}
              today={today}
              onClickVisit={openEdit}
            />
          )}
        </>
      )}

      {/* Create/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? "Editar visita" : "Nueva visita"}</h2>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>

              <div className="space-y-3">
                {/* Lead section */}
                {!editing && (
                  <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => { setNewLeadMode(false); setForm((f) => ({ ...f, newLeadName: "", newLeadPhone: "", newLeadEmail: "" })); setFormErrors({}); }}
                      className={`flex-1 py-2 ${!newLeadMode ? "bg-indigo-600 text-white" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
                    >
                      Lead existente
                    </button>
                    <button
                      type="button"
                      onClick={() => { setNewLeadMode(true); setForm((f) => ({ ...f, leadId: "" })); setFormErrors({}); }}
                      className={`flex-1 py-2 ${newLeadMode ? "bg-indigo-600 text-white" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
                    >
                      Nuevo lead
                    </button>
                  </div>
                )}

                {!editing && !newLeadMode && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Lead *</label>
                    <select value={String(form.leadId ?? "")} onChange={(e) => setForm({ ...form, leadId: e.target.value })}
                      className={`w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white ${formErrors.leadId ? "border-red-500" : ""}`}>
                      <option value="">— Seleccionar lead —</option>
                      {leads.map((l) => <option key={l.id} value={l.id}>{l.name ?? l.phone ?? l.email ?? l.id}</option>)}
                    </select>
                    {formErrors.leadId && <p className="text-xs text-red-500 mt-1">{formErrors.leadId}</p>}
                  </div>
                )}

                {editing && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Lead</label>
                    <select value={String(form.leadId ?? "")} onChange={(e) => setForm({ ...form, leadId: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                      <option value="">— Seleccionar lead —</option>
                      {leads.map((l) => <option key={l.id} value={l.id}>{l.name ?? l.phone ?? l.email ?? l.id}</option>)}
                    </select>
                  </div>
                )}

                {!editing && newLeadMode && (
                  <div className="space-y-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                    <p className="text-xs text-gray-500 dark:text-gray-400">El lead se creará automáticamente en etapa <strong>Visita</strong></p>
                    {formErrors.newLead && <p className="text-xs text-red-500">{formErrors.newLead}</p>}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nombre</label>
                      <input value={String(form.newLeadName ?? "")} onChange={(e) => setForm({ ...form, newLeadName: e.target.value })}
                        placeholder="Ej: Juan Pérez"
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Teléfono</label>
                      <div className="flex gap-1">
                        <select
                          value={phoneCountryCode}
                          onChange={(e) => {
                            setPhoneCountryCode(e.target.value);
                            const num = String(form.newLeadPhone ?? "").replace(/^\+\d+\s*/, "");
                            setForm({ ...form, newLeadPhone: num ? `${e.target.value}${num}` : "" });
                          }}
                          className="border rounded-lg px-2 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white w-28 shrink-0"
                        >
                          {COUNTRY_CODES.map((c) => (
                            <option key={c.code} value={c.code}>{c.label} {c.country}</option>
                          ))}
                        </select>
                        <input
                          value={String(form.newLeadPhone ?? "").replace(/^\+\d+/, "")}
                          onChange={(e) => {
                            const num = e.target.value.replace(/[^\d\s\-()]/g, "");
                            setForm({ ...form, newLeadPhone: num ? `${phoneCountryCode}${num}` : "" });
                          }}
                          placeholder="1112345678"
                          className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
                      <input type="email" value={String(form.newLeadEmail ?? "")} onChange={(e) => setForm({ ...form, newLeadEmail: e.target.value })}
                        placeholder="Ej: juan@email.com"
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Propiedad (opcional)</label>
                  <select value={String(form.propertyId ?? "")} onChange={(e) => setForm({ ...form, propertyId: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <option value="">— Sin propiedad —</option>
                    {properties.map((p) => <option key={p.id} value={p.id}>{p.title}{p.code ? ` (${p.code})` : ""}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Fecha y hora *</label>
                    <input type="datetime-local" value={String(form.date ?? "")} onChange={(e) => setForm({ ...form, date: e.target.value })}
                      className={`w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white ${formErrors.date ? "border-red-500" : ""}`} />
                    {formErrors.date && <p className="text-xs text-red-500 mt-1">{formErrors.date}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Fin (opcional)</label>
                    <input type="datetime-local" value={String(form.endDate ?? "")} onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                      className={`w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white ${formErrors.endDate ? "border-red-500" : ""}`} />
                    {formErrors.endDate && <p className="text-xs text-red-500 mt-1">{formErrors.endDate}</p>}
                  </div>
                </div>

                {editing && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Estado</label>
                    <select value={String(form.status ?? "SCHEDULED")} onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Dirección</label>
                  <input value={String(form.address ?? "")} onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notas</label>
                  <textarea rows={2} value={String(form.notes ?? "")} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>

                {!editing && (
                  <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <input
                      type="checkbox"
                      checked={Boolean(form.sendWhatsappReminder)}
                      onChange={(e) => setForm({ ...form, sendWhatsappReminder: e.target.checked })}
                      className="rounded text-indigo-600"
                    />
                    <div className="flex items-center gap-2 flex-1">
                      <MessageSquare className="h-4 w-4 text-green-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Notificar por WhatsApp</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Enviar mensaje de confirmación 1 hora antes al lead</p>
                      </div>
                    </div>
                  </label>
                )}
              </div>

              <div className="flex justify-between pt-3 border-t dark:border-gray-700">
                <div>
                  {editing && (
                    <button onClick={() => { setShowModal(false); handleDelete(editing); }}
                      className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">Eliminar</button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancelar</button>
                  <button onClick={handleSave} disabled={saving || !canSave}
                    className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2">
                    {saving && <Spinner className="h-4 w-4" />} {editing ? "Guardar" : "Agendar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
