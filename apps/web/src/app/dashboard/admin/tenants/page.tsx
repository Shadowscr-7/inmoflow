"use client";

import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import {
  Building2,
  Plus,
  Pencil,
  X,
  Check,
  AlertTriangle,
  ShieldOff,
  CreditCard,
  Calendar,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";

type Tenant = {
  id: string;
  name: string;
  plan: string;
  createdAt: string;
  subscriptionStatus: string;
  subscriptionStartedAt: string | null;
  subscriptionEndsAt: string | null;
  subscriptionGraceDays: number;
  paymentProvider: string | null;
  paymentReference: string | null;
  paymentNotes: string | null;
  _count: { users: number };
};

const PLAN_LABELS: Record<string, string> = {
  STARTER: "Starter",
  PROFESSIONAL: "Profesional",
  CUSTOM: "Custom",
};

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: "Activo", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  TRIALING: { label: "Trial", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  PAST_DUE: { label: "Vencido", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  CANCELLED: { label: "Cancelado", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const PAYMENT_PROVIDERS = ["STRIPE", "PAYPAL", "CRYPTO", "MANUAL"];

function getSubscriptionState(tenant: Tenant): { type: "active" | "warning" | "blocked" | "none"; daysLeft?: number; daysOverdue?: number } {
  if (!tenant.subscriptionEndsAt) return { type: "none" };
  const endsAt = new Date(tenant.subscriptionEndsAt);
  const now = new Date();
  const msPerDay = 86_400_000;
  const daysUntil = Math.ceil((endsAt.getTime() - now.getTime()) / msPerDay);
  if (daysUntil > 0) return { type: "active", daysLeft: daysUntil };
  const daysOverdue = Math.abs(daysUntil);
  if (daysOverdue > tenant.subscriptionGraceDays) return { type: "blocked", daysOverdue };
  return { type: "warning", daysLeft: tenant.subscriptionGraceDays - daysOverdue };
}

export default function AdminTenantsPage() {
  const { token, user } = useAuth();
  const { addToast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const loadTenants = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.getTenants(token);
      setTenants(res as Tenant[]);
    } catch {
      addToast({ type: "error", message: "Error al cargar tenants" });
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  if (user?.role !== "ADMIN") {
    return <div className="flex items-center justify-center h-64 text-gray-500">Sin permisos.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="text-brand-600" /> Tenants / Facturación
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 bg-brand-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-brand-700 transition"
        >
          <Plus size={16} /> Nuevo tenant
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="grid gap-4">
          {tenants.map((t) => {
            const subState = getSubscriptionState(t);
            const statusCfg = STATUS_CFG[t.subscriptionStatus] ?? STATUS_CFG.ACTIVE;
            return (
              <div
                key={t.id}
                className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                {/* Left: tenant info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 dark:text-white">{t.name}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                      {PLAN_LABELS[t.plan] ?? t.plan}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.color}`}>
                      {statusCfg.label}
                    </span>
                    {subState.type === "warning" && (
                      <span className="text-xs flex items-center gap-1 text-amber-600">
                        <AlertTriangle size={12} /> Vence en {subState.daysLeft}d
                      </span>
                    )}
                    {subState.type === "blocked" && (
                      <span className="text-xs flex items-center gap-1 text-red-600">
                        <ShieldOff size={12} /> Bloqueado ({subState.daysOverdue}d vencido)
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>{t._count.users} usuario{t._count.users !== 1 ? "s" : ""}</span>
                    {t.subscriptionEndsAt && (
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        Vence: {new Date(t.subscriptionEndsAt).toLocaleDateString("es-AR")}
                      </span>
                    )}
                    {t.paymentProvider && (
                      <span className="flex items-center gap-1">
                        <CreditCard size={11} />
                        {t.paymentProvider}{t.paymentReference ? ` · ${t.paymentReference.slice(0, 20)}` : ""}
                      </span>
                    )}
                  </div>
                  {t.paymentNotes && (
                    <p className="mt-1 text-xs text-gray-400 italic">{t.paymentNotes}</p>
                  )}
                </div>
                {/* Right: actions */}
                <button
                  onClick={() => setEditTenant(t)}
                  className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 border border-brand-200 dark:border-brand-800 px-3 py-1.5 rounded-lg transition shrink-0"
                >
                  <Pencil size={14} /> Editar
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Create tenant modal */}
      {showCreate && (
        <CreateTenantModal
          token={token!}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); loadTenants(); }}
          addToast={addToast}
        />
      )}

      {/* Edit subscription modal */}
      {editTenant && (
        <EditTenantModal
          token={token!}
          tenant={editTenant}
          onClose={() => setEditTenant(null)}
          onSaved={() => { setEditTenant(null); loadTenants(); }}
          addToast={addToast}
        />
      )}
    </div>
  );
}

/* ─── Create Tenant Modal ─────────────────────────── */
function CreateTenantModal({
  token, onClose, onSaved, addToast,
}: {
  token: string;
  onClose: () => void;
  onSaved: () => void;
  addToast: (t: { type: string; message: string }) => void;
}) {
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("STARTER");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { addToast({ type: "error", message: "El nombre es requerido" }); return; }
    setSaving(true);
    try {
      await api.createTenant(token, { name: name.trim(), plan });
      addToast({ type: "success", message: "Tenant creado" });
      onSaved();
    } catch {
      addToast({ type: "error", message: "Error al crear tenant" });
    }
    setSaving(false);
  };

  return (
    <Modal title="Nuevo tenant" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" placeholder="Inmobiliaria XYZ" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Plan</label>
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700">
            <option value="STARTER">Starter</option>
            <option value="PROFESSIONAL">Profesional</option>
            <option value="CUSTOM">Custom</option>
          </select>
        </div>
        <ModalFooter onClose={onClose} onSave={handleSave} saving={saving} />
      </div>
    </Modal>
  );
}

/* ─── Edit Tenant Modal ───────────────────────────── */
function EditTenantModal({
  token, tenant, onClose, onSaved, addToast,
}: {
  token: string;
  tenant: Tenant;
  onClose: () => void;
  onSaved: () => void;
  addToast: (t: { type: string; message: string }) => void;
}) {
  const [name, setName] = useState(tenant.name);
  const [plan, setPlan] = useState(tenant.plan);
  const [subscriptionStatus, setSubscriptionStatus] = useState(tenant.subscriptionStatus);
  const [subscriptionStartedAt, setSubscriptionStartedAt] = useState(
    tenant.subscriptionStartedAt ? tenant.subscriptionStartedAt.split("T")[0] : ""
  );
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState(
    tenant.subscriptionEndsAt ? tenant.subscriptionEndsAt.split("T")[0] : ""
  );
  const [subscriptionGraceDays, setSubscriptionGraceDays] = useState(tenant.subscriptionGraceDays);
  const [paymentProvider, setPaymentProvider] = useState(tenant.paymentProvider ?? "");
  const [paymentReference, setPaymentReference] = useState(tenant.paymentReference ?? "");
  const [paymentNotes, setPaymentNotes] = useState(tenant.paymentNotes ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateTenant(token, tenant.id, {
        name: name.trim() || undefined,
        plan,
        subscriptionStatus,
        subscriptionStartedAt: subscriptionStartedAt || null,
        subscriptionEndsAt: subscriptionEndsAt || null,
        subscriptionGraceDays,
        paymentProvider: paymentProvider || null,
        paymentReference: paymentReference || null,
        paymentNotes: paymentNotes || null,
      });
      addToast({ type: "success", message: "Tenant actualizado" });
      onSaved();
    } catch {
      addToast({ type: "error", message: "Error al guardar" });
    }
    setSaving(false);
  };

  return (
    <Modal title={`Editar: ${tenant.name}`} onClose={onClose} wide>
      <div className="space-y-5">
        {/* Basic info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nombre</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Plan</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700">
              <option value="STARTER">Starter</option>
              <option value="PROFESSIONAL">Profesional</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </div>
        </div>

        {/* Subscription */}
        <div className="border-t dark:border-gray-700 pt-4">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <CreditCard size={14} /> Suscripción
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Estado</label>
              <select value={subscriptionStatus} onChange={(e) => setSubscriptionStatus(e.target.value)} className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700">
                <option value="ACTIVE">Activo</option>
                <option value="TRIALING">Trial</option>
                <option value="PAST_DUE">Vencido</option>
                <option value="CANCELLED">Cancelado</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Días de gracia</label>
              <input type="number" min={0} max={30} value={subscriptionGraceDays} onChange={(e) => setSubscriptionGraceDays(parseInt(e.target.value) || 5)} className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Fecha de inicio</label>
              <input type="date" value={subscriptionStartedAt} onChange={(e) => setSubscriptionStartedAt(e.target.value)} className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Fecha de vencimiento</label>
              <input type="date" value={subscriptionEndsAt} onChange={(e) => setSubscriptionEndsAt(e.target.value)} className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
            </div>
          </div>
        </div>

        {/* Payment */}
        <div className="border-t dark:border-gray-700 pt-4">
          <h4 className="text-sm font-semibold mb-3">Método de pago</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Proveedor</label>
              <select value={paymentProvider} onChange={(e) => setPaymentProvider(e.target.value)} className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700">
                <option value="">Sin especificar</option>
                {PAYMENT_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Referencia / ID</label>
              <input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" placeholder="sub_xxx / txHash / etc." />
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-sm font-medium mb-1">Notas internas</label>
            <textarea value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} rows={2} className="w-full border rounded px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" placeholder="Observaciones de pago..." />
          </div>
        </div>

        <ModalFooter onClose={onClose} onSave={handleSave} saving={saving} saveLabel="Guardar cambios" />
      </div>
    </Modal>
  );
}

/* ─── Shared components ───────────────────────────── */
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className={`bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full ${wide ? "max-w-2xl" : "max-w-md"} p-6 space-y-4 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalFooter({ onClose, onSave, saving, saveLabel = "Crear" }: { onClose: () => void; onSave: () => void; saving: boolean; saveLabel?: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button onClick={onClose} className="px-4 py-2 text-sm rounded border dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800">Cancelar</button>
      <button onClick={onSave} disabled={saving} className="px-4 py-2 text-sm rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2">
        {saving ? "Guardando..." : <><Check size={14} /> {saveLabel}</>}
      </button>
    </div>
  );
}
