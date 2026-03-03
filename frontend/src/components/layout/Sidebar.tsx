import React from "react";
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
  ChevronLeftIcon,
  ChevronRightIcon,
  SunIcon,
  MoonIcon,
} from "@heroicons/react/24/outline";
import { useAuthStore } from "../../store/authStore";
import { useAppStore } from "../../store/appStore";

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme, sidebarCollapsed, toggleSidebar } = useAppStore();

  const isAdmin = user?.role === "admin";

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

  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.username?.[0]?.toUpperCase() || "U";

  return (
    <div
      className={`${sidebarCollapsed ? "w-16" : "w-64"} bg-gradient-to-b from-sidebar-from via-sidebar-via to-sidebar-to h-screen flex flex-col shadow-2xl border-r border-border-default transition-all duration-300`}
    >
      {/* Company Logo/Brand */}
      <div className={`${sidebarCollapsed ? "p-3" : "p-6"} border-b border-border-default`}>
        <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-3"}`}>
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
            <DocumentTextIcon className="w-6 h-6 text-white" />
          </div>
          {!sidebarCollapsed && (
            <div>
              <h1 className="text-text-primary font-bold text-lg">HR Assistant</h1>
              <p className="text-text-muted text-xs">Ipoteka Bank</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className={`flex-1 ${sidebarCollapsed ? "px-1" : "px-3"} py-6 space-y-1 overflow-y-auto`}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.id}
              to={item.path}
              title={sidebarCollapsed ? item.label : undefined}
              className={`
                w-full flex items-center ${sidebarCollapsed ? "justify-center px-2" : "gap-3 px-4"} py-3 rounded-xl transition-all duration-200
                ${
                  isActive
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/50"
                    : "text-text-secondary hover:bg-hover hover:text-text-primary"
                }
              `}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && <span className="font-medium">{item.label}</span>}
              {isActive && !sidebarCollapsed && (
                <div className="ml-auto w-2 h-2 bg-white rounded-full animate-pulse"></div>
              )}
            </Link>
          );
        })}

        {/* Admin Section */}
        {adminItems.length > 0 && (
          <>
            {!sidebarCollapsed && (
              <div className="pt-4 pb-2 px-4">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Administration
                </p>
              </div>
            )}
            {sidebarCollapsed && <div className="pt-2 border-t border-border-default mt-2" />}
            {adminItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <Link
                  key={item.id}
                  to={item.path}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={`
                    w-full flex items-center ${sidebarCollapsed ? "justify-center px-2" : "gap-3 px-4"} py-3 rounded-xl transition-all duration-200
                    ${
                      isActive
                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/50"
                        : "text-text-secondary hover:bg-hover hover:text-text-primary"
                    }
                  `}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!sidebarCollapsed && <span className="font-medium">{item.label}</span>}
                  {isActive && !sidebarCollapsed && (
                    <div className="ml-auto w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  )}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Bottom Controls */}
      <div className="border-t border-border-default">
        {/* Theme toggle + Collapse toggle */}
        <div className={`flex ${sidebarCollapsed ? "flex-col items-center gap-1 p-2" : "items-center justify-between px-4"} py-2`}>
          <button
            onClick={toggleTheme}
            className="p-2 hover:bg-hover rounded-lg transition-colors"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <SunIcon className="w-5 h-5 text-text-muted hover:text-yellow-400" />
            ) : (
              <MoonIcon className="w-5 h-5 text-text-muted hover:text-blue-400" />
            )}
          </button>
          <button
            onClick={toggleSidebar}
            className="p-2 hover:bg-hover rounded-lg transition-colors"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <ChevronRightIcon className="w-5 h-5 text-text-muted" />
            ) : (
              <ChevronLeftIcon className="w-5 h-5 text-text-muted" />
            )}
          </button>
        </div>

        {/* User Info */}
        <div className={`${sidebarCollapsed ? "p-2" : "p-4"} border-t border-border-default`}>
          <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-3 px-3"} py-2`}>
            <div className="w-9 h-9 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
              {initials}
            </div>
            {!sidebarCollapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary text-sm font-medium truncate">
                    {user?.full_name || user?.username || "User"}
                  </p>
                  <p className="text-text-muted text-xs capitalize">
                    {user?.department || user?.role || "user"}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 hover:bg-hover rounded-lg transition-colors"
                  title="Sign out"
                >
                  <ArrowRightStartOnRectangleIcon className="w-5 h-5 text-text-muted hover:text-red-400" />
                </button>
              </>
            )}
          </div>
          {sidebarCollapsed && (
            <button
              onClick={handleLogout}
              className="w-full flex justify-center p-2 hover:bg-hover rounded-lg transition-colors mt-1"
              title="Sign out"
            >
              <ArrowRightStartOnRectangleIcon className="w-5 h-5 text-text-muted hover:text-red-400" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
