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
  Info,
} from "lucide-react";
import {
  PageHeader,
  EmptyState,
  Badge,
  Modal,
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

const CONDITION_FIELD_LABELS: Record<string, string> = {
  status: "Estado del lead",
  sourceType: "Fuente de origen",
  primaryChannel: "Canal principal",
  hasAssignee: "Tiene agente asignado",
  interesado: "Interesado en la propiedad",
  stageKey: "Etapa actual",
  sourceName: "Nombre de fuente",
  formName: "Nombre del formulario",
  formField: "Respuesta del formulario",
  intent: "Intencion",
  messageContent: "Contenido del mensaje",
  noResponseDays: "Dias sin respuesta",
};

const OPERATOR_LABELS: Record<string, string> = {
  equals: "es igual a",
  not_equals: "no es igual a",
  contains: "contiene",
  not_contains: "no contiene",
  greater_than: "mayor que",
  less_than: "menor que",
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  assign: "Asignar agente",
  assign_by_form_name: "Asignar por nombre de formulario",
  send_template: "Enviar plantilla",
  change_status: "Cambiar estado",
  change_stage: "Cambiar etapa",
  add_note: "Agregar nota",
  notify: "Notificar",
  send_ai_message: "Mensaje IA",
  wait: "Esperar",
};

function parseConditions(conditions: Record<string, unknown>) {
  const rows: { field: string; operator: string; value: string }[] = [];
  for (const [key, val] of Object.entries(conditions)) {
    const field = key.startsWith("form_")
      ? "Respuesta del formulario (" + key.slice(5).replace(/_/g, " ") + ")"
      : (CONDITION_FIELD_LABELS[key] ?? key);
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const entries = Object.entries(val as Record<string, unknown>);
      if (entries.length > 0) {
        rows.push({ field, operator: OPERATOR_LABELS[entries[0][0]] ?? entries[0][0], value: String(entries[0][1]) });
      }
    } else {
      rows.push({ field, operator: "es igual a", value: String(val) });
    }
  }
  return rows;
}

function interpolateTemplate(content: string, item: QueuedAction): string {
  const ctx = (item.context ?? {}) as Record<string, unknown>;
  const formLines: string[] = [];
  const formVars: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (k.startsWith("form_") && v !== undefined && v !== null && v !== "") {
      formVars[k] = String(v);
      formLines.push(k.slice(5).replace(/_/g, " ") + ": " + String(v));
    }
  }
  const variables: Record<string, string> = {
    nombre: item.lead?.name ?? "cliente",
    name: item.lead?.name ?? "cliente",
    telefono: item.lead?.phone ?? "",
    phone: item.lead?.phone ?? "",
    agente: item.assignee?.name ?? item.assignee?.email ?? "",
    agent: item.assignee?.name ?? item.assignee?.email ?? "",
    fuente: String(ctx.sourceName ?? ""),
    source: String(ctx.sourceName ?? ""),
    etapa: String(ctx.stageKey ?? ""),
    stage: String(ctx.stageKey ?? ""),
    estado: String(ctx.status ?? ""),
    status: String(ctx.status ?? ""),
    intencion: String(ctx.intent ?? ""),
    intent: String(ctx.intent ?? ""),
    propiedad: String(ctx.propiedad ?? ""),
    tipo_propiedad: String(ctx.tipo_propiedad ?? ""),
    zona: String(ctx.zona ?? ""),
    interesado: String(ctx.interesado ?? ""),
    formulario: formLines.join("\n"),
    ...formVars,
  };
  return content.replace(/\{\{(\w+)\}\}/g, function(_m, key) {
    const val = variables[key];
    return val !== undefined && val !== "" ? val : "{{" + key + "}}";
  });
}

function getActionLabel(item: QueuedAction, templates: Template[]): string | null {
  const actions = (item.rule?.actions ?? []) as RuleAction[];
  const tplAction = actions.find(function(a) { return a.type === "send_template"; });
  const aiAction = actions.find(function(a) { return a.type === "send_ai_message"; });
  if (tplAction?.templateKey) {
    const name = templates.find(function(t) { return t.key === tplAction.templateKey; })?.name ?? tplAction.templateKey;
    return "Plantilla: " + name + (tplAction.channel ? " (" + tplAction.channel + ")" : "");
  }
  if (aiAction) return "Mensaje IA";
  return null;
}

