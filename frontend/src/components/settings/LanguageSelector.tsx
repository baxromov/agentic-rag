/**
 * Language preference selector
 */

import { Listbox } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/24/solid';
import { useAppStore } from '../../store/appStore';
import type { LanguagePreference } from '../../types/settings';

const LANGUAGES: { value: LanguagePreference; label: string }[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский (Russian)' },
  { value: 'uz', label: 'O\'zbek (Uzbek)' },
];

export const LanguageSelector: React.FC = () => {
  const { settings, updateSettings } = useAppStore();

  const selectedLanguage = LANGUAGES.find(
    (lang) => lang.value === settings.language_preference
  ) || LANGUAGES[0];

  return (
    <div>
      <label className="block text-sm font-medium text-text-secondary mb-2">
        Language Preference
      </label>
      <Listbox
        value={selectedLanguage}
        onChange={(lang) => updateSettings({ language_preference: lang.value })}
      >
        <div className="relative">
          <Listbox.Button className="relative w-full cursor-pointer rounded-lg bg-input py-2 pl-3 pr-10 text-left border border-border-default focus:outline-none focus:ring-2 focus:ring-blue-500">
            <span className="block truncate text-text-primary">
              {selectedLanguage.label}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <ChevronUpDownIcon
                className="h-5 w-5 text-text-secondary"
                aria-hidden="true"
              />
            </span>
          </Listbox.Button>
          <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-input py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
            {LANGUAGES.map((lang) => (
              <Listbox.Option
                key={lang.value}
                value={lang}
                className={({ active }) =>
                  `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                    active
                      ? 'bg-blue-900/30 text-blue-200'
                      : 'text-text-primary'
                  }`
                }
              >
                {({ selected }) => (
                  <>
                    <span
                      className={`block truncate ${
                        selected ? 'font-medium' : 'font-normal'
                      }`}
                    >
                      {lang.label}
                    </span>
                    {selected && (
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-400">
                        <CheckIcon className="h-5 w-5" aria-hidden="true" />
                      </span>
                    )}
                  </>
                )}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </div>
      </Listbox>
    </div>
  );
};
