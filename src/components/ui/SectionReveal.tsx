import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'

/**
 * Framer Motion's `whileInView` (and a from-scratch IntersectionObserver,
 * tried first) can both miss the reveal entirely after a very large/fast
 * scroll jump (trackpad flick, scrollbar drag, Page Down spam) — the section
 * is left permanently at its `initial` state (opacity: 0), invisible forever
 * since the observer's follow-up callback never arrives. A plain `scroll`
 * listener doesn't have that failure mode: it fires on every real scroll
 * event no matter how big the jump, so we use it as the reveal trigger
 * instead of leaning on IntersectionObserver at all.
 */
const pending = new Set<() => void>()
let listenerAttached = false

function ensureListener() {
  if (listenerAttached) return
  listenerAttached = true
  let scheduled = false
  const run = () => {
    scheduled = false
    for (const check of Array.from(pending)) check()
  }
  const onScrollOrResize = () => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(run)
  }
  window.addEventListener('scroll', onScrollOrResize, { passive: true })
  window.addEventListener('resize', onScrollOrResize, { passive: true })
}

function useRevealOnce(margin = 80) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (visible) return
    ensureListener()

    const check = () => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight || document.documentElement.clientHeight
      if (rect.top < vh - margin && rect.bottom > 0) {
        pending.delete(check)
        setVisible(true)
      }
    }

    pending.add(check)
    check() // covers the case where it's already on-screen the moment this mounts

    return () => {
      pending.delete(check)
    }
  }, [visible, margin])

  return { ref, visible }
}

export function SectionReveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const { ref, visible } = useRevealOnce(80)
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={visible ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function StaggerGroup({ children, className }: { children: ReactNode; className?: string }) {
  const { ref, visible } = useRevealOnce(60)
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={visible ? 'show' : undefined}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 18, scale: 0.97 }, show: { opacity: 1, y: 0, scale: 1 } }}
      transition={{ duration: 0.45, ease: 'backOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
