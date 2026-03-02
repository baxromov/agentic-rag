import React, { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ChatBubbleLeftRightIcon,
  CircleStackIcon,
  Cog6ToothIcon,
  HomeIcon,
  DocumentTextIcon,
  ChartBarIcon,
  UsersIcon,
  WrenchScrewdriverIcon,
  HeartIcon,
  HandThumbUpIcon,
  ArrowRightStartOnRectangleIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { useAuthStore } from "../../store/authStore";
import { useSessionStore } from "../../store/sessionStore";
import { SessionList } from "../chat/SessionList";

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const {
    sessions,
    activeSessionId,
    fetchSessions,
    selectSession,
    deleteSession,
  } = useSessionStore();

  const isAdmin = user?.role === "admin";
  const isOnChat = location.pathname === "/chat";

  // Fetch sessions on mount and when navigating to chat
  useEffect(() => {
    if (isOnChat) {
      fetchSessions();
    }
  }, [isOnChat, fetchSessions]);

  const menuItems = [
    ...(isAdmin
      ? [
          { id: "home" as const, label: "Dashboard", icon: HomeIcon, path: "/" },
        ]
      : []),
    {
      id: "chat" as const,
      label: "HR Assistant",
      icon: ChatBubbleLeftRightIcon,
      path: "/chat",
    },
    {
      id: "knowledge" as const,
      label: "Knowledge Base",
      icon: CircleStackIcon,
      path: "/knowledge",
    },
    ...(isAdmin
      ? [
          {
            id: "analytics" as const,
            label: "Analytics",
            icon: ChartBarIcon,
            path: "/analytics",
          },
          {
            id: "settings" as const,
            label: "Settings",
            icon: Cog6ToothIcon,
            path: "/settings",
          },
        ]
      : []),
  ];

  const adminItems = isAdmin
    ? [
        {
          id: "users" as const,
          label: "User Management",
          icon: UsersIcon,
          path: "/admin/users",
        },
        {
          id: "feedbacks" as const,
          label: "Feedbacks",
          icon: HandThumbUpIcon,
          path: "/admin/feedbacks",
        },
        {
          id: "admin-settings" as const,
          label: "System Config",
          icon: WrenchScrewdriverIcon,
          path: "/admin/settings",
        },
        {
          id: "health" as const,
          label: "System Health",
          icon: HeartIcon,
          path: "/admin/health",
        },
      ]
    : [];

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const handleNewChat = () => {
    selectSession(null);
    // Force re-render by navigating
    if (!isOnChat) navigate("/chat");
  };

  const handleSelectSession = (id: string) => {
    selectSession(id);
    if (!isOnChat) navigate("/chat");
  };

  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.username?.[0]?.toUpperCase() || "U";

  return (
    <div className="w-64 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 h-screen flex flex-col shadow-2xl">
      {/* Company Logo/Brand */}
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
            <DocumentTextIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg">HR Assistant</h1>
            <p className="text-slate-400 text-xs">Ipoteka Bank</p>
          </div>
        </div>
      </div>

      {/* New Chat button + Session List (only on /chat) */}
      {isOnChat && (
        <div className="border-b border-slate-700">
          <div className="px-3 pt-4 pb-2">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl transition-all text-sm font-medium shadow-lg shadow-blue-500/20"
            >
              <PlusIcon className="w-4 h-4" />
              New Chat
            </button>
          </div>
          <div className="max-h-[40vh] overflow-y-auto px-1 pb-3 scrollbar-thin scrollbar-thumb-slate-700">
            <SessionList
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelect={handleSelectSession}
              onDelete={deleteSession}
            />
          </div>
        </div>
      )}

      {/* Navigation Menu */}
      <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.id}
              to={item.path}
              className={`
                w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                ${
                  isActive
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/50"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }
              `}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
              {isActive && (
                <div className="ml-auto w-2 h-2 bg-white rounded-full animate-pulse"></div>
              )}
            </Link>
          );
        })}

        {/* Admin Section */}
        {adminItems.length > 0 && (
          <>
            <div className="pt-4 pb-2 px-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Administration
              </p>
            </div>
            {adminItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <Link
                  key={item.id}
                  to={item.path}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                    ${
                      isActive
                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/50"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                  {isActive && (
                    <div className="ml-auto w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  )}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User Info */}
      <div className="p-4 border-t border-slate-700">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-9 h-9 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">
              {user?.full_name || user?.username || "User"}
            </p>
            <p className="text-slate-400 text-xs capitalize">
              {user?.role || "user"}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            title="Sign out"
          >
            <ArrowRightStartOnRectangleIcon className="w-5 h-5 text-slate-400 hover:text-red-400" />
          </button>
        </div>
      </div>
    </div>
  );
};
