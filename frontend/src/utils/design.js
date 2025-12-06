// Hero scaling constants used by home & course hero
export const HERO_START_SCALE = 0.7; // 30% smaller than full
export const HERO_END_SCALE = 0.54 * 1.05; // slightly larger than the original end scale (5% up from 0.54)

export const getSvgDesign = (title) => {
  const hash = title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const designs = [
    {
      // Standard Bold White (Netflix Generic)
      id: 'standard',
      fill: 'white',
      stroke: 'none',
      strokeWidth: '0',
      filter: 'drop-shadow(2px 2px 4px rgba(0,0,0,0.8))',
      fontFamily: '"Arial Black", Gadget, sans-serif',
    },
    {
      // Heavy Outline (white text with subtle outline)
      id: 'outline',
      fill: 'white',
      stroke: 'rgba(255,255,255,0.9)',
      strokeWidth: '1px',
      filter: 'drop-shadow(1px 1px 2px rgba(0,0,0,0.8))',
      fontFamily: 'Impact, Charcoal, sans-serif',
    },
    {
      // White Accent (was red)
      id: 'white-accent',
      fill: 'white',
      stroke: 'rgba(255,255,255,0.95)',
      strokeWidth: '1px',
      filter: 'drop-shadow(2px 2px 4px rgba(0,0,0,0.9))',
      fontFamily: '"Arial Black", sans-serif',
    },
  ];
  return designs[hash % designs.length];
};
