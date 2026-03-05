"use client";

import { api, PublicProperty } from "@/lib/api";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { MapPin, Bed, Bath, Maximize, Car, DollarSign, Phone, Mail, MessageSquare, Send } from "lucide-react";

export default function PublicPropertyPage() {
  const params = useParams();
  const tenantId = params.tenantId as string;
  const slug = params.slug as string;

  const [property, setProperty] = useState<PublicProperty | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Contact form
  const [showContact, setShowContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", phone: "", email: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    api.getPublicProperty(tenantId, slug)
      .then(setProperty)
      .catch(() => setError("Propiedad no encontrada"))
      .finally(() => setLoading(false));
  }, [tenantId, slug]);

  const handleSubmitContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.name) return;
    setSending(true);
    try {
      await api.submitPublicContact(tenantId, slug, contactForm);
      setSent(true);
    } catch {
      alert("Error al enviar. Intente de nuevo.");
    }
    setSending(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-700 mb-2">Propiedad no encontrada</h1>
          <p className="text-gray-500">El enlace puede estar incorrecto o la propiedad ya no está disponible.</p>
        </div>
      </div>
    );
  }

  const priceStr = property.price
    ? `${property.currency} ${property.price.toLocaleString("es")}`
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="text-sm text-gray-500">{property.tenant}</div>
        </div>
      </header>

      {/* Gallery */}
      {property.media.length > 0 && (
        <div className="max-w-5xl mx-auto px-4 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-xl overflow-hidden">
            {property.media.slice(0, 4).map((m, i) => (
              <div key={i} className={`relative ${i === 0 ? "md:row-span-2" : ""} bg-gray-200 aspect-video`}>
                <img src={m.url} alt={property.title} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{property.title}</h1>
              {property.zone && (
                <p className="text-gray-500 flex items-center gap-1 mt-2">
                  <MapPin className="w-4 h-4" /> {property.zone}
                  {property.address && ` · ${property.address}`}
                </p>
              )}
              {priceStr && (
                <p className="text-2xl font-bold text-blue-600 mt-3 flex items-center gap-1">
                  <DollarSign className="w-5 h-5" /> {priceStr}
                </p>
              )}
            </div>

            {/* Features */}
            <div className="flex flex-wrap gap-4">
              {property.bedrooms != null && (
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border shadow-sm">
                  <Bed className="w-5 h-5 text-gray-400" />
                  <span className="font-medium">{property.bedrooms}</span>
                  <span className="text-sm text-gray-500">Dormitorios</span>
                </div>
              )}
              {property.bathrooms != null && (
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border shadow-sm">
                  <Bath className="w-5 h-5 text-gray-400" />
                  <span className="font-medium">{property.bathrooms}</span>
                  <span className="text-sm text-gray-500">Baños</span>
                </div>
              )}
              {property.areaM2 != null && (
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border shadow-sm">
                  <Maximize className="w-5 h-5 text-gray-400" />
                  <span className="font-medium">{property.areaM2} m²</span>
                </div>
              )}
              {property.hasGarage && (
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border shadow-sm">
                  <Car className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-500">Garaje</span>
                </div>
              )}
            </div>

            {/* Description */}
            {property.description && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Descripción</h2>
                <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{property.description}</p>
              </div>
            )}

            {/* Type */}
            {property.propertyType && (
              <div className="px-3 py-1.5 inline-block bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
                {property.propertyType}
              </div>
            )}
          </div>

          {/* Sidebar — Contact Form */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 bg-white rounded-xl border shadow-md p-6">
              <h3 className="font-semibold text-gray-900 text-lg mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-600" /> ¿Te interesa?
              </h3>

              {sent ? (
                <div className="text-center py-6">
                  <div className="text-4xl mb-3">✅</div>
                  <h4 className="font-semibold text-gray-900">¡Mensaje enviado!</h4>
                  <p className="text-sm text-gray-500 mt-1">Nos pondremos en contacto contigo muy pronto.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmitContact} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Tu nombre *"
                    required
                    value={contactForm.name}
                    onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <input
                    type="tel"
                    placeholder="Teléfono"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <textarea
                    placeholder="Escribe un mensaje..."
                    rows={3}
                    value={contactForm.message}
                    onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  />
                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    {sending ? "Enviando..." : "Enviar consulta"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t mt-12 py-6">
        <div className="max-w-5xl mx-auto px-4 text-center text-sm text-gray-400">
          Publicado por {property.tenant} · Powered by InmoFlow
        </div>
      </footer>
    </div>
  );
}
