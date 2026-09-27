const SVG_NS = 'http://www.w3.org/2000/svg';

const path = (d) => ['path', { d }];
const circle = (cx, cy, r) => ['circle', { cx, cy, r }];
const rect = (x, y, width, height, rx) => ['rect', { x, y, width, height, rx }];

const SHAPES = {
  key: [path('M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4')],
  note: [path('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'), path('M14 2v6h6'), path('M16 13H8'), path('M16 17H8'), path('M10 9H8')],
  shield: [path('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z')],
  shieldCheck: [path('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'), path('M9 12l2 2 4-4')],
  zap: [path('M13 2L3 14h9l-1 8 10-12h-9l1-8z')],
  star: [path('M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z')],
  lock: [rect(3, 11, 18, 11, 2), path('M7 11V7a5 5 0 0 1 10 0v4')],
  search: [circle(11, 11, 8), path('M21 21l-4.35-4.35')],
  plus: [path('M12 5v14M5 12h14')],
  copy: [rect(9, 9, 13, 13, 2), path('M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1')],
  eye: [path('M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'), circle(12, 12, 3)],
  eyeOff: [path('M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24'), path('M1 1l22 22')],
  external: [path('M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'), path('M15 3h6v6'), path('M10 14L21 3')],
  trash: [path('M3 6h18'), path('M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2')],
  edit: [path('M12 20h9'), path('M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z')],
  folder: [path('M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z')],
  settings: [path('M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6')],
  x: [path('M18 6L6 18M6 6l12 12')],
  chevronDown: [path('M6 9l6 6 6-6')],
  alert: [path('M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'), path('M12 9v4'), path('M12 17h.01')],
  repeat: [path('M17 1l4 4-4 4'), path('M3 11V9a4 4 0 0 1 4-4h14'), path('M7 23l-4-4 4-4'), path('M21 13v2a4 4 0 0 1-4 4H3')],
  clock: [circle(12, 12, 10), path('M12 6v6l4 2')],
  check: [path('M20 6L9 17l-5-5')],
  user: [path('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'), circle(12, 7, 4)],
  refresh: [path('M23 4v6h-6'), path('M1 20v-6h6'), path('M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15')],
  download: [path('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'), path('M7 10l5 5 5-5'), path('M12 15V3')],
  tag: [path('M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z'), path('M7 7h.01')],
  info: [circle(12, 12, 10), path('M12 16v-4'), path('M12 8h.01')],
};

export function icon(name, size = 18, filled = false) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attributes = {
    viewBox: '0 0 24 24', width: size, height: size, fill: filled ? 'currentColor' : 'none', stroke: 'currentColor',
    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
  };
  for (const [key, value] of Object.entries(attributes)) svg.setAttribute(key, value);
  for (const [tag, shapeAttributes] of SHAPES[name] ?? []) {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(shapeAttributes)) element.setAttribute(key, value);
    svg.append(element);
  }
  return svg;
}
