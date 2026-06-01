"use client";

// Recharts v3 initialises ResponsiveContainer with width=-1/height=-1 before
// its ResizeObserver fires, unconditionally calling console.warn on every mount.
// Mantine Charts uses ResponsiveContainer internally so there is no prop to
// suppress it from outside. Patch the one specific message here.
if (typeof window !== "undefined") {
  const _warn = console.warn.bind(console);
  console.warn = (...args: Parameters<typeof console.warn>): void => {
    if (
      typeof args[0] === "string" &&
      args[0].startsWith("The width(") &&
      args[0].includes("should be greater than 0")
    )
      return;
    _warn(...args);
  };
}

import { BarChart, DonutChart, type BarChartSeries } from "@mantine/charts";
import { useMediaQuery } from "@mantine/hooks";
import { Text } from "@mantine/core";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const PROFICIENCY_COLORS: Record<string, string> = {
  "Highly Proficient": "#4ade80",
  Proficient: "#84cc16",
  "Nearly Proficient": "#eab308",
  "Low Proficient": "#f97316",
  "Not Proficient": "#ef4444",
};

const SSES_COLOR = "#70A2FF";
const REGULAR_COLOR = "#9ca3af";
const CHART_HEIGHT = 280;
const TOOLTIP_BOX: React.CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #D6D9E0",
  borderRadius: 6,
  fontSize: 13,
  padding: "8px 12px",
};
const CHART_FADE_MS = 180;

function chartFadeStyle(ready: boolean): React.CSSProperties {
  return {
    opacity: ready ? 1 : 0,
    pointerEvents: ready ? "auto" : "none",
    transition: `opacity ${CHART_FADE_MS}ms ease`,
  };
}

// Defers chart rendering by one event-loop tick so Recharts' ResizeObserver
// never fires against a zero-size container during accordion transitions or
// the initial layout pass.
function useChartReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(id);
  }, []);
  return ready;
}

// Custom tooltip for the proficiency bar chart.
// Receives recharts tooltip props (cloned onto the element by recharts).
function ProficiencyTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: { payload: { level: string; count: number } }[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const { level, count } = payload[0].payload;
  const pct = total > 0 ? ((count / total) * 100).toFixed(2) : "0.00";
  const color = PROFICIENCY_COLORS[level] ?? "#9ca3af";
  return (
    <div style={TOOLTIP_BOX}>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <ColorDot color={color} />
        {level}: {count} ({pct}%)
      </span>
    </div>
  );
}

// Custom tooltip for the LAEMPL sex grouped bar chart.
// Total is summed from the payload — recharts grouped bar always sends all
// series for the hovered group, so total = group's test-taker count.
const SEX_BAR_COLORS: Record<string, string> = {
  attained: "#4EAE4A",
  "not attained": "#ef4444",
};
const SEX_BAR_LABELS: Record<string, string> = {
  attained: "Attained",
  "not attained": "Not Attained",
};

// Custom tooltip for SSES vs Regular grouped bar charts.
// Always renders SSES first then Regular, regardless of payload order.
// label = the x-axis category (e.g. "Highly Proficient", "Attained").
// Percentage is relative to the category total (SSES + Regular for that bar group).
function GroupedSsesRegularTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum, p) => sum + (p.value ?? 0), 0);
  const ordered = (["sses", "regular"] as const)
    .map((key) => payload.find((p) => p.name === key))
    .filter((p): p is { name: string; value: number } => p !== undefined);

  return (
    <div
      style={{
        ...TOOLTIP_BOX,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {label && (
        <div
          style={{
            fontWeight: 700,
            marginBottom: 2,
            color: "#111827",
            fontSize: 13,
          }}
        >
          {label}
        </div>
      )}
      {ordered.map((p) => {
        const pct = total > 0 ? ((p.value / total) * 100).toFixed(2) : "0.00";
        const color = p.name === "sses" ? SSES_COLOR : REGULAR_COLOR;
        const labelText = p.name === "sses" ? "SSES" : "Regular";
        return (
          <span
            key={p.name}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <ColorDot color={color} />
            {labelText}: {p.value} ({pct}%)
          </span>
        );
      })}
    </div>
  );
}

function SexBarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number }[];
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum, p) => sum + (p.value ?? 0), 0);
  return (
    <div
      style={{
        ...TOOLTIP_BOX,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {payload.map((p) => {
        const pct = total > 0 ? ((p.value / total) * 100).toFixed(2) : "0.00";
        const color = SEX_BAR_COLORS[p.name] ?? "#9ca3af";
        const label = SEX_BAR_LABELS[p.name] ?? p.name;
        return (
          <span
            key={p.name}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <ColorDot color={color} />
            {label}: {p.value} ({pct}%)
          </span>
        );
      })}
    </div>
  );
}

// Custom tooltip for the LAEMPL donut chart.
// total must be passed as a prop — recharts only injects the hovered segment
// into payload even when tooltipDataSource="all", so computing total from
// payload would always yield 100%.
function DonutTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: {
    name: string;
    value: number;
    payload?: { color?: string };
    color?: string;
  }[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        ...TOOLTIP_BOX,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {payload.map((p) => {
        const pct = total > 0 ? ((p.value / total) * 100).toFixed(2) : "0.00";
        const color = p.payload?.color ?? p.color ?? "#9ca3af";
        return (
          <span
            key={p.name}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <ColorDot color={color} />
            {p.name}: {p.value} ({pct}%)
          </span>
        );
      })}
    </div>
  );
}

