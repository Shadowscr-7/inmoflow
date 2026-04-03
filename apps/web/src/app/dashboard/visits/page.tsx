"use client";

import { useAuth } from "@/lib/auth";
import { api, Visit, Property, Lead } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import {
  Calendar, Plus, X, Clock, MapPin, User, ChevronLeft, ChevronRight, Edit2, Trash2, Check, XCircle, AlertTriangle, MessageSquare,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/errors";

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  CONFIRMED: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  COMPLETED: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  NO_SHOW: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
};
const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Programada", CONFIRMED: "Confirmada", COMPLETED: "Completada", CANCELLED: "Cancelada", NO_SHOW: "No asistió",
};
const STATUS_ICONS: Record<string, typeof Calendar> = {
  SCHEDULED: Clock, CONFIRMED: Check, COMPLETED: Check, CANCELLED: XCircle, NO_SHOW: AlertTriangle,
};

function getWeekDays(date: Date): Date[] {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
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
  return new Date(dateStr).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(d: Date) {
  return d.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
}

export default function VisitsPage() {
  const { token } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Visit | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<{ today: number; thisWeek: number } | null>(null);
  const [newLeadMode, setNewLeadMode] = useState(false);

  const weekDays = getWeekDays(currentWeek);
  const from = weekDays[0].toISOString();
  const to = new Date(weekDays[6].getTime() + 86400000).toISOString();

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

  const openCreate = (day?: Date) => {
    loadFormData();
    setEditing(null);
    setNewLeadMode(false);
    const d = day ?? new Date();
    d.setHours(10, 0, 0, 0);
    setForm({ date: d.toISOString().slice(0, 16), status: "SCHEDULED", sendWhatsappReminder: false });
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (v: Visit) => {
    loadFormData();
    setEditing(v);
    setNewLeadMode(false);
    setForm({
      leadId: v.leadId, propertyId: v.propertyId ?? "", date: v.date.slice(0, 16),
      endDate: v.endDate?.slice(0, 16) ?? "", status: v.status, notes: v.notes ?? "", address: v.address ?? "",
    });
    setFormErrors({});
    setShowModal(true);
  };

  const handleSave = async () => {
    const errors: Record<string, string> = {};

    if (!editing) {
      if (newLeadMode) {
        if (!form.newLeadName && !form.newLeadPhone && !form.newLeadEmail) {
          errors.newLead = "Ingresá al menos nombre, teléfono o email";
        }
      } else {
        if (!form.leadId) errors.leadId = "Seleccioná un lead";
      }
    }

    if (!form.date) errors.date = "La fecha es obligatoria";
    if (form.endDate && form.date && new Date(form.endDate as string) <= new Date(form.date as string)) {
      errors.endDate = "La fecha fin debe ser posterior a la fecha inicio";
    }

    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (!token || !form.date) return;

    setSaving(true);
    try {
      const data: Record<string, unknown> = { ...form };
      if (!data.propertyId) delete data.propertyId;
      if (!data.endDate) delete data.endDate;

      if (editing) {
        await api.updateVisit(token, editing.id, data);
        toast.success("Visita actualizada");
      } else {
        if (newLeadMode) {
          // Remove leadId so the API creates the lead automatically
          delete data.leadId;
        }
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

  const navigateWeek = (delta: number) => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() + delta * 7);
    setCurrentWeek(d);
  };

  const today = new Date();

  const canSave = form.date && (
    editing ||
    (newLeadMode ? (form.newLeadName || form.newLeadPhone || form.newLeadEmail) : form.leadId)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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
        <button onClick={() => openCreate()} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus className="h-4 w-4" /> Nueva visita
        </button>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigateWeek(-1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
          <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-gray-300" />
        </button>
        <button onClick={() => setCurrentWeek(new Date())} className="px-3 py-1 rounded-lg text-sm font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 hover:bg-indigo-200">
          Hoy
        </button>
        <button onClick={() => navigateWeek(1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
          <ChevronRight className="h-5 w-5 text-gray-600 dark:text-gray-300" />
        </button>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {weekDays[0].toLocaleDateString("es", { day: "numeric", month: "short" })} — {weekDays[6].toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}
        </span>
      </div>

      {/* Week grid */}
      {loading ? <div className="flex justify-center py-12"><Spinner /></div> : (
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const dayVisits = visits.filter((v) => isSameDay(new Date(v.date), day));
            const isToday = isSameDay(day, today);
            return (
              <div key={day.toISOString()} className={`min-h-[140px] rounded-xl border p-2 ${isToday ? "border-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20 dark:border-indigo-600" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-medium ${isToday ? "text-indigo-600 dark:text-indigo-400" : "text-gray-600 dark:text-gray-400"}`}>
                    {formatDate(day)}
                  </span>
                  <button onClick={() => openCreate(new Date(day))} className="p-0.5 text-gray-400 hover:text-indigo-600 rounded">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="space-y-1">
                  {dayVisits.map((v) => {
                    const Icon = STATUS_ICONS[v.status] ?? Clock;
                    return (
                      <div key={v.id} onClick={() => openEdit(v)}
                        className={`p-1.5 rounded-lg cursor-pointer text-xs ${STATUS_COLORS[v.status] ?? "bg-gray-100"} hover:opacity-80`}>
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
                      <input value={String(form.newLeadPhone ?? "")} onChange={(e) => setForm({ ...form, newLeadPhone: e.target.value })}
                        placeholder="Ej: 5491112345678"
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
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

                {/* WhatsApp reminder toggle — only on create */}
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
