// Theme registry. Each id corresponds to a `:root[data-theme="<id>"]`
// block of CSS custom properties in css/vibe-loops.css.

export interface Theme {
  id: string;
  label: string;
  dark: boolean;
}

export const THEMES: Theme[] = [
  // dark
  { id: 'midnight', label: 'Midnight', dark: true },
  { id: 'graphite', label: 'Graphite', dark: true },
  { id: 'abyss', label: 'Abyss', dark: true },
  { id: 'forest', label: 'Forest', dark: true },
  { id: 'ember', label: 'Ember', dark: true },
  { id: 'violet', label: 'Violet', dark: true },
  { id: 'oled', label: 'OLED', dark: true },
  { id: 'nordic', label: 'Nordic', dark: true },
  { id: 'mocha', label: 'Mocha', dark: true },
  { id: 'neon', label: 'Neon', dark: true },
  // light
  { id: 'daylight', label: 'Daylight', dark: false },
  { id: 'paper', label: 'Paper', dark: false },
  { id: 'mint', label: 'Mint', dark: false },
  { id: 'lavender', label: 'Lavender', dark: false },
  { id: 'sand', label: 'Sand', dark: false },
  { id: 'sky', label: 'Sky', dark: false },
  { id: 'rose', label: 'Rose', dark: false },
  { id: 'fog', label: 'Fog', dark: false },
  { id: 'solar', label: 'Solar', dark: false },
  { id: 'cream', label: 'Cream', dark: false },
];

export const DEFAULT_THEME = 'midnight';
const STORAGE_KEY = 'vibe-loops.theme';

export const loadTheme = (): string => {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    if (t && THEMES.some(th => th.id === t)) return t;
  } catch { /* storage unavailable */ }
  return DEFAULT_THEME;
};

export const applyTheme = (id: string): void => {
  document.documentElement.dataset.theme = id;
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* storage unavailable */ }
};
