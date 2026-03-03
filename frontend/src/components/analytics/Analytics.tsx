import React, { useEffect, useState } from "react";
import {
  ChartBarIcon,
  ClockIcon,
  UserGroupIcon,
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
  HandThumbUpIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { API_BASE_URL } from "../../config/api";
import { apiFetch } from "../../config/apiClient";

interface AnalyticsData {
  summary: {
    total_sessions: number;
    sessions_in_period: number;
    total_users: number;
    total_feedback: number;
    positive_feedback: number;
    negative_feedback: number;
    total_documents: number;
    total_chunks: number;
  };
  query_volume: { date: string; sessions: number; messages: number }[];
  user_activity: { date: string; active_users: number }[];
  feedback_timeline: { date: string; positive: number; negative: number }[];
  top_users: { user: string; sessions: number; messages: number }[];
}

const COLORS = {
  blue: "#3b82f6",
  purple: "#a855f7",
  green: "#22c55e",
  orange: "#f97316",
  red: "#ef4444",
  cyan: "#06b6d4",
};

const PIE_COLORS = [COLORS.green, COLORS.red];

function formatDate(dateStr: string | number | React.ReactNode) {
  const d = new Date(String(dateStr));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const chartTooltipStyle = {
  contentStyle: {
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "8px",
    color: "#e2e8f0",
    fontSize: "13px",
  },
  labelStyle: { color: "#94a3b8" },
};

export const Analytics: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `${API_BASE_URL}/admin/analytics?days=${days}`
      );
      if (!res.ok) throw new Error("Failed to fetch analytics");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [days]);

  const feedbackPieData = data
    ? [
        { name: "Positive", value: data.summary.positive_feedback },
        { name: "Negative", value: data.summary.negative_feedback },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="h-full overflow-auto bg-page">
      <div className="p-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">
              Analytics
            </h1>
            <p className="text-text-secondary">
              System usage and performance metrics
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="bg-input text-text-primary border border-border-default rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button
              onClick={fetchAnalytics}
              disabled={loading}
              className="p-2 rounded-lg bg-input border border-border-default text-text-secondary hover:text-text-primary hover:bg-hover transition-colors disabled:opacity-50"
            >
              <ArrowPathIcon
                className={`w-5 h-5 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <SummaryCard
            icon={<ChatBubbleLeftRightIcon className="w-6 h-6 text-blue-400" />}
            label="Total Sessions"
            value={data?.summary.total_sessions ?? "-"}
            sub={`${data?.summary.sessions_in_period ?? 0} in period`}
          />
          <SummaryCard
            icon={<UserGroupIcon className="w-6 h-6 text-green-400" />}
            label="Total Users"
            value={data?.summary.total_users ?? "-"}
          />
          <SummaryCard
            icon={<HandThumbUpIcon className="w-6 h-6 text-purple-400" />}
            label="Feedback"
            value={data?.summary.total_feedback ?? "-"}
            sub={`${data?.summary.positive_feedback ?? 0} positive`}
          />
          <SummaryCard
            icon={<DocumentTextIcon className="w-6 h-6 text-orange-400" />}
            label="Documents"
            value={data?.summary.total_documents ?? "-"}
            sub={`${data?.summary.total_chunks ?? 0} chunks`}
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Query Volume */}
          <ChartCard
            icon={<ChartBarIcon className="w-6 h-6 text-blue-400" />}
            title="Query Volume"
            loading={loading}
          >
            {data && data.query_volume.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={data.query_volume}>
                  <defs>
                    <linearGradient
                      id="blueGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor={COLORS.blue}
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor={COLORS.blue}
                        stopOpacity={0}
                      />
                    </linearGradient>
                    <linearGradient
                      id="cyanGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor={COLORS.cyan}
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor={COLORS.cyan}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    stroke="#64748b"
                    fontSize={12}
                  />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip
                    {...chartTooltipStyle}
                    labelFormatter={formatDate}
                  />
                  <Area
                    type="monotone"
                    dataKey="sessions"
                    stroke={COLORS.blue}
                    fill="url(#blueGradient)"
                    strokeWidth={2}
                    name="Sessions"
                  />
                  <Area
                    type="monotone"
                    dataKey="messages"
                    stroke={COLORS.cyan}
                    fill="url(#cyanGradient)"
                    strokeWidth={2}
                    name="Messages"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </ChartCard>

          {/* User Activity */}
          <ChartCard
            icon={<UserGroupIcon className="w-6 h-6 text-green-400" />}
            title="User Activity"
            loading={loading}
          >
            {data && data.user_activity.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.user_activity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    stroke="#64748b"
                    fontSize={12}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={12}
                    allowDecimals={false}
                  />
                  <Tooltip
                    {...chartTooltipStyle}
                    labelFormatter={formatDate}
                  />
                  <Bar
                    dataKey="active_users"
                    fill={COLORS.green}
                    radius={[4, 4, 0, 0]}
                    name="Active Users"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </ChartCard>

          {/* Feedback Timeline */}
          <ChartCard
            icon={<HandThumbUpIcon className="w-6 h-6 text-purple-400" />}
            title="Feedback"
            loading={loading}
          >
            {data && data.feedback_timeline.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.feedback_timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    stroke="#64748b"
                    fontSize={12}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={12}
                    allowDecimals={false}
                  />
                  <Tooltip
                    {...chartTooltipStyle}
                    labelFormatter={formatDate}
                  />
                  <Bar
                    dataKey="positive"
                    fill={COLORS.green}
                    radius={[4, 4, 0, 0]}
                    name="Positive"
                    stackId="feedback"
                  />
                  <Bar
                    dataKey="negative"
                    fill={COLORS.red}
                    radius={[4, 4, 0, 0]}
                    name="Negative"
                    stackId="feedback"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : feedbackPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={feedbackPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {feedbackPieData.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index]} />
                    ))}
                  </Pie>
                  <Tooltip {...chartTooltipStyle} />
                  <Legend
                    wrapperStyle={{ color: "#94a3b8", fontSize: "13px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </ChartCard>

          {/* Top Users */}
          <ChartCard
            icon={<ClockIcon className="w-6 h-6 text-orange-400" />}
            title="Top Users"
            loading={loading}
          >
            {data && data.top_users.length > 0 ? (
              <div className="space-y-3 overflow-auto max-h-[280px] pr-2">
                {data.top_users.map((user, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 bg-input/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 flex items-center justify-center rounded-full bg-hover text-text-secondary text-xs font-bold">
                        {i + 1}
                      </span>
                      <span className="text-text-primary text-sm font-medium truncate max-w-[160px]">
                        {user.user}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-blue-400">
                        {user.sessions} sessions
                      </span>
                      <span className="text-text-secondary">
                        {user.messages} msgs
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState />
            )}
          </ChartCard>
        </div>
      </div>
    </div>
  );
};

function SummaryCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border-default p-5">
      <div className="flex items-center gap-3 mb-3">{icon}
        <span className="text-text-secondary text-sm">{label}</span>
      </div>
      <p className="text-2xl font-bold text-text-primary">{value}</p>
      {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
    </div>
  );
}

function ChartCard({
  icon,
  title,
  loading,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-2xl shadow-lg border border-border-default p-6">
      <div className="flex items-center gap-3 mb-4">
        {icon}
        <h2 className="text-xl font-bold text-text-primary">{title}</h2>
        {loading && (
          <div className="ml-auto w-4 h-4 border-2 border-border-default border-t-blue-400 rounded-full animate-spin" />
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-[280px] text-text-muted">
      <p>No data available for this period</p>
    </div>
  );
}
