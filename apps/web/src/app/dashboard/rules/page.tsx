"use client";

import { useEffect, useState, useCallback } from "react";
import { api, Rule, RuleAction, PipelineStage, Template, User, WorkingHours, WorkingHoursSchedule } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Plus, Zap, Pencil, Trash2, X, Globe, User as UserIcon, ArrowRight, Clock } from "lucide-react";
import { PageHeader, Modal, EmptyState, Toggle, Badge, PageLoader, useToast, useConfirm } from "@/components/ui";

// ─── Constants ───────────────────────────────────────

const TRIGGER_OPTIONS = [
  { value: "lead.created", label: "Lead creado", description: "Cuando un lead nuevo llega al sistema", icon: "➕" },
  { value: "lead.assigned", label: "Lead asignado", description: "Cuando un lead es asignado a un agente", icon: "👤" },
  { value: "lead.contacted", label: "Lead contactado", description: "Cuando el cliente responde por primera vez", icon: "✅" },
  { value: "lead.updated", label: "Lead actualizado", description: "Cuando se modifica un lead existente", icon: "✏️" },
  { value: "message.inbound", label: "Mensaje entrante", description: "Cuando un cliente envía un mensaje", icon: "💬" },
  { value: "stage.changed", label: "Cambio de etapa", description: "Cuando un lead cambia de etapa en el embudo", icon: "🔄" },
  { value: "no_response", label: "Sin respuesta", description: "Cuando un cliente no responde en X días", icon: "⏰" },
  { value: "scheduled", label: "Programado", description: "Ejecutar en un horario específico", icon: "📅" },
];

const ACTION_TYPES = [
  { value: "assign", label: "Asignar agente", icon: "👤", description: "Asignar un agente al lead" },
  { value: "send_template", label: "Enviar plantilla", icon: "📄", description: "Enviar una plantilla predefinida" },
  { value: "change_status", label: "Cambiar estado", icon: "🏷️", description: "Cambiar el estado del lead" },
  { value: "change_stage", label: "Cambiar etapa", icon: "📊", description: "Mover el lead a otra etapa del embudo" },
  { value: "add_note", label: "Agregar nota", icon: "📝", description: "Agregar una nota al lead" },
  { value: "notify", label: "Notificar", icon: "🔔", description: "Enviar una notificación" },
  { value: "send_ai_message", label: "Mensaje IA", icon: "🤖", description: "Enviar un mensaje personalizado con IA" },
  { value: "wait", label: "Esperar", icon: "⏳", description: "Esperar un tiempo antes de la siguiente acción" },
];

const STATUS_OPTIONS = [
  { value: "NEW", label: "Nuevo" },
  { value: "CONTACTED", label: "Contactado" },
  { value: "QUALIFIED", label: "Calificado" },
  { value: "VISIT", label: "Visita" },
  { value: "NEGOTIATION", label: "Negociación" },
  { value: "WON", label: "Ganado" },
  { value: "LOST", label: "Perdido" },
];

const CHANNEL_OPTIONS = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "TELEGRAM", label: "Telegram" },
  { value: "WEB", label: "Web" },
];

// ─── Condition builder types ─────────────────────────

interface Condition {
  field: string;
  operator: string;
  value: string;
}

const CONDITION_FIELDS = [
  { value: "status", label: "Estado del lead", type: "select" as const, options: STATUS_OPTIONS },
  { value: "sourceType", label: "Fuente de origen", type: "select" as const, options: [
    { value: "WEB_FORM", label: "Formulario web" },
    { value: "META_LEAD_AD", label: "Meta Lead Ad" },
    { value: "WHATSAPP_INBOUND", label: "WhatsApp entrante" },
    { value: "TELEGRAM_INBOUND", label: "Telegram entrante" },
    { value: "MANUAL", label: "Manual" },
  ]},
  { value: "primaryChannel", label: "Canal principal", type: "select" as const, options: CHANNEL_OPTIONS },
  { value: "hasAssignee", label: "Tiene agente asignado", type: "boolean" as const },
  { value: "stageKey", label: "Etapa actual", type: "stage" as const },
  { value: "intent", label: "Intención", type: "text" as const },
  { value: "messageContent", label: "Contenido del mensaje", type: "text" as const },
  { value: "noResponseDays", label: "Días sin respuesta", type: "number" as const },
];

