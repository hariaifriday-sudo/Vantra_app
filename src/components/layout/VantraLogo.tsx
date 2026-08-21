import { motion } from 'framer-motion'
import { Bank } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

/** The bank glyph is Vantra's one consistent mark — reused everywhere a logo/icon is required. */
export function VantraLogo({ className, mark = false }: { className?: string; mark?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2 font-display font-bold', className)}>
      <motion.span
        whileHover={{ rotate: -8, scale: 1.08 }}
        transition={{ type: 'spring', stiffness: 350, damping: 12 }}
        className="inline-flex shrink-0"
      >
        <Bank size={22} weight="fill" aria-hidden="true" />
      </motion.span>
      {!mark && <span>Vantra</span>}
    </div>
  )
}
