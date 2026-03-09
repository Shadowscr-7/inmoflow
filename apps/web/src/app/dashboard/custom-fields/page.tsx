"use client";

import { useAuth } from "@/lib/auth";
import { api, CustomFieldDefinition } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import { Settings2, Plus, X, Edit2, Trash2, GripVertical, Type, Hash, Calendar, List, ToggleLeft } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/errors";

const FIELD_TYPES = [
  { value: "TEXT", label: "Texto", icon: Type, description: "Campo de texto libre" },
  { value: "NUMBER", label: "Número", icon: Hash, description: "Valor numérico" },
  { value: "DATE", label: "Fecha", icon: Calendar, description: "Selector de fecha" },
  { value: "SELECT", label: "Selección", icon: List, description: "Lista de opciones" },
  { value: "BOOLEAN", label: "Sí / No", icon: ToggleLeft, description: "Verdadero o falso" },
];

export default function CustomFieldsPage() {
  const { token } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CustomFieldDefinition | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState("TEXT");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.getCustomFields(token);
      setFields(res);
    } catch { toast.error("Error al cargar campos"); }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setFieldType("TEXT");
    setOptions("");
    setRequired(false);
    setShowModal(true);
  };

  const openEdit = (f: CustomFieldDefinition) => {
    setEditing(f);
    setName(f.name);
    setFieldType(f.fieldType);
    setOptions((f.options ?? []).join(", "));
    setRequired(f.required);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!token || !name.trim()) return;
    setSaving(true);
    try {
      const data: { name: string; fieldType: string; required: boolean; options?: string[] } = { name: name.trim(), fieldType, required };
      if (fieldType === "SELECT") {
        data.options = options.split(",").map((o: string) => o.trim()).filter(Boolean);
      }
      if (editing) {
        await api.updateCustomField(token, editing.id, data);
        toast.success("Campo actualizado");
      } else {
        await api.createCustomField(token, data);
        toast.success("Campo creado");
      }
      setShowModal(false);
      load();
    } catch (e: unknown) { toast.error(getErrorMessage(e)); }
    setSaving(false);
  };

  const handleDelete = async (f: CustomFieldDefinition) => {
    const ok = await confirm({ title: "Eliminar campo", message: `¿Eliminar "${f.name}"? Se perderán los valores de todos los leads.`, confirmLabel: "Eliminar", danger: true });
    if (!ok || !token) return;
    try {
      await api.deleteCustomField(token, f.id);
      toast.success("Campo eliminado");
      load();
    } catch (e: unknown) { toast.error(getErrorMessage(e)); }
  };

  const getTypeInfo = (type: string) => FIELD_TYPES.find((t) => t.value === type) ?? FIELD_TYPES[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Settings2 className="h-7 w-7 text-indigo-500" /> Campos Personalizados
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Define campos adicionales para tus leads</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus className="h-4 w-4" /> Nuevo campo
        </button>
      </div>

      {loading ? <div className="flex justify-center py-12"><Spinner /></div> : fields.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <Settings2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Sin campos personalizados</p>
          <p className="text-sm mt-1">Agrega campos adicionales para capturar información específica de tu negocio</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Campo</th>
                <th className="text-left px-4 py-3 font-medium">Tipo</th>
                <th className="text-left px-4 py-3 font-medium">Opciones</th>
                <th className="text-center px-4 py-3 font-medium">Requerido</th>
                <th className="text-right px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {fields.map((f) => {
                const typeInfo = getTypeInfo(f.fieldType);
                const Icon = typeInfo.icon;
                return (
                  <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                        <span className="font-medium text-gray-900 dark:text-white">{f.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                        <Icon className="h-4 w-4" />
                        <span>{typeInfo.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {f.fieldType === "SELECT" && f.options?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {f.options.slice(0, 5).map((o, i) => (
                            <span key={i} className="px-1.5 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-700">{o}</span>
                          ))}
                          {f.options.length > 5 && <span className="text-xs text-gray-400">+{f.options.length - 5}</span>}
                        </div>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {f.required ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">Sí</span>
                      ) : (
                        <span className="text-xs text-gray-400">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(f)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded"><Edit2 className="h-4 w-4" /></button>
                        <button onClick={() => handleDelete(f)} className="p-1.5 text-gray-400 hover:text-red-600 rounded"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? "Editar campo" : "Nuevo campo"}</h2>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nombre *</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder="Ej: Presupuesto, Zona preferida..." autoFocus />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Tipo de campo</label>
                <div className="grid grid-cols-2 gap-2">
                  {FIELD_TYPES.map((ft) => {
                    const Icon = ft.icon;
                    return (
                      <button key={ft.value} onClick={() => setFieldType(ft.value)}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm text-left transition ${fieldType === ft.value
                          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300"
                          : "border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        }`}>
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <div>
                          <div className="font-medium">{ft.label}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{ft.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {fieldType === "SELECT" && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Opciones (separadas por coma)</label>
                  <textarea value={options} onChange={(e) => setOptions(e.target.value)} rows={2}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="Opción 1, Opción 2, Opción 3" />
                </div>
              )}

              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)}
                  className="rounded border-gray-300" />
                Campo requerido
              </label>

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