const OPERATORS = [
  { value: "equals", label: "es igual a" },
  { value: "not_equals", label: "no es igual a" },
  { value: "contains", label: "contiene" },
  { value: "not_contains", label: "no contiene" },
  { value: "greater_than", label: "mayor que" },
  { value: "less_than", label: "menor que" },
];

const EMPTY_ACTION: RuleAction = { type: "assign" };
const EMPTY_CONDITION: Condition = { field: "status", operator: "equals", value: "" };

interface RuleForm {
  name: string;
  trigger: string;
  priority: number;
  enabled: boolean;
  conditions: Condition[];
  actions: RuleAction[];
  global: boolean;
  workingHours: WorkingHours;
}

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const DEFAULT_WORKING_HOURS: WorkingHours = {
  enabled: false,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  schedule: [
    { day: 1, from: "09:00", to: "18:00" },
    { day: 2, from: "09:00", to: "18:00" },
    { day: 3, from: "09:00", to: "18:00" },
    { day: 4, from: "09:00", to: "18:00" },
    { day: 5, from: "09:00", to: "18:00" },
  ],
};

const EMPTY_FORM: RuleForm = {
  name: "",
  trigger: "lead.created",
  priority: 0,
  enabled: true,
  conditions: [],
  actions: [{ ...EMPTY_ACTION }],
  global: false,
  workingHours: { ...DEFAULT_WORKING_HOURS },
};

type Scope = "all" | "mine" | "global";

// ─── Helpers ─────────────────────────────────────────

function conditionsToJson(conditions: Condition[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const c of conditions) {
    if (!c.field || !c.value) continue;
    if (c.operator === "equals") {
      result[c.field] = c.value;
    } else {
      result[c.field] = { [c.operator]: c.value };
    }
  }
  return result;
}

function jsonToConditions(json: Record<string, unknown>): Condition[] {
  const conditions: Condition[] = [];
  for (const [field, value] of Object.entries(json)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length > 0) {
        conditions.push({ field, operator: entries[0][0], value: String(entries[0][1]) });
      }
    } else {
      conditions.push({ field, operator: "equals", value: String(value) });
    }
  }
  return conditions;
}

