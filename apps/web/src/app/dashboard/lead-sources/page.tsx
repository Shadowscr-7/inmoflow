"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api, type LeadSource, API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Plus, Globe, Pencil, Trash2, Database, Facebook, Unplug, Loader2, ChevronRight, CheckCircle2, Webhook, Copy, RefreshCw, ExternalLink } from "lucide-react";
import { PageHeader, Modal, EmptyState, Toggle, PageLoader, useToast, useConfirm } from "@/components/ui";

const API_BASE = `${API_URL}/api`;

const TYPE_OPTIONS: { value: LeadSource["type"]; label: string }[] = [
  { value: "MANUAL", label: "Manual" },
  { value: "WEB_FORM", label: "Formulario Web" },
  { value: "META_LEAD_AD", label: "Meta Lead Ad" },
  { value: "WHATSAPP_INBOUND", label: "WhatsApp Inbound" },
  { value: "TELEGRAM_INBOUND", label: "Telegram Inbound" },
  { value: "WEBHOOK", label: "Webhook externo" },
];

const TYPE_LABELS: Record<string, string> = Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label]));

const EMPTY_FORM = { name: "", type: "MANUAL" as LeadSource["type"], metaPageId: "", metaFormId: "", webFormKey: "", enabled: true };

// ─── Meta wizard steps ──────────────────────────────
type MetaStep = "idle" | "connecting" | "select-page" | "select-form" | "confirming";

interface MetaPage { id: string; name: string; category?: string; }
interface MetaForm { id: string; name: string; status: string; }

