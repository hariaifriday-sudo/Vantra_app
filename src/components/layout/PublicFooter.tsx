import { Link } from 'react-router-dom'
import { VantraLogo } from './VantraLogo'

const columns: { title: string; links: { label: string; to?: string }[] }[] = [
  { title: 'Resources', links: [{ label: 'Help Center' }, { label: 'How We Use AI', to: '/trust' }, { label: 'Security' }, { label: 'Fees' }] },
  { title: 'Contact', links: [{ label: 'hello@vantra.bank' }, { label: 'Find a Branch' }, { label: 'Careers' }] },
  { title: 'Social', links: [{ label: 'X' }, { label: 'LinkedIn' }, { label: 'YouTube' }] },
]

export function PublicFooter() {
  return (
    <footer className="relative mx-auto mt-8 w-full max-w-6xl overflow-hidden rounded-3xl border border-border-hair bg-surface p-10 pb-0">
      <div className="flex flex-col justify-between gap-10 sm:flex-row">
        <div>
          <VantraLogo className="text-ink" />
          <p className="mt-3 max-w-xs text-sm text-ink-muted">
            Vantra Bank is a demonstration product for AI-assisted digital banking. Not a real financial institution.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-10">
          {columns.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) =>
                  l.to ? (
                    <li key={l.label}>
                      <Link to={l.to} className="text-sm text-ink-muted transition-colors hover:text-ink">
                        {l.label}
                      </Link>
                    </li>
                  ) : (
                    <li key={l.label} className="text-sm text-ink-muted transition-colors hover:text-ink">
                      {l.label}
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-10 flex flex-col gap-2 border-t border-border-hair pt-6 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
        <p>© 2026 Vantra Bank. Member FDIC (simulated). Equal Housing Lender.</p>
        <p>Deposits and lending products shown are illustrative, not live offers.</p>
      </div>
      <div className="pointer-events-none mt-6 flex justify-center overflow-hidden" aria-hidden="true">
        <span className="select-none font-display text-[13vw] font-black leading-none tracking-tight text-ink/[0.04]">VANTRA</span>
      </div>
    </footer>
  )
}
