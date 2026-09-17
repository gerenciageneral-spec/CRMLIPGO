/**
 * Documento soporte de un proceso disciplinario.
 *
 * Genera el acta del caso con el mismo encabezado de formato ISO que usan los
 * demás soportes del sistema (logo LIP, título al centro, código a la derecha),
 * y devuelve un Blob para subirlo al storage y dejarlo en la carpeta del
 * trabajador.
 *
 * QUÉ DOCUMENTO ES ESTE
 * Es la CONSTANCIA del trámite: qué se reportó, cuándo, con qué soporte, y en
 * qué estado va. NO es la carta de sanción: la sanción la impone el empleador
 * después de los descargos, y este documento deja constancia de que ese trámite
 * ocurrió. Por eso el pie cambia según el estado del caso.
 */

const LOGO_LIP_URL =
  "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/logo%20LIP-Cjl9Gzi9Ag9HfUljKHndRgJpqxQm2j.png"

const CODIGO_DOCUMENTO = "GH-FOR-40"

export interface DisciplinarioPdfData {
  radicado: string
  empresa: string
  trabajadorNombre: string
  trabajadorDocumento: string
  cargo: string | null
  conducta: string
  norma: string | null
  medidaSugerida: string | null
  fechaHecho: string
  horaHecho: string | null
  lugar: string | null
  relato: string
  testigo: string | null
  testigoCargo: string | null
  estado: string
  estadoEtiqueta: string
  fechaCitacionDescargos: string | null
  fechaDescargos: string | null
  medidaAplicada: string | null
  fechaResolucion: string | null
  radicadoPor: string | null
  responsable: string | null
  generadoEl: string
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = url
    })
  } catch {
    return null
  }
}

