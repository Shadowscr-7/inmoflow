"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type AgentAvailability } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Clock, Save, Calendar, ToggleLeft, ToggleRight } from "lucide-react";
import { PageHeader, PageLoader, useToast } from "@/components/ui";
import Link from "next/link";

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const DEFAULT_SLOTS = DAY_NAMES.map((_, i) => ({
  dayOfWeek: i,
  startTime: "09:00",
  endTime: "18:00",
  active: i >= 1 && i <= 5, // Mon-Fri active by default
}));

type SlotForm = { dayOfWeek: number; startTime: string; endTime: string; active: boolean };

export default function AvailabilityPage() {
  const { token } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [slots, setSlots] = useState<SlotForm[]>(DEFAULT_SLOTS);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const data = await api.getMyAvailability(token);
      if (data.length > 0) {
        // Merge with defaults to fill all 7 days
        const merged = DEFAULT_SLOTS.map((def) => {
          const existing = data.find((d: AgentAvailability) => d.dayOfWeek === def.dayOfWeek);
          return existing
            ? { dayOfWeek: existing.dayOfWeek, startTime: existing.startTime, endTime: existing.endTime, active: existing.active }
            : def;
        });
        setSlots(merged);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await api.setMyAvailability(token, slots);
      toast.success("Disponibilidad guardada correctamente");
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const updateSlot = (dayOfWeek: number, field: keyof SlotForm, value: string | boolean) => {
    setSlots((prev) =>
      prev.map((s) => (s.dayOfWeek === dayOfWeek ? { ...s, [field]: value } : s))
    );
  };

  if (loading) return <PageLoader />;

  const activeCount = slots.filter((s) => s.active).length;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/profile"
          className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
        >
          ← Perfil
        </Link>
      </div>

      <PageHeader
        title="Mi disponibilidad"
        description="Configurá tus horarios de atención. La IA usará estos horarios para agendar visitas con los leads."
      />

      {/* Summary */}
      <div className="flex items-center gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-sm text-blue-700 dark:text-blue-300">
        <Clock className="w-5 h-5 flex-shrink-0" />
        <span>
          Tenés <strong>{activeCount} días</strong> configurados como disponibles.
          La IA propondrá horarios de esta lista cuando un lead quiera agendar una visita.
        </span>
      </div>

      {/* Weekly schedule */}
      <div className="space-y-3">
        {slots.map((slot) => (
          <div
            key={slot.dayOfWeek}
            className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
              slot.active
                ? "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                : "bg-gray-50 dark:bg-gray-900/50 border-gray-100 dark:border-gray-800 opacity-60"
            }`}
          >
            {/* Toggle */}
            <button
              type="button"
              onClick={() => updateSlot(slot.dayOfWeek, "active", !slot.active)}
              className="flex-shrink-0"
              title={slot.active ? "Desactivar día" : "Activar día"}
            >
              {slot.active ? (
                <ToggleRight className="w-8 h-8 text-brand-600" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-gray-300 dark:text-gray-600" />
              )}
            </button>

            {/* Day name */}
            <div className="w-24 flex-shrink-0">
              <span className="font-medium text-gray-900 dark:text-white text-sm hidden sm:inline">
                {DAY_NAMES[slot.dayOfWeek]}
              </span>
              <span className="font-medium text-gray-900 dark:text-white text-sm sm:hidden">
                {DAY_SHORT[slot.dayOfWeek]}
              </span>
            </div>

            {/* Time inputs */}
            {slot.active ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="time"
                  value={slot.startTime}
                  onChange={(e) => updateSlot(slot.dayOfWeek, "startTime", e.target.value)}
                  className="input text-sm w-32"
                />
                <span className="text-gray-400 text-sm">a</span>
                <input
                  type="time"
                  value={slot.endTime}
                  onChange={(e) => updateSlot(slot.dayOfWeek, "endTime", e.target.value)}
                  className="input text-sm w-32"
                />
                <span className="text-xs text-gray-400 hidden sm:inline ml-2">
                  {(() => {
                    const [sh] = slot.startTime.split(":").map(Number);
                    const [eh] = slot.endTime.split(":").map(Number);
                    const hours = eh - sh;
                    return hours > 0 ? `${hours}h disponibles` : "";
                  })()}
                </span>
              </div>
            ) : (
              <span className="text-sm text-gray-400 italic">No disponible</span>
            )}
          </div>
        ))}
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? "Guardando…" : "Guardar disponibilidad"}
        </button>
      </div>

      {/* Google Calendar section (future) */}
      <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-2">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none"><path d="M19.5 3.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2 4.5 3.5 3 2v20l1.5-1.5L6 22l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22V2l-1.5 1.5zM19 19H5V5h14v14zM7 9h10v2H7V9zm0 4h7v2H7v-2z" fill="currentColor" opacity="0.5"/></svg>
          Sincronización con Google Calendar
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Próximamente podrás conectar tu Google Calendar para sincronizar automáticamente tus citas y que
          la IA tenga en cuenta tu agenda real.
        </p>
        <button
          type="button"
          disabled
          className="mt-3 px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg text-gray-400 cursor-not-allowed"
        >
          Conectar Google Calendar (próximamente)
        </button>
      </div>
    </div>
  );
}
