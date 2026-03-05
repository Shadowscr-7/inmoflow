"use client";

import { useAuth } from "@/lib/auth";
import { api, type Message, type Lead } from "@/lib/api";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Send, MessageSquare, Smile } from "lucide-react";
import { ChannelBadge, useToast } from "@/components/ui";

export default function ConversationPage() {
  const { token } = useAuth();
  const toast = useToast();
  const params = useParams();
  const leadId = params.id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [channel, setChannel] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadLead = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getLead(token, leadId);
      setLead(data);
      if (!channel && data.primaryChannel) {
        setChannel(data.primaryChannel);
      }
    } catch { /* */ }
  }, [token, leadId, channel]);

  const loadMessages = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.getMessages(token, leadId, { limit: "200" });
      setMessages(res.data);
    } catch { /* */ }
  }, [token, leadId]);

  // Sync messages from Evolution API then load
  const syncAndLoad = useCallback(async () => {
    if (!token) return;
    try {
      await api.syncMessages(token, leadId);
    } catch { /* sync failure is non-blocking */ }
    await loadMessages();
  }, [token, leadId, loadMessages]);

  // Initial load: sync from provider first, then load
  useEffect(() => { loadLead(); syncAndLoad(); }, [loadLead, syncAndLoad]);

  // Poll every 5s — sync + load each time
  useEffect(() => {
    const interval = setInterval(syncAndLoad, 5000);
    return () => clearInterval(interval);
  }, [syncAndLoad]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newMsg.trim() || !channel) return;
    setSending(true);
    try {
      await api.sendMessage(token, leadId, {
        content: newMsg.trim(),
        channel,
      });
      setNewMsg("");
      loadMessages();
    } catch (err) {
      toast.error(`Error al enviar: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-gray-700">
        <Link href={`/dashboard/leads/${leadId}`} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-lg text-gray-900 dark:text-white">{lead?.name ?? "Conversación"}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-400">{lead?.phone ?? lead?.email ?? leadId.slice(0, 8)}</span>
            {lead?.primaryChannel && <ChannelBadge channel={lead.primaryChannel} />}
          </div>
        </div>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="input w-auto text-sm"
        >
          <option value="">Canal</option>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="TELEGRAM">Telegram</option>
        </select>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300">
            <MessageSquare className="w-12 h-12 mb-3" />
            <p className="text-sm">Sin mensajes aún</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.direction === "OUT" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                  msg.direction === "OUT"
                    ? "bg-brand-600 text-white rounded-br-md"
                    : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-bl-md shadow-sm"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                <div
                  className={`flex items-center gap-2 mt-1.5 text-xs ${
                    msg.direction === "OUT" ? "text-brand-200" : "text-gray-400"
                  }`}
                >
                  <span>{msg.channel}</span>
                  <span>·</span>
                  <span>{new Date(msg.createdAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</span>
                  {msg.direction === "OUT" && msg.status && (
                    <span>{msg.status === "sent" ? "✓" : msg.status}</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Send box */}
      <form onSubmit={handleSend} className="border-t border-gray-200 dark:border-gray-700 pt-3 flex gap-3">
        <input
          type="text"
          value={newMsg}
          onChange={(e) => setNewMsg(e.target.value)}
          placeholder={channel ? `Escribir mensaje por ${channel}...` : "Seleccioná un canal"}
          disabled={!channel}
          className="input flex-1"
        />
        <button
          type="submit"
          disabled={sending || !channel || !newMsg.trim()}
          className="btn-primary px-5"
        >
          {sending ? <Smile className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
