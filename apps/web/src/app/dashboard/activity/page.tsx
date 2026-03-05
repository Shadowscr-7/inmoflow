"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { CirclePlus, Edit, ArrowRightLeft, Zap, MessageSquareText, KeyRound, Link, Activity } from "lucide-react";
import { PageHeader, PageLoader, EmptyState, Badge } from "@/components/ui";

interface EventLogEntry {
  id: string;
  type: string;
  entity: string | null;
  entityId: string | null;
  status: string | null;
  message: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

const TYPE_ICONS: Record<string, typeof Activity> = {
  lead_created: CirclePlus,
  lead_updated: Edit,
  message_inbound: MessageSquareText,
  message_outbound: MessageSquareText,
  channel_connected: Link,
  channel_disconnected: Link,
  workflow_executed: Zap,
  workflow_failed: Zap,
  rule_created: Zap,
};

const TYPE_COLORS: Record<string, string> = {
  lead_created: "bg-emerald-50 text-emerald-600",
  lead_updated: "bg-blue-50 text-blue-600",
  message_inbound: "bg-brand-50 text-brand-600",
  message_outbound: "bg-cyan-50 text-cyan-600",
  channel_connected: "bg-green-50 text-green-600",
  channel_disconnected: "bg-red-50 text-red-600",
  workflow_executed: "bg-violet-50 text-violet-600",
  workflow_failed: "bg-red-50 text-red-600",
  rule_created: "bg-purple-50 text-purple-600",
};

const TYPE_LABELS: Record<string, string> = {
  lead_created: "Lead creado",
  lead_updated: "Lead actualizado",
  message_inbound: "Mensaje entrante",
  message_outbound: "Mensaje saliente",
  channel_connected: "Canal conectado",
  channel_disconnected: "Canal desconectado",
  workflow_executed: "Automatización ejecutada",
  workflow_failed: "Automatización fallida",
  rule_created: "Regla creada",
};

export default function ActivityPage() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<EventLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const data = await api.getEventLogs(token, { limit: "100" });
      setLogs(Array.isArray(data) ? data : []);
    } catch {
      /* silently ignore */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div>
      <PageHeader title="Actividad" description="Historial de acciones y eventos del sistema" />

      {loading ? (
        <PageLoader />
      ) : logs.length === 0 ? (
        <EmptyState icon={Activity} title="Sin actividad" description="Todavía no hay eventos registrados" />
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const Icon = TYPE_ICONS[log.type] ?? Activity;
            const colors = TYPE_COLORS[log.type] ?? "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400";
            return (
              <div key={log.id} className="card p-4 flex items-start gap-3.5">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${colors}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="font-medium text-gray-900 dark:text-white text-sm">
                      {TYPE_LABELS[log.type] ?? log.type}
                    </span>
                    {log.entity && <Badge variant="default">{log.entity}</Badge>}
                    {log.status && log.status !== "ok" && (
                      <Badge variant="default">{log.status}</Badge>
                    )}
                  </div>
                  {log.message && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{log.message}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-400 mt-1">
                    <span>{formatDate(log.createdAt)}</span>
                    {log.entityId && <span className="font-mono">{log.entityId.slice(0, 8)}…</span>}
                  </div>
                  {log.payload && Object.keys(log.payload).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(log.payload).slice(0, 4).map(([k, v]) => (
                        <span key={k} className="text-xs bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-md px-2 py-0.5 text-gray-500 dark:text-gray-400">
                          <span className="font-medium text-gray-600 dark:text-gray-400">{k}:</span> {typeof v === "object" ? JSON.stringify(v) : String(v)}
                        </span>
                      ))}
                      {Object.keys(log.payload).length > 4 && (
                        <span className="text-xs text-gray-300">+{Object.keys(log.payload).length - 4} más</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
