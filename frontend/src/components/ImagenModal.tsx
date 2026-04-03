import { useEffect, useState } from 'react'

interface Props {
  images:  string[]
  alt:     string
  onClose: () => void
}

export function ImagenModal({ images, alt, onClose }: Props) {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      onClose()
      if (e.key === 'ArrowRight')  setIdx(i => Math.min(i + 1, images.length - 1))
      if (e.key === 'ArrowLeft')   setIdx(i => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, images.length])

  const prev = () => setIdx(i => Math.max(i - 1, 0))
  const next = () => setIdx(i => Math.min(i + 1, images.length - 1))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl w-full mx-4 flex flex-col items-center"
        onClick={e => e.stopPropagation()}
      >
        {/* Botón cerrar */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white hover:text-gray-300 text-sm font-medium flex items-center gap-1 transition-colors"
        >
          Cerrar ✕
        </button>

        {/* Imagen */}
        <div className="relative w-full">
          <img
            key={images[idx]}
            src={images[idx]}
            alt={`${alt} – ${idx + 1}`}
            className="w-full max-h-[80vh] object-contain rounded-xl shadow-2xl"
          />

          {/* Flecha izquierda */}
          {images.length > 1 && idx > 0 && (
            <button
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/75 text-white rounded-full w-10 h-10 flex items-center justify-center text-lg transition-colors"
            >
              ‹
            </button>
          )}

          {/* Flecha derecha */}
          {images.length > 1 && idx < images.length - 1 && (
            <button
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/75 text-white rounded-full w-10 h-10 flex items-center justify-center text-lg transition-colors"
            >
              ›
            </button>
          )}
        </div>

        {/* Pie: nombre + indicador */}
        <div className="flex items-center gap-4 mt-3">
          <span className="text-white text-sm opacity-70">{alt}</span>
          {images.length > 1 && (
            <span className="text-white text-xs opacity-50">{idx + 1} / {images.length}</span>
          )}
        </div>

        {/* Miniaturas */}
        {images.length > 1 && (
          <div className="flex gap-2 mt-3 flex-wrap justify-center">
            {images.map((src, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`w-14 h-10 rounded overflow-hidden border-2 transition-all ${
                  i === idx ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-75'
                }`}
              >
                <img src={src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
