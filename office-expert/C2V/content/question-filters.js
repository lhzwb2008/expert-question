(() => {
  'use strict';
  if (globalThis.__cyleQuestionFiltersV1) return;
  const el=(tag,text='',cls='')=>{const node=document.createElement(tag);node.textContent=text;node.className=cls;return node;};
  const button=(label,action)=>{const node=el('button',label);node.type='button';node.onclick=action;return node;};
  const text=value=>value==null?'':String(value);
  const tokens=value=>{
    if(Array.isArray(value))return value.flatMap(tokens);
    if(value&&typeof value==='object')return tokens(value.text??value.name??value.value??'');
    const raw=text(value);if(raw.startsWith('[')){try{return tokens(JSON.parse(raw));}catch{}}
    return raw.split(/[,，、;；\n]/).map(v=>v.trim());
  };
  function create({parent,getRow,onChange,onRefresh,onWrite}) {
    const host=el('span','','cyle-question-filters');host.style.cssText='display:block;flex:0 0 auto;min-width:60px';parent.append(host);
    const workHost=el('span','','cyle-question-work');
    parent.insertBefore(workHost,parent.querySelector('.gtm-inspector-question-nav-button'));
    const root=host.attachShadow({mode:'open'}),workRoot=workHost.attachShadow({mode:'open'});
    const style=el('style');style.textContent=`
      :host{font:12px/1.5 Inter,"PingFang SC",sans-serif;color:var(--pet-text,#eef2f5)}*{box-sizing:border-box}[hidden]{display:none!important}
      button,input,select{font:inherit;color:inherit}button{cursor:pointer;border:1px solid var(--pet-border);border-radius:7px;background:var(--pet-raised);padding:6px 9px}button:hover{background:var(--pet-soft)}button:disabled,select:disabled{opacity:.55;cursor:default}
      button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--pet-accent);outline-offset:2px}
      input,select{min-width:0;border:1px solid var(--pet-border);border-radius:6px;padding:6px 8px;background:var(--pet-input);color:var(--pet-text)}
      .bar{display:flex;gap:5px}.bar>button{white-space:nowrap;background:transparent}.bar>button[aria-expanded=true]{border-color:var(--pet-accent);background:color-mix(in srgb,var(--pet-accent) 14%,var(--pet-surface));outline:1px dashed color-mix(in srgb,var(--pet-accent) 38%,transparent);outline-offset:-4px;box-shadow:inset 0 1px 2px var(--pet-lip,#fff2),0 1px 2px var(--pet-shade,#0002)}
      .popup{position:fixed;inset:auto;margin:0;width:420px;max-width:calc(100vw - 24px);padding:0;overflow:hidden;flex-direction:column;border:1px solid var(--pet-border);border-radius:12px;background:var(--pet-surface);color:var(--pet-text);box-shadow:0 12px 36px #0004;color-scheme:var(--pet-scheme,dark)}.popup:popover-open{display:flex}.popup::backdrop{background:transparent}
      .foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;flex:none}.foot button{border:0;background:transparent;font-size:11px;color:var(--pet-muted)}
      .body{overflow:auto;min-height:0;padding:10px 14px;overscroll-behavior:contain}.tag-search{width:100%;margin-bottom:5px}.condition{padding:11px 0;border-bottom:1px solid color-mix(in srgb,var(--pet-border) 55%,transparent)}.condition:last-child{border-bottom:0}
      .condition-head{display:flex;align-items:center;gap:8px}.condition-head strong,summary{font-size:12px;font-weight:500;color:var(--pet-muted)}.condition-head strong{flex:1}summary{cursor:pointer;padding:2px 0}
      .values{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}.tag{white-space:normal;overflow-wrap:anywhere;text-align:left;padding:5px 10px;border:1px solid transparent;border-radius:7px;background:var(--pet-raised);font-size:12px;line-height:1.5;box-shadow:inset 0 1px 1px var(--pet-lip,#fff1)}
      .tag[aria-pressed=true]{color:var(--pet-text);border-color:var(--pet-accent);background:color-mix(in srgb,var(--pet-accent) 14%,var(--pet-surface));outline:1px dashed color-mix(in srgb,var(--pet-accent) 38%,transparent);outline-offset:-4px;box-shadow:inset 0 1px 2px var(--pet-lip,#fff2),0 1px 2px var(--pet-shade,#0002)}
      .foot{border-top:1px solid var(--pet-border)}.match-count,.notice{margin:0;font-size:11px;color:var(--pet-muted)}.notice{padding:0 14px 7px;white-space:pre-wrap;color:var(--pet-accent);flex:none}.notice:empty{display:none}.match-count{padding-top:12px}
      .work-bar{display:flex;align-items:center;gap:5px;max-width:340px}.work-name{max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--pet-muted)}.work-bar select{width:92px;max-width:120px;padding:5px 6px;background:var(--pet-raised);border-radius:6px}.work-notice{position:fixed;z-index:100;max-width:320px;padding:7px 10px;background:var(--pet-raised);border:1px solid var(--pet-border);border-radius:6px;font-size:11px;color:var(--pet-text)}
    `;
    root.append(style);workRoot.append(style.cloneNode(true));
    const bar=el('div','','bar'),popup=el('div','','popup'),workBar=el('div','','work-bar'),workNotice=el('div','','work-notice');
    popup.setAttribute('popover','manual');popup.setAttribute('role','dialog');popup.setAttribute('aria-label','题目筛选');workNotice.setAttribute('role','status');workNotice.hidden=true;
    root.append(bar,popup);workRoot.append(workBar,workNotice);
    let row=null,defs=[],works=[],conditions={},items=[],currentTable='',epoch=0,saving=false,identity=null,conditionHeaders={},selectedWork='',searchQuery='',message='';
    const cache=new Map(),expanded=new Set();
    const fieldKey=f=>String(f.source.index);
    const selected=()=>Object.entries(conditions).filter(([,values])=>values.length);
    const allFields=()=>[...defs,...works.flatMap(w=>w.person?[w.person]:[])];
    function filter(source){return source.filter(item=>selected().every(([key,values])=>tokens(item.filterValues?.[key]).some(v=>values.includes(v))));}
    function store(){const record={values:structuredClone(conditions),headers:conditionHeaders,work:selectedWork};cache.set(currentTable,record);chrome.storage.local.set({['cyleQuestionFiltersV1:'+currentTable]:record}).catch(()=>notice('筛选条件暂未保存到本机。'));}
    function changed(){conditionHeaders=Object.fromEntries(allFields().map(f=>[fieldKey(f),f.source.header]));store();renderBar();renderPopup();onChange();}
    function chooseWork(id){
      for(const work of works)if(work.person)delete conditions[fieldKey(work.person)];
      selectedWork=selectedWork===id?'':id;changed();
    }
    async function setRow(next){
      const token=++epoch;row=next;
      if(!next){defs=[];works=[];renderBar();renderPopup();return;}
      const M=globalThis.__cyleFieldMappingV1,config=await M.load(next);if(token!==epoch)return;
      const table=M.key(next);
      if(table!==currentTable){
        const record=cache.get(table)||(await chrome.storage.local.get('cyleQuestionFiltersV1:'+table))?.['cyleQuestionFiltersV1:'+table];if(token!==epoch)return;
        currentTable=table;conditions=record?.values||{};conditionHeaders=record?.headers||{};selectedWork=record?.work||'';items=[];searchQuery='';expanded.clear();
      }
      const fields=config?M.read(next,config):[];identity=fields.find(f=>f.isIdentity)||null;defs=[];works=[];
      const byWork=new Map(),seen=new Set();
      for(const f of fields){
        const original=config.fields.find(x=>x.id===f.id),entity=config.entities?.find(e=>e.id===original.entityId),role=original.role||original.label.split(' · ').at(-1);
        if(entity?.type==='work'||f.group==='人员与状态'){
          const id=entity?.id||original.label.split(' · ')[0];if(!byWork.has(id))byWork.set(id,{id,name:entity?.name||id});
          const work=byWork.get(id);if(/人员|同学/.test(role))work.person=f;if(/状态/.test(role))work.status=f;
        }else if(original.entityId==='tags'&&!f.isIdentity&&!seen.has(fieldKey(f))){defs.push({...f,name:f.source.header});seen.add(fieldKey(f));}
      }
      works=[...byWork.values()];if(!works.some(w=>w.id===selectedWork))selectedWork='';
      for(const key of Object.keys(conditions))if(!Array.isArray(conditions[key])||!allFields().some(f=>fieldKey(f)===key&&(!conditionHeaders[key]||conditionHeaders[key]===f.source.header)))delete conditions[key];
      // Legacy person filters can only remain on the one explicitly selected work project.
      for(const work of works)if(work.id!==selectedWork&&work.person)delete conditions[fieldKey(work.person)];
      renderBar();renderPopup();
    }
    function position(){
      if(!popup.matches(':popover-open'))return;
      const anchor=host.getBoundingClientRect(),panel=parent.closest('.gtm-inspector-panel')?.getBoundingClientRect();
      const scale=popup.getBoundingClientRect().width/Math.max(1,popup.offsetWidth)||1;
      const bottom=Math.min(innerHeight-12,panel?.bottom-10||innerHeight-12),top=Math.max(12,Math.min(anchor.bottom+8,bottom-180));
      popup.style.maxWidth=`${(innerWidth-24)/scale}px`;popup.style.width=`${Math.min(420,(innerWidth-24)/scale)}px`;
      const width=popup.getBoundingClientRect().width;
      popup.style.left=`${Math.max(12,Math.min(anchor.left,innerWidth-width-12))/scale}px`;popup.style.top=`${top/scale}px`;popup.style.maxHeight=`${Math.max(1,bottom-top)/scale}px`;
    }
    function notice(value){message=value;const n=popup.querySelector('.notice');if(n)n.textContent=value;workNotice.textContent=value;workNotice.hidden=!value;if(value){const r=workHost.getBoundingClientRect();workNotice.style.left=`${Math.min(r.left,innerWidth-330)}px`;workNotice.style.top=`${r.bottom+5}px`;}}
    function renderBar(){
      bar.replaceChildren(button(selected().length?`筛选 · ${selected().length}`:'筛选',async()=>{if(popup.matches(':popover-open')){popup.hidePopover();return;}searchQuery='';popup.showPopover();renderPopup();position();try{await onRefresh();position();}catch(error){notice(error.message);}}));
      const trigger=bar.querySelector('button');trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded',String(popup.matches(':popover-open')));
      renderWorkBar();
    }
    function renderWorkBar(){
      workBar.replaceChildren();const work=works.find(w=>w.id===selectedWork);workHost.hidden=!work;if(!work)return;
      const label=el('span',work.name,'work-name');label.title=work.name;workBar.append(label);
      if(work.person){
        const key=fieldKey(work.person),select=el('select');select.setAttribute('aria-label',`名字筛选 ${work.name}`);
        select.append(new Option('全部人员',''));
        for(const value of [...new Set([...items.flatMap(i=>tokens(i.filterValues?.[key])),...(conditions[key]||[])])].sort((a,b)=>a.localeCompare(b,'zh-CN')))select.append(new Option(value||'未填写',value||'__empty__'));
        select.value=conditions[key]?.[0]===''?'__empty__':conditions[key]?.[0]||'';
        select.onchange=()=>{if(select.value)conditions[key]=[select.value==='__empty__'?'':select.value];else delete conditions[key];changed();};workBar.append(select);
      }
      if(work.status){
        const captured=row,field=work.status,cell=captured?.cells.find(c=>c.columnIndex===field.source.index),original=text(cell?.value),dependency=identity?{index:identity.source.index,header:identity.source.header,baseline:text(identity.cell.value)}:null;
        const select=el('select');select.setAttribute('aria-label',`状态 ${work.name}`);
        const options=cell?.dropdownItems?.length?cell.dropdownItems:(cell?.dropdownOptions||[]).map(value=>({value,label:value}));
        if(cell?.dropdownAllowBlank!==false&&options.length)select.append(new Option('未填写',''));
        for(const item of options)select.append(new Option(item.label||item.value,item.value));
        if(![...select.options].some(o=>o.value===original))select.append(new Option(original||'未填写',original));select.value=original;
        select.disabled=saving||!options.length||cell?.dropdownMultiple||Boolean(cell?.formula);select.title=options.length?'当前题目状态，选择后写入飞书':'未读到实际下拉规则，仅显示已有值';
        select.onchange=async()=>{
          const chosen=select.value,id=globalThis.__cyleFieldMappingV1.key(captured)+':'+captured.rowIndex;if(saving)return;saving=true;renderWorkBar();notice('正在写回状态并核验…');
          try{
            const current=getRow();if(!current||globalThis.__cyleFieldMappingV1.key(current)!==globalThis.__cyleFieldMappingV1.key(captured)||current.rowIndex!==captured.rowIndex)throw new Error('题目已切换，请重新选择状态。');
            await onWrite({row:captured,cell,value:chosen,expectedValue:original,expectedDependencies:dependency?[dependency]:[],dropdownSelection:true});
            if(row&&globalThis.__cyleFieldMappingV1.key(row)+':'+row.rowIndex===id){await onRefresh();notice('状态已写入飞书并通过回读。');}
          }catch(error){notice(error.message);}finally{saving=false;renderWorkBar();}
        };workBar.append(select);
      }
    }
    function renderPopup(){
      const previous=popup.querySelector('.body')?.scrollTop||0;popup.replaceChildren();
      const body=el('div','','body'),search=el('input','','tag-search');search.type='search';search.placeholder='搜索字段或标签';search.setAttribute('aria-label','搜索筛选标签');search.value=searchQuery;body.append(search);
      const query=searchQuery.trim().toLocaleLowerCase();
      function group(name,key,selectedCount,primary){
        const box=el(primary?'section':'details','','condition');box.dataset.field=key;
        const heading=el(primary?'div':'summary',primary?'':name+(selectedCount?` · ${selectedCount}`:''),primary?'condition-head':'');
        if(primary)heading.append(el('strong',name));else{box.open=selectedCount>0||expanded.has(key)||!!query;box.addEventListener('toggle',()=>{if(box.open)expanded.add(key);else expanded.delete(key);});}
        box.append(heading);body.append(box);return box;
      }
      const typeFields=defs.filter(f=>/^(题型|题目类型)$/.test(f.name));
      const renderField=(f,primary)=>{
        const key=fieldKey(f),values=conditions[key]||[],options=[...new Set([...items.flatMap(i=>tokens(i.filterValues?.[key])),...values])].sort((a,b)=>a.localeCompare(b,'zh-CN'));
        const matching=options.filter(v=>!query||f.name.toLocaleLowerCase().includes(query)||v.toLocaleLowerCase().includes(query));if(query&&!matching.length)return;
        const box=group(f.name,key,values.length,primary),list=el('div','','values');
        for(const value of matching){const tag=button(value||'未填写',()=>{const current=conditions[key]||[],next=current.includes(value)?current.filter(v=>v!==value):[...current,value];if(next.length)conditions[key]=next;else delete conditions[key];changed();});tag.className='tag';tag.setAttribute('aria-label',value||'未填写');tag.setAttribute('aria-pressed',String(values.includes(value)));list.append(tag);}box.append(list);
      };
      typeFields.forEach(f=>renderField(f,true));
      if(works.length){const box=group('工作项目','work',selectedWork?1:0,true),list=el('div','','values');for(const work of works.filter(w=>!query||w.name.toLocaleLowerCase().includes(query))){const tag=button(work.name,()=>chooseWork(work.id));tag.className='tag';tag.setAttribute('aria-pressed',String(work.id===selectedWork));list.append(tag);}box.append(list);}
      defs.filter(f=>!typeFields.includes(f)).forEach(f=>renderField(f,false));
      search.oninput=()=>{searchQuery=search.value;renderPopup();const next=popup.querySelector('.tag-search');next.focus();next.setSelectionRange?.(searchQuery.length,searchQuery.length);};
      popup.append(body);body.scrollTop=previous;
      const note=el('p',message,'notice');note.setAttribute('role','status');popup.append(note);
      const foot=el('div','','foot'),result=filter(items);foot.append(el('span',`${result.length} / ${items.length} 题匹配${selected().length&&!result.some(i=>i.rowIndex===row?.rowIndex)?' · 当前题目不在筛选结果中':''}`,'match-count'),button('清空筛选',()=>{conditions={};changed();}));popup.append(foot);position();
    }
    popup.addEventListener('beforetoggle',event=>{bar.querySelector('button')?.setAttribute('aria-expanded',String(event.newState==='open'));});
    const dismiss=event=>{if(popup.matches(':popover-open')&&!event.composedPath().includes(host))popup.hidePopover();if(!event.composedPath().includes(workHost)){workNotice.hidden=true;message='';}};
    document.addEventListener('pointerdown',dismiss,true);
    for(const node of [host,workHost]){node.addEventListener('pointerdown',event=>event.stopPropagation());node.addEventListener('keyup',event=>event.stopPropagation());node.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape')popup.hidePopover();});}
    const resize=()=>position();window.addEventListener('resize',resize);
    const observer=new ResizeObserver(resize);observer.observe(host);renderBar();
    return {setRow,filter,columns:()=>[...new Map(allFields().map(f=>[fieldKey(f),f.source])).values()],signature:()=>JSON.stringify(allFields().map(f=>f.source)),hasFilters:()=>selected().length>0,
      receive(value){items=value||[];renderPopup();renderBar();},close(){if(popup.matches(':popover-open'))popup.hidePopover();},dispose(){document.removeEventListener('pointerdown',dismiss,true);window.removeEventListener('resize',resize);observer.disconnect();host.remove();workHost.remove();}};
  }
  globalThis.__cyleQuestionFiltersV1=Object.freeze({create});
})();
