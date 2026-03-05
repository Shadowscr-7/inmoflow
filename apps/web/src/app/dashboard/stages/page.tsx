"use client";

import { useEffect, useState, useCallback } from "react";
import { api, PipelineStage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  X,
  Check,
  GitBranch,
  Star,
} from "lucide-react";
import {
  PageHeader,
  Modal,
  EmptyState,
  PageLoader,
  useToast,
  useConfirm,
  Badge,
} from "@/components/ui";

interface StageForm {
  key: string;
  name: string;
  isDefault: boolean;
}

const EMPTY_FORM: StageForm = { key: "", name: "", isDefault: false };

export default function StagesPage() {
  const { token, user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StageForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const isBusiness = user?.role === "BUSINESS" || user?.role === "ADMIN";

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getStages(token!);
      setStages(data);
    } catch {
      toast.error("Error al cargar etapas");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  };

  const openEdit = (s: PipelineStage) => {
    setEditingId(s.id);
    setForm({ key: s.key, name: s.name, isDefault: false });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.key.trim() || !form.name.trim()) {
      toast.error("Clave y nombre son obligatorios");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.updateStage(token!, editingId, {
          key: form.key.trim().toUpperCase(),
          name: form.name.trim(),
        });
        toast.success("Etapa actualizada");
      } else {
        await api.createStage(token!, {
          key: form.key.trim().toUpperCase(),
          name: form.name.trim(),
          isDefault: form.isDefault,
        });
        toast.success("Etapa creada");
      }
      setShowModal(false);
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al guardar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: PipelineStage) => {
    if (s._count.leads > 0) {
      toast.error(
        `No se puede eliminar "${s.name}" porque tiene ${s._count.leads} lead(s) asignados`,
      );
      return;
    }
    const ok = await confirm({
      title: "Eliminar etapa",
      message: `¿Estás seguro de eliminar la etapa "${s.name}"? Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteStage(token!, s.id);
      toast.success("Etapa eliminada");
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al eliminar";
      toast.error(msg);
    }
  };

  // Drag & drop reordering
  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const newStages = [...stages];
    const [moved] = newStages.splice(dragIdx, 1);
    newStages.splice(idx, 0, moved);
    setStages(newStages);
    setDragIdx(idx);
  };

  const handleDrop = async () => {
    if (dragIdx === null) return;
    setDragIdx(null);
    try {
      const ids = stages.map((s) => s.id);
      await api.reorderStages(token!, ids);
      toast.success("Orden actualizado");
    } catch {
      toast.error("Error al reordenar");
      load(); // Reload to reset
    }
  };

  return (
    <div>
      <PageHeader
        title="Etapas del embudo"
        description="Definí las etapas del pipeline de ventas por donde pasan tus leads"
        action={
          isBusiness ? (
            <button onClick={openCreate} className="btn-primary">
              <Plus className="w-4 h-4" /> Nueva etapa
            </button>
          ) : undefined
        }
      />

      {loading ? (
        <PageLoader />
      ) : stages.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="Sin etapas configuradas"
          description="Creá las etapas del embudo de ventas"
          action={
            isBusiness ? (
              <button onClick={openCreate} className="btn-primary">
                <Plus className="w-4 h-4" /> Nueva etapa
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 mb-3">
            {isBusiness
              ? "Arrastrá para reordenar las etapas del embudo"
              : "Las etapas del embudo son configuradas por tu administrador"}
          </p>
          {stages.map((s, idx) => (
            <div
              key={s.id}
              draggable={isBusiness}
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={handleDrop}
              onDragEnd={() => setDragIdx(null)}
              className={`card p-4 flex items-center gap-4 transition-all ${
                dragIdx === idx ? "ring-2 ring-brand-500 shadow-lg" : ""
              } ${isBusiness ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              {isBusiness && (
                <GripVertical className="w-5 h-5 text-gray-300 shrink-0" />
              )}

              <div className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 font-bold text-sm shrink-0">
                {idx + 1}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{s.name}</h3>
                  <span className="text-xs text-gray-400 font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                    {s.key}
                  </span>
                  {(s as unknown as { isDefault?: boolean }).isDefault && (
                    <Badge variant="success">
                      <Star className="w-3 h-3" /> Por defecto
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {s._count.leads} lead{s._count.leads !== 1 ? "s" : ""} en esta etapa
                </p>
              </div>

              {isBusiness && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(s)}
                    className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 transition"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(s)}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal
          open
          onClose={() => setShowModal(false)}
          title={editingId ? "Editar etapa" : "Nueva etapa"}
          footer={
            <>
              <button onClick={() => setShowModal(false)} className="btn-secondary">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? "Guardando..." : editingId ? "Actualizar" : "Crear"}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="label">Nombre</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => {
                  setForm({
                    ...form,
                    name: e.target.value,
                    // Auto-generate key from name if creating
                    ...(editingId
                      ? {}
                      : {
                          key: e.target.value
                            .toUpperCase()
                            .replace(/[^A-Z0-9_]/g, "_")
                            .replace(/_+/g, "_")
                            .replace(/^_|_$/g, ""),
                        }),
                  });
                }}
                placeholder="Ej: Contactado"
                className="input"
              />
            </div>
            <div>
              <label className="label">Clave única</label>
              <input
                type="text"
                value={form.key}
                onChange={(e) =>
                  setForm({
                    ...form,
                    key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
                  })
                }
                placeholder="Ej: CONTACTED"
                className="input font-mono"
              />
              <p className="text-xs text-gray-400 mt-0.5">
                Identificador interno, solo letras, números y guiones bajos
              </p>
            </div>
            {!editingId && (
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <label className="text-sm text-gray-700 dark:text-gray-300">
                  Es la etapa por defecto para leads nuevos
                </label>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
