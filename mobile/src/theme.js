import { createContext, useContext } from 'react';

/* Mêmes jetons que la version Windows (direction « Calme ») : neutres presque monochromes,
   la couleur des calques sert à repérer. Blocs teintés, cours en cours en aplat plein. */
export const palettes = {
  light: {
    dark: false,
    bg: '#FAFAFA', surface: '#FFFFFF', surface2: '#F4F4F5', ink: '#18181B', muted: '#71717A', line: '#EAEAEC', grid: '#F1F1F3',
    accent: '#3A30FF', onAccent: '#FFFFFF', danger: '#E11D48',
    cat: { cours: '#4C8DF6', sae: '#9B7BEA', rendu: '#EF5B6E', eval: '#F0954A', stage: '#3DB39A', perso: '#DE6BB4' },
    mix: 0.09, mixPast: 0.04, onLive: '#FFFFFF', liveDepth: 0.12,
  },
  dark: {
    dark: true,
    bg: '#0E0E10', surface: '#17171A', surface2: '#1E1E22', ink: '#EDEDEF', muted: '#8B8B95', line: '#26262A', grid: '#1C1C20',
    accent: '#8C86FF', onAccent: '#0E0E10', danger: '#FB7185',
    cat: { cours: '#60A0FF', sae: '#AD90F5', rendu: '#FF7385', eval: '#FFA764', stage: '#4FCFB2', perso: '#EC84C7' },
    mix: 0.14, mixPast: 0.06, onLive: '#121214', liveDepth: 0,
  },
};

export const fonts = {
  displayThin: 'BricolageGrotesque_200ExtraLight',
  display: 'BricolageGrotesque_700Bold',
  displayHeavy: 'BricolageGrotesque_800ExtraBold',
  displaySemi: 'BricolageGrotesque_600SemiBold',
  body: 'Geist_400Regular',
  bodyMedium: 'Geist_500Medium',
  bodySemi: 'Geist_600SemiBold',
};

/** Mélange une couleur hex avec le fond, comme color-mix() côté web. */
export function tint(hex, amount, base) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(hex), [r2, g2, b2] = p(base);
  const m = (a, b) => Math.round(a * amount + b * (1 - amount)).toString(16).padStart(2, '0');
  return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`;
}

/** Couleur de texte lisible dérivée d'un calque (72 % calque, 28 % encre). */
export const catInk = (t, c) => tint(c, 0.72, t.ink);
/** Fond d'un bloc en cours : couleur pleine, un peu assombrie en clair. */
export const liveBg = (t, c) => (t.liveDepth ? tint(c, 1 - t.liveDepth, '#000000') : c);

export const ThemeContext = createContext(palettes.light);
export const useTheme = () => useContext(ThemeContext);
