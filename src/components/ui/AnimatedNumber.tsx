import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'framer-motion'

/**
 * Tweens a numeric value on change instead of letting it snap — the balance/
 * income/expense tiles update after a chat-driven action (a transfer lands,
 * a goal changes), and a silent value swap reads as "did that even work?".
 * The motion here is feedback that the number actually moved, not decoration:
 * it only plays when `value` changes, never on a timer or on hover.
 */
export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number
  format: (n: number) => string
  className?: string
}) {
  const [display, setDisplay] = useState(value)
  const prevValue = useRef(value)
  const reduce = useReducedMotion()

  useEffect(() => {
    if (prevValue.current === value) return
    if (reduce) {
      setDisplay(value)
      prevValue.current = value
      return
    }
    const controls = animate(prevValue.current, value, {
      duration: 0.6,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: setDisplay,
    })
    prevValue.current = value
    return () => controls.stop()
  }, [value, reduce])

  return (
    <span className={className} aria-label={format(value)}>
      {format(display)}
    </span>
  )
}
