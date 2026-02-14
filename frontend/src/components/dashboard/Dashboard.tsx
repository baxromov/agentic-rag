import React, { useEffect, useState } from 'react';
import {
  CircleStackIcon,
  DocumentTextIcon,
  ServerIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';

interface DashboardStats {
  total_documents: number;
  total_chunks: number;
  total_size: number;
}

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('http://localhost:8000/documents/knowledge-base');
        const data = await response.json();
        setStats({
          total_documents: data.total_documents,
          total_chunks: data.total_chunks,
          total_size: data.total_size,
        });
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const statCards = [
    {
      title: 'Total Documents',
      value: stats?.total_documents || 0,
      icon: DocumentTextIcon,
      gradient: 'from-blue-500 to-blue-600',
      bgGradient: 'from-blue-50 to-blue-100',
      change: '+12%',
    },
    {
      title: 'Knowledge Chunks',
      value: stats?.total_chunks || 0,
      icon: ServerIcon,
      gradient: 'from-purple-500 to-purple-600',
      bgGradient: 'from-purple-50 to-purple-100',
      change: '+8%',
    },
    {
      title: 'Storage Used',
      value: stats ? formatFileSize(stats.total_size) : '0 KB',
      icon: CircleStackIcon,
      gradient: 'from-green-500 to-green-600',
      bgGradient: 'from-green-50 to-green-100',
      change: '+5%',
    },
    {
      title: 'Active Sessions',
      value: '24',
      icon: ChatBubbleLeftRightIcon,
      gradient: 'from-orange-500 to-orange-600',
      bgGradient: 'from-orange-50 to-orange-100',
      change: '+15%',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-200 rounded-full animate-spin border-t-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Dashboard</h1>
          <p className="text-slate-600">Welcome back! Here's what's happening with your RAG system.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <div
                key={idx}
                className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden hover:shadow-xl transition-shadow"
              >
                <div className={`bg-gradient-to-r ${card.bgGradient} p-6`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 bg-gradient-to-br ${card.gradient} rounded-xl flex items-center justify-center shadow-lg`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex items-center gap-1 text-green-600 text-sm font-semibold">
                      <ArrowTrendingUpIcon className="w-4 h-4" />
                      {card.change}
                    </div>
                  </div>
                  <div>
                    <p className="text-slate-600 text-sm font-medium mb-1">{card.title}</p>
                    <p className="text-3xl font-bold text-slate-900">{card.value}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <button className="w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all shadow-md">
                <DocumentTextIcon className="w-5 h-5" />
                <span className="font-medium">Upload New Document</span>
              </button>
              <button className="w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all shadow-md">
                <ChatBubbleLeftRightIcon className="w-5 h-5" />
                <span className="font-medium">Start New Chat</span>
              </button>
              <button className="w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 transition-all shadow-md">
                <ServerIcon className="w-5 h-5" />
                <span className="font-medium">View Analytics</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Recent Activity</h2>
            <div className="space-y-4">
              {[
                { action: 'Document uploaded', file: 'report.pdf', time: '2 minutes ago' },
                { action: 'Chat session started', file: 'User query', time: '15 minutes ago' },
                { action: 'Document deleted', file: 'old_file.docx', time: '1 hour ago' },
                { action: 'System updated', file: 'Version 2.0', time: '3 hours ago' },
              ].map((activity, idx) => (
                <div key={idx} className="flex items-start gap-3 pb-3 border-b border-slate-100 last:border-0">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                  <div className="flex-1">
                    <p className="text-slate-900 font-medium text-sm">{activity.action}</p>
                    <p className="text-slate-500 text-xs">{activity.file}</p>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400 text-xs">
                    <ClockIcon className="w-3 h-3" />
                    {activity.time}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">System Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <div>
                <p className="text-sm font-medium text-slate-900">Vector Database</p>
                <p className="text-xs text-slate-500">Online</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <div>
                <p className="text-sm font-medium text-slate-900">LLM Service</p>
                <p className="text-xs text-slate-500">Operational</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <div>
                <p className="text-sm font-medium text-slate-900">Storage</p>
                <p className="text-xs text-slate-500">Available</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
