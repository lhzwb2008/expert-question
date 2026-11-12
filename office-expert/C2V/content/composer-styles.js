(() => {
  "use strict";
  // Shared by the two shadow-root editors inside the workspace composer.
  globalThis.__cyleComposerStylesV1 = `
    footer {
      display:flex; align-items:center; flex-wrap:wrap; flex-shrink:0; gap:8px;
      padding:12px 16px; margin:0; border-top:1px solid var(--pet-border,#465564);
    }
    footer button { font-size:12px; min-height:34px; border-radius:8px; padding:6px 14px; }
    footer button.primary {
      position:relative; min-width:92px; font-weight:600;
      background:var(--pet-accent,#e99451); color:var(--pet-on-accent,#23180e);
      border-color:var(--pet-accent,#e99451);
      box-shadow:inset 0 0 0 2px var(--pet-accent),inset 0 0 0 3px #fff5;
    }
    footer button.primary::after {
      content:""; position:absolute; inset:4px; border:1px dashed #fffb;
      border-radius:4px; pointer-events:none;
    }
    footer button.primary:hover { background:var(--pet-accent-hover,#f3ac6e); color:var(--pet-on-accent,#23180e); }
  `;
})();
