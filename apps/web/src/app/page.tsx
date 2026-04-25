"use client";

import {
  ArrowRight,
  Zap,
  MessageSquare,
  Shield,
  BarChart3,
  Bot,
  Users,
  Sparkles,
  ChevronDown,
  Check,
  Star,
  Clock,
  Rocket,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

/* ─── Countdown timer ──────────────────────────────── */
// Offer expires June 25, 2026
const OFFER_DEADLINE = new Date("2026-06-25T23:59:59");

function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, mins: 0, secs: 0 });
  useEffect(() => {
    function calc() {
      const diff = OFFER_DEADLINE.getTime() - Date.now();
      if (diff <= 0) return { days: 0, hours: 0, mins: 0, secs: 0 };
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      return { days, hours, mins, secs };
    }
    setTimeLeft(calc());
    const t = setInterval(() => setTimeLeft(calc()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="flex items-center justify-center gap-2 mt-3">
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

/* ─── Animated counter ─────────────────────────────── */
function AnimatedNumber({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [target]);
  return <>{count.toLocaleString()}{suffix}</>;
}

/* ─── Floating particles background ──────────────── */
function Particles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white/5"
          style={{
            width: `${Math.random() * 4 + 2}px`,
            height: `${Math.random() * 4 + 2}px`,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animation: `float ${Math.random() * 10 + 15}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 5}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Feature card ────────────────────────────────── */
function FeatureCard({
  icon: Icon,
  title,
  description,
  color,
  delay,
}: {
  icon: typeof Zap;
  title: string;
  description: string;
  color: string;
  delay: string;
}) {
  return (
    <div
      className="group relative p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm
                 hover:bg-white/[0.07] hover:border-white/[0.12] transition-all duration-500 hover:-translate-y-1"
      style={{ animation: `slideUp 0.6s ease-out ${delay} both` }}
    >
      <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center mb-4
                       group-hover:scale-110 transition-transform duration-300`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
    </div>
  );
}

/* ─── Main page ───────────────────────────────────── */
export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <main className="relative min-h-screen bg-[#0a1628] overflow-x-clip">
      {/* Background effects */}
      <div className="absolute inset-0">
        {/* Gradient orbs */}
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-brand-600/10 blur-[120px] animate-pulse-slow" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-600/8 blur-[100px] animate-pulse-slow"
             style={{ animationDelay: "1.5s" }} />
        <div className="absolute top-[40%] left-[50%] w-[400px] h-[400px] rounded-full bg-purple-600/5 blur-[80px] animate-pulse-slow"
             style={{ animationDelay: "3s" }} />
        <Particles />
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <div className="relative z-10">
        {/* ─── Navbar ──────────────────────────── */}
        <nav className="flex items-center justify-between px-6 sm:px-12 py-5"
             style={{ animation: "fadeIn 0.8s ease-out" }}>
          <div className="flex items-center gap-3">
            <Image src="/images/logo.png" alt="InmoFlow" width={40} height={40} className="drop-shadow-lg" />
            <span className="text-xl font-bold text-white tracking-tight">
              Inmo<span className="text-brand-400">Flow</span>
            </span>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold
                       bg-white/[0.08] text-white border border-white/[0.1]
                       hover:bg-white/[0.14] transition-all duration-300"
          >
            Iniciar sesión
            <ArrowRight className="w-4 h-4" />
          </Link>
        </nav>

        {/* ─── Hero section ────────────────────── */}
        <section className="flex flex-col items-center text-center px-6 pt-16 sm:pt-24 pb-20">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-500/10 border border-brand-500/20 mb-8"
            style={{ animation: mounted ? "slideUp 0.5s ease-out 0.1s both" : "none" }}
          >
            <Sparkles className="w-4 h-4 text-brand-400" />
            <span className="text-sm font-medium text-brand-300">
              Plataforma CRM todo-en-uno
            </span>
          </div>

          {/* Logo */}
          <div style={{ animation: mounted ? "slideUp 0.6s ease-out 0.2s both" : "none" }}>
            <Image
              src="/images/logo.png"
              alt="InmoFlow"
              width={120}
              height={120}
              className="mx-auto drop-shadow-2xl mb-6"
              priority
            />
          </div>

          {/* Title */}
          <h1
            className="text-5xl sm:text-7xl font-extrabold tracking-tight text-white mb-4"
            style={{ animation: mounted ? "slideUp 0.6s ease-out 0.3s both" : "none" }}
          >
            INMO<span className="bg-gradient-to-r from-brand-400 via-brand-300 to-cyan-400 bg-clip-text text-transparent">FLOW</span>
          </h1>

          {/* Subtitle */}
          <p
            className="text-lg sm:text-xl text-gray-400 max-w-2xl leading-relaxed mb-4"
            style={{ animation: mounted ? "slideUp 0.6s ease-out 0.4s both" : "none" }}
          >
            La plataforma CRM inteligente para inmobiliarias modernas.
            <br className="hidden sm:block" />
            Automatizá, conectá y cerrá más operaciones.
          </p>

          {/* Stats row */}
          <div
            className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 mt-8 mb-12"
            style={{ animation: mounted ? "slideUp 0.6s ease-out 0.5s both" : "none" }}
          >
            {[
              { value: 100, suffix: "%", label: "Multi-tenant" },
              { value: 6, suffix: "+", label: "Canales" },
              { value: 6, suffix: "", label: "Proveedores IA" },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <p className="text-3xl sm:text-4xl font-bold text-white">
                  {mounted && <AnimatedNumber target={stat.value} suffix={stat.suffix} />}
                </p>
                <p className="text-xs sm:text-sm text-gray-500 mt-1 uppercase tracking-wider">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* CTA buttons */}
          <div
            className="flex flex-col sm:flex-row gap-4"
            style={{ animation: mounted ? "slideUp 0.6s ease-out 0.6s both" : "none" }}
          >
            <a
              href="#pricing"
              className="group inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl text-base font-bold
                         bg-gradient-to-r from-brand-600 to-brand-500 text-white
                         hover:from-brand-500 hover:to-brand-400 shadow-lg shadow-brand-600/25
                         hover:shadow-brand-500/40 transition-all duration-300 hover:-translate-y-0.5"
            >
              Ver planes y precios
              <ChevronDown className="w-5 h-5 group-hover:translate-y-1 transition-transform" />
            </a>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-semibold
                         text-gray-300 bg-white/[0.05] border border-white/[0.1]
                         hover:bg-white/[0.1] hover:text-white transition-all duration-300"
            >
              Ya tengo cuenta
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>

        {/* ─── Features grid ──────────────────── */}
        <section className="px-6 sm:px-12 pb-24 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard
              icon={MessageSquare}
              title="Multi-canal"
              description="WhatsApp, Telegram, Email, Facebook Leads y más. Todos tus canales en un solo lugar."
              color="bg-emerald-600/80"
              delay="0.7s"
            />
            <FeatureCard
              icon={Zap}
              title="Automatizaciones"
              description="Reglas inteligentes que envían mensajes, asignan agentes y mueven leads automáticamente."
              color="bg-amber-600/80"
              delay="0.8s"
            />
            <FeatureCard
              icon={Shield}
              title="Multi-tenant SaaS"
              description="Cada inmobiliaria con sus datos aislados, usuarios, roles y configuración propia."
              color="bg-purple-600/80"
              delay="0.9s"
            />
            <FeatureCard
              icon={Bot}
              title="Agente IA"
              description="Conectá ChatGPT, Gemini, Claude o más. Respuestas inteligentes en cada conversación."
              color="bg-brand-600/80"
              delay="1.0s"
            />
            <FeatureCard
              icon={BarChart3}
              title="Pipeline visual"
              description="Embudo Kanban drag-and-drop con etapas personalizables para cada inmobiliaria."
              color="bg-cyan-600/80"
              delay="1.1s"
            />
            <FeatureCard
              icon={Users}
              title="Equipo y roles"
              description="Admin, Business, Agent, Viewer. Cada rol con permisos precisos y visibilidad controlada."
              color="bg-rose-600/80"
              delay="1.2s"
            />
          </div>
        </section>

        {/* ─── Pricing section ─────────────────── */}
        <section id="pricing" className="px-6 sm:px-12 pb-24 max-w-5xl mx-auto scroll-mt-8">
          {/* Section header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
              <Star className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-300">Simple y sin sorpresas</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white mb-4">
              Elegí tu plan
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Todo incluido. Sin contratos. Cancelá cuando quieras.
            </p>
          </div>

          {/* Pricing cards — 2 plans, centered */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-3xl mx-auto">

            {/* ── Plan con prueba gratis (featured) ── */}
            <div className="relative rounded-2xl border-2 border-emerald-500/50 bg-emerald-950/20 backdrop-blur-sm p-8
                            shadow-[0_0_60px_-12px_rgba(16,185,129,0.25)] flex flex-col">
              {/* Badge */}
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <div className="px-4 py-1.5 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-xs font-bold
                                shadow-lg shadow-emerald-600/30 flex items-center gap-1.5">
                  <Rocket className="w-3.5 h-3.5" />
                  Oferta de lanzamiento
                </div>
              </div>

              <div className="mb-4 mt-2">
                <h3 className="text-xl font-bold text-white mb-1">Prueba gratis 15 días</h3>
                <p className="text-sm text-emerald-300/70">Empezá sin pagar nada. Luego $750/mes.</p>
              </div>

              {/* Price */}
              <div className="mb-2">
                <div className="flex items-end gap-2">
                  <span className="text-6xl font-extrabold text-white">$0</span>
                  <div className="pb-2">
                    <p className="text-xs text-emerald-400 font-semibold">por 15 días</p>
                    <p className="text-sm text-gray-400">luego $750 <span className="text-gray-500">USD/mes</span></p>
                  </div>
                </div>
              </div>

              {/* Countdown */}
              <div className="mb-6 p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/20">
                <p className="text-xs text-center text-emerald-400/70 mb-1">Esta oferta está disponible por tiempo limitado</p>
                <CountdownTimer />
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {[
                  "Todos los canales (WhatsApp, Telegram, Email, Meta)",
                  "Pipeline Kanban ilimitado",
                  "Automatizaciones ilimitadas",
                  "Agente IA (ChatGPT, Gemini, Claude)",
                  "Dashboard avanzado con métricas",
                  "Roles y permisos (Admin, Agente, Viewer)",
                  "Soporte prioritario por WhatsApp",
                  "Sin tarjeta requerida para la prueba",
                ].map((feat) => (
                  <li key={feat} className="flex items-start gap-3 text-sm text-gray-200">
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    {feat}
                  </li>
                ))}
              </ul>

              <a
                href="https://wa.me/5491100000000?text=Hola%2C%20quiero%20empezar%20la%20prueba%20gratuita%20de%2015%20d%C3%ADas%20de%20InmoFlow"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center px-6 py-4 rounded-xl text-sm font-bold mt-auto
                           bg-gradient-to-r from-emerald-600 to-emerald-500 text-white
                           hover:from-emerald-500 hover:to-emerald-400 shadow-lg shadow-emerald-600/25
                           hover:shadow-emerald-500/40 transition-all duration-300 hover:-translate-y-0.5"
              >
                Empezar prueba gratis
              </a>
            </div>

            {/* ── Plan estándar ──────────────── */}
            <div className="relative rounded-2xl border border-white/[0.1] bg-white/[0.03] backdrop-blur-sm p-8
                            hover:border-white/[0.18] transition-all duration-500 flex flex-col">
              <div className="mb-4">
                <h3 className="text-xl font-bold text-white mb-1">Plan Profesional</h3>
                <p className="text-sm text-gray-400">Para inmobiliarias listas para crecer</p>
              </div>

              {/* Price */}
              <div className="mb-8">
                <div className="flex items-end gap-2">
                  <span className="text-6xl font-extrabold text-white">$750</span>
                  <div className="pb-2">
                    <span className="text-gray-400">USD<span className="text-gray-500">/mes</span></span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">Sin período de prueba · Acceso inmediato</p>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {[
                  "Todos los canales (WhatsApp, Telegram, Email, Meta)",
                  "Pipeline Kanban ilimitado",
                  "Automatizaciones ilimitadas",
                  "Agente IA (ChatGPT, Gemini, Claude)",
                  "Dashboard avanzado con métricas",
                  "Roles y permisos (Admin, Agente, Viewer)",
                  "Soporte prioritario por WhatsApp",
                  "Acceso desde el primer día",
                ].map((feat) => (
                  <li key={feat} className="flex items-start gap-3 text-sm text-gray-300">
                    <Check className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" />
                    {feat}
                  </li>
                ))}
              </ul>

              <a
                href="https://wa.me/5491100000000?text=Hola%2C%20quiero%20contratar%20el%20plan%20Profesional%20de%20InmoFlow"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center px-6 py-4 rounded-xl text-sm font-bold mt-auto
                           bg-white/[0.08] text-white border border-white/[0.12]
                           hover:bg-white/[0.14] hover:border-white/[0.2] transition-all duration-300"
              >
                Contratar ahora
              </a>
            </div>
          </div>

          {/* Fine print */}
          <p className="text-center text-xs text-gray-600 mt-8">
            Todos los planes incluyen actualizaciones. Podés cancelar en cualquier momento.
          </p>
        </section>

        {/* ─── Footer ──────────────────────────── */}
        <footer className="border-t border-white/[0.06] py-10 px-6 bg-[#0a1628]">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Image src="/images/logo.png" alt="InmoFlow" width={28} height={28} className="opacity-60" />
              <span className="text-sm text-gray-600">
                © {new Date().getFullYear()} InmoFlow
              </span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/login" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
                Iniciar sesión
              </Link>
              <a href="https://wa.me/5491100000000" target="_blank" rel="noopener noreferrer"
                 className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
                Contacto
              </a>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
