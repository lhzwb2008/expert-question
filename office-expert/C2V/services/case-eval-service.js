(() => {
  'use strict';
  if(globalThis.__cyleCaseEvalV1)return;
  const copy=x=>structuredClone(x),sessions=new Map();
  let generation=0;
  const revisionReview=new WeakMap();
  const raw=c=>{const v=c?.rawValue??c?.value??'';return typeof v==='string'?v:JSON.stringify(v)};
  const fp=x=>globalThis.__cyleStorageServiceV1.fingerprint(x);
  const equal=(a,b)=>{if(a===b)return true;try{return globalThis.__cyleWritebackServiceV1.valuesEqual(JSON.parse(a),JSON.parse(b));}catch{return false;}};
  function rubric(input){
    const data=copy(input);
    for(const d of data.dimensions){
      for(const kind of ['objective','subjective'])d[kind+'_checkpoints']=(d[kind+'_checkpoints']||[]).map(c=>{
        c=typeof c==='string'?{checkpoint:c}:c;
        c.checkpoint_id ||= `${d.dimension_id}/${kind}/${fp(c.checkpoint)}`;
        return c;
      });
    }
    return data;
  }
  // Cell format stores only changes against the fingerprint-locked source rubric.
  // Ordinals are safe only within that exact source; editor IDs remain internal.
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const empty=v=>v==null||v===''||Array.isArray(v)&&!v.length;
  function delta(value,base,skip=[]){
    const out={};
    for(const [key,v] of Object.entries(value)){
      if(skip.includes(key)||same(v,base[key]))continue;
      if(empty(v)){if(!empty(base[key]))(out.cleared ||= []).push(key);}
      else out[key]=copy(v);
    }
    for(const key of Object.keys(base))if(!skip.includes(key)&&!(key in value)&&!empty(base[key]))(out.cleared ||= []).push(key);
    return out;
  }
  function apply(base,patch,skip=[]){
    for(const key of patch.cleared||[])delete base[key];
    for(const [key,value] of Object.entries(patch))if(key!=='cleared'&&!skip.includes(key))base[key]=copy(value);
    return base;
  }
  function encode(data,currentSource=data.original_rubric){
    // A legacy cell may carry an older rubric snapshot. Keep it self-contained
    // until its source is restored; never emit an unreadable compact result.
    if(data.quality_mode||data.annotation_snapshot||fp(currentSource)!==fp(data.original_rubric))return copy(data);
    const source=data.original_rubric,base=rubric(source);
    // Structural additions cannot be represented by source ordinals. Keep a
    // self-contained v1 result (including stable IDs) instead of losing them.
    const structure=r=>r.dimensions.map(d=>[d.dimension_id,...['objective_checkpoints','subjective_checkpoints'].map(k=>(d[k]||[]).map(c=>c.checkpoint_id))]);
    if(data.models.some(m=>!same(structure(m.rubric),structure(base))))return copy(data);
    const out={...copy(data),schema:'case-eval/2',rubric_fingerprint:fp(source)};
    delete out.original_rubric;
    out.models=data.models.map(m=>{
      const dimensions=[];
      if(m.rubric.dimensions.length!==base.dimensions.length)throw Error('维度结构已变化，无法精简保存。');
      for(const d of m.rubric.dimensions){
        const original=base.dimensions.find(x=>x.dimension_id===d.dimension_id);
        if(!original)throw Error('检查点结构已变化，无法精简保存。');
        const patch=delta(d,original,['dimension_id','objective_checkpoints','subjective_checkpoints']);
        for(const kind of ['objective_checkpoints','subjective_checkpoints']){
          const items=[];
          if((d[kind]||[]).length!==(original[kind]||[]).length)throw Error('检查点结构已变化，无法精简保存。');
          for(const c of d[kind]||[]){
            const index=(original[kind]||[]).findIndex(x=>x.checkpoint_id===c.checkpoint_id);
            if(index<0)throw Error('检查点来源无法匹配，无法精简保存。');
            const change=delta(c,original[kind][index],['checkpoint_id','status']);
            const inferred=c.score==null?'unscored':'scored';
            if(c.status&&c.status!==inferred)change.status=c.status;
            if(Object.keys(change).length)items.push({item:index+1,...change});
          }
          if(items.length)patch[kind]=items;
        }
        if(Object.keys(patch).length)dimensions.push({dimension_id:d.dimension_id,...patch});
      }
      const result={...copy(m)};delete result.rubric;
      const extra=delta(m.rubric,base,['dimensions']);
      if(dimensions.length||Object.keys(extra).length)result.rubric={...extra,...(dimensions.length?{dimensions}:{})};
      return result;
    });
    if(!out.ranking?.length)delete out.ranking;
    return out;
  }
  function decode(data,source){
    if(data.schema!=='case-eval/2')return data;
    if(data.rubric_fingerprint!==fp(source))throw Error('题目 rubric 已变化，无法安全恢复旧标注；请恢复原 rubric 后继续编辑，原结果已保留。');
    const out={...copy(data),schema:'case-eval/1',original_rubric:copy(source),ranking:copy(data.ranking||[])};
    delete out.rubric_fingerprint;
    out.models=data.models.map(m=>{
      const restored=rubric(source);
      apply(restored,m.rubric||{},['dimensions']);
      for(const patch of m.rubric?.dimensions||[]){
        const d=restored.dimensions.find(x=>x.dimension_id===patch.dimension_id);
        if(!d)throw Error('标注维度无法匹配，原结果已保留。');
        apply(d,patch,['dimension_id','objective_checkpoints','subjective_checkpoints']);
        for(const kind of ['objective_checkpoints','subjective_checkpoints']){
          const seen=new Set();
          for(const c of patch[kind]||[]){
            if(!Number.isInteger(c.item)||c.item<1||!d[kind]?.[c.item-1]||seen.has(c.item))throw Error('标注检查点无法匹配，原结果已保留。');
            seen.add(c.item);apply(d[kind][c.item-1],c,['item','checkpoint_id']);
          }
        }
      }
      return {...copy(m),rubric:restored};
    });
    return out;
  }
  function parse(value,caseId,source){
    if(!value.trim()||value.startsWith('【映射测试】'))return null;
    let data;try{data=JSON.parse(value)}catch{throw Error('结果格已有非测试内容，请先核对，当前内容已保留。')}
    data=decode(data,source);
    if(data.schema!=='case-eval/1'||String(data.case_id)!==String(caseId)||!Array.isArray(data.models)||!data.original_rubric)throw Error('结果格式或题号不匹配，原内容已保留。');
    const names=new Set();
    for(const model of data.models){if(!model.model||names.has(model.model))throw Error('模型名称缺失或重复。');names.add(model.model);globalThis.__cyleQuestionRubricV1.parse(model.rubric);}
    if(data.quality_mode)validateApprovals(data);
    return data;
  }
  function initial(caseId,source,models){return {schema:'case-eval/1',case_id:caseId,original_rubric:copy(source),models:models.map(m=>({model:m.name,rubric:rubric(source)})),ranking:[]};}
  async function open(row,mapping,workId){
    const openedGeneration=generation;
    const M=globalThis.__cyleFieldMappingV1,ctx=M.workContext(row,mapping,workId),fields=M.read(row,mapping),identity=fields.find(f=>f.isIdentity);
    if(!['annotation','quality'].includes(ctx.work.workType))throw Error('请先配置工作项的标注或质检类型。');
    if(!ctx.person||!ctx.target)throw Error('当前工作项需要绑定人员和结果列。');
    if(!identity||!raw(identity.cell).trim())throw Error('请先映射题目ID。');
    const source=globalThis.__cyleQuestionRubricV1.load(row,mapping).snapshot;
    const baseline=raw(ctx.target.cell),caseId=raw(identity.cell);
    const key=JSON.stringify([M.key(row),row.rowIndex,caseId,workId,ctx.target.source,fp(source)]);
    // Freeze the source cell value: row/cell objects can be refreshed in place.
    const rubricDependency={index:ctx.rubric.source.index,header:ctx.rubric.source.header,baseline:raw(ctx.rubric.cell)};
    const current={row,mapping,ctx,identity,source,rubricDependency};
    let s=await sessions.get(key);
    if(s){
      if(s.baseline!==baseline){
        if(equal(s.baseline,baseline)){s.baseline=baseline;}
        else {sessions.delete(key);s=null;}
      }
      if(s){Object.assign(s,current);return s;}
    }
    const pending=(async()=>{
      const savedResult=parse(baseline,caseId,source);
      const data=savedResult||(ctx.work.workType==='quality'?{schema:'case-eval/1',case_id:caseId,quality_mode:'dimension-approval/1',original_rubric:copy(source),models:[],approvals:[]}:initial(caseId,source,ctx.models));
      const descriptor={namespace:'case-eval',id:key,sourceValue:baseline};
      // Feishu is authoritative. Local recovery records never populate an editor.
      const session={...current,key,baseline,data,dirty:false,conflict:false,views:new Set(),queue:Promise.resolve(),saving:false,notice:'',descriptor};
      for(const m of ctx.work.workType==='quality'?[]:ctx.models)if(!session.data.models.some(x=>x.model===m.name)){const weights=Object.fromEntries(weightDimensions(session).map(d=>[d.dimension_id,d.weight])),next=rubric(source);for(const d of next.dimensions)d.weight=weights[d.dimension_id];session.data.models.push({model:m.name,rubric:next});}
      for(const id of new Set(Object.values(weightSources(session.data)).map(ref=>ref.source_work_id))){try{const sourceContext=M.workContext(row,mapping,id);(session.qualityDependencies ||= new Map()).set(id,{index:sourceContext.target.source.index,header:sourceContext.target.source.header,baseline:raw(sourceContext.target.cell)});}catch{}}
      return session;
    })();
    sessions.set(key,pending);
    try {s=await pending;if(openedGeneration===generation)sessions.set(key,s);return s;}catch(e){sessions.delete(key);throw e;}
  }
  function model(s,name){const m=s.data.models.find(m=>m.model===name);if(!m)throw Error('模型不在当前整题结果中。');return m;}
  function notify(s,structure=false,origin=null){for(const view of s.views)if(view!==origin)view.caseSessionChanged?.(structure,origin?.caseModelName);}
  function persist(s,status='pending'){
    const D=globalThis.__cyleDraftServiceV1;
    s.recovery ||= {id:globalThis.__cyleWritebackServiceV1.createOperationId('case-recovery'),revision:0};
    const recovery=s.recovery,baseline=s.baseline;
    const context={...D.captureContext(s.row,s.ctx.target.source.index,s.ctx.target.source.header,'human-eval'),workId:s.ctx.work.id,workName:s.ctx.work.name};
    const value={data:copy(s.data),baseline,context,recoveryStatus:status,error:s.writeError||'',recoveryVersion:2,
      request:{row:{tableKey:s.row.tableKey,sheetId:s.row.sheetId,sheetIndex:s.row.sheetIndex,rowIndex:s.row.rowIndex,sourceFrameId:s.row.sourceFrameId},
        identity:{source:copy(s.identity.source),baseline:raw(s.identity.cell)},target:copy(s.ctx.target.source),workId:s.ctx.work.id,
        source:copy(s.source),rubricDependency:copy(s.rubricDependency),qualityDependencies:[...(s.qualityDependencies?.entries()||[])]}};
    s.queue=s.queue.catch(()=>{}).then(async()=>{
      const saved=await D.saveDraft({namespace:'case-eval-recovery',id:recovery.id,sourceValue:baseline,value,expectedRevision:recovery.revision,allowSourceChange:true,metadata:{kind:'write-recovery'}});
      recovery.revision=saved.revision;return saved;
    });
    return s.queue;
  }
  function resolveRecovery(s){
    if(!s.recovery)return Promise.resolve();
    // Detach this completed attempt before cleanup: a later failure gets its own
    // record and cannot be deleted by the previous attempt's slow storage work.
    const finished={...s,recovery:s.recovery,queue:s.queue};
    s.recovery=null;
    if(!finished.recovery.revision)return Promise.resolve();
    s.queue=Promise.resolve();
    const cleanup=(async()=>{
      await persist(finished,'resolved');
      await globalThis.__cyleDraftServiceV1.deleteDraft({namespace:'case-eval-recovery',id:finished.recovery.id,expectedRevision:finished.recovery.revision});
    })().catch(()=>{});
    s.recoveryCleanup=cleanup;return cleanup;
  }
  function changed(s,structure=false,origin=null){
    if(s.saving||s.conflict)return;s.qualityCommit?.();s.dirty=true;s.editVersion=(s.editVersion||0)+1;s.actionError='';s.notice='有未写回的修改';
    notify(s,structure,origin);
  }
  function acceptFreshRow(){generation++;sessions.clear();}
  function checkpoints(record){return record.rubric.dimensions.flatMap(d=>[...(d.objective_checkpoints||[]),...(d.subjective_checkpoints||[])]);}
  function answers(record){return checkpoints(record).map(c=>({criterionId:c.checkpoint_id,status:c.status|| (c.score==null?'unscored':'scored'),score:c.score??null,note:c.reason||'',annotations:copy(c.annotations||[]),evidence:copy(c.evidence||[])}));}
  function writeAnswers(s,name,values){const items=new Map(checkpoints(model(s,name)).map(c=>[c.checkpoint_id,c]));for(const a of values){const c=items.get(a.criterionId);if(c){const next={...c,status:a.status,score:a.score??null,reason:a.note||'',annotations:copy(a.annotations||[]),evidence:copy(a.evidence||[])};if(s.qualityCommit&&qualityEditFingerprint({objective_checkpoints:[c]})===qualityEditFingerprint({objective_checkpoints:[next]}))continue;if(a.status!=='needs_review'||a.score!==c.score)revisionReview.delete(c);Object.assign(c,next);}}}
  function revise(s,id,text,origin=null){
    if(s.saving||s.conflict)return;
    for(const m of s.data.models){
      const c=checkpoints(m).find(c=>c.checkpoint_id===id);if(!c||c.checkpoint===text)continue;
      if(!revisionReview.has(c))revisionReview.set(c,{text:c.checkpoint,status:c.status});
      const prior=revisionReview.get(c);c.checkpoint=text;
      if(text===prior.text){
        if(c.status==='needs_review'){if(prior.status===undefined)delete c.status;else c.status=prior.status;}
        revisionReview.delete(c);
      }else if(c.score!=null||c.status==='scored')c.status='needs_review';
    }
    changed(s,true,origin);
  }
  function weightDimensions(s){
    const dimensions=new Map((s.data.original_rubric?.dimensions||[]).map(d=>[d.dimension_id,{...d}]));
    for(const m of s.data.models)for(const d of m.rubric.dimensions){if(!dimensions.has(d.dimension_id))dimensions.set(d.dimension_id,{...d});}
    for(const [id,d] of dimensions){const current=s.data.models.flatMap(m=>m.rubric.dimensions).find(x=>x.dimension_id===id);d.weight=s.data.dimension_weights?.[id]??current?.weight??d.weight;}
    return [...dimensions.values()];
  }
  function checkWeights(dimensions,weights){
    if(Object.keys(weights).length!==dimensions.length||dimensions.some(d=>!Object.hasOwn(weights,d.dimension_id)))throw Error('维度已变化，请重新打开权重面板。');
    const values=dimensions.map(d=>weights[d.dimension_id]);
    if(values.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<=0))throw Error('每个维度的权重必须是大于 0 的数字。');
    if(Math.abs(values.reduce((a,b)=>a+b,0)-25)>1e-9)throw Error('权重总和必须是 25，请在权重面板调整。');
  }
  function validateWeights(s){
    const dimensions=weightDimensions(s),weights=Object.fromEntries(dimensions.map(d=>[d.dimension_id,d.weight]));
    checkWeights(dimensions,weights);
    if(s.data.dimension_weights)checkWeights(dimensions,s.data.dimension_weights);
    for(const m of s.data.models)for(const d of m.rubric.dimensions)if(d.weight!==weights[d.dimension_id])throw Error('各模型权重不一致，请统一调整维度权重。');
  }
  function weightSources(data){
    if(data.weight_sources)return copy(data.weight_sources);
    const source=data.weight_source;
    return source?Object.fromEntries(Object.entries(data.dimension_weights||{}).map(([id,value])=>[id,{source_work_id:source.source_work_id,source_name:source.source_name,model:source.model,weight_fingerprint:fp(value)}])):{};
  }
  function weightIssue(s){
    try{validateWeights(s);return '';}catch(error){
      const values=weightDimensions(s).map(d=>d.weight);
      if(values.some(v=>!Number.isFinite(v)||v<=0))return '请为所有维度填写大于 0 的权重';
      const total=Number(values.reduce((a,b)=>a+b,0).toFixed(9)),delta=Number((25-total).toFixed(9));
      return Math.abs(delta)>1e-9?`权重合计 ${total} / 25，还需${delta>0?'增加':'减少'} ${Math.abs(delta)}`:error.message;
    }
  }
  function applyWeightValues(s,weights){
    s.data.dimension_weights=copy(weights);
    for(const m of s.data.models)for(const d of m.rubric.dimensions){
      if(d.weight===weights[d.dimension_id])continue;
      d.weight=weights[d.dimension_id];
      const approval=s.data.approvals?.find(a=>a.model===m.model&&a.dimension_id===d.dimension_id);
      if(approval){approval.manual=true;approval.source_fingerprint=fp(d);}
    }
  }
  function setWeights(s,weights,source=null){
    if(s.saving||s.conflict)throw Error('当前结果暂不可修改。');
    checkWeights(weightDimensions(s),weights);
    const refs=weightSources(s.data),before=Object.fromEntries(weightDimensions(s).map(d=>[d.dimension_id,d.weight]));
    for(const id of Object.keys(refs))if(before[id]!==weights[id])delete refs[id];
    if(source){s.data.weight_source=copy(source);delete s.data.weight_sources;}
    else {delete s.data.weight_source;if(Object.keys(refs).length)s.data.weight_sources=refs;else delete s.data.weight_sources;}
    applyWeightValues(s,weights);pruneQualityDependencies(s);changed(s,true);
  }
  function setWeight(s,id,value){const weights=Object.fromEntries(weightDimensions(s).map(d=>[d.dimension_id,d.weight]));weights[id]=value;return setWeights(s,weights);}
  function addObjectiveCheckpoint(s,dimensionId,modelName,input){
    if(s.saving||s.conflict||s.ctx.work.workType!=='annotation')throw Error('当前工作项不可新增标准。');
    const text=String(input.checkpoint||'').trim(),score=input.score===undefined?null:input.score;
    if(!text)throw Error('请填写评估标准。');
    // Boolean checkpoints need no numeric score configuration. Retain an
    // explicitly supplied legacy maximum without inventing one for new items.
    const maximum={};
    if(input.max_score!==undefined){const max=Number(input.max_score);if(!Number.isInteger(max)||max<=0)throw Error('分值必须为正整数。');maximum.max_score=max;}
    if(![true,false,null].includes(score))throw Error('请选择符合、不符合或未评。');
    if(!s.data.models.some(m=>m.model===modelName)||s.data.models.some(m=>!m.rubric.dimensions.some(d=>d.dimension_id===dimensionId)))throw Error('模型或所属维度已变化，请刷新后重试。');
    const id=globalThis.__cyleWritebackServiceV1.createOperationId('checkpoint');
    if(s.data.models.some(m=>checkpoints(m).some(c=>c.checkpoint_id===id)))throw Error('检查点编号冲突，请重试。');
    for(const m of s.data.models){
      const d=m.rubric.dimensions.find(d=>d.dimension_id===dimensionId),current=m.model===modelName;
      (d.objective_checkpoints ||= []).push({checkpoint_id:id,checkpoint:text,...maximum,
        status:current&&score!==null?'scored':'unscored',score:current?score:null,reason:current?String(input.reason||''):'',evidence:[]});
    }
    changed(s,true);return id;
  }
  function removeAddedCheckpoint(s,id){
    if(s.saving||s.conflict||s.ctx.work.workType!=='annotation')throw Error('当前工作项不可删除标准。');
    if(checkpoints({rubric:rubric(s.data.original_rubric)}).some(c=>c.checkpoint_id===id))throw Error('不能删除题库原有检查点。');
    for(const m of s.data.models)for(const d of m.rubric.dimensions)d.objective_checkpoints=(d.objective_checkpoints||[]).filter(c=>c.checkpoint_id!==id);
    changed(s,true);
  }
  function snapshotDiff(before,after){
    const index=r=>new Map((r?.dimensions?rubric(r).dimensions:[]).flatMap(d=>[...(d.objective_checkpoints||[]),...(d.subjective_checkpoints||[])].map(c=>[c.checkpoint_id,c])));
    const a=index(before),b=index(after),out=[];
    const equivalent=c=>c?{...c,status:c.status||(c.score==null?'unscored':'scored'),score:c.score??null,reason:c.reason||'',annotations:c.annotations||[],evidence:c.evidence||[]}:null;
    for(const id of new Set([...a.keys(),...b.keys()])){
      const x=a.get(id),y=b.get(id);
      if(JSON.stringify(equivalent(x))!==JSON.stringify(equivalent(y)))out.push({id,before:x||null,after:y||null});
    }
    for(const d of after?.dimensions||[]){const old=before?.dimensions?.find(x=>x.dimension_id===d.dimension_id);if(old&&JSON.stringify([old.weight,old.other])!==JSON.stringify([d.weight,d.other]))out.push({id:d.dimension_id,before:{weight:old.weight,other:old.other},after:{weight:d.weight,other:d.other}});}
    return out;
  }
  function annotationSources(s){
    return (s.mapping.entities||[]).filter(w=>w.type==='work'&&w.workType==='annotation').map(work=>{
      try{const ctx=globalThis.__cyleFieldMappingV1.workContext(s.row,s.mapping,work.id);return {work,person:raw(ctx.person?.cell),data:parse(raw(ctx.target?.cell),s.data.case_id,s.source)};}catch(e){return {work,error:e.message};}
    });
  }
  function approveDimension(s,sourceWorkId,modelName,dimensionId,checked){
    if(s.saving||s.conflict)throw Error('当前质检结果暂不可修改。');
    if(s.ctx.work.workType!=='quality')throw Error('只有质检工作区可以确认通过。');
    const source=annotationSources(s).find(x=>x.work.id===sourceWorkId);
    const record=source?.data?.models.find(x=>x.model===modelName);
    const dimension=record?.rubric.dimensions.find(x=>x.dimension_id===dimensionId)||(!source?.error&&source?rubric(source.data?.original_rubric||s.source).dimensions.find(x=>x.dimension_id===dimensionId):null);
    if(checked&&!dimension)throw Error(source?.error||'该标注尚无此维度的结果。');
    if(s.data.quality_mode!=='dimension-approval/1')s.data={schema:'case-eval/1',case_id:s.data.case_id,quality_mode:'dimension-approval/1',original_rubric:copy(s.source),models:[],approvals:[]};
    const previous=s.data.approvals.find(x=>x.model===modelName&&x.dimension_id===dimensionId);
    if(!checked&&previous?.source_work_id!==sourceWorkId)return;
    s.data.approvals=s.data.approvals.filter(x=>!(x.model===modelName&&x.dimension_id===dimensionId));
    let target=s.data.models.find(x=>x.model===modelName);
    if(target)target.rubric.dimensions=target.rubric.dimensions.filter(x=>x.dimension_id!==dimensionId);
    if(checked){
      const original=(source.data?.original_rubric||s.source).dimensions.find(x=>x.dimension_id===dimensionId);
      const approval={model:modelName,dimension_id:dimensionId,source_work_id:sourceWorkId,source_name:source.work.name,person:source.person||'',source_fingerprint:fp(dimension),original_dimension:copy(original||null)};
      s.data.approvals.push(approval);
      if(!target){target={model:modelName,rubric:{dimensions:[]}};s.data.models.push(target);}
      const adopted=copy(dimension);if(s.data.dimension_weights)adopted.weight=s.data.dimension_weights[dimensionId];target.rubric.dimensions.push(adopted);approval.source_fingerprint=fp(adopted);
      const ctx=globalThis.__cyleFieldMappingV1.workContext(s.row,s.mapping,sourceWorkId);
      (s.qualityDependencies ||= new Map()).set(sourceWorkId,{index:ctx.target.source.index,header:ctx.target.source.header,baseline:raw(ctx.target.cell)});
    }
    s.data.models=s.data.models.filter(x=>x.rubric.dimensions.length);
    pruneQualityDependencies(s);
    changed(s,true);
  }
  const approvalUsesWork=(a,id)=>a.source_work_id===id||a.checkpoint_sources?.some(x=>x.source_work_id===id);
  function pruneQualityDependencies(s){for(const key of s.qualityDependencies?.keys()||[])if(!Object.values(weightSources(s.data)).some(ref=>ref.source_work_id===key)&&!s.data.approvals?.some(a=>approvalUsesWork(a,key)))s.qualityDependencies.delete(key);}
  function sourceWeight(s,sourceWorkId,modelName,dimensionId){
    const source=annotationSources(s).find(x=>x.work.id===sourceWorkId);
    if(!source||source.error)throw Error(source?.error||'标注来源不可用。');
    const data=source.data||{original_rubric:s.source,models:[]},record=data.models.find(m=>m.model===modelName),base=(data.original_rubric||s.source).dimensions.find(d=>d.dimension_id===dimensionId);
    const value=data.dimension_weights?.[dimensionId]??record?.rubric.dimensions.find(d=>d.dimension_id===dimensionId)?.weight??base?.weight;
    if(!Number.isFinite(value)||value<=0||value>25)throw Error('该维度权重必须大于 0 且不超过 25。');
    return {source,value};
  }
  function approveWeight(s,sourceWorkId,modelName,dimensionId){
    if(s.saving||s.conflict||s.ctx.work.workType!=='quality')throw Error('当前工作项不可采用权重。');
    if(s.data.quality_mode!=='dimension-approval/1')throw Error('旧质检格式请先核对，不能覆盖已有结果。');
    const dimensions=weightDimensions(s);if(!dimensions.some(d=>d.dimension_id===dimensionId))throw Error('维度已变化，请刷新后重试。');
    const {source,value}=sourceWeight(s,sourceWorkId,modelName,dimensionId),weights=Object.fromEntries(dimensions.map(d=>[d.dimension_id,d.weight]));
    weights[dimensionId]=value;
    s.data.weight_sources={...weightSources(s.data),[dimensionId]:{source_work_id:sourceWorkId,source_name:source.work.name,model:modelName,weight_fingerprint:fp(value)}};delete s.data.weight_source;
    const ctx=globalThis.__cyleFieldMappingV1.workContext(s.row,s.mapping,sourceWorkId);
    (s.qualityDependencies ||= new Map()).set(sourceWorkId,{index:ctx.target.source.index,header:ctx.target.source.header,baseline:raw(ctx.target.cell)});
    applyWeightValues(s,weights);pruneQualityDependencies(s);changed(s,true);
  }
  function sourceWeights(s,sourceWorkId,modelName){
    const source=annotationSources(s).find(x=>x.work.id===sourceWorkId);
    if(!source||source.error)throw Error(source?.error||'标注来源不可用。');
    const data=source.data||{original_rubric:s.source,models:[]},base=data.original_rubric||s.source,record=data.models.find(m=>m.model===modelName);
    const weights=Object.fromEntries(base.dimensions.map(d=>[d.dimension_id,data.dimension_weights?.[d.dimension_id]??record?.rubric.dimensions.find(x=>x.dimension_id===d.dimension_id)?.weight??d.weight]));
    checkWeights(weightDimensions(s),weights);
    return {source,weights};
  }
  function approveWeights(s,sourceWorkId,modelName){
    if(s.saving||s.conflict||s.ctx.work.workType!=='quality')throw Error('当前工作项不可采用权重。');
    if(s.data.quality_mode!=='dimension-approval/1')throw Error('旧质检格式请先核对，不能覆盖已有结果。');
    const {source,weights}=sourceWeights(s,sourceWorkId,modelName);
    const ctx=globalThis.__cyleFieldMappingV1.workContext(s.row,s.mapping,sourceWorkId);
    (s.qualityDependencies ||= new Map()).set(sourceWorkId,{index:ctx.target.source.index,header:ctx.target.source.header,baseline:raw(ctx.target.cell)});
    setWeights(s,weights,{source_work_id:sourceWorkId,source_name:source.work.name,model:modelName,weights_fingerprint:fp(weights)});
  }
  function checkpointSources(approval,dimension){
    if(approval?.checkpoint_sources)return copy(approval.checkpoint_sources);
    if(!approval?.source_work_id)return [];
    return [...(dimension?.objective_checkpoints||[]),...(dimension?.subjective_checkpoints||[])].map(c=>({checkpoint_id:c.checkpoint_id,source_work_id:approval.source_work_id,source_name:approval.source_name,source_fingerprint:fp(c)}));
  }
  function approveCheckpoint(s,sourceWorkId,modelName,dimensionId,checkpointId){
    if(s.saving||s.conflict)throw Error('当前质检结果暂不可修改。');
    if(s.ctx.work.workType!=='quality')throw Error('只有质检工作区可以采用结果。');
    const source=annotationSources(s).find(x=>x.work.id===sourceWorkId);
    if(!source||source.error)throw Error(source?.error||'标注来源不可用。');
    const sourceRubric=source.data?.models.find(x=>x.model===modelName)?.rubric||rubric(source.data?.original_rubric||s.source);
    const dimension=sourceRubric.dimensions.find(d=>d.dimension_id===dimensionId)||rubric(source.data?.original_rubric||s.source).dimensions.find(d=>d.dimension_id===dimensionId);
    const kind=['objective_checkpoints','subjective_checkpoints'].find(k=>dimension?.[k]?.some(c=>c.checkpoint_id===checkpointId));
    const checkpoint=dimension?.[kind]?.find(c=>c.checkpoint_id===checkpointId);
    if(!checkpoint)throw Error('该标注中没有此检查点。');
    if(s.data.quality_mode!=='dimension-approval/1')throw Error('旧质检格式请先核对，不能覆盖已有结果。');
    let model=s.data.models.find(m=>m.model===modelName);
    if(!model){model={model:modelName,rubric:{dimensions:[]}};s.data.models.push(model);}
    let target=model.rubric.dimensions.find(d=>d.dimension_id===dimensionId);
    if(!target){const base=rubric(s.data.original_rubric).dimensions.find(d=>d.dimension_id===dimensionId)||dimension;target={dimension_id:dimensionId,dimension_name:base.dimension_name,category:base.category,weight:s.data.dimension_weights?.[dimensionId]??base.weight,objective_checkpoints:[],subjective_checkpoints:[]};model.rubric.dimensions.push(target);}
    const previous=s.data.approvals.find(a=>a.model===modelName&&a.dimension_id===dimensionId);
    const refs=checkpointSources(previous,target).filter(x=>x.checkpoint_id!==checkpointId);
    for(const k of ['objective_checkpoints','subjective_checkpoints'])target[k]=(target[k]||[]).filter(c=>c.checkpoint_id!==checkpointId);
    target[kind].push(copy(checkpoint));
    // Keep rubric order; adopting an earlier item must not move it to the bottom.
    const order=dimension[kind].map(c=>c.checkpoint_id);target[kind].sort((a,b)=>{const ai=order.indexOf(a.checkpoint_id),bi=order.indexOf(b.checkpoint_id);return (ai<0?Infinity:ai)-(bi<0?Infinity:bi);});
    refs.push({checkpoint_id:checkpointId,source_work_id:sourceWorkId,source_name:source.work.name,source_fingerprint:fp(checkpoint)});
    s.data.approvals=s.data.approvals.filter(a=>!(a.model===modelName&&a.dimension_id===dimensionId));
    s.data.approvals.push({model:modelName,dimension_id:dimensionId,composed:true,checkpoint_sources:refs,source_fingerprint:fp(target)});
    const ctx=globalThis.__cyleFieldMappingV1.workContext(s.row,s.mapping,sourceWorkId);
    (s.qualityDependencies ||= new Map()).set(sourceWorkId,{index:ctx.target.source.index,header:ctx.target.source.header,baseline:raw(ctx.target.cell)});
    pruneQualityDependencies(s);
    changed(s,true);
  }
  function qualityEditFingerprint(dimension){
    const d=copy(dimension);
    for(const c of [...(d.objective_checkpoints||[]),...(d.subjective_checkpoints||[])]){
      if(c.status===(c.score==null?'unscored':'scored'))delete c.status;
      if(c.score==null)delete c.score;
      for(const key of ['reason','annotations','evidence'])if(empty(c[key]))delete c[key];
    }
    return fp(d);
  }
  function commitQualityRecord(s,record,previous,origin){
    if(s.saving||s.conflict)return;
    let updated=false;
    for(const d of record.rubric.dimensions){
      if(qualityEditFingerprint(d)===previous.get(d.dimension_id))continue;
      previous.set(d.dimension_id,qualityEditFingerprint(d));updated=true;
      let target=s.data.models.find(m=>m.model===record.model);
      if(!target){target={model:record.model,rubric:{dimensions:[]}};s.data.models.push(target);}
      const index=target.rubric.dimensions.findIndex(x=>x.dimension_id===d.dimension_id);
      const priorDimension=index<0?null:copy(target.rubric.dimensions[index]);
      if(index<0)target.rubric.dimensions.push(copy(d));else target.rubric.dimensions[index]=copy(d);
      const old=s.data.approvals.find(a=>a.model===record.model&&a.dimension_id===d.dimension_id);
      const refs=checkpointSources(old,priorDimension).filter(ref=>[...(d.objective_checkpoints||[]),...(d.subjective_checkpoints||[])].some(c=>c.checkpoint_id===ref.checkpoint_id&&fp(c)===ref.source_fingerprint));
      s.data.approvals=s.data.approvals.filter(a=>!(a.model===record.model&&a.dimension_id===d.dimension_id));
      s.data.approvals.push({model:record.model,dimension_id:d.dimension_id,manual:true,checkpoint_sources:refs,source_fingerprint:fp(d)});
    }
    if(updated){
      pruneQualityDependencies(s);
      changed(s,false,origin);
    }
  }
  function validateApprovals(data){
    if(data.quality_mode!=='dimension-approval/1'||!Array.isArray(data.approvals))throw Error('请按维度勾选质检通过的内容。');
    if(data.weight_source&&(!data.weight_source.source_work_id||fp(data.dimension_weights)!==data.weight_source.weights_fingerprint))throw Error('权重来源与当前分配不一致，请重新采用或调整。');
    for(const [id,ref] of Object.entries(data.weight_sources||{}))if(!ref.source_work_id||!Object.hasOwn(data.dimension_weights||{},id)||fp(data.dimension_weights[id])!==ref.weight_fingerprint)throw Error('维度权重来源与当前值不一致，请重新采用或调整。');
    const keys=new Set();
    for(const a of data.approvals){
      const key=JSON.stringify([a.model,a.dimension_id]);
      if(keys.has(key)||(!a.source_work_id&&!a.manual&&!(a.composed&&a.checkpoint_sources?.length)))throw Error('质检维度来源重复或缺失。');keys.add(key);
      const dimension=data.models.find(m=>m.model===a.model)?.rubric.dimensions.find(d=>d.dimension_id===a.dimension_id);
      if(!dimension||fp(dimension)!==a.source_fingerprint)throw Error('质检内容与来源记录不一致，请重新采用。');
      const seen=new Set();for(const ref of a.checkpoint_sources||[]){const c=[...(dimension.objective_checkpoints||[]),...(dimension.subjective_checkpoints||[])].find(c=>c.checkpoint_id===ref.checkpoint_id);if(seen.has(ref.checkpoint_id)||!ref.source_work_id||!c||fp(c)!==ref.source_fingerprint)throw Error('质检检查点来源不一致。');seen.add(ref.checkpoint_id);}
    }
    if(data.models.reduce((n,m)=>n+m.rubric.dimensions.length,0)!==keys.size)throw Error('质检结果包含未勾选的维度。');
  }
  async function readLatest(s){
    const send=message=>globalThis.chrome.runtime.sendMessage(message);
    // The common failure/retry case is still on the same row. Avoid scanning the
    // entire sheet by key unless the user has actually selected a different row.
    let response=await send({type:'READ_ACTIVE_ROW'});
    if(!response?.ok||!Array.isArray(response.cells))throw Error(response?.error||'暂时无法读取飞书当前内容，请重试。');
    if(response.tableKey!==s.row.tableKey||response.sheetId!==s.row.sheetId)throw Error('请先打开备份对应的飞书表格。');
    const identity=response.cells.find(c=>c.columnIndex===s.identity.source.index);
    if(response.rowIndex===s.row.rowIndex&&identity?.header===s.identity.source.header&&equal(raw(identity),raw(s.identity.cell)))return response;
    response=await send({type:'READ_SHEET_ROW_BY_KEY',payload:{sheetId:s.row.sheetId,sheetIndex:s.row.sheetIndex,keyHeader:s.identity.source.header,keyValue:raw(s.identity.cell)}});
    if(!response?.ok||!Array.isArray(response.cells))throw Error(response?.error||'暂时无法读取飞书当前内容，请重试。');
    return response;
  }
  function checkLatest(s,row){
    const cellAt=index=>row.cells.find(c=>c.columnIndex===index);
    if(row.tableKey!==s.row.tableKey||row.sheetId!==s.row.sheetId||row.rowIndex!==s.row.rowIndex)throw Error('题目或所在表格已变化，请重新读取后继续。');
    const target=cellAt(s.ctx.target.source.index);
    if(!target||target.header!==s.ctx.target.source.header||target.formula)throw Error('目标列或公式已变化，请重新读取后继续。');
    const dependencies=[{index:s.identity.source.index,header:s.identity.source.header,baseline:raw(s.identity.cell)},...(s.rubricDependency?[s.rubricDependency]:[]),...[...(s.qualityDependencies?.values()||[])]];
    for(const dep of dependencies){const cell=cellAt(dep.index);if(!cell||cell.header!==dep.header||!equal(raw(cell),dep.baseline))throw Error(`依据「${dep.header}」已变化，请重新读取或重新采用来源。`);}
    if(Number.isInteger(row.sourceFrameId))s.row.sourceFrameId=row.sourceFrameId;
    return raw(target);
  }
  async function inspectLatest(s,read=readLatest){
    s.pendingConflict=null;
    const row=await read(s),latest=checkLatest(s,row),planned=JSON.stringify(encode(s.data,s.source));
    if(equal(latest,planned))return {state:'saved',row,latest};
    if(!equal(latest,s.baseline)){
      s.pendingConflict={latest,row};
      return {state:'conflict',row,latest};
    }
    return {state:'not-saved',row,latest};
  }
  async function confirmSaved(s,value){
    Object.assign(s.ctx.target.cell,{value,rawValue:value,displayValue:value});s.baseline=value;s.pendingValue=null;s.pendingConflict=null;s.dirty=false;s.conflict=false;s.writeError='';s.notice='已回写飞书表格';
    void resolveRecovery(s);
  }
  async function resolveConflict(s,choice,write,read=readLatest){
    if(choice==='table'){
      const row=await read(s);
      // Adopting the table never writes it and may follow a changed rubric.
      if(row.tableKey!==s.row.tableKey||row.sheetId!==s.row.sheetId)throw Error('请先打开备份对应的飞书表格。');
      void resolveRecovery(s);sessions.delete(s.key);s.pendingConflict=null;s.dirty=false;s.writeError='';
      return {state:'table',row};
    }
    const shown=s.pendingConflict?.latest;
    if(shown===undefined)throw Error('请先读取飞书当前内容。');
    let row,latest;
    try{row=await read(s);latest=checkLatest(s,row);}catch(error){s.writeError=error.message;throw error;}
    if(!equal(latest,shown)){s.pendingConflict={latest,row};s.notice='飞书又有更新，请查看最新差异。';return {state:'conflict',row,latest};}
    s.baseline=latest;s.pendingConflict=null;
    try{await save(s,write,read);}catch(error){s.pendingConflict ||= {latest,row};throw error;}
    return {state:s.pendingConflict?'conflict':'saved'};
  }
  async function resumeRecovery(entry){
    const v=entry.value,r=v.request;
    if(v.recoveryVersion!==2||!r)throw Error('此历史备份仅支持查看和导出。');
    const s={row:copy(r.row),identity:{source:copy(r.identity.source),cell:{value:r.identity.baseline}},source:copy(r.source),
      data:copy(v.data),baseline:v.baseline,ctx:{target:{source:copy(r.target)},work:{id:r.workId}},rubricDependency:copy(r.rubricDependency),qualityDependencies:new Map(r.qualityDependencies||[]),
      views:new Set(),queue:Promise.resolve(),saving:false,dirty:true,conflict:false,recovery:{id:entry.storageId,revision:entry.revision},key:'recovery:'+entry.storageId};
    const row=await readLatest(s),M=globalThis.__cyleFieldMappingV1,mapping=await M.load(row);
    if(!mapping)throw Error('请先配置该表的题库映射。');
    const ctx=M.workContext(row,mapping,r.workId);
    if(!ctx.target||ctx.target.source.index!==r.target.index||ctx.target.source.header!==r.target.header)throw Error('备份对应的结果列映射已变化，请先核对。');
    // Keep the original read identity/dependencies; current cells are for writing.
    s.ctx=ctx;s.mapping=mapping;s.recoveryRow=row;return s;
  }
  function conflictDiff(s,all=false){
    const readData=text=>{try{return decode(JSON.parse(text),s.source);}catch{return {raw:text};}};
    const before=readData(s.pendingConflict?.latest??s.baseline),after=s.data;
    const labels={checkpoint:'评估标准',max_score:'分值',score:'评分',status:'状态',reason:'评分说明',evidence:'时间证据',annotations:'标注',weight:'权重',other:'历史其他问题',ranking:'整体排序',approvals:'质检来源',dimension_weights:'整题权重',weight_source:'权重来源',weight_sources:'各维度权重来源'};
    const flatten=data=>{
      const entries=new Map(),put=(key,label,value)=>entries.set(key,{label,value});
      if(Object.hasOwn(data,'raw')){put('raw','单元格原文',data.raw);return entries;}
      data={...data,ranking:data.ranking||[]};
      for(const [key,v] of Object.entries(data))if(!['schema','models','original_rubric','rubric_fingerprint'].includes(key))put(key,labels[key]||key,v);
      for(const m of data.models||[]){
        for(const [k,v] of Object.entries(m))if(!['model','rubric'].includes(k))put(JSON.stringify([m.model,k]),m.model+' / '+k,v);
        for(const [k,v] of Object.entries(m.rubric||{}))if(k!=='dimensions')put(JSON.stringify([m.model,'rubric',k]),m.model+' / '+k,v);
        for(const d of m.rubric?.dimensions||[]){
          const prefix=`${m.model} / ${d.dimension_name||d.dimension_id}`,key=JSON.stringify([m.model,d.dimension_id]);
          for(const [k,v] of Object.entries(d))if(!['objective_checkpoints','subjective_checkpoints'].includes(k))put(key+'/'+k,prefix+' / '+(labels[k]||k),v);
          for(const kind of ['objective_checkpoints','subjective_checkpoints'])for(const item of d[kind]||[]){
            const c={...item,score:item.score??null,status:item.status||(item.score==null?'unscored':'scored'),reason:item.reason||'',annotations:item.annotations||[],evidence:item.evidence||[]};
            const id=c.checkpoint_id||c.checkpoint,base=key+'/'+kind+'/'+id;
            for(const [k,v] of Object.entries(c))if(k!=='checkpoint_id')put(base+'/'+k,`${prefix} / ${c.checkpoint} / ${labels[k]||k}`,v);
          }
        }
      }
      return entries;
    };
    if(before.raw!==undefined)return [{label:'单元格内容（飞书当前内容无法按整题格式解析）',before:before.raw,after:JSON.stringify(after,null,2),changed:true}];
    const a=flatten(before),b=flatten(after);
    return [...new Set([...a.keys(),...b.keys()])].map(k=>({label:b.get(k)?.label||a.get(k)?.label,before:a.get(k)?.value,after:b.get(k)?.value,changed:!globalThis.__cyleWritebackServiceV1.valuesEqual(a.get(k)?.value,b.get(k)?.value)})).filter(x=>all||x.changed);
  }
  async function updateDate(s,write){
    if(!s.ctx.date||s.ctx.date.cell.formula)return;
    const date=s.ctx.date.cell,text=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());
    const identity={index:s.identity.source.index,header:s.identity.source.header,baseline:raw(s.identity.cell)};
    try{const result=await write({row:s.row,cell:date,value:text,expectedValue:raw(date),expectedDependencies:[identity]});if(result?.verified!==true)throw Error('未核验');Object.assign(date,{value:text,rawValue:text,displayValue:text});}catch{s.notice='已回写飞书表格，日期未更新';}
  }
  async function save(s,write,read=readLatest){
    if(s.saving)return;
    s.saving=true;s.notice='正在回写飞书表格…';notify(s);
    try {
      s.writeError='';s.actionError='';s.backupReady=false;s.pendingValue=null;
      if(s.conflict)throw Error('结果格已变化，请导出草稿后刷新核对。');
      if(s.ctx.target.cell.formula)throw Error('结果列是公式，不能覆盖。');
      validateWeights(s);
      if(s.ctx.work.workType==='quality'){validateApprovals(s.data);const ref=s.data.weight_source;if(ref&&fp(sourceWeights(s,ref.source_work_id,ref.model).weights)!==ref.weights_fingerprint)throw Error('权重来源已变化，请重新采用或手动调整。');for(const [id,entry] of Object.entries(s.data.weight_sources||{}))if(fp(sourceWeight(s,entry.source_work_id,entry.model,id).value)!==entry.weight_fingerprint)throw Error(`${id} 权重来源已变化，请重新采用或手动调整。`);}

      const snapshot=encode(s.data,s.source),value=JSON.stringify(snapshot),target=s.ctx.target.cell,row=s.row;
      const deps=[{index:s.identity.source.index,header:s.identity.source.header,baseline:raw(s.identity.cell)}];
      if(s.rubricDependency)deps.push(s.rubricDependency);
      for(const dependency of s.qualityDependencies?.values()||[])deps.push(dependency);
      s.pendingValue=value;
      const response=await write({row,cell:target,value,expectedValue:s.baseline,expectedDependencies:deps});
      let actual=response?.actualValue;try{if(typeof actual==='string')actual=JSON.parse(actual)}catch{}
      if(response?.verified!==true||!globalThis.__cyleWritebackServiceV1.valuesEqual(actual,snapshot))throw Error('结果未通过回读核验');
      await confirmSaved(s,value);
      await updateDate(s,write);
    }catch(e){
      s.writeError=e.message;let status='failed';s.pendingConflict=null;
      if(s.pendingValue){
        try{
          const result=await inspectLatest(s,read);
          if(result.state==='saved'){await confirmSaved(s,result.latest);await updateDate(s,write);return;}
          if(result.state==='conflict')status='conflict';
        }catch(error){
          status='unconfirmed';
          // A changed source is not an invitation to overwrite the result.
          if(/已变化|对应的飞书/.test(error.message)){s.writeError=error.message;status='failed';}
        }
      }
      let backedUp=false;try{await persist(s,status);backedUp=true;}catch{}
      s.notice=s.pendingConflict?'飞书内容已变化，请选择采用哪份内容。':`回写未完成：${s.writeError}。${backedUp?'已保留备份，可重试或在草稿中心处理。':'本机备份也失败，请勿关闭页面。'}`;
      throw e;
    }finally{s.saving=false;notify(s);}
  }
  async function discard(s){sessions.delete(s.key);}
  globalThis.__cyleCaseEvalV1=Object.freeze({open,readLatest,inspectLatest,resolveConflict,resumeRecovery,conflictDiff,confirmSaved,model,answers,writeAnswers,changed,revise,setWeight,setWeights,weightDimensions,weightSources,weightIssue,validateWeights,addObjectiveCheckpoint,removeAddedCheckpoint,save,approveDimension,approveCheckpoint,approveWeights,approveWeight,qualityEditFingerprint,commitQualityRecord,annotationSources,snapshotDiff,raw,persist,notify,normalizeRubric:rubric,encode,decode,discard,acceptFreshRow});
})();
