"use client";

import { useAuth } from "@/lib/auth";
import { api, Ticket, TicketStatus, TicketPriority } from "@/lib/api";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  AlertTriangle, Plus, X, Upload, Paperclip, Trash2, Eye,
  ChevronDown, Filter, RefreshCw, FileText, Image, Video, Music,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { getErrorMessage } from "@/lib/errors";

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string }> = {
  PENDING:     { label: "Pendiente",   color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  IN_PROGRESS: { label: "En progreso", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  RESOLVED:    { label: "Resuelto",    color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  CLOSED:      { label: "Cerrado",     color: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400" },
};

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; color: string }> = {
  LOW:      { label: "Baja",     color: "bg-slate-100 text-slate-600" },
  MEDIUM:   { label: "Media",    color: "bg-blue-100 text-blue-700" },
  HIGH:     { label: "Alta",     color: "bg-orange-100 text-orange-700" },
  CRITICAL: { label: "Crítica",  color: "bg-red-100 text-red-700" },
};

function getFileIcon(mimetype: string) {
  if (mimetype.startsWith("image/")) return <Image className="h-4 w-4" />;
  if (mimetype.startsWith("video/")) return <Video className="h-4 w-4" />;
  if (mimetype.startsWith("audio/")) return <Music className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface TicketModalProps {
  ticket: Ticket | null;
  onClose: () => void;
  onRefresh: () => void;
  token: string;
  currentUserId: string;
  userRole: string;
}

function TicketModal({ ticket, onClose, onRefresh, token, currentUserId, userRole }: TicketModalProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adminNote, setAdminNote] = useState(ticket?.adminNote ?? "");
  const [status, setStatus] = useState<TicketStatus>(ticket?.status ?? "PENDING");

  const isAdmin = userRole === "ADMIN";
  const isOwner = ticket?.creatorId === currentUserId;
  const canEdit = isAdmin || (isOwner && ticket?.status === "PENDING");

  const handleFileUpload = async (files: FileList) => {
    if (!ticket) return;
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append("files", f));
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"}/uploads`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error("Error al subir archivos");
      const uploaded: { url: string; filename: string; mimetype: string; size: number }[] = await res.json();
      await api.addTicketAttachments(token, ticket.id, uploaded);
      toast.success("Archivos adjuntados");
      onRefresh();
    } catch (e) { toast.error(getErrorMessage(e)); }
    setUploading(false);
  };

  const handleRemoveAttachment = async (attachmentId: string) => {
    if (!ticket) return;
    const ok = await confirm({ title: "Eliminar adjunto", message: "¿Eliminar este archivo?", confirmLabel: "Eliminar", danger: true });
    if (!ok) return;
    try {
      await api.removeTicketAttachment(token, ticket.id, attachmentId);
      toast.success("Adjunto eliminado");
      onRefresh();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  const handleSaveAdmin = async () => {
    if (!ticket || !isAdmin) return;
    setSaving(true);
    try {
      await api.updateTicket(token, ticket.id, { status, adminNote });
      toast.success("Ticket actualizado");
      onRefresh();
      onClose();
    } catch (e) { toast.error(getErrorMessage(e)); }
    setSaving(false);
  };

  if (!ticket) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b dark:border-gray-700">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{ticket.title}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[ticket.status].color}`}>
                {STATUS_CONFIG[ticket.status].label}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_CONFIG[ticket.priority].color}`}>
                {PRIORITY_CONFIG[ticket.priority].label}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Por {ticket.creator.name ?? ticket.creator.email}
                {ticket.tenant && ` · ${ticket.tenant.name}`}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Description */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Descripción</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{ticket.description}</p>
          </div>

          {/* Admin note */}
          {(ticket.adminNote || isAdmin) && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-2">
                Nota del administrador
              </h3>
              {isAdmin ? (
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  rows={3}
                  className="w-full text-sm border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 dark:text-white resize-none"
                  placeholder="Respuesta o nota para el cliente..."
                />
              ) : (
                <p className="text-sm text-blue-800 dark:text-blue-200">{ticket.adminNote}</p>
              )}
            </div>
          )}

          {/* Status change (admin only) */}
          {isAdmin && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Estado</h3>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TicketStatus)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Adjuntos ({ticket.attachments.length})
              </h3>
              {canEdit && (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50"
                >
                  {uploading ? <Spinner className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
                  Subir archivos
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
              />
            </div>

            {ticket.attachments.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Sin archivos adjuntos</p>
            ) : (
              <div className="space-y-1.5">
                {ticket.attachments.map((att) => (
                  <div key={att.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 group">
                    <span className="text-gray-400">{getFileIcon(att.mimetype)}</span>
                    <a href={att.url} target="_blank" rel="noopener noreferrer"
                      className="flex-1 text-xs text-indigo-600 hover:underline truncate">
                      {att.filename}
                    </a>
                    <span className="text-xs text-gray-400 flex-shrink-0">{formatSize(att.size)}</span>
                    {canEdit && (
                      <button onClick={() => handleRemoveAttachment(att.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {isAdmin && (
          <div className="flex justify-end gap-2 p-6 border-t dark:border-gray-700">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              Cancelar
            </button>
            <button onClick={handleSaveAdmin} disabled={saving}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2">
              {saving && <Spinner className="h-4 w-4" />}
              Guardar cambios
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface CreateModalProps {
  onClose: () => void;
  onCreated: () => void;
  token: string;
}

function CreateModal({ onClose, onCreated, token }: CreateModalProps) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const handleFileAdd = (files: FileList) => {
    setPendingFiles((prev) => [...prev, ...Array.from(files)]);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) return;
    setSaving(true);
    try {
      const ticket = await api.createTicket(token, { title: title.trim(), description: description.trim(), priority });

      if (pendingFiles.length > 0) {
        setUploading(true);
        const formData = new FormData();
        pendingFiles.forEach((f) => formData.append("files", f));
        const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
        const res = await fetch(`${apiBase}/uploads`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (res.ok) {
          const uploaded: { url: string; filename: string; mimetype: string; size: number }[] = await res.json();
          await api.addTicketAttachments(token, ticket.id, uploaded);
        }
        setUploading(false);
      }

      toast.success("Incidencia creada");
      onCreated();
    } catch (e) { toast.error(getErrorMessage(e)); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Nueva incidencia</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Título *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="Ej: Error al cargar leads, Canal desconectado..." />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Descripción *</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none"
              placeholder="Describe el problema en detalle: cuándo ocurre, qué pasos lo reproducen..." />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Prioridad</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
              {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          {/* File attachment */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Adjuntos (opcional)
            </label>
            <button type="button" onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
              <Paperclip className="h-4 w-4" /> Adjuntar archivos
            </button>
            <input ref={fileRef} type="file" multiple className="hidden"
              accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
              onChange={(e) => e.target.files && handleFileAdd(e.target.files)} />
            {pendingFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <Paperclip className="h-3 w-3" />
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="text-gray-400">{formatSize(f.size)}</span>
                    <button onClick={() => setPendingFiles((p) => p.filter((_, idx) => idx !== i))}
                      className="text-gray-400 hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t dark:border-gray-700">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              Cancelar
            </button>
            <button onClick={handleSubmit} disabled={saving || uploading || !title.trim() || !description.trim()}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2">
              {(saving || uploading) && <Spinner className="h-4 w-4" />}
              Crear incidencia
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IncidenciasPage() {
  const { token, user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [filterStatus, setFilterStatus] = useState<TicketStatus | "">("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = filterStatus ? { status: filterStatus as TicketStatus } : undefined;
      const res = await api.getTickets(token, params);
      setTickets(Array.isArray(res) ? res : []);
    } catch { toast.error("Error al cargar incidencias"); }
    setLoading(false);
  }, [token, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (t: Ticket) => {
    const ok = await confirm({ title: "Eliminar incidencia", message: `¿Eliminar "${t.title}"?`, confirmLabel: "Eliminar", danger: true });
    if (!ok || !token) return;
    try {
      await api.deleteTicket(token, t.id);
      toast.success("Incidencia eliminada");
      load();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  const handleRefresh = () => {
    load();
    if (selected) {
      api.getTicket(token!, selected.id).then((t) => setSelected(t)).catch(() => {});
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="h-7 w-7 text-amber-500" /> Incidencias
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Reportá problemas o errores del sistema
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus className="h-4 w-4" /> Nueva incidencia
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Filter className="h-4 w-4" /> Estado:
        </div>
        <div className="flex flex-wrap gap-2">
          {[{ value: "", label: "Todos" }, ...Object.entries(STATUS_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))].map((opt) => (
            <button key={opt.value}
              onClick={() => setFilterStatus(opt.value as TicketStatus | "")}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition ${filterStatus === opt.value
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-indigo-400"
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Sin incidencias</p>
          <p className="text-sm mt-1">
            {filterStatus ? "No hay incidencias con ese estado" : "Cuando surja un problema, creá una incidencia aquí"}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Incidencia</th>
                {user?.role === "ADMIN" && <th className="text-left px-4 py-3 font-medium">Tenant</th>}
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Creador</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Prioridad</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Adjuntos</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Fecha</th>
                <th className="text-right px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {tickets.map((t) => {
                const canDelete = user?.role === "ADMIN" || (t.creatorId === user?.id && t.status === "PENDING");
                return (
                  <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onClick={() => setSelected(t)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white truncate max-w-xs">{t.title}</div>
                      <div className="text-xs text-gray-400 truncate max-w-xs mt-0.5">{t.description.slice(0, 60)}{t.description.length > 60 ? "…" : ""}</div>
                    </td>
                    {user?.role === "ADMIN" && (
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{t.tenant?.name ?? "—"}</td>
                    )}
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden sm:table-cell text-xs">
                      {t.creator.name ?? t.creator.email}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[t.status].color}`}>
                        {STATUS_CONFIG[t.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_CONFIG[t.priority].color}`}>
                        {PRIORITY_CONFIG[t.priority].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">
                      {t.attachments.length > 0 ? (
                        <div className="flex items-center gap-1">
                          <Paperclip className="h-3 w-3" />{t.attachments.length}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell whitespace-nowrap">
                      {new Date(t.createdAt).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setSelected(t)}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 rounded" title="Ver detalle">
                          <Eye className="h-4 w-4" />
                        </button>
                        {canDelete && (
                          <button onClick={() => handleDelete(t)}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Eliminar">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateModal token={token!} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
      )}
      {selected && (
        <TicketModal
          ticket={selected}
          onClose={() => setSelected(null)}
          onRefresh={handleRefresh}
          token={token!}
          currentUserId={user?.id ?? ""}
          userRole={user?.role ?? ""}
        />
      )}
    </div>
  );
}
