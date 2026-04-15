import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad — InmoFlow",
  description: "Política de privacidad de InmoFlow, plataforma SaaS CRM para inmobiliarias.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-gray-800 dark:text-gray-200">
      <h1 className="text-3xl font-bold mb-2">Política de Privacidad</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-10">
        Última actualización: abril de 2026
      </p>

      <section className="space-y-8 text-base leading-relaxed">
        <div>
          <h2 className="text-xl font-semibold mb-2">1. Información que recopilamos</h2>
          <p>
            InmoFlow recopila información proporcionada directamente por los usuarios de la plataforma
            (nombre, correo electrónico, número de teléfono) así como datos generados durante el uso del
            servicio (registros de actividad, eventos de CRM, interacciones con canales de mensajería).
          </p>
          <p className="mt-2">
            Cuando un usuario completa un formulario de generación de leads a través de Facebook Lead Ads
            u otros canales integrados, los datos del formulario (nombre, correo, teléfono y campos
            adicionales configurados por el anunciante) son recibidos y almacenados dentro de la cuenta
            del tenant correspondiente en InmoFlow.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">2. Uso de la información</h2>
          <p>La información recopilada se utiliza exclusivamente para:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Gestionar y operar el servicio CRM de InmoFlow.</li>
            <li>Permitir a las inmobiliarias (tenants) dar seguimiento a sus contactos y leads.</li>
            <li>Enviar comunicaciones relacionadas con el servicio (notificaciones de cuenta, actualizaciones).</li>
            <li>Mejorar la plataforma mediante análisis de uso agregado y anónimo.</li>
          </ul>
          <p className="mt-2">
            No vendemos, alquilamos ni compartimos información personal con terceros con fines
            publicitarios o comerciales.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">3. Integración con Meta (Facebook / Instagram)</h2>
          <p>
            InmoFlow se integra con la API de Meta para recibir leads generados a través de formularios
            de Facebook Lead Ads. Esta integración requiere que el usuario autorice el acceso a sus
            páginas de Facebook mediante el flujo OAuth de Meta.
          </p>
          <p className="mt-2">
            Los datos recibidos de Meta se almacenan en los servidores de InmoFlow y se utilizan
            únicamente para poblar el CRM del tenant correspondiente. InmoFlow no utiliza estos datos
            para ningún otro propósito.
          </p>
          <p className="mt-2">
            Para más información sobre cómo Meta maneja los datos, consultá la{" "}
            <a
              href="https://www.facebook.com/privacy/policy/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 underline"
            >
              Política de Privacidad de Meta
            </a>
            .
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">4. Almacenamiento y seguridad</h2>
          <p>
            Los datos se almacenan en servidores con acceso restringido. Implementamos medidas de
            seguridad técnicas y organizativas para proteger la información contra acceso no autorizado,
            pérdida o divulgación. Los tokens de acceso de terceros (Meta, WhatsApp, etc.) se almacenan
            cifrados.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">5. Retención de datos</h2>
          <p>
            Los datos se conservan mientras la cuenta del tenant esté activa. Al dar de baja la cuenta,
            los datos pueden ser eliminados a solicitud del titular dentro de un plazo de 30 días.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">6. Derechos del usuario</h2>
          <p>Los usuarios tienen derecho a:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Acceder a sus datos personales almacenados en la plataforma.</li>
            <li>Solicitar la corrección de datos inexactos.</li>
            <li>Solicitar la eliminación de sus datos.</li>
            <li>Revocar el acceso de InmoFlow a sus cuentas de terceros (Meta, WhatsApp, etc.).</li>
          </ul>
          <p className="mt-2">
            Para ejercer estos derechos, contactanos en el correo indicado a continuación.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">7. Cookies</h2>
          <p>
            InmoFlow utiliza cookies de sesión necesarias para el funcionamiento del servicio (autenticación,
            preferencias de interfaz). No utilizamos cookies de rastreo publicitario de terceros.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">8. Cambios en esta política</h2>
          <p>
            Podemos actualizar esta política periódicamente. Los cambios significativos serán notificados
            a los usuarios activos por correo electrónico o mediante un aviso en la plataforma.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">9. Contacto</h2>
          <p>
            Para consultas sobre privacidad o para ejercer tus derechos, contactanos en:{" "}
            <a
              href="mailto:jcg.software.solution@gmail.com"
              className="text-blue-600 dark:text-blue-400 underline"
            >
              jcg.software.solution@gmail.com
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
