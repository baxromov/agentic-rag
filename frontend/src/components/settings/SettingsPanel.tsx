/**
 * Settings panel with slide-out using Headless UI
 */

import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useAppStore } from '../../store/appStore';
import { LanguageSelector } from './LanguageSelector';
import { ExpertiseSelector } from './ExpertiseSelector';
import { ResponseStyleSelector } from './ResponseStyleSelector';
import { CitationToggle } from './CitationToggle';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
  const { clearMessages } = useAppStore();

  const handleClearHistory = () => {
    if (confirm('Are you sure you want to clear all messages? This cannot be undone.')) {
      clearMessages();
    }
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-in-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in-out duration-300"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-900/75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              {/* Sliding panel */}
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-300"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-300"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-md">
                  <div className="flex h-full flex-col overflow-y-scroll bg-white dark:bg-slate-900 shadow-xl">
                    {/* Header */}
                    <div className="px-6 py-6 border-b border-slate-200 dark:border-slate-700">
                      <div className="flex items-start justify-between">
                        <Dialog.Title className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                          Settings
                        </Dialog.Title>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                          onClick={onClose}
                        >
                          <span className="sr-only">Close panel</span>
                          <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 px-6 py-6 space-y-6">
                      <div>
                        <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-3">
                          Personalization
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                          Customize how the AI responds to your queries
                        </p>

                        <div className="space-y-4">
                          <LanguageSelector />
                          <ExpertiseSelector />
                          <ResponseStyleSelector />
                          <CitationToggle />
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="border-t border-slate-200 dark:border-slate-700" />

                      {/* Actions */}
                      <div>
                        <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-3">
                          Actions
                        </h3>
                        <button
                          onClick={handleClearHistory}
                          className="w-full px-4 py-2 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                        >
                          Clear Chat History
                        </button>
                      </div>

                      {/* Info */}
                      <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Settings are saved to your browser and will persist across sessions.
                        </p>
                      </div>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
};
