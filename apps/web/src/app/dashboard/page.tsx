"use client";

import { useAuth } from "@/lib/auth";
import { api, DashboardStats } from "@/lib/api";
import { useEffect, useState } from "react";
import {
  Users,
  Layers,
  Radio,
  TrendingUp,
  MessageSquare,
  UserPlus,
  Trophy,
  Zap,
  ArrowUpRight,
  Clock,
  FileText,
} from "lucide-react";
import { StatCard, StatCardSkeleton } from "@/components/ui";

/* ─── Helpers ──────────────────────────────────────── */
const STATUS_LABELS: Record<string, string> = {
  NEW: "Nuevo",
  CONTACTED: "Contactado",
  QUALIFIED: "Calificado",
  VISIT: "Visita",
  NEGOTIATION: "Negociación",
  WON: "Ganado",
  LOST: "Perdido",
};

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-500",
  CONTACTED: "bg-sky-500",
  QUALIFIED: "bg-violet-500",
  VISIT: "bg-amber-500",
  NEGOTIATION: "bg-orange-500",
  WON: "bg-emerald-500",
  LOST: "bg-red-400",
};

const EVENT_ICONS: Record<string, string> = {
  lead_created: "🟢",
  lead_updated: "🔄",
  message_inbound: "📩",
  message_sent: "📤",
  workflow_executed: "⚡",
  template_created: "📝",
  rule_created: "🔧",
  channel_connected: "📡",
  channel_disconnected: "🔌",
  provider_error: "⚠️",
};

