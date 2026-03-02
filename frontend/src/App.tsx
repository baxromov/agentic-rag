/**
 * Main App component - Corporate Admin Panel with Routing
 */

import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAppStore } from "./store/appStore";
import { useAuthStore } from "./store/authStore";
import { useSessionStore } from "./store/sessionStore";
import { Sidebar } from "./components/layout/Sidebar";
import { Dashboard } from "./components/dashboard/Dashboard";
import { ChatContainer } from "./components/chat/ChatContainer";
import { KnowledgeBaseDrive } from "./components/knowledge/KnowledgeBaseDrive";
import { Analytics } from "./components/analytics/Analytics";
import { SettingsPage } from "./components/settings/SettingsPage";
import { UploadToast } from "./components/common/UploadToast";
import { LoginPage } from "./components/auth/LoginPage";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { AdminRoute } from "./components/auth/AdminRoute";
import { UserManagement } from "./components/admin/UserManagement";
import { AdminSettings } from "./components/admin/AdminSettings";
import { SystemHealth } from "./components/admin/SystemHealth";
import { FeedbackList } from "./components/admin/FeedbackList";

function AppContent() {
  const { loadSettings } = useAppStore();
  const { fetchSessions } = useSessionStore();

  // Load settings and sessions on mount
  useEffect(() => {
    loadSettings();
    fetchSessions();
  }, [loadSettings, fetchSessions]);

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Left Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        <Routes>
          {/* Admin-only routes */}
          <Route
            path="/"
            element={
              <AdminRoute>
                <Dashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <AdminRoute>
                <Analytics />
              </AdminRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <AdminRoute>
                <SettingsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <AdminRoute>
                <UserManagement />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <AdminRoute>
                <AdminSettings />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/feedbacks"
            element={
              <AdminRoute>
                <FeedbackList />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/health"
            element={
              <AdminRoute>
                <SystemHealth />
              </AdminRoute>
            }
          />

          {/* Authenticated user routes */}
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <ChatContainer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/knowledge"
            element={
              <ProtectedRoute>
                <KnowledgeBaseDrive />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<DefaultRedirect />} />
        </Routes>
      </div>

      {/* Global Upload Toast */}
      <UploadToast />
    </div>
  );
}

function DefaultRedirect() {
  const { user, isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={user?.role === "admin" ? "/" : "/chat"} replace />;
}

function App() {
  const { loadFromStorage, isLoading } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <div className="w-12 h-12 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPageWrapper />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppContent />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

function LoginPageWrapper() {
  const { isAuthenticated, user } = useAuthStore();
  if (isAuthenticated) {
    return <Navigate to={user?.role === "admin" ? "/" : "/chat"} replace />;
  }
  return <LoginPage />;
}

export default App;
