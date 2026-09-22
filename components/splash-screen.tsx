"use client"

import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"

interface SplashScreenProps {
  /** Callback que se invoca cuando la animacion termina y el splash se desmonta. */
  onComplete: () => void
  /** Texto opcional para personalizar el saludo (e.g. nombre del usuario). */
  greeting?: string
}

/**
 * Pantalla de bienvenida que se muestra una sola vez tras iniciar
 * sesion. La estructura visual replica el patron del archivo
 * `splash-screen.tsx` provisto en `user_read_only_context` (gradiente
 * cyan/teal, logo flotante con glow, barra de carga, ola decorativa),
 * con dos ajustes menores:
 *   1. Las particulas y posiciones aleatorias se calculan en `useMemo`
 *      tras montar para evitar mismatches de hidratacion server/client
 *      (Math.random() en SSR genera HTML diferente al CSR).
 *   2. Los textos quedan en espanol y el subtitulo es generico para no
 *      atar la pantalla a un dominio especifico.
 */
export function SplashScreen({ onComplete, greeting }: SplashScreenProps) {
  const [isExiting, setIsExiting] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Animacion de salida a los 2.6s y desmonte a los 3.1s. El splash
    // original duraba 5s; lo acortamos para que el usuario llegue a la
    // app rapido pero alcance a percibir la transicion.
    const exitTimer = setTimeout(() => setIsExiting(true), 2600)
    const completeTimer = setTimeout(() => onComplete(), 3100)
    return () => {
      clearTimeout(exitTimer)
      clearTimeout(completeTimer)
    }
  }, [onComplete])

  // Particulas calculadas una sola vez por montaje. Se generan en el
  // cliente (mounted === true) para que no aparezcan en SSR — ver nota
  // de hidratacion arriba.
  const particles = useMemo(() => {
    if (!mounted) return []
    return Array.from({ length: 20 }, () => ({
      size: Math.random() * 100 + 50,
      left: Math.random() * 100,
      top: Math.random() * 100,
      duration: Math.random() * 3 + 2,
      delay: Math.random() * 2,
    }))
  }, [mounted])

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, #0c4a6e 0%, #0e7490 40%, #06b6d4 80%, #22d3ee 100%)",
          }}
        >
          {/* Particulas animadas en el fondo */}
          <div className="absolute inset-0 overflow-hidden">
            {particles.map((p, i) => (
              <motion.div
                key={i}
                className="absolute rounded-full bg-white/10"
                style={{
                  width: p.size,
                  height: p.size,
                  left: `${p.left}%`,
                  top: `${p.top}%`,
                }}
                animate={{
                  y: [0, -30, 0],
                  opacity: [0.1, 0.3, 0.1],
                }}
                transition={{
                  duration: p.duration,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: "easeInOut",
                  delay: p.delay,
                }}
              />
            ))}
          </div>

          {/* Contenedor principal */}
          <div className="relative z-10 flex flex-col items-center text-center px-4">
            {/* Logo con animacion flotante */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 15,
                delay: 0.2,
              }}
              className="mb-8"
            >
              <motion.div
                animate={{
                  y: [0, -15, 0],
                  rotate: [0, 5, 0, -5, 0],
                }}
                transition={{
                  duration: 3,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: "easeInOut",
                }}
                className="relative"
              >
                {/* Logo de marca LipGo. La imagen tiene fondo
                    transparente y forma de rombo, asi que removimos el
                    cuadro blanco contenedor para que el icono "respire"
                    sobre el gradiente cyan y se vea como un emblema
                    flotante. El glow detras refuerza la sensacion de
                    levitacion y crea profundidad. */}
                <div className="relative w-40 h-40 md:w-52 md:h-52 flex items-center justify-center">
                  <Image
                    src="/lipgo-icon.png"
                    alt="LipGo"
                    width={416}
                    height={416}
                    className="w-full h-full object-contain drop-shadow-2xl"
                    priority
                  />
                </div>
                {/* Glow detras del logo — usa cyan claro (mismo tono
                    que el rombo del icono) para que parezca emanar de
                    la propia marca. */}
                <div className="absolute inset-0 bg-cyan-300/40 blur-3xl -z-10 scale-110" />
              </motion.div>
            </motion.div>

            {/* Saludo */}
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5, ease: "easeOut" }}
              className="text-cyan-100 text-lg md:text-xl font-light tracking-wider mb-2"
            >
              {greeting ?? "Bienvenido a"}
            </motion.p>

            {/* Marca */}
            <motion.h1
              initial={{ y: 30, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.8, ease: "easeOut" }}
              className="text-5xl md:text-6xl font-bold text-white mb-2 tracking-tight"
              style={{ textShadow: "0 4px 30px rgba(0, 0, 0, 0.3)" }}
            >
              LIPGO <span className="text-cyan-300">CRM</span>
            </motion.h1>

            {/* Subtitulo */}
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.0, ease: "easeOut" }}
              className="text-cyan-100/80 text-base md:text-lg font-light tracking-wide"
            >
              Gestión Comercial
            </motion.p>

            {/* Barra de carga con shimmer */}
            <motion.div
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ delay: 1.3, duration: 0.4 }}
              className="mt-10 w-48 h-1 bg-white/20 rounded-full overflow-hidden"
            >
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{
                  duration: 1.2,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: "easeInOut",
                }}
                className="h-full w-1/2 bg-gradient-to-r from-transparent via-white to-transparent"
              />
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5, duration: 0.4 }}
              className="mt-3 text-cyan-200/70 text-xs md:text-sm tracking-widest uppercase"
            >
              Cargando sistema...
            </motion.p>
          </div>

          {/* Ola decorativa inferior */}
          <div className="absolute bottom-0 left-0 right-0">
            <svg
              viewBox="0 0 1440 120"
              className="w-full h-16 md:h-24"
              preserveAspectRatio="none"
            >
              <motion.path
                initial={{ d: "M0,120 L1440,120 L1440,120 L0,120 Z" }}
                animate={{
                  d: [
                    "M0,120 L1440,120 L1440,80 C1200,100 960,60 720,80 C480,100 240,60 0,80 Z",
                    "M0,120 L1440,120 L1440,60 C1200,80 960,100 720,60 C480,80 240,100 0,60 Z",
                    "M0,120 L1440,120 L1440,80 C1200,100 960,60 720,80 C480,100 240,60 0,80 Z",
                  ],
                }}
                transition={{
                  duration: 4,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: "easeInOut",
                }}
                fill="rgba(255,255,255,0.15)"
              />
            </svg>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