function msToReadable(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}min`;
  if (ms < 86400000) return `${Math.round(ms / 3600000)}h`;
  return `${Math.round(ms / 86400000)}d`;
}

// ─── Component ───────────────────────────────────────

export default function RulesPage() {
  const { token, user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filterTrigger, setFilterTrigger] = useState("");
  const [scope, setScope] = useState<Scope>("all");

  // Reference data for dropdowns
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const isAdmin = user?.role === "BUSINESS" || user?.role === "ADMIN";

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (filterTrigger) params.trigger = filterTrigger;
      const [rulesData, stagesData, templatesData, usersData] = await Promise.all([
        api.getRules(token!, params),
        api.getStages(token!),
        api.getTemplates(token!),
        isAdmin ? api.getUsers(token!) : Promise.resolve([]),
      ]);
      setRules(rulesData);
      setStages(stagesData);
      setTemplates(templatesData);
      setUsers(usersData);
    } catch {
      toast.error("Error al cargar reglas");
    } finally {
      setLoading(false);
    }
  }, [filterTrigger, token]);

  useEffect(() => { load(); }, [load]);

  const filtered = rules.filter((r) => {
    if (scope === "mine") return r.userId === user?.id;
    if (scope === "global") return r.userId === null;
    return true;
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, conditions: [], actions: [{ ...EMPTY_ACTION }], workingHours: { ...DEFAULT_WORKING_HOURS } });
    setShowModal(true);
  };

  const openEdit = (r: Rule) => {
    setEditing(r);
    setForm({
      name: r.name,
      trigger: r.trigger,
      priority: r.priority,
      enabled: r.enabled,
      conditions: jsonToConditions(r.conditions),
      actions: r.actions.length > 0 ? [...r.actions] : [{ ...EMPTY_ACTION }],
      global: r.userId === null,
      workingHours: r.workingHours ?? { ...DEFAULT_WORKING_HOURS },
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("El nombre es obligatorio"); return; }
    const parsedConditions = conditionsToJson(form.conditions);
    const cleanActions = form.actions.filter((a) => a.type);
    if (cleanActions.length === 0) { toast.error("Agrega al menos una acción"); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        trigger: form.trigger,
        priority: form.priority,
        enabled: form.enabled,
        conditions: parsedConditions,
        actions: cleanActions,
        workingHours: form.workingHours.enabled ? form.workingHours : null,
      };
      if (isAdmin) payload.global = form.global;
      if (editing) {
        await api.updateRule(token!, editing.id, payload);
        toast.success("Regla actualizada");
      } else {
        await api.createRule(token!, payload);
        toast.success("Regla creada");
      }
      setShowModal(false);
      load();
    } catch {
      toast.error(editing ? "Error al actualizar" : "Error al crear");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({ title: "Eliminar regla", message: "¿Estás seguro de eliminar esta regla? Esta acción no se puede deshacer.", confirmLabel: "Eliminar", danger: true });
    if (!ok) return;
    try { await api.deleteRule(token!, id); toast.success("Regla eliminada"); load(); } catch { toast.error("Error al eliminar"); }
  };

  const handleToggle = async (r: Rule) => {
    try {
      await api.updateRule(token!, r.id, { enabled: !r.enabled });
      toast.info(r.enabled ? "Regla desactivada" : "Regla activada");
      load();
    } catch { toast.error("Error al cambiar estado"); }
  };

  // Condition helpers
  const addCondition = () => {
    setForm({ ...form, conditions: [...form.conditions, { ...EMPTY_CONDITION }] });
  };
  const updateCondition = (idx: number, patch: Partial<Condition>) => {
    const updated = [...form.conditions];
    updated[idx] = { ...updated[idx], ...patch };
    setForm({ ...form, conditions: updated });
  };
  const removeCondition = (idx: number) => {
    setForm({ ...form, conditions: form.conditions.filter((_, i) => i !== idx) });
  };

  // Action helpers
  const updateAction = (idx: number, patch: Partial<RuleAction>) => {
    const updated = [...form.actions];
    // Only reset when the action TYPE itself changes (not when other fields include type via spread)
    const isTypeChange = patch.type && patch.type !== updated[idx].type;
    updated[idx] = isTypeChange ? { type: patch.type! } : { ...updated[idx], ...patch };
    setForm({ ...form, actions: updated });
  };
  const addAction = () => setForm({ ...form, actions: [...form.actions, { ...EMPTY_ACTION }] });
  const removeAction = (idx: number) => {
    if (form.actions.length <= 1) return;
    setForm({ ...form, actions: form.actions.filter((_, i) => i !== idx) });
  };

  const triggerLabel = (t: string) => TRIGGER_OPTIONS.find((o) => o.value === t)?.label ?? t;
  const actionLabel = (t: string) => ACTION_TYPES.find((o) => o.value === t)?.label ?? t;

  const ownerBadge = (r: Rule) => {
    if (r.userId === null) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <Globe className="w-3 h-3" /> Global
        </span>
      );
    }
    if (r.userId === user?.id) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
          <UserIcon className="w-3 h-3" /> Mía
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200">
        <UserIcon className="w-3 h-3" /> {r.user?.name || r.user?.email || "Otro"}
      </span>
    );
  };

  // ─── Condition value input renderer ────────────────
  const renderConditionValue = (condition: Condition, idx: number) => {
    const fieldDef = CONDITION_FIELDS.find((f) => f.value === condition.field);
    if (!fieldDef) {
      return (
        <input type="text" value={condition.value} onChange={(e) => updateCondition(idx, { value: e.target.value })} placeholder="Valor" className="input flex-1" />
      );
    }
    if (fieldDef.type === "select" && "options" in fieldDef) {
      return (
        <select value={condition.value} onChange={(e) => updateCondition(idx, { value: e.target.value })} className="input flex-1">
          <option value="">Seleccionar...</option>
          {fieldDef.options!.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
        </select>
      );
    }
    if (fieldDef.type === "stage") {
      return (
        <select value={condition.value} onChange={(e) => updateCondition(idx, { value: e.target.value })} className="input flex-1">
          <option value="">Seleccionar etapa...</option>
          {stages.map((s) => (<option key={s.key} value={s.key}>{s.name}</option>))}
        </select>
      );
    }
    if (fieldDef.type === "boolean") {
      return (
        <select value={condition.value} onChange={(e) => updateCondition(idx, { value: e.target.value })} className="input flex-1">
          <option value="">Seleccionar...</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      );
    }
    if (fieldDef.type === "number") {
      return (
        <input type="number" value={condition.value} onChange={(e) => updateCondition(idx, { value: e.target.value })} placeholder="Cantidad" className="input flex-1" min="0" />
      );
    }
    return (
      <input type="text" value={condition.value} onChange={(e) => updateCondition(idx, { value: e.target.value })} placeholder="Valor" className="input flex-1" />
    );
  };

  // ─── Action detail renderer ────────────────────────
  const renderActionDetail = (action: RuleAction, idx: number) => {
    switch (action.type) {
      case "assign":
        return (
          <select value={action.userId ?? ""} onChange={(e) => updateAction(idx, { ...action, userId: e.target.value })} className="input">
            <option value="">Seleccionar agente...</option>
            <option value="round_robin">🔄 Round Robin (rotativo)</option>
            {users.filter((u) => u.role === "AGENT" || u.role === "BUSINESS").map((u) => (
              <option key={u.id} value={u.id}>{u.name || u.email} ({u.role})</option>
            ))}
          </select>
        );
      case "send_template":
        return (
          <div className="grid grid-cols-2 gap-2">
            <select value={action.templateKey ?? ""} onChange={(e) => updateAction(idx, { ...action, templateKey: e.target.value })} className="input">
              <option value="">Seleccionar plantilla...</option>
              {templates.map((t) => (<option key={t.key} value={t.key}>{t.name}</option>))}
            </select>
            <select value={action.channel ?? ""} onChange={(e) => updateAction(idx, { ...action, channel: e.target.value })} className="input">
              <option value="">Canal automático</option>
              {CHANNEL_OPTIONS.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
            </select>
          </div>
        );
      case "change_status":
        return (
          <select value={action.value ?? ""} onChange={(e) => updateAction(idx, { ...action, value: e.target.value })} className="input">
            <option value="">Seleccionar estado...</option>
            {STATUS_OPTIONS.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
          </select>
        );
      case "change_stage":
        return (
          <select value={action.value ?? ""} onChange={(e) => updateAction(idx, { ...action, value: e.target.value })} className="input">
            <option value="">Seleccionar etapa...</option>
            {stages.map((s) => (<option key={s.key} value={s.key}>{s.name}</option>))}
          </select>
        );
      case "add_note":
        return (
          <textarea rows={2} value={action.content ?? ""} onChange={(e) => updateAction(idx, { ...action, content: e.target.value })} placeholder="Contenido de la nota..." className="input" />
        );
      case "notify":
        return (
          <input type="text" value={action.content ?? ""} onChange={(e) => updateAction(idx, { ...action, content: e.target.value })} placeholder="Mensaje de notificación" className="input" />
        );
      case "send_ai_message":
        return (
          <div className="space-y-2">
            <textarea rows={2} value={action.content ?? ""} onChange={(e) => updateAction(idx, { ...action, content: e.target.value })} placeholder="Instrucción para la IA. Ej: 'Pregúntale al cliente si sigue interesado en la propiedad'" className="input" />
            <select value={action.channel ?? ""} onChange={(e) => updateAction(idx, { ...action, channel: e.target.value })} className="input">
              <option value="">Canal automático</option>
              {CHANNEL_OPTIONS.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
            </select>
          </div>
        );
      case "wait":
        return (
          <div>
            <div className="flex items-center gap-2">
              <input type="number" value={action.delayMs ? Math.round(action.delayMs / 86400000) : ""} onChange={(e) => { const days = parseInt(e.target.value) || 0; updateAction(idx, { ...action, delayMs: days * 86400000 }); }} placeholder="Días" className="input w-24" min="0" />
              <span className="text-sm text-gray-500 dark:text-gray-400">días</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Espera antes de ejecutar la siguiente acción</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <PageHeader
        title="Automatizaciones"
        description="Reglas que se ejecutan automáticamente según eventos y condiciones"
        action={<button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> Nueva automatización</button>}
      />

      <div className="flex flex-wrap gap-3 mb-6">
        <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} className="input w-auto">
          <option value="all">Todas</option>
          <option value="mine">Mis reglas</option>
          <option value="global">Globales</option>
        </select>
        <select value={filterTrigger} onChange={(e) => setFilterTrigger(e.target.value)} className="input w-auto">
          <option value="">Todos los triggers</option>
          {TRIGGER_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      </div>

      {loading ? (
        <PageLoader />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="Sin automatizaciones"
          description="Creá reglas para automatizar el seguimiento de tus leads"
          action={<button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> Nueva automatización</button>}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className={`card p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 ${!r.enabled ? "opacity-60" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{r.name}</h3>
                  <Badge variant="purple">{TRIGGER_OPTIONS.find((t) => t.value === r.trigger)?.icon ?? "⚡"} {triggerLabel(r.trigger)}</Badge>
                  {ownerBadge(r)}
                  {r.workingHours?.enabled && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800">
                      <Clock className="w-3 h-3" /> Horario
                    </span>
                  )}
                </div>

                {Object.keys(r.conditions).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">SI:</span>
                    {Object.entries(r.conditions).map(([k, v]) => {
                      const fieldDef = CONDITION_FIELDS.find((f) => f.value === k);
                      const label = fieldDef?.label ?? k;
                      let operatorLabel = "=";
                      let rawValue: unknown = v;

                      // Handle operator objects like { "not_contains": "captacion" }
                      if (v && typeof v === "object" && !Array.isArray(v)) {
                        const entries = Object.entries(v as Record<string, unknown>);
                        if (entries.length > 0) {
                          const op = OPERATORS.find((o) => o.value === entries[0][0]);
                          operatorLabel = op?.label ?? entries[0][0];
                          rawValue = entries[0][1];
                        }
                      }

                      let displayValue = String(rawValue);
                      if (fieldDef?.type === "select" && "options" in fieldDef) {
                        const opt = fieldDef.options!.find((o) => o.value === String(rawValue));
                        if (opt) displayValue = opt.label;
                      }
                      if (fieldDef?.type === "stage") {
                        const stage = stages.find((s) => s.key === String(rawValue));
                        if (stage) displayValue = stage.name;
                      }
                      return (
                        <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs">
                          {label} {operatorLabel} {displayValue}
                        </span>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">ENTONCES:</span>
                  {r.actions.map((a, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      <Badge variant="info">
                        {ACTION_TYPES.find((t) => t.value === a.type)?.icon ?? "⚡"} {actionLabel(a.type)}
                        {a.templateKey && <span className="opacity-70"> → {templates.find((t) => t.key === a.templateKey)?.name ?? a.templateKey}</span>}
                        {a.value && a.type === "change_stage" && <span className="opacity-70"> → {stages.find((s) => s.key === a.value)?.name ?? a.value}</span>}
                        {a.value && a.type === "change_status" && <span className="opacity-70"> → {STATUS_OPTIONS.find((s) => s.value === a.value)?.label ?? a.value}</span>}
                        {a.type === "wait" && a.delayMs && <span className="opacity-70"> {msToReadable(a.delayMs)}</span>}
                      </Badge>
                      {i < r.actions.length - 1 && <ArrowRight className="w-3 h-3 text-gray-300" />}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Toggle checked={r.enabled} onChange={() => handleToggle(r)} size="sm" />
                <button onClick={() => openEdit(r)} className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(r.id)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Visual Builder Modal ─────────────────────── */}
      {showModal && (
        <Modal open onClose={() => setShowModal(false)} title={editing ? "Editar automatización" : "Nueva automatización"} size="lg" footer={<><button onClick={() => setShowModal(false)} className="btn-secondary">Cancelar</button><button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? "Guardando..." : editing ? "Actualizar" : "Crear"}</button></>}>
          <div className="space-y-6">
            {/* Name */}
            <div>
              <label className="label">Nombre de la automatización</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Seguimiento automático a leads sin respuesta" className="input" />
            </div>

            {/* Trigger selector */}
            <div>
              <label className="label">¿Cuándo se ejecuta?</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {TRIGGER_OPTIONS.map((t) => (
                  <button key={t.value} type="button" onClick={() => setForm({ ...form, trigger: t.value })} className={`text-left p-3 rounded-xl border-2 transition-all ${form.trigger === t.value ? "border-brand-500 bg-brand-50 dark:bg-brand-950 shadow-sm" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800"}`}>
                    <div className="text-lg mb-1">{t.icon}</div>
                    <div className={`text-sm font-medium ${form.trigger === t.value ? "text-brand-700 dark:text-brand-300" : "text-gray-900 dark:text-white"}`}>{t.label}</div>
                    <div className={`text-xs mt-0.5 ${form.trigger === t.value ? "text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"}`}>{t.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* No-response specific */}
            {form.trigger === "no_response" && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                <label className="label text-amber-800">¿Cuántos días sin respuesta?</label>
                <div className="flex items-center gap-2">
                  <input type="number" value={form.conditions.find((c) => c.field === "noResponseDays")?.value ?? ""} onChange={(e) => { const existing = form.conditions.filter((c) => c.field !== "noResponseDays"); setForm({ ...form, conditions: [...existing, { field: "noResponseDays", operator: "greater_than", value: e.target.value }] }); }} placeholder="3" className="input w-24" min="1" />
                  <span className="text-sm text-amber-700">días sin respuesta del cliente</span>
                </div>
              </div>
            )}

            {/* Stage change specific */}
            {form.trigger === "stage.changed" && (
              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200">
                <label className="label text-purple-800">¿Desde qué etapa o hacia qué etapa?</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-purple-600 font-medium">Desde (opcional)</label>
                    <select value={form.conditions.find((c) => c.field === "stageFrom")?.value ?? ""} onChange={(e) => { const existing = form.conditions.filter((c) => c.field !== "stageFrom"); if (e.target.value) { setForm({ ...form, conditions: [...existing, { field: "stageFrom", operator: "equals", value: e.target.value }] }); } else { setForm({ ...form, conditions: existing }); } }} className="input">
                      <option value="">Cualquier etapa</option>
                      {stages.map((s) => (<option key={s.key} value={s.key}>{s.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-purple-600 font-medium">Hacia (opcional)</label>
                    <select value={form.conditions.find((c) => c.field === "stageTo")?.value ?? ""} onChange={(e) => { const existing = form.conditions.filter((c) => c.field !== "stageTo"); if (e.target.value) { setForm({ ...form, conditions: [...existing, { field: "stageTo", operator: "equals", value: e.target.value }] }); } else { setForm({ ...form, conditions: existing }); } }} className="input">
                      <option value="">Cualquier etapa</option>
                      {stages.map((s) => (<option key={s.key} value={s.key}>{s.name}</option>))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Conditions builder */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Condiciones adicionales (opcionales)</label>
                <button onClick={addCondition} type="button" className="text-xs text-brand-600 hover:text-brand-700 font-medium">+ Agregar condición</button>
              </div>
              {form.conditions.filter((c) => !["noResponseDays", "stageFrom", "stageTo"].includes(c.field)).length === 0 && (
                <p className="text-xs text-gray-400 py-2">Sin condiciones adicionales — la regla se ejecuta siempre que ocurra el trigger</p>
              )}
              <div className="space-y-2">
                {form.conditions.map((condition, idx) => {
                  if (["noResponseDays", "stageFrom", "stageTo"].includes(condition.field)) return null;
                  return (
                    <div key={idx} className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200">
                      <select value={condition.field} onChange={(e) => updateCondition(idx, { field: e.target.value, value: "" })} className="input w-auto">
                        {CONDITION_FIELDS.filter((f) => f.value !== "noResponseDays").map((f) => (<option key={f.value} value={f.value}>{f.label}</option>))}
                      </select>
                      <select value={condition.operator} onChange={(e) => updateCondition(idx, { operator: e.target.value })} className="input w-auto">
                        {OPERATORS.map((op) => (<option key={op.value} value={op.value}>{op.label}</option>))}
                      </select>
                      {renderConditionValue(condition, idx)}
                      <button onClick={() => removeCondition(idx)} type="button" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition shrink-0"><X className="w-4 h-4" /></button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions builder */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">¿Qué hacer?</label>
                <button onClick={addAction} type="button" className="text-xs text-brand-600 hover:text-brand-700 font-medium">+ Agregar acción</button>
              </div>
              <div className="space-y-3">
                {form.actions.map((action, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden bg-white dark:bg-gray-800">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
                      <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                      <select value={action.type} onChange={(e) => updateAction(idx, { type: e.target.value as RuleAction["type"] })} className="input flex-1 bg-white dark:bg-gray-800">
                        {ACTION_TYPES.map((a) => (<option key={a.value} value={a.value}>{a.icon} {a.label}</option>))}
                      </select>
                      {form.actions.length > 1 && (
                        <button onClick={() => removeAction(idx)} type="button" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"><X className="w-4 h-4" /></button>
                      )}
                    </div>
                    <div className="px-4 py-3">
                      {renderActionDetail(action, idx)}
                      {action.type !== "wait" && (
                        <details className="mt-2">
                          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 dark:text-gray-400">⏱️ Retraso opcional</summary>
                          <div className="flex items-center gap-2 mt-2">
                            <input type="number" value={action.delayMs ? Math.round(action.delayMs / 60000) : ""} onChange={(e) => { const mins = parseInt(e.target.value) || 0; updateAction(idx, { ...action, delayMs: mins > 0 ? mins * 60000 : undefined }); }} placeholder="0" className="input w-20" min="0" />
                            <span className="text-xs text-gray-500 dark:text-gray-400">minutos de retraso</span>
                          </div>
                        </details>
                      )}
                    </div>
                    {idx < form.actions.length - 1 && (
                      <div className="flex justify-center py-1 text-gray-300"><ArrowRight className="w-4 h-4 rotate-90" /></div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div className="grid grid-cols-2 gap-4">

            {/* Working hours schedule */}
            <div className="col-span-2">
              <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                <div className="flex items-center gap-3 mb-3">
                  <Toggle
                    checked={form.workingHours.enabled}
                    onChange={(v) =>
                      setForm({
                        ...form,
                        workingHours: { ...form.workingHours, enabled: v },
                      })
                    }
                  />
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <Clock className="w-4 h-4" /> Horario de trabajo
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Si está fuera de horario, las acciones se encolan y se ejecutan al inicio del próximo horario
                    </p>
                  </div>
                </div>

                {form.workingHours.enabled && (
                  <div className="space-y-3 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Zona horaria</label>
                      <select
                        value={form.workingHours.timezone}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            workingHours: { ...form.workingHours, timezone: e.target.value },
                          })
                        }
                        className="input mt-1"
                      >
                        {[
                          "America/Argentina/Buenos_Aires",
                          "America/Montevideo",
                          "America/Santiago",
                          "America/Bogota",
                          "America/Lima",
                          "America/Mexico_City",
                          "America/New_York",
                          "America/Los_Angeles",
                          "America/Sao_Paulo",
                          "Europe/Madrid",
                          "Europe/London",
                          "UTC",
                        ].map((tz) => (
                          <option key={tz} value={tz}>
                            {tz.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Días y horarios activos</label>
                      {DAY_NAMES.map((dayName, dayIdx) => {
                        const entry = form.workingHours.schedule.find((s) => s.day === dayIdx);
                        const isActive = !!entry;
                        return (
                          <div key={dayIdx} className="flex items-center gap-2">
                            <label className="w-24 text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                checked={isActive}
                                onChange={(e) => {
                                  const schedule = e.target.checked
                                    ? [...form.workingHours.schedule, { day: dayIdx, from: "09:00", to: "18:00" }]
                                    : form.workingHours.schedule.filter((s) => s.day !== dayIdx);
                                  setForm({
                                    ...form,
                                    workingHours: { ...form.workingHours, schedule },
                                  });
                                }}
                                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                              />
                              {dayName}
                            </label>
                            {isActive && (
                              <>
                                <input
                                  type="time"
                                  value={entry.from}
                                  onChange={(e) => {
                                    const schedule = form.workingHours.schedule.map((s) =>
                                      s.day === dayIdx ? { ...s, from: e.target.value } : s,
                                    );
                                    setForm({
                                      ...form,
                                      workingHours: { ...form.workingHours, schedule },
                                    });
                                  }}
                                  className="input w-28 text-xs"
                                />
                                <span className="text-xs text-gray-400">a</span>
                                <input
                                  type="time"
                                  value={entry.to}
                                  onChange={(e) => {
                                    const schedule = form.workingHours.schedule.map((s) =>
                                      s.day === dayIdx ? { ...s, to: e.target.value } : s,
                                    );
                                    setForm({
                                      ...form,
                                      workingHours: { ...form.workingHours, schedule },
                                    });
                                  }}
                                  className="input w-28 text-xs"
                                />
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
              <div>
                <label className="label">Prioridad</label>
                <input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })} className="input" />
                <p className="text-xs text-gray-400 mt-0.5">Menor número = mayor prioridad</p>
              </div>
              <div className="flex items-end pb-1">
                <div className="flex items-center gap-3">
                  <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} />
                  <label className="text-sm text-gray-700 dark:text-gray-300">Activa</label>
                </div>
              </div>
            </div>

            {isAdmin && (
              <div className="flex items-center gap-3 p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
                <Toggle checked={form.global} onChange={(v) => setForm({ ...form, global: v })} />
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Regla global</label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Se aplica a todos los leads del equipo</p>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