// Single-series bar with one distinct color per proficiency level.
// Uses raw Recharts so each bar can receive a Cell fill.
export function ProficiencyBarChart({
  data,
}: {
  data: { level: string; count: number }[];
}) {
  const ready = useChartReady();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (data.every((d) => d.count === 0)) {
    return <ChartEmpty />;
  }

  const xAxisProps = isDesktop
    ? {
        tick: { fontSize: 13, fill: "#374151" },
        angle: 0,
        textAnchor: "middle" as const,
        height: 30,
        interval: 0,
      }
    : {
        tick: <TwoLineTick />,
        angle: 0,
        textAnchor: "middle" as const,
        height: 44,
        interval: 0,
      };

  return (
    <div
      style={{
        width: "100%",
        minWidth: 0,
        height: CHART_HEIGHT,
        outline: "none",
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {ready && (
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <RechartsBarChart
            data={data}
            margin={{ top: 16, right: 16, bottom: isDesktop ? 8 : 48, left: 0 }}
          >
            <CartesianGrid
              strokeDasharray="5 5"
              vertical={false}
              stroke="#E5E7EB"
            />
            <XAxis dataKey="level" {...xAxisProps} />
            <YAxis
              tick={{ fontSize: 12, fill: "#6B7280" }}
              allowDecimals={false}
              width={36}
            />
            <Tooltip
              content={<ProficiencyTooltip total={total} />}
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={72}>
              {data.map((entry) => (
                <Cell
                  key={entry.level}
                  fill={PROFICIENCY_COLORS[entry.level] ?? "#9ca3af"}
                />
              ))}
              <LabelList
                dataKey="count"
                position="top"
                content={({ x, y, width, value }) => {
                  const pct =
                    total > 0
                      ? ((Number(value) / total) * 100).toFixed(1)
                      : "0";
                  return (
                    <text
                      x={Number(x) + Number(width) / 2}
                      y={Number(y) - 4}
                      textAnchor="middle"
                      fontSize={11}
                      fill="#374151"
                    >
                      {pct}%
                    </text>
                  );
                }}
              />
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// Grouped bar chart for SSES vs Regular proficiency level comparison.
export function ProficiencyGroupedBarChart({
  data,
}: {
  data: { level: string; sses: number; regular: number }[];
}) {
  const ready = useChartReady();
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <div
      style={{
        width: "100%",
        minWidth: 0,
        minHeight: CHART_HEIGHT,
        outline: "none",
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div style={chartFadeStyle(ready)}>
        <BarChart
          h={CHART_HEIGHT}
          data={data}
          dataKey="level"
          series={[
            { name: "sses", label: "SSES", color: SSES_COLOR },
            { name: "regular", label: "Regular", color: REGULAR_COLOR },
          ]}
          type="default"
          withLegend
          withBarValueLabel
          valueLabelProps={(_series: BarChartSeries) => ({
            content: ({
              x,
              y,
              width,
              value,
              index,
            }: {
              x?: number | string;
              y?: number | string;
              width?: number | string;
              value?: number | string;
              index?: number;
            }) => {
              if (index === undefined || value === undefined) return null;
              const row = data[index];
              const groupTotal = (row?.sses ?? 0) + (row?.regular ?? 0);
              const pct =
                groupTotal > 0
                  ? ((Number(value) / groupTotal) * 100).toFixed(1)
                  : "0";
              return (
                <text
                  x={Number(x) + Number(width) / 2}
                  y={Number(y) - 4}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#374151"
                >
                  {pct}%
                </text>
              );
            },
          })}
          xAxisProps={
            isDesktop
              ? { angle: 0, textAnchor: "middle", height: 30, interval: 0 }
              : {
                  tick: <TwoLineTick />,
                  angle: 0,
                  textAnchor: "middle",
                  height: 44,
                  interval: 0,
                }
          }
          barChartProps={{ barGap: 2 }}
          tooltipAnimationDuration={0}
          tooltipProps={{ content: <GroupedSsesRegularTooltip /> }}
          gridAxis="x"
        />
      </div>
    </div>
  );
}

// Donut (left) + sex grouped bar (right) layout for LAEMPL.
export function LaemplDonutChart({
  achieved,
  total,
  maleAchieved,
  maleTotal,
  femaleAchieved,
  femaleTotal,
}: {
  achieved: number;
  total: number;
  maleAchieved: number;
  maleTotal: number;
  femaleAchieved: number;
  femaleTotal: number;
}) {
  const barReady = useChartReady();

  if (total === 0) {
    return <ChartEmpty />;
  }

  const percentage = ((achieved / total) * 100).toFixed(2);
  const notAchieved = total - achieved;

  const sexBarData = [
    {
      group: "Male",
      attained: maleAchieved,
      "not attained": maleTotal - maleAchieved,
    },
    {
      group: "Female",
      attained: femaleAchieved,
      "not attained": femaleTotal - femaleAchieved,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
      {/* Left: Donut */}
      <div className="flex flex-col items-center gap-3">
        <Text size="sm" fw={600} c="#374151">
          Overall
        </Text>
        <div style={{ position: "relative", display: "inline-block" }}>
          <DonutChart
            size={220}
            thickness={38}
            data={[
              { name: "Attained", value: achieved, color: "#4EAE4A" },
              { name: "Not Attained", value: notAchieved, color: "#ef4444" },
            ]}
            tooltipDataSource="segment"
            tooltipAnimationDuration={0}
            tooltipProps={{ content: <DonutTooltip total={total} /> }}
            paddingAngle={2}
          />
          {/* Two-line center text — not achievable via chartLabel (single SVG text node) */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center",
              pointerEvents: "none",
              lineHeight: 1.2,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>
              {percentage}%
            </div>
            <div style={{ fontSize: 11, color: "#808898", marginTop: 2 }}>
              Attained
            </div>
          </div>
        </div>
        <div className="flex gap-5 text-sm text-[#374151]">
          <span className="flex items-center gap-1.5">
            <ColorDot color="#4EAE4A" />
            Attained: <strong>{achieved}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <ColorDot color="#ef4444" />
            Not Attained: <strong>{notAchieved}</strong>
          </span>
        </div>
      </div>

      {/* Right: Sex grouped bar */}
      <div className="flex flex-col gap-2">
        <Text size="sm" fw={600} c="#374151">
          By Sex
        </Text>
        <div
          style={{
            width: "100%",
            minWidth: 0,
            minHeight: CHART_HEIGHT,
            outline: "none",
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {barReady && (
            <BarChart
              h={CHART_HEIGHT}
              data={sexBarData}
              dataKey="group"
              series={[
                { name: "attained", label: "Attained", color: "#4EAE4A" },
                {
                  name: "not attained",
                  label: "Not Attained",
                  color: "#ef4444",
                },
              ]}
              type="default"
              withLegend
              withBarValueLabel
              valueLabelProps={() => ({
                content: ({
                  x,
                  y,
                  width,
                  value,
                  index,
                }: {
                  x?: number | string;
                  y?: number | string;
                  width?: number | string;
                  value?: number | string;
                  index?: number;
                }) => {
                  if (index === undefined || value === undefined) return null;
                  const row = sexBarData[index];
                  const groupTotal =
                    (row?.attained ?? 0) + (row?.["not attained"] ?? 0);
                  const pct =
                    groupTotal > 0
                      ? ((Number(value) / groupTotal) * 100).toFixed(1)
                      : "0";
                  return (
                    <text
                      x={Number(x) + Number(width) / 2}
                      y={Number(y) - 4}
                      textAnchor="middle"
                      fontSize={11}
                      fill="#374151"
                    >
                      {pct}%
                    </text>
                  );
                },
              })}
              barChartProps={{ barGap: 2 }}
              tooltipAnimationDuration={0}
              tooltipProps={{ content: <SexBarTooltip /> }}
              gridAxis="x"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Grouped bar chart for SSES vs Regular LAEMPL comparison.
export function LaemplGroupedBarChart({
  ssesAchieved,
  ssesTotal,
  regularAchieved,
  regularTotal,
}: {
  ssesAchieved: number;
  ssesTotal: number;
  regularAchieved: number;
  regularTotal: number;
}) {
  const ready = useChartReady();

  const data = [
    { category: "Attained", sses: ssesAchieved, regular: regularAchieved },
    {
      category: "Not Attained",
      sses: ssesTotal - ssesAchieved,
      regular: regularTotal - regularAchieved,
    },
  ];

  return (
    <div
      style={{
        width: "100%",
        minWidth: 0,
        minHeight: CHART_HEIGHT,
        outline: "none",
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div style={chartFadeStyle(ready)}>
        <BarChart
          h={CHART_HEIGHT}
          data={data}
          dataKey="category"
          series={[
            { name: "sses", label: "SSES", color: SSES_COLOR },
            { name: "regular", label: "Regular", color: REGULAR_COLOR },
          ]}
          type="default"
          withLegend
          withBarValueLabel
          valueLabelProps={() => ({
            content: ({
              x,
              y,
              width,
              value,
              index,
            }: {
              x?: number | string;
              y?: number | string;
              width?: number | string;
              value?: number | string;
              index?: number;
            }) => {
              if (index === undefined || value === undefined) return null;
              const row = data[index];
              const groupTotal = (row?.sses ?? 0) + (row?.regular ?? 0);
              const pct =
                groupTotal > 0
                  ? ((Number(value) / groupTotal) * 100).toFixed(1)
                  : "0";
              return (
                <text
                  x={Number(x) + Number(width) / 2}
                  y={Number(y) - 4}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#374151"
                >
                  {pct}%
                </text>
              );
            },
          })}
          barChartProps={{ barGap: 2 }}
          tooltipAnimationDuration={0}
          tooltipProps={{ content: <GroupedSsesRegularTooltip /> }}
          gridAxis="x"
        />
      </div>
    </div>
  );
}

function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "8px 16px", marginBottom: 4 }}>
      {items.map(({ label, color }) => (
        <span key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#374151" }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: color, display: "inline-block", flexShrink: 0 }} />
          {label}
        </span>
      ))}
    </div>
  );
}

// Recharts-idiomatic custom YAxis tick: translate to (x,y) then render text
// at x=0 with textAnchor="end" so it ends flush against the bar area.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SectionNameTick({ x, y, payload }: any) {
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={4} textAnchor="end" fill="#1e293b" fontSize={13} fontWeight={700}>
        {payload.value}
      </text>
    </g>
  );
}

// ─── Diverging Stacked Bar — Regular Only ────────────────────────────────────

type DivergingBarRow = {
  section: string;
  "Highly Proficient": number; // % positive
  Proficient: number; // % positive
  "Nearly Proficient": number; // % negative
  "Low Proficient": number; // % negative
  "Not Proficient": number; // % negative
  _counts: Record<string, number>;
  _total: number;
};

const DIVERGING_LEVELS = [
  "Highly Proficient",
  "Proficient",
  "Nearly Proficient",
  "Low Proficient",
  "Not Proficient",
] as const;

// Tooltip shows count + percentage for every level of the hovered section.
function DivergingBarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: DivergingBarRow }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div
      style={{
        ...TOOLTIP_BOX,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          marginBottom: 2,
          color: "#111827",
          fontSize: 13,
        }}
      >
        {row.section}
      </div>
      {DIVERGING_LEVELS.map((level) => {
        const count = row._counts[level] ?? 0;
        const pct =
          row._total > 0 ? ((count / row._total) * 100).toFixed(1) : "0";
        return (
          <span
            key={level}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
            }}
          >
            <ColorDot color={PROFICIENCY_COLORS[level] ?? "#9ca3af"} />
            {level}: {count} ({pct}%)
          </span>
        );
      })}
    </div>
  );
}

// Inside-bar label renderer shared across all 5 Bar components.
// Skips zero-value or pixel-too-narrow segments to avoid overflow.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DivergingBarLabel(props: any) {
  const { x, y, width, height, value } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    value: number;
  };
  const abs = Math.abs(Number(value));
  const absWidth = Math.abs(Number(width));
  if (abs === 0 || absWidth < 22) return null;
  return (
    <text
      x={x + width / 2}
      y={y + height / 2}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={600}
      fill="#111827"
    >
      {abs}%
    </text>
  );
}

// Render order within the single stackId:
//   Negative (innermost→outermost left): Nearly Proficient → Low Proficient → Not Proficient
//   Positive (innermost→outermost right): Proficient → Highly Proficient
export function RegularProficiencyDivergingChart({
  data,
}: {
  data: DivergingBarRow[];
}) {
  const ready = useChartReady();

  const chartData = data.filter((d) => d._total > 0);
  const noDataSections = data
    .filter((d) => d._total === 0)
    .map((d) => d.section);

  const chartHeight = Math.max(300, chartData.length * 52 + 60);
  // Bold 13px ≈ 8px per character; cap at 180, min 80
  const yAxisWidth = Math.min(
    180,
    Math.max(80, Math.max(...(chartData.length ? chartData : data).map((d) => d.section.length)) * 8),
  );

  if (chartData.length === 0 && noDataSections.length === 0)
    return <ChartEmpty />;
  if (chartData.length === 0) {
    return (
      <div className="space-y-2">
        <ChartEmpty />
        <NoDataSectionsList sections={noDataSections} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        style={{
          width: "100%",
          minWidth: 0,
          minHeight: chartHeight,
          outline: "none",
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {ready && (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <RechartsBarChart
              layout="vertical"
              stackOffset="sign"
              data={chartData}
              margin={{ top: 8, right: 40, bottom: 8, left: 0 }}
              barCategoryGap="25%"
            >
              <CartesianGrid
                horizontal={false}
                strokeDasharray="5 5"
                stroke="#E5E7EB"
              />
              <XAxis
                type="number"
                domain={[-100, 100]}
                hide
              />
              <YAxis
                type="category"
                dataKey="section"
                width={yAxisWidth}
                tick={SectionNameTick}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={<DivergingBarTooltip />}
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
              />
              <ReferenceLine x={0} stroke="#64748b" strokeWidth={1.5} />
              {/* Negative stack — innermost to outermost left */}
              <Bar
                dataKey="Nearly Proficient"
                stackId="proficiency"
                fill={PROFICIENCY_COLORS["Nearly Proficient"]}
              >
                <LabelList
                  dataKey="Nearly Proficient"
                  content={DivergingBarLabel}
                />
              </Bar>
              <Bar
                dataKey="Low Proficient"
                stackId="proficiency"
                fill={PROFICIENCY_COLORS["Low Proficient"]}
              >
                <LabelList
                  dataKey="Low Proficient"
                  content={DivergingBarLabel}
                />
              </Bar>
              <Bar
                dataKey="Not Proficient"
                stackId="proficiency"
                fill={PROFICIENCY_COLORS["Not Proficient"]}
              >
                <LabelList
                  dataKey="Not Proficient"
                  content={DivergingBarLabel}
                />
              </Bar>
              {/* Positive stack — innermost to outermost right */}
              <Bar
                dataKey="Proficient"
                stackId="proficiency"
                fill={PROFICIENCY_COLORS["Proficient"]}
              >
                <LabelList dataKey="Proficient" content={DivergingBarLabel} />
              </Bar>
              <Bar
                dataKey="Highly Proficient"
                stackId="proficiency"
                fill={PROFICIENCY_COLORS["Highly Proficient"]}
              >
                <LabelList
                  dataKey="Highly Proficient"
                  content={DivergingBarLabel}
                />
              </Bar>
            </RechartsBarChart>
          </ResponsiveContainer>
        )}
      </div>
      <ChartLegend items={[
        { label: "Not Proficient",    color: PROFICIENCY_COLORS["Not Proficient"] },
        { label: "Low Proficient",    color: PROFICIENCY_COLORS["Low Proficient"] },
        { label: "Nearly Proficient", color: PROFICIENCY_COLORS["Nearly Proficient"] },
        { label: "Proficient",        color: PROFICIENCY_COLORS["Proficient"] },
        { label: "Highly Proficient", color: PROFICIENCY_COLORS["Highly Proficient"] },
      ]} />
      {noDataSections.length > 0 && (
        <NoDataSectionsList sections={noDataSections} />
      )}
    </div>
  );
}

// ─── Diverging Stacked Bar — LAEMPL Regular Only ─────────────────────────────

type LaemplDivergingBarRow = {
  section: string;
  "Attained": number;      // % positive
  "Not Attained": number;  // % negative
  _attained: number;
  _total: number;
};

function LaemplDivergingTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: LaemplDivergingBarRow }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const notAttained = row._total - row._attained;
  const fmt = (n: number) => row._total > 0 ? ((n / row._total) * 100).toFixed(1) : "0";
  return (
    <div style={{ ...TOOLTIP_BOX, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontWeight: 700, marginBottom: 2, color: "#111827", fontSize: 13 }}>
        {row.section}
      </div>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <ColorDot color="#4EAE4A" /> Attained: {row._attained} ({fmt(row._attained)}%)
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <ColorDot color="#ef4444" /> Not Attained: {notAttained} ({fmt(notAttained)}%)
      </span>
    </div>
  );
}

export function RegularLaemplDivergingChart({ data }: { data: LaemplDivergingBarRow[] }) {
  const ready = useChartReady();

  const chartData = data.filter((d) => d._total > 0);
  const noDataSections = data.filter((d) => d._total === 0).map((d) => d.section);

  const chartHeight = Math.max(280, chartData.length * 52 + 60);
  const yAxisWidth = Math.min(
    180,
    Math.max(80, Math.max(...(chartData.length ? chartData : data).map((d) => d.section.length)) * 8),
  );

  if (chartData.length === 0 && noDataSections.length === 0) return <ChartEmpty />;
  if (chartData.length === 0) {
    return (
      <div className="space-y-2">
        <ChartEmpty />
        <NoDataSectionsList sections={noDataSections} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        style={{ width: "100%", minWidth: 0, minHeight: chartHeight, outline: "none" }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {ready && (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <RechartsBarChart
              layout="vertical"
              stackOffset="sign"
              data={chartData}
              margin={{ top: 8, right: 40, bottom: 8, left: 0 }}
              barCategoryGap="25%"
            >
              <CartesianGrid horizontal={false} strokeDasharray="5 5" stroke="#E5E7EB" />
              <XAxis type="number" domain={[-100, 100]} hide />
              <YAxis
                type="category"
                dataKey="section"
                width={yAxisWidth}
                tick={SectionNameTick}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<LaemplDivergingTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <ReferenceLine x={0} stroke="#64748b" strokeWidth={1.5} />
              <Bar dataKey="Not Attained" stackId="laempl" fill="#ef4444">
                <LabelList dataKey="Not Attained" content={DivergingBarLabel} />
              </Bar>
              <Bar dataKey="Attained" stackId="laempl" fill="#4EAE4A">
                <LabelList dataKey="Attained" content={DivergingBarLabel} />
              </Bar>
            </RechartsBarChart>
          </ResponsiveContainer>
        )}
      </div>
      <ChartLegend items={[
        { label: "Not Attained", color: "#ef4444" },
        { label: "Attained",     color: "#4EAE4A" },
      ]} />
      {noDataSections.length > 0 && <NoDataSectionsList sections={noDataSections} />}
    </div>
  );
}

// Two-line SVG tick for mobile — splits "Highly Proficient" into two rows
// so no rotation is needed and labels never clip past the SVG boundary.
function TwoLineTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
}) {
  const words = (payload?.value ?? "").split(" ");
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text textAnchor="middle" fontSize={10} fill="#6B7280">
        {words.map((word, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 4 : "1.3em"}>
            {word}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function NoDataSectionsList({ sections }: { sections: string[] }) {
  if (sections.length === 0) return null;
  const formatted =
    sections.length === 1
      ? sections[0]
      : sections.length === 2
        ? `${sections[0]} and ${sections[1]}`
        : `${sections.slice(0, -1).join(", ")}, and ${sections[sections.length - 1]}`;
  return (
    <p style={{ fontSize: 14, color: "#808898", marginTop: 4 }}>
      <strong>No data:</strong> {formatted}
    </p>
  );
}

function ChartEmpty() {
  return (
    <div className="flex items-center justify-center h-50">
      <Text size="sm" c="dimmed">
        No data available.
      </Text>
    </div>
  );
}

function ColorDot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        backgroundColor: color,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}
