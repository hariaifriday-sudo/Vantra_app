import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts'

export function TrendChart({ data }: { data: { month: string; income: number; expenses: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--positive)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--positive)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border-hair)" />
        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'var(--ink-muted)', fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            background: 'var(--surface)',
            border: '1px solid var(--border-hair)',
            borderRadius: 12,
            fontSize: 12,
          }}
          formatter={(value, name) => [`$${Number(value).toLocaleString()}`, name === 'income' ? 'Income' : 'Expenses']}
        />
        <Area type="monotone" dataKey="income" stroke="var(--positive)" strokeWidth={2} fill="url(#incomeFill)" />
        <Area type="monotone" dataKey="expenses" stroke="var(--accent)" strokeWidth={2} fill="url(#expenseFill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
