/**
 * Expertise level selector
 */

import { RadioGroup } from '@headlessui/react';
import { useAppStore } from '../../store/appStore';
import type { ExpertiseLevel } from '../../types/settings';

const EXPERTISE_LEVELS: { value: ExpertiseLevel; label: string; description: string }[] = [
  {
    value: 'beginner',
    label: 'Beginner',
    description: 'Simplified explanations with basic terminology',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description: 'Balanced detail with some technical terms',
  },
  {
    value: 'expert',
    label: 'Expert',
    description: 'Detailed technical explanations',
  },
  {
    value: 'general',
    label: 'General',
    description: 'Adaptive based on query complexity',
  },
];

export const ExpertiseSelector: React.FC = () => {
  const { settings, updateSettings } = useAppStore();

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
        Expertise Level
      </label>
      <RadioGroup
        value={settings.expertise_level}
        onChange={(value) => updateSettings({ expertise_level: value })}
      >
        <div className="space-y-2">
          {EXPERTISE_LEVELS.map((level) => (
            <RadioGroup.Option
              key={level.value}
              value={level.value}
              className={({ checked }) =>
                `relative flex cursor-pointer rounded-lg px-4 py-3 border ${
                  checked
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500'
                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                } focus:outline-none transition-colors`
              }
            >
              {({ checked }) => (
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center">
                    <div className="text-sm">
                      <RadioGroup.Label
                        as="p"
                        className={`font-medium ${
                          checked
                            ? 'text-blue-900 dark:text-blue-100'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {level.label}
                      </RadioGroup.Label>
                      <RadioGroup.Description
                        as="span"
                        className={`inline ${
                          checked
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {level.description}
                      </RadioGroup.Description>
                    </div>
                  </div>
                  {checked && (
                    <div className="shrink-0 text-blue-600 dark:text-blue-400">
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <circle cx="10" cy="10" r="4" />
                      </svg>
                    </div>
                  )}
                </div>
              )}
            </RadioGroup.Option>
          ))}
        </div>
      </RadioGroup>
    </div>
  );
};
