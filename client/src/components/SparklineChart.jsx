import { useId } from 'react'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'

// Renders a minimal 40px-tall sparkline area chart for an array of count values; uses a unique gradient ID per instance to avoid SVG conflicts when multiple charts appear on the same page.
export default function SparklineChart({ data }) {
  const uid        = useId().replace(/:/g, '-')
  const gradientId = `spark-${uid}`
  const chartData  = (data || []).map((count, i) => ({ i, count }))

  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#06b6d4" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}   />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="count"
          stroke="#06b6d4"
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
