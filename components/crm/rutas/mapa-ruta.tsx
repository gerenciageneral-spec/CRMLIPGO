// @ts-nocheck — wrapper de react-leaflet/leaflet: friccion de tipos de libreria
// externa. Debe ir ANTES de "use client": TypeScript solo lo respeta si es el
// primer comentario del archivo. Solo desactiva el chequeo de tipos aqui; no
// cambia nada en tiempo de ejecucion.
"use client"

// Mapa de la ruta con sus paradas numeradas y la línea del recorrido.
//
// SOLO SE CARGA CON ssr:false desde el registry. Leaflet toca `window` al
// importarse y revienta el render del servidor.

import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import type { Parada } from "@/lib/crm-rutas"

// Leaflet resuelve las rutas de sus iconos relativas al CSS, y el bundler de
// Next las mueve: sin este arreglo los marcadores no se ven. Se apunta al CDN,
// igual que hacía el visor de LIPgo.
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

/** Marcador numerado: el número es el orden de visita, que es la información
 *  que el vendedor necesita de un vistazo. */
function iconoNumerado(n: number, color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="
      background:${color};
      color:#fff;
      width:26px;height:26px;
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:700;
      border:2px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,.4);
    ">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

const COLOR_TIPO: Record<string, string> = {
  prospecto: "#818cf8",
  cliente: "#0ea5e9",
  cobro: "#ef4444",
}

interface Props {
  paradas: Parada[]
  centro: [number, number]
  zoom: number
  origen?: Parada | null
}

export function MapaRuta({ paradas, centro, zoom, origen }: Props) {
  // La línea incluye el origen si lo hay: sin eso, el recorrido parece
  // empezar en la primera parada y no donde está el vendedor.
  const linea: [number, number][] = [
    ...(origen ? [[origen.latitud, origen.longitud] as [number, number]] : []),
    ...paradas.map((p) => [p.latitud, p.longitud] as [number, number]),
  ]

  return (
    <MapContainer
      center={centro}
      zoom={zoom}
      scrollWheelZoom
      style={{ height: "100%", width: "100%", borderRadius: "0.75rem" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {linea.length > 1 && (
        <Polyline
          positions={linea}
          pathOptions={{ color: "#0ea5e9", weight: 3, opacity: 0.7, dashArray: "6 8" }}
        />
      )}

      {origen && (
        <Marker
          position={[origen.latitud, origen.longitud]}
          icon={L.divIcon({
            className: "",
            html: `<div style="
              background:#16a34a;width:22px;height:22px;border-radius:50%;
              border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);
            "></div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          })}
        >
          <Popup>
            <strong>Punto de partida</strong>
            <br />
            {origen.nombre}
          </Popup>
        </Marker>
      )}

      {paradas.map((p, i) => (
        <Marker
          key={p.id}
          position={[p.latitud, p.longitud]}
          icon={iconoNumerado(i + 1, COLOR_TIPO[p.tipo ?? "cliente"] ?? "#0ea5e9")}
        >
          <Popup>
            <strong>
              {i + 1}. {p.nombre}
            </strong>
            {p.motivo && (
              <>
                <br />
                {p.motivo}
              </>
            )}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}

export default MapaRuta
