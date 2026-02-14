import React from 'react';
import {
  ChartBarIcon,
  ClockIcon,
  UserGroupIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

export const Analytics: React.FC = () => {
  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Analytics</h1>
          <p className="text-slate-600">System usage and performance metrics</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Placeholder for future charts */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 h-96">
            <div className="flex items-center gap-3 mb-4">
              <ChartBarIcon className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-bold text-slate-900">Query Volume</h2>
            </div>
            <div className="flex items-center justify-center h-64 text-slate-400">
              <p>Chart will be displayed here</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 h-96">
            <div className="flex items-center gap-3 mb-4">
              <ClockIcon className="w-6 h-6 text-purple-600" />
              <h2 className="text-xl font-bold text-slate-900">Response Time</h2>
            </div>
            <div className="flex items-center justify-center h-64 text-slate-400">
              <p>Chart will be displayed here</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 h-96">
            <div className="flex items-center gap-3 mb-4">
              <UserGroupIcon className="w-6 h-6 text-green-600" />
              <h2 className="text-xl font-bold text-slate-900">User Activity</h2>
            </div>
            <div className="flex items-center justify-center h-64 text-slate-400">
              <p>Chart will be displayed here</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 h-96">
            <div className="flex items-center gap-3 mb-4">
              <DocumentTextIcon className="w-6 h-6 text-orange-600" />
              <h2 className="text-xl font-bold text-slate-900">Document Usage</h2>
            </div>
            <div className="flex items-center justify-center h-64 text-slate-400">
              <p>Chart will be displayed here</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
