  /* ============ 資金計画 v1.9.0：実績読み取り専用 / 計画だけ保存 ============ */
  function planningActualMonths(fromYM,toYM) {
    const from=M.ymIndex(fromYM),to=M.ymIndex(toYM);
    if(!Number.isInteger(from)||!Number.isInteger(to)||to<from||to-from>59)
      throw new Error('計画期間は1〜60か月で指定してください');
    const out=Object.create(null);
    for(let n=from;n<=to;n++){
      const ym=M.idxToYM(n);
      out[ym]={ym,income:0,grossExpense:0,unmanagedPoint:0,expense:0,net:null,recordedTransactions:0};
    }
    for(const t of state.transactions){
      const ym=String(t.date||'').slice(0,7),v=out[ym];
      if(!v)continue;
      let relevant=false;
      for(const ln of t.lines||[]){
        const ref=String(ln.ref||''),amount=Number(ln.amount)||0;
        if(ref.startsWith('cat:inc>')){v.income-=amount;relevant=true;}
        else if(ref.startsWith('cat:exp>')){v.grossExpense+=amount;relevant=true;}
        else if(ref==='adj:unmanaged_point'&&amount<0){v.unmanagedPoint-=amount;relevant=true;}
      }
      if(relevant)v.recordedTransactions++;
    }
    for(const v of Object.values(out)){
      v.expense=v.grossExpense-v.unmanagedPoint;
      if(v.recordedTransactions>0)v.net=Math.round(v.income-v.expense);
    }
    return out;
  }
  function renderPlanning(){
    const frame=$('#planning-frame');
    if(!frame)return;
    if(!frame.dataset.loaded){
      frame.dataset.loaded='1';
      frame.setAttribute('src','./planning.html');
    }else{
      try{frame.contentWindow?.PlanningUI?.refreshActuals?.();}catch(e){console.error('資金計画の実績更新に失敗',e);}
    }
  }
  window.KakeiboPlanningBridge=Object.freeze({
    load(){
      return {plan:state.planning?JSON.parse(JSON.stringify(state.planning)):null};
    },
    actuals(fromYM,toYM){
      return planningActualMonths(fromYM,toYM);
    },
    save(draft,expectedRevision){
      if(!draft||draft.format!=='kakeibo-planning'||draft.schemaVersion!==1||
        draft.demo!==false||!Array.isArray(draft.months)||!Array.isArray(draft.scenarios)||
        !draft.scenarios.length||draft.scenarios.length>12)
        throw new Error('資金計画のデータ形式が正しくありません');
      const revision=Number(state.planning?.revision||0);
      if(!Number.isSafeInteger(expectedRevision)||expectedRevision!==revision)
        throw new Error('別の画面で資金計画が変更されました。再読込する前にJSONへ退避してください');
      // The existing cloud adapter upserts the whole kakeibo state. This lease only
      // catches concurrent saves visible in this browser's localStorage.
      try{
        const local=localStorage.getItem('kakeibo_v0_state');
        if(local){
          const disk=JSON.parse(local),diskRev=Number(disk?.planning?.revision||0);
          if(diskRev>revision)throw new Error('別タブの新しい計画が見つかりました。上書きを停止します');
        }
      }catch(e){throw new Error('保存前の整合性を確認できません：'+e.message);}
      const next=JSON.parse(JSON.stringify(draft));
      if(JSON.stringify(next).length>2000000)throw new Error('計画データが大きすぎます（上限2MB）');
      for(const month of next.months){
        if(month.source==='家計簿連動')month.actualNet=null;
      }
      next.revision=revision+1;
      state.planning=next;
      persist();
      return {revision:next.revision};
    },
    resize(px){
      const frame=$('#planning-frame'),height=Number(px);
      if(frame&&Number.isFinite(height))
        frame.style.height=Math.max(700,Math.min(16000,Math.ceil(height)+12))+'px';
    }
  });