// ─── Webhook URL Panel (reusable) ───────────────────
function WebhookUrlPanel({ apiKey, onRegenerate }: { apiKey: string; onRegenerate?: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const webhookUrl = `${API_BASE}/webhooks/inbound/${apiKey}`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const examplePayload = JSON.stringify({
    name: "Juan Pérez",
    phone: "+5491155554444",
    email: "juan@example.com",
    intent: "Comprar depto 2amb",
    notes: "Desde mi sistema",
  }, null, 2);

  const curlExample = `curl -X POST "${webhookUrl}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify({ name: "Juan Pérez", phone: "+5491155554444", email: "juan@example.com" })}'`;

  return (
    <div className="space-y-3">
      <div>
        <label className="label">URL del Webhook</label>
        <div className="flex items-center gap-2">
          <input type="text" readOnly value={webhookUrl} className="input font-mono text-xs flex-1" />
          <button
            onClick={() => copyToClipboard(webhookUrl, "url")}
            className={`btn-secondary px-3 py-2 text-xs shrink-0 ${copied === "url" ? "!text-emerald-600 !border-emerald-300" : ""}`}
          >
            {copied === "url" ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">Usá esta URL como destino de los webhooks en tu sistema externo</p>
      </div>

      {onRegenerate && (
        <button onClick={onRegenerate} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition">
          <RefreshCw className="w-3.5 h-3.5" /> Regenerar API Key (invalidará la URL actual)
        </button>
      )}

      <details className="group">
        <summary className="text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:text-brand-600 transition flex items-center gap-1">
          <ExternalLink className="w-3.5 h-3.5" /> Ver documentación del payload
        </summary>
        <div className="mt-3 space-y-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Método: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">POST</code></p>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Content-Type: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">application/json</code></p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Body de ejemplo:</p>
            <div className="relative">
              <pre className="text-xs bg-gray-900 dark:bg-gray-950 text-emerald-400 p-3 rounded-lg overflow-x-auto">{examplePayload}</pre>
              <button
                onClick={() => copyToClipboard(examplePayload, "payload")}
                className={`absolute top-2 right-2 p-1.5 rounded-md transition ${copied === "payload" ? "text-emerald-400" : "text-gray-500 hover:text-white hover:bg-gray-700"}`}
              >
                {copied === "payload" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Campos aceptados:</p>
            <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5 ml-3 list-disc">
              <li><code>name</code> — Nombre del lead (opcional)</li>
              <li><code>phone</code> — Teléfono (opcional)</li>
              <li><code>email</code> — Email (opcional)</li>
              <li><code>intent</code> — Intención de compra/alquiler (opcional)</li>
              <li><code>notes</code> — Notas adicionales (opcional)</li>
              <li><code>status</code> — Estado: NEW, CONTACTED, QUALIFIED, etc. (opcional, default: NEW)</li>
              <li><code>stageKey</code> — Clave de etapa del embudo (opcional)</li>
              <li><code>extra</code> — Objeto con campos adicionales (opcional, se guardan en notas)</li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Ejemplo con curl:</p>
            <div className="relative">
              <pre className="text-xs bg-gray-900 dark:bg-gray-950 text-sky-400 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">{curlExample}</pre>
              <button
                onClick={() => copyToClipboard(curlExample, "curl")}
                className={`absolute top-2 right-2 p-1.5 rounded-md transition ${copied === "curl" ? "text-emerald-400" : "text-gray-500 hover:text-white hover:bg-gray-700"}`}
              >
                {copied === "curl" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            También se puede enviar un array de objetos para crear múltiples leads de una vez (máx. 100 por request).
          </p>
        </div>
      </details>
    </div>
  );
}

export default function LeadSourcesPage() {
  const { token, user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [sources, setSources] = useState<(LeadSource & { _count?: { leads: number } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<LeadSource | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState("");

  // ─── Meta OAuth state ─────────────────────────────
  const [metaStatus, setMetaStatus] = useState<{ configured: boolean; connected: boolean; metaUserName?: string }>({ configured: false, connected: false });
  const [metaStep, setMetaStep] = useState<MetaStep>("idle");
  const [metaPages, setMetaPages] = useState<MetaPage[]>([]);
  const [metaForms, setMetaForms] = useState<MetaForm[]>([]);
  const [selectedPage, setSelectedPage] = useState<MetaPage | null>(null);
  const [selectedForm, setSelectedForm] = useState<MetaForm | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [showMetaWizard, setShowMetaWizard] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const oauthSucceededRef = useRef(false);

  const isAdmin = user?.role === "BUSINESS" || user?.role === "ADMIN";

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (filterType) params.type = filterType;
      const data = await api.getLeadSources(token, params);
      setSources(data as typeof sources);
    } catch {
      toast.error("Error al cargar fuentes de leads");
    } finally {
      setLoading(false);
    }
  }, [token, filterType]);

  const loadMetaStatus = useCallback(async () => {
    if (!token) return;
    try {
      const status = await api.getMetaStatus(token);
      setMetaStatus(status);
    } catch {
      // Meta not configured — that's fine
    }
  }, [token]);

  useEffect(() => { load(); loadMetaStatus(); }, [load, loadMetaStatus]);

  // Listen for OAuth popup callback
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "meta-oauth-callback") {
        if (event.data.success) {
          oauthSucceededRef.current = true;
          toast.success("Meta conectado exitosamente");
          loadMetaStatus();
          setMetaStep("select-page");
          loadMetaPages();
        } else {
          toast.error(event.data.error || "Error al conectar Meta");
          setMetaStep("idle");
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [token]);

  // ─── Meta wizard handlers ─────────────────────────

  const startMetaOAuth = async () => {
    if (!token) return;
    setMetaStep("connecting");
    try {
      const { url } = await api.getMetaAuthUrl(token);
      // Open popup
      const w = 600, h = 700;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      popupRef.current = window.open(
        url,
        "meta-oauth",
        `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`,
      );

      // Poll to detect if popup was closed without completing OAuth
      oauthSucceededRef.current = false;
      const pollTimer = setInterval(() => {
        if (popupRef.current?.closed) {
          clearInterval(pollTimer);
          if (!oauthSucceededRef.current) {
            setMetaStep("idle");
          }
        }
      }, 1000);
    } catch (err) {
      toast.error((err as Error).message || "Error al iniciar conexión Meta");
      setMetaStep("idle");
    }
  };

  const loadMetaPages = async () => {
    if (!token) return;
    setMetaLoading(true);
    try {
      const pages = await api.getMetaPages(token);
      setMetaPages(pages);
      if (pages.length === 0) {
        toast.info("No se encontraron páginas de Facebook. Asegurate de ser admin de al menos una página.");
      }
    } catch (err) {
      toast.error((err as Error).message || "Error al cargar páginas");
    } finally {
      setMetaLoading(false);
    }
  };

  const selectPage = async (page: MetaPage) => {
    if (!token) return;
    setSelectedPage(page);
    setMetaStep("select-form");
    setMetaLoading(true);
    try {
      const forms = await api.getMetaForms(token, page.id);
      setMetaForms(forms);
      if (forms.length === 0) {
        toast.info("Esta página no tiene formularios de Lead Ads. Creá uno desde Meta Ads Manager.");
      }
    } catch (err) {
      toast.error((err as Error).message || "Error al cargar formularios");
      setMetaStep("select-page");
    } finally {
      setMetaLoading(false);
    }
  };

  const selectForm = (form: MetaForm) => {
    setSelectedForm(form);
    setMetaStep("confirming");
  };

  const selectAllForms = () => {
    setSelectedForm(null);
    setMetaStep("confirming");
  };

  const confirmMetaConnection = async () => {
    if (!token || !selectedPage) return;
    setMetaLoading(true);
    try {
      await api.connectMetaPageForm(token, {
        pageId: selectedPage.id,
        formId: selectedForm?.id,
        pageName: selectedPage.name,
        formName: selectedForm?.name,
      });
      const label = selectedForm
        ? `${selectedPage.name} — ${selectedForm.name}`
        : `${selectedPage.name} (todos los formularios)`;
      toast.success(`Fuente conectada: ${label}`);
      setShowMetaWizard(false);
      resetMetaWizard();
      load();
      loadMetaStatus();
    } catch (err) {
      toast.error((err as Error).message || "Error al conectar fuente Meta");
    } finally {
      setMetaLoading(false);
    }
  };

  const disconnectMeta = async () => {
    if (!token) return;
    const ok = await confirm({
      title: "Desconectar Meta",
      message: "Esto revocará el acceso a tus páginas de Facebook. Las fuentes existentes seguirán funcionando con su token almacenado.",
      confirmLabel: "Desconectar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.disconnectMeta(token);
      toast.info("Meta desconectado");
      loadMetaStatus();
    } catch {
      toast.error("Error al desconectar");
    }
  };

  const resetMetaWizard = () => {
    setMetaStep("idle");
    setMetaPages([]);
    setMetaForms([]);
    setSelectedPage(null);
    setSelectedForm(null);
  };

  const openMetaWizard = () => {
    resetMetaWizard();
    setShowMetaWizard(true);
    if (metaStatus.connected) {
      setMetaStep("select-page");
      loadMetaPages();
    }
  };

  // ─── Standard CRUD handlers ───────────────────────

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (s: LeadSource) => {
    setEditing(s);
    setForm({
      name: s.name,
      type: s.type,
      metaPageId: s.metaPageId ?? "",
      metaFormId: s.metaFormId ?? "",
      webFormKey: s.webFormKey ?? "",
      enabled: s.enabled,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        enabled: form.enabled,
      };
      if (!editing) {
        payload.type = form.type;
      }
      if (form.type === "META_LEAD_AD") {
        payload.metaPageId = form.metaPageId.trim() || undefined;
        payload.metaFormId = form.metaFormId.trim() || undefined;
      }
      if (form.type === "WEB_FORM") {
        payload.webFormKey = form.webFormKey.trim() || undefined;
      }
      if (editing) {
        await api.updateLeadSource(token!, editing.id, payload);
        toast.success("Fuente actualizada");
        setShowModal(false);
      } else {
        const created = await api.createLeadSource(token!, payload);
        if (form.type === "WEBHOOK" && created.apiKey) {
          // Keep modal open to show the webhook URL
          toast.success("Fuente creada — copiá la URL del webhook");
          setEditing(created as LeadSource);
        } else {
          toast.success("Fuente creada");
          setShowModal(false);
        }
      }
      load();
    } catch {
      toast.error(editing ? "Error al actualizar" : "Error al crear");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Eliminar fuente",
      message: "¿Estás seguro de eliminar esta fuente de leads? Los leads asociados no se eliminarán.",
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteLeadSource(token!, id);
      toast.success("Fuente eliminada");
      load();
    } catch {
      toast.error("Error al eliminar");
    }
  };

  const handleToggle = async (s: LeadSource) => {
    try {
      await api.updateLeadSource(token!, s.id, { enabled: !s.enabled });
      toast.info(s.enabled ? "Fuente desactivada" : "Fuente activada");
      load();
    } catch {
      toast.error("Error al cambiar estado");
    }
  };

  const typeBadge = (type: string) => {
    const colors: Record<string, string> = {
      MANUAL: "bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200",
      WEB_FORM: "bg-blue-50 text-blue-700 border-blue-200",
      META_LEAD_AD: "bg-indigo-50 text-indigo-700 border-indigo-200",
      WHATSAPP_INBOUND: "bg-emerald-50 text-emerald-700 border-emerald-200",
      TELEGRAM_INBOUND: "bg-sky-50 text-sky-700 border-sky-200",
      WEBHOOK: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${colors[type] ?? "bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200"}`}>
        {TYPE_LABELS[type] ?? type}
      </span>
    );
  };

  return (
    <div>
      <PageHeader
        title="Fuentes de leads"
        description="Configurá de dónde provienen tus leads: formularios web, Meta Ads, WhatsApp, etc."
        action={
          <div className="flex items-center gap-2">
            {isAdmin && metaStatus.configured && (
              <button onClick={openMetaWizard} className="btn-secondary !border-indigo-200 !text-indigo-700 hover:!bg-indigo-50">
                <Facebook className="w-4 h-4" /> Conectar Meta Ads
              </button>
            )}
            <button onClick={openCreate} className="btn-primary">
              <Plus className="w-4 h-4" /> Nueva fuente
            </button>
          </div>
        }
      />

      {/* Meta connection status banner */}
      {isAdmin && metaStatus.configured && (
        <div className={`mb-6 p-4 rounded-xl border flex items-center justify-between ${metaStatus.connected ? "bg-indigo-50/50 border-indigo-200" : "bg-gray-50 dark:bg-gray-900 border-gray-200"}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${metaStatus.connected ? "bg-indigo-100" : "bg-gray-200"}`}>
              <Facebook className={`w-5 h-5 ${metaStatus.connected ? "text-indigo-600" : "text-gray-400"}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {metaStatus.connected ? `Meta conectado como ${metaStatus.metaUserName}` : "Meta no conectado"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {metaStatus.connected
                  ? "Podés vincular páginas y formularios de Lead Ads"
                  : "Conectá tu cuenta de Facebook para recibir leads de Meta Ads automáticamente"}
              </p>
            </div>
          </div>
          {metaStatus.connected && (
            <button onClick={disconnectMeta} className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1 transition">
              <Unplug className="w-3.5 h-3.5" /> Desconectar
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input w-auto">
          <option value="">Todos los tipos</option>
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <PageLoader />
      ) : sources.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No hay fuentes de leads"
          description="Creá tu primera fuente para empezar a recibir leads automáticamente"
          action={
            <div className="flex items-center gap-2">
              {isAdmin && metaStatus.configured && (
                <button onClick={openMetaWizard} className="btn-secondary !border-indigo-200 !text-indigo-700 hover:!bg-indigo-50">
                  <Facebook className="w-4 h-4" /> Conectar Meta Ads
                </button>
              )}
              <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> Nueva fuente</button>
            </div>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  <th className="table-header">Nombre</th>
                  <th className="table-header">Tipo</th>
                  <th className="table-header hidden sm:table-cell">Leads</th>
                  <th className="table-header hidden md:table-cell">Detalles</th>
                  <th className="table-header text-center">Activa</th>
                  <th className="table-header text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {sources.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="table-cell font-medium text-gray-900 dark:text-white">{s.name}</td>
                    <td className="table-cell">{typeBadge(s.type)}</td>
                    <td className="table-cell hidden sm:table-cell text-gray-500 dark:text-gray-400">{s._count?.leads ?? 0}</td>
                    <td className="table-cell hidden md:table-cell text-gray-500 dark:text-gray-400 text-xs">
                      {s.type === "META_LEAD_AD" && s.metaPageName && (
                        <span>{s.metaPageName}{s.metaFormName ? ` / ${s.metaFormName}` : ""}</span>
                      )}
                      {s.type === "META_LEAD_AD" && !s.metaPageName && s.metaPageId && (
                        <span>Page: {s.metaPageId}</span>
                      )}
                      {s.type === "WEB_FORM" && s.webFormKey && (
                        <span className="font-mono">{s.webFormKey}</span>
                      )}
                      {s.type === "WEBHOOK" && s.apiKey && (
                        <span className="flex items-center gap-1.5">
                          <code className="font-mono text-[10px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{s.apiKey.slice(0, 12)}…</code>
                          <button
                            onClick={() => { navigator.clipboard.writeText(`${API_BASE}/webhooks/inbound/${s.apiKey}`); toast.success("URL copiada"); }}
                            className="text-gray-400 hover:text-brand-600 transition"
                            title="Copiar URL del webhook"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      )}
                      {!((s.type === "META_LEAD_AD" && (s.metaPageName || s.metaPageId)) || (s.type === "WEB_FORM" && s.webFormKey) || (s.type === "WEBHOOK" && s.apiKey)) && (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="table-cell text-center">
                      <Toggle checked={s.enabled} onChange={() => handleToggle(s)} size="sm" />
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(s)} className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(s.id)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition">
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

      {/* ─── Manual Source Modal ──────────────────────── */}
      {showModal && (
        <Modal
          open
          onClose={() => setShowModal(false)}
          title={editing ? "Editar fuente" : "Nueva fuente de leads"}
          size="md"
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
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Formulario sitio web" className="input" />
            </div>
            <div>
              <label className="label">Tipo</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as LeadSource["type"] })} className="input" disabled={!!editing}>
                {TYPE_OPTIONS.filter((o) => o.value !== "META_LEAD_AD").map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {!editing && form.type !== "WEBHOOK" && <p className="text-xs text-gray-400 mt-1">Para Meta Lead Ads usá el botón &quot;Conectar Meta Ads&quot;</p>}
              {!editing && form.type === "WEBHOOK" && <p className="text-xs text-gray-400 mt-1">Se generará una URL única para recibir leads desde cualquier sistema externo</p>}
            </div>

            {form.type === "WEB_FORM" && (
              <div>
                <label className="label">Web Form Key</label>
                <input type="text" value={form.webFormKey} onChange={(e) => setForm({ ...form, webFormKey: e.target.value })} placeholder="contact-form-main" className="input font-mono" />
                <p className="text-xs text-gray-400 mt-1">Clave única para identificar el formulario en la API</p>
              </div>
            )}

            {/* Show webhook URL for existing WEBHOOK sources */}
            {editing && editing.type === "WEBHOOK" && editing.apiKey && (
              <WebhookUrlPanel
                apiKey={editing.apiKey}
                onRegenerate={async () => {
                  try {
                    const updated = await api.regenerateWebhookKey(token!, editing.id);
                    toast.success("API Key regenerada");
                    setEditing({ ...editing, apiKey: (updated as LeadSource).apiKey });
                    load();
                  } catch {
                    toast.error("Error al regenerar key");
                  }
                }}
              />
            )}

            <div className="flex items-center gap-3">
              <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} />
              <label className="text-sm text-gray-700 dark:text-gray-300">Fuente activa</label>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Meta Wizard Modal ───────────────────────── */}
      {showMetaWizard && (
        <Modal
          open
          onClose={() => { setShowMetaWizard(false); resetMetaWizard(); }}
          title="Conectar Meta Lead Ads"
          size="lg"
          footer={
            metaStep === "confirming" ? (
              <>
                <button onClick={() => setMetaStep("select-form")} className="btn-secondary">Atrás</button>
                <button onClick={confirmMetaConnection} disabled={metaLoading} className="btn-primary">
                  {metaLoading ? "Conectando..." : "Confirmar conexión"}
                </button>
              </>
            ) : (
              <button onClick={() => { setShowMetaWizard(false); resetMetaWizard(); }} className="btn-secondary">Cerrar</button>
            )
          }
        >
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6 text-xs">
            {[
              { key: "auth", label: "1. Autorizar" },
              { key: "page", label: "2. Página" },
              { key: "form", label: "3. Formulario" },
              { key: "confirm", label: "4. Confirmar" },
            ].map((step, i) => {
              const active =
                (step.key === "auth" && (metaStep === "idle" || metaStep === "connecting")) ||
                (step.key === "page" && metaStep === "select-page") ||
                (step.key === "form" && metaStep === "select-form") ||
                (step.key === "confirm" && metaStep === "confirming");
              const done =
                (step.key === "auth" && metaStep !== "idle" && metaStep !== "connecting") ||
                (step.key === "page" && (metaStep === "select-form" || metaStep === "confirming")) ||
                (step.key === "form" && metaStep === "confirming");
              return (
                <div key={step.key} className="flex items-center gap-2">
                  {i > 0 && <ChevronRight className="w-3 h-3 text-gray-300" />}
                  <span className={`px-2 py-1 rounded-md font-medium ${
                    active ? "bg-indigo-100 text-indigo-700" :
                    done ? "bg-emerald-100 text-emerald-700" :
                    "bg-gray-100 dark:bg-gray-700 text-gray-400"
                  }`}>
                    {done && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Step: Authorize */}
          {(metaStep === "idle" || metaStep === "connecting") && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto">
                <Facebook className="w-8 h-8 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Conectá tu cuenta de Facebook</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">
                  Vas a autorizar a InmoFlow para acceder a tus páginas de Facebook y recibir leads de tus campañas automáticamente.
                </p>
              </div>
              <button
                onClick={startMetaOAuth}
                disabled={metaStep === "connecting"}
                className="btn-primary !bg-[#1877F2] hover:!bg-[#166FE5] !text-white inline-flex items-center gap-2 px-6 py-3 text-base"
              >
                {metaStep === "connecting" ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Conectando...</>
                ) : (
                  <><Facebook className="w-5 h-5" /> Continuar con Facebook</>
                )}
              </button>
              <p className="text-xs text-gray-400 mt-2">
                Se abrirá una ventana de Facebook para autorizar los permisos necesarios.
              </p>
            </div>
          )}

          {/* Step: Select Page */}
          {metaStep === "select-page" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Seleccioná la página de Facebook que recibe los Lead Ads:</p>
              {metaLoading ? (
                <div className="flex items-center justify-center py-10 text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando páginas...
                </div>
              ) : metaPages.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-sm">No se encontraron páginas de Facebook.</p>
                  <p className="text-xs mt-1">Asegurate de ser administrador de al menos una página.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {metaPages.map((page) => (
                    <button
                      key={page.id}
                      onClick={() => selectPage(page)}
                      className="w-full flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition text-left group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                        <Globe className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">{page.name}</p>
                        {page.category && <p className="text-xs text-gray-400">{page.category}</p>}
                        <p className="text-xs text-gray-300 font-mono">ID: {page.id}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 transition" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step: Select Form */}
          {metaStep === "select-form" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => { setMetaStep("select-page"); setSelectedPage(null); }} className="text-xs text-indigo-600 hover:underline">
                  ← Cambiar página
                </button>
                <span className="text-xs text-gray-400">|</span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Página: <strong>{selectedPage?.name}</strong>
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Seleccioná el formulario de Lead Ads:</p>
              {metaLoading ? (
                <div className="flex items-center justify-center py-10 text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando formularios...
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {/* Catch-all option */}
                  <button
                    onClick={selectAllForms}
                    className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-indigo-300 bg-indigo-50/60 hover:bg-indigo-100/60 transition text-left group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                      <Globe className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-indigo-700 dark:text-indigo-300">Todos los formularios de esta página</p>
                      <p className="text-xs text-gray-500 mt-0.5">Captura leads de cualquier formulario, incluso los que crees en el futuro</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-indigo-400 group-hover:text-indigo-600 transition" />
                  </button>
                  {metaForms.length > 0 && (
                    <p className="text-xs text-gray-400 pt-1 pb-0.5 px-1">O elegí un formulario específico:</p>
                  )}
                  {metaForms.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => selectForm(f)}
                      className="w-full flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition text-left group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                        <Database className="w-5 h-5 text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">{f.name}</p>
                        <p className="text-xs text-gray-400">
                          Estado: {f.status === "ACTIVE" ? "Activo" : f.status}
                        </p>
                        <p className="text-xs text-gray-300 font-mono">ID: {f.id}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 transition" />
                    </button>
                  ))}
                  {metaForms.length === 0 && (
                    <p className="text-xs text-gray-400 text-center pt-2">No hay formularios creados en esta página aún — podés usar la opción de arriba de todas formas.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step: Confirm */}
          {metaStep === "confirming" && selectedPage && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">Revisá la configuración antes de conectar:</p>
              <div className="bg-indigo-50/50 border border-indigo-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-indigo-600 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Página de Facebook</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedPage.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-purple-600 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Formulario de Lead Ads</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {selectedForm ? selectedForm.name : "Todos los formularios (actuales y futuros)"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4">
                <p className="text-sm text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 inline mr-1" />
                  {selectedForm
                    ? "Se creará una fuente de leads que recibirá automáticamente los contactos de este formulario. Cada vez que alguien complete el formulario en tu campaña de Meta, aparecerá como lead nuevo en InmoFlow."
                    : "Se creará una fuente de leads que capturará cualquier formulario de esta página, incluyendo los que crees en el futuro. Ideal para no tener que reconectar cada vez que creás una nueva campaña."}
                </p>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