export async function generarPdfDisciplinario(data: DisciplinarioPdfData): Promise<Blob> {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF()

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 12
  const anchoUtil = pageWidth - marginX * 2

  // ---- Encabezado de formato ISO (3 celdas) ----
  const headerY = 12
  const headerH = 22
  const logoCellW = 48
  const codeCellW = 46
  const centerCellW = anchoUtil - logoCellW - codeCellW

  doc.setDrawColor(120, 120, 120)
  doc.setLineWidth(0.3)
  doc.rect(marginX, headerY, logoCellW, headerH)
  doc.rect(marginX + logoCellW, headerY, centerCellW, headerH)
  doc.rect(marginX + logoCellW + centerCellW, headerY, codeCellW, headerH)

  const logo = await loadImage(LOGO_LIP_URL)
  let logoOk = false
  if (logo) {
    try {
      const w = 42
      const h = 16
      doc.addImage(logo, "PNG", marginX + (logoCellW - w) / 2, headerY + (headerH - h) / 2, w, h)
      logoOk = true
    } catch (e) {
      console.error("[v0] pdf-disciplinario: addImage logo falló", e)
    }
  }
  if (!logoOk) {
    doc.setFontSize(12)
    doc.setFont("helvetica", "bold")
    doc.text("LIP S.A.S.", marginX + logoCellW / 2, headerY + headerH / 2 + 1, { align: "center" })
  }

  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text("ACTA DE PROCESO DISCIPLINARIO", marginX + logoCellW + centerCellW / 2, headerY + 9, {
    align: "center",
  })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.text("Gestión Humana · Relaciones Laborales", marginX + logoCellW + centerCellW / 2, headerY + 15, {
    align: "center",
  })

  const codeX = marginX + logoCellW + centerCellW + codeCellW / 2
  doc.setFontSize(8)
  doc.text(`Código: ${CODIGO_DOCUMENTO}`, codeX, headerY + 8, { align: "center" })
  doc.text(`Radicado: ${data.radicado}`, codeX, headerY + 13, { align: "center" })
  doc.text(data.generadoEl, codeX, headerY + 18, { align: "center" })

  let y = headerY + headerH + 8

  const seccion = (titulo: string) => {
    doc.setFillColor(238, 242, 243)
    doc.rect(marginX, y - 4.5, anchoUtil, 7, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setTextColor(30, 41, 59)
    doc.text(titulo.toUpperCase(), marginX + 2, y)
    doc.setTextColor(0, 0, 0)
    y += 8
  }

  const campo = (etiqueta: string, valor: string, ancho = anchoUtil) => {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.text(etiqueta, marginX + 2, y)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    const lineas = doc.splitTextToSize(valor || "—", ancho - 6)
    doc.text(lineas, marginX + 2, y + 4.5)
    y += 4.5 + lineas.length * 4.5 + 2.5
  }

  // Dos campos en la misma línea.
  const campoDoble = (e1: string, v1: string, e2: string, v2: string) => {
    const mitad = anchoUtil / 2
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.text(e1, marginX + 2, y)
    doc.text(e2, marginX + mitad + 2, y)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.text(doc.splitTextToSize(v1 || "—", mitad - 6), marginX + 2, y + 4.5)
    doc.text(doc.splitTextToSize(v2 || "—", mitad - 6), marginX + mitad + 2, y + 4.5)
    y += 11.5
  }

  // ---- Trabajador ----
  seccion("Datos del trabajador")
  campoDoble("Nombre", data.trabajadorNombre, "Documento", data.trabajadorDocumento)
  campoDoble("Cargo", data.cargo ?? "—", "Empresa usuaria", data.empresa)

  // ---- Hecho ----
  seccion("Conducta reportada")
  campo("Conducta", data.conducta)
  campoDoble(
    "Fecha del hecho",
    `${data.fechaHecho}${data.horaHecho ? ` · ${data.horaHecho}` : ""}`,
    "Lugar",
    data.lugar ?? "—",
  )
  if (data.norma) campo("Referencia normativa", data.norma)
  campo("Relato de los hechos", data.relato)
  if (data.testigo) {
    campoDoble("Testigo", data.testigo, "Cargo del testigo", data.testigoCargo ?? "—")
  }

  // ---- Trámite ----
  seccion("Trámite")
  campoDoble("Estado actual", data.estadoEtiqueta, "Radicado por", data.radicadoPor ?? "—")
  campoDoble(
    "Citación a descargos",
    data.fechaCitacionDescargos ?? "Pendiente",
    "Descargos realizados",
    data.fechaDescargos ?? "Pendiente",
  )
  if (data.medidaSugerida) {
    campo(
      "Medida sugerida por el catálogo",
      `${data.medidaSugerida}  (sugerencia — la decisión corresponde al empleador)`,
    )
  }
  if (data.medidaAplicada) {
    campoDoble(
      "Medida aplicada",
      data.medidaAplicada,
      "Fecha de la decisión",
      data.fechaResolucion ?? "—",
    )
  }

  // ---- Debido proceso ----
  // Este bloque va SIEMPRE, sin importar el estado: es la advertencia que evita
  // que alguien use este documento como si fuera una sanción.
  if (y > pageHeight - 60) {
    doc.addPage()
    y = 20
  }
  doc.setFillColor(254, 249, 231)
  doc.setDrawColor(217, 178, 43)
  const avisoY = y - 4
  const avisoTexto =
    data.estado === "resuelto"
      ? "La medida fue impuesta por el empleador tras oír al trabajador en diligencia de descargos, conforme al Art. 115 del CST. El trabajador pudo asistir acompañado de dos representantes de los trabajadores."
      : "Antes de imponer cualquier sanción, el empleador debe citar al trabajador a diligencia de descargos, donde puede asistir acompañado de dos representantes de los trabajadores (Art. 115 CST). La empresa usuaria reporta la conducta y solicita la medida, pero NO sanciona: el empleador es la empresa de servicios temporales."
  const avisoLineas = doc.splitTextToSize(avisoTexto, anchoUtil - 8)
  const avisoH = 8 + avisoLineas.length * 4
  doc.rect(marginX, avisoY, anchoUtil, avisoH, "FD")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(120, 85, 10)
  doc.text("DEBIDO PROCESO", marginX + 3, avisoY + 5)
  doc.setFont("helvetica", "normal")
  doc.text(avisoLineas, marginX + 3, avisoY + 10)
  doc.setTextColor(0, 0, 0)
  y = avisoY + avisoH + 12

  // ---- Firmas ----
  if (y > pageHeight - 45) {
    doc.addPage()
    y = 25
  }
  const anchoFirma = (anchoUtil - 10) / 2
  doc.setDrawColor(120, 120, 120)
  doc.line(marginX, y + 14, marginX + anchoFirma, y + 14)
  doc.line(marginX + anchoFirma + 10, y + 14, marginX + anchoUtil, y + 14)
  doc.setFontSize(8)
  doc.text("Quien reporta", marginX, y + 18)
  doc.text(data.radicadoPor ?? "", marginX, y + 22)
  doc.text("Responsable del trámite", marginX + anchoFirma + 10, y + 18)
  doc.text(data.responsable ?? "", marginX + anchoFirma + 10, y + 22)

  // ---- Pie ----
  doc.setFontSize(7)
  doc.setTextColor(120, 120, 120)
  doc.text(
    `${CODIGO_DOCUMENTO} · Radicado ${data.radicado} · Documento generado por LIPgo el ${data.generadoEl}`,
    pageWidth / 2,
    pageHeight - 8,
    { align: "center" },
  )

  return doc.output("blob")
}
