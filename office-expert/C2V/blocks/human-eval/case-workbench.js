(() => {
  'use strict';
  const C=globalThis.__cyleCaseEvalV1,Q=globalThis.__cyleQuestionRubricV1,M=globalThis.__cyleFieldMappingV1;
  const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
  const button=(text,fn,label=text)=>{const n=el('button',text);n.type='button';n.setAttribute('aria-label',label);n.onclick=fn;return n;};
  const styles=`
    .quality-weight-status{display:block;margin:4px 0 0;font-size:11px;font-weight:400;line-height:1.6;color:var(--pet-muted)}.quality-adoption-label{display:block;margin:4px 0 0;font-size:11px;line-height:1.6;color:var(--pet-muted)}.case-weight[role=button]{cursor:pointer}.case-weight[role=button]:focus-visible{outline:1px solid var(--pet-accent)}
    .quality-source-card,.quality-source-weight,.quality-received{position:relative}
    .quality-source-card.is-evidence-selected{background:transparent;box-shadow:none}
    .quality-source-card{transition:none}
    .quality-source-card.quality-adopted{background:color-mix(in srgb,var(--pet-accent) 4%,transparent);box-shadow:none;border-radius:6px}
    .quality-source-card::before,.quality-source-weight::before,.quality-received::before{content:'';position:absolute;inset:0;box-sizing:border-box;border:1px solid color-mix(in srgb,var(--pet-accent) 65%,var(--pet-border));border-radius:6px;opacity:0;pointer-events:none;transition:opacity 180ms ease-out}
    .quality-adopted::before,.quality-received::before{opacity:1}
    .quality-source-weight{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:28px;min-height:26px;border-radius:5px}
    .quality-source-weight.quality-adopted::before{border-color:var(--pet-accent)}
    .quality-weight-status.quality-received{border-radius:4px}
    @starting-style{.quality-received::before{opacity:0}}
    @media(prefers-reduced-motion:reduce){.quality-source-card,.quality-source-card::before,.quality-source-weight::before,.quality-received::before{transition:none}}
    .quality-work-tabs{padding:8px 10px;margin:0;flex:none;border-bottom:1px solid var(--pet-border)}.quality-work-tabs [aria-pressed=false]{opacity:.45;filter:grayscale(1)}
    .quality-diff-removed{color:var(--pet-red,#b42318)!important;background:color-mix(in srgb,var(--pet-red,#b42318) 12%,transparent)!important;box-shadow:inset 2px 0 var(--pet-red,#b42318)}
    .quality-diff-added{color:var(--pet-green,#16784b)!important;background:color-mix(in srgb,var(--pet-green,#16784b) 12%,transparent)!important;box-shadow:inset 2px 0 var(--pet-green,#16784b);text-decoration:none}
    .case-controls{display:none}
    .case-add-checkpoint{margin:0 0 12px;padding:0 10px}
    .case-add-trigger{display:inline-flex;align-items:center;gap:5px;box-sizing:border-box;max-width:100%;padding:6px 0;border:0;background:transparent;color:var(--pet-muted);font:inherit;font-size:12px;cursor:pointer}.case-add-trigger[hidden]{display:none}.case-add-trigger:hover{color:var(--pet-accent)}.case-add-trigger:focus-visible{outline:1px solid var(--pet-accent);outline-offset:3px}
    .case-add-checkpoint .case-new-checkpoint{padding:16px 0 6px;border:0}.case-new-checkpoint>.case-checkpoint-heading{grid-template-columns:auto minmax(0,1fr)}
    .case-new-checkpoint .case-add-actions{margin-top:12px}.case-add-actions .case-add-submit{color:var(--pet-accent);border-color:var(--pet-accent);background:var(--pet-soft)}
    .case-add-error{color:var(--pet-red);font-size:12px;margin:8px 0}.case-add-error:empty{display:none}.case-added-meta{font-size:11px;color:var(--pet-muted);margin:3px 0 8px}

    .case-weight{cursor:default}.case-section-title button.case-weight{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:none;box-sizing:border-box;min-width:34px;min-height:28px;max-width:100%;padding:3px 9px;border:1px solid var(--pet-border);border-radius:6px;background:color-mix(in srgb,var(--pet-accent) var(--case-weight-tint,6%),var(--pet-surface));color:var(--pet-text);font:inherit;font-size:var(--case-weight-size,14px);font-weight:var(--case-weight-bold,550);font-variant-numeric:tabular-nums;line-height:20px;overflow-wrap:anywhere;cursor:pointer;box-shadow:none}
    .case-section-title button.case-weight::after{content:'';position:absolute;inset:3px;border:1px dashed color-mix(in srgb,var(--pet-stitch,var(--pet-border)) 45%,transparent);border-radius:3px;pointer-events:none}.case-section-title button.case-weight:hover{background:var(--pet-soft);border-color:var(--pet-accent);color:var(--pet-accent)}.case-section-title button.case-weight:focus-visible{outline:2px solid var(--pet-accent);outline-offset:2px}.case-section-title button.case-weight.case-diff-added{color:var(--pet-green)}
    .case-weight-overlay{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;box-sizing:border-box;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;border:0;padding:18px;background:transparent;color:var(--pet-text)}.case-weight-overlay::backdrop{background:rgba(5,8,12,.78);backdrop-filter:blur(5px)}
    .case-weight-panel{container-type:inline-size;container-name:weights;box-sizing:border-box;width:min(560px,100%);max-height:min(800px,calc(100dvh - 36px));display:flex;overflow:hidden;flex-direction:column;background:var(--pet-surface);color:var(--pet-text);border:1px solid var(--pet-border);border-radius:8px;padding:0;box-shadow:0 24px 80px #0006;font-size:13px;line-height:1.6}
    .case-weight-panel>header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;padding:14px 20px;border-bottom:1px solid var(--pet-border)}.case-weight-heading strong{font-size:14px;font-weight:600}
    .case-weight-panel button,.case-weight-panel input{box-sizing:border-box;min-width:0;font:inherit;color:var(--pet-text)}.case-weight-panel button{cursor:pointer}.case-weight-panel button:disabled{opacity:.4;cursor:default}.case-weight-panel button:focus-visible{outline:2px solid var(--pet-accent);outline-offset:2px}
    .case-weight-panel button.case-weight-close{display:grid;place-items:center;flex:none;width:26px;height:26px;min-height:0;padding:0;border:0;border-radius:4px;background:transparent;color:var(--pet-muted)}.case-weight-panel button.case-weight-close:hover{background:var(--pet-raised);color:var(--pet-text)}
    .case-weight-list{flex:1;min-height:0;overflow:auto;scrollbar-width:thin;padding:10px 20px 16px}.case-weight-columns{display:flex;justify-content:space-between;padding:0 6px 4px;color:var(--pet-muted);font-size:11px}.case-weight-group-section{margin:0 0 10px}.case-weight-group-section:last-child{margin-bottom:0}.case-weight-category{font-size:14px;font-weight:600;line-height:1.6;margin:10px 0 5px;padding:0 6px;color:var(--pet-text)}
    .case-weight-row{display:flex;align-items:center;gap:12px;box-sizing:border-box;min-height:34px;padding:3px 6px 3px 20px;border-radius:3px}.case-weight-row:focus-within{background:color-mix(in srgb,var(--pet-text) 3%,transparent)}.case-weight-row label{display:flex;align-items:baseline;gap:8px;flex:1;min-width:0;overflow-wrap:anywhere;line-height:1.6;cursor:text}.case-weight-dimension-id{flex:none;color:var(--pet-muted);font-size:11px;font-variant-numeric:tabular-nums}.case-weight-dimension-name{font-size:13px;font-weight:400}
    .case-weight-value{display:flex;align-items:center;gap:5px;flex:none;font-variant-numeric:tabular-nums}.case-weight-change{display:inline-flex;align-items:center;gap:5px;min-width:0;font-size:12px;color:var(--pet-muted);white-space:nowrap}.case-weight-change:empty{display:none}.case-weight-change del{background:transparent;color:var(--pet-red);text-decoration:line-through}
    .case-weight-panel input.case-weight-number{width:54px;height:28px;min-height:0;padding:2px 5px;border:0;border-bottom:1px solid transparent;border-radius:0;outline:0;background:transparent;color:var(--pet-text);text-align:right;font-size:13px;line-height:1.6;font-variant-numeric:tabular-nums}.case-weight-panel input.case-weight-number:hover{border-bottom-color:var(--pet-border)}.case-weight-panel input.case-weight-number:focus{border-bottom-color:var(--pet-accent);background:var(--pet-input)}.case-weight-panel input.case-weight-number.is-changed{color:var(--pet-green)}.case-weight-panel input.case-weight-number[aria-invalid=true]{color:var(--pet-red);border-bottom-color:var(--pet-red)}
    .case-weight-panel>footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;flex:none;margin:0;padding:12px 20px;border-top:1px solid var(--pet-border);background:transparent}.case-weight-summary strong{font-size:13px;font-weight:500;font-variant-numeric:tabular-nums}.case-weight-summary p{margin:2px 0 0;color:var(--pet-muted);font-size:11px;line-height:1.6;min-height:18px}.case-weight-summary[data-valid=false] p{color:var(--pet-accent)}
    .case-weight-actions{display:flex;gap:8px;margin-left:auto}.case-weight-actions button{min-height:28px;padding:3px 10px;border:1px solid var(--pet-border);border-radius:5px;background:var(--pet-raised);font-size:12px;white-space:nowrap}.case-weight-actions button:hover:not(:disabled){background:var(--pet-soft);border-color:var(--pet-accent)}.case-weight-actions button.case-weight-apply{color:var(--pet-accent)}
    @container weights (max-width:380px){.case-weight-panel>header{padding:12px}.case-weight-list{padding:8px 12px 12px}.case-weight-row{gap:6px;padding-left:12px}.case-weight-row label{gap:5px}.case-weight-panel>footer{padding:12px}.case-weight-panel input.case-weight-number{width:42px}}


    .case-bar{display:flex;align-items:center;gap:7px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin}.case-bar>button,.case-bar>select{flex-shrink:0;white-space:nowrap}.case-bar select{max-width:180px}.case-status{flex:1;min-width:100px;height:16px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--pet-muted);font-size:11px}
    .case-controls button,.case-controls select,.case-controls input,.case-controls textarea,.case-other input,.case-other textarea,.case-revise textarea,.case-revise button,.case-section-title button,.case-add-other{font:inherit;color:var(--pet-text);background:var(--pet-raised);border:1px solid var(--pet-border);border-radius:5px;padding:4px 7px}
    .case-controls button{cursor:pointer}.case-panel{padding:10px 0 3px;max-height:300px;overflow:auto}.case-setting-row{display:flex;align-items:center;gap:10px;min-height:32px}.case-setting-row>span{flex:1}.case-setting-row input{width:76px}.case-setting-row select{width:90px}
    .case-other{margin:6px 0 12px;padding:8px 0;border-bottom:1px solid var(--pet-border)}.case-other-row{display:flex;gap:6px;align-items:start;margin:6px 0}.case-other-row textarea{flex:1;min-width:0;resize:vertical;min-height:34px}.case-other-row input{width:58px}.case-deduction{display:flex;gap:5px;align-items:center;font-size:11px;color:var(--pet-muted);white-space:nowrap}.case-other-row button{border:0;background:transparent;color:var(--pet-muted);cursor:pointer}
    .case-add-other{border:0;background:transparent;color:var(--pet-muted);font-size:12px;cursor:pointer}.case-revise{padding:8px 0}.case-revise textarea{box-sizing:border-box;width:100%;min-height:95px;resize:vertical}.case-revise button{margin:5px 6px 0 0}
    .case-section-title{display:flex;align-items:center;gap:8px}.case-section-title button{border:0;background:transparent;padding:3px 0;text-align:left;font-weight:600;cursor:pointer}.case-section-title .case-progress{font-size:10px;font-weight:400;color:var(--pet-muted)}
    .case-category{font-size:15px;margin:20px 0 8px;color:var(--pet-text);border-bottom:1px solid var(--pet-border);padding-bottom:8px}.case-section-title{font-size:14px!important;margin:16px 0 10px!important;color:var(--pet-text)!important}.case-kind{font-size:12px;margin:12px 0 6px;color:var(--pet-muted)}.case-checkpoint-text{box-sizing:border-box;display:block;width:100%;min-height:36px;resize:none;overflow:hidden;border:1px solid transparent;border-radius:4px;padding:6px;font:inherit;line-height:1.7;color:var(--pet-text);background:transparent;white-space:pre-wrap}.case-checkpoint-text:hover{border-color:var(--pet-border)}.case-checkpoint-text:focus{outline:1px solid var(--pet-accent);background:var(--pet-input)}.human-title{font-weight:500;color:var(--pet-muted)}.case-readonly button,.case-readonly input,.case-readonly textarea{opacity:.6}
    .case-native-scores{border:0;padding:4px 0;margin:4px 0;color:var(--pet-text);min-width:0}.case-native-scores legend{font-size:11px;color:var(--pet-muted);padding:0}.case-native-scores label{display:flex;gap:7px;align-items:flex-start;line-height:1.65;padding:3px 0;font-size:12px;cursor:pointer}.case-native-scores input{flex:none;margin:4px 0 0;accent-color:var(--pet-accent)}.case-score-reason{box-sizing:border-box;width:100%;min-height:32px;padding:5px 6px;resize:vertical;font:inherit;background:var(--pet-input);color:var(--pet-text);border:1px solid var(--pet-border);border-radius:4px}
    .case-weight-group{margin-left:auto;display:inline-flex;align-items:center;gap:5px}.case-weight{white-space:nowrap;font-size:12px;font-weight:400;cursor:default}.case-weight-input{width:76px;margin-left:auto;font:inherit;color:var(--pet-text);background:var(--pet-input);border:1px solid var(--pet-border);border-radius:4px;padding:3px 5px}
    .case-native-diff{font-size:12px;line-height:1.7;margin:10px 0 12px;padding:8px 10px;border-left:2px solid var(--pet-border);background:color-mix(in srgb,var(--pet-text) 3%,transparent);color:var(--pet-text)}.case-native-diff .case-diff-title{margin-bottom:5px;font-size:11px;font-weight:500;color:var(--pet-muted)}.case-native-diff .case-diff-line{display:grid;grid-template-columns:3em minmax(0,1fr);gap:8px;margin:3px 0}.case-native-diff .case-diff-label{color:var(--pet-muted)}.case-native-diff .case-diff-content{white-space:pre-wrap;overflow-wrap:anywhere}.case-diff-removed{color:var(--pet-red,#b42318);background:color-mix(in srgb,var(--pet-red,#b42318) 12%,transparent)}.case-diff-added{color:var(--pet-green,#16784b);background:color-mix(in srgb,var(--pet-green,#16784b) 12%,transparent);text-decoration:none}
    .case-diff-row{padding:8px 0;border-bottom:1px solid var(--pet-border)}.case-diff-row p{white-space:pre-wrap;overflow-wrap:anywhere}.case-diff-row .before{color:var(--pet-muted)}

    .case-review-layout{display:grid;grid-template-columns:208px minmax(0,1fr);flex:1;min-height:0;overflow:hidden}.case-review-layout:has(.case-toc.is-collapsed){grid-template-columns:40px minmax(0,1fr)}
    .case-review-layout>.result-list{min-width:0;padding:0 12px 12px;overflow:auto}
    .case-toc{display:flex;flex-direction:column;min-height:0;overflow:hidden;border-right:1px solid var(--pet-border);padding:6px;background:var(--pet-canvas);box-sizing:border-box}.case-toc-heading{display:flex;align-items:center;justify-content:space-between;flex:none;min-height:32px;padding:0 4px 6px}.case-toc-heading strong{font-size:13px;font-weight:600;color:var(--pet-text)}.case-toc-toggle{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;border:0;border-radius:6px;background:transparent;color:var(--pet-muted);padding:0;cursor:pointer}.case-toc-toggle:hover{background:var(--pet-soft);color:var(--pet-accent)}.case-toc-toggle:focus-visible{outline:2px solid var(--pet-accent)}
    .case-toc-list{overflow:auto;min-height:0;scrollbar-width:thin}.case-toc-list button{display:block;width:100%;text-align:left;white-space:normal;overflow-wrap:anywhere;border:0;background:transparent;padding:7px 5px;font:inherit;font-size:12px;line-height:1.5;color:var(--pet-text);cursor:pointer}.case-toc-list button:hover{background:var(--pet-soft)}.case-toc-category{font-size:12px;font-weight:600;color:var(--pet-text);margin:16px 7px 5px}.case-toc.is-collapsed{padding:3px}.case-toc.is-collapsed .case-toc-list{display:none}.case-toc.is-collapsed .case-toc-heading{justify-content:center;padding:0}.case-toc-list [data-dimension-link]{display:flex;align-items:baseline;gap:6px;border-radius:5px;padding:8px 7px;line-height:1.6}.case-toc-label{flex:1;min-width:0;font-size:12px}.case-toc-id{font-size:11px;color:var(--pet-muted);margin-right:6px;font-variant-numeric:tabular-nums}.case-toc-count{flex:none;min-width:2ch;text-align:right;font-size:11px;font-weight:400;font-variant-numeric:tabular-nums;color:var(--pet-muted);background:transparent;padding:0;border-radius:0}.case-toc-list [aria-current] .case-toc-id{color:var(--pet-accent)}
    .result-list .human-group,.case-ranking{border:1px solid var(--pet-border);border-radius:8px;padding:12px;margin:12px 0 16px;background:var(--pet-surface);box-sizing:border-box}.result-list .case-section-title{margin:0 0 12px!important;flex-wrap:wrap}.result-list .human-card:last-child{border-bottom:0}
    .case-native-scores .case-score-options{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.case-native-scores .case-score-options label{position:relative;display:inline-flex;justify-content:center;align-items:center;min-width:32px;height:30px;padding:0 8px;box-sizing:border-box;border:1px solid var(--pet-border);border-radius:6px;background:var(--pet-raised);color:var(--pet-text);font-size:13px}
    .case-native-scores .case-score-options input{position:absolute;inset:0;margin:0;width:100%;height:100%;opacity:0;cursor:pointer}.case-score-options label:has(input:checked){border-color:var(--pet-accent);background:var(--pet-soft);font-weight:650}.case-score-options label:has(input:focus-visible){outline:2px solid var(--pet-accent)}.case-score-options label:has(input:disabled){opacity:.5;cursor:default}
    .case-score-descriptions{font-size:12px;line-height:1.6;color:var(--pet-muted)}.case-score-descriptions>div{padding:3px 0}.case-score-descriptions .is-selected{color:var(--pet-text);font-weight:500}
    .case-compare-review{display:flex;flex:1;min-height:0;overflow:hidden}.case-compare-review>.case-toc{flex:0 0 180px}.case-compare-review>.case-toc.is-collapsed{flex-basis:40px}.case-compare-review>.comparison-columns{min-width:0;flex:1}.case-toolbar-host{flex-shrink:0}.comparison-columns>.case-ranking{grid-column:1/-1;margin:12px;padding:12px}.case-ranking h3{margin:0 0 12px;font-size:14px}.case-ranking select{font:inherit;color:var(--pet-text);background:var(--pet-input);border:1px solid var(--pet-border);border-radius:5px;padding:4px 7px}

    .case-ranking[data-readonly=true] .case-rank-model:disabled{opacity:1;cursor:default}
    .case-rank-buttons{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:10px}.case-rank-hint{font-size:12px;color:var(--pet-muted);line-height:1.6;margin:0}
    .case-rank-model{position:relative;font:inherit;font-size:12px;padding:8px 13px;border:1px solid var(--model-color);border-radius:8px;background:color-mix(in srgb,var(--model-color) 23%,var(--pet-raised));color:var(--pet-text);cursor:grab;white-space:nowrap;font-weight:650}.case-rank-model::after{content:"";position:absolute;inset:3px;border:1px dashed color-mix(in srgb,var(--model-color) 75%,var(--pet-text));border-radius:5px;pointer-events:none}.case-rank-model:hover{background:color-mix(in srgb,var(--model-color) 36%,var(--pet-raised))}.case-rank-number{margin-left:7px;font-size:10px;font-weight:400;color:var(--pet-muted)}.case-rank-number:empty{display:none}.case-rank-model:focus-visible{outline:2px solid var(--pet-accent);outline-offset:2px}.case-rank-model:disabled{opacity:.5;cursor:default}.case-rank-model.is-dragging{opacity:.45}
    .case-rank-model[data-drop-side=before]{box-shadow:inset 3px 0 var(--pet-accent)}.case-rank-model[data-drop-side=after]{box-shadow:inset -3px 0 var(--pet-accent)}.case-rank-buttons [data-drop-side=tie]{outline:2px dashed var(--pet-accent);outline-offset:-4px}.case-rank-reset{font-size:11px;color:var(--pet-muted);padding:10px;border-radius:6px}

    .case-review-layout>.result-list{scroll-behavior:auto;overflow-anchor:none}
    .case-toc-list button:focus:not(:focus-visible){outline:none;box-shadow:none}
    .case-toc-list button.is-current{color:var(--pet-text);background:var(--pet-soft);font-weight:500;box-shadow:none}
    .case-toc-list button:focus-visible{outline:none;text-decoration:underline;text-underline-offset:3px}
    .case-toc-list{overflow-anchor:none;scroll-behavior:auto}
    .case-toc-row{display:flex;align-items:center;gap:0;border-radius:6px;margin-bottom:3px;cursor:pointer}
    .case-toc-row:hover{background:var(--pet-raised)}.case-toc-row:has(.is-current){background:var(--pet-soft);box-shadow:inset 3px 0 var(--pet-accent)}
    .case-toc-row>button,.case-toc-row>button:hover,.case-toc-row>button.is-current{background:transparent;box-shadow:none}
    .case-toc-row>[data-dimension-link]{flex:1;min-width:0;align-items:center;padding:7px 9px;gap:8px}
    .case-toc-row .case-toc-label{display:flex;align-items:baseline;gap:5px}.case-toc-row .case-toc-id{flex:none;margin:0}
    .case-toc-name{min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .case-toc-row [aria-current] .case-toc-id{color:var(--pet-muted)}


    .case-item-heading{display:flex;gap:8px;align-items:center}.case-kind-badge{font-size:10px;font-weight:400;color:var(--pet-muted)}
    .case-checkpoint-text{border:0;padding:0;margin:0 0 10px;min-height:0;font-size:13px;font-weight:400;line-height:1.7;cursor:text}
    .case-checkpoint-text:focus{background:transparent;outline:none}.case-checkpoint-text:focus-visible{outline:1px solid var(--pet-accent)}
    .human-card:has(.case-inline-input){background:transparent;box-shadow:none}
    .case-native-scores .has-descriptions{flex-direction:column;gap:4px}
    .case-native-scores .has-descriptions label{height:auto;min-height:32px;justify-content:flex-start;align-items:flex-start;gap:10px;padding:6px 8px;text-align:left;font-size:12px;line-height:1.6;font-weight:400}
    .case-score-number{flex:none;min-width:16px;text-align:center;font-weight:600}.case-score-description{white-space:pre-wrap}
    .case-native-scores .has-descriptions label:has(input:checked){box-shadow:inset 2px 0 var(--pet-accent)}

    .case-evaluation{margin:6px 0;padding:0;border:0;background:transparent}
    .case-evaluation .case-native-scores{padding:0;margin:0;border:0;max-width:100%}.case-evaluation .case-score-options{margin:0;gap:8px}
    .case-evaluation .case-score-options label{min-width:44px;height:40px;padding:0 12px;border-radius:7px;background:var(--pet-surface);cursor:pointer;font-size:14px;transition:background .12s,border-color .12s}
    .case-evaluation .case-score-options label:hover{border-color:var(--pet-accent);background:var(--pet-soft)}
    .case-evaluation .case-score-options label:has(input:checked){background:var(--pet-soft);border-color:var(--pet-accent);box-shadow:inset 0 0 0 1px var(--pet-accent)}
    .case-evaluation:has(.is-boolean){display:flex;align-items:center;flex-wrap:wrap;gap:2px 16px}
    .case-evaluation .is-boolean{position:relative;display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:0;width:132px;max-width:100%;height:30px;padding:0;box-sizing:border-box;background:transparent;touch-action:pan-y;user-select:none}
    .case-evaluation .is-boolean label,.case-evaluation .is-boolean label:hover,.case-evaluation .is-boolean label:has(input:checked){position:relative;z-index:1;grid-row:1;min-width:0;height:30px;padding:0 8px;gap:0;border:0;border-radius:999px;background:transparent;box-shadow:none;font-size:12px;font-weight:400;color:var(--pet-muted)}
    .case-evaluation .is-boolean [data-verdict=true]{grid-column:1}.case-evaluation .is-boolean [data-verdict=false]{grid-column:2}
    .case-evaluation .is-boolean input{position:absolute;inset:0;opacity:0;width:100%;height:100%;margin:0;cursor:pointer}
    .case-evaluation .is-boolean .case-score-number{font-size:12px;font-weight:400;min-width:0}
    .case-evaluation .is-boolean label:has(input:checked){color:var(--pet-accent)}
    .case-evaluation .is-boolean label:has(input:focus-visible){outline:none}
    .case-verdict-track{position:absolute;inset:0;box-sizing:border-box;border:1px solid color-mix(in srgb,var(--pet-border) 65%,transparent);border-radius:999px;background:color-mix(in srgb,var(--pet-raised) 75%,var(--pet-surface));pointer-events:none}
    .case-verdict-thumb{position:absolute;left:3px;top:2px;box-sizing:border-box;width:calc(50% - 3px);height:24px;border:1px solid var(--pet-border);border-radius:999px;background:var(--pet-surface);box-shadow:0 1px 3px color-mix(in srgb,var(--pet-text) 10%,transparent);opacity:0;transform:translateX(var(--case-verdict-drag,50%));transition:transform .18s ease,border-color .18s ease,opacity .18s ease}
    .is-boolean:has(input:checked) .case-verdict-thumb,.case-verdict-track.is-dragging .case-verdict-thumb{opacity:1}
    .is-boolean:has([data-verdict=true] input:checked) .case-verdict-thumb{transform:translateX(var(--case-verdict-drag,0px));border-color:var(--pet-accent)}
    .is-boolean:has([data-verdict=false] input:checked) .case-verdict-thumb{transform:translateX(var(--case-verdict-drag,100%));border-color:var(--pet-accent)}
    .is-boolean:has(.is-dragging) input{cursor:grabbing}.case-verdict-track.is-dragging .case-verdict-thumb{transition:none}
    .is-boolean:has(input:focus-visible) .case-verdict-track{outline:2px solid var(--pet-accent);outline-offset:2px}
    .is-boolean:has(input:disabled) .case-verdict-track{opacity:.5;cursor:default}
    @media(prefers-reduced-motion:reduce){.case-verdict-thumb{transition:none}}
    .case-evaluation:has(.is-boolean) .case-note{order:3;flex-basis:100%}
    .case-evaluation:has(.is-boolean) .case-evidence{order:2;flex:1 1 auto;margin:0}
    .case-evaluation .has-descriptions label{height:auto;min-height:44px;width:100%;padding:9px 12px;font-size:12px;line-height:1.65;gap:12px}
    .case-checkpoint-heading{align-items:baseline!important;gap:8px!important}.case-checkpoint-heading>.human-title{flex:none;line-height:1.7;font-variant-numeric:tabular-nums}.case-checkpoint-heading>.case-checkpoint-text{flex:1;min-width:0;width:auto;margin:0}
    .case-note{min-height:24px;box-sizing:border-box;border:0;border-left:2px solid var(--pet-border);padding:2px 9px;margin:5px 0 0;font-size:12px;line-height:1.65;color:var(--pet-muted);white-space:pre-wrap;cursor:text}
    .case-note:hover,.case-note:focus-visible,.case-note.is-editing{border-left-color:var(--pet-accent)}.case-note:focus{outline:none}.case-note.is-editing{color:var(--pet-text);background:transparent}
    .case-evidence{display:flex;align-items:center;flex-wrap:wrap;min-width:0;max-width:100%;gap:6px;margin:5px 0 0 32px}
    .case-evidence button{box-sizing:border-box;font:inherit;font-size:12px;line-height:24px;height:24px;border:0;border-radius:999px;background:transparent;color:var(--pet-muted);cursor:pointer;padding:0 8px;white-space:nowrap}
    .case-evidence-tag{display:inline-flex;align-items:center;box-sizing:border-box;height:28px;max-width:100%;padding:2px;border:0;border-radius:999px;background:color-mix(in srgb,var(--pet-raised) 65%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pet-border) 45%,transparent)}
    .case-evidence .human-time-tag{min-width:0;margin:0;color:var(--pet-text);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis}.case-evidence .human-time-tag.is-selected{color:var(--pet-accent);background:var(--pet-soft)}
    .case-evidence-tag>button:last-child{flex:none;width:22px;padding:0;font-size:13px}.case-evidence button:hover{color:var(--pet-accent);background:var(--pet-soft)}
    .case-evidence .case-time-add{height:28px;line-height:24px;padding:2px 12px;border-radius:999px;background:transparent;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pet-border) 60%,transparent)}.case-evidence .case-time-add:hover{background:var(--pet-soft)}
    .case-evidence .case-remove-checkpoint{display:inline-flex;align-items:center;justify-content:center;flex:none;width:26px;height:28px;padding:0}.case-evidence .case-remove-checkpoint:hover{color:var(--pet-red)}
    .case-evidence button:focus-visible{outline:2px solid var(--pet-accent);outline-offset:1px}
    .case-evidence-tag.is-editing-time{box-shadow:inset 0 0 0 1px var(--pet-accent);background:var(--pet-soft)}
    .case-time-input{box-sizing:border-box;max-width:100%;height:24px;min-width:0;padding:0 8px;border:0;border-radius:999px;outline:none;font:inherit;font-size:12px;line-height:24px;font-variant-numeric:tabular-nums;color:var(--pet-accent);background:transparent}
    .case-time-input[aria-invalid=true]{color:var(--pet-red);box-shadow:inset 0 -1px var(--pet-red)}
    .comparison-columns{display:grid;grid-auto-rows:max-content;align-content:start;flex:1;min-height:0;min-width:0;overflow:auto;overflow-anchor:none;align-items:start;gap:0}
    .model-column{display:flex;flex-direction:column;min-width:0;min-height:0;border-right:1px solid var(--pet-border)}.model-column:last-child{border-right:0}
    .model-editor{min-height:0;min-width:0;overflow:visible;container-type:inline-size;container-name:model-editor}
    .quality-column-heading{position:sticky;top:0;z-index:2;box-sizing:border-box;padding:10px;margin:0;font-size:13px;background:var(--pet-raised);color:var(--pet-text);border-bottom:1px solid var(--pet-border);overflow-wrap:anywhere}
    .quality-warning{color:var(--pet-accent);font-size:12px;white-space:pre-wrap}
    .quality-missing{box-sizing:border-box;margin:12px 0 16px;border:0!important;background:transparent!important;padding:0!important}
    .human-pick{display:none!important}
    .case-checkpoint-heading{display:grid!important;grid-template-columns:auto minmax(0,1fr) minmax(100px,26%);align-items:start!important;column-gap:8px!important}
    .case-checkpoint-heading>.case-checkpoint-text{font-size:14px;font-weight:500;line-height:1.75;color:var(--pet-text)}
    .case-checkpoint-heading>.case-evidence{margin:0;justify-content:flex-end;align-content:start;gap:4px}
    .case-checkpoint-heading .case-evidence button{font-size:11px}
    .case-evaluation{margin:10px 0 16px 0;display:block!important}
    .case-evaluation .case-score-options.is-rating{display:flex;flex-direction:column;flex-wrap:nowrap;gap:2px;width:100%;margin:0}
    .case-evaluation .is-rating label{display:grid;grid-template-columns:max-content minmax(0,1fr) 16px;align-items:start;justify-content:start;gap:10px;width:100%;min-width:0;height:auto;min-height:36px;padding:7px 10px;border:0;border-radius:6px;background:transparent;box-shadow:none;color:var(--pet-text);font-size:13px;font-weight:400;line-height:1.7;text-align:left}
    .case-evaluation .is-rating label:hover{background:color-mix(in srgb,var(--pet-text) 4%,transparent)}
    .case-evaluation .is-rating label:has(input:checked){background:color-mix(in srgb,var(--pet-accent) 8%,transparent);box-shadow:none;font-weight:400}
    .case-evaluation .is-rating label:has(input:checked) .case-score-number{color:var(--pet-accent)}
    .case-evaluation .is-rating label:has(input:focus-visible){outline:1px solid var(--pet-accent);outline-offset:-1px}
    .case-evaluation .is-rating .case-score-number{grid-column:1;grid-row:1;min-width:0;text-align:left;font-weight:500;white-space:nowrap;font-variant-numeric:tabular-nums}
    .case-evaluation .is-rating .case-score-description{grid-column:2;grid-row:1;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere}
    .case-evaluation .is-rating .case-score-check{grid-column:3;grid-row:1;width:16px;height:16px;margin-top:3px;color:var(--pet-accent);visibility:hidden;pointer-events:none}
    .case-evaluation .is-rating label:has(input:checked) .case-score-check{visibility:visible}
    .case-evaluation:has(.is-rating) .case-note:not(.is-editing){margin-top:12px;min-height:28px;padding:3px 10px}
    .case-note{margin:14px 0 0;padding:6px 10px;min-height:36px;color:var(--pet-text);font-size:13px;line-height:1.75}
    .case-note:empty:before{content:'添加评分说明…';color:var(--pet-muted);font-size:12px}
    .case-native-diff:empty{display:none}
    .human-card{container-type:inline-size}
    @container (max-width:360px){
      .case-checkpoint-heading{grid-template-columns:auto minmax(0,1fr)!important}
      .case-checkpoint-heading>.case-evidence{grid-column:1/-1;justify-self:end;margin-top:5px}
      .case-checkpoint-heading>.case-checkpoint-text{overflow-wrap:anywhere}
    }

    @container (max-width:300px){
      .case-evaluation .is-rating label{grid-template-columns:minmax(0,1fr) 16px;gap:3px 8px;padding:7px 8px}
      .case-evaluation .is-rating .case-score-description{grid-column:1/-1;grid-row:2}
      .case-evaluation .is-rating .case-score-check{grid-column:2}
    }

    .case-checkpoint-text>del{font-weight:400;text-decoration:line-through}
    .case-checkpoint-text>ins{font-weight:500;text-decoration:none}
    .case-edit-tools{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin:7px 0 0;font-size:12px;line-height:24px;cursor:default}
    .case-edit-label{color:var(--pet-accent);margin-right:auto;font-weight:500}
    .case-edit-tools button{display:inline-flex;align-items:center;gap:4px;padding:0 7px;min-height:26px;font:inherit;color:var(--pet-text);background:var(--pet-raised);border:1px solid var(--pet-border);border-radius:5px;cursor:pointer}
    .case-edit-tools button:disabled{opacity:.45;cursor:default}.case-edit-tools button:focus-visible{outline:1px solid var(--pet-accent);outline-offset:2px}

    .case-inline-editor.is-editing{box-sizing:border-box;min-height:0;padding:0;border:0;outline:1px solid var(--pet-accent);outline-offset:5px;border-radius:3px;background:var(--pet-input);box-shadow:none}
    .case-inline-editor.is-editing .case-inline-input{display:block;box-sizing:border-box;width:100%;min-height:24px;height:auto;padding:0;margin:0;border:0;border-radius:3px;outline:0!important;resize:none;overflow:hidden;background:transparent;font-family:inherit;font-size:14px;font-weight:500;line-height:1.75;color:color-mix(in srgb,var(--pet-text) 85%,var(--pet-accent));caret-color:var(--pet-accent)}
    .case-inline-input::placeholder{color:var(--pet-muted);opacity:1;font-weight:400}

  `;
  function createComparisonSurface(){
    const directory=el('aside','','case-toc'),grid=el('div','','comparison-columns'),area=el('div','','case-compare-review');
    area.append(directory,grid);return {directory,grid,area};
  }
  function createComparisonColumn(title=''){
    const node=el('section','','model-column'),host=el('div','','model-editor'),root=el('div');
    root.style.height='auto';host.attachShadow({mode:'open'}).append(root);
    const heading=title?el('h3',title,'quality-column-heading'):null;if(heading)node.append(heading);node.append(host);
    return {node,host,root,heading};
  }
  // Source and accepted columns use the same rubric renderer as annotation.
  // Only this composition owns approval controls and the quality write target.
  class QualityReviewPanel {
    constructor(editor){this.editor=editor;this.columns=new Map();this.request=0;this.active=true;}
    async mount(body){
      const surface=createComparisonSurface();
      this.caseDirectory=surface.directory;this.grid=surface.grid;this.area=surface.area;
      this.grid.classList.add('quality-columns');this.tabs=el('nav','','case-rank-buttons quality-work-tabs');this.tabs.setAttribute('aria-label','质检工作项');body.append(this.tabs,this.area);
      this.grid.addEventListener('scroll',()=>this.caseEditor?.updateDirectoryPosition(this.caseDirectory));
      this.resizeObserver=new ResizeObserver(()=>this.scheduleLayout());this.resizeObserver.observe(this.grid);
      await this.render();
    }
    async render(){
      if(this.loading){this.renderAgain=true;return;}
      const request=++this.request,e=this.editor,s=e.caseSession,top=this.grid.scrollTop,left=this.grid.scrollLeft;
      const focused=this.grid.getRootNode().activeElement?.getAttribute?.('aria-label');
      this.loading=true;
      const sources=C.annotationSources(s),specs=[];this.allSources=sources;
      this.order ||= sources.map(x=>x.work.id);this.hidden ||= new Set();
      this.order=this.order.filter(id=>sources.some(x=>x.work.id===id));for(const item of sources)if(!this.order.includes(item.work.id))this.order.push(item.work.id);
      const tabsKey=JSON.stringify([this.order,[...this.hidden],sources.map(x=>[x.work.id,x.work.name])]);
      if(tabsKey!==this.tabsKey){this.renderWorkTabs(sources);this.tabsKey=tabsKey;}
      const fullData=data=>{const copy=structuredClone(data||{original_rubric:s.source,models:[]});let record=copy.models.find(m=>m.model===e.caseModelName);if(!record){record={model:e.caseModelName,rubric:C.normalizeRubric(copy.original_rubric)};copy.models.push(record);}else {const ids=new Set(record.rubric.dimensions.map(d=>d.dimension_id));for(const d of C.normalizeRubric(copy.original_rubric).dimensions)if(!ids.has(d.dimension_id))record.rubric.dimensions.push(d);}return copy;};
      for(const id of this.order){const item=sources.find(x=>x.work.id===id);if(!this.hidden.has(id))specs.push({id,title:`${item.person||item.work.name}${item.person?' · '+item.work.name:''}`,kind:'source',source:item,error:item.error,data:item.error?{original_rubric:s.source,models:[]}:fullData(item.data)});}
      specs.push({id:'accepted',title:'我的质检',kind:'accepted',data:structuredClone(s.data)});
      this.grid.style.gridTemplateColumns=`repeat(${specs.length},minmax(280px,1fr))`;
      const dimensions=new Map();for(const spec of specs)for(const d of spec.data.models.find(m=>m.model===e.caseModelName)?.rubric.dimensions||[])if(!dimensions.has(d.dimension_id))dimensions.set(d.dimension_id,d);
      this.dimensionOrder=[...dimensions.keys()];
      const ids=new Set(specs.map(spec=>spec.id));
      for(const [id,record] of this.columns)if(!ids.has(id)){record.editor?.dispose();record.node.remove();this.columns.delete(id);}
      const tasks=specs.map(async spec=>{
        const previous=this.columns.get(spec.id),signature=JSON.stringify([spec.title,spec.error,spec.data]);
        if(previous?.signature===signature)return;
        const {node,heading,host,root}=createComparisonColumn(spec.title);
        // Keep the previous visible column until its replacement is fully mounted.
        if(previous)Object.assign(node.style,{position:'absolute',visibility:'hidden',width:previous.node.clientWidth+'px',pointerEvents:'none'});
        const commit=entry=>{
          if(request!==this.request||!this.active){entry.editor?.dispose();node.remove();return false;}
          node.dataset.qualityColumn=spec.kind;
          if(previous){previous.editor?.dispose();previous.node.replaceWith(node);for(const key of ['position','visibility','width','pointerEvents'])node.style[key]='';}
          this.columns.set(spec.id,{...entry,signature,spec});return true;
        };
        if(spec.kind==='source'){node.style.userSelect='none';node.style.webkitUserSelect='none';node.addEventListener('copy',event=>event.preventDefault());}
        node.classList.add('quality-column');node.dataset.qualityColumn=previous?'pending':spec.kind;node.dataset.sourceWork=spec.source?.work.id||'';this.grid.append(node);
        const record=spec.data.models.find(m=>m.model===e.caseModelName);
        if(!record?.rubric.dimensions.length){root.className='result-list';root.append(el('style',styles));const meta=el('div','','quality-record-meta');if(spec.error)meta.append(el('p',spec.error,'quality-warning'));root.append(meta);commit({node,heading,root});return;}
        const view=new CaseHumanEvaluation({root,onWrite:e.writeCell,qualitySourceView:{data:spec.data,record,kind:spec.kind,workId:spec.source?.work.id,workName:spec.source?.work.name,owner:e,selection:e.getModelSelection()}});
        view.compareHost=this;view.setActive(false);view.setRow(e.row);
        (this.pendingViews ||= new Set()).add(view);
        await view.setActive(true);this.pendingViews.delete(view);if(!commit({node,heading,root,editor:view}))return;

      });
      await Promise.all(tasks);if(request!==this.request||!this.active)return;
      for(const [index,spec] of specs.entries()){const node=this.columns.get(spec.id)?.node;if(node&&this.grid.children[index]!==node)this.grid.insertBefore(node,this.grid.children[index]||null);}
      this.columns=new Map(specs.map(spec=>[spec.id,this.columns.get(spec.id)]).filter(([,record])=>record));
      // Same stable dimension order, including blank cells, aligns differing sources.
      for(const record of this.columns.values()){
        const list=record.editor?.details||record.root,groups=[...list.querySelectorAll(':scope > [data-dimension-id]')];
        const byId=new Map(groups.map(n=>[n.dataset.dimensionId,n]));
        list.querySelectorAll(':scope > .case-category').forEach(n=>n.remove());
        for(const id of this.dimensionOrder){let section=byId.get(id);if(!section){section=el('section','','human-group quality-missing');section.dataset.dimensionId=id;section.setAttribute('aria-hidden','true');}list.append(section);}
        // Keep complete ranking/reference metadata after the dimensions.
        list.querySelectorAll(':scope > .case-ranking').forEach(n=>list.append(n));
      }
      this.refreshRankControls();
      this.caseEditor=[...this.columns.values()].find(x=>x.editor)?.editor;
      this.caseEditor?.renderDirectory(this.caseDirectory,(id,criterionId)=>{this.caseEditor.navigateDimension(id,criterionId);this.grid.scrollTop=Math.max(0,this.grid.scrollTop-([...this.columns.values()][0]?.heading.offsetHeight||0));this.caseEditor.pinDirectorySelection(id,criterionId);});
      if(!this.caseEditor){this.caseDirectory.directorySignature='';this.caseDirectory.replaceChildren(el('div','目录','case-toc-heading'));const nav=el('nav','','case-toc-list'),rank=button('整体感受排序',()=>{this.caseRanking?.scrollIntoView({block:'start'});rank.setAttribute('aria-current','location');},'跳转整体排序');nav.append(rank);this.caseDirectory.append(nav);}
      this.loading=false;this.refreshSelection();this.align();this.grid.scrollTop=top;this.grid.scrollLeft=left;
      if(focused)for(const r of this.columns.values())r.root.querySelectorAll?.('[aria-label]').forEach(n=>{if(n.getAttribute('aria-label')===focused)n.focus({preventScroll:true});});
      e.updateSaveStatus();
      if(this.renderAgain){this.renderAgain=false;await this.render();}
    }
    renderWorkTabs(sources){
      this.tabs.replaceChildren();
      for(const id of this.order){const source=sources.find(x=>x.work.id===id),tab=button(source.work.name,()=>{if(this.suppressClick){this.suppressClick=false;return;}if(this.hidden.has(id))this.hidden.delete(id);else this.hidden.add(id);this.render();},`显示工作项 ${source.work.name}`);tab.className='case-rank-model';tab.style.setProperty('--model-color',['#b09acb','#67acb0','#c6a06b','#c68fa5'][sources.indexOf(source)%4]);tab.dataset.workId=id;tab.setAttribute('aria-pressed',String(!this.hidden.has(id)));tab.draggable=true;
        tab.ondragstart=event=>{this.dragged=id;event.dataTransfer.setData('text/plain',id);};
        tab.ondragover=event=>{event.preventDefault();};
        tab.ondrop=event=>{event.preventDefault();const from=this.dragged;if(!from||from===id)return;this.order=this.order.filter(x=>x!==from);const r=tab.getBoundingClientRect();this.order.splice(this.order.indexOf(id)+(event.clientX>r.x+r.width/2?1:0),0,from);this.suppressClick=true;this.render();};
        tab.ondragend=()=>{this.dragged=null;setTimeout(()=>{this.suppressClick=false;},0);};
        tab.onkeydown=event=>{if(!event.altKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const at=this.order.indexOf(id),next=Math.max(0,Math.min(this.order.length-1,at+(event.key==='ArrowLeft'?-1:1)));this.order.splice(at,1);this.order.splice(next,0,id);this.render();};this.tabs.append(tab);
      }
    }
    noteAdoption(action){
      this.lastAdoption={...action,model:this.editor.caseModelName};
      this.refreshAdoptionState();
    }
    refreshAdoptionState(){
      if(!this.active||!this.grid)return;
      const s=this.editor.caseSession;if(!s)return;
      const name=this.editor.caseModelName,fp=globalThis.__cyleStorageServiceV1.fingerprint,weights=C.weightSources(s.data),record=s.data.models.find(m=>m.model===name);
      const items=d=>[...(d?.objective_checkpoints||[]),...(d?.subjective_checkpoints||[])];
      const approvalFor=(data,id)=>data.approvals?.find(a=>a.model===name&&a.dimension_id===id);
      const sourceFor=(approval,id)=>approval?.checkpoint_sources?.find(c=>c.checkpoint_id===id)?.source_work_id||approval?.source_work_id;
      for(const r of this.columns.values()){
        if(r.spec.kind!=='source'||!r.editor)continue;
        for(const section of r.editor.details?.querySelectorAll('[data-dimension-id]')||[]){
          const id=section.dataset.dimensionId,d=r.spec.data.models.find(m=>m.model===name)?.rubric.dimensions.find(d=>d.dimension_id===id),target=record?.rubric.dimensions.find(d=>d.dimension_id===id),approval=approvalFor(s.data,id),workId=r.spec.source?.work.id;
          const weight=section.querySelector('.case-weight'),weightRef=weights[id],selectedWeight=!r.spec.error&&weightRef?.source_work_id===workId&&weightRef?.weight_fingerprint===fp(d?.weight)&&s.data.dimension_weights?.[id]===d?.weight;
          if(weight){weight.classList.toggle('quality-adopted',!!selectedWeight);weight.setAttribute('aria-pressed',String(!!selectedWeight));weight.setAttribute('aria-description',selectedWeight?'当前采用此来源的维度权重':'双击采用此维度权重，保留其他维度');}
          for(const card of section.querySelectorAll('[data-criterion-id]')){
            const checkpointId=card.dataset.criterionId,source=items(d).find(c=>c.checkpoint_id===checkpointId),accepted=items(target).find(c=>c.checkpoint_id===checkpointId),ref=approval?.checkpoint_sources?.find(c=>c.checkpoint_id===checkpointId);
            const matches=ref?ref.source_fingerprint===fp(source):source&&accepted&&C.qualityEditFingerprint({objective_checkpoints:[source]})===C.qualityEditFingerprint({objective_checkpoints:[accepted]});
            const selected=!r.spec.error&&!!accepted&&sourceFor(approval,checkpointId)===workId&&!!matches;
            card.classList.toggle('quality-adopted',selected);card.setAttribute('aria-description',selected?'当前采用此项；双击其他来源的同项可替换':'双击采用此检查点');
          }
        }
      }
      const accepted=this.columns.get('accepted');if(!accepted||this.loading)return;
      const last=this.lastAdoption,active=last?.model===name,root=accepted.editor?.details||accepted.root;
      const target=active?[...root.querySelectorAll('[data-dimension-id]')].find(n=>n.dataset.dimensionId===last.dimensionId):null;
      let received=null;
      if(active&&last.kind==='checkpoint'){
        const current=sourceFor(approvalFor(s.data,last.dimensionId),last.checkpointId),rendered=sourceFor(approvalFor(accepted.spec.data,last.dimensionId),last.checkpointId);
        if(current===last.workId&&rendered===last.workId)received=[...target?.querySelectorAll('[data-criterion-id]')||[]].find(n=>n.dataset.criterionId===last.checkpointId);
      }else if(active&&last.kind==='weight'&&weights[last.dimensionId]?.source_work_id===last.workId&&C.weightSources(accepted.spec.data)[last.dimensionId]?.source_work_id===last.workId){
        received=target?.querySelector('.case-weight')||accepted.heading.querySelector('.quality-weight-status');
      }
      for(const node of accepted.node.querySelectorAll('.quality-received'))if(node!==received)node.classList.remove('quality-received');
      // The editor lives in a shadow root; clear its previous received target too.
      for(const node of root.querySelectorAll('.quality-received'))if(node!==received)node.classList.remove('quality-received');
      received?.classList.add('quality-received');
    }
    refreshSelection(){
      if(this.loading||!this.active||!this.grid)return;
      const s=this.editor.caseSession,name=this.editor.caseModelName,accepted=this.columns.get('accepted');
      const target=s.data.models.find(m=>m.model===name),sources=[...this.columns.values()].filter(r=>r.spec?.kind==='source');
      const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
      const sectionFor=(r,id)=>[...(r?.editor?.details||r?.root)?.querySelectorAll('[data-dimension-id]')||[]].find(n=>n.dataset.dimensionId===id);
      const cardFor=(section,id)=>[...section?.querySelectorAll('[data-criterion-id]')||[]].find(n=>n.dataset.criterionId===id);
      const checkpoints=d=>[...(d?.objective_checkpoints||[]),...(d?.subjective_checkpoints||[])];
      const mark=(node,kind,changed)=>{if(node)node.classList.toggle('quality-diff-'+kind,changed);};
      const textDiff=(node,value,other,kind)=>{
        if(!node||node.querySelector('textarea'))return;
        value=String(value??'');other=String(other??'');const key=JSON.stringify([value,other,kind]);if(node.dataset.qualityTextDiff===key){node.querySelectorAll('del,ins').forEach(n=>n.classList.add('quality-diff-'+kind));return;}node.dataset.qualityTextDiff=key;node.replaceChildren();
        if(value===other){node.textContent=value;return;}
        let start=0,end=0;while(start<value.length&&start<other.length&&value[start]===other[start])start++;
        while(end<value.length-start&&end<other.length-start&&value[value.length-1-end]===other[other.length-1-end])end++;
        node.append(document.createTextNode(value.slice(0,start)),el(kind==='removed'?'del':'ins',value.slice(start,value.length-end),'quality-diff-'+kind),document.createTextNode(end?value.slice(-end):''));
      };
      for(const r of this.columns.values())for(const n of (r.editor?.details||r.root).querySelectorAll('.quality-diff-added,.quality-diff-removed'))n.classList.remove('quality-diff-added','quality-diff-removed');
      const baseline=sources.find(r=>!r.spec.error),reference=baseline?.spec.data.models.find(m=>m.model===name)?.rubric;
      this.tabs.title=baseline?`标注差异以${baseline.spec.title}为基准`:'';
      for(const source of sources)source.heading.title=baseline?`差异基准：${baseline.spec.title}；双击检查点采用或替换，双击权重仅采用该维度`:'';
      const dimensionFor=(r,id)=>r?.spec.data.models.find(m=>m.model===name)?.rubric.dimensions.find(d=>d.dimension_id===id);

      for(const r of sources)for(const d of r.spec.data.models.find(m=>m.model===name)?.rubric.dimensions||[]){
        const section=sectionFor(r,d.dimension_id);if(!section||r.spec.error)continue;
        const isBase=r===baseline,others=sources.filter(x=>x!==r&&!x.spec.error),kind=isBase?'removed':'added';
        const peers=others.map(x=>dimensionFor(x,d.dimension_id)).filter(Boolean),base=reference?.dimensions.find(x=>x.dimension_id===d.dimension_id);
        const dimensions=isBase?peers:[base].filter(Boolean);
        mark(section.querySelector('.case-weight'),kind,dimensions.some(x=>!same(x.weight,d.weight)));
        for(const c of checkpoints(d)){
          const card=cardFor(section,c.checkpoint_id);if(!card)continue;
          const peersFor=dimensions.map(x=>checkpoints(x).find(y=>y.checkpoint_id===c.checkpoint_id));
          const other=isBase?peersFor.find(x=>!same(x?.checkpoint,c.checkpoint)):peersFor[0];
          const different=peersFor.length>0&&peersFor.some(x=>!same(x?.checkpoint,c.checkpoint));
          textDiff(card.querySelector('.case-checkpoint-text'),c.checkpoint,different?(other?.checkpoint??''):c.checkpoint,kind);
          mark(card.querySelector('.case-native-scores'),kind,peersFor.some(x=>!same(x?.score??null,c.score??null)));
          mark(card.querySelector('.case-note'),kind,peersFor.some(x=>!same(x?.reason||'',c.reason||'')));
          mark(card.querySelector('.case-evidence'),kind,peersFor.some(x=>!same(x?.evidence||[],c.evidence||[])));
          for(const n of card.querySelectorAll('[data-quality-field]'))mark(n,kind,peersFor.some(x=>!same(x?.[n.dataset.qualityField],c[n.dataset.qualityField])));
        }
        mark(section.querySelector('.case-other'),kind,dimensions.some(x=>!same(x.other||[],d.other||[])));
        for(const n of section.querySelectorAll('[data-quality-field]'))if(!n.closest('[data-criterion-id]'))mark(n,kind,dimensions.some(x=>!same(x[n.dataset.qualityField],d[n.dataset.qualityField])));
      }
      if(accepted){
        let status=accepted.heading.querySelector('.quality-weight-status');
        if(s.data.dimension_weights){
          if(!status){status=el('span','','quality-weight-status');accepted.heading.append(status);}
          const weights=C.weightDimensions(s).map(d=>d.weight),total=weights.every(Number.isFinite)?weights.reduce((a,b)=>a+b,0):NaN;
          let valid=true;try{C.validateWeights(s);}catch{valid=false;}
          status.textContent=`权重合计 ${Number.isFinite(total)?Number(total.toFixed(9)):'未设置'} / 25${valid?'':'（需调整）'}`;status.title=Object.entries(C.weightSources(s.data)).map(([id,ref])=>`${id}：${ref.source_name||'标注'}`).join('；');
        }
        else status?.remove();
      }
      for(const d of target?.rubric.dimensions||[]){
        const section=sectionFor(accepted,d.dimension_id);if(!section)continue;
        const candidates=sources.map(r=>r.spec.data.models.find(m=>m.model===name)?.rubric.dimensions.find(x=>x.dimension_id===d.dimension_id)).filter(Boolean);
        mark(section.querySelector('.case-weight'),'added',candidates.length>0&&!candidates.some(x=>same(x.weight,d.weight)));
        for(const c of checkpoints(d)){
          const card=cardFor(section,c.checkpoint_id),before=candidates.flatMap(checkpoints).filter(x=>x.checkpoint_id===c.checkpoint_id);if(!card)continue;
          const approval=s.data.approvals?.find(a=>a.model===name&&a.dimension_id===d.dimension_id),ref=approval?.checkpoint_sources?.find(x=>x.checkpoint_id===c.checkpoint_id),workId=ref?.source_work_id||approval?.source_work_id;
          const chosen=sources.find(r=>r.spec.source?.work.id===workId),sourceData=this.allSources?.find(r=>r.work.id===workId)?.data,chosenDimension=sourceData?.models.find(m=>m.model===name)?.rubric.dimensions.find(x=>x.dimension_id===d.dimension_id),chosenCheckpoint=checkpoints(chosenDimension||dimensionFor(chosen,d.dimension_id)).find(x=>x.checkpoint_id===c.checkpoint_id);
          const matching=before.find(x=>x.checkpoint===c.checkpoint),base=chosenCheckpoint||matching||before[0];
          let label=card.querySelector('.quality-adoption-label');if(!label){label=el('span','','quality-adoption-label');card.querySelector('header').after(label);}label.textContent=workId?`采用自 ${chosen?.spec.source?.work.name||ref?.source_name||approval?.source_name||'标注'}`:'质检已修改';
          textDiff(card.querySelector('.case-checkpoint-text'),c.checkpoint,base?.checkpoint??c.checkpoint,'added');
          mark(card.querySelector('.case-native-scores'),'added',before.length>0&&!before.some(x=>same(x.score,c.score)));
          mark(card.querySelector('.case-note'),'added',before.length>0&&!before.some(x=>same(x.reason||'',c.reason||'')));
          mark(card.querySelector('.case-evidence'),'added',before.length>0&&!before.some(x=>same(x.evidence||[],c.evidence||[])));
          for(const n of card.querySelectorAll('[data-quality-field]'))mark(n,'added',before.length>0&&!before.some(x=>same(x[n.dataset.qualityField],c[n.dataset.qualityField])));
        }
        mark(section.querySelector('.case-other'),'added',candidates.length>0&&!candidates.some(x=>same(x.other||[],d.other||[])));
        for(const n of section.querySelectorAll('[data-quality-field]'))if(!n.closest('[data-criterion-id]'))mark(n,'added',candidates.length>0&&!candidates.some(x=>same(x[n.dataset.qualityField],d[n.dataset.qualityField])));
      }
      this.refreshAdoptionState();
    }
    setCaseControls(){}
    refreshRankControls(){
      const accepted=this.columns.get('accepted'),s=this.editor.caseSession;if(!accepted||!s)return;
      const list=accepted.editor?.details||accepted.root;
      let host=list.querySelector(':scope > .case-ranking');if(!host){host=el('section');list.append(host);}
      if(this.caseRanking!==host||this.rankingSession!==s){this.caseRanking=host;this.rankingSession=s;this.editor.renderRanking(host);}
      else host.refreshRanking?.();
    }
    updateCaseNavigation(){}
    scheduleLayout(){if(!this.active||this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=0;if(!this.loading)this.align();});}
    align(){
      const records=[...this.columns.values()];
      const rows=new Map();for(const r of records)for(const n of r.editor?.details?.querySelectorAll('[data-criterion-id]')||[]){n.style.minHeight='';n.style.marginTop='';const key=JSON.stringify([n.closest('[data-dimension-id]')?.dataset.dimensionId,n.dataset.criterionId]);if(!rows.has(key))rows.set(key,[]);rows.get(key).push(n);}
      for(const nodes of rows.values()){const offsets=nodes.map(n=>n.getBoundingClientRect().top-n.closest('[data-dimension-id]').getBoundingClientRect().top),top=Math.max(...offsets);nodes.forEach((n,i)=>{const scale=n.getBoundingClientRect().height/n.offsetHeight||1;n.style.marginTop=(parseFloat(getComputedStyle(n).marginTop)||0)+(top-offsets[i])/scale+'px';});const height=Math.max(...nodes.map(n=>n.offsetHeight));for(const n of nodes)n.style.minHeight=height+'px';}
      alignDimensionColumns(records.map(r=>r.editor?.details||r.root),this.grid);
      const headers=records.map(r=>r.heading);headers.forEach(n=>n.style.minHeight='');const height=Math.max(0,...headers.map(n=>n.offsetHeight));headers.forEach(n=>n.style.minHeight=height+'px');
    }
    refresh(){this.refreshSelection();this.refreshRankControls();}
    disposeColumns(){for(const record of this.columns.values())record.editor?.dispose();this.columns.clear();}
    dispose(){this.active=false;this.request++;cancelAnimationFrame(this.frame);this.resizeObserver?.disconnect();for(const view of this.pendingViews||[])view.dispose();this.pendingViews?.clear();this.disposeColumns();}
  }
  function alignDimensionColumns(lists,viewport){
    const top=viewport.scrollTop,groups=new Map();
    const metas=lists.map(list=>list?.querySelector(':scope > .quality-record-meta')).filter(Boolean);metas.forEach(n=>n.style.minHeight='');const metaHeight=Math.max(0,...metas.map(n=>n.offsetHeight));metas.forEach(n=>n.style.minHeight=metaHeight+'px');
    for(const list of lists)for(const section of list?.querySelectorAll(':scope > [data-dimension-id]')||[]){section.style.minHeight='';const id=section.dataset.dimensionId;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(section);}
    const sizes=[...groups.values()].map(nodes=>({nodes,height:Math.max(...nodes.map(n=>n.offsetHeight))}));
    for(const {nodes,height} of sizes)for(const n of nodes)n.style.minHeight=height+'px';viewport.scrollTop=top;
  }

  class CaseHumanEvaluation extends globalThis.__cyleHumanEvaluationV1 {
    constructor(context){
      super(context);this.caseMode=true;this.qualitySourceView=context.qualitySourceView;
      this.workChanged=()=>{if(this.active!==false)this.update();else this.needsRefresh=true;};
      if(!this.qualitySourceView)document.addEventListener('cyle:work-item-selected',this.workChanged);
    }
    async update(){this.closeWeightPanel?.();this.finishTextEdit?.();this.qualityPanel?.dispose();this.qualityPanel=null;this.caseSession?.views.delete(this);this.caseSession=null;return super.update();}
    getModelSelection(){return this.qualitySourceView?.selection||super.getModelSelection();}
    async renderHumanPage(fields,mapping,model){
      this.closeWeightPanel?.();
      this.qualityPanel?.dispose();this.qualityPanel=null;
      const revision=this.revision;this.caseMapping=mapping;this.caseModelName=model.name;
      this.caseSession?.views.delete(this);this.caseSession=null;this.prefillError='';this.sourceResult=null;this.humanSources=[];
      let source,error='';
      try{source=Q.load(this.row,mapping).snapshot;}catch(e){error=e.message;}
      const selected=globalThis.__cyleSelectedWorkItemV1;
      this.caseWorkId=selected?.tableKey===M.key(this.row)?selected.id:'';
      if(!this.caseWorkId){this.body.dataset.workspaceType='';return;}
      if(this.qualitySourceView){const v=this.qualitySourceView;this.caseSession={ctx:v.owner.caseSession.ctx,data:structuredClone(v.data),views:new Set(),saving:false,conflict:false};source=v.data.original_rubric;if(v.kind==='accepted'){const record=this.caseSession.data.models.find(m=>m.model===this.caseModelName),previous=new Map(record.rubric.dimensions.map(d=>[d.dimension_id,C.qualityEditFingerprint(d)]));this.caseSession.qualityCommit=()=>C.commitQualityRecord(v.owner.caseSession,record,previous,this);}}
      else if(source&&this.caseWorkId){try{this.caseSession=await C.open(this.row,mapping,this.caseWorkId);}catch(e){this.prefillError=e.message;}}
      if(revision!==this.revision)return;
      if(this.caseSession){this.caseSession.views.add(this);this.humanSources=[this.caseSession.ctx.target];}
      this.previewRecord=source?{model:model.name,rubric:C.normalizeRubric(source)}:null;
      this.syncCaseModel();
      this.body.dataset.workspaceType=this.caseSession?.ctx.work.workType||'';
      this.qualityPanel=!this.qualitySourceView&&this.caseSession?.ctx.work.workType==='quality'?new QualityReviewPanel(this):null;
      this.data=globalThis.__cyleEvaluationTimelineV1.build(null,null);this.metadata=new WeakMap();this.allItems=[];this.untimedItems=[];this.categories=new Map();this.scoreFilter='';
      this.appendHumanStyles();const style=el('style',styles);this.body.append(style);
      this.caseControls=el('div','','case-controls');this.renderCaseControls();
      if(error){const n=el('p',error,'empty');n.dataset.state='question-rubric-unavailable';this.body.append(n);}
      this.renderTimeline();this.scoreBar.hidden=true;
      if(this.qualityPanel){this.bindVideo();this.layout();await this.qualityPanel.mount(this.body);this.details=this.qualityPanel.grid;this.body.append(this.caseControls);this.updateSaveStatus();return;}
      this.tabBar=el('nav','','evaluation-tabs');this.tabBar.setAttribute('aria-label','人评子栏目');this.body.append(this.tabBar);this.renderTabs();
      this.details=el('div','','result-list');
      if(this.compareHost)this.body.append(this.details);
      else {
        this.reviewLayout=el('div','','case-review-layout');this.directory=el('aside','','case-toc');
        this.reviewLayout.append(this.directory,this.details);this.body.append(this.reviewLayout,this.caseControls);
      }
      this.bindVideo();this.layout();this.renderDetails();this.body.dataset.humanSource=this.caseSession?String(this.caseSession.ctx.target.source.index):'';
      if(this.compareHost&&(!this.compareHost.caseEditor||this.compareHost.caseEditor===this))this.compareHost.setCaseControls(this);
      this.compareHost?.scheduleLayout();
    }
    syncCaseModel(){
      const record=this.caseSession?(this.caseSession.data.models.find(m=>m.model===this.caseModelName)||this.previewRecord):this.previewRecord;
      this.caseRecord=record;this.template=record?Q.parse(record.rubric):null;
      this.groups=this.template?.dimension_groups||[];
      this.humanState={answers:record?C.answers(record):[],submitting:!!this.caseSession?.saving,conflict:!!this.caseSession?.conflict};
      for(const answer of this.humanState.answers){const criterion=this.groups.flatMap(g=>g.criteria).find(c=>c.id===answer.criterionId);if(answer.score!=null&&!criterion?.score_values.includes(answer.score))answer.status='needs_review';}
      if(!this.groups.some(g=>`group:${g.id}`===this.view))this.view='all';
    }
    renderTabs(){this.view='all';this.tabBar.replaceChildren();this.tabBar.hidden=true;}
    get caseWritable(){if(this.qualitySourceView?.kind==='accepted'){const owner=this.qualitySourceView.owner,s=owner.caseSession;return s?.data.quality_mode==='dimension-approval/1'&&!s.saving&&!s.conflict&&!owner.prefillError&&globalThis.__cyleSelectedWorkItemV1?.id===owner.caseWorkId;}return !this.qualitySourceView&&(!this.qualityPanel||(!this.qualityPanel.loading&&this.caseSession?.data.quality_mode==='dimension-approval/1'&&(this.caseSession.data.approvals.length>0||this.caseSession.dirty||this.caseSession.data.ranking?.length)))&&globalThis.__cyleSelectedWorkItemV1?.id===this.caseWorkId&&globalThis.__cyleSelectedWorkItemV1?.tableKey===M.key(this.row)&&!!this.caseSession&&!this.caseSession.saving&&!this.caseSession.conflict&&!this.prefillError;}
    get caseRankingWritable(){
      if(this.qualitySourceView)return false;
      const s=this.caseSession;
      return !!s&&!s.saving&&!s.conflict&&!this.prefillError&&globalThis.__cyleSelectedWorkItemV1?.id===this.caseWorkId&&globalThis.__cyleSelectedWorkItemV1?.tableKey===M.key(this.row);
    }
    caseSessionChanged(structure=false,sourceModel=null){
      if(!this.caseSession||!this.body?.isConnected)return;
      if(this.qualityPanel){if(sourceModel){this.qualityPanel.refreshSelection();this.qualityPanel.scheduleLayout();}else this.qualityPanel.render();this.updateSaveStatus();return;}
      this.humanState.submitting=this.caseSession.saving;this.humanState.conflict=this.caseSession.conflict;
      if(structure||!sourceModel||sourceModel===this.caseModelName){this.syncCaseModel();this.layout();if(this.details)this.refreshList();}
      if(sourceModel)this.updateSaveStatus();else this.renderCaseControls();
    }
    renderCaseControls(){
      if(!this.caseControls)return;
      const host=this.caseControls,s=this.caseSession;if(this.saveStatus&&host.contains(this.saveStatus)){this.updateSaveStatus();return;}host.replaceChildren();const bar=el('div','','case-bar');
      this.saveStatus=el('span',this.prefillError||s?.notice||(s?'':'请在顶部选择工作项'),'case-status');this.saveStatus.setAttribute('role','status');this.saveStatus.title='点击写回飞书即可保存；失败时自动保留备份。刷新后以飞书表格为准。';bar.append(this.saveStatus);

      host.append(bar);this.updateSaveStatus();
    }
    directoryState(){
      const holder=this.compareHost||this;
      const context=JSON.stringify([this.row?.tableKey,this.row?.rowIndex,this.caseWorkId]);
      if(holder.caseDirectoryState?.context!==context)holder.caseDirectoryState={context,pinned:null};
      return holder.caseDirectoryState;
    }
    pinDirectorySelection(dimension,checkpoint){
      const viewport=this.compareHost?.grid||this.details,state=this.directoryState();
      state.pinned={dimension,checkpoint,scrollTop:viewport.scrollTop};state.userScrollUntil=0;
      this.updateDirectoryPosition(this.compareHost?.caseDirectory||this.directory);
    }
    bindDirectoryInteractions(){
      const details=this.details,viewport=this.compareHost?.grid||details;
      if(!details.caseDirectoryInteractionBound){
        details.caseDirectoryInteractionBound=true;
        const select=event=>{
          const target=event.target.closest?.('[data-dimension-id],.case-ranking');
          if(target&&details.contains(target))this.pinDirectorySelection(target.dataset.dimensionId||'ranking',event.target.closest?.('[data-criterion-id]')?.dataset.criterionId);
        };
        for(const type of ['pointerdown','focusin','change'])details.addEventListener(type,select,true);
      }
      // The shared viewport belongs to the compare host, not to an individual column.
      // Look up its current editor when an event arrives so closed columns are not retained.
      if(viewport.caseDirectoryScrollBound)return;
      viewport.caseDirectoryScrollBound=true;
      const holder=this.compareHost||this,editor=()=>holder.caseEditor||holder;
      const intent=()=>{const current=editor();if(current.directoryState)current.directoryState().userScrollUntil=performance.now()+500;};
      viewport.addEventListener('wheel',intent,{passive:true,capture:true});
      viewport.addEventListener('touchmove',intent,{passive:true,capture:true});
      viewport.addEventListener('keydown',event=>{
        if(!['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key)||event.target.closest?.('input,textarea,select,[contenteditable=true]'))return;
        intent();
      },true);
      let scrollPointer=null;
      viewport.addEventListener('pointerdown',event=>{if(event.target===viewport){scrollPointer=event.pointerId;intent();}},true);
      viewport.addEventListener('pointermove',event=>{if(event.pointerId===scrollPointer&&event.buttons)intent();},true);
      const endPointer=()=>{scrollPointer=null;};
      for(const type of ['pointerup','pointercancel','lostpointercapture'])viewport.addEventListener(type,endPointer,true);
      const ranking=event=>{if(event.composedPath().some(n=>n.classList?.contains('case-ranking')))editor().pinDirectorySelection?.('ranking');};
      viewport.addEventListener('pointerdown',ranking,true);viewport.addEventListener('focusin',ranking,true);
    }
    renderDirectory(host,navigate){
      if(!host)return;
      const holder=this.compareHost||this,state=this.directoryState();
      const dimensions=(this.caseRecord?.rubric.dimensions||[]).map(d=>({d,group:this.groups.find(g=>g.id===d.dimension_id)})).filter(x=>x.group);
      const signature=JSON.stringify([state.context,!!holder.caseTocCollapsed,!!this.caseSession,dimensions.map(({d,group})=>[d.dimension_id,d.dimension_name,d.category,group.criteria.length])]);
      host.directoryNavigate=navigate;
      // Score edits and timeline/layout updates must not replace the focused menu.
      if(host.directorySignature===signature){this.updateDirectoryPosition(host);return;}
      const top=host.querySelector('.case-toc-list')?.scrollTop||0;
      host.directorySignature=signature;
      host.replaceChildren();host.className='case-toc'+(holder.caseTocCollapsed?' is-collapsed':'');
      const header=el('div','','case-toc-heading');
      if(!holder.caseTocCollapsed)header.append(el('strong','目录'));
      const toggle=button('',()=>{holder.caseTocCollapsed=!holder.caseTocCollapsed;this.renderDirectory(host,navigate);host.querySelector('.case-toc-toggle')?.focus({preventScroll:true});},holder.caseTocCollapsed?'展开目录':'收起目录');
      toggle.className='case-toc-toggle';toggle.title=holder.caseTocCollapsed?'展开目录':'收起目录';toggle.setAttribute('aria-expanded',String(!holder.caseTocCollapsed));
      toggle.append(globalThis.__gtmLucideIconsV1.create(holder.caseTocCollapsed?'PanelLeftOpen':'PanelLeftClose',{size:16}));header.append(toggle);host.append(header);
      const list=el('nav','','case-toc-list');list.setAttribute('aria-label','标注目录');host.append(list);let category='';
      for(const {d,group} of dimensions){
        if(d.category&&d.category!==category){list.append(el('div',d.category,'case-toc-category'));category=d.category;}
        const row=el('div','','case-toc-row');
        const entry=button('',()=>host.directoryNavigate(d.dimension_id),`跳转维度 ${d.dimension_id}`),label=el('span','','case-toc-label');
        label.append(el('span',d.dimension_id,'case-toc-id'),el('span',d.dimension_name,'case-toc-name'));
        const count=el('span',String(group.criteria.length),'case-toc-count');count.setAttribute('aria-label',`${group.criteria.length}个检查点`);count.title=`${group.criteria.length}个检查点`;entry.append(label,count);
        entry.title=`${d.dimension_id} ${d.dimension_name} · ${group.criteria.length}个检查点`;entry.dataset.dimensionLink=d.dimension_id;row.append(entry);list.append(row);
      }
      if(this.caseSession){const ranking=button('整体感受排序',()=>host.directoryNavigate('ranking'),'跳转整体排序');ranking.dataset.dimensionLink='ranking';list.append(ranking);}
      list.scrollTop=top;this.updateDirectoryPosition(host);
    }
    updateDirectoryPosition(host=this.directory){
      if(!host||!this.details)return;
      const viewport=this.compareHost?.grid||this.details,state=this.directoryState(),bounds=viewport.getBoundingClientRect();
      const scale=bounds.height/viewport.clientHeight||1,top=bounds.top+28*scale;
      let dimension,checkpoint;
      const userScrolled=state.userScrollUntil>performance.now()&&state.pinned&&Math.abs(state.pinned.scrollTop-viewport.scrollTop)>=1;
      if(state.pinned&&!userScrolled){({dimension,checkpoint}=state.pinned);state.pinned.scrollTop=viewport.scrollTop;}
      else {
        state.pinned=null;
        const sections=[...this.details.querySelectorAll('[data-dimension-id]')];
        let current=sections[0];for(const section of sections){if(section.getBoundingClientRect().top<=top)current=section;else break;}
        dimension=current?.dataset.dimensionId;
        for(const card of current?.querySelectorAll('[data-criterion-id]')||[]){if(card.getBoundingClientRect().top<=top)checkpoint=card.dataset.criterionId;else break;}
        const ranking=this.compareHost?.caseRanking||this.details.querySelector('.case-ranking');
        if(ranking&&!ranking.hidden&&ranking.getBoundingClientRect().top<=top){dimension='ranking';checkpoint=null;}
      }
      for(const entry of host.querySelectorAll('[data-dimension-link],[data-checkpoint-link]')){
        const isChild=entry.hasAttribute('data-checkpoint-link');
        const active=isChild?entry.dataset.checkpointLink===checkpoint:entry.dataset.dimensionLink===dimension;
        entry.classList.toggle('is-current',active);
        if(active)entry.setAttribute('aria-current','location');else entry.removeAttribute('aria-current');
      }
    }
    navigateDimension(id,criterionId){
      const viewport=this.compareHost?.grid||this.details;
      const target=id==='ranking'?(this.compareHost?.caseRanking||this.details.querySelector('.case-ranking')):criterionId
        ?[...this.details.querySelectorAll('[data-criterion-id]')].find(n=>n.dataset.criterionId===criterionId)
        :[...this.details.querySelectorAll('[data-dimension-id]')].find(n=>n.dataset.dimensionId===id);
      if(!target)return;const area=viewport.getBoundingClientRect(),rect=target.getBoundingClientRect();
      viewport.scrollTo({top:viewport.scrollTop+(rect.top-area.top)*(viewport.clientHeight/area.height)-8,behavior:'instant'});
      // Near the end, scrollTop is clamped: keep the explicitly chosen item selected.
      this.pinDirectorySelection(id,criterionId);
    }
    renderRanking(host){
      host.replaceChildren();host.className='case-ranking';host.setAttribute('aria-label','整体感受排序');
      if(!this.caseSession){host.hidden=true;return;}host.hidden=false;
      host.append(el('h3','整体感受排序'));this.rankingPanel(host);
    }
    setModelRank(name,index){
      const s=this.caseSession;if(!this.caseRankingWritable||!s.ctx.models.some(m=>m.name===name))return;
      const groups=(s.data.ranking||[]).map(g=>(Array.isArray(g)?g:[g]).filter(n=>n!==name));
      if(index!==null){if(!Number.isInteger(index)||index<0||index>groups.length)return;(groups[index] ||= []).push(name);}
      s.data.ranking=groups.filter(g=>g.length);C.changed(s,false,this);this.updateSaveStatus();
      this.compareHost?.updateCaseNavigation(this);

    }
    rankModelRelative(name,target,side){
      const s=this.caseSession,names=s?.ctx.models.map(m=>m.name)||[];
      if(!this.caseRankingWritable||name===target||!names.includes(name)||!names.includes(target))return;
      const groups=(s.data.ranking||[]).map(g=>(Array.isArray(g)?g:[g]).filter(n=>n!==name)).filter(g=>g.length);
      let index=groups.findIndex(g=>g.includes(target));if(index<0){groups.push([target]);index=groups.length-1;}
      if(side==='tie')groups[index].push(name);else groups.splice(index+(side==='after'?1:0),0,[name]);
      s.data.ranking=groups;C.changed(s,false,this);this.updateSaveStatus();this.compareHost?.updateCaseNavigation(this);
    }
    rankingPanel(panel){
      const s=this.caseSession,readonly=!!this.qualitySourceView,names=[...new Set([...s.ctx.models.map(m=>m.name),...(readonly?(s.data.ranking||[]).flat():[])])];panel.dataset.readonly=String(readonly);
      if(readonly&&!s.data.ranking?.length){panel.append(el('p','尚未排序','case-rank-hint'));return;}
      if(names.length<2){panel.append(el('p','当前只有一个模型，无需排序。'));return;}
      const board=el('div','','case-rank-buttons');panel.append(board);if(!readonly)panel.append(el('p','拖到按钮两侧调整先后，拖到中间并列。','case-rank-hint'));
      let signature='';
      let dragged=null;
      const clear=()=>{dragged=null;board.querySelectorAll('button').forEach(n=>{delete n.dataset.dropSide;n.classList.remove('is-dragging');});};
      const draw=()=>{
        const next=JSON.stringify([s.data.ranking||[],this.caseRankingWritable]);if(signature===next)return;signature=next;
        board.replaceChildren();const groups=(s.data.ranking||[]).map(g=>Array.isArray(g)?g:[g]),flat=groups.flat(),position=name=>flat.includes(name)?flat.indexOf(name):Infinity;
        const ordered=[...names].sort((a,b)=>position(a)-position(b));
        for(const name of ordered){
          const index=groups.findIndex(g=>g.includes(name)),tab=button(name,()=>{},`整体排序 ${name}`);
          tab.className='case-rank-model';tab.dataset.rankModel=name;tab.disabled=!this.caseRankingWritable;tab.draggable=this.caseRankingWritable;
          const colors=['#b09acb','#67acb0','#c6a06b','#c68fa5','#8aa5cb','#9eae77'];tab.style.setProperty('--model-color',colors[names.indexOf(name)%colors.length]);
          tab.append(el('span',index<0?'':`${index+1}${groups[index].length>1?' 并列':''}`,'case-rank-number'));
          tab.title=`${name}：${index<0?'未排序':`第 ${index+1} 名`}${readonly?'':'。Alt + 左右键调序，Alt + 退格取消排名。'}`;
          tab.ondragstart=e=>{if(!this.caseRankingWritable){e.preventDefault();return;}dragged=name;e.dataTransfer.setData('text/plain',name);e.dataTransfer.effectAllowed='move';tab.classList.add('is-dragging');};
          tab.ondragend=clear;
          tab.ondragover=e=>{if(!dragged||dragged===name||!this.caseRankingWritable)return;e.preventDefault();e.dataTransfer.dropEffect='move';const box=tab.getBoundingClientRect(),x=(e.clientX-box.left)/box.width;tab.dataset.dropSide=x<.3?'before':x>.7?'after':'tie';};
          tab.ondragleave=()=>delete tab.dataset.dropSide;
          tab.ondrop=e=>{e.preventDefault();const source=dragged,side=tab.dataset.dropSide;clear();if(source&&side&&this.caseSession===s){this.rankModelRelative(source,name,side);draw();}};
          tab.onkeydown=e=>{
            if(!e.altKey||!['ArrowLeft','ArrowRight','Backspace'].includes(e.key)||this.caseSession!==s)return;e.preventDefault();
            if(e.key==='Backspace')this.setModelRank(name,null);
            else {const target=ordered[ordered.indexOf(name)+(e.key==='ArrowLeft'?-1:1)];if(target)this.rankModelRelative(name,target,e.key==='ArrowLeft'?'before':'after');}
            draw();[...board.querySelectorAll('[data-rank-model]')].find(n=>n.dataset.rankModel===name)?.focus({preventScroll:true});
          };
          board.append(tab);
        }
        if(readonly)return;
        const reset=el('span','拖到此处取消排名','case-rank-reset');reset.dataset.rankDrop='unrank';
        reset.ondragover=e=>{if(dragged&&this.caseRankingWritable){e.preventDefault();reset.dataset.dropSide='tie';}};
        reset.ondragleave=()=>delete reset.dataset.dropSide;
        reset.ondrop=e=>{e.preventDefault();const name=dragged;clear();if(name&&this.caseSession===s){this.setModelRank(name,null);draw();}};board.append(reset);
      };
      panel.refreshRanking=draw;draw();
    }

    updateSaveStatus(){
      this.compareHost?.refreshRankControls();
      this.qualityPanel?.refresh();
      const s=this.caseSession,message=this.prefillError||s?.actionError||s?.notice||(!s?'请在顶部选择工作项':'');
      if(this.saveStatus&&this.saveStatus.textContent!==message)this.saveStatus.textContent=message;
      if(this.saveStatus){
        if(!this.recoveryExport&&s?.writeError)this.recoveryExport=button('导出当前结果',()=>this.exportHumanDraft());
        if(this.recoveryExport)this.saveStatus.after(this.recoveryExport);
        if(this.recoveryExport)this.recoveryExport.hidden=!s?.writeError;
      }
      document.dispatchEvent(new Event('cyle:case-save-status'));
    }
    editAnswer(id,patch){
      if(!this.caseWritable)return;super.editAnswer(id,patch);
      C.writeAnswers(this.caseSession,this.caseModelName,this.humanState.answers);C.changed(this.caseSession,false,this);this.updateSaveStatus();
    }
    timelineScore(id){const score=this.answer(id)?.score;const criterion=this.groups.flatMap(g=>g.criteria).find(c=>c.id===id);return criterion?.boolean?(typeof score==='boolean'?(score?5:1):null):criterion?.kind==='objective'?(Number.isFinite(score)&&criterion.max_score>0?(criterion.max_score===1?5:Math.round(1+4*(score-1)/(criterion.max_score-1))):null):score;}
    selectReviewResult(event,id,annotationId=null){
      if(event.detail>1||this.pendingEvidence||event.target.closest('button,summary,a,input,textarea,select,.is-editing,.case-score-options label'))return;
      const card=this.checkpointCard(id),selection=this.root.getSelection?.()||window.getSelection();
      // Only a selection inside this card means the user is selecting its text.
      if(selection&&!selection.isCollapsed&&selection.rangeCount&&card&&selection.getRangeAt(0).intersectsNode(card))return;
      event.stopPropagation();
      const items=this.evidenceEntries(id).filter(e=>!annotationId||e.annotationId===annotationId).map(evidence=>({criterionId:id,evidence,id:evidence.id}));
      if(!items.length){this.selectedCriterionId=id;this.selectedEvidence=new Set();this.markHumanSelection();return;}
      const item=this.cycleNodeItem({key:`result:${id}/${annotationId||''}`},items);
      this.focusHumanEvidence([item],false);
    }
    isEvidenceEditorEvent(event){
      const card=this.checkpointCard(this.pendingEvidence?.criterionId),path=event.composedPath();
      return path.includes(this.compareHost?.timeline)||path.some(n=>n.matches?.('.case-time-input,.case-time-add,.human-time-tag,.human-add-time')&&n.closest('.human-card')===card);
    }
    beginEvidencePick(id,evidenceId=null,annotationId=null){
      if(!this.caseWritable)return;
      super.beginEvidencePick(id,evidenceId,annotationId);
      if(!this.pendingEvidence)return;
      this.pickHint.hidden=true;
      this.refreshEvidence();
      const input=this.checkpointCard(id)?.querySelector('.case-time-input');
      input?.focus({preventScroll:true});input?.select();
    }
    cancelEvidencePick(refresh=true){
      super.cancelEvidencePick(false);
      if(refresh&&this.details)this.refreshEvidence();
    }
    placeEvidence(start,end){
      super.placeEvidence(start,end);
      if(this.pendingEvidence?.preview)this.commitEvidencePick();
    }
    renderTimeEditor(pending,current){
      const holder=el('span','','case-evidence-tag is-editing-time'),input=el('input','','case-time-input');
      input.type='text';input.setAttribute('aria-label',`编辑时间 ${pending.criterionId}`);
      input.value=current?this.formatEvidence(current):'';input.placeholder='00:00.0';
      input.style.width=current?.end>current?.start?'20ch':'9ch';
      const parse=value=>{
        const parts=value.trim().split(/\s*(?:—|–|-|~|至)\s*/);if(!parts.length||parts.length>2)return null;
        const seconds=parts.map(part=>{if(!/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(part))return NaN;const fields=part.split(':').map(Number);if(fields.slice(1).some(n=>n>=60))return NaN;return fields.reduce((n,v)=>n*60+v,0);});
        const [start,end=start]=seconds;
        return seconds.every(Number.isFinite)&&start>=0&&end>=start&&end<=this.video.duration?{start,end}:null;
      };
      const finish=()=>{
        if(this.refreshingTimeUI||this.pendingEvidence!==pending||!input.isConnected)return;
        if(!input.value.trim()){this.cancelEvidencePick();return;}
        const time=parse(input.value);
        if(!time){input.setAttribute('aria-invalid','true');input.title='请输入有效时间或时间范围，且不要超出视频时长';return;}
        if(current&&time.start===current.start&&time.end===current.end){this.cancelEvidencePick();return;}
        this.placeEvidence(time.start,time.end);
      };
      input.oninput=()=>{input.removeAttribute('aria-invalid');input.removeAttribute('title');input.style.width=Math.min(22,Math.max(9,input.value.length+1))+'ch';};
      input.onblur=finish;input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();finish();}else if(e.key==='Escape'){e.preventDefault();this.cancelEvidencePick();}};
      holder.append(input);return holder;
    }
    checkpointCard(id){return [...(this.details?.querySelectorAll('.human-card')||[])].find(n=>n.dataset.criterionId===id);}
    commitEvidencePick(){
      const pending=this.pendingEvidence;if(!pending)return;
      if(pending.annotationId){super.commitEvidencePick();}
      else {
        if(pending.preview){
          const answer=pending.state.answers.find(a=>a.criterionId===pending.criterionId);
          if(answer){const evidence={...pending.preview};delete evidence.annotationId;
            answer.evidence=pending.evidenceId?(answer.evidence||[]).map(e=>e.id===pending.evidenceId?evidence:e):[...(answer.evidence||[]),evidence];}
        }
        this.cancelEvidencePick(false);
      }
      if(pending.preview&&this.caseSession){C.writeAnswers(this.caseSession,this.caseModelName,pending.state.answers);C.changed(this.caseSession,false,this);}
      this.refreshEvidence();this.updateSaveStatus();
    }
    refreshEvidence(){
      this.refreshingTimeUI=true;
      try {
      this.layout();
      for(const card of this.details?.querySelectorAll('.human-card')||[]){
        const id=card.dataset.criterionId,host=card.querySelector('.case-evidence');if(host)this.renderCheckpointEvidence(id,host);
        const criterion=this.groups.flatMap(g=>g.criteria).find(c=>c.id===id);
        for(const row of card.querySelectorAll('.human-annotation')){
          const annotation=this.answer(id)?.annotations?.find(a=>a.id===row.dataset.annotationId);
          if(annotation&&criterion)row.replaceWith(this.renderAnnotation(criterion,annotation));
        }
      }
      this.markHumanSelection();
      } finally {this.refreshingTimeUI=false;}
    }
    renderAnnotation(criterion,annotation,options){
      const row=super.renderAnnotation(criterion,annotation,options),pending=this.pendingEvidence;
      if(pending?.criterionId===criterion.id&&pending.annotationId===annotation.id){
        const current=this.answer(criterion.id)?.evidence?.find(e=>e.id===pending.evidenceId);
        const target=current?[...row.querySelectorAll('[data-evidence-id]')].find(n=>n.dataset.evidenceId===current.id):row.querySelector('.human-add-time');
        target?.replaceWith(this.renderTimeEditor(pending,current));
      }
      return row;
    }
    renderCheckpointEvidence(id,host){
      host.replaceChildren();
      const pending=this.pendingEvidence?.criterionId===id&&!this.pendingEvidence.annotationId?this.pendingEvidence:null;
      for(const e of this.evidenceEntries(id).filter(e=>!e.annotationId)){
        if(pending?.evidenceId===e.id){host.append(this.renderTimeEditor(pending,e));continue;}
        const item=el('span','','case-evidence-tag'),tag=button(this.formatEvidence(e),()=>this.focusHumanEvidence([{criterionId:id,evidence:e}]),`定位时间 ${id} ${e.id}`);
        tag.dataset.evidenceId=e.id;tag.className='human-time-tag';tag.title='单击定位视频，双击调整时间';
        tag.ondblclick=()=>this.beginEvidencePick(id,e.id);
        const remove=button('×',()=>{if(!this.caseWritable)return;this.editAnswer(id,{evidence:(this.answer(id)?.evidence||[]).filter(x=>x.id!==e.id)});this.refreshEvidence();},`删除时间 ${e.id}`);
        tag.disabled=!this.caseWritable;remove.disabled=!this.caseWritable;item.append(tag,remove);host.append(item);
      }
      if(pending&&!pending.evidenceId)host.append(this.renderTimeEditor(pending,null));
      const add=button('+ 标注时间',()=>this.beginEvidencePick(id),`标注时间 ${id}`);add.className='case-time-add';add.disabled=!this.caseWritable;add.hidden=!!pending;host.append(add);
      if(host.closest('[data-added-checkpoint]')&&!this.qualitySourceView&&this.caseSession?.ctx.work.workType==='annotation'){
        const remove=button('',event=>{event.stopPropagation();if(this.caseWritable)C.removeAddedCheckpoint(this.caseSession,id);},`删除补充检查点 ${id}`);
        remove.className='case-remove-checkpoint';remove.disabled=!this.caseWritable;remove.append(globalThis.__gtmLucideIconsV1.create('Trash2',{size:14}));
        remove.title='删除当前工作项所有模型中的这条补充标准及其评分';host.append(remove);
      }
    }
    inferCheckpointTimes(id,text){
      const answer=this.answer(id),evidence=[...(answer?.evidence||[])];
      for(const time of globalThis.__cyleHumanReviewListV1.times(text))if(!evidence.some(e=>e.start===time.start&&e.end===time.end))evidence.push({...time,id:crypto.randomUUID(),kind:time.start===time.end?'point':'range'});
      if(evidence.length!==(answer?.evidence||[]).length){this.editAnswer(id,{evidence});this.refreshEvidence();}
    }
    bindCaseTextEditor(host,{label,inputClass,getValue,setValue,render,restoreValue,allowEmpty=true,onPreview,onCommit}){
      host.classList.add('case-inline-editor');
      const start=()=>{
        if(!this.caseWritable||host.querySelector('textarea'))return;
        this.finishTextEdit?.();
        const session=this.caseSession,initial=getValue(),input=el('textarea','',`case-inline-input ${inputClass}`);
        input.value=initial;input.rows=1;input.setAttribute('aria-label',label);
        const original=restoreValue?.(),hasRestore=typeof restoreValue==='function';
        if(hasRestore){input.placeholder=original??initial;input.setAttribute('aria-description','清空后显示原文提示，按 Tab 填入原文；留空退出取消本次编辑。');}
        const write=value=>{if(this.caseSession===session&&this.caseWritable)setValue(value);};
        host.classList.add('is-editing');host.replaceChildren(input);
        const resize=()=>{input.style.height='auto';input.style.height=Math.max(24,input.scrollHeight)+'px';this.compareHost?.scheduleLayout();};
        let restore,hint;
        const refresh=()=>{resize();if(restore){restore.disabled=original==null||input.value===original;hint.hidden=!(input.value===''&&original);hint.textContent=hint.hidden?'':'Tab 填入原文';}onPreview?.(input.value);};
        const acceptOriginal=()=>{if(original==null)return;input.value=original;write(original);refresh();input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length);};
        if(hasRestore){
          const tools=el('div','','case-edit-tools');hint=el('span','','case-edit-label');hint.setAttribute('role','status');
          restore=button('恢复原文',acceptOriginal,label.replace('编辑检查点','恢复检查点原文'));
          restore.prepend(globalThis.__gtmLucideIconsV1.create('Undo2',{size:14}));restore.title='恢复题目 rubric 的原始正文';tools.append(hint,restore);host.append(tools);
        }
        let done=false;
        const outside=e=>{if(!e.composedPath().includes(host))finish(false);};
        const focusOut=e=>{if(!host.contains(e.relatedTarget))finish(false);};
        const finish=cancel=>{
          if(done)return;done=true;document.removeEventListener('pointerdown',outside,true);host.removeEventListener('focusout',focusOut);
          if(this.finishTextEdit===complete)this.finishTextEdit=null;
          if(cancel||(!allowEmpty&&!input.value.trim()))write(initial);
          host.classList.remove('is-editing');render();onPreview?.();
          if(!cancel&&this.caseSession===session&&this.caseWritable)onCommit?.(getValue());
        };
        const complete=()=>finish(false);this.finishTextEdit=complete;
        input.oninput=()=>{write(input.value);refresh();};
        input.onkeydown=e=>{
          if(e.isComposing)return;
          if(e.key==='Tab'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&input.value===''&&original){e.preventDefault();acceptOriginal();}
          else if(e.key==='Escape'){e.preventDefault();finish(true);}
          else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();finish(false);}
        };
        host.addEventListener('focusout',focusOut);
        document.addEventListener('pointerdown',outside,true);
        refresh();input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length);
      };
      host.addEventListener('mousedown',e=>{if(e.detail===2&&!e.target.closest('textarea,button'))e.preventDefault();});
      host.ondblclick=e=>{if(e.target.closest('textarea,button'))return;e.preventDefault();e.stopPropagation();window.getSelection()?.removeAllRanges();start();};
      host.onkeydown=e=>{if(e.target===host&&e.key==='Enter'){e.preventDefault();start();}};
    }

    openWeightPanel(dimensionId){
      if(!this.caseWritable)return;
      this.finishTextEdit?.();
      const owner=this.qualitySourceView?.owner||this,session=owner.caseSession;
      if(session.weightPanel){session.weightPanel.focus(dimensionId);return;}
      const dimensions=C.weightDimensions(session),inputs=new Map(),diffs=new Map(),groups=new Map(),initial=JSON.stringify(dimensions.map(d=>[d.dimension_id,d.weight]));
      const overlay=el('dialog','','case-weight-overlay'),panel=el('section','','case-weight-panel');
      overlay.setAttribute('role','presentation');
      panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','调整维度权重');panel.tabIndex=-1;
      const previous=this.root.getRootNode().activeElement;
      let closed=false;
      const close=()=>{if(closed)return;closed=true;overlay.close();overlay.remove();session.weightPanel=null;owner.closeWeightPanel=null;previous?.focus?.({preventScroll:true});};
      overlay.addEventListener('cancel',event=>{event.preventDefault();close();});
      // Isolate dialog events from workspace fullscreen/drag shortcuts. A second
      // click from opening via double-click must not immediately dismiss it.
      for(const type of ['keydown','keyup','keypress','pointerdown','pointerup','dblclick'])overlay.addEventListener(type,event=>event.stopPropagation());
      overlay.addEventListener('click',event=>{event.stopPropagation();if(event.target===overlay&&event.detail===1)close();});
      const heading=el('header'),title=el('div','','case-weight-heading'),dismiss=button('',close,'关闭权重面板');title.append(el('strong','调整维度权重'));dismiss.className='case-weight-close';dismiss.append(globalThis.__gtmLucideIconsV1.create('X',{size:18}));heading.append(title,dismiss);
      const list=el('div','','case-weight-list'),footer=el('footer'),summary=el('strong'),hint=el('p'),status=el('div','','case-weight-summary'),actions=el('div','','case-weight-actions');hint.setAttribute('role','status');status.append(summary,hint);
      const columns=el('div','','case-weight-columns');columns.setAttribute('aria-hidden','true');columns.append(el('span','评估维度'),el('span','权重'));list.append(columns);
      const numberOf=input=>/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(input.value.trim())?Number(input.value.trim()):NaN;
      const apply=button('应用调整',()=>{
        if(owner.caseSession!==session||!this.caseWritable)return;
        try{
          if(initial!==JSON.stringify(C.weightDimensions(session).map(d=>[d.dimension_id,d.weight])))throw Error('权重已变化，请关闭后重新调整。');
          const weights=Object.fromEntries([...inputs].map(([id,input])=>[id,numberOf(input)]));
          // Close before notifying views: quality columns may be replaced.
          C.setWeights(session,weights);close();
        }catch(e){hint.textContent=e.message;}
      });
      const refresh=()=>{
        let invalid=null;
        for(const d of dimensions){
          const diff=diffs.get(d.dimension_id),input=inputs.get(d.dimension_id),value=numberOf(input),valid=Number.isFinite(value)&&value>0&&value<=25,changed=valid&&value!==d.weight;
          input.style.width=Math.max(30,Math.min(100,input.value.length*8+10))+'px';
          input.setAttribute('aria-invalid',String(!valid));input.classList.toggle('is-changed',changed);if(!valid)invalid ||= d.dimension_id;
          diff.replaceChildren();if(changed)diff.append(el('del',String(d.weight??'未设置')),document.createTextNode(' → '));
          input.setAttribute('aria-description',changed?`原权重 ${d.weight??'未设置'}，当前 ${value}`:'直接输入权重');
        }
        const values=[...inputs.values()].map(numberOf),total=values.reduce((a,b)=>a+(Number.isFinite(b)?b:0),0),difference=Number((25-total).toFixed(9));
        summary.textContent=`合计 ${Number(total.toFixed(9))} / 25`;
        hint.textContent=invalid?`${invalid}：请输入大于 0 且不超过 25 的数字`:difference>0?`还需增加 ${difference}`:difference<0?`还需减少 ${-difference}`:'所有模型共用';apply.disabled=!!invalid||Math.abs(total-25)>1e-9;status.dataset.valid=String(!apply.disabled);
      };
      for(const d of dimensions){
        const category=String(d.category||'未分类').trim()||'未分类';
        if(!groups.has(category)){const group=el('section','','case-weight-group-section');group.setAttribute('aria-label',category);group.append(el('h3',category,'case-weight-category'));groups.set(category,group);list.append(group);}
        const row=el('div','','case-weight-row'),label=el('label'),input=el('input');label.append(el('span',d.dimension_id,'case-weight-dimension-id'),el('span',d.dimension_name,'case-weight-dimension-name'));
        input.type='text';input.inputMode='decimal';input.className='case-weight-number';input.autocomplete='off';input.value=d.weight??'';input.setAttribute('aria-label',`编辑权重 ${d.dimension_id}`);inputs.set(d.dimension_id,input);
        const diff=el('span','','case-weight-change');diff.setAttribute('aria-label',`原权重 ${d.dimension_id}`);diffs.set(d.dimension_id,diff);
        label.onclick=()=>{input.focus();input.select();};row.dataset.weightDimension=d.dimension_id;
        const value=el('div','','case-weight-value');value.append(diff,input);row.append(label,value);input.oninput=refresh;groups.get(category).append(row);
      }
      apply.className='case-weight-apply';actions.append(button('取消',close),apply);footer.append(status,actions);panel.append(heading,list,footer);overlay.append(panel);owner.body.append(overlay);overlay.showModal();
      const focus=id=>{list.querySelectorAll('.case-weight-row').forEach(row=>row.classList.toggle('is-current',row.dataset.weightDimension===id));inputs.get(id)?.focus();inputs.get(id)?.select();};
      session.weightPanel={focus};owner.closeWeightPanel=close;
      panel.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const nodes=[...panel.querySelectorAll('button:not(:disabled),input')],index=nodes.indexOf(panel.getRootNode().activeElement);if(e.shiftKey&&index===0){e.preventDefault();nodes.at(-1).focus();}else if(!e.shiftKey&&index===nodes.length-1){e.preventDefault();nodes[0].focus();}}};
      refresh();focus(dimensionId);
    }

    renderDetails(){
      if(this.qualityPanel)return this.qualityPanel.render();
      if(!this.details)return;this.finishTextEdit?.();super.renderDetails();

      if(!this.template||this.prefillError||this.caseSession?.conflict)return;
      const dimensions=this.caseRecord.rubric.dimensions;
      const originalDimensions=this.caseSession?C.normalizeRubric(this.caseSession.data.original_rubric).dimensions:[];
      const weights=(this.caseSession?C.weightDimensions(this.caseSession):dimensions).map(d=>d.weight).filter(v=>Number.isFinite(v)&&v>0),minWeight=Math.min(...weights),maxWeight=Math.max(...weights);
      let lastCategory='';
      for(const section of this.details.querySelectorAll('.human-group')){
        const firstId=section.querySelector('.human-card')?.dataset.criterionId;
        const group=this.groups.find(g=>g.criteria.some(c=>c.id===firstId));if(!group)continue;
        const d=dimensions.find(x=>x.dimension_id===group.id);section.dataset.dimensionId=group.id;
        if(d.category&&d.category!==lastCategory){const category=el('h2',d.category,'case-category');section.before(category);lastCategory=d.category;}
        const heading=section.querySelector('h3');heading.className='case-section-title';heading.replaceChildren();
        const completed=group.criteria.filter(c=>this.answer(c.id)?.status==='scored').length;
        heading.append(el('strong',`${group.id} · ${group.name}`),el('span',`${completed}/${group.criteria.length} 已评`,'case-progress'));
        const original=originalDimensions.find(x=>x.dimension_id===d.dimension_id);
        const weightGroup=el('span','','case-weight-group');
        const weight=el(this.caseWritable?'button':'span',String(d.weight??'—'),'case-weight');weight.setAttribute('aria-label',`权重 ${d.dimension_id}`);
        if(original&&original.weight!==d.weight){weightGroup.append(el('del',String(original.weight??'未设置'),'case-diff-removed case-weight-original'));weight.classList.add('case-diff-added');}
        if(this.caseWritable){
          weight.type='button';weight.setAttribute('aria-haspopup','dialog');weight.title=`权重 ${d.weight??'未设置'} · 单击调整（总和 25）`;const weightSource=C.weightSources(this.caseSession.data)[d.dimension_id];if(weightSource)weight.title+=` · 采用自 ${weightSource.source_name||'标注'}`;weight.setAttribute('aria-description',weight.title);
          const emphasis=Number.isFinite(d.weight)&&maxWeight>minWeight?Math.max(0,Math.min(1,(d.weight-minWeight)/(maxWeight-minWeight))):.5;
          weight.style.setProperty('--case-weight-size',`${13+2*emphasis}px`);
          weight.style.setProperty('--case-weight-bold',String(Math.round(500+100*emphasis)));
          weight.style.setProperty('--case-weight-tint',`${Math.round(3+7*emphasis)}%`);
          weight.onclick=event=>{event.stopPropagation();this.openWeightPanel(d.dimension_id);};
        }
        weightGroup.append(weight);heading.append(weightGroup);
        let lastObjective=null;
        for(const card of section.querySelectorAll('.human-card')){
          const id=card.dataset.criterionId,criterion=group.criteria.find(c=>c.id===id);
          const list=d[criterion.kind+'_checkpoints']||[],c=list.find(c=>c.checkpoint_id===id);if(!c)continue;
          if(!original?.[criterion.kind+'_checkpoints']?.some(x=>x.checkpoint_id===id))card.dataset.addedCheckpoint='true';
          const sourceOrder=[...(original?.objective_checkpoints||[]),...(original?.subjective_checkpoints||[])],sourceIndex=sourceOrder.findIndex(x=>x.checkpoint_id===id);
          const displayId=sourceIndex<0?`${group.id} · 补充`:`${group.id}.${(this.qualitySourceView?sourceIndex:group.criteria.indexOf(criterion))+1}`;
          const text=el('div',c.checkpoint,'case-checkpoint-text');text.setAttribute('aria-label',`检查点正文 ${id}`);text.tabIndex=0;
          const checkpointHeading=card.querySelector('header');checkpointHeading.classList.add('case-checkpoint-heading');checkpointHeading.replaceChildren(el('span',displayId,'human-title'),text);
          const updateCheckpoint=value=>{
            if(!this.caseWritable||!value.trim()||value===c.checkpoint)return;
            C.revise(this.caseSession,id,value,this);
            const answer=this.answer(id);if(answer){
              answer.status=c.status||(c.score==null?'unscored':'scored');
              if(answer.score!=null&&!criterion.score_values.includes(answer.score))answer.status='needs_review';
              card.querySelectorAll('.case-native-scores input').forEach(n=>n.checked=answer.status==='scored'&&n.value===String(answer.score));
              if(answer.status==='needs_review'){if(!card.querySelector('.case-review-hint'))card.append(el('p','标准已修改，请重新确认评分。','human-prefill-hint case-review-hint'));}
              else card.querySelector('.case-review-hint')?.remove();
            }
            heading.querySelector('.case-progress').textContent=`${group.criteria.filter(x=>this.answer(x.id)?.status==='scored').length}/${group.criteria.length} 已评`;
            this.updateSaveStatus();paintDiff();
          };
          const before=(original?.[criterion.kind+'_checkpoints']||[]).find(x=>x.checkpoint_id===id)?.checkpoint;
          this.bindCaseTextEditor(text,{label:`编辑检查点 ${id}`,inputClass:'case-checkpoint-editor',getValue:()=>c.checkpoint,setValue:updateCheckpoint,render:()=>paintReadingText(),restoreValue:before==null?undefined:()=>before,allowEmpty:false,onPreview:value=>paintDiff(value)});
          const diff=el('div','','case-native-diff');diff.setAttribute('role','group');diff.setAttribute('aria-label',`修改对照 ${id}`);checkpointHeading.after(diff);
          const diffParts=after=>{
            let start=0,end=0;
            while(start<before.length&&start<after.length&&before[start]===after[start])start++;
            while(end<before.length-start&&end<after.length-start&&before[before.length-1-end]===after[after.length-1-end])end++;
            return {start,end};
          };
          const paintReadingText=()=>{
            text.replaceChildren();text.title='双击编辑标准';if(this.qualitySourceView?.kind==='accepted'){text.textContent=c.checkpoint;queueMicrotask(()=>this.compareHost?.refreshSelection());return;}
            if(before==null||before===c.checkpoint){text.textContent=c.checkpoint;return;}
            const after=c.checkpoint,{start,end}=diffParts(after);
            text.append(document.createTextNode(after.slice(0,start)));
            const removed=before.slice(start,before.length-end),added=after.slice(start,after.length-end);
            if(removed)text.append(el('del',removed,'case-diff-removed'));
            if(added)text.append(el('ins',added,'case-diff-added'));
            text.append(document.createTextNode(end?after.slice(-end):''));
            text.title='与题目原文对照：红色删除，绿色新增。双击编辑标准。';
          };
          const paintDiff=(after=c.checkpoint)=>{
            diff.replaceChildren();diff.hidden=!text.classList.contains('is-editing');if(this.qualitySourceView?.kind==='accepted'){diff.hidden=true;return;}
            if(before==null||before===after)return;
            const {start,end}=diffParts(after);
            diff.append(el('div','修改对照 · 相对题目原文','case-diff-title'));
            for(const [label,value,kind] of [['原文',before,'removed'],['修改后',after,'added']]){
              const line=el('div','','case-diff-line'),content=el('span','','case-diff-content');
              content.append(document.createTextNode(value.slice(0,start)));
              const changed=value.slice(start,value.length-end);if(changed)content.append(el(kind==='removed'?'del':'ins',changed,`case-diff-${kind}`));
              content.append(document.createTextNode(end?value.slice(-end):''));line.append(el('span',label,'case-diff-label'),content);diff.append(line);
            }
          };
          paintReadingText();paintDiff();
          card.querySelector('.human-note')?.remove();card.querySelector('.human-add')?.remove();
          card.querySelector('.human-score')?.remove();
          card.querySelector('.human-menu[aria-label$="操作"]')?.remove();
          const scoring=el('fieldset','','case-native-scores');scoring.setAttribute('aria-label',`评分 ${id}`);
          const evaluation=el('div','','case-evaluation');diff.after(evaluation);evaluation.append(scoring);
          const choices=el('div','','case-score-options');
          choices.classList.add(criterion.boolean?'is-boolean':'is-rating');
          if(criterion.score_values.some(v=>criterion.scoring_criteria[v]!=null))choices.classList.add('has-descriptions');
          scoring.append(choices);
          for(const value of criterion.score_values){
            const label=el('label'),radio=el('input');radio.type='radio';radio.name=`score-${this.caseModelName}-${id}`;radio.value=String(value);radio.checked=this.answer(id)?.status==='scored'&&this.answer(id)?.score===value;radio.disabled=!this.caseWritable;radio.setAttribute('aria-label',criterion.boolean?`${id} ${value?'符合':'不符合'}`:`${id} 评分 ${value}`);label.dataset.verdict=typeof value==='boolean'?String(value):'';
            radio.onchange=()=>{
              if(!this.caseWritable)return;
              this.editAnswer(id,{score:value,status:'scored'});
              card.querySelectorAll('.case-review-hint').forEach(n=>n.remove());
              heading.querySelector('.case-progress').textContent=`${group.criteria.filter(x=>this.answer(x.id)?.status==='scored').length}/${group.criteria.length} 已评`;
              this.layout();
            };
            label.append(radio,el('span',criterion.boolean?(value?'符合':'不符合'):`${value} 分`,'case-score-number'));choices.append(label);
            if(criterion.scoring_criteria[value]!=null){const description=String(criterion.scoring_criteria[value]);label.append(el('span',description,'case-score-description'));radio.setAttribute('aria-description',description);}
            if(!criterion.boolean)label.append(globalThis.__gtmLucideIconsV1.create('Check',{size:16,className:'case-score-check'}));
          }
          if(criterion.boolean){
            const track=el('span','','case-verdict-track');track.setAttribute('aria-hidden','true');track.append(el('span','','case-verdict-thumb'));choices.append(track);
            let gesture=null;
            const clear=()=>{gesture=null;track.classList.remove('is-dragging');track.style.removeProperty('--case-verdict-drag');};
            choices.addEventListener('pointerdown',event=>{
              if(gesture||!this.caseWritable||event.button!==0)return;
              event.preventDefault();
              const selected=choices.querySelector('input:checked'),travel=track.clientWidth-track.firstElementChild.offsetWidth-6;
              gesture={pointerId:event.pointerId,startX:event.clientX,start:selected?(selected.value==='true'?0:travel):travel/2,travel,tapValue:event.target.closest('label')?.dataset.verdict,position:0,moved:false};
              gesture.position=gesture.start;choices.setPointerCapture(event.pointerId);track.classList.add('is-dragging');
            });
            choices.addEventListener('pointermove',event=>{
              if(gesture?.pointerId!==event.pointerId)return;
              const scale=track.getBoundingClientRect().width/track.offsetWidth||1,delta=(event.clientX-gesture.startX)/scale;
              if(Math.abs(delta)>3)gesture.moved=true;
              gesture.position=Math.max(0,Math.min(gesture.travel,gesture.start+delta));track.style.setProperty('--case-verdict-drag',`${gesture.position}px`);
            });
            choices.addEventListener('pointerup',event=>{
              if(gesture?.pointerId!==event.pointerId)return;
              const current=gesture,rect=track.getBoundingClientRect();
              const value=current.moved?current.position<current.travel/2:current.tapValue!=null?current.tapValue==='true':event.clientX<rect.left+rect.width/2;
              clear();if(choices.hasPointerCapture(event.pointerId))choices.releasePointerCapture(event.pointerId);
              if(!this.caseWritable)return;
              const radio=choices.querySelector(`input[value="${value}"]`);radio.focus({preventScroll:true});radio.click();
            });
            choices.addEventListener('click',event=>{if(event.isTrusted&&event.detail>0)event.preventDefault();},true);
            choices.addEventListener('pointercancel',clear);choices.addEventListener('lostpointercapture',clear);
          }

          const note=el('div','','case-note');note.tabIndex=0;note.setAttribute('aria-label',`评分原因 ${id}`);note.textContent=this.answer(id)?.note||'';evaluation.append(note);
          this.bindCaseTextEditor(note,{label:`编辑评分原因 ${id}`,inputClass:'case-score-reason',getValue:()=>this.answer(id)?.note||'',setValue:value=>{if(value!==(this.answer(id)?.note||''))this.editAnswer(id,{note:value});},render:()=>{note.textContent=this.answer(id)?.note||'';},onCommit:value=>this.inferCheckpointTimes(id,value)});
          note.onclick=e=>{if(!e.target.closest('textarea,button')&&!window.getSelection()?.toString()){this.selectReviewResult(e,id);e.stopPropagation();}};
          const evidence=el('div','','case-evidence');checkpointHeading.append(evidence);this.renderCheckpointEvidence(id,evidence);
          if(c.status==='needs_review')card.append(el('p','标准已修改，请重新确认评分。','human-prefill-hint case-review-hint'));
          if(criterion.kind==='objective')lastObjective=card;
        }
        this.renderOther(d,lastObjective||heading);
      }
      if(!this.compareHost){const ranking=el('section');this.renderRanking(ranking);this.details.append(ranking);this.renderDirectory(this.directory,(id,criterionId)=>this.navigateDimension(id,criterionId));this.details.onscroll=()=>this.updateDirectoryPosition();}
      else this.compareHost.updateCaseNavigation?.(this);
      this.bindDirectoryInteractions();
      if(!this.caseWritable)this.details.querySelectorAll('button,input').forEach(n=>n.disabled=true);
      this.renderQualitySource();
      this.caseTextObserver?.disconnect();
      this.caseTextObserver ||= new ResizeObserver(entries=>{const width=entries[0]?.contentRect.width;if(width===this.caseTextWidth)return;this.caseTextWidth=width;this.details?.querySelectorAll('.case-inline-input').forEach(n=>{n.style.height='auto';n.style.height=Math.max(24,n.scrollHeight)+'px';});this.compareHost?.scheduleLayout();});
      this.caseTextWidth=undefined;this.caseTextObserver.observe(this.details);
    }
    chooseQualityCheckpoint(card){
      const view=this.qualitySourceView;if(view?.kind!=='source'||!card)return;
      const dimension=card.closest('[data-dimension-id]')?.dataset.dimensionId;
      try{C.approveCheckpoint(view.owner.caseSession,view.workId,this.caseModelName,dimension,card.dataset.criterionId);this.compareHost?.noteAdoption({kind:'checkpoint',dimensionId:dimension,checkpointId:card.dataset.criterionId,workId:view.workId});}catch(error){view.owner.caseSession.actionError=error.message;view.owner.updateSaveStatus();}
    }
    chooseQualityWeight(dimensionId){
      const view=this.qualitySourceView;if(view?.kind!=='source')return;
      try{C.approveWeight(view.owner.caseSession,view.workId,this.caseModelName,dimensionId);this.compareHost?.noteAdoption({kind:'weight',dimensionId,workId:view.workId});}catch(error){view.owner.caseSession.actionError=error.message;view.owner.updateSaveStatus();}
    }
    renderQualitySource(){
      const view=this.qualitySourceView;if(!view)return;const editable=view.kind==='accepted';
      const extra=(host,object,excluded)=>{
        const labels={id:'编号',correct:'符合',text:'内容',times:'时间',start:'开始',end:'结束',case_id:'题目',rubric_id:'Rubric',category:'分类',description:'描述',max_score:'满分',status:'状态',score:'评分',reason:'说明',weight:'权重',applicability:'适用条件',scoring_criteria:'评分标准',annotations:'标注',evidence:'时间证据',ranking:'整体排序'};
        const format=x=>x==null?'未填写':typeof x==='object'?Array.isArray(x)?x.map(format).join('\n'):Object.entries(x).map(([k,v])=>`${labels[k]||k}：${format(v)}`).join('\n'):String(x);
        for(const [key,value] of Object.entries(object||{}))if(!excluded.includes(key)&&value!=null&&value!==''){const field=el('p',`${labels[key]||key}：${format(value)}`,'quality-field');field.dataset.qualityField=key;host.append(field);}
      };
      const meta=el('div','','quality-record-meta');
      extra(meta,view.record.rubric,['dimensions','case_id','rubric_id']);extra(meta,view.record,['model','rubric']);this.details.prepend(meta);
      for(const d of this.caseRecord.rubric.dimensions){
        const section=[...this.details.querySelectorAll('[data-dimension-id]')].find(n=>n.dataset.dimensionId===d.dimension_id);if(!section)continue;
        section.querySelector('.case-weight-original')?.remove();section.querySelector('.case-weight')?.classList.remove('case-diff-added');if(view.kind==='original')section.querySelector('.case-progress')?.remove();
        const description=el('div');extra(description,d,['dimension_id','dimension_name','weight','objective_checkpoints','subjective_checkpoints','other']);section.querySelector('h3').after(description);
        for(const c of [...(d.objective_checkpoints||[]),...(d.subjective_checkpoints||[])]){
          const card=[...section.querySelectorAll('[data-criterion-id]')].find(n=>n.dataset.criterionId===c.checkpoint_id);if(!card)continue;
          if(!editable)card.querySelector('.case-checkpoint-text').textContent=c.checkpoint;card.querySelector('.case-native-diff')?.remove();
          const fields=el('div');extra(fields,c,['checkpoint_id','checkpoint','status','score','reason','annotations','evidence','scoring_criteria']);card.querySelector('header').after(fields);
          card.querySelectorAll('.case-native-scores input').forEach(n=>n.checked=c.score!=null&&n.value===String(c.score));
          if(!editable)card.querySelectorAll('.human-annotation').forEach(n=>n.remove());
          if(c.annotations?.length)extra(card,{annotations:c.annotations},[]);
        }
      }
      if(editable){this.body.append(el('style',`.page{height:auto;overflow:visible}.timeline,.case-controls,.evaluation-tabs{display:none!important}.result-list{overflow:visible;flex:none;padding:0 10px 12px}.quality-field{white-space:pre-wrap;font-size:12px;line-height:1.65}`));return;}
      this.details.querySelectorAll('textarea').forEach(n=>{const p=el('p',n.value,'quality-field');n.replaceWith(p);});
      this.details.querySelectorAll('.case-other-row').forEach(n=>{const input=n.querySelector('input');if(input)input.replaceWith(document.createTextNode(input.value));n.querySelectorAll('button').forEach(b=>b.remove());});
      this.details.querySelectorAll('.case-add-other,.case-other>button,.case-time-add,[aria-label^="删除时间"],.human-row-actions,.human-add').forEach(n=>n.remove());
      this.details.querySelectorAll('.human-time-tag').forEach(n=>{n.disabled=false;n.ondblclick=null;n.title='定位视频';});
      if(this.qualityBoundDetails!==this.details){this.qualityBoundDetails=this.details;this.details.addEventListener('selectstart',e=>e.preventDefault());this.details.addEventListener('copy',e=>e.preventDefault());this.details.addEventListener('mousedown',e=>{if(e.detail>1)e.preventDefault();});this.readonlyDoubleClick=e=>{e.stopImmediatePropagation();e.preventDefault();window.getSelection()?.removeAllRanges();const weight=e.target.closest('.case-weight');if(weight){this.chooseQualityWeight(weight.closest('[data-dimension-id]')?.dataset.dimensionId);return;}const card=e.target.closest('[data-criterion-id]');if(card)this.chooseQualityCheckpoint(card);};this.details.addEventListener('dblclick',this.readonlyDoubleClick,true);}
      if(view.kind==='source'){
        for(const card of this.details.querySelectorAll('[data-criterion-id]')){card.classList.add('quality-source-card');card.tabIndex=0;card.title='双击采用此检查点；再次选择其他来源可替换';card.setAttribute('aria-label',`采用 ${view.workName||'标注'} ${card.dataset.criterionId}`);card.onkeydown=event=>{if(event.key==='Enter'&&event.target===card){event.preventDefault();event.stopPropagation();this.chooseQualityCheckpoint(card);}};}
        for(const weight of this.details.querySelectorAll('.case-weight')){weight.classList.add('quality-source-weight');weight.tabIndex=0;weight.setAttribute('role','button');weight.title='双击采用此维度权重，保留其他维度';weight.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();this.chooseQualityWeight(weight.closest('[data-dimension-id]')?.dataset.dimensionId);}};}
      }
      const ranking=el('section');this.renderRanking(ranking);this.details.append(ranking);
      const style=el('style',`.page{height:auto;overflow:visible}.timeline,.case-controls,.evaluation-tabs{display:none!important}.result-list{overflow:visible;flex:none;padding:0 10px 12px}.case-native-scores label:has(input:disabled),.case-verdict-track{opacity:1!important}.case-native-scores :is(input,label,.case-verdict-track){pointer-events:none}.result-list,.result-list *{-webkit-user-select:none!important;user-select:none!important}.case-checkpoint-text,.case-note{cursor:default}.case-note:empty{display:none}.human-card{border-bottom:1px solid var(--pet-border)}.case-evidence-tag>.human-time-tag:last-child{width:auto}.quality-field{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:1.65}.quality-missing{box-sizing:border-box;border:0!important;padding:0!important;margin:12px 0 16px;background:transparent!important}.quality-accepted-source{font-size:12px;color:var(--pet-accent)}`);
      this.body.append(style);queueMicrotask(()=>{this.compareHost?.refreshSelection();this.compareHost?.scheduleLayout();});
    }

    renderOther(d,anchor){
      const box=el('section','','case-other');box.dataset.otherDimension=d.dimension_id;
      if(d.other?.length)box.append(el('p','历史其他问题（保留原扣分记录）','case-added-meta'));
      for(const [index,issue] of (d.other||[]).entries()){
        const row=el('div','','case-other-row'),text=el('textarea'),deduction=el('input');text.value=issue.reason||'';text.placeholder='其他问题';text.setAttribute('aria-label',`其他问题 ${d.dimension_id} ${index+1}`);deduction.type='number';deduction.min='0';deduction.step='0.5';deduction.value=issue.deduction??0;deduction.setAttribute('aria-label',`其他扣分 ${d.dimension_id} ${index+1}`);
        text.oninput=()=>{if(!this.caseWritable)return;issue.reason=text.value;C.changed(this.caseSession,false,this);this.updateSaveStatus();};deduction.onchange=()=>{if(!this.caseWritable)return;const value=Number(deduction.value);if(Number.isFinite(value)&&value>=0)issue.deduction=value;else deduction.value=issue.deduction;C.changed(this.caseSession,false,this);this.updateSaveStatus();};
        const deductionLabel=el('label','扣分','case-deduction');deductionLabel.append(deduction);
        row.append(text,deductionLabel,button('×',()=>{if(!this.caseWritable)return;d.other.splice(index,1);C.changed(this.caseSession,false,this);this.refreshList();},`删除其他问题 ${d.dimension_id} ${index+1}`));box.append(row);
      }
      if(d.other?.length)anchor.after(box);
      if(this.qualitySourceView||this.caseSession?.ctx.work.workType!=='annotation')return;
      const host=el('section','','case-add-checkpoint'),session=this.caseSession;
      // Unconfirmed text belongs only to this page session and model. Ordinary
      // rubric rerenders must not erase it or turn it into a saved empty item.
      const drafts=session.checkpointDrafts ||= new Map(),key=JSON.stringify([this.caseModelName,d.dimension_id]);
      const open=(focus=true)=>{
        if(focus&&!this.caseWritable)return;
        if(focus)this.finishTextEdit?.();trigger.hidden=true;
        const draft=drafts.get(key)||{text:''};drafts.set(key,draft);
        const form=el('form','','human-card case-new-checkpoint');form.setAttribute('aria-label',`新增客观标准 ${d.dimension_id}`);
        const heading=el('header','','case-checkpoint-heading'),editor=el('div','','case-checkpoint-text case-inline-editor is-editing');
        const standard=el('textarea','','case-inline-input case-checkpoint-editor');standard.rows=1;standard.required=true;standard.value=draft.text;
        standard.placeholder='填写可判断是否符合的评估标准…';standard.setAttribute('aria-label',`评估标准 ${d.dimension_id}`);
        editor.append(standard);heading.append(el('span',`${d.dimension_id} · 补充`,'human-title'),editor);
        const error=el('p','','case-add-error');error.setAttribute('role','status');
        const actions=el('div','','case-edit-tools case-add-actions'),submit=el('button','添加标准','case-add-submit');submit.type='submit';
        const cancel=()=>{drafts.delete(key);form.remove();trigger.hidden=false;trigger.focus({preventScroll:true});this.compareHost?.scheduleLayout();};
        actions.append(button('取消',cancel),submit);form.append(heading,error,actions);
        const resize=()=>{standard.style.height='auto';standard.style.height=Math.max(24,standard.scrollHeight)+'px';submit.disabled=!this.caseWritable||!standard.value.trim();this.compareHost?.scheduleLayout();};
        standard.oninput=()=>{draft.text=standard.value;error.textContent='';resize();};
        standard.onkeydown=event=>{if(event.isComposing)return;if(event.key==='Escape'){event.preventDefault();cancel();}else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();form.requestSubmit();}};
        form.onsubmit=event=>{
          event.preventDefault();if(!this.caseWritable||this.caseSession!==session)return;
          try{
            drafts.delete(key);
            const id=C.addObjectiveCheckpoint(session,d.dimension_id,this.caseModelName,{checkpoint:standard.value});
            this.syncCaseModel();this.refreshList();this.updateSaveStatus();
            const card=this.checkpointCard(id);card?.scrollIntoView({block:'nearest'});card?.querySelector('.case-native-scores input')?.focus({preventScroll:true});
          }catch(e){drafts.set(key,draft);error.textContent=e.message;}
        };
        host.append(form);resize();if(focus)standard.focus();
      };
      const trigger=button('新增客观标准',()=>open(),`新增客观标准 ${d.dimension_id}`);trigger.className='case-add-trigger';trigger.prepend(globalThis.__gtmLucideIconsV1.create('Plus',{size:14}));
      host.append(trigger);(d.other?.length?box:anchor).after(host);if(drafts.has(key))open(false);
    }

    renderRaw(){}
    renderHistory(){}
    async adoptCurrentHumanResult(){
      if(!this.caseSession||this.caseSession.saving)return;
      this.exportHumanDraft();const session=this.caseSession;
      try{await C.discard(session);await globalThis.__gtMapperSheetInspectorV1.refresh();}catch(e){session.notice=e.message;this.updateSaveStatus();}
    }
    getWritebackEditor(){return this;}
    async writeHumanResult(){
      this.details?.querySelector('textarea')?.blur();
      for(const view of this.caseSession?.views||[]){view.finishTextEdit?.();view.commitEvidencePick();}
      if(!this.caseWritable)return;const session=this.caseSession;try{await C.save(session,this.writeCell);}catch{}this.updateSaveStatus();
      if(session.pendingConflict)document.dispatchEvent(new CustomEvent('cyle:case-write-conflict',{detail:{session}}));
    }
    async saveHumanDraft(){return false;}
    exportHumanDraft(){
      const data=this.caseSession?.data;if(!data)return;const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download=`${data.case_id}-整题结果.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    dispose(){this.closeWeightPanel?.();this.qualityPanel?.dispose();this.finishTextEdit?.();this.caseTextObserver?.disconnect();this.caseSession?.views.delete(this);document.removeEventListener('cyle:work-item-selected',this.workChanged);super.dispose();}
  }
  CaseHumanEvaluation.createComparisonSurface=createComparisonSurface;
  CaseHumanEvaluation.createComparisonColumn=createComparisonColumn;
  CaseHumanEvaluation.caseStyles=styles;
  CaseHumanEvaluation.alignDimensionColumns=alignDimensionColumns;
  globalThis.__cyleCaseHumanEvaluationV1=CaseHumanEvaluation;
  globalThis.__cyleHumanEvaluationV1=CaseHumanEvaluation;
})();
