(() => {
  'use strict';
  const T=globalThis.__cyleEvaluationTimelineV1;
  const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
  const text=value=>typeof value==='string'?value:JSON.stringify(value??'',null,2);
  const value=cell=>text(cell?.rawValue??cell?.value??'');
  const list=x=>Array.isArray(x)?x:[];
  function lazyDetails(label,build){const node=el('details');node.append(el('summary',label));let built=false;node.addEventListener('toggle',()=>{if(node.open&&!built){built=true;node.append(...build());}});return node;}
  const statuses={met:'满足',wrong:'错误',missing:'缺失',partial:'部分满足',unverifiable:'待核验'};
  const dims={unclassified:'未分类',correctness:'正确性',completeness:'完整性',explanation:'讲解',presentation:'呈现'};
  const dimLabel=c=>c.dimensionName||(Object.prototype.hasOwnProperty.call(dims,c.dimension)?dims[c.dimension]:c.dimension);
  const impacts={none:'无缺陷',minor:'轻微',moderate:'局部',major:'主要',critical:'致命',unknown:'未知'};
  const importance={core:'核心',important:'重要',detail:'细节'};
  class MachineEvaluation {
    constructor(context){
      this.root=context.root;this.root.style.height='100%';this.revision=0;this.selectedKey=null;this.currentContext='';this.cleanups=[];
      this.listener=()=>{if(this.active===false)return;const key=this.contextKey();if(key===this.currentContext&&this.data){this.bindVideo();this.syncClock();}else this.update();};
      document.addEventListener('cyle:model-video-selected',this.listener);
    }
    getModelSelection(){return globalThis.__cyleSelectedModelVideoV1;}
    contextKey(){const s=this.getModelSelection();return s?JSON.stringify([s.tableKey,s.rowIndex,s.columnIndex]):'';}
    setRow(row){this.row=row;this.needsRefresh=true;if(this.active!==false)return this.update();}
    setActive(active){this.active=active;if(active){if(this.needsRefresh)return this.update();else{this.listener();this.animateCursor();}}else cancelAnimationFrame(this.cursorFrame);}
    detach(){cancelAnimationFrame(this.cursorFrame);this.cleanups.splice(0).forEach(fn=>fn());this.observer?.disconnect();this.video=null;}
    dispose(){this.revision++;this.detach();document.removeEventListener('cyle:model-video-selected',this.listener);}
    async update(){
      this.needsRefresh=false;this.detach();this.data=null;this.details=null;this.rawPanel=null;const revision=++this.revision,row=this.row,key=this.contextKey();
      if(key!==this.currentContext){this.selectedKey=null;this.view='all';this.zoom=1;}this.currentContext=key;
      const style=el('style');style.textContent=`
        :host{display:block;height:100%;min-height:0;color:var(--pet-text,#edf1f4);font:13px/1.6 Inter,"PingFang SC",sans-serif}
        *{box-sizing:border-box}[hidden]{display:none!important}
        .page{height:100%;min-height:0;padding:0;display:flex;flex-direction:column;overflow:hidden}
        button{font:inherit;color:inherit;background:var(--pet-raised,#253241);border:1px solid var(--pet-border,#465564);border-radius:5px;padding:5px 8px;cursor:pointer}
        button:focus-visible,.scroll:focus-visible{outline:2px solid var(--pet-accent,#e99451);outline-offset:1px}
        button:disabled{opacity:.5;cursor:default}
        .timeline{flex-shrink:0;padding:0;border:0}
        .scroll{overflow:auto;max-height:104px;background:var(--pet-canvas,#111923);border:1px solid var(--pet-border,#465564);border-radius:0;border-left:0;border-right:0;scrollbar-width:thin}
        .track{position:relative;min-width:100%;height:88px}
        .tick{position:absolute;top:6px;font-size:12px;color:var(--pet-muted,#a5b0ba);transform:translateX(-50%)}
        .tick:first-child{transform:none}.tick:last-of-type{transform:translateX(-100%)}
        .marker{position:absolute;z-index:3;height:20px;width:18px;min-width:18px;padding:0;border:0;border-radius:3px;background:transparent;line-height:20px;font-size:11px;font-weight:600}
        .marker.selected{outline:0;background:transparent;text-decoration:underline;text-underline-offset:3px}.marker:focus:not(:focus-visible){outline:0}
        .marker.near{text-decoration:underline}
        .marker-time-tip{position:absolute;top:7px;z-index:5;pointer-events:none;white-space:nowrap;font-size:11px;line-height:18px;padding:1px 6px;border-radius:5px;border:1px solid var(--pet-border);background:var(--pet-raised);color:var(--pet-text);box-shadow:0 2px 6px #0002}
        .cursor{position:absolute;top:23px;bottom:28px;width:14px;transform:translateX(-50%);cursor:ew-resize;z-index:2;will-change:left}.cursor::before{content:"";position:absolute;left:calc(50% - 1px);top:6px;bottom:0;width:2px;background:#f5ad52}.cursor::after{content:"";position:absolute;top:0;left:1px;border-left:6px solid transparent;border-right:6px solid transparent;border-top:9px solid #f5ad52}

        .cursor-label{display:none;position:absolute;bottom:100%;left:50%;transform:translateX(-50%);background:var(--pet-raised);color:var(--pet-text);padding:2px 5px;white-space:nowrap;font-size:11px;pointer-events:none}.cursor:hover .cursor-label,.track.is-seeking .cursor-label{display:block}.time-range-band{position:absolute;top:32px;height:28px;background:color-mix(in srgb,var(--pet-accent) 18%,transparent);pointer-events:none}.untimed-branch{position:absolute;left:10px;top:38px;height:15px;padding:0 5px;font-size:10px;line-height:13px;border-style:dashed;z-index:3}
        .untimed-branch[aria-pressed=true]{outline:1px solid var(--pet-accent,#e99451)}
        .evaluation-tabs{display:flex;flex-shrink:0;align-items:center;gap:6px;margin:0;padding:5px 10px;overflow-x:auto;border-bottom:1px solid var(--pet-border,#465564)}
        .evaluation-tabs button{flex-shrink:0;white-space:nowrap;font-size:12px}
        .evaluation-tabs button[aria-pressed=true]{background:var(--pet-soft,#3b2e25);font-weight:650}
        .score-filters{display:flex;flex-shrink:0;align-items:center;gap:6px;margin-left:8px;padding-left:12px;border-left:1px solid var(--pet-border,#465564)}
        .score-filters button{border-left:3px solid var(--score-color)}
        .result-list{flex:1;min-height:0;overflow:auto;scroll-behavior:smooth;scrollbar-width:thin;padding:0 12px 12px}
        .dimension-heading{font-size:13px;padding:8px 0;border-bottom:1px solid var(--pet-border,#465564)}
        h3{font-size:15px;margin:16px 0 8px}h4{font-size:12px;color:var(--pet-muted,#a5b0ba);margin:0 0 8px}
        p{margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere}
        .notice,.muted{color:var(--pet-muted,#a5b0ba)}.notice{font-size:12px;margin:10px 0}.timeline>.notice{font-size:11px;margin:4px 0}.warning{color:var(--pet-accent,#e99451)}
        .empty{padding:28px 0;color:var(--pet-muted,#a5b0ba)}
        article{margin-top:12px;border:1px solid var(--pet-border,#465564);border-radius:8px;overflow:hidden}
        article>header{padding:10px 14px;background:var(--pet-raised,#253241)}.node-target{outline:0;box-shadow:inset 2px 0 color-mix(in srgb,var(--pet-accent,#e99451) 65%,transparent);background:color-mix(in srgb,var(--pet-accent,#e99451) 4%,var(--pet-surface,#19252f))}.node-target>header{background:color-mix(in srgb,var(--pet-accent,#e99451) 5%,var(--pet-raised,#253241))}article>header,.evidence{cursor:pointer}
        .two{display:grid;grid-template-columns:1fr 1fr}.two>div{padding:14px;min-width:0}.two>div+div{border-left:1px solid var(--pet-border,#465564)}
        .evidence{padding:10px 14px;border-top:1px solid var(--pet-border,#465564)}
        .badge{display:inline-block;border-radius:4px;background:var(--pet-soft,#3b2e25);padding:2px 6px;margin:0 6px 4px 0;font-size:11px}.score-badge{float:right}
        details{padding:10px 14px}summary{cursor:pointer;font-size:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:350px;overflow:auto;font:11px/1.7 ui-monospace,monospace}
        @media(max-width:650px){.two{grid-template-columns:1fr}.two>div+div{border-left:0;border-top:1px solid var(--pet-border,#465564)}}
      `;
      this.body=el('section','','page');this.root.replaceChildren(style,this.body);
      const selected=this.getModelSelection();
      if(!row||!selected||selected.tableKey!==row.tableKey||selected.rowIndex!==row.rowIndex){this.body.append(el('p',this.selectionHint||'点击左侧“模型回答”中的视频框，查看对应模型的机器评估。','empty'));return;}
      try{
        const M=globalThis.__cyleFieldMappingV1,config=await M.load(row);if(revision!==this.revision)return;
        const mapped=M.read(row,config),owner=f=>{const e=config.entities?.find(e=>e.id===f.entityId);return e?{id:e.id,name:e.name,type:e.type}:{id:f.label.split(' · ')[0],name:f.label.split(' · ')[0],type:f.group==='人员与状态'?'work':'model'};};
        const models=[...new Map(config.fields.filter(f=>f.source?.index===selected.columnIndex).map(owner).filter(x=>x.type==='model').map(x=>[x.id,x])).values()];
        if(models.length!==1)throw new Error('此视频未绑定唯一模型，请在组装中核对。');
        const model=models[0],fields=mapped.filter(item=>owner(config.fields.find(f=>f.id===item.id)).id===model.id);
        if(this.renderHumanPage){await this.renderHumanPage(fields,config,model);return;}
        const typed=fields.map(item=>{let json=null;try{json=JSON.parse(value(item.cell));}catch{}return {...item,json};});
        const results=typed.filter(item=>item.json?.schema==='tier-result/1'),rubrics=typed.filter(item=>item.json?.schema==='deduction-rubric/1');
        const raw=()=>{const d=lazyDetails('原始数据',()=>typed.filter(item=>item.json||/机评|rubric/i.test(item.label)).flatMap(item=>[el('h4',`${M.letter(item.source.index)} · ${item.source.header}`),el('pre',value(item.cell))]));this.rawPanel=d;(this.details||this.body).append(d);};
        if(results.length!==1||rubrics.length>1){this.body.append(el('p',results.length>1||rubrics.length>1?'映射中有多个机评或 rubric，暂不自动合并，请核对来源。':'该模型暂无有效的 tier-result/1 机评结果。','empty'));raw();return;}
        const result=results[0].json,rubric=rubrics[0]?.json||null,id=mapped.find(f=>f.id===config.identityFieldId)?.value;
        if([result,rubric].some(x=>x?.question_id!=null&&id!=null&&String(x.question_id)!==String(id))){this.body.append(el('p','JSON 题号与当前题目不一致，已停止时间关联，请核对来源。','warning'));raw();return;}
        try{this.data=T.build(rubric,result);}catch(e){this.body.append(el('p',e.message,'warning'));raw();return;}
        this.metadata=new WeakMap();
        this.allItems=[];const itemKeys=new Set();
        for(const node of this.data.nodes)for(const item of node.items){const key=JSON.stringify([item.id,item.evidence,item.defect?.id]);if(itemKeys.has(key))continue;itemKeys.add(key);this.allItems.push({...item,location:node});}
        this.untimedItems=this.data.unlinkedIds.map(id=>({id,rubric:this.data.rules.get(id)||null,result:this.data.judgments.get(id)||null,evidence:null,checks:[],defect:null}));
        this.allItems.push(...this.untimedItems);
        this.categories=new Map();for(const item of this.allItems){const c=this.classify(item);if(!this.categories.has(c.dimension))this.categories.set(c.dimension,{name:dimLabel(c),ids:new Set()});this.categories.get(c.dimension).ids.add(item.id);}
        if(this.view!=='all'&&!this.categories.has(this.view))this.view='all';
        this.renderTimeline();this.tabBar=el('nav','','evaluation-tabs');this.tabBar.setAttribute('aria-label','评估子栏目');this.body.append(this.tabBar);this.renderTabs();
        if(!rubric)this.body.append(el('p','当前模型没有有效 rubric，先显示机评判断与证据。','notice'));
        this.details=el('div','','result-list');this.body.append(this.details);

        raw();this.bindVideo();this.layout();this.renderDetails();
      }catch(error){if(revision===this.revision)this.body.append(el('p',error.message,'warning'));}
    }
    bindVideo(){
      const s=this.getModelSelection();if(!s||this.contextKey()!==this.currentContext)return;
      const card=document.querySelector(`.cyle-public-card[data-card-key="column:${s.columnIndex}"]`);
      const video=card?.querySelector('video');if(video===this.video)return;
      this.cleanups.splice(0).forEach(fn=>fn());this.video=video;
      if(video)for(const event of ['timeupdate','seeking','seeked','loadedmetadata','durationchange','play','pause','ended']){const listener=()=>{if(event==='play')this.animateCursor();if(event==='pause'||event==='ended')cancelAnimationFrame(this.cursorFrame);if(event==='loadedmetadata'||event==='durationchange')this.layout();this.syncClock();};video.addEventListener(event,listener);this.cleanups.push(()=>video.removeEventListener(event,listener));}
      this.syncClock();
    }
    classify(item){if(!this.metadata.has(item))this.metadata.set(item,T.classification(item));return this.metadata.get(item);}
    timeX(time){return 10+Math.min(1,Math.max(0,time/(this.extent||1)))*Math.max(1,(this.plotWidth||1)-20);}
    paintCursor(){if(this.cursor){this.cursor.dataset.time=`${(Number(this.video?.currentTime)||0).toFixed(1)}s`;if(this.cursorLabel)this.cursorLabel.textContent=this.cursor.dataset.time;}if(this.cursor)this.cursor.style.left=`${this.timeX(Number(this.video?.currentTime)||0)}px`;}
    animateCursor(){
      cancelAnimationFrame(this.cursorFrame);
      const frame=()=>{if(this.active===false||!this.video||this.video.paused)return;this.paintCursor();this.cursorFrame=requestAnimationFrame(frame);};frame();
    }
    matches(item){return (this.view==='all'||this.classify(item).dimension===this.view)&&(!this.scoreFilter||String(T.itemScore(item)??'unknown')===this.scoreFilter);}
    renderTabs(){
      this.tabBar.replaceChildren();
      const add=(id,label)=>{const button=el('button',label);button.type='button';button.setAttribute('aria-pressed',String(this.view===id));button.dataset.view=id;
        button.addEventListener('click',()=>{this.view=id;this.selectedKey=null;this.renderScores();this.renderTabs();this.layout();this.renderDetails();});this.tabBar.append(button);};
      const order=['presentation','explanation','completeness','correctness'];
      const categories=[...this.categories].sort((a,b)=>{const rank=id=>order.includes(id)?order.indexOf(id):order.length;return rank(a[0])-rank(b[0]);});
      add('all','全部');for(const [id,category]of categories){const count=category.ids.size;add(id,`${category.name}（${count}）`);}
      this.tabBar.append(this.scoreBar);
    }
    renderScores(){
      const scoped=this.allItems.filter(i=>this.view==='all'||this.classify(i).dimension===this.view);
      const groups=T.scoreGroups(scoped);
      if(this.scoreFilter&&!groups.some(g=>g.key===this.scoreFilter))this.scoreFilter='';
      this.scoreBar.replaceChildren();
      const choices=[...groups].sort((a,b)=>(b.key==='unknown'?-1:Number(b.key))-(a.key==='unknown'?-1:Number(a.key)));
      for(const {key,count}of choices){
        const label=key==='unknown'?'未定档':`${key} 分`;
        const b=el('button',label);b.title=`${count} 个评分项；再次点击取消筛选`;b.type='button';b.dataset.score=key;b.setAttribute('aria-pressed',String((this.scoreFilter||'')===key));
        if(key)b.style.setProperty('--score-color',T.scoreColor(key==='unknown'?null:Number(key)));
        b.addEventListener('click',()=>{this.scoreFilter=this.scoreFilter===key?'':key;this.selectedKey=null;this.renderScores();this.renderTabs();this.layout();this.renderDetails();});this.scoreBar.append(b);
      }
    }
    cycleNodeItem(node, items) {
      if (!items.length) return null;
      const key = `${this.currentContext}/${node?.key || 'untimed'}/${items.map(i=>i.id || i.evidence?.id).join('|')}`;
      this.nodeCycleIndex = this.nodeCycleKey === key ? (this.nodeCycleIndex + 1) % items.length : 0;
      this.nodeCycleKey = key;
      return items[this.nodeCycleIndex];
    }
    focusNode(node,untimed=false){
      this.selectedKey=untimed?'untimed':node.key;this.markSelection();this.syncClock();
      const ids=new Set((untimed?this.untimedItems:node.items).filter(i=>this.matches(i)).map(i=>i.id));
      const candidates=[...this.details.querySelectorAll('article')].filter(a=>ids.has(a.dataset.criterionId));
      const chosen=this.cycleNodeItem(node,candidates.map(a=>({id:a.dataset.criterionId,target:a})));const target=chosen?.target;
      this.selectedCriterionId=chosen?.id || null;this.markSelection();
      if(target){const r=target.getBoundingClientRect(),panel=this.details.getBoundingClientRect();this.details.scrollTop+=r.top-panel.top-8;}
      if(!untimed)this.seek(node.start);
    }
    focusResult(id, time = null) {
      const nodes=(this.displayNodes || []).filter(n=>n.items.some(i=>i.id===id));
      const node=time !== null ? nodes.find(n=>n.start===time) : this.cycleNodeItem({key:`result:${id}`}, nodes.map(n=>({...n,id:n.key})));
      this.selectedCriterionId=id;
      this.selectedKey=node?.key || 'untimed';
      this.markSelection();this.syncClock();
      if (!node) return;
      const x=this.timeX(node.start);
      if(x<this.scroll.scrollLeft+16 || x>this.scroll.scrollLeft+this.scroll.clientWidth-16) this.scroll.scrollLeft=Math.max(0,x-this.scroll.clientWidth/2);
      this.seek(node.start);
    }
    resultClick(event, id, time = null) {
      if(event.target.closest('button,summary,a,input,textarea,select,pre') || !window.getSelection()?.isCollapsed)return;
      event.stopPropagation();this.focusResult(id,time);
    }
    markSelection(){
      const selected=this.selectedKey==='untimed'?this.untimedItems:(this.displayNodes||[]).find(n=>n.key===this.selectedKey)?.items||[];
      const ids=new Set(this.selectedKey && this.selectedCriterionId ? [this.selectedCriterionId] : selected.map(i=>i.id));
      this.details?.querySelectorAll('article').forEach(node=>node.classList.toggle('node-target',ids.has(node.dataset.criterionId)));
      if(this.selectionNotice)this.selectionNotice.hidden=this.selectedKey!=='untimed';
    }
    changeZoom(next,anchor=this.scroll.clientWidth/2){
      const ratio=(this.scroll.scrollLeft+anchor)/Math.max(1,this.track.offsetWidth);
      this.zoom=Math.min(16,Math.max(1,next));this.layout();this.scroll.scrollLeft=ratio*this.track.offsetWidth-anchor;
      this.scroll.title=`缩放 ${Number(this.zoom.toFixed(2))}× · Cmd/Ctrl +/- 或滚轮缩放，Cmd/Ctrl 0 复位`;
    }
    renderTimeline(){
      const timeline=el('div','','timeline');
      this.scoreBar=el('div','','score-filters');this.renderScores();
      this.scroll=el('div','','scroll');this.scroll.tabIndex=0;this.scroll.setAttribute('aria-label','时间轴，Cmd或Ctrl加减缩放，双指滑动平移');
      this.track=el('div','','track');this.scroll.append(this.track);this.timelineNote=el('p','','notice');this.timelineNote.hidden=true;timeline.append(this.scroll,this.timelineNote);this.body.append(timeline);
      this.scroll.addEventListener('wheel',event=>{if(event.ctrlKey||event.metaKey){event.preventDefault();event.stopPropagation();this.changeZoom((this.zoom||1)*Math.exp(-event.deltaY*.008),(event.clientX-this.scroll.getBoundingClientRect().left)*this.scroll.clientWidth/this.scroll.getBoundingClientRect().width);}else if(!event.deltaX&&event.deltaY){event.preventDefault();this.scroll.scrollLeft+=event.deltaY;}},{passive:false});
      this.body.addEventListener('keydown',event=>{if(!(event.ctrlKey||event.metaKey)||event.target.closest('input,textarea'))return;if(!['+','=','-','_','0'].includes(event.key))return;event.preventDefault();event.stopPropagation();this.changeZoom(event.key==='0'?1:(this.zoom||1)*(['-','_'].includes(event.key)?1/1.25:1.25));});
      const seekPointer=event=>{
        const rect=this.track.getBoundingClientRect();const logical=(event.clientX-rect.left)*(this.plotWidth||1)/rect.width;
        this.seek(Math.max(0,Math.min(1,(logical-10)/Math.max(1,this.plotWidth-20)))*(this.extent||1));
      };
      this.track.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest('button,[data-evidence-mark]'))return;event.preventDefault();this.scroll.focus({preventScroll:true});this.track.classList.add('is-seeking');this.dragPointer=event.pointerId;this.track.setPointerCapture(event.pointerId);seekPointer(event);});
      this.track.addEventListener('pointermove',event=>{if(this.dragPointer===event.pointerId)seekPointer(event);});
      const endDrag=event=>{if(this.dragPointer===event.pointerId){this.dragPointer=null;this.track.classList.remove('is-seeking');if(this.track.hasPointerCapture(event.pointerId))this.track.releasePointerCapture(event.pointerId);}};
      this.track.addEventListener('pointerup',endDrag);this.track.addEventListener('pointercancel',endDrag);
      this.observer=new ResizeObserver(()=>this.layout());this.observer.observe(this.scroll);
    }
    layout(){
      if(!this.data||!this.track)return;
      const duration=Number.isFinite(this.video?.duration)&&this.video.duration>0?this.video.duration:null;
      const extent=duration||Math.max(1,...this.data.nodes.map(n=>n.end));this.extent=extent;
      const filtered=this.data.nodes.map(n=>({...n,items:n.items.filter(i=>this.matches(i))})).filter(n=>n.items.length);
      const eligible=filtered.filter(n=>!duration||n.end<=duration+.05),invalid=filtered.length-eligible.length;
      const grouped=new Map();
      for(const n of eligible){
        let group=grouped.get(n.start);
        if(!group){group={...n,items:[],sources:[],segments:[]};grouped.set(n.start,group);}
        group.end=Math.max(group.end,n.end);group.items.push(...n.items);group.sources=[...new Set([...group.sources,...(n.sources||[])])];
        if(n.end>n.start)group.segments.push({start:n.start,end:n.end});
      }
      const visible=[...grouped.values()];this.displayNodes=visible;
      if(this.selectedKey!=='untimed'&&!visible.some(n=>n.key===this.selectedKey))this.selectedKey=null;
      const totalTimes=new Set(this.data.nodes.map(n=>n.start)).size;
      const width=Math.max(this.minimumTimelineWidth??350,this.scroll.clientWidth,totalTimes*24+20)*(this.zoom||1);this.plotWidth=width;
      this.track.style.width=`${width}px`;this.track.style.height='88px';this.track.replaceChildren();
      const desired=extent/Math.max(1,width/120);
      const step=[.1,.2,.5,1,2,5,10,15,20,30,60,120,300,600,1800].find(n=>n>=desired)||Math.ceil(desired/60)*60;
      const ticks=[];
      for(let i=0;i<=Math.floor(extent/step);i++){
        const time=i*step; ticks.push(time);
        const tick=el('span',`${Number(time.toFixed(2))}s`,'tick');Object.assign(tick.style,{left:`${this.timeX(time)}px`,transform:i===0?'none':'translateX(-50%)'});this.track.append(tick);
      }
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width',String(width));svg.setAttribute('height','88');svg.style.cssText='position:absolute;inset:0;overflow:visible';this.track.append(svg);
      const line=(x1,y1,x2,y2,color,w=1)=>{const n=document.createElementNS(svg.namespaceURI,'line');for(const [k,v]of Object.entries({x1,y1,x2,y2,stroke:color,'stroke-width':w}))n.setAttribute(k,String(v));svg.append(n);return n;};
      for(const y of [32,60])line(0,y,width,y,'var(--pet-border,#465564)');
      for(const time of ticks){const x=this.timeX(time);line(x,26,x,32,'var(--pet-muted,#a5b0ba)');}
      const untimed=this.untimedItems.filter(i=>this.matches(i));
      if(untimed.length){
        const branch=el('button',`00:00 · 未定位 ${untimed.length}`,'untimed-branch');branch.type='button';branch.title='无时间关联项的独立入口，不代表零秒发生的证据';branch.dataset.nodeKey='untimed';
        branch.addEventListener('click',()=>this.focusNode(null,true));this.track.append(branch);
      }
      this.buttons=[];
      const timeTip=el('div','','marker-time-tip');timeTip.hidden=true;timeTip.setAttribute('aria-hidden','true');this.track.append(timeTip);
      visible.forEach((node,index)=>{
        const x=this.timeX(node.start);
        const dimensionIds=[...new Set(node.items.map(item=>this.classify(item).dimension))].sort();
        const scores=node.items.map(T.itemScore).filter(s=>s!==null),score=scores.length?Math.min(...scores):null;
        const color=T.scoreColor(score);
        const isRange=node.end>node.start,count=new Set(node.items.map(i=>i.id)).size;
        const stem=line(x,32,x,60,color,2);stem.dataset.evidenceMark='true';
        const marker=el('button',String(count),'marker count '+(isRange?'range':'point'));marker.type='button';marker.dataset.nodeKey=node.key;
        marker.setAttribute('aria-label',`${T.format(node.start)}${isRange?'–'+T.format(node.end):''}，${count} 条评估`);marker.dataset.score=String(score??'unknown');marker.title=dimensionIds.map(id=>this.categories.get(id)?.name||id).join('、')+' · '+marker.getAttribute('aria-label')+(node.sources?.includes('observation')?' · 区间来自证据描述':'');
        Object.assign(marker.style,{left:`${x-9}px`,top:'64px',width:'18px',color});
        marker.setAttribute('aria-description',marker.title);marker.removeAttribute('title');
        const showTime=()=>{
          timeTip.textContent=`${node.start.toFixed(1)}s${isRange?' – '+node.end.toFixed(1)+'s':''}`;
          timeTip.hidden=false;
          const left=this.scroll.scrollLeft+3,right=Math.min(this.plotWidth,this.scroll.scrollLeft+this.scroll.clientWidth)-3;
          timeTip.style.left=`${Math.max(left,Math.min(x-timeTip.offsetWidth/2,right-timeTip.offsetWidth))}px`;
        };
        const hideTime=()=>{timeTip.hidden=true;};
        for(const target of [marker,stem]){target.addEventListener('pointerenter',showTime);target.addEventListener('pointerleave',hideTime);}
        marker.addEventListener('focus',()=>{if(marker.matches(':focus-visible'))showTime();});marker.addEventListener('blur',hideTime);

        const choose=()=>this.focusNode(node);marker.addEventListener('click',choose);stem.style.cursor='pointer';stem.style.pointerEvents='stroke';stem.addEventListener('click',choose);
        this.track.append(marker);this.buttons.push({node,marker,stem});
      });
      this.cursor=el('div','','cursor');this.cursorLabel=el('span','','cursor-label');this.cursor.append(this.cursorLabel);this.track.append(this.cursor);
      this.timelineNote.hidden=!invalid;this.timelineNote.textContent=invalid?`${invalid} 个证据时间超出视频时长，未在轴上绘制。`:'';this.syncClock();
    }
    syncClock(){
      if(!this.track||this.active===false)return;this.track?.querySelector('.untimed-branch')?.setAttribute('aria-pressed',String(this.selectedKey==='untimed'));const time=Number(this.video?.currentTime)||0;
      this.scroll.setAttribute('aria-description',this.video?`当前播放位置 ${T.format(time)}`:'等待当前视频');
      this.paintCursor();
      for(const {node,marker,stem} of this.buttons||[]){stem?.setAttribute('stroke-width',node.key===this.selectedKey?'3':'2');marker.classList.toggle('selected',node.key===this.selectedKey);marker.classList.toggle('near',node.end>node.start?time>=node.start&&time<=node.end:Math.abs(time-node.start)<.4);}
    }
    seek(time){
      if(this.contextKey()!==this.currentContext)return;
      const video=this.video;if(!video||video.readyState<1){this.timelineNote.hidden=false;this.timelineNote.textContent='当前视频尚未加载，已展开评分详情；加载后可再次点击节点定位。';return;}
      if(time>video.duration){this.timelineNote.hidden=false;this.timelineNote.textContent='证据时间超出当前视频时长，请核对视频版本。';return;}
      video.pause();video.currentTime=time;this.syncClock();
    }
    renderDetails(){
      if(!this.details)return;this.details.replaceChildren();
      const node={items:this.allItems.filter(i=>this.matches(i))};
      if(!node.items.length){this.details.append(el('p','当前维度与分数组合没有评估结果。','empty'));if(this.rawPanel)this.details.append(this.rawPanel);return;}
      this.selectionNotice=el('p','未定位：00:00 仅作为入口，不代表这些评估发生在零秒。','notice');this.selectionNotice.hidden=this.selectedKey!=='untimed';this.details.append(this.selectionNotice);
      const selectedIds=new Set((this.selectedKey==='untimed'?this.untimedItems:(this.displayNodes||[]).find(n=>n.key===this.selectedKey)?.items||[]).map(i=>i.id));
      const groups=new Map();for(const item of node.items){if(!groups.has(item.id))groups.set(item.id,[]);groups.get(item.id).push(item);}
      let previousCategory='';
      const ordered=[...groups].sort((a,b)=>{const x=this.classify(a[1][0]),y=this.classify(b[1][0]);return `${x.dimension}:${x.number}`.localeCompare(`${y.dimension}:${y.number}`,undefined,{numeric:true});});
      for(const [id,items] of ordered){
        const classification=this.classify(items[0]);
        const category=dimLabel(classification);
        if(this.view==='all'&&category!==previousCategory){const heading=el('h3',category,'dimension-heading');this.details.append(heading);previousCategory=category;}

        const rule=items[0].rubric,result=items[0].result,box=el('article'),head=el('header',`${id} · ${rule?.title||result?.title||items[0].defect?.summary||'缺陷证据'}`);box.append(head);box.dataset.criterionId=id;box.classList.toggle('node-target',this.selectedKey && this.selectedCriterionId ? this.selectedCriterionId===id : selectedIds.has(id));box.addEventListener('click',event=>this.resultClick(event,id));
        const score=T.itemScore(items[0]);const scoreBadge=el('span',score===null?'未定档':`${score} 分档`,'badge score-badge');scoreBadge.style.color=T.scoreColor(score);head.append(scoreBadge);
        if(classification.warnings.length)box.append(el('p',classification.warnings.join('\n'),'notice'));
        const two=el('div','','two'),requirement=el('div'),judgment=el('div');requirement.append(el('h4','评分标准'));
        if(rule){requirement.append(el('span',dimLabel(classification),'badge'),el('span',importance[rule.importance]||rule.importance||'未标重要性','badge'),el('p',text(rule.expected)));
          for(const check of list(rule.requirement_checks))requirement.append(el('p',typeof check==='string'?check:`${check.id} · ${check.text||''}`));
          
          if(rule.source_locator||rule.importance_reason){const d=el('details');d.append(el('summary','来源与重要性依据'),el('p',rule.source_locator||''),el('p',rule.importance_reason||''));requirement.append(d);}
        }else requirement.append(el('p','未找到该评分项的 rubric，保留原判断。','muted'));
        judgment.append(el('h4','机评判断'),el('span',statuses[result?.status]||result?.status||'缺陷记录','badge'));
        if(result){if(result.max_impact)judgment.append(el('span',impacts[result.max_impact]||result.max_impact,'badge'));judgment.append(el('p',result.reason||''));}
        for(const item of items){if(item.defect)judgment.append(el('p',`缺陷：${item.defect.summary||item.defect.reason||''}`));for(const c of item.checks)judgment.append(el('p',`${c.requirement_id} · ${{present:'完整',partly:'部分',absent:'未交付',unknown:'未知'}[c.delivery]||c.delivery||''}\n${c.observation||''}${c.not_delivered?'\n缺口：'+c.not_delivered:''}`));}
        two.append(requirement,judgment);box.append(two);
        for(const item of items){if(!item.evidence)continue;const e=el('div','','evidence');if(item.location)e.addEventListener('click',event=>this.resultClick(event,id,item.location.start));if(item.location){const jump=el('button',T.format(item.location.start));jump.type='button';jump.title='定位到该证据时间';jump.addEventListener('click',()=>{this.focusResult(id,item.location.start);});e.append(jump);}e.append(el('h4','此时间点的证据'),el('p',item.evidence.observation||''));if(item.evidence.audio_quote)e.append(el('p',`旁白：“${item.evidence.audio_quote}”`));box.append(e);}
        box.append(lazyDetails('完整评分项数据',()=>[el('pre',JSON.stringify({rubric:rule,judgment:result},null,2))]));
        this.details.append(box);
      }
      if(this.rawPanel)this.details.append(this.rawPanel);
    }
  }
  globalThis.__cyleMachineEvaluationV1=MachineEvaluation;
})();
