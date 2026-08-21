import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

export function AssistantOrb({ size = 40, listening = false, className }: { size?: number; listening?: boolean; className?: string }) {
  const reduceMotion = useReducedMotion()

  return (
    <div className={cn('relative grid place-items-center', className)} style={{ width: size, height: size }}>
      <motion.div
        className="ai-orb absolute inset-0 rounded-full"
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      />
      {listening && !reduceMotion ? (
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-accent"
          animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
        />
      ) : null}
      <div
        className="absolute rounded-full bg-paper"
        style={{ inset: Math.max(2, size * 0.12) }}
      />
      <div
        className="ai-orb absolute rounded-full opacity-90"
        style={{ inset: Math.max(4, size * 0.22) }}
      />
    </div>
  )
}
