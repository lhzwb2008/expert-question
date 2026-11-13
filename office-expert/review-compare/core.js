(function (root) {
  'use strict';
  const COLS = ['AI', 'AM', 'AQ', 'AU'];
  const MODEL_NAMES = ['gpt6(high)+MAv2', 'Codex+Gpt6(astra-high)+线上版本 baseline',
    'Codex+Gpt6.1(sol-high)+线上版本 baseline', 'Codex+Gpt6.1(sol-high)+opendesign'];
  const SCHEMA = 'annotation-compare/snapshot-v1';
  const LIMIT = 12 * 1024 * 1024;
  function canonicalModel(model) {
    return ({
      'Codex+Gpt6(astra-high)+线上版本': MODEL_NAMES[1],
      'Codex+Gpt6.1(sol-high)+open design': MODEL_NAMES[3]
    })[model] || model;
  }
  function csv(text, separator = '\t') {
    const rows = []; let row = [], cell = '', quoted = false, start = true;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
        } else cell += char;
      } else if (char === '"' && start) { quoted = true; start = false; }
      else if (char === separator) { row.push(cell); cell = ''; start = true; }
      else if (char === '\r' || char === '\n') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = ''; start = true;
      } else { cell += char; start = false; }
    }
    if (quoted) throw new Error('复制内容有未闭合的引号，请重新复制完整区域。');
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function key(caseId, model) { return JSON.stringify([caseId, model]); }
  function checkEval(value) {
    if (!value || value.schema !== 'human-eval/1' || !Array.isArray(value.criteria) ||
        typeof value.case_id !== 'string' || typeof value.model !== 'string' || !value.case_id || !value.model) {
      throw new Error('标注 JSON 缺少有效的 case_id、model 或 criteria。');
    }
    const seen = new Set();
    for (const c of value.criteria) {
      if (typeof c.id !== 'string' || !c.id || seen.has(c.id)) throw new Error(`${value.case_id} 的评分项 ID 缺失或重复。`);
      seen.add(c.id);
      if (c.score !== null && c.score !== undefined && (typeof c.score !== 'number' || !Number.isFinite(c.score))) {
        throw new Error(`${value.case_id} / ${c.id} 的分数不是数值。`);
      }
      if (c.note !== undefined && typeof c.note !== 'string') throw new Error('note 必须是文本。');
      if (c.annotations !== undefined && !Array.isArray(c.annotations)) throw new Error('annotations 必须是数组。');
      for (const ann of c.annotations || []) {
        if (ann.text !== undefined && typeof ann.text !== 'string') throw new Error('annotations.text 必须是文本。');
      }
    }
    return value;
  }
  function jsonObjects(text) {
    const objects = [];
    let start = -1, depth = 0, quoted = false, escaped = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (start < 0) { if (char === '{') { start = i; depth = 1; } continue; }
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        const raw = text.slice(start, i + 1);
        if (raw.includes('human-eval/1')) {
          try { objects.push(checkEval(JSON.parse(raw))); }
          catch (e) { throw new Error('发现无法解析的标注 JSON：' + e.message); }
        }
        start = -1;
      }
    }
    if (start >= 0 && text.slice(start).includes('human-eval/1')) throw new Error('标注 JSON 被截断，请复制完整单元格或区域。');
    return objects;
  }
  function parse(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('没有可保存的文本。');
    if (text.length > LIMIT) throw new Error('内容超过 12 MB，请按题目分批保存。');
    let records = [], coverage = [], warnings = [], modelColumns = [];
    const headerModel = h => h.trim().replace(/^\uFEFF/, '').match(/^(.+?)\s*[-－—]\s*人评$/)?.[1].trim();
    // Excel/Feishu copy serializes multiline JSON as properly quoted TSV cells.
    if (text.includes('\t') || headerModel(text.split(/\r?\n/)[0].replace(/^"|"$/g, ''))) {
      const rows = csv(text);
      const hi = rows.findIndex(r => r.some(h => headerModel(h)));
      const header = rows[hi] || [];
      const positions = header.map((h, i) => headerModel(h) ? i : -1).filter(i => i >= 0);
      if (positions.length) {
        modelColumns = positions.map(index => ({model:canonicalModel(headerModel(header[index])),label:header[index].trim().replace(/^\uFEFF/, ''),index}));
        if (new Set(modelColumns.map(c=>c.model)).size !== modelColumns.length) throw new Error('人评表头包含重复模型或重复别名，请检查复制范围。');
        const idCol = header.findIndex(h => /^(题目ID|题目编号|题号)$/i.test(h.trim().replace(/^\uFEFF/, '')));
        const fixedScope = positions.length === 4 && header.length === 13 &&
          positions.every((p, i) => p === i * 4 && header[p].trim() === MODEL_NAMES[i] + '-人评') && hi === 0 && rows.length === 11;
        for (let ri = hi + 1; ri < rows.length; ri++) {
          const r = rows[ri];
          if (r.every(c => !c.trim())) {
            if (!fixedScope && idCol < 0) continue;
          }
          if (r.length !== header.length) throw new Error(`第 ${ri + 1} 行列数不完整，请重复制所选区域。`);
          const docs = positions.map(ci => {
            if (!r[ci].trim()) return null;
            try {return checkEval(JSON.parse(r[ci]));}
            catch(e){throw new Error(`第 ${ri + 1} 行 / ${header[ci]}：${e.message}`);}
          });
          const ids = new Set(docs.filter(Boolean).map(d=>d.case_id));
          if (ids.size > 1) throw new Error(`第 ${ri + 1} 行的标注题号不一致。`);
          const rowId = idCol >= 0 ? r[idCol].trim() : [...ids][0] || (fixedScope ? 'Q' + String(ri).padStart(3, '0') : '');
          if (idCol >= 0 && !rowId && docs.some(Boolean)) throw new Error(`第 ${ri + 1} 行题目ID为空，请补齐题号。`);
          for (const ci of positions) {
            const model = canonicalModel(headerModel(header[ci]));
            const raw = r[ci];
            let doc = null;
            if (raw.trim()) {
              try { doc = checkEval(JSON.parse(raw)); }
              catch (e) { throw new Error(`第 ${ri + 1} 行 / ${header[ci]}：${e.message}`); }
              if (canonicalModel(doc.model) !== canonicalModel(model)) throw new Error(`第 ${ri + 1} 行的模型名与表头不一致。`);
              if(doc.model!==model) {
                warnings.push(`${doc.case_id}：JSON 模型名“${doc.model}”与表头“${model}”存在别名差异；按对应人评列匹配，完整原文保留。`);
                doc={...doc, source_model:doc.model, model:canonicalModel(model)};
              }
              records.push(doc);
            }
            const caseId = rowId;
            if (doc && caseId !== doc.case_id) throw new Error(`第 ${ri + 1} 行题号与 JSON 不一致。`);
            if (fixedScope && doc && doc.case_id !== 'Q' + String(ri).padStart(3, '0')) throw new Error('题号顺序与 Q001～Q010 区域不一致。');
            if (caseId) coverage.push({caseId, model, empty: !doc, cell: fixedScope ? COLS[positions.indexOf(ci)] + (ri + 1) : ''});
            else if (!doc) warnings.push(`第 ${ri + 1} 行有空标注，未提供题号，无法自动匹配。`);
          }
        }
      } else {
        for (const r of rows) for (const c of r) if (c.includes('human-eval/1')) records.push(...jsonObjects(c));
      }
    } else if (text.includes('human-eval/1')) records = jsonObjects(text);
    if (text.includes('human-eval/1') && !records.length) throw new Error('文本含标注标识，但没有完整的标注对象，请重新复制完整区域。');
    const seen = new Set();
    records = records.map(rec => canonicalModel(rec.model) === rec.model ? rec : {...rec,source_model:rec.source_model||rec.model,model:canonicalModel(rec.model)});
    for (const rec of records) {
      const k = key(rec.case_id, rec.model);
      if (seen.has(k)) throw new Error(`${rec.case_id} / ${rec.model} 有重复标注，不能自动选择其中一份。`);
      seen.add(k);
      if (!coverage.some(c => key(c.caseId, c.model) === k)) coverage.push({caseId: rec.case_id, model: rec.model, empty: false});
      if (!modelColumns.some(c=>c.model===rec.model)) modelColumns.push({model:rec.model,label:(rec.source_model||rec.model)+'-人评',index:null});
    }
    return {records, coverage, modelColumns, warnings: [...new Set(warnings)]};
  }
  function makeSnapshot(text, meta = {}) {
    const parsed = parse(text);
    return {schema: SCHEMA, title: String(meta.title || '保存的内容').slice(0, 500),
      url: String(meta.url || '').slice(0, 4096), savedAt: new Date().toISOString(),
      kind: parsed.modelColumns.length || parsed.records.length || parsed.coverage.length ? 'evaluations' : 'text', capture: String(meta.capture || '粘贴'),
      text, ...parsed};
  }
  function validateSnapshot(s) {
    if (!s || s.schema !== SCHEMA || typeof s.text !== 'string') throw new Error('快照文件格式不正确。');
    // Rebuild from raw text: imported derived scores must never override the source.
    const parsed = makeSnapshot(s.text, {title:s.title, url:s.url, capture:s.capture});
    parsed.savedAt = typeof s.savedAt === 'string' && Number.isFinite(Date.parse(s.savedAt)) ? s.savedAt : parsed.savedAt;
    return parsed;
  }
  function reasons(c) {
    return c ? JSON.stringify([c.note || '', (c.annotations || []).map(a => [a.text || '', a.times || [], a.correct ?? null, a.time_source ?? null])]) : '';
  }
  function compare(a, b) {
    const inventory = s => s?.modelColumns?.length ? s.modelColumns : [...new Set([...(s?.coverage||[]).map(c=>c.model),...(s?.records||[]).map(r=>r.model)])].map(model=>({model,label:model+'-人评'}));
    const inventories = {a:inventory(a),b:inventory(b)};
    const modelColumns = [...inventories.b,...inventories.a.filter(c=>!inventories.b.some(b=>b.model===c.model))];
    const records = s => new Map((s?.records || []).map(r => [key(r.case_id,r.model),r]));
    const ar = records(a), br = records(b);
    const scope = new Map();
    for (const s of [a,b]) for (const c of s?.coverage || []) scope.set(key(c.caseId,c.model), c);
    const groups = [];
    for (const [k,cov] of scope) {
      const left = ar.get(k), right = br.get(k);
      const singleSource = !inventories.a.some(c=>c.model===cov.model) || !inventories.b.some(c=>c.model===cov.model);
      const ids = new Set([...(left?.criteria || []),...(right?.criteria || [])].map(c=>c.id));
      const items = [...ids].sort((a,b)=>a.localeCompare(b, undefined, {numeric:true})).map(id => {
        const ac = left?.criteria.find(c=>c.id===id), bc = right?.criteria.find(c=>c.id===id);
        const as = typeof ac?.score === 'number', bs = typeof bc?.score === 'number';
        const status = as && bs ? (ac.score === bc.score ? 'same' : 'different') : singleSource && (as || bs) ? 'single' : 'missing';
        return {id, a: ac || null, b: bc || null, status, reasonDifferent: !!ac && !!bc && reasons(ac)!==reasons(bc)};
      });
      groups.push({caseId:cov.caseId, model:cov.model, a:left||null, b:right||null, items, singleSource, bothEmpty:!left&&!right});
    }
    const modelOrder=name=>modelColumns.findIndex(c=>c.model===name);
    groups.sort((a,b)=>a.caseId.localeCompare(b.caseId,undefined,{numeric:true})||modelOrder(a.model)-modelOrder(b.model)||a.model.localeCompare(b.model));
    const items = groups.flatMap(g=>g.items);
    return {groups, modelColumns, inventories, counts: {same:items.filter(i=>i.status==='same').length, single:items.filter(i=>i.status==='single').length,
      different:items.filter(i=>i.status==='different').length, missing:items.filter(i=>i.status==='missing').length,
      reasonDifferent:items.filter(i=>i.reasonDifferent).length, bothEmpty:groups.filter(g=>g.bothEmpty).length}};
  }
  function lines(text) { return text.replace(/\r\n/g,'\n').split('\n'); }
  function textDiff(a, b) {
    const aa=lines(a), bb=lines(b);
    // Keep additions/deletions aligned without allocating an unbounded LCS matrix.
    const rows=[]; let i=0,j=0;
    while(i<aa.length || j<bb.length) {
      if(i<aa.length && j<bb.length && aa[i]===bb[j]) { rows.push({a:aa[i++],b:bb[j++],same:true}); continue; }
      let ai=-1,bj=-1;
      for(let d=1;d<=40;d++) {
        if(i+d<aa.length && j<bb.length && aa[i+d]===bb[j]) {ai=i+d;break;}
        if(j+d<bb.length && i<aa.length && bb[j+d]===aa[i]) {bj=j+d;break;}
      }
      if(ai>=0) while(i<ai) rows.push({a:aa[i++],b:null,same:false});
      else if(bj>=0) while(j<bj) rows.push({a:null,b:bb[j++],same:false});
      else rows.push({a:i<aa.length?aa[i++]:null,b:j<bb.length?bb[j++]:null,same:false});
    }
    return rows;
  }
  const api={csv,parse,makeSnapshot,validateSnapshot,compare,textDiff,SCHEMA,COLS,MODEL_NAMES};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  root.CompareCore=api;
}(typeof globalThis!=='undefined'?globalThis:this));
