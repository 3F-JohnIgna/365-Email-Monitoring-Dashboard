import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

// Renders a 160px-tall area chart showing per-hour message counts for the last 8 hours; uses CSS variables for grid, tick, and tooltip colors so the chart responds correctly to light/dark mode.
export default function HourlyChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data || []} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
        <defs>
          <linearGradient id="hourly-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#06b6d4" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}   />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--chart-grid)"
          vertical={false}
        />
        <XAxis
          dataKey="hour"
          tick={{ fontSize: 10, fill: 'var(--chart-tick)' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--chart-tick)' }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background:   'var(--chart-tooltip-bg)',
            border:       '1px solid var(--chart-tooltip-border)',
            borderRadius: 8,
            fontSize:     12,
          }}
          itemStyle={{ color: 'var(--chart-label)' }}
          cursor={{ stroke: 'var(--chart-grid)', strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#06b6d4"
          strokeWidth={2}
          fill="url(#hourly-fill)"
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
