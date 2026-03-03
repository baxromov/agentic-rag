import React, { useEffect, useState, useCallback } from "react";
import {
  HeartIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { API_BASE_URL } from "../../config/api";
import { apiFetch } from "../../config/apiClient";

interface ServiceHealth {
  status: string;
  error?: string;
}

interface HealthData {
  status: string;
  services: Record<string, ServiceHealth>;
}

const SERVICE_LABELS: Record<string, string> = {
  mongodb: "MongoDB",
  qdrant: "Qdrant (Vector DB)",
  minio: "MinIO (Storage)",
  redis: "Redis",
  model_server: "Model Server",
  langgraph: "LangGraph",
};

export const SystemHealth: React.FC = () => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/admin/system-health`);
      if (res.ok) {
        setHealth(await res.json());
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error("Failed to fetch health:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const healthyCount = health
    ? Object.values(health.services).filter((s) => s.status === "healthy")
        .length
    : 0;
  const totalCount = health ? Object.keys(health.services).length : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-page">
        <div className="w-12 h-12 border-4 border-border-default border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-page">
      <div className="p-8 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary flex items-center gap-3">
              <HeartIcon className="w-8 h-8 text-blue-400" />
              System Health
            </h1>
            <p className="text-text-secondary mt-1">
              Real-time status of all services
            </p>
          </div>
          <div className="flex items-center gap-4">
            {lastUpdated && (
              <p className="text-xs text-text-muted">
                Updated{" "}
                {lastUpdated.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </p>
            )}
            <button
              onClick={fetchHealth}
              className="flex items-center gap-2 px-4 py-2 bg-input hover:bg-hover text-text-secondary rounded-lg transition-colors"
            >
              <ArrowPathIcon className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Overall Status */}
        <div
          className={`mb-6 p-6 rounded-2xl border ${
            health?.status === "healthy"
              ? "bg-green-500/10 border-green-500/30"
              : "bg-red-500/10 border-red-500/30"
          }`}
        >
          <div className="flex items-center gap-4">
            {health?.status === "healthy" ? (
              <CheckCircleIcon className="w-10 h-10 text-green-400" />
            ) : (
              <XCircleIcon className="w-10 h-10 text-red-400" />
            )}
            <div>
              <p
                className={`text-xl font-bold ${
                  health?.status === "healthy"
                    ? "text-green-300"
                    : "text-red-300"
                }`}
              >
                {health?.status === "healthy"
                  ? "All Systems Operational"
                  : "System Degraded"}
              </p>
              <p className="text-sm text-text-secondary">
                {healthyCount}/{totalCount} services healthy
              </p>
            </div>
          </div>
        </div>

        {/* Service Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {health &&
            Object.entries(health.services).map(([key, service]) => {
              const isHealthy = service.status === "healthy";

              return (
                <div
                  key={key}
                  className="bg-card rounded-xl border border-border-default p-5 hover:border-border-default transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        {SERVICE_LABELS[key] || key}
                      </p>
                      {service.error && (
                        <p className="text-xs text-red-400 mt-1 break-all">
                          {service.error}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-3 h-3 rounded-full ${
                          isHealthy
                            ? "bg-green-400 animate-pulse"
                            : "bg-red-400"
                        }`}
                      />
                      <span
                        className={`text-xs font-medium ${
                          isHealthy ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {isHealthy ? "Healthy" : "Unhealthy"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Auto-refresh note */}
        <p className="text-xs text-text-muted text-center mt-6">
          Auto-refreshes every 30 seconds
        </p>
      </div>
    </div>
  );
};
