(() => {
  'use strict';
  const list=x=>Array.isArray(x)?x:[];
  function seconds(value){
    if(typeof value==='number')return Number.isFinite(value)&&value>=0?value:null;
    if(typeof value!=='string')return null;
    const s=value.trim();
    if(!/^\d+(?::[0-5]?\d){1,2}(?:\.\d+)?$/.test(s))return null;
    const parts=s.split(':').map(Number);return parts.reduce((a,b)=>a*60+b,0);
  }
  function timeOf(e){
    const anchor=typeof e?.original_time_seconds==='number'?seconds(e.original_time_seconds):seconds(e?.time);
    for(const [a,b] of [['start_seconds','end_seconds'],['start_s','end_s']]){
      if(typeof e?.[a]==='number'&&typeof e?.[b]==='number'){
        const start=seconds(e[a]),end=seconds(e[b]);if(start!==null&&end!==null&&end>=start)return {start,end,source:'explicit'};
      }
    }
    const range=typeof e?.time==='string'?e.time.split(/\s*[–—~～至到-]\s*/):[];
    if(range.length===2){const start=seconds(range[0]),end=seconds(range[1]);if(start!==null&&end!==null&&end>=start)return {start,end,source:'explicit'};}
    // Only one explicit clock interval in the evidence's own observation is accepted.
    // Keep an original anchor only if it agrees with that interval; never join separate points.
    const matches=[...String(e?.observation||'').matchAll(/(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s*[至到~～—–-]\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)/g)];
    if(matches.length===1){
      const start=seconds(matches[0][1]),end=seconds(matches[0][2]);
      if(start!==null&&end!==null&&end>start&&(anchor===null||(anchor>=start&&anchor<=end)))return {start,end,anchor,source:'observation'};
    }
    if(anchor!==null)return {start:anchor,end:anchor,source:'point'};
    return null;
  }
  function unique(items,label){const out=new Map();for(const item of list(items)){if(!item||typeof item.id!=='string'||!item.id)throw new Error(`${label}缺少评分项 ID`);if(out.has(item.id))throw new Error(`${label}存在重复 ID：${item.id}`);out.set(item.id,item);}return out;}
  function build(rubric,result){
    const rules=unique(rubric?.criteria,'rubric'),judgments=unique(result?.criteria,'机评');
    const nodes=new Map(),linked=new Set();
    function add(id,e,check=null,defect=null){
      const time=timeOf(e);if(!time)return;
      const key=`${time.start}:${time.end}`;if(!nodes.has(key))nodes.set(key,{key,...time,items:[]});
      const node=nodes.get(key);node.sources ||= [];if(!node.sources.includes(time.source))node.sources.push(time.source);const evidenceKey=JSON.stringify([id,e.asset_id||'',e.observation||'',e.audio_quote||'',e.image_url||'',defect?.id||'']);
      let item=node.items.find(item=>item.key===evidenceKey);
      if(!item){item={key:evidenceKey,id,rubric:rules.get(id)||null,result:judgments.get(id)||null,evidence:e,checks:[],defect};node.items.push(item);}
      if(check&&!item.checks.some(c=>c.requirement_id===check.requirement_id))item.checks.push(check);
      if(rules.has(id)||judgments.has(id))linked.add(id);
    }
    for(const [id,resultItem] of judgments){
      for(const e of list(resultItem.evidence))add(id,e);
      for(const check of list(resultItem.checks))for(const e of list(check.evidence))add(id,e,check);
    }
    for(const defect of list(result?.defects)){
      const ids=[...new Set([...rules.keys(),...judgments.keys()])].filter(id=>list(defect.unit_ids).some(unit=>unit===id||String(unit).startsWith(id+':')));
      for(const e of list(defect.evidence))for(const id of ids.length?ids:[`defect:${defect.id||'unknown'}`])add(id,e,null,defect);
    }
    return {nodes:[...nodes.values()].sort((a,b)=>a.start-b.start||a.end-b.end),rules,judgments,
      unlinkedIds:[...new Set([...rules.keys(),...judgments.keys()])].filter(id=>!linked.has(id))};
  }
  function format(t){const s=Number.isFinite(t)?Math.round(Math.max(0,t)*10)/10:0;const m=Math.floor(s/60);return `${String(m).padStart(2,'0')}:${(s%60).toFixed(1).padStart(4,'0')}`;}
  function classification(item = {}){
    const object=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
    const scalar=x=>typeof x==='string'?x.trim():typeof x==='number'&&Number.isFinite(x)?String(x):'';
    const rule=object(item?.rubric),result=object(item?.result),warnings=[];
    const source=object(rule.dimension_source||result.dimension_source);
    const raw=rule.dimension??result.dimension??item?.defect?.dimension;
    const dim=object(raw);
    const dimension=scalar(raw)||scalar(dim.id)||scalar(dim.key)||scalar(dim.name)||'unclassified';
    if(raw!=null&&!scalar(raw)&&!scalar(dim.id)&&!scalar(dim.key)&&!scalar(dim.name))warnings.push('维度格式无法识别，归入未分类；原值保留。');
    const rawNumber=rule.document_number??source.number??result.document_number;
    const number=scalar(rawNumber);
    if(rawNumber!=null&&!number)warnings.push('细分编号格式无法识别，原值保留。');
    const name=scalar(source.name)||scalar(source.title);
    return {dimension,dimensionName:scalar(dim.name)||scalar(rule.dimension_name)||scalar(result.dimension_name),number,name,
      warnings};
  }
  function itemScore(item){
    for(const candidate of [item?.result?.tier_ceiling,item?.defect?.tier_ceiling]){
      const score=typeof candidate==='number'?candidate:typeof candidate==='string'&&/^[1-5]$/.test(candidate.trim())?Number(candidate):null;
      if(Number.isInteger(score)&&score>=1&&score<=5)return score;
    }
    const r=item?.result;
    if(r&&!['binary','gsb'].includes(r.kind)&&Array.isArray(r.score_scale)&&r.score_scale[0]===1&&r.score_scale[1]===5){
      const n=typeof r.score==='number'?r.score:typeof r.score==='string'&&/^[1-5]$/.test(r.score.trim())?Number(r.score):null;if(Number.isInteger(n)&&n>=1&&n<=5)return n;
    }
    return null; // binary/GSB score is not a five-point score.
  }
  function scoreColor(score){return ({1:'#d95b60',2:'#da984c',3:'#4c91e2',4:'#40a4aa',5:'#39a877'})[score]||'#919ba8';}
  function scoreGroups(items){
    const buckets=new Map();for(const item of items){const score=itemScore(item),key=String(score??'unknown');if(!buckets.has(key))buckets.set(key,new Set());buckets.get(key).add(item.id);}
    return [...buckets].sort((a,b)=>(a[0]==='unknown'?6:Number(a[0]))-(b[0]==='unknown'?6:Number(b[0]))).map(([key,ids])=>({key,count:ids.size}));
  }
  globalThis.__cyleEvaluationTimelineV1=Object.freeze({build,timeOf,seconds,format,classification,itemScore,scoreColor,scoreGroups});
})();
