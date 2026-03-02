import React, { useEffect, useState } from "react";
import {
  Cog6ToothIcon,
  GlobeAltIcon,
  AcademicCapIcon,
  ChatBubbleBottomCenterTextIcon,
  DocumentCheckIcon,
} from "@heroicons/react/24/outline";
import { API_BASE_URL } from "../../config/api";
import { apiFetch } from "../../config/apiClient";

interface PersonalizationData {
  language_preference: string;
  expertise_level: string;
  response_style: string;
  enable_citations: boolean;
}

const LANGUAGES = [
  { value: "auto", label: "Auto-detect" },
  { value: "en", label: "English" },
  { value: "ru", label: "Русский (Russian)" },
  { value: "uz", label: "O'zbek (Uzbek)" },
];

const EXPERTISE_LEVELS = [
  { value: "general", label: "General", description: "Adaptive based on query complexity" },
  { value: "beginner", label: "Beginner", description: "Simplified explanations with basic terminology" },
  { value: "intermediate", label: "Intermediate", description: "Balanced detail with some technical terms" },
  { value: "expert", label: "Expert", description: "Detailed technical explanations" },
];

const RESPONSE_STYLES = [
  { value: "concise", label: "Concise", description: "Brief, to-the-point answers" },
  { value: "balanced", label: "Balanced", description: "Moderate detail and context" },
  { value: "detailed", label: "Detailed", description: "Comprehensive explanations" },
];

export const SettingsPage: React.FC = () => {
  const [data, setData] = useState<PersonalizationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/admin/settings`);
        if (res.ok) {
          const json = await res.json();
          setData(json.personalization);
        }
      } catch (err) {
        console.error("Failed to fetch settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await apiFetch(`${API_BASE_URL}/admin/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personalization: data }),
      });
      if (res.ok) setSaved(true);
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, value: unknown) => {
    setData((d) => (d ? { ...d, [key]: value } : d));
    setSaved(false);
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-950">
        <div className="w-12 h-12 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-slate-950">
      <div className="p-8 max-w-3xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
              <Cog6ToothIcon className="w-8 h-8 text-blue-400" />
              Settings
            </h1>
            <p className="text-slate-400 mt-1">
              Personalization settings apply to all users
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
          </button>
        </div>

        <div className="space-y-6">
          {/* Language Preference */}
          <section className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center">
                <GlobeAltIcon className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-100">Language Preference</h2>
                <p className="text-sm text-slate-400">Default response language for all users</p>
              </div>
            </div>
            <select
              value={data.language_preference}
              onChange={(e) => update("language_preference", e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-lg outline-none text-slate-200"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </section>

          {/* Expertise Level */}
          <section className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-purple-600/20 rounded-xl flex items-center justify-center">
                <AcademicCapIcon className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-100">Expertise Level</h2>
                <p className="text-sm text-slate-400">How technical AI responses should be</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {EXPERTISE_LEVELS.map((level) => (
                <button
                  key={level.value}
                  onClick={() => update("expertise_level", level.value)}
                  className={`text-left px-4 py-3 rounded-xl border transition-all ${
                    data.expertise_level === level.value
                      ? "bg-purple-600/15 border-purple-500 text-purple-100"
                      : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600"
                  }`}
                >
                  <p className="font-medium text-sm">{level.label}</p>
                  <p className={`text-xs mt-0.5 ${
                    data.expertise_level === level.value ? "text-purple-300" : "text-slate-500"
                  }`}>{level.description}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Response Style */}
          <section className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-emerald-600/20 rounded-xl flex items-center justify-center">
                <ChatBubbleBottomCenterTextIcon className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-100">Response Style</h2>
                <p className="text-sm text-slate-400">Level of detail in AI responses</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {RESPONSE_STYLES.map((style) => (
                <button
                  key={style.value}
                  onClick={() => update("response_style", style.value)}
                  className={`px-4 py-3 rounded-xl border text-center transition-all ${
                    data.response_style === style.value
                      ? "bg-emerald-600/15 border-emerald-500 text-emerald-100"
                      : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600"
                  }`}
                >
                  <p className="font-medium text-sm">{style.label}</p>
                  <p className={`text-xs mt-0.5 ${
                    data.response_style === style.value ? "text-emerald-300" : "text-slate-500"
                  }`}>{style.description}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Citations Toggle */}
          <section className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-600/20 rounded-xl flex items-center justify-center">
                  <DocumentCheckIcon className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">Source Citations</h2>
                  <p className="text-sm text-slate-400">Show source documents with answers</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.enable_citations}
                  onChange={(e) => update("enable_citations", e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
