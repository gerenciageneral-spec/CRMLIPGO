// Política de privacidad — página PÚBLICA.
//
// Meta la exige para poner una app en producción, y su revisor tiene que poder
// abrirla SIN iniciar sesión. Por eso vive fuera de /portal y no usa AuthProvider
// ni consulta la base: es un documento estático.
//
// Es un componente de servidor a propósito (sin "use client"): se renderiza en
// el servidor y no depende de JavaScript en el navegador, que es lo que hace
// que un rastreador la lea sin problema.

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Política de privacidad · LIPgo",
  description:
    "Cómo LIP Progressive Integral Logistics S.A.S. trata los datos personales en LIPgo y en sus comunicaciones por WhatsApp.",
}

const ACTUALIZADO = "17 de septiembre de 2026"

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-slate-700">{children}</div>
    </section>
  )
}

export default function PoliticaPrivacidad() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <article className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 sm:p-10">
        <header className="border-b border-slate-200 pb-5">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">LIPgo</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Política de privacidad</h1>
          <p className="mt-2 text-sm text-slate-600">
            LIP PROGRESSIVE INTEGRAL LOGISTICS S.A.S. · NIT 901725963-8
          </p>
          <p className="mt-1 text-sm text-slate-500">Última actualización: {ACTUALIZADO}</p>
        </header>

        <Seccion titulo="1. Quiénes somos">
          <p>
            LIP PROGRESSIVE INTEGRAL LOGISTICS S.A.S., identificada con NIT 901725963-8, con
            domicilio en la Calle 4 B N.º 20 A 66, barrio Callejas, Valledupar (Cesar, Colombia),
            es responsable del tratamiento de los datos personales descritos en esta política.
          </p>
          <p>
            Correo de contacto para asuntos de datos personales:{" "}
            <a className="text-teal-700 underline" href="mailto:gerenciageneral@lip-sas.com">
              gerenciageneral@lip-sas.com
            </a>
          </p>
        </Seccion>

        <Seccion titulo="2. Qué es LIPgo">
          <p>
            LIPgo es una plataforma de uso <strong>interno</strong>. La usan los trabajadores de
            LIP y el personal autorizado de las empresas con las que LIP tiene contrato, para
            gestionar la operación logística: inventario, despachos, producción, asistencia,
            nómina y seguridad y salud en el trabajo.
          </p>
          <p>
            LIPgo <strong>no está abierta al público</strong> y no se ofrece como servicio a
            consumidores finales.
          </p>
        </Seccion>

        <Seccion titulo="3. Qué datos tratamos">
          <p>Según el rol de cada persona, LIPgo puede tratar:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Identificación y contacto:</strong> nombre, documento de identidad, teléfono,
              correo electrónico, ciudad y cargo.
            </li>
            <li>
              <strong>Laborales:</strong> fecha de ingreso, turnos programados, marcaciones de
              entrada y salida, novedades, salario y conceptos de nómina.
            </li>
            <li>
              <strong>Seguridad y salud en el trabajo:</strong> incapacidades, accidentes de
              trabajo, exámenes médicos ocupacionales y datos sociodemográficos.
            </li>
            <li>
              <strong>Imágenes:</strong> fotografía tomada al registrar la entrada o la salida en
              los puntos de control.
            </li>
            <li>
              <strong>Operativos:</strong> registros de inventario, órdenes de cargue, pesajes y
              actividad realizada dentro de la plataforma.
            </li>
          </ul>
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <strong>Datos sensibles.</strong> La información de salud y los datos biométricos
            derivados de la fotografía son datos sensibles conforme al artículo 5 de la Ley 1581 de
            2012. Se tratan únicamente para cumplir obligaciones laborales y de seguridad y salud
            en el trabajo, con acceso restringido al personal que debe conocerlos por su función.
            Nadie está obligado a autorizar el tratamiento de datos sensibles, salvo cuando la ley
            lo exija.
          </p>
        </Seccion>

        <Seccion titulo="4. Para qué los usamos">
          <ul className="list-disc space-y-1 pl-5">
            <li>Ejecutar el contrato laboral o de prestación de servicios.</li>
            <li>Liquidar la nómina y cumplir los aportes a seguridad social.</li>
            <li>Controlar el acceso a las instalaciones y registrar la asistencia.</li>
            <li>Cumplir las obligaciones del Sistema de Gestión de SST.</li>
            <li>Prestar el servicio logístico contratado y soportar su facturación.</li>
            <li>Enviar comunicaciones operativas relacionadas con el trabajo.</li>
          </ul>
        </Seccion>

        <Seccion titulo="5. Comunicaciones por WhatsApp">
          <p>
            LIPgo envía notificaciones operativas a través de WhatsApp usando la plataforma
            WhatsApp Business de Meta. Sobre esto es importante saber que:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Los mensajes son <strong>de carácter operativo</strong> —reportes de producción,
              avisos de turno, alertas de la operación— y se envían al número que la persona
              registró en su vinculación.
            </li>
            <li>
              <strong>No enviamos publicidad</strong> ni mensajes comerciales por este canal.
            </li>
            <li>
              Para poder entregar el mensaje, el número de teléfono se transmite a Meta Platforms,
              que actúa como proveedor de la infraestructura de mensajería. El tratamiento que Meta
              hace de esa información se rige por sus propias políticas.
            </li>
            <li>
              Cualquier persona puede <strong>pedir que dejemos de escribirle</strong> respondiendo
              al mensaje o escribiendo al correo de contacto de esta política. La solicitud se
              atiende sin que ello afecte su relación laboral.
            </li>
            <li>
              Conservamos el registro del envío —destinatario, fecha y estado de entrega— como
              soporte de que la comunicación se realizó.
            </li>
          </ul>
        </Seccion>

        <Seccion titulo="6. Con quién se comparten">
          <p>Los datos se comparten únicamente cuando es necesario y con:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Entidades del sistema de seguridad social</strong> (EPS, AFP, ARL, cajas de
              compensación) y autoridades, cuando la ley lo exige.
            </li>
            <li>
              <strong>Las empresas usuarias</strong> donde se presta el servicio, limitado a lo
              necesario para coordinar la operación.
            </li>
            <li>
              <strong>Proveedores de tecnología</strong> que alojan o procesan la información por
              cuenta de LIP, bajo obligación de confidencialidad.
            </li>
          </ul>
          <p>
            <strong>No vendemos datos personales</strong> ni los cedemos con fines publicitarios.
          </p>
        </Seccion>

        <Seccion titulo="7. Transferencia internacional">
          <p>
            La infraestructura de alojamiento y de mensajería puede estar ubicada fuera de
            Colombia. Al autorizar el tratamiento, el titular acepta esa transferencia, que se
            realiza con proveedores que ofrecen niveles adecuados de protección conforme al
            artículo 26 de la Ley 1581 de 2012.
          </p>
        </Seccion>

        <Seccion titulo="8. Cuánto tiempo los conservamos">
          <p>
            Los datos se conservan mientras dure la relación laboral o contractual y, después, por
            el tiempo que exijan las normas laborales, contables y de seguridad y salud en el
            trabajo. Las historias clínicas ocupacionales se conservan por el término que fija la
            normativa vigente. Cumplido ese plazo, se eliminan o se anonimizan.
          </p>
        </Seccion>

        <Seccion titulo="9. Sus derechos">
          <p>Conforme a la Ley 1581 de 2012, toda persona puede:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Conocer, actualizar y rectificar sus datos.</li>
            <li>Solicitar prueba de la autorización otorgada.</li>
            <li>Ser informada sobre el uso que se les ha dado.</li>
            <li>Presentar quejas ante la Superintendencia de Industria y Comercio.</li>
            <li>
              Revocar la autorización o pedir la supresión, cuando no exista un deber legal o
              contractual que obligue a conservarlos.
            </li>
            <li>Acceder gratuitamente a sus datos.</li>
          </ul>
          <p>
            Para ejercerlos, escriba a{" "}
            <a className="text-teal-700 underline" href="mailto:gerenciageneral@lip-sas.com">
              gerenciageneral@lip-sas.com
            </a>{" "}
            indicando su nombre, documento y la solicitud concreta. Las consultas se responden en
            un máximo de diez (10) días hábiles y los reclamos en quince (15) días hábiles,
            prorrogables conforme a la ley.
          </p>
        </Seccion>

        <Seccion titulo="10. Seguridad">
          <p>
            LIPgo aplica controles de acceso por usuario y por módulo, cifrado en tránsito y
            registro de la actividad. Cada persona ve únicamente la información que su rol
            requiere.
          </p>
        </Seccion>

        <Seccion titulo="11. Cambios">
          <p>
            Esta política puede actualizarse. La fecha de la última actualización aparece al
            inicio. Los cambios que afecten de forma sustancial el tratamiento se informarán por
            los canales habituales.
          </p>
        </Seccion>

        <footer className="mt-10 border-t border-slate-200 pt-5 text-sm text-slate-600">
          <p>
            LIP PROGRESSIVE INTEGRAL LOGISTICS S.A.S. · NIT 901725963-8 · Calle 4 B N.º 20 A 66,
            Valledupar, Cesar, Colombia
          </p>
          <p className="mt-1">
            <a className="text-teal-700 underline" href="mailto:gerenciageneral@lip-sas.com">
              gerenciageneral@lip-sas.com
            </a>
          </p>
        </footer>
      </article>
    </main>
  )
}
