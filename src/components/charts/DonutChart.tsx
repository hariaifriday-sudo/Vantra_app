import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

interface Slice {
  name: string
  value: number
  color: string
}

export function DonutChart({ data, centerLabel }: { data: Slice[]; centerLabel: string }) {
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={88} paddingAngle={3} strokeWidth={0}>
            {data.map((slice) => (
              <Cell key={slice.name} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-hair)', borderRadius: 12, fontSize: 12 }}
            formatter={(value, name) => [`${value}%`, name]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="text-center">
          <p className="font-display tabular-nums text-2xl font-bold text-ink">{centerLabel}</p>
        </div>
      </div>
    </div>
  )
}
