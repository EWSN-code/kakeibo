// kakeibo planning v1.9.1 regression tests; node --test tests/planning-v19.test.cjs
'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(ROOT,'planning.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script><\/body>/)?.[1];
assert.ok(script,'planning UI script exists');
const start=script.indexOf('/* kakeibo v1.9.1 planning workspace');
assert.ok(start>0,'the pure calculation engine precedes the UI');
const scope={window:{},module:{exports:{}}};
vm.runInNewContext(script.slice(0,start),scope);
const C=scope.module.exports;
const months=C.monthsBetween('2026-04','2027-03');
const make=()=>({
 format:'kakeibo-planning',schemaVersion:1,revision:0,demo:false,
 title:'検証計画',fromYM:'2026-04',toYM:'2027-03',activeScenario:'base',
 months:months.map(ym=>({ym,phase:ym<'2026-10'?'actual':ym==='2026-10'?'open':'forecast',
  actualNet:ym<='2026-10'?0:null,source:'家計簿連動',note:''})),
 scenarios:[{id:'base',name:'基本案',description:'',reserve:0,groups:[],
  flows:Object.fromEntries(months.map(ym=>[ym,{mode:'net',net:0,income:null,expense:null}]))}]
});
const item=(id,amount,recognition='extra',month='2026-12')=>({
 id,title:id,unit:amount,qty:1,recognition,month,remaining:0,actualAmount:0,status:'planned',note:''
});
const group=(id,kind,items)=>({
 id,title:id,kind,icon:'plan',enabled:true,priority:2,note:'',selected:'base',
 variants:[{id:'base',name:'基本案',items}]
});
test('blank production plan passes validation, sample data is absent',()=>{
 assert.equal(C.validateProject(make()),true);
 assert.doesNotMatch(html,/kakeibo\.planning\.mock\.v03/);
 assert.doesNotMatch(html,/"title"\s*:\s*"母用PC・タブレット"/);
});
test('old mock export cannot silently replace the production plan',()=>{
 const p=make();p.schemaVersion=3;p.format='kakeibo-planning-mock';
 assert.throws(()=>C.validateProject(p),/v1\.9/);
});
test('economic surplus uses actual + forecast + income - expense - reserve',()=>{
 const p=make(),s=p.scenarios[0];p.months[6].actualNet=10000;
 s.flows['2026-11'].net=25000;s.reserve=5000;
 s.groups=[group('bonus','income',[item('extra_income',100000)]),group('pc','expense',[item('cpu',40000)])];
 const r=C.calculate(p,s);
 assert.equal(r.extraIncome,100000);assert.equal(r.extraExpense,40000);
 assert.equal(r.margin,90000);
});
test('monthly-included, recorded, and pending items do not double count',()=>{
 const p=make(),s=p.scenarios[0];
 s.groups=[group('pc','expense',[
  item('planned',10000),item('in_monthly',20000,'embedded'),
  item('in_actual',30000,'recorded'),item('unverified',40000,'hold')
 ])];
 const r=C.calculate(p,s);assert.equal(r.extraExpense,10000);assert.equal(r.holdCount,1);
});
test('partial recognition counts only the remaining amount',()=>{
 const p=make(),a=item('keyboard',20000,'partial');a.remaining=6000;a.actualAmount=14000;
 p.scenarios[0].groups=[group('pc','expense',[a])];
 assert.equal(C.calculate(p,p.scenarios[0]).extraExpense,6000);
});
test('postponed purchase retained outside the period',()=>{
 const p=make();p.scenarios[0].groups=[group('pc','expense',[item('later',12000,'extra','2027-06')])];
 const r=C.calculate(p,p.scenarios[0]);
 assert.equal(r.extraExpense,0);assert.equal(r.outsideExpense,12000);
});
test('scenario copies are independent',()=>{
 const p=make();p.scenarios[0].groups=[group('pc','expense',[item('cpu',40000)])];
 const copy=C.clone(p.scenarios[0]);copy.id='economy';copy.groups[0].variants[0].items[0].unit=15000;
 p.scenarios.push(copy);assert.equal(C.calculate(p,p.scenarios[0]).extraExpense,40000);
 assert.equal(C.calculate(p,p.scenarios[1]).extraExpense,15000);
});
test('unfilled months are flagged, and negative cash-free surplus remains negative',()=>{
 const p=make();p.scenarios[0].flows['2026-11'].net=null;p.months[0].actualNet=-420000;
 const r=C.calculate(p,p.scenarios[0]);assert.ok(r.unknownCount>0);assert.equal(r.actual,-420000);
});
test('ledger adapter excludes transfers and card settlements',()=>{
 const source=fs.readFileSync(path.join(ROOT,'src/app/85_planning_bridge.part.js'),'utf8');
 const start=source.indexOf('function planningActualMonths'),end=source.indexOf('function renderPlanning',start);
 assert.ok(start>=0&&end>start);
 const M={ymIndex:ym=>Number(ym.slice(0,4))*12+Number(ym.slice(5))-1,
  idxToYM:n=>Math.floor(n/12)+'-'+String(n%12+1).padStart(2,'0')};
 const transactions=[
  {date:'2026-10-02',kind:'income',lines:[{ref:'cat:inc>給与',amount:-100000}]},
  {date:'2026-10-03',kind:'expense',lines:[{ref:'cat:exp>食費',amount:10000},{ref:'adj:unmanaged_point',amount:-2000}]},
  {date:'2026-10-04',kind:'income',lines:[{ref:'cat:inc>特典利用',amount:-1000}]},
  {date:'2026-10-05',kind:'refund',lines:[{ref:'cat:exp>食費',amount:-1000}]},
  {date:'2026-11-27',kind:'card_payment',lines:[{ref:'acc:card',amount:10000},{ref:'acc:bank',amount:-10000}]}
 ];
 const fn=new Function('state','M',source.slice(start,end)+';return planningActualMonths;')({transactions},M);
 const r=fn('2026-10','2026-11');assert.equal(r['2026-10'].net,94000);
 assert.equal(r['2026-11'].net,null);
});
test('app bundle is byte-identical with ordered sources and manifest SHA',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(ROOT,'src/app/manifest.json'),'utf8'));
 const buf=Buffer.concat(m.parts.map(p=>fs.readFileSync(path.join(ROOT,'src/app',p.file))));
 assert.deepEqual(buf,fs.readFileSync(path.join(ROOT,'app.js')));
 assert.equal(crypto.createHash('sha256').update(buf).digest('hex'),m.bundle_sha256);
 assert.equal(m.version,'v1.9.1');
 new vm.Script(fs.readFileSync(path.join(ROOT,'model.js'),'utf8'));
 new vm.Script(fs.readFileSync(path.join(ROOT,'app.js'),'utf8'));
 new vm.Script(script);
});