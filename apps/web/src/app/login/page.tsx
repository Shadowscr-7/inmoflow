"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRight, Sparkles, MessageSquare, Zap, Shield } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

/* ─── Floating particles ──────────────────────── */
function Particles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(15)].map((_, i) => (
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

export default function LoginPage() {
  const { login, user, isLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/dashboard");
    }
  }, [user, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error de autenticación");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen bg-[#0a1628] flex overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-brand-600/10 blur-[120px] animate-pulse-slow" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-emerald-600/8 blur-[100px] animate-pulse-slow"
             style={{ animationDelay: "1.5s" }} />
        <div className="absolute top-[50%] left-[60%] w-[300px] h-[300px] rounded-full bg-purple-600/5 blur-[80px] animate-pulse-slow"
             style={{ animationDelay: "3s" }} />
        <Particles />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      {/* Left: branding panel (desktop) */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center">
        <div
          className="relative text-center px-12 max-w-lg"
          style={{ animation: mounted ? "slideUp 0.6s ease-out 0.2s both" : "none" }}
        >
          <Image src="/images/logo.png" alt="InmoFlow" width={100} height={100} className="mx-auto mb-6 drop-shadow-2xl" priority />
          <h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight">
            INMO<span className="bg-gradient-to-r from-brand-400 via-brand-300 to-cyan-400 bg-clip-text text-transparent">FLOW</span>
          </h1>
          <p className="text-gray-400 text-lg mb-10">
            La plataforma CRM inteligente para inmobiliarias modernas
          </p>

          {/* Feature pills */}
          <div className="space-y-3">
            {[
              { icon: MessageSquare, text: "Multi-canal: WhatsApp, Telegram, Email y más", color: "text-emerald-400" },
              { icon: Zap, text: "Automatizaciones inteligentes con reglas", color: "text-amber-400" },
              { icon: Shield, text: "Multi-tenant con roles y permisos", color: "text-purple-400" },
              { icon: Sparkles, text: "Agente IA con ChatGPT, Gemini, Claude", color: "text-brand-400" },
            ].map((feat, i) => (
              <div
                key={feat.text}
                className="flex items-center gap-3 px-5 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06]"
                style={{ animation: mounted ? `slideUp 0.5s ease-out ${0.4 + i * 0.1}s both` : "none" }}
              >
                <feat.icon className={`w-5 h-5 ${feat.color} shrink-0`} />
                <span className="text-sm text-gray-300">{feat.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: login form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 relative z-10">
        <div
          className="w-full max-w-md"
          style={{ animation: mounted ? "slideUp 0.6s ease-out 0.3s both" : "none" }}
        >
          {/* Card */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-8 sm:p-10 shadow-2xl">
            {/* Mobile logo */}
            <div className="lg:hidden text-center mb-8">
              <Image src="/images/logo.png" alt="InmoFlow" width={60} height={60} className="mx-auto mb-3 drop-shadow-xl" priority />
              <h2 className="text-xl font-bold text-white">
                INMO<span className="text-brand-400">FLOW</span>
              </h2>
            </div>

            {/* Header */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white">Bienvenido</h2>
              <p className="text-sm text-gray-400 mt-1">Ingresá a tu cuenta para continuar</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300 animate-fade-in">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white placeholder-gray-500
                             focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/50 transition-all"
                  placeholder="admin@demo.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1.5">Contraseña</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white placeholder-gray-500
                             focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/50 transition-all"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold
                           bg-gradient-to-r from-brand-600 to-brand-500 text-white
                           hover:from-brand-500 hover:to-brand-400 shadow-lg shadow-brand-600/25
                           hover:shadow-brand-500/40 transition-all duration-300 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Ingresando...
                  </>
                ) : (
                  <>
                    Ingresar
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {process.env.NEXT_PUBLIC_SHOW_DEMO === "true" && (
              <div className="mt-6 pt-6 border-t border-white/[0.06]">
                <p className="text-xs text-center text-gray-500">
                  Demo: <span className="text-gray-400">admin@demoa.com</span> / <span className="text-gray-400">password123</span>
                </p>
              </div>
            )}
          </div>

          {/* Back to landing */}
          <div className="mt-6 text-center">
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors inline-flex items-center gap-1.5"
            >
              ← Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
