"use client";

import { useAuth } from "@/lib/auth";
import { api, Visit, Property, Lead } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import {
  Calendar, Plus, X, Clock, MapPin, User, ChevronLeft, ChevronRight, Edit2, Trash2, Check, XCircle, AlertTriangle,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

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
  const [stats, setStats] = useState<{ today: number; thisWeek: number } | null>(null);

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
    const d = day ?? new Date();
    d.setHours(10, 0, 0, 0);
    setForm({ date: d.toISOString().slice(0, 16), status: "SCHEDULED" });
    setShowModal(true);
  };

  const openEdit = (v: Visit) => {
    loadFormData();
    setEditing(v);
    setForm({
      leadId: v.leadId, propertyId: v.propertyId ?? "", date: v.date.slice(0, 16),
      endDate: v.endDate?.slice(0, 16) ?? "", status: v.status, notes: v.notes ?? "", address: v.address ?? "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!token || !form.leadId || !form.date) return;
    setSaving(true);
    try {
      const data: Record<string, unknown> = { ...form };
      if (!data.propertyId) delete data.propertyId;
      if (!data.endDate) delete data.endDate;
      if (editing) {
        await api.updateVisit(token, editing.id, data);
        toast.success("Visita actualizada");
      } else {
        await api.createVisit(token, data);
        toast.success("Visita agendada");
      }
      setShowModal(false);
      load();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const handleDelete = async (v: Visit) => {
    const ok = await confirm({ title: "Eliminar visita", message: "¿Eliminar esta visita?", confirmLabel: "Eliminar", danger: true });
    if (!ok || !token) return;
    try {
      await api.deleteVisit(token, v.id);
      toast.success("Visita eliminada");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const navigateWeek = (delta: number) => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() + delta * 7);
    setCurrentWeek(d);
  };

  const today = new Date();

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
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Lead *</label>
                  <select value={String(form.leadId ?? "")} onChange={(e) => setForm({ ...form, leadId: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <option value="">— Seleccionar lead —</option>
                    {leads.map((l) => <option key={l.id} value={l.id}>{l.name ?? l.phone ?? l.email ?? l.id}</option>)}
                  </select>
                </div>
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
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Fin (opcional)</label>
                    <input type="datetime-local" value={String(form.endDate ?? "")} onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
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
                  <button onClick={handleSave} disabled={saving || !form.leadId || !form.date}
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
