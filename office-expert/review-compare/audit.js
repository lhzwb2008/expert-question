(function(root){
  'use strict';
  const key=(group,item)=>JSON.stringify([group.caseId,group.model,item.id]);
  const source=item=>JSON.stringify([item.a,item.b]);
  const score=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value))?Number(value):null;
  function get(reviews,group,item){
    const r=reviews[key(group,item)];
    return r&&r.source===source(item)?r:null;
  }
  function validate(r,item){
    const optional=item?.status==='same'||item?.status==='single';
    const blank=r?.score===undefined||r.score===null||typeof r.score==='string'&&r.score.trim()==='';
    const s=optional&&blank?(item.b||item.a).score:score(r?.score);
    if(s===null||s<0||s>5)throw new Error('请填写 0～5 分的统一分数。');
    if(!optional&&(typeof r?.note!=='string'||!r.note.trim()))throw new Error('请填写统一评分理由。');
    return s;
  }
  const finalScore=r=>score(r?.score);
  function outcome(reviews,g,i){
    const r=get(reviews,g,i);
    if(i.status==='same'||i.status==='single'){
      try{
        const s=validate(r,i),edited=!!r&&(!!String(r.score||'').trim()||!!r.note?.trim());
        return {score:s,status:r?.confirmed?'已确认':edited?'已填写（可导出）':i.status==='single'?'仅单侧模型（沿用原分）':'分数一致（沿用原分）',note:r?.note?.trim()?r.note:originalReason(i.b||i.a)};
      }catch(_){return {score:null,status:'选填分数无效',note:r?.note||''};}
    }
    if(r?.confirmed){
      try{return {score:validate(r,i),status:'已确认',note:r.note};}catch(_){}
    }
    return {score:r?score(r.score):i.status==='same'?i.a.score:null,
      status:r?'草稿（待确认）':'待核实',note:r?.note||''};
  }
  function originalReason(c){
    return c?.note?.trim()?c.note:(c?.annotations||[]).map(a=>a.text||'').filter(t=>t.trim()).join('\n\n');
  }
  function migrate(r,i){
    if(typeof r.score==='string')return r;
    // Keep the explicitly chosen answer when importing version 1.1 snapshots.
    let s=null;
    if(r.choice==='a'||r.choice==='b'){
      s=typeof i[r.choice]?.score==='number'?i[r.choice].score:null;
      if(r.confirmed&&s!==score(r.chosenScore))throw new Error('旧版最终分数与原始评分不一致。');
    }else if(r.choice==='one'||r.choice==='two')s=score(r[r.choice]?.score);
    else if(r.choice==='custom')s=score(r.custom);
    return {source:r.source,score:s===null?'':String(s),note:r.note||'',confirmed:r.confirmed===true,
      updatedAt:r.updatedAt||'',confirmedAt:r.confirmedAt||''};
  }
  function importReviews(value,result){
    if(value===undefined||value===null)return {};
    if(typeof value!=='object'||Array.isArray(value))throw new Error('核实记录格式不正确。');
    const clean={};
    for(const g of result.groups)for(const i of g.items){
      const old=get(value,g,i);if(!old)continue;
      const r=migrate(old,i);
      if(typeof r.score!=='string'||typeof r.note!=='string'||typeof r.confirmed!=='boolean')throw new Error('统一答案记录字段不正确。');
      if(r.confirmed){validate(r,i);if(typeof r.confirmedAt!=='string')throw new Error('确认时间格式不正确。');}
      clean[key(g,i)]={source:r.source,score:r.score,note:r.note,confirmed:r.confirmed,
        updatedAt:typeof r.updatedAt==='string'?r.updatedAt:'',confirmedAt:typeof r.confirmedAt==='string'?r.confirmedAt:''};
    }
    return clean;
  }
  function writebackRows(result,reviews,caseId){
    const groups=result.groups.filter(g=>g.caseId===caseId);
    if(!groups.length)throw new Error('请选择有效题号。');
    const C=root.CompareCore;
    const columns=(result.modelColumns||groups.map(g=>({model:g.model,label:g.model+'-人评'}))).filter(c=>groups.some(g=>g.model===c.model));
    const models=columns.map(c=>c.model);
    const missingModels=models.filter(m=>!groups.some(g=>g.model===m&&!g.bothEmpty));
    if(missingModels.length)throw new Error('本题有缺失的模型标注，请补齐来源后导出：'+missingModels.join('、'));
    const pending=groups.flatMap(g=>g.items.filter(i=>!['same','single'].includes(i.status)&&outcome(reviews,g,i).status!=='已确认').map(i=>g.model+' / '+i.id));
    if(pending.length)throw new Error(`本题还有 ${pending.length} 个差异或缺项维度未确认，请先完成核实。${pending.slice(0,3).join('；')}`);
    const documents=models.map(model=>{
      const g=groups.find(g=>g.model===model),base=g.b||g.a;
      if(!base||!g.items.length)throw new Error(`${model} 缺少完整标注，不能生成写回文件。`);
      const doc=structuredClone(base);
      if(doc.source_model){doc.model=doc.source_model;delete doc.source_model;}
      doc.criteria=g.items.map(i=>{
        const c=structuredClone(i.b||i.a);
        const r=get(reviews,g,i);
        c.score=validate(r,i);
        if(!['same','single'].includes(i.status)||r?.note?.trim())c.note=r.note;
        c.status='scored';
        return c;
      });
      // Reparse with the same human-eval validator used for original sheet cells.
      C.parse(JSON.stringify(doc));
      return JSON.stringify(doc);
    });
    return [['题目ID',...columns.map(c=>c.label)],[caseId,...documents]];
  }
  function toCSV(rows){
    return '\ufeff'+rows.map(row=>row.map(value=>{
      let s=String(value??'');
      if(typeof value!=='number'&&/^[\s]*[=+\-@]/.test(s))s="'"+s;
      return '"'+s.replace(/"/g,'""')+'"';
    }).join(',')).join('\r\n');
  }
  const api={key,source,get,score,validate,finalScore,outcome,originalReason,importReviews,writebackRows,toCSV};
  root.AuditCore=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
}(typeof globalThis!=='undefined'?globalThis:this));
