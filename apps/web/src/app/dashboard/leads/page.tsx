"use client";

import { useAuth } from "@/lib/auth";
import { api, type Lead, type User } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { StatusBadge, PageHeader, Modal, EmptyState, TableSkeleton, useToast } from "@/components/ui";

export default function LeadsPage() {
  const { token } = useAuth();
  const toast = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const limit = 25;

  const loadLeads = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params: Record<string, string> = {
      limit: String(limit),
      offset: String(page * limit),
    };
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;

    try {
      const res = await api.getLeads(token, params);
      setLeads(res.data);
      setTotal(res.total);
    } catch {
      toast.error("Error al cargar leads");
    }
    setLoading(false);
  }, [token, search, statusFilter, page]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  useEffect(() => {
    if (!token) return;
    api.getUsers(token).then(setUsers).catch(() => {});
  }, [token]);

  const totalPages = Math.ceil(total / limit);

  return (
    <>
      <PageHeader
        title="Leads"
        description={total > 0 ? `${total} leads en total` : undefined}
        action={
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Nuevo Lead
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, teléfono o email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="input pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="input w-auto min-w-[180px]"
        >
          <option value="">Todos los estados</option>
          <option value="NEW">Nuevo</option>
          <option value="CONTACTED">Contactado</option>
          <option value="QUALIFIED">Calificado</option>
          <option value="VISIT">Visita</option>
          <option value="NEGOTIATION">Negociación</option>
          <option value="WON">Ganado</option>
          <option value="LOST">Perdido</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : leads.length === 0 ? (
        <EmptyState
          title="No hay leads"
          description="Creá tu primer lead para empezar a trabajar"
          action={
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> Nuevo Lead
            </button>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  <th className="table-header">Nombre</th>
                  <th className="table-header">Contacto</th>
                  <th className="table-header hidden sm:table-cell">Etapa</th>
                  <th className="table-header">Estado</th>
                  <th className="table-header hidden md:table-cell">Score</th>
                  <th className="table-header hidden md:table-cell">Asignado</th>
                  <th className="table-header hidden lg:table-cell">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="table-cell">
                      <Link href={`/dashboard/leads/${lead.id}`} className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
                        {lead.name ?? "Sin nombre"}
                      </Link>
                    </td>
                    <td className="table-cell text-gray-500 dark:text-gray-400">
                      {lead.phone ?? lead.email ?? "—"}
                    </td>
                    <td className="table-cell hidden sm:table-cell">
                      {lead.stage ? (
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                          {lead.stage.name}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="table-cell">
                      <StatusBadge status={lead.status} />
                    </td>
                    <td className="table-cell hidden md:table-cell">
                      {lead.score != null ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                            style={{
                              background: lead.temperature === "HOT" ? "#ef4444" : lead.temperature === "WARM" ? "#f59e0b" : "#6b7280",
                            }}>
                            {lead.score}
                          </div>
                          <span className="text-[10px]">
                            {lead.temperature === "HOT" ? "🔥" : lead.temperature === "WARM" ? "🌡️" : "❄️"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="table-cell hidden md:table-cell text-gray-500 dark:text-gray-400 text-xs">
                      {lead.assignee?.name ?? lead.assignee?.email ?? "—"}
                    </td>
                    <td className="table-cell hidden lg:table-cell text-gray-400 text-xs">
                      {new Date(lead.createdAt).toLocaleDateString("es")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500 dark:text-gray-400">
          <span>{total} leads en total</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 text-sm font-medium">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * limit >= total}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Create Lead Modal */}
      {showCreate && (
        <CreateLeadModal
          token={token!}
          users={users}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadLeads(); toast.success("Lead creado correctamente"); }}
        />
      )}
    </>
  );
}

function CreateLeadModal({
  token,
  users,
  onClose,
  onCreated,
}: {
  token: string;
  users: User[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    assigneeId: "",
    notes: "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.createLead(token, {
        name: form.name || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        assigneeId: form.assigneeId || undefined,
        notes: form.notes || undefined,
      });
      onCreated();
    } catch {
      toast.error("Error al crear lead");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Nuevo Lead"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button
            onClick={handleSubmit as unknown as () => void}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? "Creando..." : "Crear Lead"}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Nombre</label>
          <input
            placeholder="Nombre del lead"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Teléfono</label>
            <input
              placeholder="+54 11 ..."
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              placeholder="email@ejemplo.com"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input"
            />
          </div>
        </div>
        <div>
          <label className="label">Asignar a</label>
          <select
            value={form.assigneeId}
            onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
            className="input"
          >
            <option value="">Sin asignar</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Notas</label>
          <textarea
            placeholder="Notas adicionales..."
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
            className="input"
          />
        </div>
      </form>
    </Modal>
  );
}
