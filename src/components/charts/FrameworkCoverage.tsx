import { motion } from 'framer-motion'

export function FrameworkCoverage({ data }: { data: { framework: string; coverage: number }[] }) {
  return (
    <div className="space-y-4">
      {data.map((d) => (
        <div key={d.framework}>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="text-ink-muted">{d.framework}</span>
            <span className="tabular-nums font-semibold text-ink">{d.coverage}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={{ width: 0 }}
              whileInView={{ width: `${d.coverage}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
