(() => {
  'use strict';
  if(globalThis.__cyleQuestionRubricV1)return;
  const fingerprint = value => globalThis.__cyleStorageServiceV1.fingerprint(value);
  function load(row, mapping) {
    const M=globalThis.__cyleFieldMappingV1;
    const fields=M.read(row,mapping);
    const sources=fields.filter(item=>{const f=mapping.fields.find(f=>f.id===item.id);return f.entityId==='case-rubric'&&f.role==='题目rubric';});
    if(sources.length!==1)throw new Error('请在题库映射中绑定一个题目 rubric。');
    const cell=sources[0].cell,value=cell.rawValue??cell.value??'';
    if(value==null||String(value).trim()==='')throw new Error('本题的题目 rubric 为空。');
    let data;
    try{data=typeof value==='string'?JSON.parse(value):value;}catch{throw new Error('本题的题目 rubric 不是有效 JSON。');}
    return parse(data,{source:sources[0].source,caseId:fields.find(f=>f.isIdentity)?.value});
  }
  function parse(data,{source=null,caseId:identity}={}){
    if(!Array.isArray(data?.dimensions)||!data.dimensions.length)throw new Error('题目 rubric 缺少 dimensions 检查点。');
    if(data.case_id!=null&&identity!=null&&String(data.case_id)!==String(identity))throw new Error('题目 rubric 的 case_id 与当前题目不一致。');
    const ids=new Set(),groups=[];
    for(const d of data.dimensions){
      if(!d||typeof d.dimension_id!=='string'||!d.dimension_id||!d.dimension_name)throw new Error('题目 rubric 的维度编号或名称不完整。');
      if(groups.some(g=>g.id===d.dimension_id))throw new Error('题目 rubric 的维度编号重复。');
      const criteria=[];
      for(const [kind,items] of [['objective',d.objective_checkpoints],['subjective',d.subjective_checkpoints]]){
        if(items!=null&&!Array.isArray(items))throw new Error('题目 rubric 的检查点必须是数组。');
        for(const item of items||[]){
          const c=typeof item==='string'?{checkpoint:item}:item;
          if(!c||typeof c.checkpoint!=='string'||!c.checkpoint.trim())throw new Error('题目 rubric 存在空检查点。');
          const id=String(c.checkpoint_id||`${d.dimension_id}/${kind}/${fingerprint(c.checkpoint)}`);
          if(ids.has(id))throw new Error('题目 rubric 的检查点 ID 重复。');ids.add(id);
          const anchors=c.scoring_criteria||{};
          const provided=Object.keys(anchors).map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=5).sort((a,b)=>a-b);
          const boolean=kind==='objective'&&!Object.values(anchors).some(v=>v!=null&&String(v).trim());
          const values=boolean?[true,false]:kind==='objective'?(Number.isInteger(c.max_score)&&c.max_score>0?Array.from({length:c.max_score},(_,i)=>i+1):[]):provided;
          const descriptions=anchors;
          criteria.push({id,title:c.checkpoint,definition:c.checkpoint,kind,boolean,max_score:c.max_score,
            enabled:true,weight:1,score_values:values,scoring_criteria:descriptions,
            scoring_rules:values.length?values.map(v=>descriptions[v]!=null?`${v}：${descriptions[v]}`:`${v} 分`).join('\n'):'客观评分档位未配置，可先记录判断、问题和证据。'});
        }
      }
      if(criteria.length)groups.push({id:d.dimension_id,name:d.dimension_name,weight:d.weight??null,criteria});
    }
    if(!groups.length)throw new Error('题目 rubric 没有可显示的检查点。');
    const sourceFingerprint=fingerprint(data);
    return {id:`${data.rubric_id||'case-rubric'}/${sourceFingerprint}`,name:'本题 rubric',sourceFingerprint,
      source,snapshot:data,dimension_groups:groups};
  }
  globalThis.__cyleQuestionRubricV1=Object.freeze({load,parse});
})();
