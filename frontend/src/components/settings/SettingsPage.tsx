import React from "react";
import {
  UserIcon,
  BellIcon,
  ShieldCheckIcon,
  GlobeAltIcon,
  CpuChipIcon,
} from "@heroicons/react/24/outline";

export const SettingsPage: React.FC = () => {
  return (
    <div className="h-full overflow-auto bg-slate-950">
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-100 mb-2">Settings</h1>
          <p className="text-slate-400">Manage your system preferences</p>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* General Settings */}
          <div className="bg-slate-900 rounded-2xl shadow-lg border border-slate-800 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center">
                <UserIcon className="w-6 h-6 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-100">
                General Settings
              </h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-800 text-slate-200 placeholder:text-slate-500"
                  placeholder="Your Company Name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Admin Email
                </label>
                <input
                  type="email"
                  className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-800 text-slate-200 placeholder:text-slate-500"
                  placeholder="admin@company.com"
                />
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-slate-900 rounded-2xl shadow-lg border border-slate-800 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-purple-600/20 rounded-xl flex items-center justify-center">
                <BellIcon className="w-6 h-6 text-purple-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-100">
                Notifications
              </h2>
            </div>
            <div className="space-y-4">
              {[
                { label: "Email notifications", checked: true },
                { label: "System alerts", checked: true },
                { label: "Usage reports", checked: false },
              ].map((item, idx) => (
                <label
                  key={idx}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    defaultChecked={item.checked}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 bg-slate-800 border-slate-600"
                  />
                  <span className="text-slate-300">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Security */}
          <div className="bg-slate-900 rounded-2xl shadow-lg border border-slate-800 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-green-600/20 rounded-xl flex items-center justify-center">
                <ShieldCheckIcon className="w-6 h-6 text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-100">Security</h2>
            </div>
            <div className="space-y-4">
              <button className="w-full px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors text-left font-medium border border-slate-700">
                Change Password
              </button>
              <button className="w-full px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors text-left font-medium border border-slate-700">
                Two-Factor Authentication
              </button>
            </div>
          </div>

          {/* Language */}
          <div className="bg-slate-900 rounded-2xl shadow-lg border border-slate-800 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-orange-600/20 rounded-xl flex items-center justify-center">
                <GlobeAltIcon className="w-6 h-6 text-orange-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-100">
                Language & Region
              </h2>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Interface Language
              </label>
              <select className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-800 text-slate-200">
                <option>English</option>
                <option>O'zbek</option>
                <option>Русский</option>
              </select>
            </div>
          </div>

          {/* System Info */}
          <div className="bg-slate-900 rounded-2xl shadow-lg border border-slate-800 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center">
                <CpuChipIcon className="w-6 h-6 text-slate-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-100">
                System Information
              </h2>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Version</span>
                <span className="font-medium text-slate-200">2.0.0</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Last Updated</span>
                <span className="font-medium text-slate-200">Feb 14, 2026</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-400">Status</span>
                <span className="font-medium text-green-400">Operational</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
