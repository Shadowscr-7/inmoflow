"use client";

import { useAuth } from "@/lib/auth";
import { api, Tag } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import { TagIcon, Plus, X, Edit2, Trash2, Users } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/errors";

interface TagWithCount extends Tag {
  _count?: { leads: number };
}

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
  "#64748b", "#78716c",
];

export default function TagsPage() {
  const { token } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.getTags(token);
      setTags(res);
    } catch { toast.error("Error al cargar etiquetas"); }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
    setShowModal(true);
  };

  const openEdit = (t: Tag) => {
    setEditing(t);
    setName(t.name);
    setColor(t.color ?? COLORS[0]);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!token || !name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await api.updateTag(token, editing.id, { name: name.trim(), color });
        toast.success("Tag actualizado");
      } else {
        await api.createTag(token, { name: name.trim(), color });
        toast.success("Tag creado");
      }
      setShowModal(false);
      load();
    } catch (e: unknown) { toast.error(getErrorMessage(e)); }
    setSaving(false);
  };

  const handleDelete = async (t: Tag) => {
    const ok = await confirm({ title: "Eliminar tag", message: `¿Eliminar "${t.name}"? Se quitará de todos los leads.`, confirmLabel: "Eliminar", danger: true });
    if (!ok || !token) return;
    try {
      await api.deleteTag(token, t.id);
      toast.success("Tag eliminado");
      load();
    } catch (e: unknown) { toast.error(getErrorMessage(e)); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <TagIcon className="h-7 w-7 text-indigo-500" /> Tags
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Etiquetas para clasificar leads</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus className="h-4 w-4" /> Nuevo tag
        </button>
      </div>

      {loading ? <div className="flex justify-center py-12"><Spinner /></div> : tags.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <TagIcon className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Sin tags</p>
          <p className="text-sm mt-1">Crea tags para organizar y filtrar tus leads</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {tags.map((t) => (
            <div key={t.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-4 flex items-center justify-between group hover:shadow-sm transition">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: t.color ?? "#6366f1" }} />
                <div className="min-w-0">
                  <h3 className="font-medium text-gray-900 dark:text-white truncate">{t.name}</h3>
                  <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Users className="h-3 w-3" />
                    <span>{(t as TagWithCount)._count?.leads ?? 0} leads</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                <button onClick={() => openEdit(t)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded"><Edit2 className="h-3.5 w-3.5" /></button>
                <button onClick={() => handleDelete(t)} className="p-1.5 text-gray-400 hover:text-red-600 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? "Editar tag" : "Nuevo tag"}</h2>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nombre *</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder="Ej: VIP, Urgente, CABA..." autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Color</label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button key={c} onClick={() => setColor(c)}
                      className={`w-8 h-8 rounded-full transition ring-offset-2 dark:ring-offset-gray-800 ${color === c ? "ring-2 ring-indigo-500 scale-110" : "hover:scale-105"}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  Vista previa:
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: color }}>
                    {name || "Tag"}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t dark:border-gray-700">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancelar</button>
                <button onClick={handleSave} disabled={saving || !name.trim()}
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
