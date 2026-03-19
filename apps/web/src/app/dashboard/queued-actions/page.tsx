"use client";

import { useEffect, useState, useCallback } from "react";
import { api, QueuedAction, RuleAction, Template } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Clock,
  RotateCcw,
  XCircle,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
} from "lucide-react";
import {
  PageHeader,
  EmptyState,
  Badge,
  PageLoader,
  useToast,
  useConfirm,
} from "@/components/ui";

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: "Pendiente", color: "amber", icon: Clock },
  processing: { label: "Procesando", color: "blue", icon: Loader2 },
  completed: { label: "Completado", color: "green", icon: CheckCircle2 },
  failed: { label: "Fallido", color: "red", icon: AlertCircle },
  cancelled: { label: "Cancelado", color: "gray", icon: XCircle },
};

const TRIGGER_LABELS: Record<string, string> = {
  "lead.created": "Lead creado",
  "lead.assigned": "Lead asignado",
  "lead.contacted": "Lead contactado",
  "lead.updated": "Lead actualizado",
  "message.inbound": "Mensaje entrante",
  "stage.changed": "Cambio de etapa",
  no_response: "Sin respuesta",
  scheduled: "Programado",
};

export default function QueuedActionsPage() {
  const { token } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<QueuedAction[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      const [data, tpls] = await Promise.all([
        api.getQueuedActions(token!, params),
        templates.length === 0 ? api.getTemplates(token!) : Promise.resolve(templates),
      ]);
      setItems(data);
      if (tpls !== templates) setTemplates(tpls);
    } catch {
      toast.error("Error al cargar la cola");
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = async (id: string) => {
    const ok = await confirm({
      title: "Cancelar acción",
      message: "¿Cancelar esta acción encolada? No se ejecutará.",
      confirmLabel: "Cancelar acción",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.cancelQueuedAction(token!, id);
      toast.success("Acción cancelada");
      load();
    } catch {
      toast.error("Error al cancelar");
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await api.retryQueuedAction(token!, id);
      toast.success("Reintentando...");
      load();
    } catch {
      toast.error("Error al reintentar");
    }
  };

  const handleCancelAll = async () => {
    const ok = await confirm({
      title: "Cancelar todo",
      message:
        "¿Cancelar todas las acciones pendientes? Ninguna se ejecutará.",
      confirmLabel: "Cancelar todas",
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await api.cancelAllQueuedActions(token!);
      toast.success(`${result.cancelled} acciones canceladas`);
      load();
    } catch {
      toast.error("Error al cancelar");
    }
  };

  const pendingCount = items.filter((i) => i.status === "pending").length;

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div>
      <PageHeader
        title="Cola de automatizaciones"
        description="Acciones encoladas fuera de horario laboral — se ejecutan automáticamente al iniciar el próximo horario"
        action={
          pendingCount > 0 ? (
            <button onClick={handleCancelAll} className="btn-secondary text-red-600">
              <Trash2 className="w-4 h-4" /> Cancelar todas
            </button>
          ) : undefined
        }
      />

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {["pending", "completed", "failed", "cancelled", ""].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              statusFilter === s
                ? "bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300 border-brand-300"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300"
            }`}
          >
            {s === ""
              ? "Todas"
              : STATUS_MAP[s]?.label ?? s}
          </button>
        ))}
      </div>

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="Sin acciones encoladas"
          description={
            statusFilter === "pending"
              ? "No hay acciones pendientes. Las automatizaciones fuera de horario aparecerán aquí."
              : "No se encontraron acciones con ese filtro."
          }
        />
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const st = STATUS_MAP[item.status] ?? STATUS_MAP.pending;
            const StIcon = st.icon;
            return (
              <div
                key={item.id}
                className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border
                        ${st.color === "amber" ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800" : ""}
                        ${st.color === "blue" ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800" : ""}
                        ${st.color === "green" ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800" : ""}
                        ${st.color === "red" ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800" : ""}
                        ${st.color === "gray" ? "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700" : ""}
                      `}
                    >
                      <StIcon className="w-3 h-3" /> {st.label}
                    </span>

                    <Badge variant="purple">
                      {TRIGGER_LABELS[item.trigger] ?? item.trigger}
                    </Badge>

                    {item.rule && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        Regla: <span className="font-medium text-gray-700 dark:text-gray-300">{item.rule.name}</span>
                      </span>
                    )}
                    {item.rule?.actions && (() => {
                      const actions = item.rule.actions as RuleAction[];
                      const tplAction = actions.find((a) => a.type === "send_template");
                      const aiAction = actions.find((a) => a.type === "send_ai_message");
                      if (tplAction?.templateKey) {
                        const tplName = templates.find((t) => t.key === tplAction.templateKey)?.name ?? tplAction.templateKey;
                        return (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            📄 Plantilla: <span className="font-medium text-brand-600 dark:text-brand-400">{tplName}</span>
                            {tplAction.channel && <span className="ml-1 text-gray-400">({tplAction.channel})</span>}
                          </span>
                        );
                      }
                      if (aiAction) {
                        return (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            🤖 <span className="font-medium text-purple-600 dark:text-purple-400">Mensaje IA</span>
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>
                      Lead: <span className="font-medium text-gray-700 dark:text-gray-300">
                        {item.lead?.name ?? item.lead?.phone ?? item.leadId.slice(0, 8) + "…"}
                      </span>
                    </span>
                    {item.assignee && (
                      <span className="inline-flex items-center gap-1">
                        📱 Agente: <span className="font-medium text-gray-700 dark:text-gray-300">
                          {item.assignee.name ?? item.assignee.email}
                        </span>
                      </span>
                    )}
                    {!item.assignee && !item.assigneeId && (
                      <span className="text-amber-500">⚠ Sin agente asignado</span>
                    )}
                    <span>Creado: {formatDate(item.createdAt)}</span>
                    {item.processAt && (
                      <span className="text-brand-600 dark:text-brand-400">
                        Programado: {formatDate(item.processAt)}
                      </span>
                    )}
                    {item.attempts > 0 && (
                      <span>Intentos: {item.attempts}</span>
                    )}
                  </div>

                  {item.error && (
                    <p className="text-xs text-red-500 mt-1 truncate">
                      Error: {item.error}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {item.status === "pending" && (
                    <button
                      onClick={() => handleCancel(item.id)}
                      title="Cancelar"
                      className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                  {item.status === "failed" && (
                    <button
                      onClick={() => handleRetry(item.id)}
                      title="Reintentar"
                      className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950 transition"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
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
