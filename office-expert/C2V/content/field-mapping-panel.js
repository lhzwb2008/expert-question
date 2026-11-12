(() => {
  'use strict';
  if (globalThis.__cyleFieldMappingPanelV1) return;
  const M = globalThis.__cyleFieldMappingV1;
  const el = (tag, text = '') => { const n = document.createElement(tag); n.textContent = text; return n; };
  const button = (label, action) => { const b = el('button', label); b.type = 'button'; b.addEventListener('click', action); return b; };
  function create({ parent, getRow, onApply, embedded = false }) {
    let row, draft, opened = false, busy = false, request = 0, savedSnapshot = null, initialSnapshot = null, saveResult = null, saveTimer = null, saveControl = null, saving = false;
    const host = el(embedded ? 'div' : 'dialog'); host.className = 'cyle-field-mapping-host' + (embedded ? '' : ' gtm-draft-center');
    host.setAttribute('aria-label','字段映射设置');
    host.style.cssText = embedded ? 'height:100%;overflow:hidden;font-family:inherit' : 'height:min(860px,calc(100dvh - 32px));overflow:hidden;font-family:inherit';
    const surface = el('div'); surface.style.height='100%'; host.append(surface);
    const root = surface.attachShadow({ mode: 'open' }); const style = el('style');
    style.textContent = `
      :host{font:13px/1.5 Inter,"Microsoft YaHei","PingFang SC",system-ui,sans-serif;color:var(--pet-text,#eef2f5);color-scheme:var(--pet-scheme,dark)}*{box-sizing:border-box}[hidden]{display:none!important}
      .panel{height:100%;display:flex;flex-direction:column;min-height:0;background:var(--pet-surface,#1a2531)}
      header,footer,nav{display:flex;gap:8px;align-items:center;flex-wrap:wrap}header h2{font-size:20px;font-weight:650;margin:0 auto 0 0}.grow{flex:1}
      button,input,select{box-sizing:border-box;color:var(--pet-text,#eef2f5);background:var(--pet-raised,#202b36);border:1px solid var(--pet-border,#465564);border-radius:8px;padding:6px 9px;min-height:32px;font:inherit}button{cursor:pointer}button:hover,button.active{background:var(--pet-soft,#304557)}button:disabled{opacity:.45;cursor:default}input,select{width:100%;min-width:0;background:var(--pet-input,#121c26)}button:focus-visible,input:focus-visible{outline:2px solid var(--pet-accent,#f29a49);outline-offset:2px}
      nav{margin:16px 0 10px}p{color:var(--pet-muted,#a5b0ba);font-size:12px;overflow-wrap:anywhere;margin:8px 0}.message{color:var(--pet-accent,#ffd39e);white-space:pre-wrap}.message:empty{display:none}.draft-origin{font-size:11px;color:var(--pet-muted)}.content{flex:1;min-height:0}small{color:var(--pet-muted,#a5b0ba)}strong{font-weight:600}input::placeholder{color:var(--pet-muted,#a5b0ba);opacity:1}h3{font-size:14px;font-weight:650;margin:0 0 12px}
      .mapping-current h3{position:sticky;top:-12px;padding:10px 0;background:var(--pet-canvas,#10171e);z-index:1}.mapping-projects button.active{background:var(--pet-accent,#e99451);color:var(--pet-on-accent,#23180e);border-color:var(--pet-accent,#e99451)}.mapping-header-list button[aria-pressed=true]{background:var(--pet-raised,#202b36)!important;border-color:var(--pet-border,#465564)!important}.mapping-header-list button[aria-current=true]{outline:1px solid var(--pet-accent,#e99451)!important;outline-offset:-1px}
      .mapping-header-list button[data-selection=selected]{background:var(--pet-raised,#253241)!important;border-color:var(--pet-cyan,#7ad1da)!important;border-left-width:4px}
      .mapping-header-list button[data-selection=current]{background:var(--pet-soft,#3b2e25)!important;border-color:var(--pet-accent,#e99451)!important;border-left-width:4px;color:var(--pet-text,#f4ecde)}

      .content{gap:0!important;padding:0!important;grid-template-columns:var(--composer-columns,210px minmax(0,1fr) minmax(0,1fr))!important;border-top:1px solid var(--pet-border,#465564)}
      .mapping-projects,.mapping-current,.mapping-headers{border:0!important;border-radius:0!important;background:transparent!important;padding:var(--composer-pane-padding,18px 16px)!important;min-width:0}
      .mapping-projects,.mapping-current{border-right:1px solid var(--pet-border,#465564)!important}
      .mapping-current{display:flex;flex-direction:column;overflow:hidden!important}
      .content h3{position:static!important;padding:0!important;margin:0 0 16px!important;background:transparent!important;flex-shrink:0;font-size:13px;font-weight:650}
      .project-row{margin:0 0 3px!important;gap:0!important;border-radius:6px}
      .project-row>button:first-child{min-height:36px;border:0!important;background:transparent!important;border-radius:6px;font-size:12px}
      .project-row:has(.active){background:var(--pet-soft,#3b2e25);box-shadow:inset 3px 0 var(--pet-accent,#e99451)}
      .mapping-projects .project-row button.active{color:var(--pet-text,#f4ecde)!important;font-weight:650}
      .project-row>button:last-child:not(:first-child),.selected-header>button:last-child{min-height:26px;width:26px;height:26px;align-self:center;padding:0;border:0;background:transparent;color:var(--pet-muted,#a5b0ba);opacity:.55;flex-shrink:0}
      .project-row:hover>button:last-child,.selected-header:hover>button:last-child,.project-row:focus-within>button:last-child,.selected-header:focus-within>button:last-child{opacity:1}
      .project-add{display:flex;gap:8px;padding-top:16px;margin-top:12px;border-top:1px solid var(--pet-border,#465564)}
      .project-add button{font-size:12px;padding:5px 10px}
      .project-summary{font-size:12px;color:var(--pet-muted,#a5b0ba);margin:0 0 12px;min-height:32px;display:flex;align-items:center}
      .selected-list{flex:1;min-height:0;overflow:auto}
      .selected-header{min-height:38px;margin:0!important;padding:2px 6px!important;border:0!important;border-bottom:1px solid color-mix(in srgb,var(--pet-border,#465564) 40%,transparent)!important;border-radius:0!important;background:transparent!important}
      .selected-header:hover{background:var(--pet-raised,#253241)!important}
      .selected-header>button:first-child{font-size:12px;font-weight:400;padding:6px;min-height:32px}
      .mapping-headers input{font-size:12px;min-height:32px;background:var(--pet-input,#121c26);border-radius:6px}
      .mapping-headers>p{font-size:11px;margin:10px 0 4px}
      .mapping-header-list{margin-top:4px!important;padding:0 2px}
      .mapping-header-list button{font-size:12px;font-weight:400;min-height:38px;border:0!important;border-bottom:1px solid color-mix(in srgb,var(--pet-border,#465564) 40%,transparent)!important;border-radius:0!important;padding:9px 10px!important;margin:0!important;background:transparent!important;position:relative}
      .mapping-header-list button[data-selection=selected]{border:0!important;border-bottom:1px solid color-mix(in srgb,var(--pet-border,#465564) 40%,transparent)!important;border-left:2px solid var(--pet-cyan,#7ad1da)!important;background:transparent!important}
      .mapping-header-list button[data-selection=current]{border:0!important;border-bottom:1px solid color-mix(in srgb,var(--pet-border,#465564) 40%,transparent)!important;border-left:2px solid var(--pet-accent,#e99451)!important;background:var(--pet-soft,#3b2e25)!important;color:var(--pet-text,#f4ecde);font-weight:500}
      .mapping-header-list button:hover{background:var(--pet-raised,#253241)!important}
      .mapping-header-list button[aria-current=true]{outline:1px solid var(--pet-accent,#e99451)!important;outline-offset:-1px;border-radius:4px!important}
      .selected-list,.mapping-header-list,.mapping-projects{scrollbar-width:thin;scrollbar-color:var(--pet-border,#465564) transparent;scroll-padding:8px}


      @media(max-width:800px){.content{grid-template-columns:160px minmax(0,1fr) minmax(0,1fr)!important}.mapping-projects,.mapping-current,.mapping-headers{padding:12px 10px!important}}
      @media(max-width:650px){.content{gap:8px!important;padding:8px 0!important}}

    `;
    const panel = el('div'); panel.className='panel';
    style.textContent += globalThis.__cyleComposerStylesV1;
    const header = el('header'), title = el('h2','字段映射设置'), grow = el('span');grow.className='grow';
    if (!embedded) header.append(title,grow,button('关闭',close)); else header.hidden=true;
    const context = el('p'), message = el('p');context.hidden=true;message.className='message';message.setAttribute('role','status');
    const nav = el('nav'), content = el('div');content.className='content';const footer=el('footer');
    panel.append(header,context,nav,message,content,footer);root.append(style,panel);parent.append(host);
    for(const type of ['keydown','keyup','keypress','pointerdown']) host.addEventListener(type,event=>{event.stopPropagation();if(type==='keydown'&&event.key==='Escape'&&!embedded)close();});
    function close(){clearSaveResult();opened=false;request++;if(embedded)host.hidden=true;else if(host.open)host.close();}
    host.addEventListener('cancel',event=>{event.preventDefault();close();});
    async function open(){
      const next=getRow();if(!next)throw new Error('请先读取数据行。');
      const token=++request;opened=true;if(embedded){parent.append(host);host.hidden=false;}else{(document.fullscreenElement||parent).append(host);if(!host.open)host.showModal();}context.textContent='正在加载映射…';content.replaceChildren();footer.replaceChildren();message.textContent='';clearSaveResult();
      try{const saved=await M.load(next);if(token!==request||!opened)return;row=next;draft=M.clone(saved||M.defaults(row));initialSnapshot=JSON.stringify(draft);savedSnapshot=saved?initialSnapshot:null;render();root.querySelector('input')?.focus();}
      catch(error){if(token===request)message.textContent=error.message;}
    }
    function setRow(next){
      if(!opened||!row)return;
      if(!next||M.key(next)!==M.key(row)){close();return;}
      row=next;
      // Keep form edits when only the selected row changes.
      context.textContent=`${row.sheetName||row.sheetId} · 按当前工作表保存；空选项表示不显示`;
      if(JSON.stringify(draft.headers)!==JSON.stringify(row.headers)){draft=M.reconcile(row,draft).config;message.textContent='表头已更新，失效关联已标出，请核对后保存。';render();}
    }
    let activeSlot = '', activeProject = 'question', searchText = '';
    function projects() {
      const list=[{id:'question-type',name:'题目类型',type:'fixed',single:true,fields:[]},{id:'question',name:'题目题干',type:'fixed',fields:[]},{id:'tags',name:'题目 tag',type:'fixed',fields:[]}];
      const tags=['一级场景','二级场景','题型','参考素材类型（多选）','技术栈','分镜','标准解法提供方式','画幅要求（Prompt口径）','分辨率要求（Prompt口径）','视频时长（秒）'];
      for(const field of draft.fields){
        if(field.id===draft.questionTypeFieldId){list[0].fields.push(field);if(field.id!==draft.identityFieldId)continue;}
        const saved=draft.entities?.find(e=>e.id===field.entityId);
        const parts=field.label.split(' · ');
        let id='question',name='题目题干',type='fixed';
        if(field.id===draft.identityFieldId){id='tags';name='题目 tag';}
        else if(saved){({id,name,type}=saved);}
        else if(tags.includes(field.label)){id='tags';name='题目 tag';}
        else if(parts.length>1){type=field.group==='人员与状态'?'work':'model';name=parts[0];id=type+':'+name;}
        else if(field.group==='评分结果'){type='work';name=field.source?.header||field.label;id='work:'+name;}
        let project=list.find(x=>x.id===id);if(!project){project={id,name,type,fields:[]};list.push(project);}project.fields.push(field);
      }
      return list;
    }
    function setQuestionType(index){
      const previous=draft.fields.find(f=>f.id===draft.questionTypeFieldId);
      if(previous?.mappingPurpose==='question-type')draft.fields=draft.fields.filter(f=>f!==previous);
      else if(previous?.role==='题目类型')previous.role=M.describe(previous.source?.header||previous.label)?.role||previous.label;
      draft.questionTypeFieldId='';
      if(index===null)return;
      let field=draft.fields.find(f=>f.entityId==='tags'&&f.id!==draft.identityFieldId&&M.valid(row,f.source)&&f.source.index===index);
      if(!field){
        field={id:crypto.randomUUID(),entityId:'tags',mappingPurpose:'question-type',manual:true,role:'题目类型',group:M.groups[0],label:row.headers[index]||M.letter(index),source:M.source(row,index)};
        draft.fields.push(field);
      }
      draft.questionTypeFieldId=field.id;
    }
    function newProject(type){
      const list=projects(),prefix=type==='model'?'模型':'工作项';let n=1;while(list.some(p=>p.name===`${prefix} ${n}`))n++;
      const name=`${prefix} ${n}`,id=crypto.randomUUID();draft.entities ||= [];
      draft.entities.push({id,name,type});
      const roles=type==='model'?[['产物','题目与素材'],['rubric','评分标准'],['机评','评分结果'],['人评','评分结果']]:[['评分结果','评分结果'],['人员','人员与状态'],['状态','人员与状态'],['备注','人员与状态']];
      for(const [role,group] of roles)draft.fields.push({id:crypto.randomUUID(),entityId:id,role,label:`${name} · ${role}`,group,source:null});
      activeProject=id;render();
    }
    function render(focusIndex = null){
      const previousScroll = root.querySelector('.mapping-header-list')?.scrollTop || 0;
      context.textContent=`${row.sheetName||row.sheetId} · 左栏选工作项目，右栏点击表头加入；中栏仅显示已选表头；再次点击可取消`;
      nav.replaceChildren();
      nav.hidden=true;
      const autoButton=button('自动关联',async()=>{
        if(busy)return;busy=true;message.textContent='正在读取最新表头…';render();
        try {
          const current=await chrome.runtime.sendMessage({type:'READ_ACTIVE_ROW'});
          if(!current?.ok)throw new Error(current?.error||'请先读取数据行。');
          if(M.key(current)!==M.key(row))throw new Error('已切换工作表，请重新打开组装。');
          const result=M.autoMap(current,draft);row=current;draft=result.config;
          message.textContent=`已扫描全表：保留 ${result.stats.kept} 项，修复 ${result.stats.repaired} 项，新增 ${result.stats.added} 项；${result.unassigned.length} 列待分配，${result.issues.length} 项关联待确认。保存后生效。`;
        }catch(error){message.textContent=error.message;}
        finally{busy=false;if(opened)render();}
      });
      content.replaceChildren();content.style.cssText='display:grid;grid-template-columns:minmax(150px,.56fr) minmax(0,1fr) minmax(0,1fr);gap:14px;overflow:hidden;padding:10px 0';
      const projectList=projects();if(!projectList.some(p=>p.id===activeProject))activeProject='question';
      const project=projectList.find(p=>p.id===activeProject);
      const all=project.fields.map(f=>({id:f.id,label:f.role||f.label,multi:false,fields:[f]}));
      if(!all.some(x=>x.id===activeSlot))activeSlot=all[0]?.id;
      const sidebar=el('div');sidebar.className='mapping-projects';sidebar.style.cssText='overflow:auto;min-height:0;border-right:1px solid var(--pet-border,#465564);padding:8px';
      sidebar.append(el('h3','工作项目'));
      for(const p of projectList){
        const line=el('div');line.className='project-row';line.style.cssText='display:flex;gap:4px;margin-bottom:8px';
        let timer;
        const select=button(p.name,()=>{clearTimeout(timer);timer=setTimeout(()=>{activeProject=p.id;activeSlot='';searchText='';render(p.fields.find(f=>f.source)?.source.index??-1);},220);});
        select.setAttribute('aria-label','选择项目 '+p.name);select.style.cssText='flex:1;min-width:0;text-align:left;overflow-wrap:anywhere';select.classList.toggle('active',p.id===activeProject);line.append(select);
        if(p.type!=='fixed'){
          select.title='双击修改名称';
          select.addEventListener('dblclick',()=>{
            clearTimeout(timer);const input=el('input');input.value=p.name;input.setAttribute('aria-label','编辑项目名称');line.replaceChild(input,select);input.focus();input.select();let done=false;
            const finish=()=>{if(done)return;done=true;const name=input.value.trim();
              if(!name||projectList.some(x=>x.id!==p.id&&x.name===name)){message.textContent='名称不能为空或与其他项目重复。';render();return;}
              draft.entities ||= [];let entity=draft.entities.find(e=>e.id===p.id);if(!entity){entity={id:p.id,type:p.type};draft.entities.push(entity);}entity.name=name;
              for(const f of p.fields){f.entityId=p.id;f.role ||= f.label.split(' · ').slice(1).join(' · ')||f.label;f.label=`${name} · ${f.role}`;}
              activeProject=p.id;render();
            };
            input.addEventListener('blur',finish);input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();finish();}if(e.key==='Escape'){done=true;render();}});
          });
          const remove=button('×',()=>{clearTimeout(timer);draft.fields=draft.fields.filter(f=>!p.fields.includes(f));draft.entities=(draft.entities||[]).filter(e=>e.id!==p.id);if(activeProject===p.id)activeProject='question';render();});remove.setAttribute('aria-label','删除项目 '+p.name);line.append(remove);
        }
        sidebar.append(line);
      }
      const addActions=el('div');addActions.className='project-add';addActions.append(button('+ 模型',()=>newProject('model')),button('+ 工作项',()=>newProject('work')));addActions.children[0].setAttribute('aria-label','新建模型');addActions.children[1].setAttribute('aria-label','新建工作项');sidebar.append(addActions);
      const left=el('div'),right=el('div');left.style.cssText=right.style.cssText='overflow:auto;min-height:0;background:var(--pet-canvas,#10171e);border:1px solid var(--pet-border,#303c48);border-radius:10px;padding:12px';
      left.className='mapping-current';right.className='mapping-headers';
      left.append(el('h3','选中的表头'));right.append(el('h3','所有表头'));
      const projectSummary=el('p',project.name);projectSummary.className='project-summary';left.append(projectSummary);
      const selectedList=el('div');selectedList.className='selected-list';left.append(selectedList);
      const search=el('input');search.placeholder='搜索表头';search.setAttribute('aria-label','搜索表头');search.value=searchText;right.append(search);
      const count=el('p'),headers=el('div');headers.className='mapping-header-list';headers.style.cssText='overflow:auto;min-height:0;flex:1;margin-top:8px';right.style.display='flex';right.style.flexDirection='column';right.style.overflow='hidden';right.append(count,headers);
      const chosen=new Map(project.fields.filter(f=>f.source).map(f=>[f.source.index,f.source]));
      for(const [index,source] of [...chosen].sort((a,b)=>a[0]-b[0])){
        const box=el('div');box.className='selected-header';box.style.cssText='display:flex;align-items:center;gap:6px;padding:4px 8px;margin:0 0 6px;border:1px solid var(--pet-border,#465564);border-radius:8px;background:var(--pet-raised,#202b36)';
        const label=button(`${M.letter(index)} · ${source.header}${project.fields.some(f=>f.id===draft.identityFieldId&&f.source?.index===index)?' · 唯一标识':''}`,()=>{searchText='';search.value='';renderHeaders();locate(index);});label.setAttribute('aria-label',`定位表头 ${M.letter(index)} · ${source.header}`);label.style.cssText='flex:1;overflow-wrap:anywhere;text-align:left;border:0;background:transparent';
        const remove=button('×',()=>{if(project.single)setQuestionType(null);else project.fields.filter(f=>f.source?.index===index).forEach(f=>f.source=null);render();});remove.setAttribute('aria-label',`移除 ${M.letter(index)} · ${source.header}`);box.append(label,remove);selectedList.append(box);
      }
      projectSummary.textContent=project.single?'题目类型 · 单选，用于匹配人评维度':`${project.name} · ${chosen.size} 个字段`;
      if(!chosen.size)selectedList.append(el('p',project.single?'从右侧选择一个题目类型列。':'从右侧选择表头，加入当前项目。'));
      for(const field of project.fields.filter(f=>f.unresolvedSource))selectedList.append(el('p',`待确认：${field.unresolvedSource.header} · ${field.mappingIssue}`));


      function renderHeaders(){
        headers.replaceChildren();if(project.single)headers.setAttribute('role','radiogroup');else headers.removeAttribute('role');const linked=new Set(draft.fields.filter(f=>f.source).map(f=>f.source.index));count.textContent='● 已关联其他项目    ✓ 当前项目已选';
        row.headers.forEach((header,index)=>{
          if(header==='标注结果')return;
          if(!`${M.letter(index)} ${header}`.toLowerCase().includes(searchText.toLowerCase()))return;
          const current=project.fields.some(f=>f.source?.index===index);
          const targets=projectList.filter(p=>p.fields.some(f=>f.source?.index===index));
          const item=button('',()=>{
            if(project.single){if(!current)setQuestionType(index);render();return;}
            if(current)project.fields.filter(f=>f.source?.index===index).forEach(f=>f.source=null);
            else {
              draft.entities ||= [];
              if(!draft.entities.some(e=>e.id===project.id))draft.entities.push({id:project.id,name:project.name,type:project.type});
              const detected=M.describe(header),role=detected?.role||header||M.letter(index);
              draft.fields.push({id:crypto.randomUUID(),entityId:project.id,role,manual:true,group:project.type==='fixed'?M.groups[0]:detected?.group||(project.type==='work'?M.groups[1]:M.groups[0]),label:project.type==='fixed'?header:`${project.name} · ${role}`,source:M.source(row,index)});
            }
            render();
          });
          item.style.cssText='display:block;width:100%;text-align:left;margin:0 0 6px;padding:9px 10px;border-radius:6px;background:'+(current?'var(--pet-soft,#304557)':'var(--pet-raised,#202b36)')+';border-color:'+(current?'var(--pet-accent,#6191fa)':'var(--pet-border,#465564)');
          item.dataset.columnIndex=String(index);item.dataset.selection=current?'current':targets.length?'selected':'none';
          item.setAttribute('aria-label',`关联源列 ${M.letter(index)} · ${header}`);
          if(project.single){item.setAttribute('role','radio');item.setAttribute('aria-checked',String(current));}else item.setAttribute('aria-pressed',String(current));item.title=targets.length?'已关联：'+targets.map(x=>x.name).join('、'):'点击加入当前项目';item.append(el('span',`${project.single?(current?'●  ':'○  '):(current?'✓  ':'')}${M.letter(index)} · ${header||'未命名列'}`));headers.append(item);
        });
      }
      function locate(index){
        const target=headers.querySelector(`[data-column-index="${index}"]`);
        headers.querySelectorAll('button').forEach(b=>{b.style.outline='';b.removeAttribute('aria-current');});
        if(!target){headers.scrollTop=0;return;}
        target.style.outline='2px solid var(--pet-accent,#e99451)';target.setAttribute('aria-current','true');
        const bounds=headers.getBoundingClientRect(),rect=target.getBoundingClientRect();
        headers.scrollTop += rect.top-bounds.top-12;
      }
      search.addEventListener('input',()=>{searchText=search.value;renderHeaders();});renderHeaders();content.append(sidebar,left,right);
      headers.scrollTop=previousScroll;
      if(focusIndex!==null)requestAnimationFrame(()=>{if(right.isConnected)locate(focusIndex);});
      footer.replaceChildren();const spacer=el('span');spacer.className='grow';
      const snapshot=JSON.stringify(draft);
      if(saveResult&&saveResult.snapshot!==snapshot)clearSaveResult();
      const origin=el('span',savedSnapshot===null?(snapshot===initialSnapshot?'自动识别 · 待保存':'有未保存修改'):snapshot===savedSnapshot?'':'有未保存修改');origin.className='draft-origin';
      footer.append(origin,spacer);
      saveControl=button('',save);saveControl.className='primary mapping-save';saveControl.setAttribute('aria-live','polite');
      paintSaveControl();footer.append(autoButton,saveControl);
      root.querySelectorAll('button,input,select').forEach(control=>control.disabled=busy);
    }
    function paintSaveControl(){
      if(!saveControl)return;
      saveControl.textContent=saving?'保存中…':saveResult?.label||(embedded?'保存映射':'保存并显示');
      saveControl.title=saveResult?.reason||'';
      saveControl.setAttribute('aria-busy',String(saving));
    }
    function clearSaveResult(){clearTimeout(saveTimer);saveTimer=null;saveResult=null;paintSaveControl();}
    function showSaveResult(label,reason=''){
      clearTimeout(saveTimer);saveResult={label,reason,snapshot:JSON.stringify(draft)};
      saveTimer=null;
      if(label==='已保存')saveTimer=setTimeout(()=>{saveResult=null;saveTimer=null;paintSaveControl();},3000);
    }
    async function save(){
      if(busy)return;
      busy=true;saving=true;message.textContent='';clearSaveResult();render();
      try{
        const current=await chrome.runtime.sendMessage({type:'READ_ACTIVE_ROW'});
        if(!current?.ok)throw new Error(current?.error||'请先刷新表格。');
        if(M.key(current)!==M.key(row))throw new Error('已切换工作表，请关闭后重新打开映射设置。');
        const checked=M.reconcile(current,draft);
        const config=await M.save(current,checked.config);row=current;draft=M.clone(config);
        savedSnapshot=JSON.stringify(draft);
        try {
          await onApply(config,current);
          showSaveResult('已保存');
          if(!embedded)close();
        }catch(error){showSaveResult('已保存，刷新失败',error.message);}
      }catch(error){showSaveResult('保存失败',error.message);}
      finally{busy=false;saving=false;if(opened)render();}
    }
    return Object.freeze({open,close,setRow,get isOpen(){return opened;},dispose(){close();host.remove();}});
  }
  globalThis.__cyleFieldMappingPanelV1=Object.freeze({create});
})();
