/**
 * Citation toggle switch
 */

import { Switch } from '@headlessui/react';
import { useAppStore } from '../../store/appStore';

export const CitationToggle: React.FC = () => {
  const { settings, updateSettings } = useAppStore();

  return (
    <div className="flex items-center justify-between">
      <div>
        <label className="block text-sm font-medium text-text-secondary">
          Show Source Citations
        </label>
        <p className="text-xs text-text-muted mt-1">
          Display source documents with answers
        </p>
      </div>
      <Switch
        checked={settings.enable_citations}
        onChange={(value) => updateSettings({ enable_citations: value })}
        className={`${
          settings.enable_citations
            ? 'bg-blue-600'
            : 'bg-hover'
        } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
      >
        <span className="sr-only">Enable citations</span>
        <span
          className={`${
            settings.enable_citations ? 'translate-x-6' : 'translate-x-1'
          } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
        />
      </Switch>
    </div>
  );
};
