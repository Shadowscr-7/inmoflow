"use client";

import { useAuth } from "@/lib/auth";
import { api, BroadcastBatch, BroadcastItem, BroadcastStatus, BroadcastItemStatus, LeadSource } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import {
  Megaphone, Plus, X, CheckCircle2, XCircle, Send, RefreshCw,
  ChevronLeft, Filter, Users, AlertCircle,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { getErrorMessage } from "@/lib/errors";

const STATUS_CONFIG: Record<BroadcastStatus, { label: string; color: string }> = {
  DRAFT:     { label: "Borrador",    color: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400" },
  READY:     { label: "Listo",       color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  SENDING:   { label: "Enviando",    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  DONE:      { label: "Completado",  color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  CANCELLED: { label: "Cancelado",   color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

const ITEM_STATUS_CONFIG: Record<BroadcastItemStatus, { label: string; color: string }> = {
  PENDING:  { label: "Pendiente",  color: "bg-yellow-100 text-yellow-800" },
  APPROVED: { label: "Aprobado",   color: "bg-blue-100 text-blue-700" },
  REJECTED: { label: "Rechazado",  color: "bg-red-100 text-red-700" },
  SENT:     { label: "Enviado",    color: "bg-green-100 text-green-800" },
  FAILED:   { label: "Fallido",    color: "bg-orange-100 text-orange-700" },
};

const DEFAULT_PRICE_CHANGE_MSG =
  "Hola {nombre}! 👋 Te escribimos porque la propiedad que consultaste bajó de precio de ${precio_anterior} a ${precio_nuevo}. ¿Seguís interesado/a? Escribinos para más información.";

// Strip trailing lowercase suffixes added via dash (e.g. "Javier-rebaja" → "Javier")
function normalizeFormName(name: string): string {
  return name.replace(/(-[a-záéíóúüñ][a-záéíóúüña-z\w]*)+$/g, "").trim();
}

// Build the human-readable label: prefer enriched property+agent data over raw form name
function buildSourceLabel(s: LeadSource): string {
  if (s.propertyLabel && s.agentLabel) return `${s.propertyLabel} — ${s.agentLabel}`;
  if (s.propertyLabel) return s.propertyLabel;
  return normalizeFormName(s.name);
}

// Deduplicate sources by their label, keeping the newest per group
function deduplicateSources(sources: LeadSource[]): (LeadSource & { displayName: string })[] {
  const sorted = [...sources].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const map = new Map<string, LeadSource>();
  for (const s of sorted) {
    // Dedup key: use agentLabel+property normalized, or fallback to normalized form name
    const key = s.agentLabel
      ? `${s.agentLabel}::${normalizeFormName(s.name)}`
      : normalizeFormName(s.name);
    if (!map.has(key)) map.set(key, s);
  }
  return Array.from(map.values()).map((s) => ({ ...s, displayName: buildSourceLabel(s) }));
}

// ─── Create Modal ─────────────────────────────────────

interface CreateModalProps {
  token: string;
  onClose: () => void;
  onCreated: (batch: BroadcastBatch) => void;
}

function CreateModal({ token, onClose, onCreated }: CreateModalProps) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState("PRICE_CHANGE");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState(DEFAULT_PRICE_CHANGE_MSG);
  const [oldPrice, setOldPrice] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [propertyTitle, setPropertyTitle] = useState("");
  // sourceValue: "" | "_type_META_LEAD_AD" (all Meta) | "<uuid>" (specific source)
  const [sourceValue, setSourceValue] = useState("");
  // secondary filter when sourceValue === "_type_META_LEAD_AD"
  const [sourceFilterId, setSourceFilterId] = useState("");
  const [sources, setSources] = useState<(LeadSource & { displayName: string })[]>([]);
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  const [autoApproveStageIds, setAutoApproveStageIds] = useState<string[]>([]);
  const [autoSend, setAutoSend] = useState(false);
  const [loadingSources, setLoadingSources] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getLeadSources(token, { enriched: "true" }),
      api.getStages(token),
    ]).then(([srcs, stgs]) => {
      setSources(deduplicateSources(srcs));
      setStages(stgs);
    }).catch(() => {}).finally(() => setLoadingSources(false));
  }, [token]);

  const toggleStage = (id: string) => {
    setAutoApproveStageIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (!title.trim() || !message.trim() || !sourceValue) return;
    setSaving(true);
    const isAllMeta = sourceValue === "_type_META_LEAD_AD";
    // If "all Meta" but a secondary form filter is chosen, treat it as a specific sourceId
    const effectiveSourceId = isAllMeta ? (sourceFilterId || undefined) : sourceValue;
    const effectiveSourceType = isAllMeta && !sourceFilterId ? "META_LEAD_AD" : undefined;
    try {
      const batch = await api.createBroadcast(token, {
        type,
        title: title.trim(),
        message: message.trim(),
        metadata: {
          oldPrice: oldPrice ? Number(oldPrice.replace(/\D/g, "")) : undefined,
          newPrice: newPrice ? Number(newPrice.replace(/\D/g, "")) : undefined,
          propertyTitle: propertyTitle || undefined,
        },
        autoApproveStageIds,
        autoSend,
        ...(effectiveSourceType ? { sourceType: effectiveSourceType } : { sourceId: effectiveSourceId }),
      });
      toast.success(`Difusión creada con ${batch._count.items} leads`);
      onCreated(batch);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Nueva difusión</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tipo</label>
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
              <option value="PRICE_CHANGE">Cambio de precio</option>
              <option value="ANNOUNCEMENT">Anuncio general</option>
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Título interno *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="Ej: Bajo precio departamento Pocitos" />
          </div>

          {/* Source */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Fuente de leads *</label>
            {loadingSources ? <Spinner className="h-4 w-4" /> : (
              <select value={sourceValue} onChange={(e) => { setSourceValue(e.target.value); setSourceFilterId(""); }}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <option value="">— Seleccioná la fuente —</option>
                <option value="_type_META_LEAD_AD">📋 Todos los leads de Meta</option>
                {sources.length > 0 && (
                  <optgroup label="Formulario específico">
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>{s.displayName}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}

            {/* Secondary filter: only shown when "all Meta" is selected */}
            {sourceValue === "_type_META_LEAD_AD" && sources.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Filtrar por formulario/propiedad <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <select value={sourceFilterId} onChange={(e) => setSourceFilterId(e.target.value)}
                  className="w-full border border-dashed rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                  <option value="">— Todos los formularios —</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>{s.displayName}</option>
                  ))}
                </select>
              </div>
            )}

            <p className="text-xs text-gray-400">
              {sourceValue === "_type_META_LEAD_AD" && !sourceFilterId
                ? "Se notificará a todos los leads de Meta Lead Ads que tienen teléfono."
                : sourceValue === "_type_META_LEAD_AD" && sourceFilterId
                ? "Se notificará solo a leads del formulario seleccionado que tienen teléfono."
                : sourceValue
                ? "Se notificará a todos los leads de este formulario que tienen teléfono."
                : ""}
            </p>
          </div>

          {/* Prices (for PRICE_CHANGE) */}
          {type === "PRICE_CHANGE" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Precio anterior</label>
                <input value={oldPrice} onChange={(e) => setOldPrice(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder="Ej: 120.000" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Precio nuevo</label>
                <input value={newPrice} onChange={(e) => setNewPrice(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder="Ej: 105.000" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Propiedad (opcional)</label>
            <input value={propertyTitle} onChange={(e) => setPropertyTitle(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="Ej: Apartamento 2 dorm. en Pocitos" />
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Mensaje *</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none font-mono text-xs" />
            <p className="text-xs text-gray-400 mt-1">Variables: {"{nombre}"} {"{precio_nuevo}"} {"{precio_anterior}"} {"{propiedad}"}</p>
          </div>

          {/* Auto-approve by stage */}
          {stages.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                Auto-aprobar para leads en estas etapas
              </label>
              <div className="flex flex-wrap gap-2">
                {stages.map((s) => (
                  <button key={s.id} type="button" onClick={() => toggleStage(s.id)}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium transition ${
                      autoApproveStageIds.includes(s.id)
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-indigo-400"
                    }`}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Auto-send */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div className={`w-10 h-6 rounded-full transition-colors relative ${autoSend ? "bg-indigo-600" : "bg-gray-200 dark:bg-gray-600"}`}
              onClick={() => setAutoSend((v) => !v)}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoSend ? "translate-x-5" : "translate-x-1"}`} />
            </div>
            <span className="text-sm text-gray-700 dark:text-gray-300">Enviar automáticamente los auto-aprobados al crear</span>
          </label>

          <div className="flex justify-end gap-2 pt-2 border-t dark:border-gray-700">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              Cancelar
            </button>
            <button onClick={handleSubmit} disabled={saving || !title.trim() || !message.trim() || !sourceValue}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2">
              {saving && <Spinner className="h-4 w-4" />}
              Crear difusión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Batch Detail View ────────────────────────────────

interface BatchDetailProps {
  batchId: string;
  token: string;
  onBack: () => void;
  onRefresh: () => void;
}

function BatchDetail({ batchId, token, onBack, onRefresh }: BatchDetailProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [batch, setBatch] = useState<BroadcastBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [filterStatus, setFilterStatus] = useState<BroadcastItemStatus | "">("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const b = await api.getBroadcast(token, batchId);
      setBatch(b);
    } catch { toast.error("Error al cargar la difusión"); }
    setLoading(false);
  }, [token, batchId]);

  useEffect(() => { load(); }, [load]);

  const items = batch?.items ?? [];
  const filtered = filterStatus ? items.filter((i) => i.status === filterStatus) : items;
  const isEditable = batch && batch.status !== "DONE" && batch.status !== "CANCELLED" && batch.status !== "SENDING";

  const toggleItem = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const selectableIds = filtered.filter((i) => ["PENDING", "APPROVED", "REJECTED"].includes(i.status)).map((i) => i.id);
    if (selected.size === selectableIds.length) setSelected(new Set());
    else setSelected(new Set(selectableIds));
  };

  const handleBulkStatus = async (status: "APPROVED" | "REJECTED") => {
    if (selected.size === 0 || !batch) return;
    try {
      const updated = await api.updateBroadcastItems(token, batch.id, Array.from(selected), status);
      setBatch(updated);
      setSelected(new Set());
      toast.success(status === "APPROVED" ? "Aprobados" : "Rechazados");
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  const handleSend = async () => {
    if (!batch) return;
    const approvedCount = items.filter((i) => i.status === "APPROVED").length;
    if (approvedCount === 0) { toast.error("No hay ítems aprobados para enviar"); return; }
    const ok = await confirm({
      title: "Enviar difusión",
      message: `Se enviarán ${approvedCount} mensajes vía WhatsApp. Esta acción no se puede deshacer.`,
      confirmLabel: "Enviar",
    });
    if (!ok) return;
    setSending(true);
    try {
      const res = await api.sendBroadcast(token, batch.id);
      toast.success(`${res.queued} mensajes en cola para envío`);
      onRefresh();
      load();
    } catch (e) { toast.error(getErrorMessage(e)); }
    setSending(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!batch) return null;

  const approvedCount = items.filter((i) => i.status === "APPROVED").length;
  const sentCount = items.filter((i) => i.status === "SENT").length;
  const failedCount = items.filter((i) => i.status === "FAILED").length;
  const pendingCount = items.filter((i) => i.status === "PENDING").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={onBack} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 mt-0.5">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{batch.title}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[batch.status].color}`}>
              {STATUS_CONFIG[batch.status].label}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {items.length} leads</span>
            {approvedCount > 0 && <span className="text-blue-600">{approvedCount} aprobados</span>}
            {sentCount > 0 && <span className="text-green-600">{sentCount} enviados</span>}
            {failedCount > 0 && <span className="text-orange-600">{failedCount} fallidos</span>}
            {pendingCount > 0 && <span className="text-yellow-600">{pendingCount} pendientes</span>}
          </div>
        </div>
        {isEditable && approvedCount > 0 && (
          <button onClick={handleSend} disabled={sending}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {sending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            Enviar aprobados ({approvedCount})
          </button>
        )}
      </div>

      {/* Message preview */}
      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border dark:border-gray-700">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Mensaje template</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{batch.message}</p>
      </div>

      {/* Filters + bulk actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Filter className="h-4 w-4" />
        </div>
        <div className="flex flex-wrap gap-2">
          {[{ value: "", label: "Todos" }, ...Object.entries(ITEM_STATUS_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))].map((opt) => (
            <button key={opt.value}
              onClick={() => { setFilterStatus(opt.value as BroadcastItemStatus | ""); setSelected(new Set()); }}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition ${filterStatus === opt.value
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-indigo-400"
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
        {selected.size > 0 && isEditable && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-500">{selected.size} seleccionados</span>
            <button onClick={() => handleBulkStatus("APPROVED")}
              className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> Aprobar
            </button>
            <button onClick={() => handleBulkStatus("REJECTED")}
              className="flex items-center gap-1.5 text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-medium">
              <XCircle className="h-3.5 w-3.5" /> Rechazar
            </button>
          </div>
        )}
      </div>

      {/* Items table */}
      <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 text-xs uppercase">
            <tr>
              {isEditable && (
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={selected.size > 0 && selected.size === filtered.filter((i) => ["PENDING","APPROVED","REJECTED"].includes(i.status)).length}
                    onChange={toggleAll} className="rounded" />
                </th>
              )}
              <th className="text-left px-4 py-3 font-medium">Lead</th>
              <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Etapa</th>
              <th className="text-left px-4 py-3 font-medium">Estado</th>
              <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Mensaje personalizado</th>
              {isEditable && <th className="text-right px-4 py-3 font-medium">Acción</th>}
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {filtered.map((item) => {
              const canToggle = isEditable && ["PENDING", "APPROVED", "REJECTED"].includes(item.status);
              return (
                <tr key={item.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 ${selected.has(item.id) ? "bg-indigo-50/50 dark:bg-indigo-900/10" : ""}`}>
                  {isEditable && (
                    <td className="px-4 py-3">
                      {canToggle && (
                        <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleItem(item.id)} className="rounded" />
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-white">{item.lead.name ?? "Sin nombre"}</div>
                    <div className="text-xs text-gray-400">{item.lead.whatsappFrom ?? item.lead.phone ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs hidden sm:table-cell">
                    {item.lead.stage?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ITEM_STATUS_CONFIG[item.status].color}`}>
                      {ITEM_STATUS_CONFIG[item.status].label}
                    </span>
                    {item.error && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-red-500">
                        <AlertCircle className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate max-w-[180px]" title={item.error}>{item.error}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell max-w-xs">
                    <p className="truncate">{item.message ?? "—"}</p>
                  </td>
                  {isEditable && (
                    <td className="px-4 py-3 text-right">
                      {canToggle && (
                        <div className="flex items-center justify-end gap-1">
                          {item.status !== "APPROVED" && (
                            <button onClick={async () => {
                              try {
                                const updated = await api.updateBroadcastItems(token, batchId, [item.id], "APPROVED");
                                setBatch(updated);
                              } catch (e) { toast.error(getErrorMessage(e)); }
                            }} className="p-1.5 text-gray-400 hover:text-blue-600 rounded" title="Aprobar">
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                          )}
                          {item.status !== "REJECTED" && (
                            <button onClick={async () => {
                              try {
                                const updated = await api.updateBroadcastItems(token, batchId, [item.id], "REJECTED");
                                setBatch(updated);
                              } catch (e) { toast.error(getErrorMessage(e)); }
                            }} className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Rechazar">
                              <XCircle className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">Sin ítems con ese filtro</div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────

export default function DifusionesPage() {
  const { token } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [batches, setBatches] = useState<BroadcastBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.getBroadcasts(token);
      setBatches(Array.isArray(res) ? res : []);
    } catch { toast.error("Error al cargar difusiones"); }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleCancel = async (batch: BroadcastBatch) => {
    const ok = await confirm({ title: "Cancelar difusión", message: `¿Cancelar "${batch.title}"?`, confirmLabel: "Cancelar", danger: true });
    if (!ok || !token) return;
    try {
      await api.cancelBroadcast(token, batch.id);
      toast.success("Difusión cancelada");
      load();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  if (selectedBatchId) {
    return (
      <BatchDetail
        batchId={selectedBatchId}
        token={token!}
        onBack={() => setSelectedBatchId(null)}
        onRefresh={load}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Megaphone className="h-7 w-7 text-indigo-500" /> Difusiones
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Notificá en masa a leads por cambios de precio u otros eventos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus className="h-4 w-4" /> Nueva difusión
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : batches.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <Megaphone className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Sin difusiones</p>
          <p className="text-sm mt-1">Creá una difusión para notificar leads sobre cambios de precio</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Difusión</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Tipo</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Leads</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Creado por</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Fecha</th>
                <th className="text-right px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {batches.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onClick={() => setSelectedBatchId(b.id)}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-white">{b.title}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden sm:table-cell text-xs">
                    {b.type === "PRICE_CHANGE" ? "Cambio de precio" : "Anuncio"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[b.status].color}`}>
                      {STATUS_CONFIG[b.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs hidden md:table-cell">
                    <div className="flex items-center gap-1"><Users className="h-3 w-3" /> {b._count.items}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs hidden lg:table-cell">
                    {b.creator.name ?? b.creator.email}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell whitespace-nowrap">
                    {new Date(b.createdAt).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    {(b.status === "READY" || b.status === "DRAFT") && (
                      <button onClick={() => handleCancel(b)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Cancelar">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateModal token={token!} onClose={() => setShowCreate(false)} onCreated={(batch) => {
          setShowCreate(false);
          load();
          setSelectedBatchId(batch.id);
        }} />
      )}
    </div>
  );
}
