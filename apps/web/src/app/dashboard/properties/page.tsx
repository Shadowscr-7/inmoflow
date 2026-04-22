"use client";

import { useAuth } from "@/lib/auth";
import { api, Property, PropertyMedia, WhatsAppShare, API_URL } from "@/lib/api";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Building2, Plus, Search, X, Edit2, Trash2, MapPin, BedDouble, Bath, Car, Ruler, DollarSign, Eye, QrCode, Share2, ExternalLink,
  Image as ImageIcon, Video, Link2, Loader2, GripVertical, Upload, ChevronLeft, ChevronRight, User as UserIcon, Instagram, Download, Film,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Spinner } from "@/components/ui/spinner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/errors";
import { InstagramPostCard } from "@/components/instagram-post-card";

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Activa", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  { value: "RESERVED", label: "Reservada", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
  { value: "SOLD", label: "Vendida", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  { value: "RENTED", label: "Alquilada", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  { value: "INACTIVE", label: "Inactiva", color: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" },
];

const TYPE_OPTIONS = [
  "Apartamento", "Casa", "Terreno", "Local comercial", "Oficina", "Depósito", "Campo", "Otro",
];

const CURRENCY_OPTIONS = ["USD", "UYU", "ARS", "BRL", "EUR"];

function getStatusBadge(status: string) {
  const s = STATUS_OPTIONS.find((o) => o.value === status);
  return s ? <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.color}`}>{s.label}</span> : <span className="text-xs text-gray-500">{status}</span>;
}

function formatPrice(price: number | null, currency: string | null) {
  if (!price) return "—";
  return `${currency ?? "USD"} ${price.toLocaleString()}`;
}

export default function PropertiesPage() {
  const { token } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [properties, setProperties] = useState<Property[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Debounce search input 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [viewing, setViewing] = useState<Property | null>(null);
  const [viewMediaIdx, setViewMediaIdx] = useState(0);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [media, setMedia] = useState<PropertyMedia[]>([]);
  const [mediaUrl, setMediaUrl] = useState("");
  const [addingMedia, setAddingMedia] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  // Pending media for new properties (before property ID exists)
  const [pendingMedia, setPendingMedia] = useState<Array<{ url: string; kind?: string }>>([]);
  // Instagram image generation
  const [igLoading, setIgLoading] = useState<string | null>(null);
  const [igPreview, setIgPreview] = useState<Property | null>(null);
  const igCardRef = useRef<HTMLDivElement>(null);
  // Reel video generation
  const [reelTarget, setReelTarget] = useState<Property | null>(null);
  const [reelForm, setReelForm] = useState({ agentName: "", agentPhone: "", voiceGender: "female" as "female" | "male" });
  const [reelStarting, setReelStarting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter) params.status = statusFilter;
      const res = await api.getProperties(token, params);
      setProperties(res.data);
      setTotal(res.total);
    } catch { toast.error("Error al cargar propiedades"); }
    setLoading(false);
  }, [token, debouncedSearch, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ status: "ACTIVE", currency: "USD" });
    setMedia([]);
    setPendingMedia([]);
    setMediaUrl("");
    setShowModal(true);
  };

  const openEdit = (p: Property) => {
    setEditing(p);
    setForm({
      title: p.title, code: p.code ?? "", description: p.description ?? "", status: p.status,
      price: p.price ?? "", currency: p.currency ?? "USD", propertyType: p.propertyType ?? "",
      bedrooms: p.bedrooms ?? "", bathrooms: p.bathrooms ?? "", areaM2: p.areaM2 ?? "",
      hasGarage: p.hasGarage ?? false, zone: p.zone ?? "", address: p.address ?? "",
    });
    setMedia(p.media ?? []);
    setMediaUrl("");
    setShowModal(true);
  };

  // Reload property to get fresh media
  const reloadPropertyMedia = async (propertyId: string) => {
    if (!token) return;
    try {
      const p = await api.getProperty(token, propertyId);
      setMedia(p.media ?? []);
    } catch { /* ignore */ }
  };

  const handleAddMedia = async () => {
    if (!token || !editing || !mediaUrl.trim()) return;
    setAddingMedia(true);
    try {
      await api.addPropertyMedia(token, editing.id, [{ url: mediaUrl.trim() }]);
      setMediaUrl("");
      await reloadPropertyMedia(editing.id);
      toast.success("Media agregada");
    } catch {
      toast.error("Error al agregar media");
    }
    setAddingMedia(false);
  };

  const handleRemoveMedia = async (mediaId: string) => {
    if (!token || !editing) return;
    try {
      await api.removePropertyMedia(token, mediaId);
      setMedia((prev) => prev.filter((m) => m.id !== mediaId));
      toast.success("Media eliminada");
    } catch {
      toast.error("Error al eliminar media");
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !token) return;
    setUploadingFiles(true);
    try {
      const uploaded = await api.uploadFiles(token, Array.from(files));
      const items = uploaded.map((f) => ({
        url: f.url,
        kind: f.mimeType.startsWith("video/") ? "video" : "image",
      }));

      if (editing) {
        // Property exists — attach media directly
        await api.addPropertyMedia(token, editing.id, items);
        await reloadPropertyMedia(editing.id);
        toast.success(`${uploaded.length} archivo(s) subido(s)`);
      } else {
        // Creating — store pending media to attach after save
        setPendingMedia((prev) => [...prev, ...items]);
        toast.success(`${uploaded.length} archivo(s) listo(s) para guardar`);
      }
    } catch {
      toast.error("Error al subir archivos");
    }
    setUploadingFiles(false);
  };

  const handleRemovePending = (index: number) => {
    setPendingMedia((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!token) return;

    // Client-side validation
    const errors: Record<string, string> = {};
    if (!form.title || !(form.title as string).trim()) errors.title = "El título es obligatorio";
    if (form.price && (isNaN(Number(form.price)) || Number(form.price) < 0)) errors.price = "Precio inválido";
    if (form.bedrooms && (isNaN(Number(form.bedrooms)) || Number(form.bedrooms) < 0)) errors.bedrooms = "Valor inválido";
    if (form.bathrooms && (isNaN(Number(form.bathrooms)) || Number(form.bathrooms) < 0)) errors.bathrooms = "Valor inválido";
    if (form.areaM2 && (isNaN(Number(form.areaM2)) || Number(form.areaM2) < 0)) errors.areaM2 = "Valor inválido";
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const data = {
        ...form,
        price: form.price ? Number(form.price) : undefined,
        bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
        bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
        areaM2: form.areaM2 ? Number(form.areaM2) : undefined,
      };
      if (editing) {
        await api.updateProperty(token, editing.id, data);
        toast.success("Propiedad actualizada");
      } else {
        const created = await api.createProperty(token, data);
        // Attach pending media to the newly created property
        if (pendingMedia.length > 0) {
          try {
            await api.addPropertyMedia(token, created.id, pendingMedia);
          } catch { /* media upload failure shouldn't block creation */ }
        }
        toast.success("Propiedad creada");
      }
      setShowModal(false);
      load();
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    }
    setSaving(false);
  };

  const handleDelete = async (p: Property) => {
    const ok = await confirm({ title: "Eliminar propiedad", message: `¿Eliminar "${p.title}"?`, confirmLabel: "Eliminar", danger: true });
    if (!ok || !token) return;
    try {
      await api.deleteProperty(token, p.id);
      toast.success("Propiedad eliminada");
      load();
    } catch (e: unknown) { toast.error(getErrorMessage(e)); }
  };

  const handleInstagramImage = (p: Property) => {
    setIgPreview(p);
  };

  const handleIgDownload = async () => {
    if (!igCardRef.current || !igPreview) return;
    setIgLoading("download");
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(igCardRef.current, {
        width: 1080,
        height: 1080,
        pixelRatio: 1,
        cacheBust: true,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `instagram-${igPreview.title.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
      a.click();
    } catch {
      toast.error("Error al generar imagen. Intentá de nuevo.");
    }
    setIgLoading(null);
  };

  const closeIgPreview = () => setIgPreview(null);

  const handleStartReel = async () => {
    if (!token || !reelTarget || !reelForm.agentName.trim() || !reelForm.agentPhone.trim()) return;
    setReelStarting(true);
    try {
      await api.startReelVideo(token, reelTarget.id, {
        agentName: reelForm.agentName,
        agentPhone: reelForm.agentPhone,
        voiceGender: reelForm.voiceGender,
      });
      toast.success("Video en proceso. Ve a Videos de propiedades para ver el progreso.");
      setReelTarget(null);
      setReelForm({ agentName: "", agentPhone: "", voiceGender: "female" });
    } catch (e: unknown) { toast.error(getErrorMessage(e)); }
    setReelStarting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Building2 className="h-7 w-7 text-indigo-500" /> Propiedades
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{total} propiedades</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus className="h-4 w-4" /> Nueva propiedad
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por título, código, zona..."
            className="w-full pl-10 pr-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-white text-sm" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-white text-sm">
          <option value="">Todos los estados</option>
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Grid */}
      {loading ? <div className="flex justify-center py-12"><Spinner /></div> : properties.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Sin propiedades</p>
          <p className="text-sm mt-1">Crea tu primera propiedad para empezar</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((p) => (
            <div key={p.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setViewMediaIdx(0); setLightboxIdx(null); setViewing(p); }}>
              {/* Image placeholder */}
              <div className="h-40 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center relative">
                {p.media && p.media.length > 0 ? (
                  <img src={p.media[0].url} alt={p.title} className="w-full h-full object-cover" />
                ) : (
                  <Building2 className="h-12 w-12 text-indigo-300 dark:text-indigo-600" />
                )}
                <div className="absolute top-2 right-2">{getStatusBadge(p.status)}</div>
                {p.code && <span className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded">{p.code}</span>}
                {p.media && p.media.length > 1 && (
                  <span className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
                    <ImageIcon className="h-3 w-3" /> {p.media.length}
                    {p.media.some((m) => m.kind === "youtube" || m.kind === "vimeo" || m.kind === "video") && (
                      <><span className="mx-0.5">·</span><Video className="h-3 w-3" /></>
                    )}
                  </span>
                )}
              </div>
              <div className="p-4 space-y-2">
                <h3 className="font-semibold text-gray-900 dark:text-white truncate">{p.title}</h3>
                {p.address && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {p.address}
                  </p>
                )}
                <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                  {p.bedrooms != null && <span className="flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" /> {p.bedrooms}</span>}
                  {p.bathrooms != null && <span className="flex items-center gap-1"><Bath className="h-3.5 w-3.5" /> {p.bathrooms}</span>}
                  {p.hasGarage && <span className="flex items-center gap-1"><Car className="h-3.5 w-3.5" /></span>}
                  {p.areaM2 != null && <span className="flex items-center gap-1"><Ruler className="h-3.5 w-3.5" /> {p.areaM2}m²</span>}
                </div>
                <div className="flex items-center justify-between pt-2 border-t dark:border-gray-700">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                    <DollarSign className="h-4 w-4" /> {formatPrice(p.price, p.currency)}
                  </span>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { setViewMediaIdx(0); setLightboxIdx(null); setViewing(p); }} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded"><Eye className="h-4 w-4" /></button>
                    <button onClick={() => handleInstagramImage(p)} className="p-1.5 text-gray-400 hover:text-pink-600 rounded" title="Generar imagen Instagram" disabled={igLoading === p.id}>
                      {igLoading === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Instagram className="h-4 w-4" />}
                    </button>
                    <button onClick={() => { setReelTarget(p); setReelForm({ agentName: "", agentPhone: "", voiceGender: "female" }); }} className="p-1.5 text-gray-400 hover:text-purple-600 rounded" title="Generar video Reel">
                      <Film className="h-4 w-4" />
                    </button>
                    <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded"><Edit2 className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(p)} className="p-1.5 text-gray-400 hover:text-red-600 rounded"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setViewing(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">{viewing.title}</h2>
                  {viewing.code && <p className="text-sm text-gray-500">Código: {viewing.code}</p>}
                </div>
                <button onClick={() => setViewing(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>
              {getStatusBadge(viewing.status)}

              {/* Media gallery with clickable images */}
              {viewing.media && viewing.media.length > 0 && (
                <div className="space-y-2">
                  <div
                    className="rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 cursor-pointer relative"
                    style={{ maxHeight: "300px" }}
                    onClick={() => setLightboxIdx(viewMediaIdx)}
                  >
                    {(() => {
                      const current = viewing.media![viewMediaIdx] ?? viewing.media![0];
                      if (current.kind === "youtube") {
                        const match = current.url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                        return match ? (
                          <iframe
                            src={`https://www.youtube.com/embed/${match[1]}`}
                            className="w-full"
                            style={{ height: "260px" }}
                            allowFullScreen
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : <img src={current.url} alt="" className="w-full h-full object-cover" />;
                      }
                      return <img src={current.url} alt={viewing.title} className="w-full object-cover" style={{ maxHeight: "300px" }} />;
                    })()}
                  </div>
                  {viewing.media.length > 1 && (
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {viewing.media.map((m, i) => (
                        <button
                          key={m.id}
                          onClick={() => setViewMediaIdx(i)}
                          className={`relative h-14 w-14 flex-shrink-0 rounded border overflow-hidden bg-gray-100 dark:bg-gray-700 transition ${i === viewMediaIdx ? "ring-2 ring-indigo-500 border-indigo-500" : "dark:border-gray-600 hover:opacity-80"}`}
                        >
                          {m.kind === "youtube" || m.kind === "vimeo" ? (
                            <>
                              {m.thumbnailUrl ? (
                                <img src={m.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex items-center justify-center h-full"><Video className="h-4 w-4 text-gray-400" /></div>
                              )}
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Video className="h-3 w-3 text-white drop-shadow" />
                              </div>
                            </>
                          ) : (
                            <img src={m.url} alt="" className="h-full w-full object-cover" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {viewing.description && <p className="text-sm text-gray-700 dark:text-gray-300">{viewing.description}</p>}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">Precio:</span> <span className="font-medium dark:text-white">{formatPrice(viewing.price, viewing.currency)}</span></div>
                <div><span className="text-gray-500">Tipo:</span> <span className="font-medium dark:text-white">{viewing.propertyType ?? "—"}</span></div>
                <div><span className="text-gray-500">Habitaciones:</span> <span className="font-medium dark:text-white">{viewing.bedrooms ?? "—"}</span></div>
                <div><span className="text-gray-500">Baños:</span> <span className="font-medium dark:text-white">{viewing.bathrooms ?? "—"}</span></div>
                <div><span className="text-gray-500">Área:</span> <span className="font-medium dark:text-white">{viewing.areaM2 ? `${viewing.areaM2}m²` : "—"}</span></div>
                <div><span className="text-gray-500">Garage:</span> <span className="font-medium dark:text-white">{viewing.hasGarage ? "Sí" : "No"}</span></div>
                <div className="col-span-2"><span className="text-gray-500">Zona:</span> <span className="font-medium dark:text-white">{viewing.zone ?? "—"}</span></div>
                <div className="col-span-2"><span className="text-gray-500">Dirección:</span> <span className="font-medium dark:text-white">{viewing.address ?? "—"}</span></div>
              </div>
              {/* Assigned agent */}
              {viewing.assignedUser && (
                <div className="flex items-center gap-2 rounded-lg bg-indigo-50 p-2 text-xs dark:bg-indigo-900/20">
                  <UserIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="font-medium text-indigo-700 dark:text-indigo-300">Agente:</span>
                  <span className="text-indigo-600 dark:text-indigo-400">{viewing.assignedUser.name ?? viewing.assignedUser.email}</span>
                </div>
              )}
              {/* MeLi seller info */}
              {viewing.meliSellerId && !viewing.assignedUser && (
                <div className="flex items-center gap-2 rounded-lg bg-orange-50 p-2 text-xs dark:bg-orange-900/20">
                  <UserIcon className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  <span className="font-medium text-orange-700 dark:text-orange-300">Vendedor MeLi:</span>
                  <span className="text-orange-600 dark:text-orange-400">ID {viewing.meliSellerId}</span>
                  <span className="text-gray-500 ml-auto text-[10px]">Sin agente asignado</span>
                </div>
              )}
              {/* MercadoLibre info */}
              {viewing.meliItemId && (
                <div className="flex items-center gap-2 rounded-lg bg-yellow-50 p-2 text-xs dark:bg-yellow-900/20">
                  <span className="font-medium text-yellow-700 dark:text-yellow-300">MercadoLibre:</span>
                  {viewing.meliPermalink ? (
                    <a href={viewing.meliPermalink} target="_blank" rel="noopener noreferrer" className="text-yellow-600 underline hover:text-yellow-800 dark:text-yellow-400">
                      Ver publicación <ExternalLink className="inline h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-yellow-600 dark:text-yellow-400">{viewing.meliItemId}</span>
                  )}
                  {viewing.meliSyncedAt && (
                    <span className="text-gray-500 ml-auto">Sync: {new Date(viewing.meliSyncedAt).toLocaleString("es")}</span>
                  )}
                </div>
              )}
              {/* QR + WhatsApp + Public Link */}
              <div className="flex flex-wrap gap-2 pt-2 border-t dark:border-gray-700">
                <a
                  href={viewing.meliPermalink
                    ? `${API_URL}/api/public/properties/${viewing.tenantId}/${viewing.slug}/qr`
                    : `${API_URL}/api/public/properties/${viewing.tenantId}/${viewing.slug}/qr`}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                >
                  <QrCode className="w-3.5 h-3.5" /> Descargar QR
                </a>
                <button
                  onClick={async () => {
                    if (!token) return;
                    try {
                      const data = await api.getWhatsAppShareLink(token, viewing.id);
                      window.open(data.whatsappUrl, "_blank");
                    } catch { toast.error("Error al generar enlace"); }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800 transition"
                >
                  <Share2 className="w-3.5 h-3.5" /> Compartir WhatsApp
                </button>
                {viewing.meliPermalink ? (
                  <a
                    href={viewing.meliPermalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 hover:bg-yellow-200 dark:hover:bg-yellow-800 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Ver en MercadoLibre
                  </a>
                ) : (
                  <a
                    href={`/p/${viewing.tenantId}/${viewing.slug}`}
                    target="_blank"
                    rel="noopener"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Página pública
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox */}
      {lightboxIdx !== null && viewing?.media && viewing.media.length > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90" onClick={() => setLightboxIdx(null)}>
          <button onClick={() => setLightboxIdx(null)} className="absolute top-4 right-4 text-white/80 hover:text-white z-10">
            <X className="h-8 w-8" />
          </button>
          {viewing.media.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIdx((lightboxIdx - 1 + viewing.media!.length) % viewing.media!.length); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white bg-black/40 rounded-full p-2 z-10"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIdx((lightboxIdx + 1) % viewing.media!.length); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white bg-black/40 rounded-full p-2 z-10"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
          <div className="max-w-4xl max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const m = viewing.media![lightboxIdx];
              if (m.kind === "youtube") {
                const match = m.url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                return match ? (
                  <iframe src={`https://www.youtube.com/embed/${match[1]}`} className="w-[80vw] h-[60vh] rounded-lg" allowFullScreen />
                ) : <img src={m.url} alt="" className="max-w-full max-h-[85vh] rounded-lg" />;
              }
              return <img src={m.url} alt="" className="max-w-full max-h-[85vh] rounded-lg object-contain" />;
            })()}
          </div>
          <div className="absolute bottom-4 text-white/60 text-sm">
            {lightboxIdx + 1} / {viewing.media.length}
          </div>
        </div>
      )}

      {/* Create/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? "Editar propiedad" : "Nueva propiedad"}</h2>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>

              <div className="grid gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Título *</label>
                  <input value={String(form.title ?? "")} onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className={`w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white ${formErrors.title ? "border-red-500" : ""}`} />
                  {formErrors.title && <p className="text-xs text-red-500 mt-1">{formErrors.title}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Código</label>
                    <input value={String(form.code ?? "")} onChange={(e) => setForm({ ...form, code: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Estado</label>
                    <select value={String(form.status ?? "ACTIVE")} onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                      {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Descripción</label>
                  <textarea rows={3} value={String(form.description ?? "")} onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Precio</label>
                    <input type="number" value={String(form.price ?? "")} onChange={(e) => setForm({ ...form, price: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Moneda</label>
                    <select value={String(form.currency ?? "USD")} onChange={(e) => setForm({ ...form, currency: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                      {CURRENCY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tipo</label>
                    <select value={String(form.propertyType ?? "")} onChange={(e) => setForm({ ...form, propertyType: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                      <option value="">— Seleccionar —</option>
                      {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Dormitorios</label>
                    <input type="number" min={0} value={String(form.bedrooms ?? "")} onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Baños</label>
                    <input type="number" min={0} value={String(form.bathrooms ?? "")} onChange={(e) => setForm({ ...form, bathrooms: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Área m²</label>
                    <input type="number" min={0} value={String(form.areaM2 ?? "")} onChange={(e) => setForm({ ...form, areaM2: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input type="checkbox" checked={!!form.hasGarage} onChange={(e) => setForm({ ...form, hasGarage: e.target.checked })}
                        className="rounded border-gray-300" />
                      Garage
                    </label>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Zona</label>
                    <input value={String(form.zone ?? "")} onChange={(e) => setForm({ ...form, zone: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Dirección</label>
                    <input value={String(form.address ?? "")} onChange={(e) => setForm({ ...form, address: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                </div>
              </div>

              {/* ─── Media Section ────── */}
              <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" /> Imágenes y videos
                  </h3>

                  {/* Upload files from device */}
                  <div className="flex gap-2">
                    <label className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed rounded-lg px-3 py-3 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 dark:border-gray-600 transition-colors">
                      <input
                        type="file"
                        multiple
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e.target.files)}
                        disabled={uploadingFiles}
                      />
                      {uploadingFiles ? (
                        <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                      ) : (
                        <Upload className="h-5 w-5 text-gray-400" />
                      )}
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {uploadingFiles ? "Subiendo…" : "Subir imágenes o videos"}
                      </span>
                    </label>
                  </div>

                  {/* Add media by URL (only when editing) */}
                  {editing && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      placeholder="URL de imagen o video (YouTube, Vimeo, etc.)"
                      className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      onKeyDown={(e) => e.key === "Enter" && handleAddMedia()}
                    />
                    <button
                      onClick={handleAddMedia}
                      disabled={addingMedia || !mediaUrl.trim()}
                      className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {addingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                      Agregar
                    </button>
                  </div>
                  )}

                  {/* Existing media grid (editing mode) */}
                  {editing && media.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {media.map((m) => (
                        <div key={m.id} className="group relative rounded-lg overflow-hidden border dark:border-gray-600 bg-gray-100 dark:bg-gray-700 aspect-square">
                          {m.kind === "youtube" || m.kind === "vimeo" ? (
                            <>
                              <img
                                src={m.thumbnailUrl ?? ""}
                                alt="Video thumbnail"
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="rounded-full bg-black/60 p-2">
                                  <Video className="h-5 w-5 text-white" />
                                </div>
                              </div>
                              <div className="absolute top-1 left-1">
                                <span className="rounded bg-purple-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                  {m.kind === "youtube" ? "YouTube" : "Vimeo"}
                                </span>
                              </div>
                            </>
                          ) : m.kind === "video" ? (
                            <div className="flex items-center justify-center h-full">
                              <Video className="h-8 w-8 text-gray-400" />
                            </div>
                          ) : (
                            <img
                              src={m.url}
                              alt="Property media"
                              className="w-full h-full object-cover"
                            />
                          )}
                          <button
                            onClick={() => handleRemoveMedia(m.id)}
                            className="absolute top-1 right-1 rounded-full bg-red-600/90 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pending media grid (create mode) */}
                  {!editing && pendingMedia.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {pendingMedia.map((m, i) => (
                        <div key={i} className="group relative rounded-lg overflow-hidden border dark:border-gray-600 bg-gray-100 dark:bg-gray-700 aspect-square">
                          {m.kind === "video" ? (
                            <div className="flex items-center justify-center h-full">
                              <Video className="h-8 w-8 text-gray-400" />
                            </div>
                          ) : (
                            <img src={m.url} alt="Preview" className="w-full h-full object-cover" />
                          )}
                          <button
                            onClick={() => handleRemovePending(i)}
                            className="absolute top-1 right-1 rounded-full bg-red-600/90 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty state */}
                  {((editing && media.length === 0) || (!editing && pendingMedia.length === 0)) && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
                      Sin imágenes ni videos. Subí archivos desde tu dispositivo{editing ? " o agregá URLs" : ""}.
                    </p>
                  )}
                </div>

              <div className="flex justify-end gap-2 pt-3 border-t dark:border-gray-700">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancelar</button>
                <button onClick={handleSave} disabled={saving || !form.title}
                  className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2">
                  {saving && <Spinner className="h-4 w-4" />} {editing ? "Guardar" : "Crear"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Instagram Preview Modal */}
      <AnimatePresence>
        {igPreview && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeIgPreview}
          >
            <motion.div
              className="bg-gray-950 rounded-2xl shadow-2xl w-full max-w-[520px] mx-4 overflow-hidden border border-white/10"
              initial={{ scale: 0.92, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 12 }}
              transition={{ type: "spring", damping: 22, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Instagram className="h-5 w-5 text-pink-500" />
                  <span className="font-semibold text-white text-sm">Imagen para Instagram</span>
                  <span className="text-xs text-white/40 ml-1">1080 × 1080</span>
                </div>
                <button onClick={closeIgPreview} className="text-white/40 hover:text-white/80 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Card preview — renders at 1080×1080, scaled to 480px for display */}
              <div className="px-4 pb-2">
                <motion.div
                  className="rounded-xl overflow-hidden shadow-2xl mx-auto"
                  style={{ width: 480, height: 480, position: "relative" }}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.4 }}
                >
                  {/* Scale 1080→480 (≈0.4444) */}
                  <div
                    style={{
                      transform: `scale(${480 / 1080})`,
                      transformOrigin: "top left",
                      width: 1080,
                      height: 1080,
                      position: "absolute",
                      top: 0,
                      left: 0,
                    }}
                  >
                    <InstagramPostCard ref={igCardRef} property={igPreview} />
                  </div>

                  {/* Reveal curtain that fades out */}
                  <motion.div
                    className="absolute inset-0 pointer-events-none rounded-xl"
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 0 }}
                    transition={{ delay: 0.5, duration: 0.6 }}
                    style={{ background: "rgba(0,0,0,0.5)" }}
                  />
                </motion.div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-5 py-4 border-t border-white/10">
                <p className="text-xs text-white/35">{igPreview.title}</p>
                <div className="flex gap-2">
                  <button
                    onClick={closeIgPreview}
                    className="px-4 py-2 text-sm text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  >
                    Cerrar
                  </button>
                  <button
                    onClick={handleIgDownload}
                    disabled={igLoading === "download"}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white rounded-lg font-medium transition-all disabled:opacity-60"
                  >
                    {igLoading === "download"
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Download className="h-4 w-4" />}
                    Descargar PNG
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reel Video Form Modal */}
      {reelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setReelTarget(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Film className="h-5 w-5 text-purple-600" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Generar video Reel</h3>
              </div>
              <button onClick={() => setReelTarget(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Video vertical 1080×1920 con las fotos de <strong className="text-gray-900 dark:text-white">{reelTarget.title}</strong>.
                Incluye narración en voz argentina, subtítulos y transiciones únicas por slide.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tu nombre</label>
                <input
                  value={reelForm.agentName} onChange={(e) => setReelForm((f) => ({ ...f, agentName: e.target.value }))}
                  placeholder="Ej: María García"
                  className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tu teléfono</label>
                <input
                  value={reelForm.agentPhone} onChange={(e) => setReelForm((f) => ({ ...f, agentPhone: e.target.value }))}
                  placeholder="Ej: +598 99 123 456"
                  className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Voz TTS (acento argentino)</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["female", "male"] as const).map((g) => (
                    <button
                      key={g}
                      onClick={() => setReelForm((f) => ({ ...f, voiceGender: g }))}
                      className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                        reelForm.voiceGender === g
                          ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                          : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500"
                      }`}
                    >
                      <span>{g === "female" ? "👩" : "👨"}</span>
                      {g === "female" ? "Mujer (Elena)" : "Hombre (Tomás)"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                  La narración se genera automáticamente desde la descripción de la propiedad.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t dark:border-gray-700">
              <button onClick={() => setReelTarget(null)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                Cancelar
              </button>
              <button
                onClick={handleStartReel}
                disabled={reelStarting || !reelForm.agentName.trim() || !reelForm.agentPhone.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50"
              >
                {reelStarting && <Loader2 className="h-4 w-4 animate-spin" />} Generar video
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
