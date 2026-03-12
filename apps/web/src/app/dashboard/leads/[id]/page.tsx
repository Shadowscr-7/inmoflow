"use client";

import { useAuth } from "@/lib/auth";
import { api, type Lead, type EventLogEntry, type User, type Tag, type LeadTag, type CustomFieldDefinition, type CustomFieldValue, type ScoringBreakdown } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MessageSquare, Pencil, Trash2, Phone, Mail, Radio, Globe, Clock, User as UserIcon, Layers, Tag as TagIcon, Settings2, X, Plus, Flame, RefreshCw, Sparkles, Loader2 } from "lucide-react";
import { StatusBadge, PageLoader, useToast, useConfirm } from "@/components/ui";

const ALL_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "VISIT", "NEGOTIATION", "WON", "LOST"];
const STATUS_LABELS: Record<string, string> = {
  NEW: "Nuevo", CONTACTED: "Contactado", QUALIFIED: "Calificado",
  VISIT: "Visita", NEGOTIATION: "Negociación", WON: "Ganado", LOST: "Perdido",
};

interface Stage { id: string; key: string; name: string; order: number; }

export default function LeadDetailPage() {
  const { token } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [timeline, setTimeline] = useState<EventLogEntry[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ status: "", stageKey: "", assigneeId: "", notes: "" });
  const [saving, setSaving] = useState(false);

  // Tags & Custom Fields
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [leadTags, setLeadTags] = useState<LeadTag[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([]);
  const [customValues, setCustomValues] = useState<CustomFieldValue[]>([]);
  const [editingCF, setEditingCF] = useState(false);
  const [cfForm, setCfForm] = useState<Record<string, string>>({});

  // Lead Scoring
  const [scoring, setScoring] = useState<ScoringBreakdown | null>(null);
  const [scoringLoading, setScoringLoading] = useState(false);

  // AI Summary
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);

  const loadLead = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getLead(token, leadId);
      setLead(data);
      setForm({
        status: data.status,
        stageKey: data.stage?.key ?? "",
        assigneeId: data.assigneeId ?? "",
        notes: data.notes ?? "",
      });
    } catch {
      router.push("/dashboard/leads");
    }
  }, [token, leadId, router]);

  const loadTimeline = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getLeadTimeline(token, leadId);
      setTimeline(data);
    } catch { /* ignore */ }
  }, [token, leadId]);

  useEffect(() => { loadLead(); loadTimeline(); }, [loadLead, loadTimeline]);

  // Load tags & custom fields for this lead
  const loadLeadExtras = useCallback(async () => {
    if (!token) return;
    try {
      const [tags, leadT, cfDefs, cfVals] = await Promise.all([
        api.getTags(token),
        api.getLeadTags(token, leadId),
        api.getCustomFields(token),
        api.getLeadCustomValues(token, leadId),
      ]);
      setAllTags(tags);
      setLeadTags(leadT);
      setCustomFieldDefs(cfDefs);
      setCustomValues(cfVals);
      const valMap: Record<string, string> = {};
      cfVals.forEach((v: CustomFieldValue) => { valMap[v.definitionId] = v.value; });
      setCfForm(valMap);
    } catch { /* */ }
  }, [token, leadId]);

  useEffect(() => { loadLeadExtras(); }, [loadLeadExtras]);

  // Load scoring breakdown
  const loadScoring = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getLeadScoringBreakdown(token, leadId);
      setScoring(data);
    } catch { /* */ }
  }, [token, leadId]);

  useEffect(() => { loadScoring(); }, [loadScoring]);

  const handleRecalculate = async () => {
    if (!token) return;
    setScoringLoading(true);
    try {
      await api.recalculateLeadScore(token, leadId);
      await Promise.all([loadLead(), loadScoring()]);
      toast.success("Score recalculado");
    } catch { toast.error("Error al recalcular"); }
    setScoringLoading(false);
  };

  const handleToggleTag = async (tagId: string, assigned: boolean) => {
    if (!token) return;
    try {
      if (assigned) {
        const newIds = leadTags.filter((lt) => lt.tagId !== tagId).map((lt) => lt.tagId);
        await api.setLeadTags(token, leadId, newIds);
      } else {
        const newIds = [...leadTags.map((lt) => lt.tagId), tagId];
        await api.setLeadTags(token, leadId, newIds);
      }
      loadLeadExtras();
    } catch { /* */ }
  };

  const handleSaveCF = async () => {
    if (!token) return;
    try {
      const values = Object.entries(cfForm).filter(([, v]) => v !== "").map(([definitionId, value]) => ({ definitionId, value }));
      await api.setLeadCustomValues(token, leadId, values);
      toast.success("Campos guardados");
      setEditingCF(false);
      loadLeadExtras();
    } catch { toast.error("Error al guardar campos"); }
  };

  useEffect(() => {
    if (!token) return;
    api.getStages(token).then(setStages).catch(() => {});
    api.getUsers(token).then(setUsers).catch(() => {});
  }, [token]);

  const handleSave = async () => {
    if (!token || !lead) return;
    setSaving(true);
    try {
      const updates: Record<string, string | undefined> = {};
      if (form.status !== lead.status) updates.status = form.status;
      if (form.stageKey !== (lead.stage?.key ?? "")) updates.stageKey = form.stageKey || undefined;
      if (form.assigneeId !== (lead.assigneeId ?? "")) updates.assigneeId = form.assigneeId || undefined;
      if (form.notes !== (lead.notes ?? "")) updates.notes = form.notes;
      if (Object.keys(updates).length > 0) {
        await api.updateLead(token, leadId, updates);
        toast.success("Lead actualizado");
      }
      setEditing(false);
      loadLead();
      loadTimeline();
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (!lead) return <PageLoader text="Cargando lead..." />;

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Eliminar lead",
      message: `¿Estás seguro de eliminar a "${lead.name ?? "este lead"}"? Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteLead(token!, leadId);
      toast.success("Lead eliminado");
      router.push("/dashboard/leads");
    } catch {
      toast.error("Error al eliminar lead");
    }
  };

  const EVENT_TYPE_LABELS: Record<string, string> = {
    LEAD_CREATED: "Lead creado",
    LEAD_UPDATED: "Lead actualizado",
    STAGE_CHANGED: "Etapa cambiada",
    STATUS_CHANGED: "Estado cambiado",
    MESSAGE_IN: "Mensaje recibido",
    MESSAGE_OUT: "Mensaje enviado",
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/leads" className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">{lead.name ?? "Lead sin nombre"}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Creado el {new Date(lead.createdAt).toLocaleDateString("es", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <StatusBadge status={lead.status} />
        {!editing && (
          <>
            <Link
              href={`/dashboard/leads/${leadId}/conversation`}
              className="btn-primary"
            >
              <MessageSquare className="w-4 h-4" /> Chat
            </Link>
            <button onClick={() => setEditing(true)} className="btn-secondary">
              <Pencil className="w-4 h-4" /> Editar
            </button>
            <button onClick={handleDelete} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition" title="Eliminar lead">
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact Card */}
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Información de contacto</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoItem icon={Phone} label="Teléfono" value={lead.phone} />
              <InfoItem icon={Mail} label="Email" value={lead.email} />
              <InfoItem icon={Radio} label="Canal" value={lead.primaryChannel} />
              <InfoItem icon={Globe} label="Fuente" value={lead.source?.name} />
            </div>
          </div>

          {/* Edit Form */}
          {editing && (
            <div className="card p-6 animate-fade-in">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Editar Lead</h2>
              <div className="space-y-4">
                <div>
                  <label className="label">Estado</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="input"
                  >
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Etapa</label>
                  <select
                    value={form.stageKey}
                    onChange={(e) => setForm({ ...form, stageKey: e.target.value })}
                    className="input"
                  >
                    <option value="">Sin etapa</option>
                    {stages.map((s) => (
                      <option key={s.id} value={s.key}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Asignado a</label>
                  <select
                    value={form.assigneeId}
                    onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
                    className="input"
                  >
                    <option value="">Sin asignar</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Notas</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                    className="input"
                  />
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button
                    onClick={() => { setEditing(false); setForm({ status: lead.status, stageKey: lead.stage?.key ?? "", assigneeId: lead.assigneeId ?? "", notes: lead.notes ?? "" }); }}
                    className="btn-secondary"
                  >
                    Cancelar
                  </button>
                  <button onClick={handleSave} disabled={saving} className="btn-primary">
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {!editing && lead.notes && (
            <div className="card p-6">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Notas</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}

          {/* AI Summary */}
          {!editing && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500" /> Resumen IA
                </h2>
                <button
                  onClick={async () => {
                    if (!token) return;
                    setAiSummaryLoading(true);
                    try {
                      const res = await api.getLeadAiSummary(token, leadId);
                      setAiSummary(res.summary);
                    } catch {
                      toast.error("No se pudo generar el resumen IA. Verifica que la IA esté configurada.");
                    }
                    setAiSummaryLoading(false);
                  }}
                  disabled={aiSummaryLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 transition disabled:opacity-50"
                >
                  {aiSummaryLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {aiSummaryLoading ? "Analizando..." : aiSummary ? "Regenerar" : "Generar resumen"}
                </button>
              </div>
              {aiSummary ? (
                <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {aiSummary}
                </div>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  Genera un resumen inteligente de este lead con análisis de sentimiento, estado y próximos pasos recomendados.
                </p>
              )}
            </div>
          )}

          {/* Tags */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <TagIcon className="w-4 h-4 text-gray-400" /> Tags
              </h2>
              <button onClick={() => setShowTagPicker(!showTagPicker)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> {showTagPicker ? "Cerrar" : "Gestionar"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {leadTags.length === 0 && !showTagPicker && (
                <span className="text-sm text-gray-400">Sin tags asignados</span>
              )}
              {leadTags.map((lt) => {
                const tag = allTags.find((t) => t.id === lt.tagId);
                if (!tag) return null;
                return (
                  <span key={lt.tagId} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: tag.color ?? "#6366f1" }}>
                    {tag.name}
                    <button onClick={() => handleToggleTag(lt.tagId, true)} className="opacity-70 hover:opacity-100"><X className="w-3 h-3" /></button>
                  </span>
                );
              })}
            </div>
            {showTagPicker && (
              <div className="mt-3 pt-3 border-t dark:border-gray-700">
                <div className="flex flex-wrap gap-1.5">
                  {allTags.filter((t) => !leadTags.some((lt) => lt.tagId === t.id)).map((tag) => (
                    <button key={tag.id} onClick={() => handleToggleTag(tag.id, false)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 transition">
                      <Plus className="w-3 h-3" /> {tag.name}
                    </button>
                  ))}
                  {allTags.filter((t) => !leadTags.some((lt) => lt.tagId === t.id)).length === 0 && (
                    <span className="text-xs text-gray-400">Todos los tags ya están asignados</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Custom Fields */}
          {customFieldDefs.length > 0 && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-gray-400" /> Campos personalizados
                </h2>
                {!editingCF ? (
                  <button onClick={() => setEditingCF(true)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">Editar</button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingCF(false); const valMap: Record<string, string> = {}; customValues.forEach((v) => { valMap[v.definitionId] = v.value; }); setCfForm(valMap); }}
                      className="text-xs text-gray-500 hover:underline">Cancelar</button>
                    <button onClick={handleSaveCF} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">Guardar</button>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {customFieldDefs.map((field) => {
                  const val = cfForm[field.id] ?? "";
                  return (
                    <div key={field.id}>
                      <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{field.name}{field.required && " *"}</label>
                      {editingCF ? (
                        field.fieldType === "BOOLEAN" ? (
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={val === "true"} onChange={(e) => setCfForm({ ...cfForm, [field.id]: e.target.checked ? "true" : "false" })} className="rounded" />
                            <span className="text-gray-700 dark:text-gray-300">{val === "true" ? "Sí" : "No"}</span>
                          </label>
                        ) : field.fieldType === "SELECT" ? (
                          <select value={val} onChange={(e) => setCfForm({ ...cfForm, [field.id]: e.target.value })} className="input text-sm">
                            <option value="">—</option>
                            {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : field.fieldType === "DATE" ? (
                          <input type="date" value={val} onChange={(e) => setCfForm({ ...cfForm, [field.id]: e.target.value })} className="input text-sm" />
                        ) : field.fieldType === "NUMBER" ? (
                          <input type="number" value={val} onChange={(e) => setCfForm({ ...cfForm, [field.id]: e.target.value })} className="input text-sm" />
                        ) : (
                          <input type="text" value={val} onChange={(e) => setCfForm({ ...cfForm, [field.id]: e.target.value })} className="input text-sm" />
                        )
                      ) : (
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {field.fieldType === "BOOLEAN" ? (val === "true" ? "Sí" : val === "false" ? "No" : "—") : val || "—"}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Timeline + Quick Info */}
        <div className="space-y-6">
          {/* Quick Info */}
          <div className="card p-5 space-y-3">
            <QuickInfoRow icon={Layers} label="Etapa" value={lead.stage?.name} />
            <QuickInfoRow icon={UserIcon} label="Asignado" value={lead.assignee?.name ?? lead.assignee?.email} />
            <QuickInfoRow icon={Clock} label="Creado" value={new Date(lead.createdAt).toLocaleDateString("es")} />
            <QuickInfoRow icon={Clock} label="Actualizado" value={new Date(lead.updatedAt).toLocaleDateString("es")} />
          </div>

          {/* Lead Scoring */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-500" /> Lead Score
              </h2>
              <button onClick={handleRecalculate} disabled={scoringLoading} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <RefreshCw className={`w-3 h-3 ${scoringLoading ? "animate-spin" : ""}`} /> Recalcular
              </button>
            </div>
            {scoring ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white ${
                    scoring.temperature === "HOT" ? "bg-red-500" : scoring.temperature === "WARM" ? "bg-amber-500" : "bg-gray-400"
                  }`}>
                    {scoring.score}
                  </div>
                  <div>
                    <div className="text-sm font-medium">
                      {scoring.temperature === "HOT" ? "🔥 Caliente" : scoring.temperature === "WARM" ? "🌡️ Tibio" : "❄️ Frío"}
                    </div>
                    <div className="text-xs text-gray-500">de 100 puntos</div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {scoring.factors.map((f) => (
                    <div key={f.factor} className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
                          <span>{f.detail}</span>
                          <span>{f.points}/{f.maxPoints}</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${f.maxPoints > 0 ? (f.points / f.maxPoints) * 100 : 0}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400">Sin score calculado</p>
            )}
          </div>

          {/* Timeline */}
          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Historial</h2>
            {timeline.length === 0 ? (
              <p className="text-sm text-gray-400">Sin actividad registrada.</p>
            ) : (
              <div className="space-y-4 relative">
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" />
                {timeline.map((ev) => (
                  <div key={ev.id} className="pl-7 relative">
                    <div className="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-brand-500 bg-white dark:bg-gray-800" />
                    <p className="text-xs text-gray-400">{new Date(ev.createdAt).toLocaleString("es")}</p>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{EVENT_TYPE_LABELS[ev.type] ?? ev.type}</p>
                    {ev.payload && Object.keys(ev.payload).length > 0 && (
                      <div className="mt-1 text-xs text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-lg p-2 overflow-auto max-h-20">
                        {Object.entries(ev.payload as Record<string, unknown>).map(([k, v]) => (
                          <div key={k}><span className="font-medium">{k}:</span> {JSON.stringify(v)}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
      </div>
      <div>
        <span className="text-xs text-gray-400 block">{label}</span>
        <span className="text-sm font-medium text-gray-900 dark:text-white">{value ?? "—"}</span>
      </div>
    </div>
  );
}

function QuickInfoRow({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
        <Icon className="w-4 h-4" />
        <span className="text-sm">{label}</span>
      </div>
      <span className="text-sm font-medium text-gray-900 dark:text-white">{value ?? "—"}</span>
    </div>
  );
}
