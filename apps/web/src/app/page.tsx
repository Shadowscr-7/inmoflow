"use client";

import {
  ArrowRight,
  Zap,
  MessageSquare,
  BarChart3,
  Bot,
  Users,
  Check,
  X,
  Clock,
  Rocket,
  TrendingUp,
  Calendar,
  Inbox,
  Target,
  ChevronRight,
  Star,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

/* --- Countdown timer ------------------------------------------ */
const OFFER_DEADLINE = new Date("2026-06-25T23:59:59");

function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, mins: 0, secs: 0 });
  useEffect(() => {
    function calc() {
      const diff = OFFER_DEADLINE.getTime() - Date.now();
      if (diff <= 0) return { days: 0, hours: 0, mins: 0, secs: 0 };
      return {
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        mins: Math.floor((diff % 3600000) / 60000),
        secs: Math.floor((diff % 60000) / 1000),
      };
    }
    setTimeLeft(calc());
    const t = setInterval(() => setTimeLeft(calc()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="flex items-center justify-center gap-2">
      <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
      <span className="text-xs text-emerald-300 font-medium">Oferta termina en:</span>
      <div className="flex items-center gap-1 font-mono text-xs font-bold">
        {[{ v: timeLeft.days, l: "d" }, { v: timeLeft.hours, l: "h" }, { v: timeLeft.mins, l: "m" }, { v: timeLeft.secs, l: "s" }].map(({ v, l }) => (
          <span key={l} className="bg-emerald-900/60 text-emerald-200 px-1.5 py-0.5 rounded">
            {pad(v)}{l}
          </span>
        ))}
      </div>
    </div>
  );
}

/* --- Sticky WhatsApp button ----------------------------------- */
function WhatsAppButton() {
  return (
    <a
      href="https://wa.me/5491100000000?text=Hola%2C%20quiero%20saber%20m%C3%A1s%20sobre%20InmoFlow"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm shadow-2xl shadow-emerald-500/40 transition-all duration-300 hover:-translate-y-0.5"
    >
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.556 4.123 1.528 5.855L.057 23.882a.5.5 0 00.61.61l6.085-1.465A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.907 0-3.693-.497-5.24-1.366l-.374-.214-3.863.931.956-3.789-.234-.389A9.946 9.946 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
      </svg>
      Hablar por WhatsApp
    </a>
  );
}

/* --- Main page ------------------------------------------------- */
export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <main className="relative bg-[#060d1a] text-white overflow-x-clip">
      <WhatsAppButton />

      {/* --- Navbar -------------------------------------------- */}
      <nav className="sticky top-0 z-40 flex items-center justify-between px-6 sm:px-12 py-4 bg-[#060d1a]/90 backdrop-blur-md border-b border-white/[0.05]">
        <div className="flex items-center gap-3">
          <Image src="/images/logo.png" alt="InmoFlow" width={36} height={36} className="drop-shadow-lg" />
          <span className="text-xl font-bold tracking-tight">
            Inmo<span className="text-emerald-400">Flow</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden sm:block text-sm text-gray-400 hover:text-white transition-colors px-4 py-2">
            Iniciar sesión
          </Link>
          <a
            href="#pricing"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all duration-200"
          >
            Prueba gratis
          </a>
        </div>
      </nav>

      {/* --- HERO -------------------------------------------- */}
      <section className="relative flex flex-col items-center text-center px-6 pt-20 pb-24 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-8 text-sm font-medium text-emerald-300"
          style={{ animation: mounted ? "fadeIn 0.5s ease-out" : "none" }}
        >
          <Rocket className="w-4 h-4" />
          Sistema de gestión para inmobiliarias
        </div>
        <h1
          className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-tight max-w-4xl mb-6"
          style={{ animation: mounted ? "fadeIn 0.6s ease-out 0.1s both" : "none" }}
        >
          El sistema que convierte tus{" "}
          <span className="bg-gradient-to-r from-emerald-400 via-emerald-300 to-cyan-400 bg-clip-text text-transparent">
            consultas en operaciones cerradas
          </span>{" "}
          automáticamente.
        </h1>
        <p
          className="text-lg sm:text-xl text-gray-400 max-w-2xl leading-relaxed mb-10"
          style={{ animation: mounted ? "fadeIn 0.6s ease-out 0.2s both" : "none" }}
        >
          Respondé en segundos, automatizá el seguimiento y cerrá más propiedades
          sin depender del trabajo manual.
        </p>
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-xl w-full mb-10"
          style={{ animation: mounted ? "fadeIn 0.6s ease-out 0.3s both" : "none" }}
        >
          {[
            "Nunca más perdás un lead por no responder a tiempo",
            "Seguimiento automático que convierte interesados en clientes",
            "Todos tus canales en un solo lugar",
            "IA que responde como si fueras vos",
          ].map((b) => (
            <div key={b} className="flex items-start gap-3">
              <div className="mt-0.5 w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 text-emerald-400" />
              </div>
              <span className="text-sm text-gray-300">{b}</span>
            </div>
          ))}
        </div>
        <div
          className="flex flex-col sm:flex-row gap-4 mb-5"
          style={{ animation: mounted ? "fadeIn 0.6s ease-out 0.4s both" : "none" }}
        >
          <a
            href="#pricing"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:from-emerald-500 hover:to-emerald-400 shadow-xl shadow-emerald-600/30 transition-all duration-300 hover:-translate-y-0.5"
          >
            <Rocket className="w-5 h-5" />
            Empezar prueba gratis 15 días
          </a>
          <a
            href="https://wa.me/5491100000000?text=Hola%2C%20quiero%20agendar%20una%20demo%20de%20InmoFlow"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-semibold text-gray-300 bg-white/[0.05] border border-white/[0.1] hover:bg-white/[0.1] hover:text-white transition-all duration-300"
          >
            Agendar demo
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
        <p className="text-sm text-gray-600">Sin tarjeta. Configuración guiada. Resultados desde el día 1.</p>
      </section>

      {/* --- PROBLEMA ---------------------------------------- */}
      <section className="px-6 sm:px-12 py-20 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-bold text-red-400 uppercase tracking-widest mb-3">El problema</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold mb-4">Hoy tu inmobiliaria funciona así ❌</h2>
          <p className="text-gray-400 text-lg">Y cada lead perdido = dinero perdido.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { emoji: "??", text: "Leads perdidos de Meta Ads que nadie responde a tiempo" },
            { emoji: "??", text: "WhatsApp desordenado con conversaciones mezcladas" },
            { emoji: "??", text: "Seguimiento manual que nunca se hace bien" },
            { emoji: "??", text: "Clientes que 'quedan en veremos' y nunca cierran" },
            { emoji: "⏳", text: "Oportunidades que se enfrían mientras estás ocupado" },
            { emoji: "💸", text: "Invertís en publicidad y no convertís lo suficiente" },
          ].map(({ emoji, text }) => (
            <div key={text} className="flex items-start gap-4 p-5 rounded-xl bg-red-950/20 border border-red-500/10">
              <span className="text-2xl shrink-0">{emoji}</span>
              <p className="text-sm text-gray-400 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 p-6 rounded-2xl bg-gradient-to-r from-red-950/40 to-orange-950/20 border border-red-500/15 text-center">
          <p className="text-xl font-bold text-white">Estás generando leads… pero no estás convirtiendo lo suficiente.</p>
        </div>
      </section>

      {/* --- TRANSFORMACIÓN ---------------------------------- */}
      <section className="px-6 sm:px-12 py-20 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3">La solución</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold mb-4">Con InmoFlow ?</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
          {[
            { icon: Inbox, label: "Cada lead entra automáticamente al sistema" },
            { icon: Zap, label: "Se responde en segundos, sin intervención manual" },
            { icon: MessageSquare, label: "Se sigue de forma automática sin que lo pienses" },
            { icon: Calendar, label: "Se agenda la visita sin fricción" },
            { icon: Target, label: "Se empuja hasta el cierre" },
          ].map(({ icon: Icon, label }, i) => (
            <div key={label} className="relative flex flex-col items-center text-center p-5 rounded-xl bg-emerald-950/20 border border-emerald-500/15 gap-3">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">
                {i + 1}
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 flex items-center justify-center mt-2">
                <Icon className="w-5 h-5 text-emerald-400" />
              </div>
              <p className="text-sm text-gray-300 leading-snug">{label}</p>
            </div>
          ))}
        </div>
        <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-cyan-950/20 border border-emerald-500/15 text-center">
          <p className="text-2xl font-extrabold text-white">
            Pasás de{" "}
            <span className="text-red-400 line-through opacity-70">gestionar consultas</span>{" "}
            a{" "}
            <span className="text-emerald-400">cerrar operaciones</span>
          </p>
        </div>
      </section>

      {/* --- ANTES VS DESPUÉS -------------------------------- */}
      <section className="px-6 sm:px-12 py-20">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold">Antes vs. Después</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-6 rounded-2xl bg-red-950/20 border border-red-500/15">
              <p className="text-sm font-bold text-red-400 uppercase tracking-wider mb-5">? Antes</p>
              <ul className="space-y-3">
                {["Excel y papeles", "WhatsApp personal mezclado", "Leads sin seguimiento", "Ventas inconsistentes", "Trabajo manual constante"].map((t) => (
                  <li key={t} className="flex items-center gap-3 text-sm text-gray-400">
                    <X className="w-4 h-4 text-red-500 shrink-0" />{t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-6 rounded-2xl bg-emerald-950/20 border border-emerald-500/15">
              <p className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-5">✅ Después</p>
              <ul className="space-y-3">
                {["Inbox unificado y ordenado", "IA respondiendo 24/7", "Pipeline automatizado", "Ventas predecibles", "El sistema trabaja por vos"].map((t) => (
                  <li key={t} className="flex items-center gap-3 text-sm text-gray-300">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />{t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* --- CÓMO FUNCIONA ----------------------------------- */}
      <section className="px-6 sm:px-12 py-20 max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3">Proceso</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold">Cómo funciona</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { num: "01", color: "text-blue-400", bg: "bg-blue-600/15 border-blue-500/15", icon: Inbox, title: "Captura automática", desc: "Meta Ads, WhatsApp, Telegram, Web, MercadoLibre. Todo entra solo.", tag: "Sin perder nada" },
            { num: "02", color: "text-emerald-400", bg: "bg-emerald-600/15 border-emerald-500/15", icon: Bot, title: "Respuesta inmediata", desc: "IA responde en segundos como si fueras vos. Primer contacto = clave de conversión.", tag: "En segundos" },
            { num: "03", color: "text-amber-400", bg: "bg-amber-600/15 border-amber-500/15", icon: MessageSquare, title: "Seguimiento automático", desc: "Mensajes, recordatorios, reactivación. Nunca más se enfría un cliente.", tag: "Sin esfuerzo" },
            { num: "04", color: "text-purple-400", bg: "bg-purple-600/15 border-purple-500/15", icon: Target, title: "Cierre", desc: "Agenda, visitas, pipeline y métricas. Más operaciones, menos esfuerzo.", tag: "Más cierres" },
          ].map(({ num, color, bg, icon: Icon, title, desc, tag }) => (
            <div key={num} className={`relative p-6 rounded-2xl border ${bg} flex flex-col gap-4`}>
              <div className="flex items-center justify-between">
                <span className={`text-3xl font-extrabold ${color} opacity-40`}>{num}</span>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5">
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
              </div>
              <div>
                <h3 className="font-bold text-white mb-1">{title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
              </div>
              <div className={`mt-auto pt-3 border-t border-white/[0.06] text-xs font-bold ${color}`}>
                ?? {tag}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* --- IA ---------------------------------------------- */}
      <section className="px-6 sm:px-12 py-20">
        <div className="max-w-4xl mx-auto rounded-3xl bg-gradient-to-br from-blue-950/60 via-purple-950/40 to-[#060d1a] border border-blue-500/20 p-10 sm:p-14 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/8 rounded-full blur-[80px] pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 mb-6">
              <Bot className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-bold text-blue-300">Inteligencia Artificial integrada</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold mb-4">
              Tu asistente comercial <span className="text-blue-400">24/7</span>
            </h2>
            <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
              Mientras vos trabajás… o dormís… el sistema sigue vendiendo por vos.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto">
              {[
                { icon: MessageSquare, label: "Responde consultas automáticamente" },
                { icon: Target, label: "Califica leads en tiempo real" },
                { icon: Users, label: "Mantiene conversación real" },
                { icon: Calendar, label: "Agenda visitas solo" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="p-4 rounded-xl bg-blue-950/40 border border-blue-500/10 flex flex-col items-center gap-2">
                  <Icon className="w-5 h-5 text-blue-400" />
                  <p className="text-xs text-gray-400 text-center">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* --- RESULTADOS -------------------------------------- */}
      <section className="px-6 sm:px-12 py-20 max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3">Resultados</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold mb-4">Lo que cambia cuando implementás InmoFlow</h2>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            No necesitás más leads. Necesitás{" "}
            <span className="text-white font-semibold">convertir mejor los que ya tenés.</span>
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { icon: Zap, metric: "10x", label: "Velocidad de respuesta", bg: "bg-emerald-600/15 border-emerald-500/15", color: "text-emerald-400" },
            { icon: TrendingUp, metric: "+40%", label: "Tasa de conversión", bg: "bg-blue-600/15 border-blue-500/15", color: "text-blue-400" },
            { icon: Calendar, metric: "+60%", label: "Visitas agendadas", bg: "bg-amber-600/15 border-amber-500/15", color: "text-amber-400" },
            { icon: Target, metric: "+35%", label: "Cierres de operaciones", bg: "bg-purple-600/15 border-purple-500/15", color: "text-purple-400" },
          ].map(({ icon: Icon, metric, label, bg, color }) => (
            <div key={label} className={`p-6 rounded-2xl border ${bg} text-center`}>
              <Icon className={`w-6 h-6 mx-auto mb-3 ${color}`} />
              <p className={`text-4xl font-extrabold mb-1 ${color}`}>{metric}</p>
              <p className="text-sm text-gray-400">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --- ROI --------------------------------------------- */}
      <section className="px-6 sm:px-12 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <div className="p-10 rounded-3xl bg-gradient-to-br from-emerald-950/50 to-[#060d1a] border border-emerald-500/20">
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-4">ROI garantizado</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold mb-8">Hagamos números simples</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
              {[
                { label: "Comisión promedio", value: "USD 2.000" },
                { label: "Costo del sistema", value: "USD 750/mes" },
                { label: "1 venta extra al mes", value: "= paga el sistema" },
              ].map(({ label, value }) => (
                <div key={label} className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/10">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="text-xl font-extrabold text-white">{value}</p>
                </div>
              ))}
            </div>
            <p className="text-xl font-bold text-gray-200">
              Si InmoFlow te ayuda a cerrar{" "}
              <span className="text-emerald-400">una sola operación más</span>… ya se pagó solo.
            </p>
            <p className="text-sm text-gray-500 mt-3">Todo lo demás es ganancia pura.</p>
          </div>
        </div>
      </section>

      {/* --- FEATURES ---------------------------------------- */}
      <section className="px-6 sm:px-12 py-20 max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold">Todo lo que incluye</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: Inbox, title: "Inbox unificado", desc: "Todos tus clientes en un solo lugar. WhatsApp, Meta, Telegram y email.", bg: "bg-emerald-600/15 border-emerald-500/15", color: "text-emerald-400" },
            { icon: Zap, title: "Automatizaciones", desc: "El sistema trabaja por vos. Reglas que responden, asignan y mueven leads.", bg: "bg-amber-600/15 border-amber-500/15", color: "text-amber-400" },
            { icon: BarChart3, title: "Pipeline visual", desc: "Control total de cada oportunidad. Kanban drag-and-drop personalizable.", bg: "bg-blue-600/15 border-blue-500/15", color: "text-blue-400" },
            { icon: Bot, title: "Agente IA", desc: "Respuestas automáticas que convierten. ChatGPT, Gemini, Claude integrado.", bg: "bg-purple-600/15 border-purple-500/15", color: "text-purple-400" },
            { icon: MessageSquare, title: "Multicanal", desc: "WhatsApp, Meta Ads, Telegram, Email, MercadoLibre. Todo en un lugar.", bg: "bg-cyan-600/15 border-cyan-500/15", color: "text-cyan-400" },
            { icon: TrendingUp, title: "Métricas en tiempo real", desc: "Sabés qué funciona y qué no. Dashboard con reportes de comisiones.", bg: "bg-rose-600/15 border-rose-500/15", color: "text-rose-400" },
          ].map(({ icon: Icon, title, desc, bg, color }) => (
            <div key={title} className={`p-6 rounded-2xl border ${bg} hover:-translate-y-1 transition-all duration-300`}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 bg-white/5">
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <h3 className="font-bold text-white mb-2">{title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --- PARA QUIÉN ES ----------------------------------- */}
      <section className="px-6 sm:px-12 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold">¿Es para vos?</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="p-8 rounded-2xl bg-emerald-950/20 border border-emerald-500/15">
              <p className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                <Check className="w-4 h-4" /> InmoFlow es para vos si…
              </p>
              <ul className="space-y-4">
                {[
                  "Generás leads pero no convertís lo suficiente",
                  "Tenés más de un canal de contacto",
                  "Perdés oportunidades por falta de seguimiento",
                  "Querés escalar sin contratar más gente",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm text-gray-300">
                    <ChevronRight className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />{t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-8 rounded-2xl bg-red-950/15 border border-red-500/10">
              <p className="text-sm font-bold text-red-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                <X className="w-4 h-4" /> NO es para vos si…
              </p>
              <ul className="space-y-4">
                {[
                  "No generás leads de ningún canal",
                  "No querés automatizar nada",
                  "Preferís seguir todo de forma manual",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm text-gray-500">
                    <X className="w-4 h-4 text-red-500/60 mt-0.5 shrink-0" />{t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* --- PRICING ----------------------------------------- */}
      <section id="pricing" className="px-6 sm:px-12 py-20 scroll-mt-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3">Planes</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold mb-4">Simple y sin sorpresas</h2>
            <p className="text-gray-400 text-lg">Todo incluido. Sin contratos. Cancelás cuando querés.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Plan Prueba Gratis */}
            <div className="relative rounded-2xl border-2 border-emerald-500/50 bg-emerald-950/15 p-8 flex flex-col shadow-[0_0_60px_-12px_rgba(16,185,129,0.2)]">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <div className="px-4 py-1.5 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 flex items-center gap-1.5">
                  <Rocket className="w-3.5 h-3.5" />
                  ?? Oferta de lanzamiento
                </div>
              </div>
              <div className="mt-3 mb-4">
                <h3 className="text-xl font-bold text-white mb-1">Prueba gratis 15 días</h3>
                <p className="text-sm text-emerald-300/70">Empezá sin pagar nada. Luego $750/mes.</p>
              </div>
              <div className="mb-4">
                <div className="flex items-end gap-2">
                  <span className="text-6xl font-extrabold text-white">$0</span>
                  <div className="pb-2">
                    <p className="text-xs text-emerald-400 font-semibold">por 15 días</p>
                    <p className="text-sm text-gray-400">luego <span className="text-white font-bold">$750</span> <span className="text-gray-500">USD/mes</span></p>
                  </div>
                </div>
              </div>
              <div className="mb-6 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/20">
                <p className="text-xs text-center text-emerald-400/70 mb-2">Esta oferta está disponible por tiempo limitado</p>
                <CountdownTimer />
              </div>
              <ul className="space-y-2.5 mb-8 flex-1">
                {[
                  "Todos los canales (WhatsApp, Meta, Telegram, Email)",
                  "Automatizaciones ilimitadas",
                  "Agente IA (ChatGPT, Gemini, Claude)",
                  "Pipeline visual completo",
                  "Dashboard avanzado con métricas",
                  "Roles y permisos (Admin, Agente, Viewer)",
                  "Soporte prioritario por WhatsApp",
                  "Sin tarjeta requerida para la prueba",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-gray-200">
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />{f}
                  </li>
                ))}
              </ul>
              <a
                href="https://wa.me/5491100000000?text=Hola%2C%20quiero%20empezar%20la%20prueba%20gratuita%20de%2015%20d%C3%ADas%20de%20InmoFlow"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center px-6 py-4 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:from-emerald-500 hover:to-emerald-400 shadow-lg shadow-emerald-600/25 hover:shadow-emerald-500/40 transition-all duration-300 hover:-translate-y-0.5"
              >
                Empezar prueba gratis ?
              </a>
            </div>

            {/* Plan Profesional */}
            <div className="relative rounded-2xl border border-white/[0.1] bg-white/[0.03] p-8 flex flex-col hover:border-white/[0.18] transition-all duration-300">
              <div className="mb-4">
                <h3 className="text-xl font-bold text-white mb-1">Plan Profesional</h3>
                <p className="text-sm text-gray-400">Acceso inmediato. Sin período de prueba.</p>
              </div>
              <div className="mb-8">
                <div className="flex items-end gap-2">
                  <span className="text-6xl font-extrabold text-white">$750</span>
                  <div className="pb-2">
                    <span className="text-gray-400">USD<span className="text-gray-500">/mes</span></span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">Sin contratos · Cancelás cuando querés</p>
              </div>
              <ul className="space-y-2.5 mb-8 flex-1">
                {[
                  "Todos los canales (WhatsApp, Meta, Telegram, Email)",
                  "Automatizaciones ilimitadas",
                  "Agente IA (ChatGPT, Gemini, Claude)",
                  "Pipeline visual completo",
                  "Dashboard avanzado con métricas",
                  "Roles y permisos (Admin, Agente, Viewer)",
                  "Soporte prioritario por WhatsApp",
                  "Acceso desde el primer día",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-gray-300">
                    <Check className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />{f}
                  </li>
                ))}
              </ul>
              <a
                href="https://wa.me/5491100000000?text=Hola%2C%20quiero%20contratar%20el%20plan%20Profesional%20de%20InmoFlow"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center px-6 py-4 rounded-xl text-sm font-bold bg-white/[0.08] text-white border border-white/[0.12] hover:bg-white/[0.14] hover:border-white/[0.2] transition-all duration-300"
              >
                Contratar ahora ?
              </a>
            </div>
          </div>
          <p className="text-center text-xs text-gray-600 mt-8">
            Todos los planes incluyen actualizaciones. Sin contratos. Podés cancelar en cualquier momento.
          </p>
        </div>
      </section>

      {/* --- CTA FINAL --------------------------------------- */}
      <section className="px-6 sm:px-12 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <div className="p-10 sm:p-14 rounded-3xl bg-gradient-to-br from-[#0f1f12] via-emerald-950/20 to-[#060d1a] border border-emerald-500/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 mb-6">
                <Star className="w-4 h-4 text-red-400" />
                <span className="text-sm font-bold text-red-300">Oferta limitada</span>
              </div>
              <h2 className="text-3xl sm:text-5xl font-extrabold mb-4">No pierdas más oportunidades</h2>
              <p className="text-xl text-gray-300 mb-2">Cada lead que no respondés a tiempo…</p>
              <p className="text-2xl font-bold text-red-400 mb-8">lo pierde tu competencia.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a
                  href="https://wa.me/5491100000000?text=Hola%2C%20quiero%20empezar%20la%20prueba%20gratuita%20de%20InmoFlow"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:from-emerald-500 hover:to-emerald-400 shadow-xl shadow-emerald-600/30 transition-all duration-300 hover:-translate-y-0.5"
                >
                  <Rocket className="w-5 h-5" />
                  Empezar prueba gratis
                </a>
                <a
                  href="https://wa.me/5491100000000?text=Hola%2C%20quiero%20agendar%20una%20demo%20personalizada%20de%20InmoFlow"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-semibold text-gray-300 bg-white/[0.05] border border-white/[0.1] hover:bg-white/[0.1] hover:text-white transition-all duration-300"
                >
                  Agendar demo personalizada
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
              <p className="text-sm text-gray-600 mt-6">Sin tarjeta. Sin burocracia. Configuración en minutos.</p>
            </div>
          </div>
        </div>
      </section>

      {/* --- FOOTER ------------------------------------------ */}
      <footer className="border-t border-white/[0.05] py-10 px-6 bg-[#060d1a]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/images/logo.png" alt="InmoFlow" width={28} height={28} className="opacity-60" />
            <span className="text-sm text-gray-600">
              © {new Date().getFullYear()} InmoFlow — El sistema que convierte leads en ventas.
            </span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/login" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
              Iniciar sesión
            </Link>
            <a
              href="https://wa.me/5491100000000"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Contacto
            </a>
          </div>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  );
}
