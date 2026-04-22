"use client";

import { useAuth } from "@/lib/auth";
import {
  api,
  Commission,
  CommissionRule,
  CommissionSummary,
  User,
  Lead,
} from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import {
  DollarSign,
  Plus,
  Settings,
  BarChart3,
  Check,
  X,
  Clock,
  Ban,
  ChevronDown,
  Pencil,
  Trash2,
  Paperclip,
  Upload,
  ExternalLink,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";

/* ─── helpers ─────────────────────────────────────── */

function money(v: number, currency = "USD") {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(v);
}

const OP_LABELS: Record<string, string> = {
  SALE: "Venta",
  RENT: "Alquiler",
  RENT_TEMPORARY: "Alquiler Temp.",
};

const STATUS_CFG: Record<string, { label: string; color: string; icon: typeof Check }> = {
  PENDING: { label: "Pendiente", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", icon: Clock },
  APPROVED: { label: "Aprobada", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", icon: Check },
  PAID: { label: "Pagada", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", icon: DollarSign },
  CANCELLED: { label: "Cancelada", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", icon: Ban },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.PENDING;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon size={12} /> {cfg.label}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════ */

type Tab = "list" | "rules" | "summary";

export default function CommissionsPage() {
  const { token, user } = useAuth();
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>("list");

  const isManager = user?.role === "ADMIN" || user?.role === "BUSINESS";

  /* ─── shared data ───────────────────────────────── */
  const [users, setUsers] = useState<User[]>([]);
  const [rules, setRules] = useState<CommissionRule[]>([]);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.getUsers(token);
      setUsers(Array.isArray(res) ? res : ((res as { data?: User[] }).data ?? []));
    } catch { addToast({ type: "error", message: "Error al cargar usuarios" }); }
  }, [token]);

  const loadRules = useCallback(async () => {
    if (!token) return;
    try {
      setRules(await api.getCommissionRules(token));
    } catch { addToast({ type: "error", message: "Error al cargar reglas" }); }
  }, [token]);

  useEffect(() => { loadUsers(); loadRules(); }, [loadUsers, loadRules]);

  const agentName = (id: string) => {
    const u = users.find((u) => u.id === id);
    return u?.name || u?.email || id.slice(0, 8);
  };

  const tabs: { key: Tab; label: string; icon: typeof DollarSign; managerOnly?: boolean }[] = [
    { key: "list", label: "Comisiones", icon: DollarSign },
    { key: "rules", label: "Reglas", icon: Settings, managerOnly: true },
    { key: "summary", label: "Resumen", icon: BarChart3, managerOnly: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <DollarSign className="text-green-600" /> Comisiones
        </h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 flex gap-4">
        {tabs.filter((t) => !t.managerOnly || isManager).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-2 px-1 text-sm font-medium flex items-center gap-1 border-b-2 transition-colors ${
                tab === t.key
                  ? "border-green-600 text-green-600 dark:text-green-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <Icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "list" && (
        <CommissionsList
          token={token}
          users={users}
          rules={rules}
          isManager={isManager}
          agentName={agentName}
          addToast={addToast}
          currentUserId={user?.id}
        />
      )}
      {tab === "rules" && (
        <CommissionRulesTab
          token={token}
          rules={rules}
          loadRules={loadRules}
          isManager={isManager}
          addToast={addToast}
        />
      )}
      {tab === "summary" && (
        <CommissionSummaryTab
          token={token}
          users={users}
          agentName={agentName}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TAB 1: Commissions List + Create/Edit
   ═══════════════════════════════════════════════════ */

function CommissionsList({
  token,
  users,
  rules,
  isManager,
  agentName,
  addToast,
  currentUserId,
}: {
  token: string | null;
  users: User[];
  rules: CommissionRule[];
  isManager: boolean;
  agentName: (id: string) => string;
  addToast: (t: { type: string; message: string }) => void;
  currentUserId?: string;
}) {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAgent, setFilterAgent] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [payModal, setPayModal] = useState<Commission | null>(null);

  const loadCommissions = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterStatus) params.status = filterStatus;
      if (filterAgent) params.agentId = filterAgent;
      if (!isManager && currentUserId) params.agentId = currentUserId;
      const res = await api.getCommissions(token, params);
      setCommissions(res.data);
      setTotal(res.total);
    } catch { addToast({ type: "error", message: "Error al cargar comisiones" }); }
    setLoading(false);
  }, [token, filterStatus, filterAgent, isManager, currentUserId]);

  useEffect(() => { loadCommissions(); }, [loadCommissions]);

  const handleStatusChange = async (id: string, status: string) => {
    if (!token) return;
    try {
      await api.updateCommission(token, id, { status });
      addToast({ type: "success", message: `Comisión ${STATUS_CFG[status]?.label || status}` });
      loadCommissions();
    } catch {
      addToast({ type: "error", message: "Error al actualizar" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm("¿Eliminar esta comisión?")) return;
    try {
      await api.deleteCommission(token, id);
      addToast({ type: "success", message: "Comisión eliminada" });
      loadCommissions();
    } catch {
      addToast({ type: "error", message: "Error al eliminar" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters + Create button */}
      <div className="flex flex-wrap items-center gap-3">
        {isManager && (
          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-700"
          >
            <option value="">Todos los agentes</option>
            {users.filter((u) => u.role === "AGENT" || u.role === "BUSINESS").map((u) => (
              <option key={u.id} value={u.id}>{u.name || u.email}</option>
            ))}
          </select>
        )}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-700"
        >
          <option value="">Todos los estados</option>
          <option value="PENDING">Pendiente</option>
          <option value="APPROVED">Aprobada</option>
          <option value="PAID">Pagada</option>
          <option value="CANCELLED">Cancelada</option>
        </select>
        <span className="text-sm text-gray-500 ml-auto">{total} comisiones</span>
        {isManager && (
          <button
            onClick={() => { setEditId(null); setShowCreate(true); }}
            className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700 transition"
          >
            <Plus size={16} /> Nueva comisión
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : commissions.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No hay comisiones registradas</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-gray-700 text-left text-gray-500 text-xs uppercase">
                <th className="pb-2 pr-3">Fecha</th>
                <th className="pb-2 pr-3">Agente</th>
                <th className="pb-2 pr-3">Operación</th>
                <th className="pb-2 pr-3 text-right">Monto deal</th>
                <th className="pb-2 pr-3 text-right">% Com.</th>
                <th className="pb-2 pr-3 text-right">Comisión</th>
                <th className="pb-2 pr-3 text-right">Agente recibe</th>
                <th className="pb-2 pr-3 text-right">Inmobiliaria</th>
                <th className="pb-2 pr-3">Estado</th>
                <th className="pb-2 pr-3">Comprobante</th>
                {isManager && <th className="pb-2">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {commissions.map((c) => (
                <tr key={c.id} className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="py-2 pr-3 whitespace-nowrap">{new Date(c.createdAt).toLocaleDateString("es-AR")}</td>
                  <td className="py-2 pr-3">{agentName(c.agentId)}</td>
                  <td className="py-2 pr-3">{OP_LABELS[c.operationType] || c.operationType}</td>
                  <td className="py-2 pr-3 text-right font-mono">{money(c.dealAmount)}</td>
                  <td className="py-2 pr-3 text-right">{c.commissionPct}%</td>
                  <td className="py-2 pr-3 text-right font-mono font-semibold">{money(c.commissionTotal)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-green-600">{money(c.agentAmount)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-blue-600">{money(c.bizAmount)}</td>
                  <td className="py-2 pr-3"><StatusBadge status={c.status} /></td>
                  <td className="py-2 pr-3">
                    {c.proofUrl ? (
                      <a
                        href={c.proofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <Paperclip size={12} /> Ver
                      </a>
                    ) : (
                      isManager && c.status === "PAID" ? (
                        <button
                          onClick={() => setPayModal(c)}
                          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-green-600"
                          title="Adjuntar comprobante"
                        >
                          <Upload size={12} /> Adjuntar
                        </button>
                      ) : <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  {isManager && (
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        {c.status === "PENDING" && (
                          <button
                            onClick={() => handleStatusChange(c.id, "APPROVED")}
                            className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600"
                            title="Aprobar"
                          >
                            <Check size={14} />
                          </button>
                        )}
                        {c.status === "APPROVED" && (
                          <button
                            onClick={() => setPayModal(c)}
                            className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600"
                            title="Marcar pagada"
                          >
                            <DollarSign size={14} />
                          </button>
                        )}
                        {(c.status === "PENDING" || c.status === "APPROVED") && (
                          <button
                            onClick={() => handleStatusChange(c.id, "CANCELLED")}
                            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                            title="Cancelar"
                          >
                            <Ban size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => { setEditId(c.id); setShowCreate(true); }}
                          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                          title="Eliminar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreate && (
        <CommissionModal
          token={token}
          editId={editId}
          users={users}
          rules={rules}
          agentName={agentName}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); loadCommissions(); }}
          addToast={addToast}
        />
      )}

      {/* Pay + proof modal */}
      {payModal && (
        <PayProofModal
          token={token}
          commission={payModal}
          onClose={() => setPayModal(null)}
          onSaved={() => { setPayModal(null); loadCommissions(); }}
          addToast={addToast}
        />
      )}
    </div>
  );
}

/* ─── Pay + Proof Modal ──────────────────────────── */

function PayProofModal({
  token,
  commission,
  onClose,
  onSaved,
  addToast,
}: {
  token: string | null;
  commission: Commission;
  onClose: () => void;
  onSaved: () => void;
  addToast: (t: { type: string; message: string }) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const alreadyPaid = commission.status === "PAID";

  const handleSave = async () => {
    if (!token) return;
    setUploading(true);
    try {
      let proofUrl: string | undefined = undefined;

      if (file) {
        const formData = new FormData();
        formData.append("files", file);
        const uploadRes = await fetch("/api/uploads", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!uploadRes.ok) throw new Error("Error al subir el archivo");
        const uploadData = await uploadRes.json() as { files?: { publicUrl: string }[] };
        proofUrl = uploadData.files?.[0]?.publicUrl;
        if (!proofUrl) throw new Error("No se recibió URL del comprobante");
      }

      const update: { status?: string; proofUrl?: string } = {};
      if (!alreadyPaid) update.status = "PAID";
      if (proofUrl) update.proofUrl = proofUrl;

      await api.updateCommission(token, commission.id, update);
      addToast({ type: "success", message: alreadyPaid ? "Comprobante adjuntado" : "Comisión marcada como pagada" });
      onSaved();
    } catch (e) {
      addToast({ type: "error", message: (e as Error).message || "Error al guardar" });
    }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <DollarSign size={18} className="text-green-600" />
            {alreadyPaid ? "Adjuntar comprobante" : "Marcar como pagada"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Commission summary */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Agente recibe:</span>
            <span className="font-bold text-green-600">{money(commission.agentAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Inmobiliaria:</span>
            <span className="font-bold text-blue-600">{money(commission.bizAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Total comisión:</span>
            <span className="font-bold">{money(commission.commissionTotal)}</span>
          </div>
        </div>

        {/* Proof upload */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Comprobante de pago <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          {commission.proofUrl && (
            <a
              href={commission.proofUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline mb-2"
            >
              <ExternalLink size={12} /> Ver comprobante actual
            </a>
          )}
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 cursor-pointer hover:border-green-400 transition-colors">
            <Upload size={20} className="text-gray-400 mb-1" />
            <span className="text-xs text-gray-500">
              {file ? file.name : "PDF, imagen (máx. 25 MB)"}
            </span>
            <input
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={uploading}
            className="px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            {uploading && <span className="animate-spin">⏳</span>}
            {alreadyPaid ? "Guardar comprobante" : "Confirmar pago"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Create/Edit Modal ──────────────────────────── */

function CommissionModal({
  token,
  editId,
  users,
  rules,
  agentName,
  onClose,
  onSaved,
  addToast,
}: {
  token: string | null;
  editId: string | null;
  users: User[];
  rules: CommissionRule[];
  agentName: (id: string) => string;
  onClose: () => void;
  onSaved: () => void;
  addToast: (t: { type: string; message: string }) => void;
}) {
  const [agentId, setAgentId] = useState("");
  const [operationType, setOperationType] = useState<string>("SALE");
  const [dealAmount, setDealAmount] = useState("");
  const [commissionPct, setCommissionPct] = useState("");
  const [agentPct, setAgentPct] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Auto-fill from rules when operation type changes
  useEffect(() => {
    const rule = rules.find((r) => r.operationType === operationType);
    if (rule && !editId) {
      setCommissionPct(String(rule.percentage));
      setAgentPct(String(rule.splitAgentPct));
    }
  }, [operationType, rules, editId]);

  // Load existing commission data for edit
  useEffect(() => {
    if (!editId || !token) return;
    api.getCommission(token, editId).then((c) => {
      setAgentId(c.agentId);
      setOperationType(c.operationType);
      setDealAmount(String(c.dealAmount));
      setCommissionPct(String(c.commissionPct));
      setAgentPct(String(c.agentPct));
      setNotes(c.notes || "");
    }).catch(() => addToast({ type: "error", message: "Error al cargar comisión" }));
  }, [editId, token]);

  // Calculate preview
  const deal = parseFloat(dealAmount) || 0;
  const cPct = parseFloat(commissionPct) || 0;
  const aPct = parseFloat(agentPct) || 0;
  const totalComm = Math.round(deal * cPct / 100);
  const agentAmt = Math.round(totalComm * aPct / 100);
  const bizAmt = totalComm - agentAmt;

  const handleSubmit = async () => {
    if (!token) return;
    if (!agentId || !dealAmount) {
      addToast({ type: "error", message: "Agente y monto son requeridos" });
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await api.updateCommission(token, editId, {
          dealAmount: parseFloat(dealAmount),
          commissionPct: parseFloat(commissionPct),
          agentPct: parseFloat(agentPct),
          notes: notes || undefined,
        });
        addToast({ type: "success", message: "Comisión actualizada" });
      } else {
        await api.createCommission(token, {
          agentId,
          operationType,
          dealAmount: parseFloat(dealAmount),
          commissionPct: parseFloat(commissionPct) || undefined,
          agentPct: parseFloat(agentPct) || undefined,
          notes: notes || undefined,
        });
        addToast({ type: "success", message: "Comisión creada" });
      }
      onSaved();
    } catch {
      addToast({ type: "error", message: "Error al guardar" });
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-bold">{editId ? "Editar comisión" : "Nueva comisión"}</h3>

        <div>
          <label className="block text-sm font-medium mb-1">Agente</label>
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            disabled={!!editId}
            className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
          >
            <option value="">Seleccionar agente...</option>
            {users.filter((u) => u.role === "AGENT" || u.role === "BUSINESS").map((u) => (
              <option key={u.id} value={u.id}>{u.name || u.email}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Tipo de operación</label>
          <select
            value={operationType}
            onChange={(e) => setOperationType(e.target.value)}
            disabled={!!editId}
            className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
          >
            <option value="SALE">Venta</option>
            <option value="RENT">Alquiler</option>
            <option value="RENT_TEMPORARY">Alquiler Temporal</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Monto del deal ($)</label>
          <input
            type="number"
            value={dealAmount}
            onChange={(e) => setDealAmount(e.target.value)}
            placeholder="150000"
            className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">% Comisión</label>
            <input
              type="number"
              step="0.1"
              value={commissionPct}
              onChange={(e) => setCommissionPct(e.target.value)}
              placeholder="3"
              className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">% para agente</label>
            <input
              type="number"
              step="1"
              value={agentPct}
              onChange={(e) => setAgentPct(e.target.value)}
              placeholder="50"
              className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
            />
          </div>
        </div>

        {/* Live preview */}
        {deal > 0 && cPct > 0 && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Comisión total:</span>
              <span className="font-bold">{money(totalComm)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">→ Agente ({aPct}%):</span>
              <span className="font-semibold text-green-600">{money(agentAmt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">→ Inmobiliaria ({(100 - aPct).toFixed(0)}%):</span>
              <span className="font-semibold text-blue-600">{money(bizAmt)}</span>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Notas</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "Guardando..." : editId ? "Actualizar" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TAB 2: Commission Rules
   ═══════════════════════════════════════════════════ */

function CommissionRulesTab({
  token,
  rules,
  loadRules,
  isManager,
  addToast,
}: {
  token: string | null;
  rules: CommissionRule[];
  loadRules: () => void;
  isManager: boolean;
  addToast: (t: { type: string; message: string }) => void;
}) {
  const OPS: { key: string; label: string }[] = [
    { key: "SALE", label: "Venta" },
    { key: "RENT", label: "Alquiler" },
    { key: "RENT_TEMPORARY", label: "Alquiler Temporal" },
  ];

  const [editOp, setEditOp] = useState<string | null>(null);
  const [pct, setPct] = useState("");
  const [agentPct, setAgentPct] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = (op: string) => {
    const existing = rules.find((r) => r.operationType === op);
    setEditOp(op);
    setPct(existing ? String(existing.percentage) : "3");
    setAgentPct(existing ? String(existing.splitAgentPct) : "50");
  };

  const handleSave = async () => {
    if (!token || !editOp) return;
    setSaving(true);
    try {
      await api.upsertCommissionRule(token, {
        operationType: editOp,
        percentage: parseFloat(pct) || 3,
        splitAgentPct: parseFloat(agentPct) || 50,
      });
      addToast({ type: "success", message: "Regla guardada" });
      loadRules();
      setEditOp(null);
    } catch {
      addToast({ type: "error", message: "Error al guardar" });
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm("¿Eliminar esta regla?")) return;
    try {
      await api.deleteCommissionRule(token, id);
      addToast({ type: "success", message: "Regla eliminada" });
      loadRules();
    } catch {
      addToast({ type: "error", message: "Error al eliminar" });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Configura el porcentaje de comisión y la distribución agente/inmobiliaria por tipo de operación.
        Estos valores se usan como predeterminados al crear nuevas comisiones.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        {OPS.map((op) => {
          const rule = rules.find((r) => r.operationType === op.key);
          const isEditing = editOp === op.key;

          return (
            <div
              key={op.key}
              className="border dark:border-gray-700 rounded-lg p-4 space-y-3"
            >
              <h4 className="font-semibold text-sm">{op.label}</h4>

              {isEditing ? (
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-500">% Comisión</label>
                    <input
                      type="number"
                      step="0.1"
                      value={pct}
                      onChange={(e) => setPct(e.target.value)}
                      className="w-full border rounded px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-700"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">% para agente</label>
                    <input
                      type="number"
                      step="1"
                      value={agentPct}
                      onChange={(e) => setAgentPct(e.target.value)}
                      className="w-full border rounded px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-700"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      {saving ? "..." : "Guardar"}
                    </button>
                    <button
                      onClick={() => setEditOp(null)}
                      className="px-3 py-1 text-xs border rounded dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : rule ? (
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-green-600">{rule.percentage}%</div>
                  <div className="text-xs text-gray-500">
                    Agente: {rule.splitAgentPct}% · Inmobiliaria: {rule.splitBizPct}%
                  </div>
                  {isManager && (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => startEdit(op.key)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-xs text-gray-400 mb-2">Sin regla configurada</p>
                  {isManager && (
                    <button
                      onClick={() => startEdit(op.key)}
                      className="text-xs text-green-600 hover:underline flex items-center gap-1"
                    >
                      <Plus size={12} /> Configurar
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TAB 3: Commission Summary
   ═══════════════════════════════════════════════════ */

function CommissionSummaryTab({
  token,
  users,
  agentName,
}: {
  token: string | null;
  users: User[];
  agentName: (id: string) => string;
}) {
  const toast = useToast();
  const [summary, setSummary] = useState<CommissionSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setSummary(await api.getCommissionSummary(token));
    } catch { toast.error("Error al cargar resumen"); }
    setLoading(false);
  }, [token]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!summary) return <div className="text-center py-12 text-gray-500">No se pudo cargar el resumen</div>;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total operaciones" value={String(summary.totalDeals)} icon={BarChart3} color="text-gray-600" />
        <KpiCard label="Comisiones totales" value={money(summary.totalCommission)} icon={DollarSign} color="text-green-600" />
        <KpiCard label="Agentes cobran" value={money(summary.totalAgentAmount)} icon={DollarSign} color="text-emerald-600" />
        <KpiCard label="Inmobiliaria" value={money(summary.totalBizAmount)} icon={DollarSign} color="text-blue-600" />
      </div>

      {/* By Status */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3">Por estado</h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries(summary.byStatus).map(([status, count]) => (
            <div key={status} className="flex items-center gap-2">
              <StatusBadge status={status} />
              <span className="font-bold text-sm">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* By Operation Type */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3">Por tipo de operación</h3>
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(summary.byOperation).map(([op, data]) => (
            <div key={op} className="text-center">
              <div className="text-xs text-gray-500">{OP_LABELS[op] || op}</div>
              <div className="text-lg font-bold">{data.deals}</div>
              <div className="text-sm text-green-600 font-semibold">{money(data.commission)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* By Agent */}
      {Object.keys(summary.byAgent).length > 0 && (
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3">Por agente</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-gray-700 text-left text-xs text-gray-500 uppercase">
                <th className="pb-2">Agente</th>
                <th className="pb-2 text-right">Deals</th>
                <th className="pb-2 text-right">Comisión total</th>
                <th className="pb-2 text-right">Agente cobra</th>
                <th className="pb-2 text-right">Pendientes</th>
                <th className="pb-2 text-right">Pagadas</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(summary.byAgent)
                .sort((a, b) => b[1].commission - a[1].commission)
                .map(([id, data]) => (
                  <tr key={id} className="border-b dark:border-gray-800">
                    <td className="py-2">{agentName(id)}</td>
                    <td className="py-2 text-right">{data.deals}</td>
                    <td className="py-2 text-right font-mono font-semibold">{money(data.commission)}</td>
                    <td className="py-2 text-right font-mono text-green-600">{money(data.agentAmount)}</td>
                    <td className="py-2 text-right">{data.status["PENDING"] || 0}</td>
                    <td className="py-2 text-right">{data.status["PAID"] || 0}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof DollarSign; color: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className={color} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
