"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api, Template, TemplateAttachment } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Plus, FileText, Pencil, Trash2, Globe, User, Upload, X, File, Image, Video, Music } from "lucide-react";
import { PageHeader, Modal, EmptyState, Toggle, ChannelBadge, PageLoader, useToast, useConfirm } from "@/components/ui";

const CHANNEL_OPTIONS = [
  { value: "", label: "Sin canal" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "TELEGRAM", label: "Telegram" },
  { value: "WEB", label: "Web" },
];

/** Available template variables with labels for the UI */
const TEMPLATE_VARIABLES = [
  { key: "nombre", label: "Nombre", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border-blue-200 dark:border-blue-700" },
  { key: "telefono", label: "Teléfono", color: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 border-green-200 dark:border-green-700" },
  { key: "email", label: "Email", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 border-purple-200 dark:border-purple-700" },
  { key: "fuente", label: "Fuente", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 border-orange-200 dark:border-orange-700" },
  { key: "propiedad", label: "Propiedad", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-amber-200 dark:border-amber-700" },
  { key: "etapa", label: "Etapa", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300 border-cyan-200 dark:border-cyan-700" },
  { key: "estado", label: "Estado", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300 border-yellow-200 dark:border-yellow-700" },
  { key: "agente", label: "Agente", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300 border-pink-200 dark:border-pink-700" },
  { key: "intencion", label: "Intención", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700" },
  { key: "formulario", label: "Formulario", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300 border-teal-200 dark:border-teal-700" },
  { key: "notas", label: "Notas", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-600" },
];

const EMPTY_FORM = { name: "", channel: "", content: "", enabled: true, global: false, attachments: [] as TemplateAttachment[] };

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
  const [uploading, setUploading] = useState(false);
  const [filterChannel, setFilterChannel] = useState("");
  const [filterEnabled, setFilterEnabled] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.role === "BUSINESS" || user?.role === "ADMIN";

  /** Handle file upload */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded = await api.uploadFiles(token!, Array.from(files));
      setForm((prev) => ({ ...prev, attachments: [...prev.attachments, ...uploaded] }));
      toast.success(`${uploaded.length} archivo(s) subido(s)`);
    } catch {
      toast.error("Error al subir archivo(s)");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setForm((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index),
    }));
  };

  const getAttachmentIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return Image;
    if (mimeType.startsWith("video/")) return Video;
    if (mimeType.startsWith("audio/")) return Music;
    return File;
  };

  /** Insert a {{variable}} at the current cursor position in the content textarea */
  const insertVariable = (key: string) => {
    const tag = `{{${key}}}`;
    const ta = contentRef.current;
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const before = form.content.slice(0, start);
      const after = form.content.slice(end);
      const newContent = before + tag + after;
      setForm({ ...form, content: newContent });
      // Restore cursor position after the inserted tag
      requestAnimationFrame(() => {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + tag.length;
      });
    } else {
      setForm({ ...form, content: form.content + tag });
    }
  };

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
    setForm({ name: t.name, channel: t.channel ?? "", content: t.content, enabled: t.enabled, global: t.userId === null, attachments: (t.attachments ?? []) as TemplateAttachment[] });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.content.trim()) {
      toast.error("Nombre y contenido son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        channel: form.channel || null,
        content: form.content,
        enabled: form.enabled,
        attachments: form.attachments,
      };
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
                    <td className="table-cell font-medium text-gray-900 dark:text-white">{t.name}</td>
                    <td className="table-cell hidden sm:table-cell">
                      {t.channel ? <ChannelBadge channel={t.channel} /> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="table-cell hidden sm:table-cell">{ownerBadge(t)}</td>
                    <td className="table-cell hidden md:table-cell text-gray-500 dark:text-gray-400 max-w-[250px] truncate">
                      {t.content}
                      {t.attachments && (t.attachments as TemplateAttachment[]).length > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400 border border-violet-200 dark:border-violet-700">
                          <Upload className="w-3 h-3" /> {(t.attachments as TemplateAttachment[]).length}
                        </span>
                      )}
                    </td>
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
              <div className="flex flex-wrap gap-1.5 mb-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 self-center mr-1">Variables:</span>
                {TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border cursor-pointer hover:opacity-80 transition ${v.color}`}
                    title={`Insertar {{${v.key}}}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <textarea ref={contentRef} rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder={"Hola {{nombre}}, gracias por tu interés."} className="input font-mono" />
              <p className="text-xs text-gray-400 mt-1">Hacé clic en una variable para insertarla en el contenido</p>
            </div>

            {/* Attachments */}
            <div>
              <label className="label">Adjuntos</label>
              <p className="text-xs text-gray-400 mb-2">PDF, imágenes, audio, video — se enviarán junto con el mensaje</p>

              {/* Uploaded attachments list */}
              {form.attachments.length > 0 && (
                <div className="space-y-2 mb-3">
                  {form.attachments.map((att, i) => {
                    const Icon = getAttachmentIcon(att.mimeType);
                    return (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                        <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">{att.originalName}</span>
                        {att.size && <span className="text-xs text-gray-400 flex-shrink-0">{(att.size / 1024).toFixed(0)} KB</span>}
                        <button type="button" onClick={() => removeAttachment(i)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 transition"
              >
                <Upload className="w-4 h-4" />
                {uploading ? "Subiendo..." : "Agregar archivos"}
              </button>
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