function formatDate(d: string | null): string {
  if (!d) return "--";
  return new Date(d).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

interface DetailModalProps {
  item: QueuedAction;
  templates: Template[];
  token: string;
  onClose: () => void;
  onSaved: (updated: QueuedAction) => void;
}

function DetailModal({ item, templates, token, onClose, onSaved }: DetailModalProps) {
  const toast = useToast();
  const actions = (item.rule?.actions ?? []) as RuleAction[];
  const tplAction = actions.find(function(a) { return a.type === "send_template"; });
  const tpl = tplAction?.templateKey ? templates.find(function(t) { return t.key === tplAction.templateKey; }) : null;
  const condRows = parseConditions(item.rule?.conditions ?? {});

  const defaultText = tpl ? interpolateTemplate(tpl.content, item) : "";
  const [selectedTplKey, setSelectedTplKey] = useState<string>(tpl?.key ?? "");
  const [editedMsg, setEditedMsg] = useState<string>(item.messageOverride ?? defaultText);
  const [saving, setSaving] = useState(false);
  const isDirty = editedMsg !== (item.messageOverride ?? defaultText);
  const isOverridden = item.messageOverride != null && item.messageOverride !== defaultText;

  const handleTplChange = function(key: string) {
    setSelectedTplKey(key);
    if (!key) return;
    const chosen = templates.find(function(t) { return t.key === key; });
    if (chosen) setEditedMsg(interpolateTemplate(chosen.content, item));
  };

  const handleSave = async function() {
    setSaving(true);
    try {
      const updated = await api.updateQueuedActionMessage(token, item.id, editedMsg);
      toast.success("Mensaje guardado");
      onSaved(updated);
    } catch {
      toast.error("Error al guardar el mensaje");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async function() {
    setEditedMsg(defaultText);
    setSaving(true);
    try {
      const updated = await api.updateQueuedActionMessage(token, item.id, null);
      toast.success("Mensaje restablecido al original");
      onSaved(updated);
    } catch {
      toast.error("Error al restablecer");
    } finally {
      setSaving(false);
    }
  };

  const isPending = item.status === "pending";

  return (
    <Modal
      open
      onClose={onClose}
      title="Detalle de la accion encolada"
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            {tpl && isPending && isOverridden && (
              <button onClick={handleReset} disabled={saving} className="btn-secondary text-xs">
                Restablecer original
              </button>
            )}
          </div>
          <button onClick={onClose} className="btn-secondary">Cerrar</button>
        </div>
      }
    >
      <div className="space-y-5 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Lead</p>
            <p className="font-medium text-gray-900 dark:text-white">
              {item.lead?.name ?? item.lead?.phone ?? item.leadId.slice(0, 8) + "..."}
            </p>
          </div>
          {item.assignee && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Agente</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {item.assignee.name ?? item.assignee.email}
              </p>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Automatizacion</p>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-1">
            <p><span className="text-gray-500">Nombre:</span> <span className="font-medium text-gray-900 dark:text-white">{item.rule?.name ?? "--"}</span></p>
            <p><span className="text-gray-500">Trigger:</span> <span className="font-medium">{TRIGGER_LABELS[item.trigger] ?? item.trigger}</span></p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
            {condRows.length > 0 ? "Condiciones que se cumplieron" : "Condiciones"}
          </p>
          {condRows.length > 0 ? (
            <div className="space-y-1.5">
              {condRows.map(function(row, i) {
                return (
                  <div key={i} className="flex flex-wrap items-center gap-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                    <span className="font-medium text-gray-700 dark:text-gray-300">{row.field}</span>
                    <span className="text-gray-400 text-xs">{row.operator}</span>
                    <span className="font-semibold text-brand-600 dark:text-brand-400">&quot;{row.value}&quot;</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-400 text-xs italic">Sin condiciones adicionales (aplica a todos los leads)</p>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Acciones configuradas</p>
          <div className="space-y-1.5">
            {actions.map(function(a, i) {
              return (
                <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">{ACTION_TYPE_LABELS[a.type] ?? a.type}</span>
                  {a.templateKey && (
                    <span className="text-gray-400 text-xs">-- {templates.find(function(t) { return t.key === a.templateKey; })?.name ?? a.templateKey}</span>
                  )}
                  {a.channel && <Badge variant="info">{a.channel}</Badge>}
                </div>
              );
            })}
          </div>
        </div>

        {tpl && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Mensaje que se enviara
                {isOverridden && (
                  <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 px-1.5 py-0.5 rounded-full normal-case font-medium">Modificado</span>
                )}
              </p>
              {isPending && isDirty && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary text-xs px-3 py-1.5"
                >
                  {saving ? "Guardando..." : "Guardar mensaje"}
                </button>
              )}
            </div>

            {isPending && (
              <div className="mb-2">
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Plantilla base</label>
                <select
                  value={selectedTplKey}
                  onChange={function(e) { handleTplChange(e.target.value); }}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {templates.filter(function(t) { return t.enabled !== false; }).map(function(t) {
                    return (
                      <option key={t.key} value={t.key}>
                        {t.name}{t.key === tpl.key ? " (original)" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {isPending ? (
              <textarea
                value={editedMsg}
                onChange={function(e) { setEditedMsg(e.target.value); }}
                rows={6}
                className="w-full rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950 text-gray-800 dark:text-gray-200 p-3 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            ) : (
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
                <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{editedMsg}</p>
              </div>
            )}
            {tpl.attachments && tpl.attachments.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {tpl.attachments.length} adjunto(s): {tpl.attachments.map(function(a) { return a.originalName; }).join(", ")}
              </p>
            )}
          </div>
        )}

        {item.error && (
          <div>
            <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">Error</p>
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950 rounded-lg px-3 py-2">{item.error}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function QueuedActionsPage() {
  const { token } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<QueuedAction[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selectedItem, setSelectedItem] = useState<QueuedAction | null>(null);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleCancel = async (id: string) => {
    const ok = await confirm({
      title: "Cancelar accion",
      message: "Cancelar esta accion encolada? No se ejecutara.",
      confirmLabel: "Cancelar accion",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.cancelQueuedAction(token!, id);
      toast.success("Accion cancelada");
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
      message: "Cancelar todas las acciones pendientes? Ninguna se ejecutara.",
      confirmLabel: "Cancelar todas",
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await api.cancelAllQueuedActions(token!);
      toast.success(result.cancelled + " acciones canceladas");
      load();
    } catch {
      toast.error("Error al cancelar");
    }
  };

  const pendingCount = items.filter(function(i) { return i.status === "pending"; }).length;

  return (
    <div>
      <PageHeader
        title="Cola de automatizaciones"
        description="Acciones encoladas fuera de horario laboral -- se ejecutan automaticamente al iniciar el proximo horario"
        action={
          pendingCount > 0 ? (
            <button onClick={handleCancelAll} className="btn-secondary text-red-600">
              <Trash2 className="w-4 h-4" /> Cancelar todas
            </button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-2 mb-6">
        {["pending", "completed", "failed", "cancelled", ""].map(function(s) {
          return (
            <button
              key={s}
              onClick={function() { setStatusFilter(s); }}
              className={"px-3 py-1.5 rounded-lg text-xs font-medium border transition " + (
                statusFilter === s
                  ? "bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300 border-brand-300"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300"
              )}
            >
              {s === "" ? "Todas" : STATUS_MAP[s]?.label ?? s}
            </button>
          );
        })}
      </div>

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="Sin acciones encoladas"
          description={
            statusFilter === "pending"
              ? "No hay acciones pendientes. Las automatizaciones fuera de horario apareceran aqui."
              : "No se encontraron acciones con ese filtro."
          }
        />
      ) : (
        <div className="space-y-2">
          {items.map(function(item) {
            const st = STATUS_MAP[item.status] ?? STATUS_MAP.pending;
            const StIcon = st.icon;
            const actionLabel = getActionLabel(item, templates);
            return (
              <div key={item.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border " +
                      (st.color === "amber" ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800" : "") +
                      (st.color === "blue" ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800" : "") +
                      (st.color === "green" ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800" : "") +
                      (st.color === "red" ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800" : "") +
                      (st.color === "gray" ? "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700" : "")
                    }>
                      <StIcon className="w-3 h-3" /> {st.label}
                    </span>
                    <Badge variant="indigo">{TRIGGER_LABELS[item.trigger] ?? item.trigger}</Badge>
                    {item.rule && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        Regla: <span className="font-medium text-gray-700 dark:text-gray-300">{item.rule.name}</span>
                      </span>
                    )}
                    {actionLabel && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">{actionLabel}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>
                      Lead: <span className="font-medium text-gray-700 dark:text-gray-300">
                        {item.lead?.name ?? item.lead?.phone ?? item.leadId.slice(0, 8) + "..."}
                      </span>
                    </span>
                    {item.assignee && (
                      <span className="inline-flex items-center gap-1">
                        Agente: <span className="font-medium text-gray-700 dark:text-gray-300">{item.assignee.name ?? item.assignee.email}</span>
                      </span>
                    )}
                    {!item.assignee && !item.assigneeId && (
                      <span className="text-amber-500">Sin agente asignado</span>
                    )}
                    <span>Creado: {formatDate(item.createdAt)}</span>
                    {item.processAt && (
                      <span className="text-brand-600 dark:text-brand-400">Programado: {formatDate(item.processAt)}</span>
                    )}
                    {item.attempts > 0 && <span>Intentos: {item.attempts}</span>}
                  </div>
                  {item.error && (
                    <p className="text-xs text-red-500 mt-1 truncate">Error: {item.error}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={function() { setSelectedItem(item); }}
                    title="Ver detalle"
                    className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950 transition"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                  {item.status === "pending" && (
                    <button
                      onClick={function() { handleCancel(item.id); }}
                      title="Cancelar"
                      className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                  {item.status === "failed" && (
                    <button
                      onClick={function() { handleRetry(item.id); }}
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

      {selectedItem && (
        <DetailModal
          item={selectedItem}
          templates={templates}
          token={token!}
          onClose={function() { setSelectedItem(null); }}
          onSaved={function(updated) {
            setItems(function(prev) { return prev.map(function(i) { return i.id === updated.id ? { ...i, messageOverride: updated.messageOverride } : i; }); });
            setSelectedItem(function(prev) { return prev ? { ...prev, messageOverride: updated.messageOverride } : null; });
          }}
        />
      )}
    </div>
  );
}
