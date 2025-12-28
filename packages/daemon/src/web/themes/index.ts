/**
 * Theme Registry
 *
 * Single source of truth for all available themes.
 * To add a new theme:
 * 1. Create a CSS file in this directory (e.g., dracula.css)
 * 2. Add an entry to the THEMES array below
 * That's it! The theme will automatically appear in the UI.
 */

export interface ThemeDefinition {
  /** Unique identifier (must match CSS class name) */
  id: string;
  /** Display name shown in UI */
  name: string;
  /** Whether this is a dark theme (for Tailwind dark: utilities) */
  isDark: boolean;
  /** Optional description */
  description?: string;
}

/**
 * Available themes - add new themes here
 */
export const THEMES: ThemeDefinition[] = [
  // Built-in themes
  {
    id: "light",
    name: "Light",
    isDark: false,
    description: "Default light theme",
  },
  {
    id: "dark",
    name: "Dark",
    isDark: true,
    description: "Default dark theme",
  },

  // Solarized themes
  {
    id: "solarized-light",
    name: "Solarized Light",
    isDark: false,
    description: "Precision colors for machines and people",
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    isDark: true,
    description: "Precision colors for machines and people",
  },

  // Add more themes here:
  // {
  //   id: "dracula",
  //   name: "Dracula",
  //   isDark: true,
  //   description: "A dark theme for vampires",
  // },
];

/**
 * Special "system" option - follows OS preference
 */
export const SYSTEM_THEME = {
  id: "system",
  name: "System",
  description: "Follow system preference",
};

/**
 * Get all theme IDs (for schema validation)
 */
export const getThemeIds = () => THEMES.map((t) => t.id);

/**
 * Get all dark theme IDs (for Tailwind dark variant)
 */
export const getDarkThemeIds = () => THEMES.filter((t) => t.isDark).map((t) => t.id);

/**
 * Get theme by ID
 */
export const getTheme = (id: string) => THEMES.find((t) => t.id === id);

/**
 * Get all themes for UI dropdown
 */
export const getThemeOptions = () => [...THEMES, SYSTEM_THEME];

/**
 * Default theme
 */
export const DEFAULT_THEME = "solarized-dark";
