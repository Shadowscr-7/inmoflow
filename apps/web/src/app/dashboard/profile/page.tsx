"use client";

import { useEffect, useState, useCallback } from "react";
import { getProfile, updateProfile, ApiError, api, NotificationPreference } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { User, Shield, Building2, Mail, Calendar, Save, Eye, EyeOff, Bell, BellOff, Clock, ChevronRight } from "lucide-react";
import { PageHeader, PageLoader, useToast } from "@/components/ui";
import Link from "next/link";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Super Admin",
  BUSINESS: "Business",
  AGENT: "Agente",
  VIEWER: "Solo lectura",
};

interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: string;
  tenantId: string | null;
  createdAt: string;
  tenant: { id: string; name: string } | null;
}

export default function ProfilePage() {
  const { token, user } = useAuth();
  const toast = useToast();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  // Notification preferences
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreference | null>(null);
  const [savingNotif, setSavingNotif] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const data = await getProfile(token);
      setProfile(data);
      setName(data.name ?? "");
    } catch {
      toast.error("Error al cargar perfil");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Load notification preferences
  useEffect(() => {
    if (!token) return;
    api.getNotificationPreferences(token).then(setNotifPrefs).catch(() => {});
  }, [token]);

  const handleSaveNotifPrefs = async (updates: { pushEnabled?: boolean; emailDigest?: string }) => {
    if (!token) return;
    setSavingNotif(true);
    try {
      const updated = await api.updateNotificationPreferences(token, updates);
      setNotifPrefs(updated);
      toast.success("Preferencias actualizadas");
    } catch {
      toast.error("Error al actualizar preferencias");
    }
    setSavingNotif(false);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const payload: { name?: string; password?: string; currentPassword?: string } = {};

      if (name.trim() !== (profile?.name ?? "")) {
        payload.name = name.trim();
      }

      if (newPassword) {
        if (newPassword !== confirmPassword) {
          toast.error("Las contraseñas no coinciden");
          setSaving(false);
          return;
        }
        if (!currentPassword) {
          toast.error("Ingresá tu contraseña actual para cambiarla");
          setSaving(false);
          return;
        }
        // Validate complexity
        const hasUpper = /[A-Z]/.test(newPassword);
        const hasLower = /[a-z]/.test(newPassword);
        const hasNumber = /\d/.test(newPassword);
        if (newPassword.length < 8 || !hasUpper || !hasLower || !hasNumber) {
          toast.error("La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número");
          setSaving(false);
          return;
        }
        payload.password = newPassword;
        payload.currentPassword = currentPassword;
      }

      if (Object.keys(payload).length === 0) {
        toast.info("No hay cambios para guardar");
        setSaving(false);
        return;
      }

      await updateProfile(token!, payload);
      toast.success("Perfil actualizado");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        toast.error(err.message || "Contraseña actual incorrecta");
      } else {
        toast.error("Error al actualizar perfil");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader title="Mi perfil" description="Administrá tu información personal y seguridad" />

      <div className="max-w-2xl space-y-6">
        {/* Info section */}
        <div className="card p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Información de cuenta</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
              <Mail className="w-5 h-5 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Email</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{profile?.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
              <Shield className="w-5 h-5 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Rol</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{ROLE_LABELS[profile?.role ?? ""] ?? profile?.role}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
              <Building2 className="w-5 h-5 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Organización</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{profile?.tenant?.name ?? "—"}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
              <Calendar className="w-5 h-5 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Miembro desde</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString("es-AR", { year: "numeric", month: "long", day: "numeric" }) : "—"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Edit section */}
        <div className="card p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Editar perfil</h2>

          <div>
            <label className="label">Nombre</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre"
                className="input pl-10"
              />
            </div>
          </div>
        </div>

        {/* Availability shortcut */}
        <Link
          href="/dashboard/profile/availability"
          className="card p-5 flex items-center justify-between group hover:border-brand-300 dark:hover:border-brand-700 transition"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-50 dark:bg-brand-900/20 rounded-lg">
              <Clock className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Mi disponibilidad</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Configurá tus horarios para que la IA agende citas automáticamente</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-brand-500 transition" />
        </Link>

        {/* Password section */}
        <div className="card p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Cambiar contraseña</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Dejá los campos vacíos si no querés cambiar tu contraseña.</p>

          <div>
            <label className="label">Contraseña actual</label>
            <div className="relative">
              <input
                type={showCurrentPw ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPw(!showCurrentPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-400"
              >
                {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="label">Nueva contraseña</label>
            <div className="relative">
              <input
                type={showNewPw ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNewPw(!showNewPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-400"
              >
                {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Mín. 8 caracteres, con mayúscula, minúscula y número</p>
          </div>

          <div>
            <label className="label">Confirmar nueva contraseña</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="input"
            />
          </div>
        </div>

        {/* Notification Preferences */}
        <div className="card p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Bell className="w-4 h-4" /> Preferencias de notificación
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Configura cómo querés recibir tus notificaciones.</p>

          {notifPrefs && (
            <div className="space-y-4">
              {/* Push notifications */}
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
                <div className="flex items-center gap-3">
                  {notifPrefs.pushEnabled ? <Bell className="w-5 h-5 text-blue-500" /> : <BellOff className="w-5 h-5 text-gray-400" />}
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Notificaciones push</p>
                    <p className="text-xs text-gray-500">Recibir notificaciones en el navegador</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifPrefs.pushEnabled}
                    onChange={(e) => handleSaveNotifPrefs({ pushEnabled: e.target.checked })}
                    className="sr-only peer"
                    disabled={savingNotif}
                  />
                  <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                </label>
              </div>

              {/* Email digest */}
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <Mail className="w-5 h-5 text-purple-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Resumen por email</p>
                    <p className="text-xs text-gray-500">Recibir un resumen de actividad por email</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {(["NONE", "DAILY", "WEEKLY"] as const).map((freq) => {
                    const labels = { NONE: "Desactivado", DAILY: "Diario", WEEKLY: "Semanal" };
                    const isActive = notifPrefs.emailDigest === freq;
                    return (
                      <button
                        key={freq}
                        onClick={() => handleSaveNotifPrefs({ emailDigest: freq })}
                        disabled={savingNotif}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition ${
                          isActive
                            ? "bg-purple-600 text-white"
                            : "bg-white dark:bg-gray-800 border hover:bg-gray-100 dark:hover:bg-gray-700"
                        }`}
                      >
                        {labels[freq]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <button onClick={handleSaveProfile} disabled={saving} className="btn-primary">
            <Save className="w-4 h-4" />
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
