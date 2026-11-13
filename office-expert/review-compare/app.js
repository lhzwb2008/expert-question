(async function () {
  'use strict';
  const C = CompareCore, R = AuditCore, $ = id => document.getElementById(id);
  const escape = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = s => escape(String(s ?? '').replace(/\\n/g,'\n'));
  const isExtension = typeof chrome !== 'undefined' && !!chrome.storage?.local && !!chrome.runtime?.id;
  // Memory-only adapter is for local UI verification. Real installation always uses chrome.storage.local.
  let memory = {};
  const store = isExtension ? chrome.storage.local : {
    async get(){ return memory; }, async set(value){memory={...memory,...value};}, async remove(keys){for(const key of [].concat(keys)) delete memory[key];}
  };
  let snapshots = {a:null,b:null}, target = null, result = null, pasteSlot = 'a', busy = false, pastedRaw = null;
  let reviews={}, reviewWrites=Promise.resolve();
  function persistReviews(){
    const value=structuredClone(reviews);
    reviewWrites=reviewWrites.catch(()=>{}).then(()=>store.set({reviews:value}));
    reviewWrites.catch(e=>notice('校对记录保存失败：'+e.message,true));
    return reviewWrites;
  }
  async function replaceSnapshots(next){
    await reviewWrites;
    const changed=['a','b'].some(s=>(snapshots[s]?.text??null)!==(next[s]?.text??null));
    if(changed)reviews={};
    await store.set({...next,reviews});snapshots=next;
    return changed;
  }
  function auditForm(group,item){
    const r=R.get(reviews,group,item),o=R.outcome(reviews,group,item);
    const value=r?.score||'',note=r?.note||'',optional=['same','single'].includes(item.status);
    return `<form class="audit-form" data-key="${escape(R.key(group,item))}"><div class="audit-head"><b>统一答案${optional?'（选填）':''}</b><span class="audit-state">${escape(o.status)}${o.score!==null?' · '+o.score+' 分':''}</span></div><label>统一分数<input name="score" aria-label="统一分数" type="number" min="0" max="5" step="any" ${optional?'':'required'} value="${escape(value)}" placeholder="${optional?'留空沿用 '+(item.b||item.a).score+' 分':'0～5'}"></label><label class="note-label">评分理由</label><textarea name="note" aria-label="统一评分理由" ${optional?'':'required'} placeholder="${optional?'选填；留空保留原始理由':'填写核实后的统一评分理由…'}">${escape(note)}</textarea><div class="actions"><span class="caption">${optional?'选填内容自动保存并用于导出；留空沿用原分和原始理由。':'编辑自动保存为草稿；修改已确认答案后需重新确认。'}</span><button type="submit" name="action" value="draft" formnovalidate>${optional?'保存选填内容':'保存草稿'}</button>${optional?'':'<button type="submit" name="action" value="confirm" class="primary">确认统一答案</button>'}</div></form>`;
  }
  function renderOverview(){
    if(!result)return;
    const caseId=$('overview-case').value;
    const scoreCell=(s)=>s===null||s===undefined?'—':escape(s);
    let html='<table><thead><tr><th>模型</th><th>维度</th><th>统一分数</th><th>确认状态</th><th>评分理由</th><th>操作</th></tr></thead><tbody>';
    for(const g of result.groups.filter(g=>g.caseId===caseId)){
      if(g.bothEmpty)html+=`<tr><td>${escape(g.model)}</td><td colspan="5">两侧标注为空</td></tr>`;
      for(const i of g.items){
        const o=R.outcome(reviews,g,i);
        html+=`<tr><td>${escape(g.model)}</td><td>${escape(i.id)}</td><td><b>${scoreCell(o.score)}</b></td><td>${escape(o.status)}</td><td>${text(o.note)}</td><td><button data-review-key="${escape(R.key(g,i))}">查看 / 核实</button></td></tr>`;
      }
    }
    $('overview-table').innerHTML=html+'</tbody></table>';
  }
  function auditProgress(){
    if(!result)return;
    const all=result.groups.flatMap(g=>g.items.filter(i=>!['same','single'].includes(i.status)).map(i=>R.outcome(reviews,g,i)));
    $('audit-progress').textContent=`需统一项已确认 ${all.filter(o=>o.status==='已确认').length} / ${all.length} 项`;
    const selected=result.groups.filter(g=>g.caseId===$('export-case').value).flatMap(g=>g.items.filter(i=>!['same','single'].includes(i.status)).map(i=>R.outcome(reviews,g,i)));
    if(!$('export-status').classList.contains('error'))$('export-status').textContent=`本题需统一项已确认 ${selected.filter(o=>o.status==='已确认').length} / ${selected.length} 项；一致项和仅单侧模型选填，留空沿用原分。`;
    if($('overview').open)renderOverview();
  }
  function findItem(key){
    for(const g of result?.groups||[])for(const i of g.items)if(R.key(g,i)===key)return {g,i};
    throw new Error('对应评分项已变更，请重新打开校对区。');
  }
  function readAudit(form,i){
    const f=name=>form.elements.namedItem(name).value;
    return {source:R.source(i),score:f('score'),note:f('note'),confirmed:false,updatedAt:new Date().toISOString(),confirmedAt:''};
  }
  function updateAudit(form,g,i){
    const o=R.outcome(reviews,g,i);
    form.querySelector('.audit-state').textContent=o.status+(o.score!==null?' · '+o.score+' 分':'');
    $('export-status').classList.remove('error');
    auditProgress();
  }
  function resetPaste() {
    pastedRaw=null;$('paste-text').value='';$('paste-text').readOnly=false;$('paste-info').textContent='';
  }
  const filter = {caseId:'all',model:'all',mode:'all',search:''};
  function notice(message, error=false) { $('notice').textContent=message; $('notice').className=error?'error':'success'; }
  function safeUrl(value) { try {const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch(_){return '';} }
  function bytes(value){return new TextEncoder().encode(value).byteLength;}
  function size(value){return (value / 1024).toFixed(1)+' KB';}
  function originalDoc(doc) {
    if(!doc?.source_model)return doc;
    const original={...doc,model:doc.source_model};delete original.source_model;return original;
  }
  function showSource(slot) {
    const s=snapshots[slot], node=$('source-'+slot);
    node.innerHTML=s?`<strong>${escape(s.title)}</strong>${safeUrl(s.url)?`<a href="${escape(safeUrl(s.url))}" target="_blank" rel="noopener">${escape(s.url)}</a>`:''}<div>${s.kind==='evaluations'?`${s.records.length} 份标注 · ${s.records.reduce((n,r)=>n+r.criteria.length,0)} 项评分 · ${s.coverage.filter(c=>c.empty).length} 个空格`:`普通文本 · ${s.text.length.toLocaleString()} 字符`}</div><div>${escape(new Date(s.savedAt).toLocaleString())} · ${escape(s.capture)}</div>${s.warnings.length?`<details class="warnings"><summary>${s.warnings.length} 条模型匹配提示</summary>${s.warnings.map(escape).join('<br>')}</details>`:''}`:'尚未保存';
    if(s?.kind==='evaluations'){
      const cols=s.modelColumns||[];
      node.insertAdjacentHTML('beforeend',`<div class="model-inventory">已识别 ${cols.length} 个模型：${cols.map(c=>escape(c.label.replace(/\s*[-－—]\s*人评$/,''))).join('；')}</div>`);
    }
  }
  function options(node, values, selected, label) {
    node.innerHTML=`<option value="all">${label}</option>`+values.map(v=>`<option value="${escape(v)}">${escape(v)}</option>`).join('');
    node.value=values.includes(selected)?selected:'all';return node.value;
  }
  function metrics(counts) {
    $('metrics').innerHTML=[['different','分数不同',counts.different],['same','分数一致',counts.same],['missing','缺项 / 未给分',counts.missing],['single','仅单侧模型',counts.single],['reasons','原因不同',counts.reasonDifferent]].map(([id,name,n])=>`<div class="metric ${id==='different'?'diff':''}">${name}<b>${n}</b></div>`).join('');
  }
  function time(seconds) {
    if(typeof seconds!=='number'||!Number.isFinite(seconds)) return '?';
    const s=(seconds%60).toFixed(2).replace(/\.00$/,'').replace(/(\.\d)0$/,'$1');
    return String(Math.floor(seconds/60)).padStart(2,'0')+':'+(seconds%60<10?'0':'')+s;
  }
  function reason(c, slot, group) {
    const heading=`<h4><span>${slot.toUpperCase()} · ${typeof c?.score==='number'?c.score+' 分':'未给分'}</span><span>${escape(c?.status||'')}</span></h4>`;
    if(!c) return `<section class="side">${heading}<div class="absent">${group.singleSource&&!group[slot]?'此侧保存内容未包含该模型；已有单侧评分可沿用。':group[slot]?'原始标注中没有此评分项。':'未保存对应题号和模型的标注，或原格为空。'}</div></section>`;
    return `<section class="side">${heading}${c.note?`<div class="note">${text(c.note)}</div>`:''}${(c.annotations||[]).map((ann,i)=>`<div class="ann"><div class="meta">标注 ${i+1} · 原 correct 标记：${ann.correct===true?'正确':ann.correct===false?'错误':'未设置'}${ann.times?.length?' · '+escape(ann.times.map(t=>time(t.start)+'–'+time(t.end)).join(' / ')):''}</div><div class="raw-text">${text(ann.text)}</div></div>`).join('')}${!c.note&&!(c.annotations||[]).length?'<div class="absent">此项未填写原因。</div>':''}</section>`;
  }
  function matched(item,group) {
    if(filter.mode==='different'&&item.status!=='different') return false;
    if(filter.mode==='missing'&&item.status!=='missing') return false;
    if(filter.mode==='single'&&item.status!=='single') return false;
    if(filter.mode==='reasons'&&!item.reasonDifferent) return false;
    return !filter.search || [group.caseId,group.model,item.id,...[item.a,item.b].filter(Boolean).flatMap(c=>[c.note,...(c.annotations||[]).map(a=>a.text)])].join('\n').toLowerCase().includes(filter.search.toLowerCase());
  }
  function renderEvaluations() {
    const scopedGroups=result.groups.filter(g=>(filter.caseId==='all'||g.caseId===filter.caseId)&&(filter.model==='all'||g.model===filter.model));
    const scopedItems=scopedGroups.flatMap(g=>g.items);
    metrics({different:scopedItems.filter(i=>i.status==='different').length,same:scopedItems.filter(i=>i.status==='same').length,
      missing:scopedItems.filter(i=>i.status==='missing').length,single:scopedItems.filter(i=>i.status==='single').length,reasonDifferent:scopedItems.filter(i=>i.reasonDifferent).length});
    let html='', n=0, opened=false, emptyGroups=0;
    for(const group of result.groups) {
      if(filter.caseId!=='all'&&group.caseId!==filter.caseId || filter.model!=='all'&&group.model!==filter.model) continue;
      const items=group.items.filter(item=>matched(item,group));
      if(!items.length&&!group.bothEmpty) continue;
      if(group.bothEmpty&&(filter.mode==='different'||filter.mode==='reasons'||filter.search)) continue;
      const count=group.items.filter(i=>i.status==='different').length;
      html+=`<article class="group"><div class="group-head"><h3><span class="case">${escape(group.caseId)}</span>${escape(group.model)}</h3><span class="badge">${count} 项分数不同</span></div>`;
      if(group.bothEmpty) {emptyGroups++;html+='<div class="side absent">A、B 对应原始格均为空，不作 0 分，不参与分数差异统计。</div>';}
      for(const item of items) {
        n++;
        const autoOpen=!opened&&item.status==='different';
        if(autoOpen)opened=true;
        const name={same:'分数一致',different:'分数不同',missing:'缺项 / 未给分',single:'仅单侧模型'}[item.status];
        html+=`<details class="item ${item.status}" ${autoOpen?'open':''}><summary><span class="criterion-id">${escape(item.id)}</span><span class="reason-change">${item.reasonDifferent?'原因文字不同':''}</span><span class="scores">${['a','b'].map(s=>`<span class="score"><small>${s.toUpperCase()}</small>${typeof item[s]?.score==='number'?item[s].score:'—'}</span>`).join('')}</span><span class="status">${name}</span></summary><div class="sides">${reason(item.a,'a',group)}${reason(item.b,'b',group)}</div>${auditForm(group,item)}</details>`;
      }
      html+=`<details class="raw-details"><summary>查看两侧完整标注 JSON</summary><div class="raw-columns">${['a','b'].map(s=>`<div><b>${s.toUpperCase()}</b><pre>${group[s]?escape(JSON.stringify(originalDoc(group[s]),null,2)):'原始标注为空或未提供'}</pre></div>`).join('')}</div></details></article>`;
    }
    $('results').innerHTML=html||'<div class="empty">当前筛选没有匹配项。</div>';
    $('results-info').textContent=`上方统计为当前题号和模型范围；筛选后显示 ${n} 对评分项${emptyGroups?'、'+emptyGroups+' 对空标注':''}。按题号＋模型＋评分项 ID 匹配；红底为分数不同，黄底为缺项。原因不同统计不包含随机标注 ID。`;
    auditProgress();
  }
  function renderText() {
    const rows=C.textDiff(snapshots.a.text,snapshots.b.text);
    const count=rows.filter(r=>!r.same).length;
    $('metrics').innerHTML=`<div class="metric diff">不同的文本行<b>${count}</b></div><div class="metric">相同的文本行<b>${rows.length-count}</b></div>`;
    const selected=rows.filter(r=>(filter.mode==='all'||!r.same)&&(!filter.search||[r.a,r.b].join('\n').toLowerCase().includes(filter.search.toLowerCase())));
    const shown=selected.slice(0,1500);
    let ai=0,bi=0;const numbered=new Map(rows.map(r=>[r,{a:r.a===null?'':++ai,b:r.b===null?'':++bi}]));
    $('results').innerHTML='<div class="text-table"><div class="text-row"><div class="text-cell"><b>A 内容</b></div><div class="text-cell"><b>B 内容</b></div></div>'+shown.map(r=>`<div class="text-row">${['a','b'].map(s=>`<div class="text-cell ${!r.same&&r[s]!==null?'changed':''}"><span class="lineno">${numbered.get(r)[s]}</span>${escape(r[s]??'')}</div>`).join('')}</div>`).join('')+'</div>';
    $('results-info').textContent=`普通文本按行对照（相邻 40 行内寻找对齐位置）。${selected.length>shown.length?'当前显示前 1,500 行，请用搜索缩小范围；完整内容仍保存在快照中。':'当前显示 '+shown.length+' 行。'}画布、未加载内容和视频不在文字快照中。`;
  }
  function render(reset=false) {
    showSource('a');showSource('b');
    $('cache-size').textContent='本地内容 '+size(bytes(JSON.stringify({snapshots,reviews})));
    const ready=!!snapshots.a&&!!snapshots.b;
    $('comparison').hidden=!ready;$('empty').hidden=ready;
    $('export').disabled=!snapshots.a&&!snapshots.b;
    $('audit-tools').hidden=true;
    $('csv-export').hidden=true;
    if(!ready){
      $('overview-table').replaceChildren();$('audit-progress').textContent='';$('export-status').textContent='';
      $('export-status').classList.remove('error');$('overview-case').replaceChildren();$('export-case').replaceChildren();
      return;
    }
    const structured=snapshots.a.kind==='evaluations'&&snapshots.b.kind==='evaluations';
    $('case-filter').parentElement.hidden=!structured;
    $('model-filter').parentElement.hidden=!structured;
    if(structured) {
      result=C.compare(snapshots.a,snapshots.b);
      $('audit-tools').hidden=false;
      $('csv-export').hidden=false;
      const cases=[...new Set(result.groups.map(g=>g.caseId))];
      const current=$('overview-case').value;
      $('overview-case').innerHTML=cases.map(c=>`<option>${escape(c)}</option>`).join('');
      $('overview-case').value=cases.includes(current)?current:cases[0];
      $('export-case').innerHTML=$('overview-case').innerHTML;
      $('export-case').value=$('overview-case').value;
      filter.caseId=options($('case-filter'),[...new Set(result.groups.map(g=>g.caseId))],reset?'all':filter.caseId,'全部题号');
      filter.model=options($('model-filter'),[...new Set(result.groups.map(g=>g.model))],reset?'all':filter.model,'全部模型');
      if(![...$('mode').options].some(o=>o.value==='single'))$('mode').innerHTML='<option value="all">全部评分项</option><option value="different">仅分数不同</option><option value="reasons">仅原因不同</option><option value="missing">仅缺项</option><option value="single">仅单侧模型</option>';
      if(reset)filter.mode='all';$('mode').value=filter.mode;
      renderEvaluations();
    } else {
      $('overview-table').replaceChildren();$('export-status').textContent='';
      $('mode').innerHTML='<option value="all">全部文本行</option><option value="different">仅不同行</option>';
      if(!['all','different'].includes(filter.mode)||reset)filter.mode='all';$('mode').value=filter.mode;
      renderText();
    }
  }
  async function save(slot, raw, meta) {
    const snapshot=C.makeSnapshot(raw,meta);
    const hadReviews=Object.keys(reviews).length>0;
    const changed=await replaceSnapshots({...snapshots,[slot]:snapshot});render(true);
    notice(`已保存到 ${slot.toUpperCase()}：${snapshot.records.length?snapshot.records.length+' 份完整标注':snapshot.coverage.length?'已记录空标注范围':snapshot.text.length.toLocaleString()+' 字符'}。${changed&&hadReviews?'来源内容已替换，原校对记录已清除，避免套用旧结论。':''}`);
  }
  async function run(task) {
    if(busy)return;busy=true;
    try {await task();}catch(error){notice(error.message||String(error),true);}finally{busy=false;}
  }
  async function refreshTarget() {
    if(!isExtension)return;
    const session=await chrome.storage.session.get(['target','incomingSelection']);
    target=session.target||null;
    $('target-title').textContent=target?.title||'请在需要保存的页面点击插件图标';
    $('target-url').textContent=target?.url||'';
    if(session.incomingSelection) {
      const s=session.incomingSelection;
      try {await save('a',s.text,{title:s.title,url:s.url,capture:'右键选中文字'});}
      catch(e){notice(e.message,true);}
      await chrome.storage.session.remove('incomingSelection');
    }
  }
  async function capture(slot) {
    if(!isExtension)throw new Error('请将插件加载到 Chrome 或 Edge 后，在来源页面点击插件图标。');
    if(!target?.id)throw new Error('请先在来源页面点击插件图标。');
    if(!safeUrl(target.url))throw new Error('浏览器内部页、扩展页和商店页不能读取。请选择普通 http/https 页面。');
    const origin=new URL(target.url).origin+'/*';
    // Request synchronously within the button gesture; already-granted origins do not prompt again.
    const granted=await chrome.permissions.request({origins:[origin]});
    if(!granted)throw new Error('没有获得此网站的读取授权。仍可复制文字后粘贴保存。');
    const actual=await chrome.tabs.get(target.id);
    const url=actual.url||target.url;
    if(!safeUrl(url))throw new Error('浏览器内部页、扩展页和商店页不能读取。请选择普通 http/https 页面。');
    if(new URL(url).origin+'/*'!==origin)throw new Error('来源页面已跳转到另一个网站，请在新页面再次点击插件图标后保存。');
    const response=await chrome.scripting.executeScript({target:{tabId:actual.id},func:()=>{
      const selected=window.getSelection()?.toString()||'';
      const isSheet=!!document.querySelector('canvas')&&(/larkoffice|feishu|larksuite|doubao/.test(location.hostname))&&(/\/wiki\/|\/sheets\//.test(location.pathname));
      if(isSheet&&!selected.trim())return {error:'飞书表格由画布绘制，页面文字不包含完整单元格。请复制包含题目ID、全部模型人评表头及题目行的完整区域，Ctrl+C 后使用“保存剪贴板”，或粘贴内容。'};
      return {text:selected.trim()?selected:document.body?.innerText||'',title:document.title,url:location.href,capture:selected.trim()?'页面选区':'已加载页面文字'};
    }});
    const data=response[0]?.result;
    if(!data)throw new Error('未读取到页面文字。请复制需要的内容后粘贴。');
    if(data.error)throw new Error(data.error);
    await save(slot,data.text,data);
  }
  function download(name, value) {
    const csv=name.endsWith('.csv');
    const url=URL.createObjectURL(new Blob([csv?value:JSON.stringify(value,null,2)],{type:csv?'text/csv;charset=utf-8':'application/json;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function loadReview() {
    const data=await fetch('review.json').then(r=>{if(!r.ok)throw new Error('内置复核快照读取失败。');return r.json();});
    const a=C.validateSnapshot(data.a),b=C.validateSnapshot(data.b);
    await replaceSnapshots({a,b});filter.search='';$('search').value='';$('export-status').classList.remove('error');render(true);
    notice('已载入重新读取的作业快照（'+data.checkedAt+'）。可随时保存新页面内容替换。');
  }
  $('load-review').onclick=()=>run(loadReview);$('load-review-empty').onclick=()=>run(loadReview);
  for(const slot of ['a','b']) {
    $('capture-'+slot).onclick=()=>run(()=>capture(slot));
    $('clipboard-'+slot).onclick=()=>run(async()=>{
      const raw=await navigator.clipboard.readText();
      await save(slot,raw,{title:target?.title||'剪贴板内容',url:target?.url||'',capture:'剪贴板（复制范围）'});
    });
    $('clear-'+slot).onclick=()=>run(async()=>{
      await reviewWrites;await store.remove([slot,'reviews']);reviews={};snapshots[slot]=null;result=null;$('results').replaceChildren();resetPaste();render();
      notice('已清空 '+slot.toUpperCase()+' 的保存内容。');
    });
  }
  document.querySelectorAll('[data-paste]').forEach(button=>button.onclick=()=>{
    pasteSlot=button.dataset.paste;$('paste-title').textContent='保存内容到 '+pasteSlot.toUpperCase();
    $('paste-name').value=target?.title||'';resetPaste();$('paste-dialog').showModal();$('paste-text').focus();
  });
  $('paste-text').onpaste=event=>{
    const raw=event.clipboardData?.getData('text/plain');
    if(raw===undefined||(!pastedRaw&&raw.length<=20000))return;
    if(raw.length<=20000){event.preventDefault();resetPaste();$('paste-text').value=raw;return;}
    event.preventDefault();pastedRaw=raw;
    $('paste-text').value=raw.slice(0,2000);
    $('paste-text').readOnly=true;
    $('paste-info').textContent=`已完整接收 ${raw.length.toLocaleString()} 字符；下方仅预览前 2,000 字符。保存使用完整内容。重新粘贴可替换。`;
  };
  $('paste-text').oninput=()=>{pastedRaw=null;$('paste-info').textContent='';};
  $('paste-dialog').addEventListener('cancel',resetPaste);
  $('cancel-paste').onclick=()=>{resetPaste();$('paste-dialog').close();};
  $('paste-form').onsubmit=event=>{
    event.preventDefault();
    run(async()=>{await save(pasteSlot,pastedRaw??$('paste-text').value,{title:$('paste-name').value||'粘贴内容',url:target?.url||'',capture:'手动粘贴'});resetPaste();$('paste-dialog').close();});
  };
  $('clear').onclick=()=>$('clear-dialog').showModal();
  $('cancel-clear').onclick=()=>$('clear-dialog').close();
  $('confirm-clear').onclick=()=>run(async()=>{
    await reviewWrites;await store.remove(['a','b','reviews']);reviews={};
    if(isExtension)await chrome.storage.session.remove('incomingSelection');
    snapshots={a:null,b:null};result=null;filter.caseId='all';filter.model='all';filter.mode='all';filter.search='';
    $('search').value='';resetPaste();$('paste-name').value='';$('results').replaceChildren();$('metrics').replaceChildren();
    $('import-file').value='';$('clear-dialog').close();render();notice('已清空全部保存内容和临时输入。不会自动重新载入。');
  });
  $('export').onclick=()=>run(async()=>{await reviewWrites;download('作业对比快照_'+new Date().toISOString().slice(0,10)+'.json',{schema:'annotation-compare/bundle-v1',exportedAt:new Date().toISOString(),...snapshots,reviews});});
  $('import').onclick=()=>$('import-file').click();
  $('import-file').onchange=()=>run(async()=>{
    const file=$('import-file').files[0];if(!file)return;
    if(file.size>30*1024*1024)throw new Error('快照包超过 30 MB，请分批导入。');
    const data=JSON.parse(await file.text());
    let next;
    if(data.schema==='annotation-compare/bundle-v1')next={a:data.a?C.validateSnapshot(data.a):null,b:data.b?C.validateSnapshot(data.b):null};
    else if(data.schema===C.SCHEMA)next={...snapshots,a:C.validateSnapshot(data)};
    else throw new Error('请导入此插件导出的 JSON 快照。');
    const importedReviews=data.schema==='annotation-compare/bundle-v1'?R.importReviews(data.reviews,C.compare(next.a,next.b)):{};
    await reviewWrites;await store.set({...next,reviews:importedReviews});snapshots=next;reviews=importedReviews;render(true);$('import-file').value='';notice('快照已导入。原始分数重新解析，统一答案与确认记录已恢复。');
  });
  for(const [id,key]of [['case-filter','caseId'],['model-filter','model'],['mode','mode']])$(id).onchange=()=>{
    filter[key]=$(id).value;
    if(id==='case-filter'&&filter.caseId!=='all')$('overview-case').value=filter.caseId;
    $('export-status').classList.remove('error');render();
  };
  $('search').oninput=()=>{filter.search=$('search').value.trim();render();};
  $('expand').onclick=()=>document.querySelectorAll('.item').forEach(d=>d.open=true);
  $('collapse').onclick=()=>document.querySelectorAll('.item').forEach(d=>d.open=false);
  $('results').addEventListener('input',event=>{
    const form=event.target.closest('.audit-form');if(!form)return;
    const {g,i}=findItem(form.dataset.key);
    reviews={...reviews,[form.dataset.key]:readAudit(form,i)};
    persistReviews();updateAudit(form,g,i);
  });
  $('results').addEventListener('submit',event=>{
    const form=event.target.closest('.audit-form');if(!form)return;
    event.preventDefault();
    run(async()=>{
      const {g,i}=findItem(form.dataset.key),r=readAudit(form,i);
      if(['same','single'].includes(i.status))R.validate(r,i);
      if(event.submitter?.value==='confirm'){R.validate(r,i);r.confirmed=true;r.confirmedAt=new Date().toISOString();}
      reviews={...reviews,[form.dataset.key]:r};await persistReviews();updateAudit(form,g,i);
      notice(r.confirmed?`${g.caseId} / ${i.id} 已确认最终 ${R.finalScore(r,i)} 分。`:['same','single'].includes(i.status)?'选填内容已保存，可直接导出。':'校对草稿已保存。');
    });
  });
  $('overview').ontoggle=()=>{if($('overview').open)renderOverview();};
  function chooseQuestion(value){
    $('overview-case').value=value;$('export-case').value=value;
    $('export-status').classList.remove('error');auditProgress();if($('overview').open)renderOverview();
  }
  $('overview-case').onchange=()=>chooseQuestion($('overview-case').value);
  $('export-case').onchange=()=>chooseQuestion($('export-case').value);
  $('overview-table').onclick=event=>{
    const button=event.target.closest('[data-review-key]');if(!button)return;
    const {g,i}=findItem(button.dataset.reviewKey);
    filter.caseId=g.caseId;filter.model=g.model;filter.mode='all';filter.search='';$('search').value='';
    render();
    const form=[...document.querySelectorAll('.audit-form')].find(f=>f.dataset.key===R.key(g,i));
    form.parentElement.open=true;form.scrollIntoView({block:'center'});form.elements.namedItem('score').focus();
  };
  $('export-writeback-csv').onclick=()=>run(async()=>{
    await reviewWrites;
    try{
      const caseId=$('export-case').value;
      const rows=R.writebackRows(C.compare(snapshots.a,snapshots.b),reviews,caseId);
      download(caseId+'.csv',R.toCSV(rows));
      $('export-status').classList.remove('error');
      $('export-status').textContent=`已导出 ${caseId} 的完整核实评分。按题目ID定位原行，将各人评列 JSON 写入对应单元格。`;
      notice('核实评分 CSV 已导出。');
    }catch(e){$('export-status').classList.add('error');$('export-status').textContent=e.message;throw e;}
  });
  const saved=await store.get(['a','b','reviews']);
  try {snapshots={a:saved.a?C.validateSnapshot(saved.a):null,b:saved.b?C.validateSnapshot(saved.b):null};}
  catch(e){notice('本地快照无法解析，请清空后重新保存：'+e.message,true);}
  try{reviews=R.importReviews(saved.reviews,C.compare(snapshots.a,snapshots.b));}catch(e){notice('校对记录无法解析：'+e.message,true);}
  render();await refreshTarget();
  if(isExtension)chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='session'&&(changes.target||changes.incomingSelection))refreshTarget().catch(e=>notice(e.message,true));
  });
  fetch('review-meta.json').then(r=>r.json()).then(d=>$('review-date').textContent='复核快照：'+d.checkedAt).catch(()=>{});
}());
