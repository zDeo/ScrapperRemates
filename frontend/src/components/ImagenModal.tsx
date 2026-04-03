import { useEffect } from 'react'

interface Props {
  src:    string
  alt:    string
  onClose: () => void
}

export function ImagenModal({ src, alt, onClose }: Props) {
  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl w-full mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Botón cerrar */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white hover:text-gray-300 text-sm font-medium flex items-center gap-1 transition-colors"
        >
          Cerrar ✕
        </button>

        {/* Imagen grande */}
        <img
          src={src}
          alt={alt}
          className="w-full max-h-[80vh] object-contain rounded-xl shadow-2xl"
        />

        {/* Nombre del vehículo */}
        <div className="text-center text-white text-sm mt-3 opacity-70">{alt}</div>
      </div>
    </div>
  )
}
