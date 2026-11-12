/**
 * Lucide icon DOM runtime for the annotation harness.
 *
 * Icon data is derived from lucide-react v0.554.0 (ISC):
 * https://github.com/lucide-icons/lucide
 */
(() => {
  'use strict';

  const GLOBAL_KEY = '__gtmLucideIconsV1';
  if (globalThis[GLOBAL_KEY]) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    Volume2: [
      ['path', { d: 'M11 5 6 9H3v6h3l5 4V5Z' }],
      ['path', { d: 'M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14' }]
    ],
    VolumeX: [
      ['path', { d: 'M11 5 6 9H3v6h3l5 4V5Z' }],
      ['path', { d: 'm17 9 5 6m0-6-5 6' }]
    ],
    ChevronLeft: [
      ['path', { d: 'm15 18-6-6 6-6' }]
    ],
    ChevronRight: [
      ['path', { d: 'm9 18 6-6-6-6' }]
    ],
    ChevronUp: [
      ['path', { d: 'm18 15-6-6-6 6' }]
    ],
    ChevronDown: [
      ['path', { d: 'm6 9 6 6 6-6' }]
    ],
    Plus: [
      ['path', { d: 'M5 12h14' }],
      ['path', { d: 'M12 5v14' }]
    ],
    Copy: [
      ['rect', { width: '14', height: '14', x: '8', y: '8', rx: '2' }],
      ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }]
    ],
    Download: [
      ['path', { d: 'M12 15V3' }],
      ['path', { d: 'm7 10 5 5 5-5' }],
      ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }]
    ],
    Trash2: [
      ['path', { d: 'M3 6h18' }],
      ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' }],
      ['path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }],
      ['line', { x1: '10', x2: '10', y1: '11', y2: '17' }],
      ['line', { x1: '14', x2: '14', y1: '11', y2: '17' }]
    ],
    RefreshCw: [
      ['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }],
      ['path', { d: 'M21 3v5h-5' }],
      ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }],
      ['path', { d: 'M8 16H3v5' }]
    ],
    Minimize2: [
      ['path', { d: 'm14 10 7-7' }],
      ['path', { d: 'M20 10h-6V4' }],
      ['path', { d: 'm3 21 7-7' }],
      ['path', { d: 'M4 14h6v6' }]
    ],
    Maximize2: [
      ['path', { d: 'M15 3h6v6' }],
      ['path', { d: 'm21 3-7 7' }],
      ['path', { d: 'm3 21 7-7' }],
      ['path', { d: 'M9 21H3v-6' }]
    ],
    X: [
      ['path', { d: 'M18 6 6 18' }],
      ['path', { d: 'm6 6 12 12' }]
    ],
    Search: [
      ['path', { d: 'm21 21-4.34-4.34' }],
      ['circle', { cx: '11', cy: '11', r: '8' }]
    ],
    Box: [
      ['path', {
        d: 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z'
      }],
      ['path', { d: 'm3.3 7 8.7 5 8.7-5' }],
      ['path', { d: 'M12 22V12' }]
    ],
    Boxes: [
      ['path', { d: 'M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z' }],
      ['path', { d: 'm7 16.5-4.74-2.85' }],
      ['path', { d: 'm7 16.5 5-3' }],
      ['path', { d: 'M7 16.5v5.17' }],
      ['path', { d: 'M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z' }],
      ['path', { d: 'm17 16.5-5-3' }],
      ['path', { d: 'm17 16.5 4.74-2.85' }],
      ['path', { d: 'M17 16.5v5.17' }],
      ['path', { d: 'M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z' }],
      ['path', { d: 'M12 8 7.26 5.15' }],
      ['path', { d: 'm12 8 4.74-2.85' }],
      ['path', { d: 'M12 13.5V8' }]
    ],
    ListChecks: [
      ['path', { d: 'M13 5h8' }],
      ['path', { d: 'M13 12h8' }],
      ['path', { d: 'M13 19h8' }],
      ['path', { d: 'm3 17 2 2 4-4' }],
      ['path', { d: 'm3 7 2 2 4-4' }]
    ],
    Undo2: [
      ['path', { d: 'M9 14 4 9l5-5' }],
      ['path', { d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11' }]
    ],
    Redo2: [
      ['path', { d: 'm15 14 5-5-5-5' }],
      ['path', { d: 'M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13' }]
    ],
    LayoutGrid: [
      ['rect', { width: '7', height: '7', x: '3', y: '3', rx: '1' }],
      ['rect', { width: '7', height: '7', x: '14', y: '3', rx: '1' }],
      ['rect', { width: '7', height: '7', x: '14', y: '14', rx: '1' }],
      ['rect', { width: '7', height: '7', x: '3', y: '14', rx: '1' }]
    ],
    Magnet: [
      ['path', { d: 'm12 15 4 4' }],
      ['path', {
        d: 'M2.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.029-6.029a1 1 0 1 1 3 3l-6.029 6.029a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.365-6.367A1 1 0 0 0 8.716 4.282z'
      }],
      ['path', { d: 'm5 8 4 4' }]
    ],
    Scan: [
      ['path', { d: 'M3 7V5a2 2 0 0 1 2-2h2' }],
      ['path', { d: 'M17 3h2a2 2 0 0 1 2 2v2' }],
      ['path', { d: 'M21 17v2a2 2 0 0 1-2 2h-2' }],
      ['path', { d: 'M7 21H5a2 2 0 0 1-2-2v-2' }]
    ],
    RotateCcw: [
      ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }],
      ['path', { d: 'M3 3v5h5' }]
    ],
    Play: [
      ['path', { d: 'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z' }]
    ],
    Pause: [
      ['rect', { x: '14', y: '3', width: '5', height: '18', rx: '1' }],
      ['rect', { x: '5', y: '3', width: '5', height: '18', rx: '1' }]
    ],
    SkipBack: [
      ['path', { d: 'M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z' }],
      ['path', { d: 'M3 20V4' }]
    ],
    SkipForward: [
      ['path', { d: 'M21 4v16' }],
      ['path', { d: 'M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z' }]
    ],
    Save: [
      ['path', { d: 'M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z' }],
      ['path', { d: 'M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7' }],
      ['path', { d: 'M7 3v4a1 1 0 0 0 1 1h7' }]
    ],
    Upload: [
      ['path', { d: 'M12 3v12' }],
      ['path', { d: 'm17 8-5-5-5 5' }],
      ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }]
    ],
    ExternalLink: [
      ['path', { d: 'M15 3h6v6' }],
      ['path', { d: 'M10 14 21 3' }],
      ['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }]
    ],
    Settings: [
      ['path', {
        d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915'
      }],
      ['circle', { cx: '12', cy: '12', r: '3' }]
    ],
    MoreHorizontal: [
      ['circle', { cx: '12', cy: '12', r: '1' }],
      ['circle', { cx: '19', cy: '12', r: '1' }],
      ['circle', { cx: '5', cy: '12', r: '1' }]
    ],
    Columns3: [
      ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }],
      ['path', { d: 'M9 3v18' }],
      ['path', { d: 'M15 3v18' }]
    ],
    PanelLeftClose: [
      ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }],
      ['path', { d: 'M9 3v18' }],
      ['path', { d: 'm16 15-3-3 3-3' }]
    ],
    PanelLeftOpen: [
      ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }],
      ['path', { d: 'M9 3v18' }],
      ['path', { d: 'm14 9 3 3-3 3' }]
    ],
    CheckCircle2: [
      ['circle', { cx: '12', cy: '12', r: '10' }],
      ['path', { d: 'm9 12 2 2 4-4' }]
    ],
    Circle: [
      ['circle', { cx: '12', cy: '12', r: '10' }]
    ],
    Video: [
      ['path', { d: 'm16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5' }],
      ['rect', { x: '2', y: '6', width: '14', height: '12', rx: '2' }]
    ],
    FileText: [
      ['path', { d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z' }],
      ['path', { d: 'M14 2v5a1 1 0 0 0 1 1h5' }],
      ['path', { d: 'M10 9H8' }],
      ['path', { d: 'M16 13H8' }],
      ['path', { d: 'M16 17H8' }]
    ],
    Clock3: [
      ['path', { d: 'M12 6v6h4' }],
      ['circle', { cx: '12', cy: '12', r: '10' }]
    ],
    Layers3: [
      ['path', { d: 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z' }],
      ['path', { d: 'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12' }],
      ['path', { d: 'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17' }]
    ],
    Workflow: [
      ['rect', { width: '8', height: '8', x: '3', y: '3', rx: '2' }],
      ['path', { d: 'M7 11v4a2 2 0 0 0 2 2h4' }],
      ['rect', { width: '8', height: '8', x: '13', y: '13', rx: '2' }]
    ],
    Move: [
      ['path', { d: 'M12 2v20' }],
      ['path', { d: 'm15 19-3 3-3-3' }],
      ['path', { d: 'm19 9 3 3-3 3' }],
      ['path', { d: 'M2 12h20' }],
      ['path', { d: 'm5 9-3 3 3 3' }],
      ['path', { d: 'm9 5 3-3 3 3' }]
    ],
    Expand: [
      ['path', { d: 'm15 15 6 6' }],
      ['path', { d: 'm15 9 6-6' }],
      ['path', { d: 'M21 16v5h-5' }],
      ['path', { d: 'M21 8V3h-5' }],
      ['path', { d: 'M3 16v5h5' }],
      ['path', { d: 'm3 21 6-6' }],
      ['path', { d: 'M3 8V3h5' }],
      ['path', { d: 'M9 9 3 3' }]
    ],
    Shrink: [
      ['path', { d: 'm15 15 6 6m-6-6v4.8m0-4.8h4.8' }],
      ['path', { d: 'M9 19.8V15m0 0H4.2M9 15l-6 6' }],
      ['path', { d: 'M15 4.2V9m0 0h4.8M15 9l6-6' }],
      ['path', { d: 'M9 4.2V9m0 0H4.2M9 9 3 3' }]
    ]
  };

  function toKebabCase(value) {
    return String(value || '')
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }

  const canonicalNames = Object.freeze(Object.keys(ICONS));
  const namesByKey = new Map();
  canonicalNames.forEach((name) => {
    const kebabName = toKebabCase(name);
    namesByKey.set(kebabName, name);
    namesByKey.set(kebabName.replace(/-/g, ''), name);
  });

  function resolveName(name) {
    const key = toKebabCase(name);
    return namesByKey.get(key) || namesByKey.get(key.replace(/-/g, '')) || null;
  }

  function normalizeSize(value) {
    if (value === undefined || value === null || value === '') return '24';
    if (typeof value === 'number') {
      return Number.isFinite(value) && value > 0 ? String(value) : '24';
    }
    const size = String(value).trim();
    return size && size.length <= 64 ? size : '24';
  }

  function normalizeStrokeWidth(value) {
    if (value === undefined || value === null || value === '') return '2';
    const strokeWidth = Number(value);
    return Number.isFinite(strokeWidth) && strokeWidth >= 0
      ? String(strokeWidth)
      : '2';
  }

  function create(name, options = {}) {
    const canonicalName = resolveName(name);
    if (!canonicalName) {
      throw new RangeError(`Unknown Lucide icon: ${String(name || '')}`);
    }
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('Lucide icon options must be an object');
    }

    const doc = globalThis.document;
    if (!doc || typeof doc.createElementNS !== 'function') {
      throw new Error('A DOM document is required to create Lucide icons');
    }

    const size = normalizeSize(options.size);
    const strokeWidth = normalizeStrokeWidth(options.strokeWidth);
    const kebabName = toKebabCase(canonicalName);
    const extraClassName = options.className === undefined
      ? ''
      : String(options.className).trim().replace(/\s+/g, ' ');
    const label = options.label === undefined || options.label === null
      ? ''
      : String(options.label).trim();

    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', strokeWidth);
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute(
      'class',
      `lucide lucide-${kebabName}${extraClassName ? ` ${extraClassName}` : ''}`
    );

    if (label) {
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', label);
      const title = doc.createElementNS(SVG_NS, 'title');
      title.textContent = label;
      svg.appendChild(title);
    } else {
      svg.setAttribute('aria-hidden', 'true');
    }

    ICONS[canonicalName].forEach(([tagName, attributes]) => {
      const child = doc.createElementNS(SVG_NS, tagName);
      Object.entries(attributes).forEach(([attribute, value]) => {
        child.setAttribute(attribute, value);
      });
      svg.appendChild(child);
    });

    return svg;
  }

  function has(name) {
    return Boolean(resolveName(name));
  }

  globalThis[GLOBAL_KEY] = Object.freeze({
    create,
    has,
    names: canonicalNames,
    source: Object.freeze({
      package: 'lucide-react',
      version: '0.554.0',
      license: 'ISC'
    })
  });
})();
