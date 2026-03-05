"use client";

import { useAuth } from "@/lib/auth";
import { api, type Channel } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import {
  MessageSquare,
  Send,
  Wifi,
  WifiOff,
  QrCode,
  ExternalLink,
  Users,
  User as UserIcon,
} from "lucide-react";
import { ConnectionBadge, PageHeader, useToast } from "@/components/ui";

export default function ChannelsPage() {
  const { token, user } = useAuth();
  const toast = useToast();

  // My channels (current user)
  const [myChannels, setMyChannels] = useState<Channel[]>([]);
  // All channels across the tenant (admin view)
  const [allChannels, setAllChannels] = useState<Channel[]>([]);

  const [waQr, setWaQr] = useState<string | null>(null);
  const [waPairing, setWaPairing] = useState<string | null>(null);
  const [waLoading, setWaLoading] = useState(false);
  const [tgLink, setTgLink] = useState<string | null>(null);
  const [tgLoading, setTgLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  const loadChannels = useCallback(async () => {
    if (!token) return;
    const [mine, all] = await Promise.all([
      api.getMyChannels(token),
      api.getChannels(token),
    ]);
    setMyChannels(mine);
    setAllChannels(all);
  }, [token]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // Poll QR / status while connecting WA
  useEffect(() => {
    if (!polling || !token) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.getWhatsAppQr(token);
        if (res.status === "CONNECTED") {
          setPolling(false);
          setWaQr(null);
          setWaPairing(null);
          loadChannels();
          toast.success("WhatsApp conectado");
        } else if (res.qrCode) {
          setWaQr(res.qrCode);
          setWaPairing(res.pairingCode ?? null);
        }
      } catch {
        /* ignore */
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [polling, token, loadChannels]);

  const myWa = myChannels.find((c) => c.type === "WHATSAPP");
  const myTg = myChannels.find((c) => c.type === "TELEGRAM");

  const handleConnectWA = async () => {
    if (!token) return;
    setWaLoading(true);
    try {
      const res = await api.connectWhatsApp(token);
      setWaQr(res.qrCode);
      setWaPairing(res.pairingCode);
      setPolling(true);
      loadChannels();
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    } finally {
      setWaLoading(false);
    }
  };

  const handleDisconnectWA = async () => {
    if (!token) return;
    try {
      await api.disconnectWhatsApp(token);
      setWaQr(null);
      setPolling(false);
      loadChannels();
      toast.info("WhatsApp desconectado");
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    }
  };

  const handleConnectTG = async () => {
    if (!token) return;
    setTgLoading(true);
    try {
      const res = await api.connectTelegram(token);
      setTgLink(res.startLink);
      loadChannels();
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    } finally {
      setTgLoading(false);
    }
  };

  const refreshTGStatus = async () => {
    if (!token) return;
    const res = await api.getTelegramStatus(token);
    if (res.connected) {
      setTgLink(null);
      loadChannels();
      toast.success("Telegram conectado");
    } else {
      toast.info("Todavía no se detectó la conexión. Presioná /start en el bot.");
    }
  };

  const isAdmin = user?.role === "BUSINESS" || user?.role === "ADMIN";

  return (
    <div>
      <PageHeader
        title="Canales"
        description="Conectá tu WhatsApp y Telegram personales para atender leads"
      />

      {/* ─── My Channels ──────────────────────────── */}
      <div className="flex items-center gap-2 mb-4">
        <UserIcon className="w-5 h-5 text-brand-600" />
        <h2 className="font-semibold text-gray-900 dark:text-white">Mis conexiones</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* WhatsApp Card */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">WhatsApp</h3>
                <p className="text-xs text-gray-400">Escaneá el QR con tu celular</p>
              </div>
            </div>
            {myWa && <ConnectionBadge status={myWa.status} />}
          </div>

          {myWa?.status === "CONNECTED" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2.5">
                <Wifi className="w-4 h-4" />
                <span className="text-sm font-medium">WhatsApp conectado</span>
              </div>
              <p className="text-xs text-gray-400">
                Instancia: {myWa.providerInstanceId}
              </p>
              <button onClick={handleDisconnectWA} className="btn-danger w-full">
                <WifiOff className="w-4 h-4" /> Desconectar
              </button>
            </div>
          ) : waQr ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Escaneá este QR desde WhatsApp &gt; Dispositivos vinculados:
              </p>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 rounded-xl p-4 flex justify-center">
                <img
                  src={
                    waQr.startsWith("data:")
                      ? waQr
                      : `data:image/png;base64,${waQr}`
                  }
                  alt="QR Code"
                  className="w-48 h-48 rounded-lg"
                />
              </div>
              {waPairing && (
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-1">
                    O usá el código de vinculación:
                  </p>
                  <p className="font-mono text-xl font-bold tracking-[0.3em] text-gray-900 dark:text-white">
                    {waPairing}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-center gap-2 text-sm text-brand-600 animate-pulse-slow">
                <QrCode className="w-4 h-4" />
                Esperando conexión...
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {myWa?.lastError && (
                <p className="text-xs text-red-500 bg-red-50 p-3 rounded-lg">
                  {myWa.lastError}
                </p>
              )}
              <button
                onClick={handleConnectWA}
                disabled={waLoading}
                className="btn-primary w-full"
              >
                <QrCode className="w-4 h-4" />
                {waLoading ? "Generando QR..." : "Escanear QR de WhatsApp"}
              </button>
            </div>
          )}
        </div>

        {/* Telegram Card */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                <Send className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Telegram</h3>
                <p className="text-xs text-gray-400">
                  Vinculá tu cuenta con el bot
                </p>
              </div>
            </div>
            {myTg && <ConnectionBadge status={myTg.status} />}
          </div>

          {myTg?.status === "CONNECTED" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2.5">
                <Wifi className="w-4 h-4" />
                <span className="text-sm font-medium">Telegram conectado</span>
              </div>
              <p className="text-xs text-gray-400">
                Chat ID: {myTg.telegramChatId}
              </p>
            </div>
          ) : tgLink ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Abrí este enlace en Telegram y presioná <strong>Start</strong>:
              </p>
              <a
                href={tgLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-brand-600 hover:text-brand-700 text-sm font-medium bg-brand-50 p-3.5 rounded-xl break-all"
              >
                <ExternalLink className="w-4 h-4 shrink-0" />
                {tgLink}
              </a>
              <button onClick={refreshTGStatus} className="btn-secondary w-full">
                Verificar conexión
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectTG}
              disabled={tgLoading}
              className="btn-primary w-full"
            >
              <Send className="w-4 h-4" />
              {tgLoading ? "Generando enlace..." : "Conectar Telegram"}
            </button>
          )}
        </div>
      </div>

      {/* ─── Team Channels (admin view) ────────────── */}
      {isAdmin && allChannels.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <h2 className="font-semibold text-gray-900 dark:text-white">
              Canales del equipo
            </h2>
            <span className="badge bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 ml-1">
              {allChannels.length}
            </span>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  <th className="table-header">Agente</th>
                  <th className="table-header">Canal</th>
                  <th className="table-header">Estado</th>
                  <th className="table-header hidden sm:table-cell">
                    Provider ID
                  </th>
                  <th className="table-header hidden sm:table-cell">
                    Conectado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {allChannels.map((ch) => (
                  <tr
                    key={ch.id}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                      ch.userId === user?.id ? "bg-brand-50/30" : ""
                    }`}
                  >
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600 dark:text-gray-400">
                          {(ch.user?.name ?? ch.user?.email ?? "?")
                            .split(" ")
                            .map((w: string) => w[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white truncate text-sm">
                            {ch.user?.name ?? ch.user?.email ?? "—"}
                          </p>
                          {ch.user?.name && (
                            <p className="text-xs text-gray-400 truncate">
                              {ch.user.email}
                            </p>
                          )}
                        </div>
                        {ch.userId === user?.id && (
                          <span className="badge bg-brand-50 text-brand-700 text-[10px] ml-1">
                            Yo
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="table-cell">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                          ch.type === "WHATSAPP"
                            ? "text-emerald-700"
                            : ch.type === "TELEGRAM"
                              ? "text-blue-700"
                              : "text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {ch.type === "WHATSAPP" ? (
                          <MessageSquare className="w-3.5 h-3.5" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        {ch.type}
                      </span>
                    </td>
                    <td className="table-cell">
                      <ConnectionBadge status={ch.status} />
                    </td>
                    <td className="table-cell hidden sm:table-cell text-gray-400 text-xs font-mono">
                      {ch.providerInstanceId ?? ch.telegramChatId ?? "—"}
                    </td>
                    <td className="table-cell hidden sm:table-cell text-gray-400 text-xs">
                      {new Date(ch.createdAt).toLocaleDateString("es")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
