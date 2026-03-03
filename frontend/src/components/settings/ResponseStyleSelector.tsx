/**
 * Response style selector
 */

import { RadioGroup } from '@headlessui/react';
import { useAppStore } from '../../store/appStore';
import type { ResponseStyle } from '../../types/settings';

const RESPONSE_STYLES: { value: ResponseStyle; label: string; description: string }[] = [
  {
    value: 'concise',
    label: 'Concise',
    description: 'Brief, to-the-point answers',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    description: 'Moderate detail and context',
  },
  {
    value: 'detailed',
    label: 'Detailed',
    description: 'Comprehensive explanations',
  },
];

export const ResponseStyleSelector: React.FC = () => {
  const { settings, updateSettings } = useAppStore();

  return (
    <div>
      <label className="block text-sm font-medium text-text-secondary mb-2">
        Response Style
      </label>
      <RadioGroup
        value={settings.response_style}
        onChange={(value) => updateSettings({ response_style: value })}
      >
        <div className="grid grid-cols-3 gap-2">
          {RESPONSE_STYLES.map((style) => (
            <RadioGroup.Option
              key={style.value}
              value={style.value}
              className={({ checked }) =>
                `cursor-pointer rounded-lg px-3 py-2 text-center border ${
                  checked
                    ? 'bg-blue-900/20 border-blue-500 text-blue-200'
                    : 'bg-input border-border-default text-text-primary hover:bg-hover'
                } focus:outline-none transition-colors`
              }
            >
              {({ checked }) => (
                <div>
                  <RadioGroup.Label
                    as="p"
                    className={`text-sm font-medium ${
                      checked
                        ? 'text-blue-200'
                        : 'text-text-primary'
                    }`}
                  >
                    {style.label}
                  </RadioGroup.Label>
                  <RadioGroup.Description
                    as="span"
                    className={`text-xs ${
                      checked
                        ? 'text-blue-300'
                        : 'text-text-muted'
                    }`}
                  >
                    {style.description}
                  </RadioGroup.Description>
                </div>
              )}
            </RadioGroup.Option>
          ))}
        </div>
      </RadioGroup>
    </div>
  );
};