const SOURCE_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `Hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `Hace ${days}d`;
}

export default function DashboardPage() {
  const { token, user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api
      .getDashboardStats(token)
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const firstName = (user?.name ?? user?.email ?? "").split(" ")[0];

  if (loading) {
    return (
      <>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Hola, {firstName} 👋</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Cargando tu resumen...</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      </>
    );
  }

  if (!stats) return null;

  const s = stats.summary;
  const pipelineTotal = stats.pipeline.reduce((a, b) => a + b.count, 0);
  const sourceTotal = stats.leadsBySource.reduce((a, b) => a + b.count, 0);
  const maxTimelineCount = Math.max(...stats.leadsTimeline.map((d) => d.count), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Hola, {firstName} 👋</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Aquí va un resumen de tu CRM</p>
      </div>

      {/* ═══ Row 1: Main stat cards ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Leads"
          value={s.totalLeads}
          icon={Users}
          iconColor="text-brand-600 bg-brand-50"
          trend={s.leadsToday > 0 ? { value: `+${s.leadsToday} hoy`, positive: true } : undefined}
        />
        <StatCard
          label="Leads esta Semana"
          value={s.leadsThisWeek}
          icon={UserPlus}
          iconColor="text-sky-600 bg-sky-50"
          trend={s.leadsThisMonth > 0 ? { value: `${s.leadsThisMonth} este mes`, positive: true } : undefined}
        />
        <StatCard
          label="Operaciones Ganadas"
          value={s.wonLeads}
          icon={Trophy}
          iconColor="text-emerald-600 bg-emerald-50"
        />
        <StatCard
          label="Tasa Conversión"
          value={s.conversionRate + "%"}
          icon={TrendingUp}
          iconColor="text-amber-600 bg-amber-50"
          trend={s.lostLeads > 0 ? { value: `${s.lostLeads} perdidos` } : undefined}
        />
      </div>

      {/* ═══ Row 2: Secondary stat cards ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MiniStatCard label="Mensajes" value={s.totalMessages} sub={`${s.messagesIn} ent · ${s.messagesOut} sal`} icon={MessageSquare} color="text-violet-600" />
        <MiniStatCard label="Canales Activos" value={`${s.activeChannels}/${s.totalChannels}`} sub="conectados" icon={Radio} color="text-emerald-600" />
        <MiniStatCard label="Reglas Activas" value={s.activeRules} sub="automatizaciones" icon={Zap} color="text-orange-600" />
        <MiniStatCard label="Templates" value={s.totalTemplates} sub={`${s.totalUsers} usuarios`} icon={FileText} color="text-blue-600" />
      </div>

      {/* ═══ Row 3: Pipeline + Lead Timeline ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Funnel */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-600" />
            Embudo de Ventas
          </h2>
          <div className="space-y-2">
            {stats.pipeline.map((stage) => {
              const pct = pipelineTotal > 0 ? (stage.count / pipelineTotal) * 100 : 0;
              return (
                <div key={stage.id} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 dark:text-gray-400 w-24 truncate font-medium">{stage.name}</span>
                  <div className="flex-1 h-7 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden relative">
                    <div
                      className={`h-full rounded-lg transition-all duration-500 ${STATUS_COLORS[stage.key] ?? "bg-gray-400"}`}
                      style={{ width: `${Math.max(pct, stage.count > 0 ? 4 : 0)}%` }}
                    />
                    {stage.count > 0 && (
                      <span className="absolute inset-y-0 left-2 flex items-center text-xs font-bold text-white drop-shadow">
                        {stage.count}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 w-10 text-right">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-3">{pipelineTotal} leads total en pipeline</p>
        </div>

        {/* Leads Timeline (last 14 days bar chart) */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-600" />
            Leads Últimos 14 Días
          </h2>
          <div className="flex items-end gap-1 h-40">
            {stats.leadsTimeline.map((day) => {
              const heightPct = maxTimelineCount > 0 ? (day.count / maxTimelineCount) * 100 : 0;
              const dateObj = new Date(day.date + "T12:00:00");
              const dayLabel = dateObj.toLocaleDateString("es", { day: "2-digit" });
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group" title={`${day.date}: ${day.count} leads`}>
                  <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                    {day.count}
                  </span>
                  <div className="w-full flex items-end" style={{ height: "120px" }}>
                    <div
                      className={`w-full rounded-t transition-all duration-300 ${day.count > 0 ? "bg-brand-500 group-hover:bg-brand-600" : "bg-gray-100 dark:bg-gray-700"}`}
                      style={{ height: `${Math.max(heightPct, day.count > 0 ? 8 : 2)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400">{dayLabel}</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-2">{s.leadsThisMonth} leads en los últimos 30 días</p>
        </div>
      </div>

      {/* ═══ Row 4: Leads by Status + Leads by Source ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status breakdown */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Leads por Estado</h2>
          <div className="space-y-3">
            {Object.entries(STATUS_LABELS).map(([key, label]) => {
              const count = stats.statusCounts[key] ?? 0;
              const pct = s.totalLeads > 0 ? (count / s.totalLeads) * 100 : 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[key]}`} />
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{label}</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white w-8 text-right">{count}</span>
                  <div className="w-24 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${STATUS_COLORS[key]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Source breakdown */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Leads por Fuente</h2>
          {stats.leadsBySource.length === 0 ? (
            <p className="text-sm text-gray-400">Sin datos de fuentes</p>
          ) : (
            <div className="space-y-3">
              {stats.leadsBySource
                .sort((a, b) => b.count - a.count)
                .map((src, i) => {
                  const pct = sourceTotal > 0 ? (src.count / sourceTotal) * 100 : 0;
                  return (
                    <div key={src.name} className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full ${SOURCE_COLORS[i % SOURCE_COLORS.length]}`} />
                      <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{src.name}</span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white w-8 text-right">{src.count}</span>
                      <div className="w-24 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${SOURCE_COLORS[i % SOURCE_COLORS.length]}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Row 5: Recent Leads + Activity ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Leads Table */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Últimos Leads</h2>
            <a href="/dashboard/leads" className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
              Ver todos <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100 dark:border-gray-700">
                  <th className="pb-2 font-medium">Nombre</th>
                  <th className="pb-2 font-medium">Estado</th>
                  <th className="pb-2 font-medium">Etapa</th>
                  <th className="pb-2 font-medium hidden sm:table-cell">Fuente</th>
                  <th className="pb-2 font-medium text-right">Tiempo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {stats.recentLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="py-2.5">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white truncate max-w-[140px]">{lead.name ?? "—"}</p>
                        {lead.assignee && <p className="text-[11px] text-gray-400">{lead.assignee}</p>}
                      </div>
                    </td>
                    <td className="py-2.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[lead.status] ?? "bg-gray-400"}`} />
                        {STATUS_LABELS[lead.status] ?? lead.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-gray-600 dark:text-gray-400 text-xs">{lead.stage ?? "—"}</td>
                    <td className="py-2.5 text-gray-500 dark:text-gray-400 text-xs hidden sm:table-cell truncate max-w-[100px]">{lead.source ?? "—"}</td>
                    <td className="py-2.5 text-right">
                      <span className="text-[11px] text-gray-400">{timeAgo(lead.createdAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Actividad Reciente</h2>
            <a href="/dashboard/activity" className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
              Ver todo <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
          <div className="space-y-0">
            {stats.recentActivity.map((event, i) => (
              <div key={event.id} className="flex gap-3 py-2.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                <span className="text-base leading-none mt-0.5">{EVENT_ICONS[event.type] ?? "📋"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{event.message}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Clock className="w-3 h-3 text-gray-300" />
                    <span className="text-[11px] text-gray-400">{timeAgo(event.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Mini Stat Card Component ─────────────────────── */
interface MiniStatCardProps {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

function MiniStatCard({ label, value, sub, icon: Icon, color }: MiniStatCardProps) {
  return (
    <div className="card p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-[11px] text-gray-400">{sub}</p>
    </div>
  );
}
