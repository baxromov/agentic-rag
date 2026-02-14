/**
 * Main App component - Corporate Admin Panel with Routing
 */

import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAppStore } from "./store/appStore";
import { Sidebar } from "./components/layout/Sidebar";
import { Dashboard } from "./components/dashboard/Dashboard";
import { ChatContainer } from "./components/chat/ChatContainer";
import { KnowledgeBaseDrive } from "./components/knowledge/KnowledgeBaseDrive";
import { Analytics } from "./components/analytics/Analytics";
import { SettingsPage } from "./components/settings/SettingsPage";
import { SettingsPanel } from "./components/settings/SettingsPanel";

function AppContent() {
  const { loadSettings } = useAppStore();
  const [showSettings, setShowSettings] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return (
    <div className="flex h-screen bg-slate-100">
      {/* Left Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route
            path="/chat"
            element={
              <ChatContainer onOpenSettings={() => setShowSettings(true)} />
            }
          />
          <Route path="/knowledge" element={<KnowledgeBaseDrive />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {/* Settings Modal (for Chat settings) */}
      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
