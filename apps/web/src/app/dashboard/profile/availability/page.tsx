"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type AgentAvailability, API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Clock, Save, Calendar, ToggleLeft, ToggleRight, Copy, Check, Link2, RefreshCw, Unlink, ExternalLink, Smartphone } from "lucide-react";
import { PageHeader, PageLoader, useToast } from "@/components/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [slots, setSlots] = useState<SlotForm[]>(DEFAULT_SLOTS);

  // Calendar sync state
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [copied, setCopied] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const icsUrl = calendarToken
    ? `${API_URL}/api/calendar/${calendarToken}.ics`
    : null;

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const [data, tokenRes, googleStatus] = await Promise.all([
        api.getMyAvailability(token),
        api.getCalendarToken(token),
        api.getGoogleCalendarStatus(token).catch(() => ({ connected: false })),
      ]);
      if (data.length > 0) {
        const merged = DEFAULT_SLOTS.map((def) => {
          const existing = data.find((d: AgentAvailability) => d.dayOfWeek === def.dayOfWeek);
          return existing
            ? { dayOfWeek: existing.dayOfWeek, startTime: existing.startTime, endTime: existing.endTime, active: existing.active }
            : def;
        });
        setSlots(merged);
      }
      setCalendarToken(tokenRes.token);
      setGoogleConnected(googleStatus.connected);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Handle Google Calendar OAuth callback
  useEffect(() => {
    const code = searchParams?.get("code");
    if (code && token) {
      api.connectGoogleCalendar(token, code)
        .then(() => {
          toast.success("Google Calendar conectado exitosamente");
          setGoogleConnected(true);
          // Clean URL
          window.history.replaceState({}, "", window.location.pathname);
        })
        .catch(() => toast.error("Error al conectar Google Calendar"));
    }
  }, [searchParams, token]);

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

  const handleGenerateToken = async () => {
    if (!token) return;
    setGeneratingToken(true);
    try {
      const res = await api.generateCalendarToken(token);
      setCalendarToken(res.token);
      toast.success("URL del calendario generada");
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    } finally {
      setGeneratingToken(false);
    }
  };

  const handleRevokeToken = async () => {
    if (!token) return;
    try {
      await api.revokeCalendarToken(token);
      setCalendarToken(null);
      toast.success("URL del calendario revocada");
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    }
  };

  const handleCopyUrl = () => {
    if (!icsUrl) return;
    navigator.clipboard.writeText(icsUrl);
    setCopied(true);
    toast.success("URL copiada al portapapeles");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnectGoogle = async () => {
    if (!token) return;
    setGoogleLoading(true);
    try {
      const { url } = await api.getGoogleAuthUrl(token);
      window.location.href = url;
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
      setGoogleLoading(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!token) return;
    setGoogleLoading(true);
    try {
      await api.disconnectGoogleCalendar(token);
      setGoogleConnected(false);
      toast.success("Google Calendar desconectado");
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    } finally {
      setGoogleLoading(false);
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

      {/* ═══ CALENDAR SYNC SECTION ═══════════════════════ */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-2">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
          <Smartphone className="w-5 h-5 text-indigo-500" />
          Sincronizar con tu teléfono
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Sincronizá tus visitas con la app de calendario de tu teléfono (Google Calendar, Apple Calendar, Outlook, etc.)
        </p>
      </div>

      {/* ICS Feed */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-500" />
            Suscripción por URL (ICS)
          </h3>
          {calendarToken && (
            <button
              onClick={handleRevokeToken}
              className="text-xs text-red-500 hover:text-red-700 transition"
            >
              Revocar acceso
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Generá una URL y agregala a cualquier app de calendario. Tus visitas aparecerán automáticamente en tu teléfono.
          Funciona con <strong>todas las apps</strong> de calendario.
        </p>

        {calendarToken && icsUrl ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={icsUrl}
                className="input text-xs flex-1 font-mono bg-gray-50 dark:bg-gray-900"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={handleCopyUrl}
                className="btn-primary px-3 py-2 flex items-center gap-1 text-xs"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copiada" : "Copiar"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerateToken}
                disabled={generatingToken}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${generatingToken ? "animate-spin" : ""}`} />
                Regenerar URL
              </button>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                <strong>Cómo usar:</strong> Copiá la URL y en tu app de calendario buscá la opción
                &quot;Agregar calendario por URL&quot; o &quot;Suscribirse a calendario&quot;.
                En Google Calendar: Otros calendarios (+) → Desde URL.
              </p>
            </div>
          </div>
        ) : (
          <button
            onClick={handleGenerateToken}
            disabled={generatingToken}
            className="btn-primary text-sm flex items-center gap-2"
          >
            <Link2 className="w-4 h-4" />
            {generatingToken ? "Generando…" : "Generar URL de calendario"}
          </button>
        )}
      </div>

      {/* Google Calendar OAuth */}
      <div className="card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="3" fill="#4285F4" opacity="0.2"/>
            <path d="M12 7v5l4 2" stroke="#4285F4" strokeWidth="2" strokeLinecap="round"/>
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="#4285F4" strokeWidth="1.5" fill="none"/>
          </svg>
          Google Calendar (bidireccional)
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Conectá tu cuenta de Google para que las visitas se sincronicen automáticamente en ambas direcciones.
          Cuando se agende una visita (manual o por IA), aparece en tu Google Calendar con recordatorios.
        </p>

        {googleConnected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <Check className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-700 dark:text-green-300 font-medium">Google Calendar conectado</span>
            </div>
            <button
              onClick={handleDisconnectGoogle}
              disabled={googleLoading}
              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 transition"
            >
              <Unlink className="w-3 h-3" />
              Desconectar Google Calendar
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnectGoogle}
            disabled={googleLoading}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition shadow-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {googleLoading ? "Conectando…" : "Conectar Google Calendar"}
          </button>
        )}
      </div>
    </div>
  );
}
