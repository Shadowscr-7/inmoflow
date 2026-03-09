"use client";

import { useAuth } from "@/lib/auth";
import { api, FollowUpSequence, FollowUpStep } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import {
  RefreshCcw, Plus, X, Edit2, Trash2, Clock, Play, Pause, ChevronDown, ChevronUp, Hash,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

const TRIGGER_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "lead_created", label: "Al crear lead" },
  { value: "stage_changed", label: "Al cambiar etapa" },
];

const CHANNEL_OPTIONS = [
  { value: "", label: "Cualquier canal" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "TELEGRAM", label: "Telegram" },
  { value: "EMAIL", label: "Email" },
];

interface StepForm {
  order: number;
  delayHours: number;
  channel: string;
  content: string;
}

export default function FollowUpsPage() {
  const { token } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [sequences, setSequences] = useState<FollowUpSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FollowUpSequence | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Form
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("manual");
  const [enabled, setEnabled] = useState(true);
  const [steps, setSteps] = useState<StepForm[]>([{ order: 1, delayHours: 24, channel: "", content: "" }]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.getSequences(token);
      setSequences(res);
    } catch { toast.error("Error al cargar secuencias"); }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setTrigger("manual");
    setEnabled(true);
    setSteps([{ order: 1, delayHours: 24, channel: "", content: "" }]);
    setShowModal(true);
  };

  const openEdit = (s: FollowUpSequence) => {
    setEditing(s);
    setName(s.name);
    setTrigger(s.trigger);
    setEnabled(s.enabled);
    setSteps(s.steps.map((st) => ({
      order: st.order,
      delayHours: st.delayHours,
      channel: st.channel ?? "",
      content: st.content,
    })));
    setShowModal(true);
  };

  const addStep = () => {
    setSteps([...steps, { order: steps.length + 1, delayHours: 24, channel: "", content: "" }]);
  };

  const removeStep = (idx: number) => {
    setSteps(steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })));
  };

  const updateStep = (idx: number, field: keyof StepForm, value: string | number) => {
    const updated = [...steps];
    (updated[idx] as any)[field] = value;
    setSteps(updated);
  };

  const handleSave = async () => {
    if (!token || !name) return;
    setSaving(true);
    try {
      const data = {
        name,
        trigger,
        enabled,
        steps: steps.map((s) => ({
          order: s.order,
          delayHours: Number(s.delayHours),
          channel: s.channel || undefined,
          content: s.content,
        })),
      };
      if (editing) {
        await api.updateSequence(token, editing.id, data);
        toast.success("Secuencia actualizada");
      } else {
        await api.createSequence(token, data);
        toast.success("Secuencia creada");
      }
      setShowModal(false);
      load();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const handleDelete = async (s: FollowUpSequence) => {
    const ok = await confirm({ title: "Eliminar secuencia", message: `¿Eliminar "${s.name}"?`, confirmLabel: "Eliminar", danger: true });
    if (!ok || !token) return;
    try {
      await api.deleteSequence(token, s.id);
      toast.success("Secuencia eliminada");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const toggleEnabled = async (s: FollowUpSequence) => {
    if (!token) return;
    try {
      await api.updateSequence(token, s.id, { enabled: !s.enabled });
      load();
    } catch { toast.error("Error al actualizar secuencia"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <RefreshCcw className="h-7 w-7 text-indigo-500" /> Seguimientos Automáticos
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{sequences.length} secuencias</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus className="h-4 w-4" /> Nueva secuencia
        </button>
      </div>

      {loading ? <div className="flex justify-center py-12"><Spinner /></div> : sequences.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <RefreshCcw className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Sin secuencias</p>
          <p className="text-sm mt-1">Crea una secuencia para hacer follow-up automático a tus leads</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sequences.map((s) => (
            <div key={s.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <button onClick={() => toggleEnabled(s)}
                    className={`p-1.5 rounded-lg transition ${s.enabled ? "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400" : "bg-gray-100 text-gray-400 dark:bg-gray-700"}`}>
                    {s.enabled ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0">
                    <h3 className="font-medium text-gray-900 dark:text-white truncate">{s.name}</h3>
                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span>{TRIGGER_OPTIONS.find((t) => t.value === s.trigger)?.label ?? s.trigger}</span>
                      <span>·</span>
                      <span>{s.steps.length} pasos</span>
                      {s._count && <><span>·</span><span>{s._count.runs} ejecuciones</span></>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setExpanded(expanded === s.id ? null : s.id)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
                    {expanded === s.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <button onClick={() => openEdit(s)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded"><Edit2 className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(s)} className="p-1.5 text-gray-400 hover:text-red-600 rounded"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>

              {expanded === s.id && (
                <div className="px-4 pb-4 border-t dark:border-gray-700 pt-3">
                  <div className="space-y-2">
                    {s.steps.map((step, i) => (
                      <div key={step.id} className="flex items-start gap-3 text-sm">
                        <div className="flex flex-col items-center">
                          <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-400">
                            {i + 1}
                          </div>
                          {i < s.steps.length - 1 && <div className="w-0.5 h-6 bg-gray-200 dark:bg-gray-600 mt-1" />}
                        </div>
                        <div className="flex-1 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1">
                            <Clock className="h-3 w-3" /> Esperar {step.delayHours}h
                            {step.channel && <span className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">{step.channel}</span>}
                          </div>
                          <p className="text-gray-700 dark:text-gray-300">{step.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-xl mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? "Editar secuencia" : "Nueva secuencia"}</h2>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nombre *</label>
                  <input value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Ej: Seguimiento nuevos leads" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Disparador</label>
                    <select value={trigger} onChange={(e) => setTrigger(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                      {TRIGGER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}
                        className="rounded border-gray-300" />
                      Habilitada
                    </label>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Pasos</label>
                    <button onClick={addStep} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                      <Plus className="h-3 w-3" /> Agregar paso
                    </button>
                  </div>
                  <div className="space-y-3">
                    {steps.map((step, i) => (
                      <div key={i} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <Hash className="h-3 w-3" /> Paso {i + 1}
                          </span>
                          {steps.length > 1 && (
                            <button onClick={() => removeStep(i)} className="text-xs text-red-500 hover:underline">Eliminar</button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Esperar (horas)</label>
                            <input type="number" min={1} value={step.delayHours} onChange={(e) => updateStep(i, "delayHours", Number(e.target.value))}
                              className="w-full border rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Canal</label>
                            <select value={step.channel} onChange={(e) => updateStep(i, "channel", e.target.value)}
                              className="w-full border rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                              {CHANNEL_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Mensaje</label>
                          <textarea rows={2} value={step.content} onChange={(e) => updateStep(i, "content", e.target.value)} placeholder="Hola {{name}}, ¿sigues interesado?"
                            className="w-full border rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t dark:border-gray-700">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancelar</button>
                <button onClick={handleSave} disabled={saving || !name || steps.some((s) => !s.content)}
                  className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2">
                  {saving && <Spinner className="h-4 w-4" />} {editing ? "Guardar" : "Crear"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
