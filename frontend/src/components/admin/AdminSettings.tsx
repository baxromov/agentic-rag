import React, { useEffect, useState } from "react";
import {
  WrenchScrewdriverIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { API_BASE_URL } from "../../config/api";
import { apiFetch } from "../../config/apiClient";

interface AdminSettingsData {
  langfuse: {
    enabled: boolean;
    host: string;
    public_key: string;
    secret_key: string;
  };
  llm: {
    provider: string;
    claude_model: string;
    openai_model: string;
    ollama_model: string;
  };
  rag: {
    chunk_size: number;
    chunk_overlap: number;
    retrieval_top_k: number;
    rerank_top_k: number;
    rrf_k: number;
  };
}

export const AdminSettings: React.FC = () => {
  const [settings, setSettings] = useState<AdminSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/admin/settings`);
        if (res.ok) setSettings(await res.json());
      } catch (err) {
        console.error("Failed to fetch settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setSaved(false);

    try {
      const res = await apiFetch(`${API_BASE_URL}/admin/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) setSaved(true);
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setSaving(false);
    }
  };

  const updateLangfuse = (key: string, value: unknown) => {
    setSettings((s) =>
      s ? { ...s, langfuse: { ...s.langfuse, [key]: value } } : s,
    );
    setSaved(false);
  };

  const updateLLM = (key: string, value: string) => {
    setSettings((s) => (s ? { ...s, llm: { ...s.llm, [key]: value } } : s));
    setSaved(false);
  };

  const updateRAG = (key: string, value: number) => {
    setSettings((s) => (s ? { ...s, rag: { ...s.rag, [key]: value } } : s));
    setSaved(false);
  };

  if (loading || !settings) {
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
              <WrenchScrewdriverIcon className="w-8 h-8 text-blue-400" />
              System Configuration
            </h1>
            <p className="text-text-secondary mt-1">
              Manage application settings and integrations
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
          </button>
        </div>

        {/* Warning banner */}
        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3">
          <ExclamationTriangleIcon className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-200 font-medium text-sm">
              Changes may require service restart
            </p>
            <p className="text-amber-400/70 text-xs mt-1">
              LLM provider and model changes take effect after rebuilding
              containers.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Langfuse Section */}
          <section className="bg-card rounded-2xl border border-border-default p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              Langfuse (Observability)
            </h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.langfuse.enabled}
                    onChange={(e) =>
                      updateLangfuse("enabled", e.target.checked)
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-hover rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
                <span className="text-sm text-text-secondary">Enable Langfuse</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Host
                </label>
                <input
                  type="text"
                  value={settings.langfuse.host}
                  onChange={(e) => updateLangfuse("host", e.target.value)}
                  className="w-full px-4 py-2.5 bg-input border border-border-default focus:border-blue-500 rounded-lg outline-none text-text-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Public Key
                </label>
                <input
                  type="text"
                  value={settings.langfuse.public_key}
                  onChange={(e) =>
                    updateLangfuse("public_key", e.target.value)
                  }
                  placeholder="pk-lf-..."
                  className="w-full px-4 py-2.5 bg-input border border-border-default focus:border-blue-500 rounded-lg outline-none text-text-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Secret Key
                </label>
                <input
                  type="password"
                  value={settings.langfuse.secret_key}
                  onChange={(e) =>
                    updateLangfuse("secret_key", e.target.value)
                  }
                  placeholder="sk-lf-..."
                  className="w-full px-4 py-2.5 bg-input border border-border-default focus:border-blue-500 rounded-lg outline-none text-text-primary"
                />
              </div>
            </div>
          </section>

          {/* LLM Section */}
          <section className="bg-card rounded-2xl border border-border-default p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              LLM Configuration
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Provider
                </label>
                <select
                  value={settings.llm.provider}
                  onChange={(e) => updateLLM("provider", e.target.value)}
                  className="w-full px-4 py-2.5 bg-input border border-border-default focus:border-blue-500 rounded-lg outline-none text-text-primary"
                >
                  <option value="ollama">Ollama</option>
                  <option value="claude">Claude</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Claude Model
                  </label>
                  <input
                    type="text"
                    value={settings.llm.claude_model}
                    onChange={(e) =>
                      updateLLM("claude_model", e.target.value)
                    }
                    className="w-full px-4 py-2.5 bg-input border border-border-default focus:border-blue-500 rounded-lg outline-none text-text-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    OpenAI Model
                  </label>
                  <input
                    type="text"
                    value={settings.llm.openai_model}
                    onChange={(e) =>
                      updateLLM("openai_model", e.target.value)
                    }
                    className="w-full px-4 py-2.5 bg-input border border-border-default focus:border-blue-500 rounded-lg outline-none text-text-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Ollama Model
                  </label>
                  <input
                    type="text"
                    value={settings.llm.ollama_model}
                    onChange={(e) =>
                      updateLLM("ollama_model", e.target.value)
                    }
                    className="w-full px-4 py-2.5 bg-input border border-border-default focus:border-blue-500 rounded-lg outline-none text-text-primary"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* RAG Section */}
          <section className="bg-card rounded-2xl border border-border-default p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              RAG Parameters
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  key: "chunk_size",
                  label: "Chunk Size",
                  value: settings.rag.chunk_size,
                },
                {
                  key: "chunk_overlap",
                  label: "Chunk Overlap",
                  value: settings.rag.chunk_overlap,
                },
                {
                  key: "retrieval_top_k",
                  label: "Retrieval Top K",
                  value: settings.rag.retrieval_top_k,
                },
                {
                  key: "rerank_top_k",
                  label: "Rerank Top K",
                  value: settings.rag.rerank_top_k,
                },
                {
                  key: "rrf_k",
                  label: "RRF K",
                  value: settings.rag.rrf_k,
                },
              ].map((param) => (
                <div key={param.key}>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    {param.label}
                  </label>
                  <input
                    type="number"
                    value={param.value}
                    onChange={(e) =>
                      updateRAG(param.key, parseInt(e.target.value) || 0)
                    }
                    className="w-full px-4 py-2.5 bg-input border border-border-default focus:border-blue-500 rounded-lg outline-none text-text-primary"
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
