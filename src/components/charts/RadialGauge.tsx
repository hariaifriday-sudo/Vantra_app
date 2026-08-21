import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'

interface Category {
  name: string
  value: number
  color: string
}

export function RadialGauge({ data, total }: { data: Category[]; total: string }) {
  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0">
        <ResponsiveContainer width={168} height={168}>
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={58} outerRadius={80} startAngle={90} endAngle={-270} paddingAngle={4} strokeWidth={0}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="font-display tabular-nums text-2xl font-bold text-ink">{total}</p>
            <p className="text-[11px] text-ink-muted">Total Rate</p>
          </div>
        </div>
      </div>
      <ul className="flex-1 space-y-2.5">
        {data.map((d) => (
          <li key={d.name} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-ink-muted">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
              {d.name}
            </span>
            <span className="tabular-nums font-semibold text-ink">{d.value}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
