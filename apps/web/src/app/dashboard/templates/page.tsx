"use client";

import { useEffect, useState, useCallback } from "react";
import { api, Template } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Plus, FileText, Pencil, Trash2, Globe, User } from "lucide-react";
import { PageHeader, Modal, EmptyState, Toggle, ChannelBadge, PageLoader, useToast, useConfirm } from "@/components/ui";

const CHANNEL_OPTIONS = [
  { value: "", label: "Sin canal" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "TELEGRAM", label: "Telegram" },
  { value: "WEB", label: "Web" },
];

const EMPTY_FORM = { key: "", name: "", channel: "", content: "", enabled: true, global: false };

type Scope = "all" | "mine" | "global";

export default function TemplatesPage() {
  const { token, user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filterChannel, setFilterChannel] = useState("");
  const [filterEnabled, setFilterEnabled] = useState("");
  const [scope, setScope] = useState<Scope>("all");

  const isAdmin = user?.role === "BUSINESS" || user?.role === "ADMIN";

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (filterChannel) params.channel = filterChannel;
      if (filterEnabled) params.enabled = filterEnabled;
      const data = await api.getTemplates(token!, params);
      setTemplates(data);
    } catch {
      toast.error("Error al cargar plantillas");
    } finally {
      setLoading(false);
    }
  }, [filterChannel, filterEnabled]);

  useEffect(() => { load(); }, [load]);

  // Filter by scope on the client (data already includes user info)
  const filtered = templates.filter((t) => {
    if (scope === "mine") return t.userId === user?.id;
    if (scope === "global") return t.userId === null;
    return true;
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (t: Template) => {
    setEditing(t);
    setForm({ key: t.key, name: t.name, channel: t.channel ?? "", content: t.content, enabled: t.enabled, global: t.userId === null });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.key.trim() || !form.name.trim() || !form.content.trim()) {
      toast.error("Key, nombre y contenido son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        channel: form.channel || null,
        content: form.content,
        enabled: form.enabled,
      };
      if (!editing) payload.key = form.key.trim();
      if (isAdmin) payload.global = form.global;
      if (editing) {
        await api.updateTemplate(token!, editing.id, payload);
        toast.success("Plantilla actualizada");
      } else {
        await api.createTemplate(token!, payload);
        toast.success("Plantilla creada");
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
    const ok = await confirm({ title: "Eliminar plantilla", message: "¿Estás seguro de eliminar esta plantilla? Esta acción no se puede deshacer.", confirmLabel: "Eliminar", danger: true });
    if (!ok) return;
    try {
      await api.deleteTemplate(token!, id);
      toast.success("Plantilla eliminada");
      load();
    } catch {
      toast.error("Error al eliminar");
    }
  };

  const handleToggle = async (t: Template) => {
    try {
      await api.updateTemplate(token!, t.id, { enabled: !t.enabled });
      toast.info(t.enabled ? "Plantilla desactivada" : "Plantilla activada");
      load();
    } catch {
      toast.error("Error al cambiar estado");
    }
  };

  const ownerBadge = (t: Template) => {
    if (t.userId === null) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <Globe className="w-3 h-3" /> Global
        </span>
      );
    }
    if (t.userId === user?.id) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
          <User className="w-3 h-3" /> Mía
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200">
        <User className="w-3 h-3" /> {t.user?.name || t.user?.email || "Otro"}
      </span>
    );
  };

  return (
    <div>
      <PageHeader
        title="Plantillas de mensajes"
        description="Define plantillas reutilizables con {{placeholders}} para automatizaciones"
        action={
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" /> Nueva plantilla
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} className="input w-auto">
          <option value="all">Todas</option>
          <option value="mine">Mis plantillas</option>
          <option value="global">Globales</option>
        </select>
        <select value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)} className="input w-auto">
          <option value="">Todos los canales</option>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="TELEGRAM">Telegram</option>
          <option value="WEB">Web</option>
        </select>
        <select value={filterEnabled} onChange={(e) => setFilterEnabled(e.target.value)} className="input w-auto">
          <option value="">Todos</option>
          <option value="true">Activas</option>
          <option value="false">Inactivas</option>
        </select>
      </div>

      {loading ? (
        <PageLoader />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No hay plantillas aún"
          description="Creá tu primera plantilla de mensaje para automatizar respuestas"
          action={<button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> Nueva plantilla</button>}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  <th className="table-header">Key</th>
                  <th className="table-header">Nombre</th>
                  <th className="table-header hidden sm:table-cell">Canal</th>
                  <th className="table-header hidden sm:table-cell">Alcance</th>
                  <th className="table-header hidden md:table-cell">Contenido</th>
                  <th className="table-header text-center">Activa</th>
                  <th className="table-header text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="table-cell font-mono text-xs text-brand-600">{t.key}</td>
                    <td className="table-cell font-medium text-gray-900 dark:text-white">{t.name}</td>
                    <td className="table-cell hidden sm:table-cell">
                      {t.channel ? <ChannelBadge channel={t.channel} /> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="table-cell hidden sm:table-cell">{ownerBadge(t)}</td>
                    <td className="table-cell hidden md:table-cell text-gray-500 dark:text-gray-400 max-w-[250px] truncate">{t.content}</td>
                    <td className="table-cell text-center">
                      <Toggle checked={t.enabled} onChange={() => handleToggle(t)} size="sm" />
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(t)} className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(t.id)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <Modal
          open
          onClose={() => setShowModal(false)}
          title={editing ? "Editar plantilla" : "Nueva plantilla"}
          size="lg"
          footer={
            <>
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? "Guardando..." : editing ? "Actualizar" : "Crear"}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="label">Key única</label>
              <input type="text" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="welcome_whatsapp" className="input" disabled={!!editing} />
              {!editing && <p className="text-xs text-gray-400 mt-1">Identificador único, no se puede cambiar</p>}
            </div>
            <div>
              <label className="label">Nombre</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bienvenida WhatsApp" className="input" />
            </div>
            <div>
              <label className="label">Canal</label>
              <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} className="input">
                {CHANNEL_OPTIONS.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
              </select>
            </div>
            <div>
              <label className="label">Contenido</label>
              <textarea rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder={"Hola {{nombre}}, gracias por tu interés en {{propiedad}}."} className="input font-mono" />
              <p className="text-xs text-gray-400 mt-1">Usa {"{{campo}}"} para variables: nombre, email, phone, propiedad, etc.</p>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-3 p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
                <Toggle checked={form.global} onChange={(v) => setForm({ ...form, global: v })} />
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Plantilla global</label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Visible y disponible para todos los usuarios del equipo</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} />
              <label className="text-sm text-gray-700 dark:text-gray-300">Plantilla activa</label>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
