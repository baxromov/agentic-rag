/**
 * Settings types for UI state management
 */

export type LanguagePreference = 'en' | 'ru' | 'uz' | 'auto';
export type ExpertiseLevel = 'beginner' | 'intermediate' | 'expert' | 'general';
export type ResponseStyle = 'concise' | 'detailed' | 'balanced';

export interface AppSettings {
  language_preference: LanguagePreference;
  expertise_level: ExpertiseLevel;
  response_style: ResponseStyle;
  enable_citations: boolean;
  max_response_length: number | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language_preference: 'auto',
  expertise_level: 'general',
  response_style: 'balanced',
  enable_citations: true,
  max_response_length: null,
};
