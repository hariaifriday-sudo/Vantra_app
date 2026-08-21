import { useRef, useState, type PointerEvent } from 'react'
import { ArrowCounterClockwise } from '@phosphor-icons/react'

export function SignaturePad({ onChange }: { onChange?: (signed: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasSignature, setHasSignature] = useState(false)

  function getCtx() {
    const canvas = canvasRef.current
    if (!canvas) return null
    return canvas.getContext('2d')
  }

  function start(e: PointerEvent<HTMLCanvasElement>) {
    const ctx = getCtx()
    if (!ctx) return
    drawing.current = true
    const rect = canvasRef.current!.getBoundingClientRect()
    ctx.beginPath()
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
  }

  function draw(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = getCtx()
    if (!ctx) return
    const rect = canvasRef.current!.getBoundingClientRect()
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#141414'
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top)
    ctx.stroke()
    if (!hasSignature) {
      setHasSignature(true)
      onChange?.(true)
    }
  }

  function stop() {
    drawing.current = false
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = getCtx()
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
    onChange?.(false)
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border border-border-hair bg-surface">
        <canvas
          ref={canvasRef}
          width={480}
          height={140}
          onPointerDown={start}
          onPointerMove={draw}
          onPointerUp={stop}
          onPointerLeave={stop}
          className="h-[140px] w-full cursor-crosshair touch-none"
        />
        {!hasSignature ? <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-ink-muted">Sign here</p> : null}
      </div>
      <button onClick={clear} className="mt-2 flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink">
        <ArrowCounterClockwise size={13} /> Clear signature
      </button>
    </div>
  )
}
