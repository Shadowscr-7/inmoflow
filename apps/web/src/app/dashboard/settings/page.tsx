"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { api, type User } from "@/lib/api";
import {
  Users,
  Plus,
  Trash2,
  Shield,
  UserCircle,
  Building2,
  Eye,
  Pencil,
  Search,
  Crown,
  Sparkles,
  Zap,
  AlertTriangle,
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

type Tenant = { id: string; name: string; plan: string; _count: { users: number } };

const ROLE_LABELS: Record<string, { label: string; variant: "warning" | "success" | "info" | "default"; icon: typeof Shield }> = {
  ADMIN: { label: "Super Admin", variant: "warning", icon: Shield },
  BUSINESS: { label: "Empresa", variant: "success", icon: Building2 },
  AGENT: { label: "Agente", variant: "info", icon: UserCircle },
  VIEWER: { label: "Visor", variant: "default", icon: Eye },
};

const PLAN_OPTIONS = [
  { value: "STARTER", label: "Starter", icon: Zap, color: "text-gray-400", bg: "bg-gray-100 dark:bg-gray-700" },
  { value: "PROFESSIONAL", label: "Profesional", icon: Sparkles, color: "text-brand-600", bg: "bg-brand-50" },
  { value: "CUSTOM", label: "Custom", icon: Crown, color: "text-amber-600", bg: "bg-amber-50" },
];

const PLAN_LIMITS_LABELS: Record<string, string> = {
  STARTER: "3 usuarios · 5 reglas · Sin IA",
  PROFESSIONAL: "10 usuarios · Reglas ilimitadas · IA incluida",
  CUSTOM: "Usuarios ilimitados · Todo incluido",
};

export default function SettingsPage() {
  const { user: authUser, token } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const isAdmin = authUser?.role === "ADMIN";
  const isBusiness = authUser?.role === "BUSINESS";
  const canManage = isAdmin || isBusiness;

  // ─── State ───────────────────────────────────
  const [users, setUsers] = useState<User[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTenantId, setFilterTenantId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  // ─── Modal state ─────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formEmail, setFormEmail] = useState("");
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("AGENT");
  const [formPw, setFormPw] = useState("");
  const [formTenantId, setFormTenantId] = useState("");
  const [saving, setSaving] = useState(false);

  // ─── Tenant modal state ──────────────────────
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [tenantFormName, setTenantFormName] = useState("");
  const [tenantFormPlan, setTenantFormPlan] = useState("STARTER");
  const [savingTenant, setSavingTenant] = useState(false);

  // ─── Load data ───────────────────────────────
  const loadUsers = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (isAdmin && filterTenantId) params.tenantId = filterTenantId;
      const data = await api.getUsers(token, Object.keys(params).length > 0 ? params : undefined);
      setUsers(data);
    } catch {
      toast.error("Error al cargar usuarios");
    } finally {
      setLoading(false);
    }
  }, [token, isAdmin, filterTenantId]);

  const loadTenants = useCallback(async () => {
    if (!token || !isAdmin) return;
    try {
      const data = await api.getTenants(token);
      setTenants(data);
    } catch {
      // Tenants endpoint may not be accessible for non-admin
    }
  }, [token, isAdmin]);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { loadTenants(); }, [loadTenants]);

  // ─── Filter users by search ──────────────────
  const filteredUsers = users.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (u.name?.toLowerCase().includes(q)) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      (u.tenant?.name?.toLowerCase().includes(q))
    );
  });

  // ─── Modal handlers ─────────────────────────
  const openCreate = () => {
    setEditingUser(null);
    setFormEmail("");
    setFormName("");
    setFormPw("");
    setFormRole("AGENT");
    setFormTenantId(isAdmin ? (filterTenantId || (tenants[0]?.id ?? "")) : "");
    setShowModal(true);
  };

  const openEdit = (u: User) => {
    setEditingUser(u);
    setFormEmail(u.email);
    setFormName(u.name ?? "");
    setFormPw("");
    setFormRole(u.role);
    setFormTenantId(u.tenantId ?? "");
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!editingUser && (!formEmail.trim() || !formName.trim() || !formPw.trim())) {
      toast.error("Email, nombre y contraseña son obligatorios");
      return;
    }
    if (editingUser && !formName.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        const data: Record<string, unknown> = { name: formName, role: formRole, email: formEmail };
        if (formPw.trim()) data.password = formPw;
        await api.updateUser(token!, editingUser.id, data);
        toast.success("Usuario actualizado");
      } else {
        const data: Record<string, unknown> = {
          email: formEmail,
          name: formName,
          password: formPw,
          role: formRole,
        };
        if (isAdmin && formTenantId) data.tenantId = formTenantId;
        await api.createUser(token!, data);
        toast.success("Usuario creado");
      }
      setShowModal(false);
      loadUsers();
    } catch (err) {
      toast.error((err as Error).message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u: User) => {
    const ok = await confirm({
      title: "Desactivar usuario",
      message: `¿Desactivar a ${u.name ?? u.email}? El usuario ya no podrá acceder.`,
      confirmLabel: "Desactivar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteUser(token!, u.id);
      toast.success("Usuario desactivado");
      loadUsers();
    } catch {
      toast.error("Error al desactivar usuario");
    }
  };

  // ─── Role badge ──────────────────────────────
  const roleBadge = (role: string) => {
    const r = ROLE_LABELS[role] ?? ROLE_LABELS.AGENT;
    const Icon = r.icon;
    return (
      <Badge variant={r.variant}>
        <Icon className="w-3 h-3" /> {r.label}
      </Badge>
    );
  };

  // ─── Plan badge ──────────────────────────────
  const planBadge = (plan: string) => {
    const p = PLAN_OPTIONS.find((o) => o.value === plan) ?? PLAN_OPTIONS[0];
    const Icon = p.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${p.bg} ${p.color}`}>
        <Icon className="w-3 h-3" /> {p.label}
      </span>
    );
  };

  // ─── Tenant modal handlers ───────────────────
  const openCreateTenant = () => {
    setEditingTenant(null);
    setTenantFormName("");
    setTenantFormPlan("STARTER");
    setShowTenantModal(true);
  };

  const openEditTenant = (t: Tenant) => {
    setEditingTenant(t);
    setTenantFormName(t.name);
    setTenantFormPlan(t.plan);
    setShowTenantModal(true);
  };

  const handleSaveTenant = async () => {
    if (!tenantFormName.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    setSavingTenant(true);
    try {
      if (editingTenant) {
        await api.updateTenant(token!, editingTenant.id, { name: tenantFormName, plan: tenantFormPlan });
        toast.success("Empresa actualizada");
      } else {
        await api.createTenant(token!, { name: tenantFormName, plan: tenantFormPlan });
        toast.success("Empresa creada");
      }
      setShowTenantModal(false);
      loadTenants();
    } catch (err) {
      toast.error((err as Error).message || "Error al guardar empresa");
    } finally {
      setSavingTenant(false);
    }
  };

  // ─── Available roles for create/edit ─────────
  const availableRoles = isAdmin
    ? [
        { value: "ADMIN", label: "Super Admin" },
        { value: "BUSINESS", label: "Empresa" },
        { value: "AGENT", label: "Agente" },
        { value: "VIEWER", label: "Visor" },
      ]
    : [
        { value: "AGENT", label: "Agente" },
        { value: "VIEWER", label: "Visor" },
      ];

  return (
    <div>
      <PageHeader
        title={isAdmin ? "Administración de Usuarios" : "Equipo"}
        description={
          isAdmin
            ? "Gestioná todos los usuarios y empresas de la plataforma"
            : "Gestioná los usuarios de tu equipo"
        }
        action={
          canManage ? (
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button onClick={openCreateTenant} className="btn-secondary">
                  <Building2 className="w-4 h-4" /> Nueva empresa
                </button>
              )}
              <button onClick={openCreate} className="btn-primary">
                <Plus className="w-4 h-4" /> Nuevo usuario
              </button>
            </div>
          ) : undefined
        }
      />

      {/* ─── Tenants grid (ADMIN) ────────────── */}
      {isAdmin && tenants.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Empresas</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tenants.map((t) => {
              const planOpt = PLAN_OPTIONS.find((p) => p.value === t.plan) ?? PLAN_OPTIONS[0];
              return (
                <div
                  key={t.id}
                  className="card p-4 hover:shadow-md transition-shadow cursor-pointer group"
                  onClick={() => openEditTenant(t)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-white">{t.name}</h4>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t._count.users} usuario{t._count.users !== 1 ? "s" : ""}
                      </p>
                    </div>
                    {planBadge(t.plan)}
                  </div>
                  <p className="text-xs text-gray-400">{PLAN_LIMITS_LABELS[t.plan] ?? ""}</p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditTenant(t);
                    }}
                    className="mt-2 text-xs text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity font-medium"
                  >
                    Editar plan →
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, email..."
            className="input pl-9"
          />
        </div>

        {/* Tenant filter (ADMIN only) */}
        {isAdmin && tenants.length > 0 && (
          <select
            value={filterTenantId}
            onChange={(e) => setFilterTenantId(e.target.value)}
            className="input w-auto min-w-[200px]"
          >
            <option value="">Todas las empresas</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t._count.users} usuarios)
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Users table */}
      {loading ? (
        <PageLoader />
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Sin usuarios"
          description={searchQuery ? "No se encontraron usuarios con ese criterio" : "Creá usuarios para tu equipo"}
          action={
            canManage && !searchQuery ? (
              <button onClick={openCreate} className="btn-primary">
                <Plus className="w-4 h-4" /> Nuevo usuario
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-700">
              <tr>
                <th className="table-header">Nombre</th>
                <th className="table-header">Email</th>
                <th className="table-header">Rol</th>
                {isAdmin && <th className="table-header hidden md:table-cell">Empresa</th>}
                <th className="table-header text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="table-cell font-medium text-gray-900 dark:text-white">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-xs font-semibold text-brand-700">
                        {(u.name ?? u.email)
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div>
                        <p>{u.name ?? "—"}</p>
                        {u.id === authUser?.id && (
                          <span className="text-[10px] text-brand-600 font-medium">(Tú)</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="table-cell text-gray-500 dark:text-gray-400">{u.email}</td>
                  <td className="table-cell">{roleBadge(u.role)}</td>
                  {isAdmin && (
                    <td className="table-cell hidden md:table-cell text-gray-500 dark:text-gray-400">
                      {u.tenant?.name ?? (
                        <span className="text-xs text-gray-400 italic">Sin empresa</span>
                      )}
                    </td>
                  )}
                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canManage && (
                        <button
                          onClick={() => openEdit(u)}
                          className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {canManage && u.id !== authUser?.id && (
                        <button
                          onClick={() => handleDelete(u)}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                          title="Desactivar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <Modal
          open
          onClose={() => setShowModal(false)}
          title={editingUser ? "Editar usuario" : "Nuevo usuario"}
          footer={
            <>
              <button onClick={() => setShowModal(false)} className="btn-secondary">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? "Guardando..." : editingUser ? "Guardar cambios" : "Crear usuario"}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="label">Nombre completo</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="María García"
                className="input"
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="maria@miinmobiliaria.com"
                className="input"
                disabled={!!editingUser}
              />
            </div>
            <div>
              <label className="label">
                {editingUser ? "Nueva contraseña (dejar vacío para no cambiar)" : "Contraseña"}
              </label>
              <input
                type="password"
                value={formPw}
                onChange={(e) => setFormPw(e.target.value)}
                placeholder="••••••••"
                className="input"
              />
              <p className="text-xs text-gray-400 mt-1">Mín. 8 caracteres, con mayúscula, minúscula y número</p>
            </div>
            <div>
              <label className="label">Rol</label>
              <select
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
                className="input"
              >
                {availableRoles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            {/* ADMIN creating in specific tenant */}
            {isAdmin && !editingUser && (
              <div>
                <label className="label">Empresa</label>
                <select
                  value={formTenantId}
                  onChange={(e) => setFormTenantId(e.target.value)}
                  className="input"
                >
                  <option value="">Sin empresa (Super Admin)</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Los usuarios ADMIN no necesitan empresa. BUSINESS, AGENT y VIEWER sí.
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Create / Edit Tenant Modal (ADMIN) */}
      {showTenantModal && (
        <Modal
          open
          onClose={() => setShowTenantModal(false)}
          title={editingTenant ? "Editar empresa" : "Nueva empresa"}
          footer={
            <>
              <button onClick={() => setShowTenantModal(false)} className="btn-secondary">
                Cancelar
              </button>
              <button onClick={handleSaveTenant} disabled={savingTenant} className="btn-primary">
                {savingTenant ? "Guardando..." : editingTenant ? "Guardar cambios" : "Crear empresa"}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="label">Nombre de la empresa</label>
              <input
                type="text"
                value={tenantFormName}
                onChange={(e) => setTenantFormName(e.target.value)}
                placeholder="Mi Inmobiliaria"
                className="input"
              />
            </div>
            <div>
              <label className="label">Plan</label>
              <div className="grid grid-cols-1 gap-3">
                {PLAN_OPTIONS.map((plan) => {
                  const Icon = plan.icon;
                  const isSelected = tenantFormPlan === plan.value;
                  return (
                    <button
                      key={plan.value}
                      type="button"
                      onClick={() => setTenantFormPlan(plan.value)}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                        isSelected
                          ? "border-brand-500 bg-brand-50/50 shadow-sm"
                          : "border-gray-200 hover:border-gray-300 bg-white dark:bg-gray-800"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg ${plan.bg} flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 ${plan.color}`} />
                      </div>
                      <div className="flex-1">
                        <p className={`font-semibold ${isSelected ? "text-brand-700" : "text-gray-900 dark:text-white"}`}>
                          {plan.label}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {PLAN_LIMITS_LABELS[plan.value]}
                        </p>
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
