import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export function AnomalyTrend({ data }: { data: { day: string; low: number; high: number }[] }) {
  const chartData = data.map((d) => ({ ...d, range: [d.low, d.high] }))

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border-hair)" />
        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'var(--ink-muted)', fontSize: 11 }} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--ink-muted)', fontSize: 11 }} width={32} />
        <Tooltip
          contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-hair)', borderRadius: 12, fontSize: 12 }}
          formatter={() => null}
          labelFormatter={(label) => `Anomaly score — ${label}`}
        />
        <defs>
          <linearGradient id="anomalyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#2fd4c4" />
          </linearGradient>
        </defs>
        <Bar dataKey="range" radius={[6, 6, 6, 6]} maxBarSize={18} fill="url(#anomalyGradient)" />
      </BarChart>
    </ResponsiveContainer>
  )
}
