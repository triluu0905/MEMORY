import { installTranslations, language, languageMapping, setLanguage, translateText } from './i18n';

declare global {
  interface Element { readonly dataset: DOMStringMap }
  interface Window {
    MemoryAuth: {
      session(): { id: string; email: string; name: string; lab: string; language: 'vi' | 'en' } | null;
      update(changes: { name: string; lab: string; language?: 'vi' | 'en' }): Promise<{ name: string; lab: string; language: 'vi' | 'en' }>;
      logout(): Promise<void>;
    };
    MemoryWorkspace: {
      initial: unknown;
      workspaceId: string | null;
      role: 'owner' | 'editor' | 'viewer';
      onStatus: (message: string, failed?: boolean) => void;
      save(data: unknown): void;
      flush(): Promise<boolean>;
      hasPending(): boolean;
      upload(file: File): Promise<{ id: string; name: string; size: number; src?: string }>;
      remove(id: string): Promise<void>;
      url(id: string): string;
      sampleHistory(id: string): Promise<{ id: string; sample_code: string; actor_id: string | null; actor_name: string; type: 'created' | 'edited' | 'deleted'; changes: { field: string; before: string; after: string }[]; created_at: string }[]>;
    };
  }
}

(function(){
'use strict';
/* ---------- constants ---------- */
var SESS=window.MemoryAuth.session()!;
var STORE=window.MemoryWorkspace;
var U={
 amt:['g','mg','µg','kg','L','mL','µL','mol','mmol','giọt'],
 conc:['M','mM','µM','% w/v','% v/v','g/L','mg/mL','ppm'],
 temp:['°C','K','°F'],
 time:['s','min','h','ngày'],
 pres:['atm','bar','kPa','Pa','mmHg'],
 mass:['g','mg','µg','kg','L','mL','µL']
};
var COND=[['pH','pH',null,'pH'],['temp','Nhiệt độ','temp','T'],['time','Thời gian','time','t'],['hum','Độ ẩm','%','RH'],['pres','Áp suất','pres','P']];
var ATOM={H:1.008,He:4.0026,Li:6.94,Be:9.0122,B:10.81,C:12.011,N:14.007,O:15.999,F:18.998,Ne:20.180,Na:22.990,Mg:24.305,Al:26.982,Si:28.085,P:30.974,S:32.06,Cl:35.45,Ar:39.948,K:39.098,Ca:40.078,Ti:47.867,Cr:51.996,Mn:54.938,Fe:55.845,Co:58.933,Ni:58.693,Cu:63.546,Zn:65.38,Br:79.904,Rb:85.468,Sr:87.62,Ag:107.87,Sn:118.71,I:126.90,Ba:137.33,Pt:195.08,Au:196.97,Hg:200.59,Pb:207.2};

/* ---------- utils ---------- */
var $=function(id: string): any{return document.getElementById(id)};
var uid=function(){return Math.random().toString(36).slice(2,9)};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function num(v){var n=parseFloat(String(v).replace(',','.'));return isFinite(n)?n:null}
function fmt(n,d=2){if(n==null||!isFinite(n))return '—';d=d==null?2:d;var s=(+n).toFixed(d);return s.replace(/\.?0+$/,'')||'0'}
function today(o=0){var t=new Date();t.setDate(t.getDate()-o);return t.toISOString().slice(0,10)}
function fdate(s){if(!s)return '';var t=new Date(s+'T00:00');return t.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})}
var toastTimer: ReturnType<typeof setTimeout>;
function toast(m){var t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.classList.remove('on')},2200)}
function setPath(o,p,v){var k=p.split('.');for(var i=0;i<k.length-1;i++){if(o[k[i]]==null||typeof o[k[i]]!=='object')o[k[i]]={};o=o[k[i]]}o[k[k.length-1]]=v}
function getPath(o,p){return p.split('.').reduce(function(a,k){return a==null?a:a[k]},o)}
function opts(list,sel){return list.map(function(u){return '<option'+(u===sel?' selected':'')+'>'+esc(u)+'</option>'}).join('')}
function ext(n){var m=/\.([a-z0-9]+)$/i.exec(n||'');return m?m[1].slice(0,4):'file'}
function toC(v,u){if(v==null)return null;return u==='K'?v-273.15:u==='°F'?(v-32)*5/9:v}
function toMin(v,u){if(v==null)return null;return u==='s'?v/60:u==='h'?v*60:u==='ngày'?v*1440:v}
function toAtm(v,u){if(v==null)return null;return u==='bar'?v/1.01325:u==='kPa'?v/101.325:u==='Pa'?v/101325:u==='mmHg'?v/760:v}
var MASSF={kg:1000,g:1,mg:1e-3,'µg':1e-6,L:1000,mL:1,'µL':1e-3};
var isVol=function(u){return /L$/.test(u)};

/* ---------- workspace state ---------- */
function step(o: any = {}){return Object.assign({id:uid(),procText:'',procFile:null,chems:[],cond:{},res:{},images:[],note:''},o)}
function chem(n,a,u){return {id:uid(),name:n,amount:a,unit:u}}
var S: any=STORE.initial||{user:{name:SESS.name,email:SESS.email,lab:SESS.lab||'',language:SESS.language||'vi'},projects:[],charts:[],open:{},log:[],weekly:Array(12).fill(0)};
S.user=S.user||{name:SESS.name,email:SESS.email,lab:SESS.lab||'',language:SESS.language||'vi'};
S.projects=Array.isArray(S.projects)?S.projects:[];
S.charts=Array.isArray(S.charts)?S.charts:[];
S.open=S.open&&typeof S.open==='object'?S.open:{};
S.log=Array.isArray(S.log)?S.log:[];
S.weekly=Array.isArray(S.weekly)&&S.weekly.length===12?S.weekly:Array(12).fill(0);
function normalizeProject(p){p.name=typeof p.name==='string'?p.name:'Dự án';p.status=p.status||'running';p.updated=p.updated||today();p.children=Array.isArray(p.children)?p.children:[];p.samples=Array.isArray(p.samples)?p.samples:[];p.samples.forEach(function(sm){sm.code=sm.code||'Mẫu';sm.steps=Array.isArray(sm.steps)?sm.steps:[];sm.steps.forEach(function(st){st.chems=Array.isArray(st.chems)?st.chems:[];st.images=Array.isArray(st.images)?st.images:[];st.cond=st.cond||{};st.res=st.res||{};st.procText=st.procText||'';st.note=st.note||''})});p.children.forEach(normalizeProject)}
S.projects=S.projects.filter(function(p){return p&&typeof p==='object'});S.projects.forEach(normalizeProject);
S.user.name=SESS.name||S.user.name;S.user.email=SESS.email;S.user.language=SESS.language||'vi';
walk(S.projects,function(p){p.samples.forEach(function(s){s.steps.forEach(function(st,i){if(!st.date)st.date=p.updated||today();if(!st.upd&&p.updated)st.upd=new Date(p.updated+'T00:00').getTime()+(9+i*3)*36e5})})});
var saveT;
STORE.onStatus=function(message,failed){$('saved').textContent=message;$('saved').style.color=failed?'#C1654E':'';$('saved').style.cursor=failed?'pointer':''};
function save(){clearTimeout(saveT);saveT=setTimeout(function(){saveT=null;STORE.save(S)},350)}
function logA(m,p){S.log.unshift({t:Date.now(),m:m,p:p});S.log=S.log.slice(0,30)}

/* ---------- tree helpers ---------- */
function walk(list:any[],fn:(p:any,depth:number,parent?:any)=>void,depth=0,parent?:any){(list||[]).forEach(function(p){fn(p,depth,parent);walk(p.children,fn,depth+1,p)})}
function all(){var a=[];walk(S.projects,function(p){a.push(p)});return a}
function findP(id){var r=null;walk(S.projects,function(p){if(p.id===id)r=p});return r}
function parentOf(id){var r=null;walk(S.projects,function(p,d,par){if(p.id===id)r=par});return r}
function pathOf(id){var r=[];(function f(list,acc){(list||[]).forEach(function(p){var a=acc.concat(p);if(p.id===id)r=a;f(p.children,a)})})(S.projects,[]);return r}
function codeOf(p){var path=pathOf(p.id),s='P';path.forEach(function(x,i){var sib=i===0?S.projects:path[i-1].children;var k=sib.indexOf(x);s+=i===0?(k+1):String.fromCharCode(97+k)});return s}
function findStep(id){var r=null;walk(S.projects,function(p){p.samples.forEach(function(s){s.steps.forEach(function(st){if(st.id===id)r={p:p,s:s,st:st}})})});return r}
function finalYield(s){for(var i=s.steps.length-1;i>=0;i--){var y=num(s.steps[i].res&&s.steps[i].res.yield);if(y!=null)return y}return null}
function condVal(s,k){for(var i=0;i<s.steps.length;i++){var c=s.steps[i].cond||{};if(k==='pH'){var v=num(c.pH);if(v!=null)return v}else if(c[k]&&num(c[k].v)!=null){var n=num(c[k].v);return k==='temp'?toC(n,c[k].u):k==='time'?toMin(n,c[k].u):k==='pres'?toAtm(n,c[k].u):n}}return null}
function countSteps(){var n=0;walk(S.projects,function(p){p.samples.forEach(function(s){n+=s.steps.length})});return n}
function touch(p){p.updated=today(0)}

/* ---------- routing ---------- */
var route={v:'menu',id:null};
function parse(){var h=location.hash.replace(/^#\/?/,'').split('/');route={v:h[0]||'menu',id:h[1]||null};if(['menu','project','calc','chart','export'].indexOf(route.v)<0)route.v='menu'}
function go(v,id: string|null=null){location.hash='#/'+v+(id?'/'+id:'')}
addEventListener('hashchange',function(){closeHistory();parse();render()});

/* ---------- sidebar ---------- */
function renderTree(){
 function node(p){var on=route.v==='project'&&route.id===p.id;
  return '<div class="tn'+(on?' on':'')+'" data-pid="'+p.id+'" title="Nhấp đúp để đổi tên"><i class="dot'+(p.status==='done'?' done':'')+'"></i><span class="nm">'+esc(p.name)+'</span><span class="ac"><button data-act="addChild" data-pid="'+p.id+'" aria-label="Thêm dự án con"><svg class="i"><use href="#i-plus"/></svg></button><button data-act="renameTree" data-pid="'+p.id+'" aria-label="Đổi tên"><svg class="i"><use href="#i-edit"/></svg></button></span></div>'+(p.children&&p.children.length?'<div class="tree">'+p.children.map(node).join('')+'</div>':'')}
 $('tree').innerHTML=S.projects.map(node).join('')+'<button class="addp" data-act="addRoot"><svg class="i" style="width:14px;height:14px"><use href="#i-plus"/></svg>Dự án mới</button>';
 var open=S.open.tree!==false;$('tree').classList.toggle('open',open);$('nvProject').classList.toggle('open',open);
 document.querySelectorAll<HTMLElement>('.nv[data-go]').forEach(function(b){b.classList.toggle('on',b.dataset.go===route.v)});
 $('nvProject').classList.toggle('on',route.v==='project');
}
function startRename(pid,el){var p=findP(pid);if(!p)return;var nm=el.querySelector('.nm');if(!nm)return;var inp=document.createElement('input');inp.value=p.name;nm.replaceWith(inp);inp.focus();inp.select();
 var done=function(ok){if(ok&&inp.value.trim()){p.name=inp.value.trim();touch(p);save()}renderTree();if(route.v==='project')render()};
 inp.addEventListener('keydown',function(e){if(e.key==='Enter')done(true);if(e.key==='Escape')done(false)});inp.addEventListener('blur',function(){done(true)})}
$('tree').addEventListener('click',function(e){var b=(e.target as HTMLInputElement).closest('[data-act]');if(b)return;var n=(e.target as HTMLInputElement).closest('.tn');if(n&&!(e.target as HTMLInputElement).closest('input')){go('project',n.dataset.pid);closeSide()}});
$('tree').addEventListener('dblclick',function(e){var n=(e.target as HTMLInputElement).closest('.tn');if(n)startRename(n.dataset.pid,n)});

/* ---------- topbar ---------- */
function crumb(parts){$('crumb').innerHTML=parts.map(function(p,i){return (i?'<svg class="i"><use href="#i-right"/></svg>':'')+(i===parts.length-1?'<b>'+esc(p)+'</b>':'<span>'+esc(p)+'</span>')}).join('')}
function renderUser(){var n=S.user.name||'Người dùng';$('topName').textContent=n;$('upName').textContent=n;$('upAv').textContent=n.trim().charAt(0).toUpperCase();$('upLab').textContent=S.user.lab?'researcher · '+S.user.lab:'researcher'}
function notifs(){var a=[];walk(S.projects,function(p){p.samples.forEach(function(s){if(finalYield(s)==null&&s.steps.some(function(x){return x.chems.length}))a.push({c:'var(--amber)',h:'Mẫu <b>'+esc(s.code)+'</b> chưa có kết quả',s:esc(p.name),p:p.id})})});
 a.push({c:'var(--cyan)',h:'Sao lưu tự động hoàn tất',s:'Dữ liệu được lưu trên máy chủ'});
 a.push({c:'var(--g500)',h:'Mẹo: nhấn <b>/</b> để tìm kiếm nhanh',s:'Phím tắt'});return a}
var memberEvents:any[]=[];
function renderBell(){var a:any[]=memberEvents.map(function(e){return {c:'var(--cyan)',h:'<b>'+esc(e.name||e.email||'Một thành viên')+'</b> '+(e.type==='member_joined'?'đã tham gia':'đã thay đổi thành viên'),s:new Date(e.created_at).toLocaleString('vi-VN')};}).concat(notifs());$('bn').textContent=a.length;$('npop').innerHTML='<h4>Thông báo</h4>'+a.map(function(n){return '<div'+(n.p?' data-goP="'+n.p+'" style="cursor:pointer"':'')+'><i style="background:'+n.c+'"></i><span>'+n.h+'<br><small>'+n.s+'</small></span></div>'}).join('')}
if(STORE.workspaceId)fetch('/api/workspaces/'+encodeURIComponent(STORE.workspaceId)+'/activities',{credentials:'same-origin'}).then(function(r){return r.ok?r.json():null}).then(function(v){if(v&&Array.isArray(v.activities)){memberEvents=v.activities;renderBell()}}).catch(function(){});
$('bell').onclick=function(e){e.stopPropagation();renderBell();$('npop').classList.toggle('on');$('upop').classList.remove('on')};
$('npop').addEventListener('click',function(e){var d=(e.target as HTMLInputElement).closest('[data-goP]');if(d){go('project',d.getAttribute('data-goP'));$('npop').classList.remove('on')}});
$('avBtn').onclick=function(e){e.stopPropagation();$('upop').classList.toggle('on');$('npop').classList.remove('on')};
document.addEventListener('click',function(e){if(!(e.target as HTMLInputElement).closest('#upop'))$('upop').classList.remove('on');if(!(e.target as HTMLInputElement).closest('#npop'))$('npop').classList.remove('on');if(!(e.target as HTMLInputElement).closest('.srch'))$('sres').classList.remove('on')});

/* search */
var hits=[],hi=0;
$('q').addEventListener('input',function(){var q=this.value.trim().toLowerCase();if(!q){$('sres').classList.remove('on');return}
 hits=[];walk(S.projects,function(p){if(p.name.toLowerCase().indexOf(q)>-1)hits.push({ty:'Dự án',t:p.name,s:codeOf(p),p:p.id});
  p.samples.forEach(function(s){if(s.code.toLowerCase().indexOf(q)>-1)hits.push({ty:'Mẫu',t:s.code,s:p.name,p:p.id,sid:s.id});
   s.steps.forEach(function(st,i){st.chems.forEach(function(c){if((c.name||'').toLowerCase().indexOf(q)>-1)hits.push({ty:'Hóa chất',t:c.name,s:p.name+' · '+s.code+' / bước '+(i+1),p:p.id,sid:s.id})});
    if((st.note+' '+st.procText).toLowerCase().indexOf(q)>-1)hits.push({ty:'Ghi chú',t:(st.note||st.procText).slice(0,60),s:p.name+' · '+s.code,p:p.id,sid:s.id})})})});
 hits=hits.slice(0,12);hi=0;drawHits();$('sres').classList.add('on')});
function drawHits(){$('sres').innerHTML=hits.length?hits.map(function(h,i){return '<button data-i="'+i+'" class="'+(i===hi?'hi':'')+'"><span class="ty">'+h.ty+'</span><span><b>'+esc(h.t)+'</b><small>'+esc(h.s)+'</small></span></button>'}).join(''):'<div class="none">Không tìm thấy kết quả.</div>'}
function pickHit(h){$('sres').classList.remove('on');$('q').value='';go('project',h.p);if(h.sid)setTimeout(function(){var r=document.querySelector<any>('tr[data-sid="'+h.sid+'"]');if(r){r.scrollIntoView({block:'center',behavior:'smooth'});document.querySelectorAll<HTMLElement>('tr[data-sid="'+h.sid+'"]').forEach(function(x){x.classList.remove('flash');void x.offsetWidth;x.classList.add('flash')})}},80)}
$('sres').addEventListener('click',function(e){var b=(e.target as HTMLInputElement).closest('button');if(b)pickHit(hits[+b.dataset.i])});
$('q').addEventListener('keydown',function(e){if(!hits.length)return;if(e.key==='ArrowDown'){hi=(hi+1)%hits.length;drawHits();e.preventDefault()}if(e.key==='ArrowUp'){hi=(hi-1+hits.length)%hits.length;drawHits();e.preventDefault()}if(e.key==='Enter')pickHit(hits[hi]);if(e.key==='Escape'){$('sres').classList.remove('on');this.blur()}});
var gk=0;
addEventListener('keydown',function(e){if(e.key==='Escape'&&$('scrim').classList.contains('on')){closeDlg();return}var tag=document.activeElement.tagName;if(/INPUT|TEXTAREA|SELECT/.test(tag))return;
 if(e.key==='/'){e.preventDefault();$('q').focus();return}
 if(e.key==='g'){gk=Date.now();return}
 if(Date.now()-gk<900){var m={m:'menu',c:'calc',h:'chart',e:'export'}[e.key];if(m)go(m);gk=0}});

/* mobile side */
function closeSide(){$('side').classList.remove('on');$('sidescrim').classList.remove('on')}
$('burger').onclick=function(){$('side').classList.add('on');$('sidescrim').classList.add('on')};
$('sidescrim').onclick=closeSide;

/* ---------- MAIN MENU ---------- */
var MOL='<svg class="mol" viewBox="0 0 420 240" fill="none" stroke="#fff" stroke-width="1.5"><g><polygon points="250,40 285,60 285,100 250,120 215,100 215,60"/><polygon points="285,100 320,120 320,160 285,180 250,160 250,120"/><line x1="222" y1="64" x2="222" y2="96"/><line x1="292" y1="124" x2="313" y2="136"/><line x1="285" y1="60" x2="320" y2="40"/><line x1="320" y1="40" x2="355" y2="60"/><line x1="320" y1="40" x2="320" y2="6"/><line x1="326" y1="40" x2="326" y2="8"/><line x1="320" y1="160" x2="355" y2="180"/><line x1="355" y1="180" x2="390" y2="160"/><circle cx="355" cy="60" r="4" fill="#fff"/><circle cx="390" cy="160" r="4" fill="#fff"/><circle cx="215" cy="60" r="3"/></g><text x="355" y="76" font-family="Be Vietnam Pro" font-size="11" fill="#fff" stroke="none">OH</text><text x="395" y="176" font-family="Be Vietnam Pro" font-size="11" fill="#fff" stroke="none">CH₃</text></svg>';
function vMenu(){
 crumb(['Không gian làm việc','Tổng quan']);
 var ps=all(),done=ps.filter(function(p){return p.status==='done'}).length,run=ps.length-done,h=new Date().getHours();
 var greet=h<11?'Chào buổi sáng':h<14?'Chào buổi trưa':h<18?'Chào buổi chiều':'Chào buổi tối';
 var samples=0,yl=[];walk(S.projects,function(p){samples+=p.samples.length;p.samples.forEach(function(s){var y=finalYield(s);if(y!=null)yl.push(y)})});
 var avg=yl.length?yl.reduce(function(a,b){return a+b},0)/yl.length:null;
 var el=function(z,sym,v,lb,c,c2,pct,ft){return '<div class="el'+(z?'':' no-z')+'">'+(z?'<span class="z">'+z+'</span>':'')+'<span class="sym" style="background:'+c2+';color:'+c+'">'+sym+'</span><div class="v">'+v+'</div><div class="lb">'+lb+'</div><div class="pb"><i style="width:'+pct+'%;background:'+c+'"></i></div>'+(ft?'<div class="ft">'+ft+'</div>':'')+'</div>'};
 var leaves=ps.filter(function(p){return p.samples.length});
 var bars=leaves.map(function(p){var y=p.samples.map(finalYield).filter(function(v){return v!=null});return {n:p.name,c:codeOf(p),v:y.length?y.reduce(function(a,b){return a+b},0)/y.length:null}}).filter(function(b){return b.v!=null});
 var mx=Math.max.apply(null,bars.map(function(b){return b.v}).concat([1]));
 return '<div class="view">'+
 '<section class="hello">'+MOL+'<div style="position:relative"><span class="tagm">'+new Date().toLocaleDateString('vi-VN',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'})+'</span><h1>'+greet+', '+esc(S.user.name)+'.</h1><p><b>'+run+'</b> dự án đang thực hiện.</p></div>'+
 '<div class="meta"><div>Mẫu<b>'+samples+'</b></div><div>Bước<b>'+countSteps()+'</b></div><div>Hiệu suất TB<b>'+(avg==null?'—':fmt(avg,1)+'%')+'</b></div></div></section>'+
 '<div class="mm"><div class="mmL">'+
 '<div class="stats">'+el('','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M8 13h8M8 16h5"/></svg>',ps.length,'Dự án','var(--g700)','var(--g100)',100,ps.length?'<span>'+S.projects.length+' gốc · '+(ps.length-S.projects.length)+' con</span>':'')+
  el('02','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m7.5 12.5 3 3 6-6.5"/></svg>',done,'Đã hoàn thành','#2E9E73','#E2F5EC',ps.length?done/ps.length*100:0,'<span>Tỷ lệ</span><span>'+(ps.length?Math.round(done/ps.length*100):0)+'%</span>')+
  el('03','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/><path d="M12 7.5V12l3 2"/></svg>',run,'Đang thực hiện','var(--amber)','var(--amber2)',ps.length?run/ps.length*100:0,'<span>Tỷ lệ</span><span>'+(ps.length?Math.round(run/ps.length*100):0)+'%</span>')+'</div>'+
 '<div class="charts"><div class="card"><div class="ch"><div><h3>Hoạt động thí nghiệm</h3><p>Bước mỗi tuần · 12 tuần</p></div><span class="tagm">n = '+S.weekly.reduce(function(a,b){return a+b},0)+'</span></div><div class="chart" id="cAct"><svg id="actSvg" height="230"></svg><div class="tip" id="actTip"></div></div></div>'+
 '<div class="card"><div class="ch"><div><h3>Hiệu suất trung bình</h3><p>Theo dự án có dữ liệu · %</p></div><span class="tagm">η̄</span></div><div class="hb">'+(bars.length?bars.map(function(b,i){return '<div class="r"><span title="'+esc(b.n)+'"><b class="mono" style="color:var(--g700);font-weight:600">'+b.c+'</b> '+esc(b.n)+'</span><div class="tr"><i style="width:'+(b.v/mx*100)+'%;animation-delay:'+(.2+i*.08)+'s"></i></div><b>'+fmt(b.v,1)+'</b></div>'}).join(''):'<p style="color:var(--soft);font-size:13px">Chưa có dữ liệu hiệu suất.</p>')+
 '<div class="legendrow" style="margin-top:6px"><span>Trung bình hiệu suất các mẫu trong từng dự án.</span></div></div></div></div>'+
 '</div><div class="mmR"><div class="tiles"><div>'+
  '<button class="tile" data-act="openFirst"><svg class="art" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M38 8h24M42 8v26L20 78a8 8 0 0 0 7 12h46a8 8 0 0 0 7-12L58 34V8"/><path d="M28 62h44" stroke-dasharray="4 4"/><circle cx="44" cy="72" r="4"/><circle cx="58" cy="66" r="3"/><circle cx="52" cy="52" r="2"/></svg><span class="ic"><svg class="i"><use href="#i-flask"/></svg></span><span><b>Dự án</b><small>'+ps.length+' dự án · '+samples+' mẫu</small></span><svg class="go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>'+
  '<button class="tile alt" data-go="chart"><svg class="art" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 88h82M10 88V10"/><path d="M14 74c10-2 14-22 24-22s12 16 22 14 12-34 30-44"/><circle cx="38" cy="52" r="3.5"/><circle cx="60" cy="66" r="3.5"/><circle cx="90" cy="22" r="3.5"/><path d="M10 60h4M10 36h4"/></svg><span class="ic"><svg class="i"><use href="#i-chart"/></svg></span><span><b>Biểu đồ</b><small>TPC · DPPH · Kinetics</small></span><svg class="go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div><div>'+
  '<button class="tile alt" data-go="calc"><svg class="art" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="18" y="8" width="64" height="84" rx="10"/><rect x="28" y="18" width="44" height="18" rx="4"/><circle cx="34" cy="50" r="3"/><circle cx="50" cy="50" r="3"/><circle cx="66" cy="50" r="3"/><circle cx="34" cy="64" r="3"/><circle cx="50" cy="64" r="3"/><circle cx="66" cy="64" r="3"/><circle cx="34" cy="78" r="3"/><path d="M46 78h24"/></svg><span class="ic"><svg class="i"><use href="#i-calc"/></svg></span><span><b>Tính toán</b><small>'+CALCS.length+' công cụ hóa học</small></span><svg class="go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>'+
  '<button class="tile" data-go="export"><svg class="art" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M26 8h34l20 20v56a8 8 0 0 1-8 8H26a8 8 0 0 1-8-8V16a8 8 0 0 1 8-8z"/><path d="M60 8v20h20"/><path d="M50 42v32M38 62l12 12 12-12"/></svg><span class="ic"><svg class="i"><use href="#i-export"/></svg></span><span><b>Xuất dữ liệu</b></span><svg class="go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div></div>'+
 '<div class="card"><div class="ch"><div><h3>Hoạt động gần đây</h3><p>Nhật ký thay đổi</p></div></div><ul class="feed">'+S.log.slice(0,5).map(function(l){return '<li>'+esc(String(l.m||'').replace(/<\/?b>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>'))+'<span class="t">'+ago(l.t)+'</span></li>'}).join('')+'</ul></div>'+
 '</div></div></div>';
}
function drawAct(){var svg=$('actSvg');if(!svg)return;var W=svg.clientWidth||600,H=230,L=30,R=12,T=14,B=26,d=S.weekly.slice();d[d.length-1]=Math.max(d[d.length-1],0);
 var mx=Math.ceil(Math.max.apply(null,d)/4)*4+4,x=function(i){return L+i*(W-L-R)/(d.length-1)},y=function(v){return T+(H-T-B)*(1-v/mx)};
 var g='<defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1FB5BD" stop-opacity=".28"/><stop offset="1" stop-color="#1FB5BD" stop-opacity="0"/></linearGradient></defs>';
 for(var v=0;v<=mx;v+=mx/4)g+='<line class="gl" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'"/><text x="'+(L-8)+'" y="'+(y(v)+3)+'" text-anchor="end">'+v+'</text>';
 d.forEach(function(v,i){if(i%2===0||i===d.length-1)g+='<text x="'+x(i)+'" y="'+(H-6)+'" text-anchor="middle">'+(i===d.length-1?'nay':'T-'+(d.length-1-i))+'</text>'});
 var p='M'+x(0)+','+y(d[0]);for(var i=1;i<d.length;i++){var mxp=(x(i-1)+x(i))/2;p+=' C'+mxp+','+y(d[i-1])+' '+mxp+','+y(d[i])+' '+x(i)+','+y(d[i])}
 g+='<path d="'+p+' L'+x(d.length-1)+','+y(0)+' L'+x(0)+','+y(0)+'Z" fill="url(#ag)"/><path d="'+p+'" fill="none" stroke="#2E5C57" stroke-width="2.5" stroke-dasharray="2000" stroke-dashoffset="2000"><animate attributeName="stroke-dashoffset" to="0" dur="1.4s" fill="freeze" calcMode="spline" keySplines=".4 0 .2 1"/></path>';
 d.forEach(function(v,i){g+='<circle cx="'+x(i)+'" cy="'+y(v)+'" r="'+(i===d.length-1?5:3)+'" fill="'+(i===d.length-1?'#1FB5BD':'#fff')+'" stroke="#2E5C57" stroke-width="2"/>'});
 g+='<rect x="0" y="0" width="'+W+'" height="'+H+'" fill="transparent" id="actHit"/>';
 svg.setAttribute('viewBox','0 0 '+W+' '+H);svg.innerHTML=g;
 svg.onmousemove=function(e){var r=svg.getBoundingClientRect(),px=(e.clientX-r.left)*W/r.width,i=Math.max(0,Math.min(d.length-1,Math.round((px-L)/((W-L-R)/(d.length-1)))));var t=$('actTip');t.innerHTML=(i===d.length-1?'Tuần này':'Tuần T-'+(d.length-1-i))+'<br>'+d[i]+' bước';t.style.left=(6+x(i)*r.width/W)+'px';t.style.top=(4+y(d[i])*r.height/H)+'px';t.classList.add('on')};
 svg.onmouseleave=function(){$('actTip').classList.remove('on')}}

/* ---------- PROJECT ---------- */
function vProject(){
 var p=findP(route.id);if(!p){var f=S.projects[0];if(f){go('project',f.id)}return '<div class="view"><div class="card" style="padding:28px"><h2>Chưa có dự án</h2><p>Hãy tạo dự án đầu tiên để ghi lại thí nghiệm.</p><button class="btn pri" data-act="addRoot">Tạo dự án</button></div></div>'}
 var path=pathOf(p.id);crumb(['Dự án'].concat(path.map(function(x){return x.name})));
 var ns=p.samples.length,nst=p.samples.reduce(function(a,s){return a+s.steps.length},0),yl=p.samples.map(finalYield).filter(function(v){return v!=null});
 var h='<div class="view"><div class="phead"><div style="min-width:0;flex:1"><div class="tagm"><span class="code">'+codeOf(p)+'</span><span>Cập nhật '+fdate(p.updated)+'</span></div>'+
 '<input class="ptitle" id="ptitle" value="'+esc(p.name)+'" aria-label="Tên dự án">'+
 '<div class="pmeta"><span>Mẫu <b>'+ns+'</b></span><span>Bước <b>'+nst+'</b></span><span>Hiệu suất TB <b>'+(yl.length?fmt(yl.reduce(function(a,b){return a+b},0)/yl.length,1)+' %':'—')+'</b></span><span>Dự án con <b>'+p.children.length+'</b></span></div></div>'+
 '<div class="pact"><select class="sel stsel" id="pstatus" aria-label="Trạng thái"><option value="running"'+(p.status!=='done'?' selected':'')+'>● Đang thực hiện</option><option value="done"'+(p.status==='done'?' selected':'')+'>✓ Hoàn thành</option></select>'+
 '<button class="btn" data-act="addChild" data-pid="'+p.id+'"><svg class="i"><use href="#i-sub"/></svg>Thêm dự án con</button>'+
 '<button class="btn" data-act="csv"><svg class="i"><use href="#i-down"/></svg>Xuất CSV</button>'+
 '<button class="btn dg" data-act="delProject"><svg class="i"><use href="#i-trash"/></svg></button>'+
 '<button class="btn pri" data-act="addSample"><svg class="i"><use href="#i-plus"/></svg>Thêm mẫu</button></div></div>';
 if(p.children.length)h+='<div class="subs">'+p.children.map(function(c){return '<button data-goP="'+c.id+'"><i class="'+(c.status==='done'?'done':'')+'"></i><span class="mono" style="color:var(--g700);font-weight:600">'+codeOf(c)+'</span>'+esc(c.name)+'</button>'}).join('')+'</div>';
 h+='<div class="card" style="overflow:hidden">';
 if(!ns){h+='<div class="empty"><svg class="ill" viewBox="0 0 120 90" fill="none" stroke="#5E9C8F" stroke-width="1.5"><path d="M46 10h28M50 10v24L30 72a6 6 0 0 0 5 9h50a6 6 0 0 0 5-9L70 34V10"/><path d="M38 60h44" stroke-dasharray="3 3"/><circle cx="56" cy="68" r="3"/><circle cx="66" cy="63" r="2"/><circle cx="60" cy="50" r="1.5"/></svg><h3>Chưa có mẫu thí nghiệm</h3><p>'+(p.children.length?'Có '+p.children.length+' dự án con. Bạn vẫn có thể thêm mẫu tại đây.':'Thêm mẫu để ghi quy trình, hóa chất và kết quả.')+'</p><button class="btn pri" data-act="addSample"><svg class="i"><use href="#i-plus"/></svg>Thêm mẫu</button></div></div>';}
 else{
 h+='<div class="tblwrap"><table class="lab"><thead><tr>'+[['Mã mẫu','',1],['Bước','',1],['Ngày',''],['Quy trình',''],['Hóa chất',''],['Định lượng',''],['Nồng độ',''],['Điều kiện',''],['Kết quả',''],['Hình ảnh',''],['Ghi chú','']].map(function(c){return '<th'+(c[2]?' class="nar"':'')+'><span>'+c[0]+(c[1]?' <em>'+c[1]+'</em>':'')+'</span></th>'}).join('')+'</tr></thead><tbody>';
 p.samples.forEach(function(s){s.steps.forEach(function(st,i){h+='<tr data-sid="'+s.id+'">';
  if(i===0)h+='<td class="no" rowspan="'+s.steps.length+'"><input value="'+esc(s.code)+'" data-sample="'+s.id+'" aria-label="Mã mẫu"><button class="history-trigger" data-history="'+s.id+'" aria-label="'+(language()==='en'?'View history for sample ':'Xem lịch sử mẫu ')+esc(s.code)+'" title="Lịch sử chỉnh sửa">◷</button><div class="na"><button class="btn sm" data-act="addStep" data-sample="'+s.id+'">+ Bước</button><button class="btn sm dg" data-act="delSample" data-sample="'+s.id+'">Xóa</button></div></td>';
  h+='<td class="st">'+(i+1)+(s.steps.length>1?'<button class="x" data-act="delStep" data-step="'+st.id+'" aria-label="Xóa bước"><svg class="i" style="width:14px;height:14px"><use href="#i-trash"/></svg></button>':'')+'</td>';
  h+='<td class="dt">'+dateCell(st)+'</td>';
  h+='<td style="width:220px">'+procCell(st)+'</td>';
  h+='<td style="width:190px"><div class="chl">'+st.chems.map(function(c,k){return '<div class="chr"><input value="'+esc(c.name)+'" placeholder="+ Hóa chất '+(k+1)+'" data-step="'+st.id+'" data-path="chems.'+k+'.name"><button class="rm" data-act="delChem" data-step="'+st.id+'" data-k="'+k+'" aria-label="Xóa">×</button></div>'}).join('')+'<button class="addc" data-act="addChem" data-step="'+st.id+'">+ Hóa chất</button></div></td>';
  h+='<td style="width:150px"><div class="chl">'+st.chems.map(function(c,k){return '<div class="qr"><input value="'+esc(c.amount)+'" placeholder="0" inputmode="decimal" data-step="'+st.id+'" data-path="chems.'+k+'.amount"><select data-step="'+st.id+'" data-path="chems.'+k+'.unit">'+opts(U.amt,c.unit)+'</select></div>'}).join('')+(st.chems.length?'<div style="height:28px"></div>':'<div class="qcap"><span>—</span></div>')+'</div></td>';
  h+='<td style="width:190px">'+concSum(st)+'</td>';
  h+='<td style="width:230px">'+condSum(st)+'</td>';
  h+='<td style="width:230px">'+resSum(st)+'</td>';
  h+='<td style="width:170px">'+imgCell(st)+'</td>';
  h+='<td style="width:200px"><textarea class="ta" placeholder="Ghi chú" data-step="'+st.id+'" data-path="note">'+esc(st.note)+'</textarea></td>';
  h+='</tr>'})});
 h+='<tr class="addrow"><td colspan="11"><button class="btn" data-act="addSample"><svg class="i"><use href="#i-plus"/></svg>Thêm mẫu</button><span class="legendrow" style="display:inline-flex;margin-left:14px"><span>Rê vào <b>Mã mẫu</b> để thêm bước hoặc xóa mẫu</span><span><kbd>/</kbd> tìm kiếm</span></span></td></tr>';
 h+='</tbody></table></div></div>';}
 return h+'</div>';
}
function ago(t){if(!t)return '';var d=(Date.now()-t)/6e4;if(d<1)return 'vừa xong';if(d<60)return Math.round(d)+' phút trước';if(d<1440)return Math.round(d/60)+' giờ trước';var x=new Date(t);return String(x.getDate()).padStart(2,'0')+'/'+String(x.getMonth()+1).padStart(2,'0')+' '+String(x.getHours()).padStart(2,'0')+':'+String(x.getMinutes()).padStart(2,'0')}
function dateCell(st){if(!st.date)st.date=today();return '<span class="dtl">Ngày thực hiện</span><input type="date" class="dti" value="'+esc(st.date)+'" data-step="'+st.id+'" data-path="date" aria-label="Ngày thực hiện">'}

/* ---------- sample history ---------- */
var historyFocus: HTMLElement|null=null;
var historyRequest=0;
function closeHistory(){var shade=$('historyShade');if(!shade.classList.contains('on'))return;historyRequest++;shade.classList.remove('on');$('historyPanel').innerHTML='';historyFocus?.focus();historyFocus=null}
function historyGroups(entries){
 var groups:any[]=[];
 entries.forEach(function(entry){
  var prior=groups[groups.length-1],time=new Date(entry.created_at).getTime();
  if(prior&&prior.actorId===entry.actor_id&&prior.actor===entry.actor_name&&prior.newest-time<=4*60*60*1000){prior.oldest=time;prior.entries.push(entry)}
  else groups.push({actorId:entry.actor_id,actor:entry.actor_name,newest:time,oldest:time,entries:[entry]});
 });
 return groups;
}
function historyChanges(entries){
 var changes=new Map<string,{field:string;before:string;after:string}>();
 entries.slice().reverse().forEach(function(entry){entry.changes.forEach(function(change){
  var old=changes.get(change.field);
  if(old)old.after=change.after;else changes.set(change.field,{field:change.field,before:change.before,after:change.after});
 })});
 return Array.from(changes.values()).filter(function(change){return change.before!==change.after});
}
function historyTime(time){return new Date(time).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
function historyField(field){
 return field.split(' · ').map(function(part){
  var step=/^Bước (\d+)$/.exec(part);if(step)return (language()==='en'?'Step':'Bước')+' '+step[1];
  var chem=/^Hóa chất (\d+)$/.exec(part);if(chem)return (language()==='en'?'Chemical':'Hóa chất')+' '+chem[1];
  return translateText(part);
 }).join(' · ');
}
async function openHistory(id,trigger){
 var request=++historyRequest;
 historyFocus=trigger;$('historyShade').classList.add('on');
 var panel=$('historyPanel');panel.innerHTML='<div class="history-head"><div><small>'+esc(translateText('Lịch sử chỉnh sửa'))+'</small><h2>'+(language()==='en'?'Sample':'Mẫu')+' '+esc(trigger.closest('td').querySelector('input').value)+'</h2></div><button class="history-close" data-close-history aria-label="'+esc(translateText('Đóng lịch sử'))+'">×</button></div><div class="history-body">'+esc(translateText('Đang tải…'))+'</div>';
 (panel.querySelector('[data-close-history]') as HTMLElement|null)?.focus();
 try{
  if(saveT){clearTimeout(saveT);saveT=null;STORE.save(S)}
  if(!await STORE.flush())throw new Error('Dữ liệu chưa lưu. Hãy thử lại trước khi xem lịch sử mới nhất.');
  var entries=await STORE.sampleHistory(id);
  if(request!==historyRequest||!$('historyShade').classList.contains('on'))return;
  var body=panel.querySelector('.history-body');
  if(!entries.length){body.innerHTML='<p>'+esc(translateText('Chưa có lịch sử kể từ khi tính năng này được bật.'))+'</p>';return}
  body.innerHTML=historyGroups(entries).map(function(group){
   var changes=historyChanges(group.entries),created=group.entries.some(function(x){return x.type==='created'});
   return '<section class="history-event"><h3>'+esc(group.actor||translateText('Người dùng đã xóa'))+(created?' · '+esc(translateText('Tạo mẫu')):' · '+esc(translateText('Chỉnh sửa')))+'</h3><time>'+historyTime(group.oldest)+(historyTime(group.oldest)!==historyTime(group.newest)?' – '+historyTime(group.newest):'')+'</time>'+
    (changes.length?changes.map(function(change){return '<div class="history-change"><b>'+esc(historyField(change.field))+'</b><span>'+esc(translateText('Trước'))+': '+esc(change.before||'—')+'</span><strong>'+esc(translateText('Sau'))+': '+esc(change.after||'—')+'</strong></div>'}).join(''):'<p>'+esc(translateText('Đã tạo mẫu.'))+'</p>')+'</section>'
  }).join('');
 }catch(error){if(request===historyRequest)panel.querySelector('.history-body').textContent=error.message||'Không tải được lịch sử.'}
}
document.addEventListener('click',function(e){var target=e.target as HTMLElement;var trigger=target.closest<HTMLElement>('[data-history]');if(trigger){void openHistory(trigger.dataset.history,trigger);return}if(target.closest('[data-close-history]')||target===$('historyShade'))closeHistory()});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&$('historyShade').classList.contains('on'))closeHistory()});
function procCell(st){var f=st.procFile;
 return (f?'<div class="fchip"><span class="ex">'+esc(ext(f.name))+'</span><a href="'+STORE.url(f.id)+'" title="Tải tệp">'+esc(f.name)+'</a><button data-act="rmProcFile" data-step="'+st.id+'" aria-label="Gỡ tệp">×</button></div>':'<button class="fbtn" data-act="procFile" data-step="'+st.id+'"><svg class="i"><use href="#i-upload"/></svg>Tải tệp</button>')+
 '<span class="or">hoặc</span><textarea class="ta" placeholder="Ghi quy trình" data-step="'+st.id+'" data-path="procText">'+esc(st.procText)+'</textarea>'}
function concSum(st){var c=st.cond||{},conc=[];
 st.chems.forEach(function(ch){var x=c.conc&&c.conc[ch.id];if(x&&x.v!==''&&x.v!=null)conc.push([ch.name||'Hóa chất',x.v,x.u])});
 var btn='<button class="pbtn" data-act="cond" data-step="'+st.id+'"><svg class="i"><use href="#i-edit"/></svg>'+(conc.length?'Sửa nồng độ':'Nhập nồng độ')+'</button>';
 if(!conc.length)return '<div class="pcard empty"><span class="pe">Chưa có nồng độ</span>'+btn+'</div>';
 return '<div class="pcard"><div class="plist"><span class="ph">Theo hóa chất</span>'+conc.map(function(r){return '<div><span title="'+esc(r[0])+'">'+esc(r[0])+'</span><b>'+esc(r[1])+' <em>'+esc(r[2])+'</em></b></div>'}).join('')+'</div>'+btn+'</div>'}
function condSum(st){var c=st.cond||{},env=[];
 COND.forEach(function(k){var v=k[0]==='pH'?c.pH:c[k[0]]&&c[k[0]].v;if(v!==undefined&&v!==''&&v!=null)env.push([k[1],k[3],v,k[0]==='pH'?'':(k[2]==='%'?'%':c[k[0]].u)])});
 var btn='<button class="pbtn" data-act="cond" data-step="'+st.id+'"><svg class="i"><use href="#i-edit"/></svg>'+(env.length?'Sửa điều kiện':'Nhập điều kiện')+'</button>';
 if(!env.length)return '<div class="pcard empty"><span class="pe">Chưa có điều kiện</span>'+btn+'</div>';
 return '<div class="pcard">'+(env.length?'<div class="pgrid">'+env.map(function(r){return '<div class="pp"><span><i>'+esc(r[1])+'</i>'+esc(r[0])+'</span><b>'+esc(r[2])+(r[3]?' <em>'+esc(r[3])+'</em>':'')+'</b></div>'}).join('')+'</div>':'')+
  btn+'</div>'}
function resSum(st){var r=st.res||{},has=(r.m0&&r.m0.v)||(r.m1&&r.m1.v)||r.yield;
 var btn='<button class="pbtn" data-act="res" data-step="'+st.id+'"><svg class="i"><use href="#i-edit"/></svg>'+(has?'Sửa kết quả':'Nhập kết quả')+'</button>';
 if(!has)return '<div class="pcard empty"><span class="pe">Chưa có kết quả</span>'+btn+'</div>';
 return '<div class="pcard">'+(r.yield?'<div class="pp yl"><span><i>η</i>Hiệu suất</span><b>'+esc(r.yield)+' <em>%</em></b></div>':'')+'<div class="pgrid one">'+
  (r.m0&&r.m0.v?'<div class="pp"><span><i>m₀</i>Ban đầu</span><b>'+esc(r.m0.v)+' <em>'+esc(r.m0.u)+'</em></b></div>':'')+
  (r.m1&&r.m1.v?'<div class="pp"><span><i>m₁</i>Sau phản ứng</span><b>'+esc(r.m1.v)+' <em>'+esc(r.m1.u)+'</em></b></div>':'')+'</div>'+btn+'</div>'}
function imgCell(st){return (st.images.length?'<div class="imgs">'+st.images.map(function(im,k){return '<div class="th" data-act="view" data-step="'+st.id+'" data-k="'+k+'" title="'+esc(im.name)+'">'+(im.src?'<img src="'+im.src+'" alt="'+esc(im.name)+'">':'<span class="fx">'+esc(ext(im.name))+'</span>')+'<button data-act="rmImg" data-step="'+st.id+'" data-k="'+k+'" aria-label="Xóa">×</button></div>'}).join('')+'</div>':'')+'<button class="fbtn" data-act="addImg" data-step="'+st.id+'"><svg class="i"><use href="#i-img"/></svg>Import file</button>'}

/* ---------- dialogs ---------- */
var dlgClose=null;
function openDlg(html,onClose: (()=>void)|null=null){$('dlg').innerHTML=html;$('scrim').classList.add('on');dlgClose=onClose||null;setTimeout(function(){var f=$('dlg').querySelector('input,select,button.pri');if(f)f.focus()},60)}
function closeDlg(){if(!$('scrim').classList.contains('on'))return;$('scrim').classList.remove('on');var c=dlgClose;dlgClose=null;if(c)c()}
$('scrim').addEventListener('mousedown',function(e){if((e.target as HTMLInputElement)===$('scrim'))closeDlg()});
function dhead(tag,title){return '<div class="dh"><div><span class="tagm">'+tag+'</span><h3>'+title+'</h3></div><button class="x" data-act="close" aria-label="Đóng"><svg class="i"><use href="#i-x"/></svg></button></div>'}
function qf(stId,path,v,u,list,ph="0"){return '<div class="qr"><input data-step="'+stId+'" data-path="'+path+'.v" value="'+esc(v||'')+'" placeholder="'+(ph||'0')+'" inputmode="decimal"><select data-step="'+stId+'" data-path="'+path+'.u">'+opts(list,u)+'</select></div>'}
function condDlg(id){var f=findStep(id);if(!f)return;var st=f.st,c=st.cond=st.cond||{};c.conc=c.conc||{};var idx=f.s.steps.indexOf(st)+1;
 var chemRows=st.chems.length?st.chems.map(function(ch,k){var x=c.conc[ch.id]||{};return '<div class="fr"><label><i>C'+(k+1)+'</i>'+esc(ch.name||'Hóa chất '+(k+1))+'</label>'+qf(id,'cond.conc.'+ch.id,x.v,x.u||'M',U.conc)+'</div>'}).join(''):'<div class="hint">Bước này chưa có hóa chất. Thêm hóa chất ở cột <b>Hóa chất</b> để nhập nồng độ.</div>';
 openDlg(dhead('Điều kiện · '+esc(f.s.code)+' / bước '+idx,'Điều kiện thí nghiệm')+'<div class="db">'+
 '<div class="fs"><small>Nồng độ hóa chất</small>'+chemRows+'</div>'+
 '<div class="fs"><small>Môi trường</small>'+
 '<div class="fr"><label><i>pH</i>pH</label><div class="qr"><input data-step="'+id+'" data-path="cond.pH" value="'+esc(c.pH||'')+'" placeholder="7.0" inputmode="decimal"><select disabled><option>—</option></select></div></div>'+
 '<div class="fr"><label><i>T</i>Nhiệt độ</label>'+qf(id,'cond.temp',c.temp&&c.temp.v,c.temp&&c.temp.u||'°C',U.temp,'25')+'</div>'+
 '<div class="fr"><label><i>t</i>Thời gian</label>'+qf(id,'cond.time',c.time&&c.time.v,c.time&&c.time.u||'min',U.time,'30')+'</div>'+
 '<div class="fr"><label><i>RH</i>Độ ẩm</label>'+qf(id,'cond.hum',c.hum&&c.hum.v,'%',['%'],'50')+'</div>'+
 '<div class="fr"><label><i>P</i>Áp suất</label>'+qf(id,'cond.pres',c.pres&&c.pres.v,c.pres&&c.pres.u||'atm',U.pres,'1')+'</div></div>'+
 '<div class="hint">Thông tin sẽ hiện trong cột <b>Điều kiện</b>.</div></div>'+
 '<div class="df"><button class="btn" data-act="clearCond" data-step="'+id+'">Xóa hết</button><button class="btn pri" data-act="close">Xong</button></div>',function(){touch(f.p);save();render()})}
function resDlg(id){var f=findStep(id);if(!f)return;var st=f.st,r=st.res=st.res||{};var idx=f.s.steps.indexOf(st)+1;
 openDlg(dhead('Kết quả · '+esc(f.s.code)+' / bước '+idx,'Kết quả thí nghiệm')+'<div class="db">'+
 '<div class="fs"><small>Khối lượng</small>'+
 '<div class="fr"><label><i>m₀</i>Khối lượng ban đầu</label>'+qf(id,'res.m0',r.m0&&r.m0.v,r.m0&&r.m0.u||'g',U.mass)+'</div>'+
 '<div class="fr"><label><i>m₁</i>Khối lượng sau phản ứng</label>'+qf(id,'res.m1',r.m1&&r.m1.v,r.m1&&r.m1.u||'g',U.mass)+'</div></div>'+
 '<div class="fs"><small>Hiệu suất</small><div class="fr"><label><i>η</i>Hiệu suất</label><div class="qr"><input id="yIn" data-step="'+id+'" data-path="res.yield" value="'+esc(r.yield||'')+'" placeholder="0" inputmode="decimal"><select disabled><option>%</option></select></div></div>'+
 '<div class="calcy"><div><span class="tagm">Gợi ý · η = m₁ / m₀ × 100</span><div id="ySug" style="font-size:15px;font-weight:700;color:var(--g700);margin-top:4px"></div></div><button class="btn cy sm" data-act="applyY" data-step="'+id+'">Dùng giá trị</button></div>'+
 '<div class="hint">Với phản ứng tổng hợp, hãy nhập <b>m₀</b> là khối lượng lý thuyết của sản phẩm để η là hiệu suất thực tế.</div></div></div>'+
 '<div class="df"><button class="btn" data-act="clearRes" data-step="'+id+'">Xóa hết</button><button class="btn pri" data-act="close">Xong</button></div>',function(){touch(f.p);save();render()});
 sugY(id)}
function calcY(st){var r=st.res||{};var a=num(r.m0&&r.m0.v),b=num(r.m1&&r.m1.v);if(a==null||b==null||!a)return null;var ua=r.m0.u,ub=r.m1.u;if(isVol(ua)!==isVol(ub))return null;return b*MASSF[ub]/(a*MASSF[ua])*100}
function sugY(id){var el=$('ySug');if(!el)return;var f=findStep(id),y=calcY(f.st);el.textContent=y==null?'Nhập m₀ và m₁ cùng loại đơn vị (khối lượng hoặc thể tích).':'≈ '+fmt(y,2)+' %';el.dataset.v=y==null?'':fmt(y,2)}

/* settings / profile / help */
function settingsDlg(){openDlg(dhead('Cài đặt','Cài đặt không gian làm việc')+'<div class="db"><div class="fs"><small>Tài khoản</small><div class="fr"><label>Tên hiển thị</label><input class="ipt" id="setName" value="'+esc(S.user.name)+'"></div><div class="fr"><label>Mã phòng lab</label><input class="ipt mono" id="setLab" value="'+esc(S.user.lab||'')+'"></div><div class="fr"><label>Ngôn ngữ</label><select class="ipt" id="setLanguage"><option value="vi"'+((S.user.language||'vi')==='vi'?' selected':'')+'>Tiếng Việt</option><option value="en"'+(S.user.language==='en'?' selected':'')+'>English</option></select><button class="btn sm" data-act="exportLanguageMap">Tải bản dịch EN–VI</button></div></div>'+
 '<div class="fs"><small>Dữ liệu</small><div class="hint">Dữ liệu gắn với tài khoản này.</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="exportJson"><svg class="i"><use href="#i-down"/></svg>Xuất JSON</button></div></div></div>'+
 '<div class="df"><button class="btn" data-act="close">Hủy</button><button class="btn pri" data-act="saveSettings">Lưu</button></div>')}
function profileDlg(){var ps=all();openDlg(dhead('Hồ sơ','Hồ sơ của bạn')+'<div class="db"><div style="display:flex;gap:16px;align-items:center"><span class="avbtn" style="width:64px;height:64px;font-size:24px;cursor:default">'+esc((S.user.name||'?').charAt(0).toUpperCase())+'</span><div><b style="font-size:18px">'+esc(S.user.name)+'</b><div class="tagm" style="margin-top:4px">Nhà nghiên cứu · '+esc(S.user.lab||'')+'</div></div></div>'+
 '<div class="stats" style="grid-template-columns:repeat(3,1fr);gap:10px"><div class="calcy" style="flex-direction:column;align-items:flex-start;gap:2px"><span class="tagm">Dự án</span><b>'+ps.length+'</b></div><div class="calcy" style="flex-direction:column;align-items:flex-start;gap:2px"><span class="tagm">Mẫu</span><b>'+ps.reduce(function(a,p){return a+p.samples.length},0)+'</b></div><div class="calcy" style="flex-direction:column;align-items:flex-start;gap:2px"><span class="tagm">Bước</span><b>'+countSteps()+'</b></div></div></div><div class="df"><button class="btn" data-act="settings">Chỉnh sửa</button><button class="btn pri" data-act="close">Đóng</button></div>')}
function helpDlg(){openDlg(dhead('Trợ giúp','Hướng dẫn nhanh')+'<div class="db" style="font-size:13.5px;line-height:1.6;color:var(--muted)">'+
 '<div class="fs"><small>Dự án</small><div>Mở cây dự án ở thanh bên. Nhấp đúp tên để đổi tên. Dùng <b>+</b> để thêm dự án con.</div></div>'+
 '<div class="fs"><small>Bảng thí nghiệm</small><div>Mỗi mẫu có nhiều bước. Thêm quy trình, điều kiện và kết quả ngay trong bảng.</div></div>'+
 '<div class="fs"><small>Phím tắt</small><div class="legendrow"><span><kbd>/</kbd> tìm kiếm</span><span><kbd>g</kbd> <kbd>m</kbd> tổng quan</span><span><kbd>g</kbd> <kbd>c</kbd> tính toán</span><span><kbd>g</kbd> <kbd>h</kbd> biểu đồ</span><span><kbd>Esc</kbd> đóng</span></div></div></div><div class="df"><button class="btn pri" data-act="close">Đã hiểu</button></div>')}

/* ---------- CALC ---------- */
var DIM={
 mass:{n:'Khối lượng',u:{kg:1000,g:1,mg:1e-3,'µg':1e-6},b:'g'},
 vol:{n:'Thể tích',u:{L:1,mL:1e-3,'µL':1e-6,'m³':1000,'dm³':1,'cm³':1e-3},b:'L'},
 amt:{n:'Lượng chất',u:{mol:1,mmol:1e-3,'µmol':1e-6,kmol:1000},b:'mol'},
 conc:{n:'Nồng độ mol',u:{M:1,mM:1e-3,'µM':1e-6,nM:1e-9,'mol/m³':1e-3},b:'M'},
 mconc:{n:'Nồng độ khối lượng',u:{'g/L':1,'mg/mL':1,'mg/L':1e-3,'µg/mL':1e-3,'ppm (mg/L)':1e-3},b:'g/L'},
 mm:{n:'Khối lượng mol',u:{'g/mol':1,'kg/mol':1000},b:'g/mol'},
 pres:{n:'Áp suất',u:{atm:1,kPa:1/101.325,Pa:1/101325,bar:1/1.01325,mmHg:1/760,psi:1/14.6959},b:'atm'},
 temp:{n:'Nhiệt độ',u:{K:1,'°C':1,'°F':1},b:'K'},
 dens:{n:'Khối lượng riêng',u:{'g/mL':1,'g/cm³':1,'kg/L':1,'kg/m³':1e-3},b:'g/mL'},
 en:{n:'Năng lượng',u:{J:1,kJ:1000,cal:4.184,kcal:4184,'eV':1.602176634e-19},b:'J'},
 pct:{n:'Phần trăm',u:{'%':1},b:'%'},
 none:{n:'',u:{'':1},b:''}
};
function toB(v,d,u){if(d==='temp')return u==='°C'?v+273.15:u==='°F'?(v-32)*5/9+273.15:v;return v*DIM[d].u[u]}
function frB(v,d,u){if(d==='temp')return u==='°C'?v-273.15:u==='°F'?(v-273.15)*9/5+32:v;return v/DIM[d].u[u]}
function sci(v){if(v==null||!isFinite(v))return '—';var a=Math.abs(v);if(a!==0&&(a>=1e6||a<1e-3)){var e=Math.floor(Math.log10(a)),m=v/Math.pow(10,e);return fmt(m,3)+'×10<sup>'+e+'</sup>'}return fmt(v,a>=100?2:a>=1?4:5)}
function sciT(v){return sci(v).replace(/<sup>/,'^').replace('</sup>','')}
var R_=0.082057366;
var CALCS=[
 {id:'mol_m',g:'Mol & khối lượng',sym:'n',name:'Số mol từ khối lượng',desc:'Liên hệ giữa khối lượng chất và số mol thông qua khối lượng mol.',eq:'n = m / M',
  v:[['n','Số mol','n','amt','mol','0.05'],['m','Khối lượng','m','mass','g','5.85'],['M','Khối lượng mol','M','mm','g/mol','58.44']],
  s:{n:['{m} / {M}',function(x){return x.m/x.M}],m:['{n} × {M}',function(x){return x.n*x.M}],M:['{m} / {n}',function(x){return x.m/x.n}]},t:'n'},
 {id:'mol_c',g:'Mol & khối lượng',sym:'n',name:'Số mol trong dung dịch',desc:'Số mol chất tan từ nồng độ mol và thể tích dung dịch.',eq:'n = C<sub>M</sub> × V',
  v:[['n','Số mol','n','amt','mmol',''],['C','Nồng độ mol','C','conc','M','0.1'],['V','Thể tích','V','vol','mL','250']],
  s:{n:['{C} × {V}',function(x){return x.C*x.V}],C:['{n} / {V}',function(x){return x.n/x.V}],V:['{n} / {C}',function(x){return x.n/x.C}]},t:'n'},
 {id:'gas',g:'Mol & khối lượng',sym:'PV',name:'Khí lý tưởng',desc:'Phương trình trạng thái khí lý tưởng, R = 0.082057 L·atm·mol⁻¹·K⁻¹.',eq:'P × V = n × R × T',
  v:[['P','Áp suất','P','pres','atm','1'],['V','Thể tích','V','vol','L',''],['n','Số mol','n','amt','mol','1'],['T','Nhiệt độ','T','temp','°C','0']],
  s:{P:['{n} × R × {T} / {V}',function(x){return x.n*R_*x.T/x.V}],V:['{n} × R × {T} / {P}',function(x){return x.n*R_*x.T/x.P}],n:['{P} × {V} / (R × {T})',function(x){return x.P*x.V/(R_*x.T)}],T:['{P} × {V} / ({n} × R)',function(x){return x.P*x.V/(x.n*R_)}]},t:'V'},
 {id:'prep',g:'Dung dịch',sym:'m',name:'Khối lượng cần cân',desc:'Khối lượng chất rắn cần cân để pha một thể tích dung dịch có nồng độ xác định.',eq:'m = C<sub>M</sub> × V × M',
  v:[['m','Khối lượng','m','mass','g',''],['C','Nồng độ mol','C','conc','M','0.1'],['V','Thể tích','V','vol','mL','500'],['M','Khối lượng mol','M','mm','g/mol','58.44']],
  s:{m:['{C} × {V} × {M}',function(x){return x.C*x.V*x.M}],C:['{m} / ({V} × {M})',function(x){return x.m/(x.V*x.M)}],V:['{m} / ({C} × {M})',function(x){return x.m/(x.C*x.M)}],M:['{m} / ({C} × {V})',function(x){return x.m/(x.C*x.V)}]},t:'m'},
 {id:'dil',g:'Dung dịch',sym:'C₁V₁',name:'Pha loãng',desc:'Thể tích dung dịch gốc cần lấy để pha loãng (số mol chất tan không đổi).',eq:'C<sub>1</sub> × V<sub>1</sub> = C<sub>2</sub> × V<sub>2</sub>',
  v:[['C1','Nồng độ đầu','C₁','conc','M','1'],['V1','Thể tích lấy','V₁','vol','mL',''],['C2','Nồng độ cuối','C₂','conc','mM','100'],['V2','Thể tích cuối','V₂','vol','mL','250']],
  s:{C1:['{C2} × {V2} / {V1}',function(x){return x.C2*x.V2/x.V1}],V1:['{C2} × {V2} / {C1}',function(x){return x.C2*x.V2/x.C1}],C2:['{C1} × {V1} / {V2}',function(x){return x.C1*x.V1/x.V2}],V2:['{C1} × {V1} / {C2}',function(x){return x.C1*x.V1/x.C2}]},t:'V1',
  extra:function(x,t){if(t==='V1'&&x.V2!=null&&x.V1!=null)return 'Lấy '+sci(x.V1*1000)+' mL dung dịch gốc, thêm dung môi đến '+sci(x.V2*1000)+' mL (thêm ≈ '+sci((x.V2-x.V1)*1000)+' mL).'}},
 {id:'pct',g:'Dung dịch',sym:'C%',name:'Nồng độ % → mol/L',desc:'Đổi nồng độ phần trăm khối lượng của dung dịch đặc sang nồng độ mol.',eq:'C<sub>M</sub> = 10 × d × C% / M',
  v:[['CM','Nồng độ mol','C<sub>M</sub>','conc','M',''],['d','Khối lượng riêng','d','dens','g/mL','1.19'],['w','Nồng độ phần trăm','C%','pct','%','37'],['M','Khối lượng mol','M','mm','g/mol','36.46']],
  s:{CM:['10 × {d} × {w} / {M}',function(x){return 10*x.d*x.w/x.M}],w:['{CM} × {M} / (10 × {d})',function(x){return x.CM*x.M/(10*x.d)}],d:['{CM} × {M} / (10 × {w})',function(x){return x.CM*x.M/(10*x.w)}],M:['10 × {d} × {w} / {CM}',function(x){return 10*x.d*x.w/x.CM}]},t:'CM',
  presets:[['HCl 37%',{d:1.19,w:37,M:36.46}],['H₂SO₄ 98%',{d:1.84,w:98,M:98.08}],['HNO₃ 65%',{d:1.39,w:65,M:63.01}],['NH₃ 25%',{d:0.91,w:25,M:17.03}],['CH₃COOH 99.7%',{d:1.05,w:99.7,M:60.05}],['H₃PO₄ 85%',{d:1.685,w:85,M:98.00}]]},
 {id:'titr',g:'Chuẩn độ & cân bằng',sym:'Eq',name:'Chuẩn độ',desc:'Tại điểm tương đương của phản ứng a·A + b·B: số mol A / a = số mol B / b.',eq:'C<sub>A</sub>V<sub>A</sub> / a = C<sub>B</sub>V<sub>B</sub> / b',
  v:[['Ca','Nồng độ chất A','C<sub>A</sub>','conc','M',''],['Va','Thể tích A','V<sub>A</sub>','vol','mL','10'],['Cb','Nồng độ chất B','C<sub>B</sub>','conc','M','0.1'],['Vb','Thể tích B tiêu tốn','V<sub>B</sub>','vol','mL','12.35'],['a','Hệ số của A','a','none','','1',1],['b','Hệ số của B','b','none','','1',1]],
  s:{Ca:['{a} × {Cb} × {Vb} / ({b} × {Va})',function(x){return x.a*x.Cb*x.Vb/(x.b*x.Va)}],Va:['{a} × {Cb} × {Vb} / ({b} × {Ca})',function(x){return x.a*x.Cb*x.Vb/(x.b*x.Ca)}],Cb:['{b} × {Ca} × {Va} / ({a} × {Vb})',function(x){return x.b*x.Ca*x.Va/(x.a*x.Vb)}],Vb:['{b} × {Ca} × {Va} / ({a} × {Cb})',function(x){return x.b*x.Ca*x.Va/(x.a*x.Cb)}]},t:'Ca',
  presets:[['HCl + NaOH (1:1)',{a:1,b:1}],['H₂SO₄ + NaOH (1:2)',{a:1,b:2}],['H₂C₂O₄ + KMnO₄ (5:2)',{a:5,b:2}],['Fe²⁺ + KMnO₄ (5:1)',{a:5,b:1}],['EDTA + Ca²⁺ (1:1)',{a:1,b:1}]]},
 {id:'ph',g:'Chuẩn độ & cân bằng',sym:'pH',name:'pH dung dịch',desc:'pH của acid/base mạnh hoặc yếu ở 25 °C (K<sub>w</sub> = 1.0×10⁻¹⁴).',custom:true},
 {id:'hh',g:'Chuẩn độ & cân bằng',sym:'HA',name:'Dung dịch đệm',desc:'Phương trình Henderson–Hasselbalch cho hệ đệm acid yếu và base liên hợp.',eq:'pH = pK<sub>a</sub> + log([A⁻] / [HA])',
  v:[['pH','pH','pH','none','',''],['pKa','pKa','pK<sub>a</sub>','none','','4.76'],['A','Nồng độ base liên hợp','[A⁻]','conc','M','0.1'],['HA','Nồng độ acid','[HA]','conc','M','0.1']],
  s:{pH:['{pKa} + log({A} / {HA})',function(x){return x.pKa+Math.log10(x.A/x.HA)}],pKa:['{pH} − log({A} / {HA})',function(x){return x.pH-Math.log10(x.A/x.HA)}],A:['{HA} × 10^({pH} − {pKa})',function(x){return x.HA*Math.pow(10,x.pH-x.pKa)}],HA:['{A} / 10^({pH} − {pKa})',function(x){return x.A/Math.pow(10,x.pH-x.pKa)}]},t:'pH',
  presets:[['Acetate 4.76',{pKa:4.76}],['Phosphate 7.20',{pKa:7.20}],['Tris 8.07',{pKa:8.07}],['Bicarbonate 6.35',{pKa:6.35}],['Ammonium 9.25',{pKa:9.25}]]},
 {id:'bal',g:'Chuẩn độ & cân bằng',sym:'⇌',name:'Cân bằng phương trình',desc:'Tự động tìm hệ số tối giản để cân bằng nguyên tố hai vế.',custom:true},
 {id:'mmass',g:'Công cụ',sym:'M',name:'Khối lượng mol',desc:'Tính khối lượng mol và thành phần nguyên tố từ công thức hóa học.',custom:true},
 {id:'unit',g:'Công cụ',sym:'⇄',name:'Quy đổi đơn vị',desc:'Chuyển đổi giữa các đơn vị thường dùng trong phòng thí nghiệm.',custom:true}
];
function C_(id){return CALCS.find(function(c){return c.id===id})||CALCS[0]}
function cst(){S.calc=S.calc||{};S.calc.t=S.calc.t||{};S.calc.v=S.calc.v||{};S.calc.ou=S.calc.ou||{};S.calc.h=S.calc.h||[];return S.calc}
function cval(c,k){var st=cst();st.v[c.id]=st.v[c.id]||{};var r=st.v[c.id][k];if(!r){var d=c.v.find(function(x){return x[0]===k});r=st.v[c.id][k]={v:d[5],u:d[4]}}return r}
function ctarget(c){return cst().t[c.id]||c.t}
function vCalc(){crumb(['Không gian làm việc','Tính toán']);var cur=C_(route.id),grp=[];CALCS.forEach(function(c){if(grp.indexOf(c.g)<0)grp.push(c.g)});
 return '<div class="view"><div class="phead"><div><h1 style="margin:6px 0 0;font-family:var(--head);font-size:26px;font-weight:800;letter-spacing:.06em;text-transform:uppercase">Tính toán</h1></div><div class="legendrow"><span>Chọn đại lượng cần tính, rồi nhập các giá trị còn lại.</span></div></div>'+
 '<div class="cwrap"><nav class="card clist" aria-label="Danh sách công thức">'+grp.map(function(g){return '<div class="cg"><small>'+g+'</small>'+CALCS.filter(function(c){return c.g===g}).map(function(c){return '<a href="#/calc/'+c.id+'" class="ci'+(c.id===cur.id?' on':'')+'"><span class="cs">'+c.sym+'</span>'+c.name+'</a>'}).join('')+'</div>'}).join('')+'</nav>'+
 '<section class="card cpanel" id="cpanel">'+calcPanel(cur)+'</section>'+
 '<aside class="cside"><div class="card"><div class="ch"><div><h3>Lời giải</h3><p>Các bước thay số</p></div><span class="tagm">step</span></div><div class="steps" id="steps"></div></div>'+
 '<div class="card"><div class="ch"><div><h3>Hằng số</h3><p>Giá trị tham chiếu</p></div></div><dl class="consts"><dt>R</dt><dd>0.082057 L·atm·mol⁻¹·K⁻¹<br>8.3145 J·mol⁻¹·K⁻¹</dd><dt>N<sub>A</sub></dt><dd>6.02214×10²³ mol⁻¹</dd><dt>V<sub>m</sub></dt><dd>22.414 L/mol (0 °C, 1 atm)</dd><dt>K<sub>w</sub></dt><dd>1.0×10⁻¹⁴ (25 °C)</dd><dt>F</dt><dd>96 485 C/mol</dd></dl></div>'+
 '<div class="card"><div class="ch"><div><h3>Lịch sử</h3><p>Đã lưu</p></div>'+(cst().h.length?'<button class="btn sm" data-act="clrHist">Xóa</button>':'')+'</div><ul class="hist">'+(cst().h.length?cst().h.map(function(h){return '<li><a href="#/calc/'+h.id+'"><b>'+h.n+'</b><span>'+h.r+'</span></a></li>'}).join(''):'<li class="mt">Chưa có kết quả đã lưu.</li>')+'</ul></div></aside></div></div>'}
function unitSel(d,u,attrs){return '<select '+attrs+'>'+Object.keys(DIM[d].u).map(function(x){return '<option'+(x===u?' selected':'')+'>'+x+'</option>'}).join('')+'</select>'}
function calcPanel(c){var h='<div class="cph"><span class="big">'+c.sym+'</span><div><span class="tagm">'+c.g+'</span><h2>'+c.name+'</h2><p>'+c.desc+'</p></div></div>';
 if(c.custom)return h+'<div class="cpb">'+({ph:phPanel,bal:balPanel,mmass:mmPanel,unit:unitPanel})[c.id]()+'</div>';
 var t=ctarget(c);
 h+='<div class="cpb"><div class="eq big">'+c.eq+'</div>';
 if(c.presets)h+='<div class="presets"><small>Mẫu có sẵn</small>'+c.presets.map(function(p,i){return '<button class="chip" data-act="preset" data-i="'+i+'">'+p[0]+'</button>'}).join('')+'</div>';
 h+='<div class="solve"><small>Tìm</small>'+c.v.filter(function(v){return !v[6]}).map(function(v){return '<button class="pill'+(v[0]===t?' on':'')+'" data-act="target" data-k="'+v[0]+'"><span>'+v[2]+'</span><em>'+v[1]+'</em></button>'}).join('')+'</div><div class="vars">';
 c.v.forEach(function(v){var k=v[0],r=cval(c,k),isT=k===t;
  h+='<div class="vr'+(isT?' tgt':'')+'"><label for="cv_'+k+'"><i>'+v[2]+'</i>'+v[1]+'</label>'+
   (isT?'<div class="qr res"><output id="cOut">—</output>'+(v[3]==='none'||v[3]==='pct'?'<select disabled><option>'+(v[3]==='pct'?'%':'—')+'</option></select>':unitSel(v[3],cst().ou[c.id+k]||r.u,'data-ou="'+k+'"'))+'</div>'
   :'<div class="qr"><input id="cv_'+k+'" data-cv="'+k+'" value="'+esc(r.v)+'" inputmode="decimal" placeholder="nhập '+v[1].toLowerCase()+'">'+(v[3]==='none'||v[3]==='pct'?'<select disabled><option>'+(v[3]==='pct'?'%':'—')+'</option></select>':unitSel(v[3],r.u,'data-cu="'+k+'"'))+'</div>')+
   (v[3]==='mm'&&!isT?'<input class="ipt mono fm" data-fm="'+k+'" placeholder="hoặc công thức, VD: NaCl" aria-label="Công thức hóa học">':'')+'</div>'});
 return h+'</div><div class="cres" id="cres"></div></div>'}
function runCalc(){if(route.v!=='calc'||!$('cres'))return;var c=C_(route.id);if(c.custom){({ph:phRun,bal:balRun,mmass:mmRun,unit:unitRun})[c.id]();return}
 var t=ctarget(c),x={},miss=[];c.v.forEach(function(v){if(v[0]===t)return;var r=cval(c,v[0]),n=num(r.v);if(n==null)miss.push(v[2]);else x[v[0]]=v[3]==='none'||v[3]==='pct'?n:toB(n,v[3],r.u)});
 var tv=c.v.find(function(v){return v[0]===t}),out=$('cOut'),res=$('cres'),stp=$('steps');if(!out||!stp)return;
 if(miss.length){out.innerHTML='—';res.innerHTML='<div class="need"><svg class="i"><use href="#i-help"/></svg>Cần nhập: '+miss.join(', ')+'</div>';stp.innerHTML='<p class="mt">Nhập đủ dữ kiện để xem lời giải.</p>';return}
 var y=c.s[t][1](x);
 if(!isFinite(y)||(tv[3]!=='none'&&tv[3]!=='temp'&&y<0)||(tv[3]==='temp'&&y<0)){out.innerHTML='—';res.innerHTML='<div class="need err2">Không tính được với các giá trị này (chia cho 0 hoặc kết quả âm).</div>';stp.innerHTML='';return}
 var ou=tv[3]==='none'||tv[3]==='pct'?'':(cst().ou[c.id+t]||cval(c,t).u),shown=ou?frB(y,tv[3],ou):y;
 out.innerHTML=sci(shown);
 var bu=function(k){var d=c.v.find(function(v){return v[0]===k})[3];return d==='none'||d==='pct'?'':' '+DIM[d].b};
 var ex=c.s[t][0],sym=ex.replace(/\{(\w+)\}/g,function(m,k){return c.v.find(function(v){return v[0]===k})[2]}),sub=ex.replace(/\{(\w+)\}/g,function(m,k){return '<b>'+sci(x[k])+'</b>'+bu(k)}).replace(/R/g,'<b>0.082057</b>');
 stp.innerHTML='<ol><li><span>Công thức</span><div class="m">'+c.eq+'</div></li><li><span>Biến đổi</span><div class="m">'+tv[2]+' = '+sym+'</div></li><li><span>Đổi về đơn vị chuẩn & thay số</span><div class="m">'+tv[2]+' = '+sub+'</div></li><li><span>Kết quả</span><div class="m hl">'+tv[2]+' = '+sci(y)+bu(t)+(ou&&ou!==DIM[tv[3]].b?' = '+sci(shown)+' '+ou:'')+'</div></li></ol>';
 var other=tv[3]!=='none'&&tv[3]!=='pct'?Object.keys(DIM[tv[3]].u).filter(function(u){return u!==ou}).slice(0,4).map(function(u){return '<span>'+sci(frB(y,tv[3],u))+' '+u+'</span>'}).join(''):'';
 var ext=c.extra?c.extra(x,t):'';x[t]=y;if(c.extra)ext=c.extra(x,t)||'';
 res.innerHTML='<div class="big-r"><span class="tagm">'+tv[1]+'</span><b>'+sci(shown)+'<em>'+(ou||(tv[3]==='pct'?'%':''))+'</em></b>'+(other?'<div class="alt">'+other+'</div>':'')+'</div>'+(ext?'<div class="hint">'+ext+'</div>':'')+'<button class="btn sm" data-act="saveHist">Lưu kết quả</button>';
 res.dataset.r=String(tv[2]).replace(/<[^>]+>/g,'')+' = '+sciT(shown)+' '+(ou||'')}
/* pH */
function phPanel(){var p=cst().ph||(cst().ph={mode:'sa',C:'0.01',Cu:'M',n:'1',K:'1.8e-5',kt:'Ka'});
 var modes=[['sa','Acid mạnh'],['sb','Base mạnh'],['wa','Acid yếu'],['wb','Base yếu'],['h','[H⁺] ↔ pH']];
 return '<div class="solve"><small>Loại</small>'+modes.map(function(m){return '<button class="pill'+(p.mode===m[0]?' on':'')+'" data-act="phMode" data-k="'+m[0]+'">'+m[1]+'</button>'}).join('')+'</div><div class="vars">'+
 (p.mode==='h'?'<div class="vr"><label><i>pH</i>pH hoặc để trống</label><div class="qr"><input data-ph="pH" value="'+esc(p.pH||'')+'" placeholder="VD: 3.5"><select disabled><option>—</option></select></div></div><div class="vr"><label><i>[H⁺]</i>Nồng độ H⁺</label><div class="qr"><input data-ph="H" value="'+esc(p.H||'')+'" placeholder="VD: 1e-4"><select disabled><option>M</option></select></div></div>':
 '<div class="vr"><label><i>C</i>Nồng độ</label><div class="qr"><input data-ph="C" value="'+esc(p.C)+'">'+unitSel('conc',p.Cu,'data-ph="Cu"')+'</div></div>'+
 (p.mode[0]==='s'?'<div class="vr"><label><i>n</i>Số '+(p.mode==='sa'?'H⁺':'OH⁻')+' phân ly</label><div class="qr"><input data-ph="n" value="'+esc(p.n)+'"><select disabled><option>—</option></select></div></div>':
 '<div class="vr"><label><i>K</i>Hằng số phân ly</label><div class="qr"><input data-ph="K" value="'+esc(p.K)+'"><select data-ph="kt"><option'+(p.kt==='Ka'?' selected':'')+'>Ka</option><option'+(p.kt==='pKa'?' selected':'')+'>pKa</option></select></div></div>'))+
 '</div><div class="cres" id="cres"></div>'}
function phRun(){var p=cst().ph,out='',st='';var H;
 if(p.mode==='h'){var a=num(p.pH),b=num(p.H);if(a!=null){H=Math.pow(10,-a);st='[H⁺] = 10<sup>−pH</sup> = 10<sup>−'+fmt(a,3)+'</sup>'}else if(b!=null&&b>0){H=b;st='pH = −log[H⁺] = −log('+sci(b)+')'}else{$('cres').innerHTML='<div class="need">Nhập pH hoặc [H⁺].</div>';$('steps').innerHTML='<p class="mt">Nhập dữ kiện để xem lời giải.</p>';return}}
 else{var C=num(p.C);if(C==null||C<=0){$('cres').innerHTML='<div class="need">Nhập nồng độ.</div>';return}C=toB(C,'conc',p.Cu);
  if(p.mode==='sa'){var n=num(p.n)||1;H=n*C;st='[H⁺] = n × C = '+n+' × '+sci(C)+' = '+sci(H)+' M'}
  else if(p.mode==='sb'){var n2=num(p.n)||1,OH=n2*C;H=1e-14/OH;st='[OH⁻] = n × C = '+sci(OH)+' M<br>[H⁺] = K<sub>w</sub> / [OH⁻] = '+sci(H)+' M'}
  else{var K=num(p.K);if(K==null){$('cres').innerHTML='<div class="need">Nhập hằng số phân ly.</div>';return}if(p.kt==='pKa')K=Math.pow(10,-K);var x=(-K+Math.sqrt(K*K+4*K*C))/2;
   st=(p.mode==='wa'?'[H⁺]':'[OH⁻]')+' = (−K + √(K² + 4KC)) / 2<br>= (−'+sci(K)+' + √('+sci(K*K)+' + 4·'+sci(K)+'·'+sci(C)+')) / 2 = '+sci(x)+' M<br>Độ điện ly α = '+fmt(x/C*100,2)+' %';H=p.mode==='wa'?x:1e-14/x}}
 var pH=-Math.log10(H);
 $('steps').innerHTML='<ol><li><span>Tính nồng độ ion</span><div class="m">'+st+'</div></li><li><span>pH = −log[H⁺]</span><div class="m hl">pH = '+fmt(pH,3)+'</div></li><li><span>pOH = 14 − pH</span><div class="m">pOH = '+fmt(14-pH,3)+'</div></li></ol>';
 var pos=Math.max(0,Math.min(14,pH))/14*100;
 $('cres').innerHTML='<div class="big-r"><span class="tagm">pH</span><b>'+fmt(pH,2)+'</b><div class="alt"><span>pOH '+fmt(14-pH,2)+'</span><span>[H⁺] '+sci(H)+' M</span><span>[OH⁻] '+sci(1e-14/H)+' M</span></div></div><div class="phscale"><div class="bar"></div><i style="left:'+pos+'%"></i><div class="ticks"><span>0</span><span>7</span><span>14</span></div></div><button class="btn sm" data-act="saveHist">Lưu kết quả</button>';
 $('cres').dataset.r='pH = '+fmt(pH,2)}
/* equation balancing */
function gcd(a,b){a=Math.abs(a);b=Math.abs(b);while(b){var t=b;b=a%b;a=t}return a}
function Fr(n,d=1){d=d||1;if(d<0){n=-n;d=-d}var g=gcd(n,d)||1;return {n:n/g,d:d/g}}
function fsub(a,b){return Fr(a.n*b.d-b.n*a.d,a.d*b.d)}function fmul(a,b){return Fr(a.n*b.n,a.d*b.d)}function fdiv(a,b){return Fr(a.n*b.d,a.d*b.n)}
function balance(eq){var sides=eq.replace(/\s+/g,'').split(/=|→|->|⟶|⇌|<=>/);if(sides.length!==2||!sides[0]||!sides[1])throw 'Dùng dấu → hoặc = để ngăn cách hai vế.';
 var L=sides[0].split('+').filter(Boolean),Rr=sides[1].split('+').filter(Boolean),sp=L.concat(Rr),comp=sp.map(function(s){var c=parseF(s.replace(/^\d+/,'').replace(/\^?\d*[+-]$/,''));return c}),els=[];
 comp.forEach(function(c){Object.keys(c).forEach(function(e){if(els.indexOf(e)<0)els.push(e)})});
 var M=els.map(function(e){return sp.map(function(s,j){var v=comp[j][e]||0;return Fr(j<L.length?v:-v)})}),rows=M.length,cols=sp.length,piv=[],r=0;
 for(var c=0;c<cols&&r<rows;c++){var p=-1;for(var i=r;i<rows;i++)if(M[i][c].n!==0){p=i;break}if(p<0)continue;var tmp=M[r];M[r]=M[p];M[p]=tmp;var pv=M[r][c];for(var j=0;j<cols;j++)M[r][j]=fdiv(M[r][j],pv);for(i=0;i<rows;i++)if(i!==r&&M[i][c].n!==0){var f=M[i][c];for(j=0;j<cols;j++)M[i][j]=fsub(M[i][j],fmul(f,M[r][j]))}piv.push(c);r++}
 var free=[];for(c=0;c<cols;c++)if(piv.indexOf(c)<0)free.push(c);
 if(free.length===0)throw 'Phương trình không thể cân bằng (kiểm tra lại chất tham gia/sản phẩm).';if(free.length>1)throw 'Phương trình có nhiều cách cân bằng độc lập, hãy tách thành các phản ứng riêng.';
 var fc=free[0],x=new Array(cols);x[fc]=Fr(1);piv.forEach(function(c,i){x[c]=Fr(-M[i][fc].n,M[i][fc].d)});
 var l=x.reduce(function(a,f){return a*f.d/gcd(a,f.d)},1),co=x.map(function(f){return f.n*l/f.d});if(co.every(function(v){return v<=0}))co=co.map(function(v){return -v});
 if(co.some(function(v){return v<=0}))throw 'Không tìm được bộ hệ số dương.';var g=co.reduce(gcd);co=co.map(function(v){return v/g});
 return {L:L,R:Rr,co:co,els:els,comp:comp}}
function pretty(f){return esc(f).replace(/(\d+)/g,'<sub>$1</sub>')}
function balPanel(){var b=cst().bal||(cst().bal={eq:'C6H12O6 + O2 -> CO2 + H2O'});
 return '<div class="vars"><div class="vr" style="grid-template-columns:1fr"><label><i>⇌</i>Phương trình phản ứng</label><input class="ipt mono" data-bal value="'+esc(b.eq)+'" placeholder="VD: Fe + O2 -> Fe2O3" style="height:46px;font-size:15px"></div></div>'+
 '<div class="presets"><small>Ví dụ</small>'+['Fe + O2 -> Fe2O3','KMnO4 + HCl -> KCl + MnCl2 + Cl2 + H2O','C3H8 + O2 -> CO2 + H2O','Ca(OH)2 + H3PO4 -> Ca3(PO4)2 + H2O','Al + H2SO4 -> Al2(SO4)3 + H2'].map(function(e){return '<button class="chip" data-act="balEx" data-e="'+esc(e)+'">'+pretty(e).replace('-&gt;','→')+'</button>'}).join('')+'</div><div class="cres" id="cres"></div>'}
function balRun(){var b=cst().bal;try{var r=balance(b.eq);var sp=r.L.concat(r.R),part=function(a,o){return a.map(function(s,i){var c=r.co[i+o];return (c>1?'<b class="co">'+c+'</b>':'')+pretty(s.replace(/^\d+/,''))}).join(' + ')};
  $('cres').innerHTML='<div class="big-r"><span class="tagm">Phương trình đã cân bằng</span><div class="eqb">'+part(r.L,0)+' <span>→</span> '+part(r.R,r.L.length)+'</div></div><table class="dt"><thead><tr><th>Nguyên tố</th><th>Vế trái</th><th>Vế phải</th><th></th></tr></thead><tbody>'+r.els.map(function(e){var lt=0,rt=0;sp.forEach(function(s,i){var n=(r.comp[i][e]||0)*r.co[i];if(i<r.L.length)lt+=n;else rt+=n});return '<tr><td><b>'+e+'</b></td><td>'+lt+'</td><td>'+rt+'</td><td style="color:#2E9E73">'+(lt===rt?'✓':'✗')+'</td></tr>'}).join('')+'</tbody></table><button class="btn sm" data-act="saveHist">Lưu kết quả</button>';
  $('cres').dataset.r=r.co.join(' : ');
  $('steps').innerHTML='<ol><li><span>Lập hệ phương trình bảo toàn</span><div class="m">'+r.els.map(function(e){return e+': '+sp.map(function(s,i){var n=r.comp[i][e]||0;return n?(i<r.L.length?'+':'−')+n+'x<sub>'+(i+1)+'</sub>':''}).join(' ').replace(/^\+/,'')+' = 0'}).join('<br>')+'</div></li><li><span>Giải bằng khử Gauss, đặt hệ số nhỏ nhất nguyên</span><div class="m hl">'+r.co.map(function(c,i){return 'x<sub>'+(i+1)+'</sub>='+c}).join(', ')+'</div></li></ol>'}
 catch(e){$('cres').innerHTML='<div class="need err2">'+(typeof e==='string'&&e.length>3?esc(e):'Không đọc được công thức'+(typeof e==='string'?' (nguyên tố "'+esc(e)+'")':'')+'.')+'</div>';$('steps').innerHTML='<p class="mt">Nhập phương trình hợp lệ để xem lời giải.</p>'}}
/* molar mass */
function mmPanel(){if(cst().mm==null)cst().mm='CuSO4·5H2O';var f=cst().mm;var pt=['H','C','N','O','Na','Mg','Al','Si','P','S','Cl','K','Ca','Mn','Fe','Cu','Zn','Ag','Br','I','Ba','(',')','·'];
 return '<div class="vars"><div class="vr" style="grid-template-columns:1fr"><label><i>M</i>Công thức hóa học</label><input class="ipt mono" data-mm value="'+esc(f)+'" style="height:46px;font-size:15px" autocomplete="off"></div></div><div class="ptbl">'+pt.map(function(e){return '<button data-el="'+e+'">'+e+'</button>'}).join('')+'</div><div class="cres" id="cres"></div>'}
function mmRun(){if(cst().mm==null)cst().mm='CuSO4·5H2O';var f=cst().mm;try{var c=parseF(f),M=0;if(!Object.keys(c).length)throw 0;Object.keys(c).forEach(function(e){M+=ATOM[e]*c[e]});
  $('cres').innerHTML='<div class="big-r"><span class="tagm">Khối lượng mol</span><b>'+fmt(M,3)+'<em>g/mol</em></b></div><div class="compbar">'+Object.keys(c).map(function(e,i){return '<i style="flex:'+(ATOM[e]*c[e]/M)+';background:'+['#2E5C57','#1FB5BD','#C9962E','#5F78BE','#C1654E','#7A5BA8','#5E9C8F'][i%7]+'" title="'+e+'"></i>'}).join('')+'</div><table class="dt"><thead><tr><th>Nguyên tố</th><th>Số nguyên tử</th><th>A (g/mol)</th><th>Khối lượng</th><th>% khối lượng</th></tr></thead><tbody>'+Object.keys(c).map(function(e){return '<tr><td><b>'+e+'</b></td><td>'+c[e]+'</td><td>'+ATOM[e]+'</td><td>'+fmt(ATOM[e]*c[e],3)+'</td><td>'+fmt(ATOM[e]*c[e]/M*100,2)+' %</td></tr>'}).join('')+'</tbody></table><button class="btn sm" data-act="saveHist">Lưu kết quả</button>';
  $('cres').dataset.r='M('+f+') = '+fmt(M,3)+' g/mol';
  $('steps').innerHTML='<ol><li><span>M = Σ nᵢ × Aᵢ</span><div class="m">'+Object.keys(c).map(function(e){return c[e]+'×'+ATOM[e]}).join(' + ')+'</div></li><li><span>Kết quả</span><div class="m hl">M = '+fmt(M,3)+' g/mol</div></li></ol>'}
 catch(e){$('cres').innerHTML='<div class="need err2">'+(typeof e==='string'?'Không nhận ra nguyên tố "'+esc(e)+'".':'Công thức chưa hợp lệ.')+'</div>';$('steps').innerHTML=''}}
/* unit converter */
function unitPanel(){var u=cst().uc||(cst().uc={d:'conc',v:'250',f:'mM'});var ds=['mass','vol','amt','conc','mconc','pres','temp','dens','en'];
 return '<div class="solve"><small>Đại lượng</small>'+ds.map(function(d){return '<button class="pill'+(u.d===d?' on':'')+'" data-act="ucDim" data-k="'+d+'">'+DIM[d].n+'</button>'}).join('')+'</div><div class="vars"><div class="vr"><label><i>x</i>Giá trị</label><div class="qr"><input data-uc="v" value="'+esc(u.v)+'" inputmode="decimal">'+unitSel(u.d,u.f in DIM[u.d].u?u.f:DIM[u.d].b,'data-uc="f"')+'</div></div>'+
 (u.d==='conc'||u.d==='mconc'?'<div class="vr"><label><i>M</i>Khối lượng mol (để đổi mol ↔ khối lượng)</label><div class="qr"><input data-uc="M" value="'+esc(u.M||'')+'" placeholder="VD: 58.44"><select disabled><option>g/mol</option></select></div></div>':'')+'</div><div class="cres" id="cres"></div>'}
function unitRun(){var u=cst().uc,v=num(u.v),f=u.f in DIM[u.d].u?u.f:DIM[u.d].b;if(v==null){$('cres').innerHTML='<div class="need">Nhập giá trị cần đổi.</div>';$('steps').innerHTML='';return}
 var b=toB(v,u.d,f),rows=Object.keys(DIM[u.d].u).map(function(x){return [x,frB(b,u.d,x)]}),M=num(u.M);
 if(M&&(u.d==='conc'||u.d==='mconc')){var od=u.d==='conc'?'mconc':'conc',ob=u.d==='conc'?b*M:b/M;rows=rows.concat(Object.keys(DIM[od].u).map(function(x){return [x,frB(ob,od,x)]}))}
 $('cres').innerHTML='<div class="ugrid">'+rows.map(function(r){return '<div class="'+(r[0]===f?'on':'')+'"><b>'+sci(r[1])+'</b><span>'+r[0]+'</span></div>'}).join('')+'</div>';
 $('cres').dataset.r=v+' '+f;
 $('steps').innerHTML='<ol><li><span>Đổi về đơn vị chuẩn</span><div class="m">'+v+' '+f+' = '+sci(b)+' '+DIM[u.d].b+'</div></li><li><span>Đổi sang đơn vị đích</span><div class="m">x<sub>đích</sub> = x<sub>chuẩn</sub> / hệ số đơn vị'+(u.d==='temp'?'<br>T(°C) = T(K) − 273.15 · T(°F) = T(°C)×9/5 + 32':'')+'</div></li></ol>'}
function parseF(f){f=f.replace(/\s/g,'').replace(/[·*•.]/g,'·');var parts=f.split('·'),tot={};
 parts.forEach(function(part){if(!part)return;var m=/^(\d+)(.*)$/.exec(part),mult=1;if(m){mult=+m[1];part=m[2]}var c=parseG(part);Object.keys(c).forEach(function(k){tot[k]=(tot[k]||0)+c[k]*mult})});return tot}
function parseG(s){var i=0,stack=[{}];var sub={'₀':0,'₁':1,'₂':2,'₃':3,'₄':4,'₅':5,'₆':6,'₇':7,'₈':8,'₉':9};s=s.replace(/[₀-₉]/g,function(c){return sub[c]});
 function n(){var m=/^\d+/.exec(s.slice(i));if(m){i+=m[0].length;return +m[0]}return 1}
 while(i<s.length){var ch=s[i];if(ch==='('||ch==='['){stack.push({});i++}else if(ch===')'||ch===']'){i++;var k=n(),top=stack.pop(),t=stack[stack.length-1];if(!t)throw 0;Object.keys(top).forEach(function(e){t[e]=(t[e]||0)+top[e]*k})}else{var m=/^[A-Z][a-z]?/.exec(s.slice(i));if(!m)throw 0;i+=m[0].length;if(!ATOM[m[0]])throw m[0];var c=n(),t2=stack[stack.length-1];t2[m[0]]=(t2[m[0]]||0)+c}}
 if(stack.length!==1)throw 0;return stack[0]}
function calcAll(){runCalc()}
function calcEvents(e){var t=(e.target as HTMLInputElement),c=C_(route.id);if(!document.body.contains(t))return true;
 if(t.dataset.cv){cval(c,t.dataset.cv).v=t.value;save();runCalc();return true}
 if(t.dataset.cu){cval(c,t.dataset.cu).u=t.value;save();runCalc();return true}
 if(t.dataset.ou){cst().ou[c.id+t.dataset.ou]=t.value;save();runCalc();return true}
 if(t.dataset.fm!==undefined){try{var cc=parseF(t.value),M=0;Object.keys(cc).forEach(function(k){M+=ATOM[k]*cc[k]});if(M>0){var k=t.dataset.fm;cval(c,k).v=fmt(M,3);cval(c,k).u='g/mol';var inp=$('cv_'+k);inp.value=fmt(M,3);inp.nextElementSibling.value='g/mol';t.classList.remove('bad');save();runCalc()}}catch(err){t.classList.toggle('bad',!!t.value)}return true}
 if(t.dataset.ph){cst().ph[t.dataset.ph]=t.value;if(t.dataset.ph==='pH')cst().ph.H='';if(t.dataset.ph==='H')cst().ph.pH='';save();runCalc();return true}
 if(t.dataset.bal!==undefined){cst().bal.eq=t.value;save();runCalc();return true}
 if(t.dataset.mm!==undefined){cst().mm=t.value;save();runCalc();return true}
 if(t.dataset.uc){cst().uc[t.dataset.uc]=t.value;save();runCalc();return true}
 return false}

/* ---------- CHART ---------- */
var PAL=['#2E5C57','#1FB5BD','#C9962E','#5F78BE','#C1654E','#7A5BA8','#3DBE8B','#8A6420'];
function lin(xs,ys){var n=xs.length;if(n<2)return null;var mx=0,my=0;xs.forEach(function(v,i){mx+=v;my+=ys[i]});mx/=n;my/=n;var sxx=0,sxy=0,sst=0;xs.forEach(function(v,i){sxx+=(v-mx)*(v-mx);sxy+=(v-mx)*(ys[i]-my);sst+=(ys[i]-my)*(ys[i]-my)});if(!sxx)return null;var a=sxy/sxx,b=my-a*mx,sr=0;xs.forEach(function(v,i){var e=ys[i]-(a*v+b);sr+=e*e});return {a:a,b:b,r2:sst?1-sr/sst:1,se:n>2?Math.sqrt(sr/(n-2)):0,n:n,f:function(x){return a*x+b}}}
function poly2(xs,ys){var n=xs.length;if(n<3)return null;var s=[0,0,0,0,0],t=[0,0,0];xs.forEach(function(x,i){var p=1;for(var k=0;k<5;k++){s[k]+=p;if(k<3)t[k]+=p*ys[i];p*=x}});
 var A=[[s[0],s[1],s[2],t[0]],[s[1],s[2],s[3],t[1]],[s[2],s[3],s[4],t[2]]];for(var c=0;c<3;c++){var p=c;for(var r=c+1;r<3;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;var tmp=A[c];A[c]=A[p];A[p]=tmp;if(!A[c][c])return null;for(r=0;r<3;r++)if(r!==c){var f=A[r][c]/A[c][c];for(var k2=c;k2<4;k2++)A[r][k2]-=f*A[c][k2]}}
 var c0=A[0][3]/A[0][0],c1=A[1][3]/A[1][1],c2=A[2][3]/A[2][2],my=ys.reduce(function(a,b){return a+b},0)/n,sst=0,sr=0;xs.forEach(function(x,i){sst+=(ys[i]-my)*(ys[i]-my);var e=ys[i]-(c0+c1*x+c2*x*x);sr+=e*e});return {c:[c0,c1,c2],r2:sst?1-sr/sst:1,f:function(x){return c0+c1*x+c2*x*x}}}
function r2f(v){return (+v).toFixed(4)}
function sgn(v,d=4){return (v<0?' − ':' + ')+fmt(Math.abs(v),d==null?4:d)}
function eqLin(L,xv="x",yv="y"){return (yv||'y')+' = '+fmt(L.a,4)+(xv||'x')+sgn(L.b)}
function cols(t){return t.cols}
var TPL={
 tpc:{eng:'calib',grp:'Định lượng hợp chất',sym:'TPC',name:'TPC – Polyphenol tổng',desc:'Folin–Ciocalteu, chuẩn gallic acid, đo ở 765 nm. Kết quả theo mg GAE/g.',std:'Gallic acid',cu:'mg/L',wl:'765 nm',ru:'mg GAE/g'},
 tfc:{eng:'calib',grp:'Định lượng hợp chất',sym:'TFC',name:'TFC – Flavonoid tổng',desc:'Phương pháp AlCl₃, chuẩn quercetin, đo ở 415 nm. Kết quả theo mg QE/g.',std:'Quercetin',cu:'mg/L',wl:'415 nm',ru:'mg QE/g'},
 brad:{eng:'calib',grp:'Định lượng hợp chất',sym:'BSA',name:'Protein – Bradford',desc:'Chuẩn BSA, đo ở 595 nm. Kết quả theo mg protein/g.',std:'BSA',cu:'µg/mL',wl:'595 nm',ru:'mg/g'},
 dpph:{eng:'inh',grp:'Hoạt tính chống oxy hóa',sym:'DPPH',name:'DPPH – Bắt gốc tự do',desc:'% ức chế = (A₀ − Aₘ)/A₀ × 100, đo ở 517 nm. Tính IC₅₀ từ đường hồi quy.',wl:'517 nm'},
 abts:{eng:'inh',grp:'Hoạt tính chống oxy hóa',sym:'ABTS',name:'ABTS•⁺ – Bắt gốc cation',desc:'% ức chế gốc ABTS•⁺, đo ở 734 nm. Tính IC₅₀.',wl:'734 nm'},
 k1:{eng:'kin',order:1,grp:'Động học phản ứng',sym:'k₁',name:'Động học bậc 1',desc:'ln[A] = ln[A]₀ − k·t. Tính hằng số tốc độ k và chu kỳ bán hủy t½ = ln2/k.'},
 k2:{eng:'kin',order:2,grp:'Động học phản ứng',sym:'k₂',name:'Động học bậc 2',desc:'1/[A] = 1/[A]₀ + k·t. Tính k và t½ = 1/(k·[A]₀).'},
 k0:{eng:'kin',order:0,grp:'Động học phản ứng',sym:'k₀',name:'Động học bậc 0',desc:'[A] = [A]₀ − k·t. Tính k và t½ = [A]₀/(2k).'},
 lb:{eng:'lb',grp:'Động học phản ứng',sym:'Km',name:'Enzyme – Lineweaver–Burk',desc:'1/v = (Km/Vmax)·1/[S] + 1/Vmax. Tính Vmax và Km.'},
 xy:{eng:'xy',grp:'Tổng quát',sym:'XY',name:'Biểu đồ XY tùy chỉnh',desc:'Nhiều chuỗi dữ liệu, dạng điểm, đường hoặc cột, có đường xu hướng.'}
};
var ENG={
 calib:{tables:function(ch){var t=TPL[ch.tpl];return [{k:'std',name:'Đường chuẩn '+t.std,cols:[['x','C '+t.std+' ('+t.cu+')'],['y','Độ hấp thụ A']]},{k:'smp',name:'Mẫu cần xác định',cols:[['n','Tên mẫu'],['a','Độ hấp thụ A'],['df','Hệ số pha loãng'],['v','V dịch chiết (mL)'],['m','m mẫu (g)']]}]},
  seed:function(id){var S1={tpc:[[0,.012],[20,.215],[40,.428],[60,.631],[80,.842],[100,1.046]],tfc:[[0,.005],[10,.112],[20,.228],[40,.447],[60,.671],[80,.889]],brad:[[0,.002],[100,.098],[200,.201],[400,.389],[600,.571],[800,.746]]}[id];
   return {std:S1.map(function(r){return r.map(String)}),smp:id==='brad'?[['Dịch chiết lá','0.312','5','10','0.5'],['Hạt đậu','0.488','5','10','0.5']]:[['Cao chiết A','0.512','10','25','1.0'],['Cao chiết B','0.387','10','25','1.0'],['Lá trà xanh','0.745','20','25','1.0']]}},
  run:function(ch,t){var d=ch.data,P=[];(d.std||[]).forEach(function(r){var x=num(r[0]),y=num(r[1]);if(x!=null&&y!=null)P.push({x:x,y:y})});var L=lin(P.map(function(p){return p.x}),P.map(function(p){return p.y}));
   var out: any={xl:'Nồng độ '+t.std+' ('+t.cu+')',yl:'Độ hấp thụ A ('+t.wl+')',series:[{name:'Chuẩn '+t.std,pts:P}],fits:[],eq:[],ann:[]};
   if(!L){out.res='<div class="need">Cần ít nhất 2 điểm chuẩn để dựng đường chuẩn.</div>';return out}
   out.fits.push({f:L.f,s:0,name:'Hồi quy tuyến tính'});out.eq=[eqLin(L),'R² = '+r2f(L.r2)];
   var lod=3.3*L.se/L.a,loq=10*L.se/L.a,SP=[],rows='';
   (d.smp||[]).forEach(function(r){var a=num(r[1]);if(a==null)return;var c=(a-L.b)/L.a,df=num(r[2])||1,v=num(r[3]),m=num(r[4]),cc=c*df,val=v!=null&&m?cc*v/1000/m:null;SP.push({x:c,y:a,lab:r[0]});rows+='<tr><td>'+esc(r[0]||'—')+'</td><td>'+fmt(a,3)+'</td><td>'+fmt(c,3)+'</td><td>'+fmt(cc,3)+'</td><td><b>'+(val==null?'—':fmt(val,3))+'</b></td></tr>'});
   if(SP.length)out.series.push({name:'Mẫu',pts:SP,marker:'diamond',ci:2,noLine:true});
   out.res='<div class="kpis"><div><span>Phương trình</span><b>'+eqLin(L)+'</b></div><div><span>R²</span><b class="'+(L.r2>=.995?'ok':'warn')+'">'+r2f(L.r2)+'</b></div><div><span>LOD</span><b>'+fmt(lod,3)+' '+t.cu+'</b></div><div><span>LOQ</span><b>'+fmt(loq,3)+' '+t.cu+'</b></div></div>'+
    (rows?'<table class="dt"><thead><tr><th>Mẫu</th><th>A</th><th>C đo ('+t.cu+')</th><th>C × DF</th><th>'+t.ru+'</th></tr></thead><tbody>'+rows+'</tbody></table><p class="mt">Công thức: hàm lượng = C × DF × V(mL) / 1000 / m(g).</p>':'');
   if(L.r2<.99)out.res+='<div class="need">R² < 0.99: nên kiểm tra lại điểm chuẩn bất thường.</div>';
   return out}},
 inh:{tables:function(){return [{k:'d',name:'Số liệu đo quang (lặp lại tối đa 3 lần)',cols:[['c','Nồng độ mẫu'],['a1','A₁'],['a2','A₂'],['a3','A₃']]}]},
  params:[['a0','A₀ (mẫu trắng)','0.985'],['cu','Đơn vị nồng độ','µg/mL']],
  seed:function(id){return {d:id==='abts'?[['5','0.652','0.660','0.648'],['10','0.551','0.540','0.546'],['20','0.402','0.410','0.396'],['40','0.205','0.212','0.199'],['80','0.071','0.068','0.075']]:[['10','0.871','0.880','0.866'],['25','0.735','0.742','0.728'],['50','0.552','0.561','0.548'],['100','0.312','0.305','0.320'],['200','0.118','0.125','0.121']]}},
  pseed:function(id){return {a0:id==='abts'?'0.712':'0.985',cu:'µg/mL'}},
  run:function(ch,t){var a0=num(ch.params.a0),cu=ch.params.cu||'',P=[],rows='';
   var out: any={xl:'Nồng độ ('+cu+')',yl:'% ức chế',series:[],fits:[],eq:[],ann:[],hl:[{y:50,lab:'50 %'}]};
   if(!a0){out.res='<div class="need">Nhập A₀ của mẫu trắng.</div>';return out}
   (ch.data.d||[]).forEach(function(r){var c=num(r[0]);if(c==null)return;var I=[1,2,3].map(function(k){return num(r[k])}).filter(function(v){return v!=null}).map(function(a){return (a0-a)/a0*100});if(!I.length)return;var m=I.reduce(function(a,b){return a+b},0)/I.length,sd=I.length>1?Math.sqrt(I.reduce(function(a,b){return a+(b-m)*(b-m)},0)/(I.length-1)):0;P.push({x:c,y:m,e:sd});rows+='<tr><td>'+fmt(c,3)+'</td><td>'+I.length+'</td><td><b>'+fmt(m,2)+'</b></td><td>± '+fmt(sd,2)+'</td></tr>'});
   out.series.push({name:t.sym+' (% ức chế ± SD)',pts:P});
   var mode=ch.set.fit||'linear',L=mode==='log'?lin(P.filter(function(p){return p.x>0}).map(function(p){return Math.log10(p.x)}),P.filter(function(p){return p.x>0}).map(function(p){return p.y})):lin(P.map(function(p){return p.x}),P.map(function(p){return p.y}));
   var ic=null;if(L){ic=mode==='log'?Math.pow(10,(50-L.b)/L.a):(50-L.b)/L.a;out.fits.push({f:mode==='log'?function(x){return x>0?L.a*Math.log10(x)+L.b:NaN}:L.f,s:0,name:'Hồi quy'});out.eq=[mode==='log'?eqLin(L,'·log x'):eqLin(L),'R² = '+r2f(L.r2)];if(isFinite(ic)&&ic>0)out.ann.push({x:ic,y:50,lab:'IC₅₀ = '+fmt(ic,2)})}
   out.res='<div class="kpis"><div><span>IC₅₀</span><b class="ok">'+(ic!=null&&isFinite(ic)&&ic>0?fmt(ic,2)+' '+cu:'—')+'</b></div><div><span>Mô hình</span><b>'+(mode==='log'?'%I theo log C':'%I theo C')+'</b></div><div><span>R²</span><b>'+(L?r2f(L.r2):'—')+'</b></div><div><span>A₀</span><b>'+fmt(a0,3)+'</b></div></div><table class="dt"><thead><tr><th>C ('+esc(cu)+')</th><th>n</th><th>% ức chế</th><th>SD</th></tr></thead><tbody>'+rows+'</tbody></table>';
   return out}},
 kin:{tables:function(){return [{k:'d',name:'Nồng độ theo thời gian',cols:[['t','Thời gian t'],['c','[A]']]}]},
  params:[['tu','Đơn vị thời gian','min'],['cu','Đơn vị nồng độ','M']],
  seed:function(id){return {d:id==='k2'?[[0,.1],[10,.0667],[20,.05],[30,.04],[40,.0333],[60,.025],[80,.02]].map(function(r){return r.map(String)}):id==='k0'?[[0,1],[5,.9],[10,.81],[15,.7],[20,.6],[30,.41],[40,.2]].map(function(r){return r.map(String)}):[[0,1],[5,.78],[10,.61],[15,.47],[20,.37],[30,.22],[40,.135],[60,.05]].map(function(r){return r.map(String)})}},
  pseed:function(){return {tu:'min',cu:'M'}},
  run:function(ch,t){var tu=ch.params.tu||'',cu=ch.params.cu||'',P=[];(ch.data.d||[]).forEach(function(r){var x=num(r[0]),y=num(r[1]);if(x!=null&&y!=null&&y>0)P.push({x:x,y:y})});
   var tr=[function(c){return c},function(c){return Math.log(c)},function(c){return 1/c}],lab=['[A]','ln[A]','1/[A]'],o=t.order,fits=[0,1,2].map(function(k){return lin(P.map(function(p){return p.x}),P.map(function(p){return tr[k](p.y)}))});
   var L=fits[o],view=ch.set.view||'lin',out:any={xl:'Thời gian ('+tu+')',yl:view==='raw'?'[A] ('+cu+')':lab[o]+(o===0?' ('+cu+')':o===2?' ('+cu+'⁻¹)':''),series:[],fits:[],eq:[],ann:[]};
   if(!L){out.res='<div class="need">Cần ít nhất 2 điểm có nồng độ dương.</div>';out.series.push({name:'[A]',pts:P});return out}
   var k=o===2?L.a:-L.a,A0=o===0?L.b:o===1?Math.exp(L.b):1/L.b,th=o===0?A0/(2*k):o===1?Math.LN2/k:1/(k*A0);
   if(view==='raw'){out.series.push({name:'[A] thực nghiệm',pts:P});out.fits.push({f:o===0?function(x){return A0-k*x}:o===1?function(x){return A0*Math.exp(-k*x)}:function(x){return 1/(1/A0+k*x)},s:0,name:'Mô hình bậc '+o});out.eq=['[A] = '+(o===0?fmt(A0,4)+' − '+fmt(k,4)+'·t':o===1?fmt(A0,4)+'·e^(−'+fmt(k,4)+'·t)':'1 / ('+fmt(1/A0,3)+' + '+fmt(k,4)+'·t)')]}
   else{out.series.push({name:lab[o],pts:P.map(function(p){return {x:p.x,y:tr[o](p.y)}})});out.fits.push({f:L.f,s:0,name:'Hồi quy'});out.eq=[eqLin(L,'t',lab[o]),'R² = '+r2f(L.r2)]}
   if(isFinite(th)&&th>0&&view==='raw')out.ann.push({x:th,y:A0/2,lab:'t½ = '+fmt(th,2)});
   var ku=o===0?cu+'·'+tu+'⁻¹':o===1?tu+'⁻¹':cu+'⁻¹·'+tu+'⁻¹',best=[0,1,2].reduce(function(a,b){return fits[b]&&(!fits[a]||fits[b].r2>fits[a].r2)?b:a},0);
   out.res='<div class="kpis"><div><span>Hằng số tốc độ k</span><b class="ok">'+sci(k).replace(/<[^>]+>/g,function(m){return m})+' '+ku+'</b></div><div><span>t½</span><b>'+(isFinite(th)&&th>0?fmt(th,3)+' '+tu:'—')+'</b></div><div><span>[A]₀ (hồi quy)</span><b>'+fmt(A0,4)+' '+cu+'</b></div><div><span>R²</span><b>'+r2f(L.r2)+'</b></div></div>'+
    '<table class="dt"><thead><tr><th>Bậc phản ứng</th><th>Đồ thị tuyến tính</th><th>R²</th><th></th></tr></thead><tbody>'+[0,1,2].map(function(b){return '<tr'+(b===o?' style="background:var(--g50)"':'')+'><td>Bậc '+b+'</td><td>'+lab[b]+' theo t</td><td><b>'+(fits[b]?r2f(fits[b].r2):'—')+'</b></td><td>'+(b===best?'<span class="badge2">Phù hợp nhất</span>':'')+'</td></tr>'}).join('')+'</tbody></table>'+(best!==o?'<div class="need">Dữ liệu phù hợp với bậc '+best+' hơn (R² cao hơn). Thử mẫu <a href="#" data-act="switchTpl" data-k="k'+best+'">Động học bậc '+best+'</a>.</div>':'');
   return out}},
 lb:{tables:function(){return [{k:'d',name:'Vận tốc đầu theo nồng độ cơ chất',cols:[['s','[S]'],['v','v₀']]}]},
  params:[['su','Đơn vị [S]','mM'],['vu','Đơn vị v₀','µmol/min']],
  seed:function(){return {d:[[0.5,.33],[1,.5],[2,.667],[4,.8],[8,.889]].map(function(r){return r.map(String)})}},
  pseed:function(){return {su:'mM',vu:'µmol/min'}},
  run:function(ch){var su=ch.params.su||'',vu=ch.params.vu||'',P=[];(ch.data.d||[]).forEach(function(r){var s=num(r[0]),v=num(r[1]);if(s&&v)P.push({s:s,v:v})});var L=lin(P.map(function(p){return 1/p.s}),P.map(function(p){return 1/p.v})),view=ch.set.view||'lin';
   var out: any={xl:view==='raw'?'[S] ('+su+')':'1/[S] ('+su+'⁻¹)',yl:view==='raw'?'v₀ ('+vu+')':'1/v₀',series:[],fits:[],eq:[],ann:[]};
   if(!L){out.res='<div class="need">Cần ít nhất 2 điểm.</div>';return out}var Vm=1/L.b,Km=L.a/L.b;
   if(view==='raw'){out.series.push({name:'v₀',pts:P.map(function(p){return {x:p.s,y:p.v}})});out.fits.push({f:function(x){return Vm*x/(Km+x)},s:0,name:'Michaelis–Menten'});out.eq=['v = '+fmt(Vm,3)+'·[S] / ('+fmt(Km,3)+' + [S])'];out.hl=[{y:Vm,lab:'Vmax'}]}
   else{out.series.push({name:'1/v₀',pts:P.map(function(p){return {x:1/p.s,y:1/p.v}})});out.fits.push({f:L.f,s:0,name:'Hồi quy'});out.eq=[eqLin(L,'·(1/[S])','1/v'),'R² = '+r2f(L.r2)]}
   out.res='<div class="kpis"><div><span>Vmax</span><b class="ok">'+fmt(Vm,4)+' '+vu+'</b></div><div><span>Km</span><b class="ok">'+fmt(Km,4)+' '+su+'</b></div><div><span>Km/Vmax</span><b>'+fmt(L.a,4)+'</b></div><div><span>R²</span><b>'+r2f(L.r2)+'</b></div></div>';return out}},
 xy:{tables:function(ch){var c=[['x',ch&&ch.params.xn||'X']];(ch?ch.params.sn:['Chuỗi 1','Chuỗi 2']).forEach(function(n,i){c.push(['y'+i,n])});return [{k:'d',name:'Dữ liệu',cols:c,dyn:true}]},
  params:[['xn','Tên cột X','Nhiệt độ (°C)']],
  seed:function(){return {d:[['60','4.8','3.9'],['65','5.2','4.3'],['70','5.6','4.6'],['75','6.0','4.8'],['80','6.3','5.1'],['85','6.1','5.0']]}},
  pseed:function(){return {xn:'Nhiệt độ (°C)',sn:['Ethanol 96%','Methanol']}},
  run:function(ch){var cats=[],ser=(ch.params.sn||[]).map(function(n,i){var P=[];(ch.data.d||[]).forEach(function(r,j){var x=num(r[0]),y=num(r[i+1]);if(ch.set.type==='bar'){if(i===0)cats.push(r[0]);if(y!=null)P.push({x:j,y:y})}else if(x!=null&&y!=null)P.push({x:x,y:y})});return {name:n,pts:P}});
   var out: any={xl:ch.params.xn||'X',yl:ch.params.yn||'Y',series:ser,fits:[],eq:[],ann:[],cats:ch.set.type==='bar'?cats:null},tr=ch.set.trend||'none',rows='';
   if(tr!=='none'&&ch.set.type!=='bar')ser.forEach(function(s,i){var xs=s.pts.map(function(p){return p.x}),ys=s.pts.map(function(p){return p.y}),F=null,e='';
    if(tr==='linear'){F=lin(xs,ys);if(F)e=eqLin(F)}else if(tr==='poly2'){F=poly2(xs,ys);if(F)e='y = '+fmt(F.c[2],5)+'x²'+sgn(F.c[1])+'x'+sgn(F.c[0])}
    else if(tr==='exp'){var ok=s.pts.filter(function(p){return p.y>0}),G=lin(ok.map(function(p){return p.x}),ok.map(function(p){return Math.log(p.y)}));if(G){var A=Math.exp(G.b);F={r2:G.r2,f:function(x){return A*Math.exp(G.a*x)}};e='y = '+fmt(A,4)+'·e^('+fmt(G.a,4)+'x)'}}
    else if(tr==='log'){var ok2=s.pts.filter(function(p){return p.x>0}),H=lin(ok2.map(function(p){return Math.log(p.x)}),ok2.map(function(p){return p.y}));if(H){F={r2:H.r2,f:function(x){return x>0?H.a*Math.log(x)+H.b:NaN}};e='y = '+fmt(H.a,4)+'·ln x'+sgn(H.b)}}
    if(F){out.fits.push({f:F.f,s:i,name:s.name});rows+='<tr><td><i class="sw" style="background:'+(ch.set.colors[i]||PAL[i%8])+'"></i>'+esc(s.name)+'</td><td>'+e+'</td><td><b>'+r2f(F.r2)+'</b></td></tr>'}});
   out.res=rows?'<table class="dt"><thead><tr><th>Chuỗi</th><th>Phương trình xu hướng</th><th>R²</th></tr></thead><tbody>'+rows+'</tbody></table>':'<p class="mt">Bật đường xu hướng trong phần Tùy chỉnh để xem phương trình hồi quy.</p>';
   var st=ser.map(function(s){var ys=s.pts.map(function(p){return p.y});if(!ys.length)return '';var m=ys.reduce(function(a,b){return a+b},0)/ys.length;return '<div><span>'+esc(s.name)+'</span><b>max '+fmt(Math.max.apply(null,ys),3)+' · TB '+fmt(m,3)+'</b></div>'}).join('');
   out.res='<div class="kpis">'+st+'</div>'+out.res;return out}}
};
function E(ch){return ENG[TPL[ch.tpl].eng]}
function defSet(tpl){return {title:'',sub:'',xl:'',yl:'',xmin:'',xmax:'',ymin:'',ymax:'',grid:true,legend:true,eq:true,err:true,lab:true,ms:6,lw:2,type:'scatter',trend:tpl==='xy'?'linear':'none',fit:'linear',view:'lin',colors:PAL.slice(),font:13,marker:'circle'}}
function newChart(tpl,pid: string|null=null){var t=TPL[tpl],e=ENG[t.eng],ch={id:uid(),tpl:tpl,name:t.name,project:pid||null,params:e.pseed?e.pseed(tpl):{},data:e.seed(tpl),set:defSet(tpl),updated:Date.now()};return ch}
function charts(){if(!S.charts){var a=newChart('tpc'),b=newChart('dpph'),c=newChart('k1');var p2=S.projects[1];a.project=p2&&p2.id;b.project=p2&&p2.id;b.name='DPPH – cao chiết curcumin';a.name='TPC – cao chiết nghệ';c.name='Phân hủy H₂O₂ – bậc 1';S.charts=[a,b,c]}return S.charts}
function findC(id){return charts().find(function(c){return c.id===id})}

/* --- SVG plot renderer --- */
function nice(lo,hi,n){if(lo===hi){lo-=1;hi+=1}var sp=hi-lo,st=Math.pow(10,Math.floor(Math.log10(sp/n))),er=n/sp*st;if(er<=.15)st*=10;else if(er<=.35)st*=5;else if(er<=.75)st*=2;return {lo:Math.floor(lo/st+1e-9)*st,hi:Math.ceil(hi/st-1e-9)*st,st:st}}
function mk(m,x,y,r,c,fill){if(m==='square')return '<rect x="'+(x-r)+'" y="'+(y-r)+'" width="'+2*r+'" height="'+2*r+'" fill="'+fill+'" stroke="'+c+'" stroke-width="2"/>';if(m==='diamond')return '<path d="M'+x+' '+(y-r*1.3)+'L'+(x+r*1.3)+' '+y+'L'+x+' '+(y+r*1.3)+'L'+(x-r*1.3)+' '+y+'Z" fill="'+fill+'" stroke="'+c+'" stroke-width="2"/>';if(m==='triangle')return '<path d="M'+x+' '+(y-r*1.3)+'L'+(x+r*1.2)+' '+(y+r*.9)+'L'+(x-r*1.2)+' '+(y+r*.9)+'Z" fill="'+fill+'" stroke="'+c+'" stroke-width="2"/>';return '<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+fill+'" stroke="'+c+'" stroke-width="2"/>'}
function plotSVG(ch,o,W,H,mini){var s=ch.set,fs=mini?0:+s.font||13,F='font-family="Be Vietnam Pro, Arial, sans-serif"',FM='font-family="Be Vietnam Pro, Arial, sans-serif"';
 var title=s.title||ch.name,L=mini?8:62,R=mini?8:24,T=mini?8:(title?62:24)+(s.sub?16:0),B=mini?8:58,pw=W-L-R,ph=H-T-B,bar=!!o.cats;
 var xs=[],ys=[];o.series.forEach(function(se){se.pts.forEach(function(p){xs.push(p.x);ys.push(p.y);if(s.err&&p.e){ys.push(p.y+p.e);ys.push(p.y-p.e)}})});(o.hl||[]).forEach(function(h){ys.push(h.y)});
 if(!xs.length){xs=[0,1];ys=[0,1]}var x0=Math.min.apply(null,xs),x1=Math.max.apply(null,xs);
 if(bar){x0=-.5;x1=o.cats.length-.5;ys.push(0)}else{var pad=(x1-x0)*.06||1;x0-=pad;x1+=pad;if(Math.min.apply(null,xs)>=0&&x0<0&&Math.min.apply(null,xs)<(x1-x0)*.3)x0=0}
 o.fits.forEach(function(f){for(var i=0;i<=40;i++){var v=f.f(x0+(x1-x0)*i/40);if(isFinite(v))ys.push(v)}});
 var y0=Math.min.apply(null,ys),y1=Math.max.apply(null,ys);var yp=(y1-y0)*.08||1;y0-=yp;y1+=yp;if(Math.min.apply(null,ys)>=0&&y0<0)y0=0;
 var nx=bar?null:nice(num(s.xmin)!=null?num(s.xmin):x0,num(s.xmax)!=null?num(s.xmax):x1,mini?3:6),ny=nice(num(s.ymin)!=null?num(s.ymin):y0,num(s.ymax)!=null?num(s.ymax):y1,mini?3:6);
 if(!bar){x0=num(s.xmin)!=null?num(s.xmin):nx.lo;x1=num(s.xmax)!=null?num(s.xmax):nx.hi}y0=num(s.ymin)!=null?num(s.ymin):ny.lo;y1=num(s.ymax)!=null?num(s.ymax):ny.hi;if(x1<=x0)x1=x0+1;if(y1<=y0)y1=y0+1;
 var X=function(v){return L+(v-x0)/(x1-x0)*pw},Y=function(v){return T+(1-(v-y0)/(y1-y0))*ph},cid='cp'+ch.id+(mini?'m':'');
 var g='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'"><rect width="'+W+'" height="'+H+'" fill="#fff"/><defs><clipPath id="'+cid+'"><rect x="'+L+'" y="'+T+'" width="'+pw+'" height="'+ph+'"/></clipPath></defs>';
 if(!mini&&title)g+='<text x="'+L+'" y="30" '+F+' font-size="'+(fs+5)+'" font-weight="700" fill="#13292A">'+esc(title)+'</text>';
 if(!mini&&s.sub)g+='<text x="'+L+'" y="'+(title?50:30)+'" '+F+' font-size="'+(fs-1)+'" fill="#7D918C">'+esc(s.sub)+'</text>';
 if(!mini){for(var v=ny.lo;v<=y1+1e-9;v+=ny.st){if(v<y0-1e-9)continue;g+=(s.grid?'<line x1="'+L+'" x2="'+(L+pw)+'" y1="'+Y(v)+'" y2="'+Y(v)+'" stroke="#E8EFED"/>':'')+'<text x="'+(L-8)+'" y="'+(Y(v)+4)+'" text-anchor="end" '+FM+' font-size="'+(fs-2)+'" fill="#7D918C">'+fmt(v,4)+'</text>'}
  if(bar)o.cats.forEach(function(c,i){g+='<text x="'+X(i)+'" y="'+(T+ph+18)+'" text-anchor="middle" '+FM+' font-size="'+(fs-2)+'" fill="#7D918C">'+esc(c)+'</text>'});
  else for(v=nx.lo;v<=x1+1e-9;v+=nx.st){if(v<x0-1e-9)continue;g+=(s.grid?'<line y1="'+T+'" y2="'+(T+ph)+'" x1="'+X(v)+'" x2="'+X(v)+'" stroke="#F0F4F2"/>':'')+'<text x="'+X(v)+'" y="'+(T+ph+18)+'" text-anchor="middle" '+FM+' font-size="'+(fs-2)+'" fill="#7D918C">'+fmt(v,4)+'</text>'}
  g+='<line x1="'+L+'" x2="'+(L+pw)+'" y1="'+(T+ph)+'" y2="'+(T+ph)+'" stroke="#13292A" stroke-width="1.2"/><line x1="'+L+'" x2="'+L+'" y1="'+T+'" y2="'+(T+ph)+'" stroke="#13292A" stroke-width="1.2"/>';
  g+='<text x="'+(L+pw/2)+'" y="'+(H-14)+'" text-anchor="middle" '+F+' font-size="'+fs+'" font-weight="600" fill="#2E3F3D">'+esc(s.xl||o.xl)+'</text><text transform="translate(18 '+(T+ph/2)+') rotate(-90)" text-anchor="middle" '+F+' font-size="'+fs+'" font-weight="600" fill="#2E3F3D">'+esc(s.yl||o.yl)+'</text>'}
 g+='<g clip-path="url(#'+cid+')">';
 (o.hl||[]).forEach(function(h){g+='<line x1="'+L+'" x2="'+(L+pw)+'" y1="'+Y(h.y)+'" y2="'+Y(h.y)+'" stroke="#C1654E" stroke-dasharray="4 4" stroke-width="1.2"/>'+(mini?'':'<text x="'+(L+pw-6)+'" y="'+(Y(h.y)-6)+'" text-anchor="end" '+FM+' font-size="'+(fs-2)+'" fill="#C1654E">'+esc(h.lab)+'</text>')});
 var col=function(i,se:any=null){return s.colors[se&&se.ci!=null?se.ci:i]||PAL[i%8]};
 if(bar){var ns=o.series.length,bw=Math.min(46,pw/o.cats.length*.75/ns);o.series.forEach(function(se,i){se.pts.forEach(function(p){var x=X(p.x)-bw*ns/2+i*bw;g+='<rect x="'+(x+1)+'" y="'+Math.min(Y(p.y),Y(0))+'" width="'+(bw-2)+'" height="'+Math.abs(Y(0)-Y(p.y))+'" rx="3" fill="'+col(i)+'"/>'})})}
 o.fits.forEach(function(f){var c=col(f.s,o.series[f.s]),d='',pen=false;for(var i=0;i<=120;i++){var xv=x0+(x1-x0)*i/120,yv=f.f(xv);if(!isFinite(yv)){pen=false;continue}d+=(pen?'L':'M')+X(xv).toFixed(1)+' '+Y(yv).toFixed(1);pen=true}g+='<path d="'+d+'" fill="none" stroke="'+c+'" stroke-width="'+(mini?1.5:+s.lw||2)+'" stroke-dasharray="'+(mini?'':'7 5')+'" opacity=".9"/>'});
 if(!bar)o.series.forEach(function(se,i){var c=col(i,se),pts=se.pts.slice().sort(function(a,b){return a.x-b.x});
  if((s.type==='line'&&ch.tpl==='xy')&&!se.noLine&&pts.length>1)g+='<path d="'+pts.map(function(p,k){return (k?'L':'M')+X(p.x).toFixed(1)+' '+Y(p.y).toFixed(1)}).join('')+'" fill="none" stroke="'+c+'" stroke-width="'+(+s.lw||2)+'"/>';
  pts.forEach(function(p){if(s.err&&p.e&&!mini){g+='<path d="M'+X(p.x)+' '+Y(p.y-p.e)+'V'+Y(p.y+p.e)+'M'+(X(p.x)-4)+' '+Y(p.y-p.e)+'h8M'+(X(p.x)-4)+' '+Y(p.y+p.e)+'h8" stroke="'+c+'" stroke-width="1.4"/>'}
   g+=mk(se.marker||(ch.tpl==='xy'?['circle','square','triangle','diamond'][i%4]:s.marker),X(p.x),Y(p.y),mini?2.5:+s.ms||6,c,se.marker==='diamond'?c:'#fff');
   if(p.lab&&s.lab&&!mini)g+='<text x="'+(X(p.x)+9)+'" y="'+(Y(p.y)-9)+'" '+F+' font-size="'+(fs-2)+'" font-weight="600" fill="'+c+'">'+esc(p.lab)+'</text>'})});
 o.ann.forEach(function(a){if(mini)return;g+='<line x1="'+X(a.x)+'" x2="'+X(a.x)+'" y1="'+Y(a.y)+'" y2="'+(T+ph)+'" stroke="#1FB5BD" stroke-dasharray="3 3"/><circle cx="'+X(a.x)+'" cy="'+Y(a.y)+'" r="5" fill="#1FB5BD"/><rect x="'+(X(a.x)+8)+'" y="'+(Y(a.y)+8)+'" width="'+(a.lab.length*7.2+16)+'" height="24" rx="6" fill="#13292A"/><text x="'+(X(a.x)+16)+'" y="'+(Y(a.y)+24)+'" '+FM+' font-size="'+(fs-2)+'" fill="#fff">'+esc(a.lab)+'</text>'});
 g+='</g>';
 if(!mini&&s.eq&&o.eq.length){var ew=Math.max.apply(null,o.eq.map(function(e){return e.length}))*(fs-2)*.62+20;g+='<rect x="'+(L+12)+'" y="'+(T+10)+'" width="'+ew+'" height="'+(o.eq.length*18+12)+'" rx="8" fill="#F4FAF7" stroke="#CFE3DC"/>'+o.eq.map(function(e,i){return '<text x="'+(L+22)+'" y="'+(T+28+i*18)+'" '+FM+' font-size="'+(fs-2)+'" fill="#1B3F3B">'+esc(e)+'</text>'}).join('')}
 if(!mini&&s.legend){var items=o.series.map(function(se,i){return [se.name,col(i,se),se.marker||(ch.tpl==='xy'?['circle','square','triangle','diamond'][i%4]:s.marker),se.marker==='diamond'?col(i,se):'#fff']}).concat(o.fits.length&&ch.tpl!=='xy'?[[o.fits[0].name,col(0),'line']]:[]);var lw=Math.max.apply(null,items.map(function(it){return it[0].length}))*(fs-2)*.6+40;
  g+='<rect x="'+(L+pw-lw-10)+'" y="'+(T+10)+'" width="'+lw+'" height="'+(items.length*20+10)+'" rx="8" fill="#fff" fill-opacity=".92" stroke="#DDE8E4"/>'+items.map(function(it,i){var yy=T+25+i*20,xx=L+pw-lw+4;return (it[2]==='line'?'<line x1="'+(xx-4)+'" x2="'+(xx+14)+'" y1="'+yy+'" y2="'+yy+'" stroke="'+it[1]+'" stroke-width="2" stroke-dasharray="5 3"/>':mk(it[2],xx+5,yy,4.5,it[1],it[3]))+'<text x="'+(xx+22)+'" y="'+(yy+4)+'" '+F+' font-size="'+(fs-2)+'" fill="#2E3F3D">'+esc(it[0])+'</text>'}).join('')}
 return g+'</svg>'}
function chartSVG(ch,W,H,mini=false){var o=E(ch).run(ch,TPL[ch.tpl]);return {svg:plotSVG(ch,o,W||800,H||500,mini),o:o}}

/* --- chart views --- */
function vChart(){var ch=route.id?findC(route.id):null;if(route.id&&!ch){go('chart');return '<div class="view"></div>'}return ch?vChartEd(ch):vChartLib()}
function vChartLib(){crumb(['Không gian làm việc','Biểu đồ']);var grp=[];Object.keys(TPL).forEach(function(k){if(grp.indexOf(TPL[k].grp)<0)grp.push(TPL[k].grp)});var cs=charts();
 return '<div class="view"><div class="phead"><div><h1 style="margin:6px 0 0;font-family:var(--head);font-size:26px;font-weight:800;letter-spacing:.06em;text-transform:uppercase">Biểu đồ</h1></div><div class="legendrow"><span>Chọn mẫu, nhập dữ liệu. Biểu đồ tự cập nhật.</span></div></div>'+
 '<div class="card"><div class="ch"><div><h3>Biểu đồ của bạn</h3><p>'+cs.length+' biểu đồ</p></div></div><div class="clib">'+(cs.length?cs.map(function(c){var p=c.project?findP(c.project):null;return '<a class="cthumb" href="#/chart/'+c.id+'"><div class="tsvg">'+chartSVG(c,320,190,true).svg+'</div><div class="tm"><span class="cs">'+TPL[c.tpl].sym+'</span><div><b>'+esc(c.name)+'</b><small>'+(p?codeOf(p)+' · '+esc(p.name):'Chưa gắn dự án')+'</small></div></div></a>'}).join(''):'<p class="mt" style="padding:0 4px 8px">Chưa có biểu đồ. Chọn mẫu bên dưới để tạo.</p>')+'</div></div>'+
 grp.map(function(g){return '<div><div class="tagm" style="margin:0 0 10px">'+g+'</div><div class="tgal">'+Object.keys(TPL).filter(function(k){return TPL[k].grp===g}).map(function(k){var t=TPL[k];return '<button class="tcard" data-act="newChart" data-k="'+k+'"><span class="cs big2">'+t.sym+'</span><b>'+t.name+'</b><small>'+t.desc+'</small><span class="go">Tạo biểu đồ <svg class="i"><use href="#i-right"/></svg></span></button>'}).join('')+'</div></div>'}).join('')+'</div>'}
function sheetHTML(ch){var e=E(ch);return e.tables(ch).map(function(t){var rows=ch.data[t.k]=ch.data[t.k]||[];return '<div class="sheet"><div class="shh"><b>'+t.name+'</b><span class="sp"></span>'+(t.dyn?'<button class="btn sm" data-act="addSer">+ Cột</button>':'')+'<button class="btn sm" data-act="addRow" data-t="'+t.k+'">+ Dòng</button><button class="btn sm dg" data-act="clrSheet" data-t="'+t.k+'">Xóa</button></div><div class="shw"><table class="grid"><thead><tr><th class="rn">#</th>'+t.cols.map(function(c,j){return '<th>'+(t.dyn?'<input class="hdr" data-hdr="'+j+'" value="'+esc(c[1])+'">'+(j>1?'<button class="x" data-act="delSer" data-j="'+(j-1)+'" aria-label="Xóa cột">×</button>':''):esc(c[1]))+'<span class="cl">'+String.fromCharCode(65+j)+'</span></th>'}).join('')+'<th class="rn"></th></tr></thead><tbody>'+
  rows.map(function(r,i){return '<tr><td class="rn">'+(i+1)+'</td>'+t.cols.map(function(c,j){return '<td><input data-sh="'+t.k+'|'+i+'|'+j+'" value="'+esc(r[j]==null?'':r[j])+'"'+(c[0]==='n'?' class="txt"':' inputmode="decimal"')+'></td>'}).join('')+'<td class="rn"><button class="x" data-act="delRow" data-t="'+t.k+'" data-i="'+i+'" aria-label="Xóa dòng">×</button></td></tr>'}).join('')+'</tbody></table></div></div>'}).join('')+'<p class="mt">Mẹo: sao chép vùng dữ liệu từ Excel rồi dán (Ctrl+V) vào một ô bất kỳ. Enter để xuống dòng.</p>'}
function setHTML(ch){var s=ch.set,e=E(ch),t=TPL[ch.tpl],o=E(ch).run(ch,t);
 var f=function(k,l,ph){return '<label class="sf"><span>'+l+'</span><input class="ipt" data-set="'+k+'" value="'+esc(s[k])+'" placeholder="'+esc(ph||'')+'"></label>'},cb=function(k,l){return '<label class="sw2"><input type="checkbox" data-set="'+k+'"'+(s[k]?' checked':'')+'><span>'+l+'</span></label>'};
 var sel=function(k,l,op){return '<label class="sf"><span>'+l+'</span><select class="sel" data-set="'+k+'">'+op.map(function(x){return '<option value="'+x[0]+'"'+(s[k]===x[0]?' selected':'')+'>'+x[1]+'</option>'}).join('')+'</select></label>'};
 var h='<div class="sgrp"><small>Tiêu đề & nhãn</small>'+f('title','Tiêu đề',ch.name)+f('sub','Phụ đề','VD: n = 3, 25 °C')+f('xl','Nhãn trục X',o.xl)+f('yl','Nhãn trục Y',o.yl)+'</div>';
 h+='<div class="sgrp"><small>Kiểu & mô hình</small>';
 if(ch.tpl==='xy')h+=sel('type','Dạng biểu đồ',[['scatter','Điểm'],['line','Đường nối'],['bar','Cột']])+sel('trend','Đường xu hướng',[['none','Không'],['linear','Tuyến tính'],['poly2','Đa thức bậc 2'],['exp','Hàm mũ'],['log','Logarit']]);
 if(t.eng==='inh')h+=sel('fit','Mô hình IC₅₀',[['linear','%I theo C'],['log','%I theo log C']]);
 if(t.eng==='kin')h+=sel('view','Hiển thị',[['lin','Đồ thị tuyến tính hóa'],['raw','[A] theo t + mô hình']]);
 if(t.eng==='lb')h+=sel('view','Hiển thị',[['lin','Lineweaver–Burk (1/v theo 1/[S])'],['raw','Michaelis–Menten (v theo [S])']]);
 if(ch.tpl!=='xy')h+=sel('marker','Kiểu điểm',[['circle','Tròn'],['square','Vuông'],['triangle','Tam giác'],['diamond','Thoi']]);
 h+='<div class="sf2"><label class="sf"><span>Cỡ điểm</span><input type="range" min="2" max="12" data-set="ms" value="'+s.ms+'"></label><label class="sf"><span>Độ dày đường</span><input type="range" min="1" max="5" data-set="lw" value="'+s.lw+'"></label><label class="sf"><span>Cỡ chữ</span><input type="range" min="10" max="18" data-set="font" value="'+s.font+'"></label></div></div>';
 h+='<div class="sgrp"><small>Màu sắc</small><div class="colors">'+o.series.map(function(se,i){var ci=se.ci!=null?se.ci:i;return '<label><input type="color" data-sc="'+ci+'" value="'+(s.colors[ci]||PAL[ci%8])+'"><span>'+esc(se.name)+'</span></label>'}).join('')+'</div></div>';
 h+='<div class="sgrp"><small>Trục</small><div class="sf2">'+f('xmin','X min','tự động')+f('xmax','X max','tự động')+f('ymin','Y min','tự động')+f('ymax','Y max','tự động')+'</div></div>';
 h+='<div class="sgrp"><small>Hiển thị</small>'+cb('grid','Lưới')+cb('legend','Chú thích')+cb('eq','Phương trình & R²')+cb('err','Thanh sai số (SD)')+cb('lab','Nhãn điểm')+'</div>';
 if(e.params)h+='<div class="sgrp"><small>Tham số</small>'+e.params.filter(function(p){return p[0]!=='xn'}).map(function(p){return '<label class="sf"><span>'+p[1]+'</span><input class="ipt mono" data-par="'+p[0]+'" value="'+esc(ch.params[p[0]]||'')+'"></label>'}).join('')+(ch.tpl==='xy'?'<label class="sf"><span>Nhãn trục Y mặc định</span><input class="ipt" data-par="yn" value="'+esc(ch.params.yn||'')+'" placeholder="Y"></label>':'')+'</div>';
 return h+'<button class="btn" data-act="resetSet" style="width:100%">Khôi phục mặc định</button>'}
function vChartEd(ch){var t=TPL[ch.tpl],ps=all();crumb(['Biểu đồ',ch.name]);
 return '<div class="view"><div class="phead"><div style="min-width:0;flex:1"><div class="tagm"><a href="#/chart" class="back">← Thư viện biểu đồ</a><span class="code">'+t.sym+'</span><span>'+t.name+'</span></div><input class="ptitle" id="ctitle" value="'+esc(ch.name)+'" aria-label="Tên biểu đồ"><div class="pmeta"><span>'+t.desc+'</span></div></div>'+
 '<div class="pact"><select class="sel" id="cproj" aria-label="Gắn với dự án"><option value="">Chưa gắn dự án</option>'+ps.map(function(p){return '<option value="'+p.id+'"'+(ch.project===p.id?' selected':'')+'>'+codeOf(p)+' · '+esc(p.name)+'</option>'}).join('')+'</select>'+(ch.tpl==='xy'?'<button class="btn" data-act="fromProj">Lấy dữ liệu dự án</button>':'')+'<button class="btn" data-act="chartPng"><svg class="i"><use href="#i-down"/></svg>PNG</button><button class="btn" data-act="chartSvg">SVG</button><button class="btn dg" data-act="delChart"><svg class="i"><use href="#i-trash"/></svg></button></div></div>'+
 '<div class="ced"><div class="card cplot"><div id="plot"></div></div><aside class="card cset"><div class="ch"><div><h3>Tùy chỉnh</h3><p>Chỉnh biểu đồ sau khi dựng</p></div></div><div class="sbody" id="cset">'+setHTML(ch)+'</div></aside></div>'+
 '<div class="ced2"><div class="card"><div class="ch"><div><h3>Bảng số liệu</h3><p>Nhập hoặc dán dữ liệu như trên Excel</p></div><span class="tagm">sheet</span></div><div class="sbody" id="sheets">'+sheetHTML(ch)+'</div></div><div class="card"><div class="ch"><div><h3>Kết quả phân tích</h3><p>Tự tính từ bảng số liệu</p></div><span class="tagm">auto</span></div><div class="sbody" id="cres2"></div></div></div></div>'}
function drawChart(){var ch=findC(route.id);if(!ch||!$('plot'))return;var sm=innerWidth<700,r=chartSVG(ch,sm?560:860,sm?440:520);$('plot').innerHTML=r.svg;$('cres2').innerHTML=r.o.res||''}
var dct;function redraw(full=false){clearTimeout(dct);dct=setTimeout(function(){var ch=findC(route.id);if(!ch)return;ch.updated=Date.now();save();drawChart();if(full){var c=$('cset');if(c)c.innerHTML=setHTML(ch)}},90)}
function svgPng(svg,name,scale){var img=new Image(),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));img.onload=function(){var c=document.createElement('canvas');c.width=img.width*(scale||2);c.height=img.height*(scale||2);var x=c.getContext('2d');x.scale(scale||2,scale||2);x.drawImage(img,0,0);URL.revokeObjectURL(url);c.toBlob(function(b){var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){a.remove()},300)},'image/png')};img.src=url}
function chartEvents(e){var t=(e.target as HTMLInputElement),ch=findC(route.id);if(!ch)return false;
 if(t.dataset.sh){var p=t.dataset.sh.split('|'),rows=ch.data[p[0]];while(rows.length<=+p[1])rows.push([]);rows[+p[1]][+p[2]]=t.value;redraw();return true}
 if(t.dataset.set){var k=t.dataset.set;ch.set[k]=t.type==='checkbox'?t.checked:t.value;redraw(t.tagName==='SELECT');return true}
 if(t.dataset.sc!=null&&t.dataset.sc!==undefined){ch.set.colors[+t.dataset.sc]=t.value;redraw();return true}
 if(t.dataset.par){ch.params[t.dataset.par]=t.value;redraw();if(t.dataset.par==='cu'||t.dataset.par==='tu'){}return true}
 if(t.dataset.hdr){var j=+t.dataset.hdr;if(j===0)ch.params.xn=t.value;else ch.params.sn[j-1]=t.value;redraw();return true}
 if(t.id==='ctitle'){ch.name=t.value;redraw();return true}
 if(t.id==='cproj'){ch.project=t.value||null;save();toast(t.value?'Đã gắn biểu đồ vào dự án':'Đã bỏ gắn dự án');return true}
 return false}
document.addEventListener('paste',function(e){var t=(e.target as HTMLInputElement);if(!t.dataset||!t.dataset.sh)return;var tx=e.clipboardData?.getData('text')||'';if(!/[\t\n]/.test(tx))return;e.preventDefault();var ch=findC(route.id),p=t.dataset.sh.split('|'),rows=ch.data[p[0]],r0=+p[1],c0=+p[2];
 tx.replace(/\r/g,'').replace(/\n$/,'').split('\n').forEach(function(line,i){while(rows.length<=r0+i)rows.push([]);line.split('\t').forEach(function(v,j){rows[r0+i][c0+j]=v.trim().replace(',','.')})});$('sheets').innerHTML=sheetHTML(ch);redraw(true);toast('Đã dán dữ liệu')});
document.addEventListener('keydown',function(e){var t=(e.target as HTMLInputElement);if(!t.dataset||!t.dataset.sh)return;var p=t.dataset.sh.split('|'),r=+p[1];var mv=e.key==='Enter'||e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0;if(!mv)return;e.preventDefault();var nx=document.querySelector<any>('[data-sh="'+p[0]+'|'+(r+mv)+'|'+p[2]+'"]');if(!nx&&mv>0){var ch=findC(route.id);ch.data[p[0]].push([]);$('sheets').innerHTML=sheetHTML(ch);nx=document.querySelector<any>('[data-sh="'+p[0]+'|'+(r+1)+'|'+p[2]+'"]')}if(nx){nx.focus();nx.select()}});

/* ---------- EXPORT ---------- */
var XO={pid:null,sub:true,info:true,table:true,img:true,charts:true,yield:true,fmt:'pdf'};
function condTxt(st){var c=st.cond||{},a=[];COND.forEach(function(k){var v=k[0]==='pH'?c.pH:c[k[0]]&&c[k[0]].v;if(v!==undefined&&v!==''&&v!=null)a.push(k[1]+': '+v+(k[0]==='pH'?'':' '+(k[2]==='%'?'%':c[k[0]].u)))});return a}
function concTxt(st){var c=st.cond||{},a=[];st.chems.forEach(function(ch){var x=c.conc&&c.conc[ch.id];if(x&&x.v)a.push((ch.name||'?')+': '+x.v+' '+x.u)});return a}
function resTxt(st){var r=st.res||{},a=[];if(r.m0&&r.m0.v)a.push('m₀: '+r.m0.v+' '+r.m0.u);if(r.m1&&r.m1.v)a.push('m₁: '+r.m1.v+' '+r.m1.u);if(r.yield)a.push('η: '+r.yield+' %');return a}
function xList(){var p=findP(XO.pid);if(!p)return [];var a=[p];if(XO.sub)walk(p.children,function(c){a.push(c)});return a}
function reportHTML(){var list=xList();if(!list.length)return '<p>Chưa chọn dự án.</p>';var root=list[0],now=new Date();
 var ns=0,nst=0,yl=[];list.forEach(function(p){ns+=p.samples.length;p.samples.forEach(function(s){nst+=s.steps.length;var y=finalYield(s);if(y!=null)yl.push(y)})});
 var h='<div class="rp-h"><img src="'+document.querySelector<any>('.brand img').src+'" alt=""><div><b>MEMORY</b><small>LAB NOTEBOOK · BÁO CÁO DỰ ÁN</small></div><div class="rp-d">'+now.toLocaleDateString('vi-VN')+' '+now.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})+'<br>'+esc(S.user.name)+' · '+esc(S.user.lab||'')+'</div></div>';
 h+='<div class="rp-t"><span>'+codeOf(root)+'</span><h1>'+esc(root.name)+'</h1></div>';
 if(XO.info)h+='<div class="rp-k"><div><small>Trạng thái</small><b>'+(root.status==='done'?'Hoàn thành':'Đang thực hiện')+'</b></div><div><small>Dự án con</small><b>'+(list.length-1)+'</b></div><div><small>Mẫu</small><b>'+ns+'</b></div><div><small>Bước</small><b>'+nst+'</b></div><div><small>Hiệu suất TB</small><b>'+(yl.length?fmt(yl.reduce(function(a,b){return a+b},0)/yl.length,1)+' %':'—')+'</b></div><div><small>Cập nhật</small><b>'+fdate(root.updated)+'</b></div></div>';
 if(XO.yield){var bars=[];list.forEach(function(p){p.samples.forEach(function(s){var y=finalYield(s);if(y!=null)bars.push({c:s.code,y:y,p:codeOf(p)})})});if(bars.length){var m=Math.max.apply(null,bars.map(function(b){return b.y}));h+='<h2>Hiệu suất theo mẫu</h2><div class="rp-bars">'+bars.map(function(b){return '<div><span>'+esc(b.c)+' <em>'+b.p+'</em></span><i><b style="width:'+(b.y/m*100)+'%"></b></i><strong>'+fmt(b.y,1)+' %</strong></div>'}).join('')+'</div>'}}
 if(XO.table)list.forEach(function(p){if(!p.samples.length&&list.length>1)return;h+='<h2>'+codeOf(p)+' · '+esc(p.name)+' <em>'+(p.status==='done'?'Hoàn thành':'Đang thực hiện')+'</em></h2>';if(!p.samples.length){h+='<p class="rp-e">Không có mẫu thí nghiệm.</p>';return}
 h+='<table class="rp-tb"><thead><tr><th>Mã mẫu</th><th>Bước</th><th>Ngày</th><th>Quy trình</th><th>Hóa chất · Định lượng</th><th>Nồng độ</th><th>Điều kiện</th><th>Kết quả</th><th>Ghi chú</th></tr></thead><tbody>';
  p.samples.forEach(function(s){s.steps.forEach(function(st,i){h+='<tr>'+(i===0?'<td rowspan="'+s.steps.length+'" class="no">'+esc(s.code)+'</td>':'')+'<td class="c">'+(i+1)+'</td><td class="c">'+fdate(st.date)+'</td><td>'+esc(st.procText)+(st.procFile?'<div class="f">📎 '+esc(st.procFile.name)+'</div>':'')+'</td><td>'+st.chems.filter(function(c){return c.name}).map(function(c){return esc(c.name)+(c.amount?' · <b>'+esc(c.amount)+' '+esc(c.unit)+'</b>':'')}).join('<br>')+'</td><td>'+concTxt(st).map(esc).join('<br>')+'</td><td>'+condTxt(st).map(esc).join('<br>')+'</td><td>'+resTxt(st).map(esc).join('<br>')+'</td><td>'+esc(st.note)+'</td></tr>';
   if(XO.img&&st.images.some(function(im){return im.src}))h+='<tr class="im"><td colspan="9"><div>'+st.images.filter(function(im){return im.src}).map(function(im){return '<figure><img src="'+im.src+'" alt=""><figcaption>'+esc(im.name)+'</figcaption></figure>'}).join('')+'</div></td></tr>'})});
  h+='</tbody></table>'});
 if(XO.charts){var ids=list.map(function(p){return p.id}),cs=charts().filter(function(c){return ids.indexOf(c.project)>-1});if(cs.length){h+='<h2>Biểu đồ</h2>';cs.forEach(function(c){var r=chartSVG(c,760,440);h+='<div class="rp-c">'+r.svg+'<div class="rp-cr">'+(r.o.res||'')+'</div></div>'})}}
 h+='<div class="rp-f">Xuất từ MEMORY · '+now.toLocaleString('vi-VN')+' · Dữ liệu thuộc '+esc(S.user.lab||'phòng thí nghiệm')+'</div>';
 return h}
var RP_CSS='.paper{box-sizing:border-box;width:100%;max-width:794px;margin:0 auto;padding:44px 48px;background:#fff;color:#13292A;font-family:"Be Vietnam Pro",Arial,sans-serif;font-size:11.5px;line-height:1.5;box-shadow:0 20px 50px rgba(19,41,42,.14);border-radius:4px}'+
 '.paper *{box-sizing:border-box}.rp-h{display:flex;align-items:center;gap:12px;padding-bottom:14px;border-bottom:2px solid #2E5C57}.rp-h img{width:40px;height:40px;border-radius:6px}.rp-h b{display:block;font-size:17px;letter-spacing:.08em;color:#2E5C57}.rp-h small{font-family:"Be Vietnam Pro",Arial,sans-serif;font-size:9px;letter-spacing:.12em;color:#7D918C}.rp-d{margin-left:auto;text-align:right;font-family:"Be Vietnam Pro",Arial,sans-serif;font-size:10px;color:#55706A}'+
 '.rp-t{margin:22px 0 14px}.rp-t span{font-family:"Be Vietnam Pro",Arial,sans-serif;font-size:10px;padding:2px 8px;border-radius:5px;background:#2E5C57;color:#fff}.rp-t h1{margin:8px 0 0;font-size:24px;font-family:"Be Vietnam Pro",Arial,sans-serif}'+
 '.rp-k{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:18px}.rp-k div{padding:9px 10px;border:1px solid #DDE8E4;border-radius:8px;background:#F6FAF8}.rp-k small{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#7D918C}.rp-k b{font-size:13px}'+
 '.paper h2{margin:22px 0 10px;padding-bottom:6px;border-bottom:1px solid #DDE8E4;font-size:14px;color:#1B3F3B}.paper h2 em{font-style:normal;font-weight:500;font-size:10px;color:#7D918C;margin-left:6px}'+
 '.rp-bars{display:flex;flex-direction:column;gap:5px}.rp-bars div{display:grid;grid-template-columns:110px 1fr 54px;gap:8px;align-items:center}.rp-bars em{font-style:normal;font-family:"Be Vietnam Pro",Arial,sans-serif;font-size:9px;color:#7D918C}.rp-bars i{height:9px;border-radius:5px;background:#EBF1EF;overflow:hidden}.rp-bars i b{display:block;height:100%;background:linear-gradient(90deg,#5E9C8F,#2E5C57)}.rp-bars strong{font-family:"Be Vietnam Pro",Arial,sans-serif;text-align:right;font-weight:500}'+
 '.rp-tb{width:100%;border-collapse:collapse;font-size:10.5px}.rp-tb th{background:#1B3F3B;color:#fff;font-weight:600;text-align:left;padding:6px}.rp-tb td{border:1px solid #DDE8E4;padding:6px;vertical-align:top}.rp-tb td.no{font-family:"Be Vietnam Pro",Arial,sans-serif;font-weight:600;color:#2E5C57;text-align:center;vertical-align:middle;background:#F6FAF8}.rp-tb td.c{text-align:center}.rp-tb .f{margin-top:4px;color:#117C83}.rp-tb tr.im td{background:#FAFCFB}.rp-tb tr.im div{display:flex;flex-wrap:wrap;gap:8px}.rp-tb figure{margin:0;width:110px}.rp-tb figure img{width:110px;height:80px;object-fit:cover;border-radius:5px;display:block}.rp-tb figcaption{font-size:9px;color:#7D918C;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
 '.rp-e{color:#7D918C}.rp-c{margin-bottom:16px;border:1px solid #DDE8E4;border-radius:8px;padding:10px;break-inside:avoid}.rp-c svg{width:100%;height:auto;display:block}.rp-cr{font-size:10.5px}.rp-cr .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0}.rp-cr .kpis div{padding:6px 8px;border-radius:6px;background:#F6FAF8}.rp-cr .kpis span{display:block;font-size:9px;color:#7D918C}.rp-cr table{width:100%;border-collapse:collapse}.rp-cr th,.rp-cr td{border-bottom:1px solid #EBF1EF;padding:4px 6px;text-align:left}.rp-cr .need,.rp-cr .mt,.rp-cr .badge2{font-size:9.5px;color:#7D918C}.rp-cr i.sw{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px}'+
 '.rp-f{margin-top:26px;padding-top:10px;border-top:1px solid #DDE8E4;font-family:"Be Vietnam Pro",Arial,sans-serif;font-size:9px;color:#7D918C;text-align:center}';
function vExport(){crumb(['Không gian làm việc','Xuất dữ liệu']);var ps=all();if(!XO.pid||!findP(XO.pid))XO.pid=(S.lastP&&findP(S.lastP)?S.lastP:ps[0]&&ps[0].id);
 var fm=[['pdf','PDF','Báo cáo nhiều trang, sẵn sàng in','#C1654E'],['png','PNG','Ảnh toàn bộ báo cáo','#5F78BE'],['xlsx','Excel','Bảng tính .xlsx nhiều sheet','#2E9E73']];
 var cb=function(k,l,d){return '<label class="xo"><input type="checkbox" data-xo="'+k+'"'+(XO[k]?' checked':'')+'><span><b>'+l+'</b><small>'+d+'</small></span></label>'};
 return '<div class="view"><div class="phead"><div><h1 style="margin:6px 0 0;font-family:var(--head);font-size:26px;font-weight:800;letter-spacing:.06em;text-transform:uppercase">Xuất dữ liệu</h1></div><div class="legendrow"><span>Xem trước rồi xuất.</span></div></div>'+
 '<div class="xwrap"><aside class="xside"><div class="card"><div class="ch"><div><h3>1 · Chọn dự án</h3></div></div><div class="sbody"><select class="sel" id="xp" style="width:100%">'+ps.map(function(p){return '<option value="'+p.id+'"'+(p.id===XO.pid?' selected':'')+'>'+'  '.repeat(pathOf(p.id).length-1)+codeOf(p)+' · '+esc(p.name)+'</option>'}).join('')+'</select>'+cb('sub','Bao gồm dự án con','Xuất cả cây dự án bên dưới')+'</div></div>'+
 '<div class="card"><div class="ch"><div><h3>2 · Nội dung</h3></div></div><div class="sbody">'+cb('info','Thông tin chung','Trạng thái, số mẫu, hiệu suất TB')+cb('yield','Biểu đồ hiệu suất','So sánh hiệu suất các mẫu')+cb('table','Bảng thí nghiệm','Quy trình, hóa chất, điều kiện, kết quả')+cb('img','Hình ảnh','Ảnh đính kèm từng bước')+cb('charts','Biểu đồ đã gắn','Biểu đồ gắn với dự án')+'</div></div>'+
 '<div class="card"><div class="ch"><div><h3>3 · Định dạng</h3></div></div><div class="sbody"><div class="xfmt">'+fm.map(function(f){return '<button class="'+(XO.fmt===f[0]?'on':'')+'" data-act="xfmt" data-k="'+f[0]+'"><span class="fi" style="background:'+f[3]+'">'+(f[0]==='xlsx'?'XLS':f[1].toUpperCase())+'</span><b>'+f[1]+'</b><small>'+f[2]+'</small></button>'}).join('')+'</div><button class="btn pri" data-act="doExport" id="xbtn" style="width:100%;height:46px;margin-top:6px"><svg class="i"><use href="#i-down"/></svg>Xuất '+fm.find(function(f){return f[0]===XO.fmt})[1]+'</button></div></div></aside>'+
 '<section class="xprev"><div class="xbar"><span class="tagm">Xem trước</span><span class="tagm" id="xinfo"></span></div><div class="xscroll"><div class="paper" id="paper">'+reportHTML()+'</div></div></section></div></div>'}
/* -- tiny zip (store) + xlsx -- */
var CRC=(function(){var t=[];for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(b){var c=0xFFFFFFFF;for(var i=0;i<b.length;i++)c=CRC[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
function zip(files){var enc=new TextEncoder(),parts=[],cen=[],off=0;function u16(v){return [v&255,(v>>8)&255]}function u32(v){return [v&255,(v>>8)&255,(v>>16)&255,(v>>>24)&255]}
 files.forEach(function(f){var nm=enc.encode(f.n),d=typeof f.d==='string'?enc.encode(f.d):f.d,cr=crc32(d);var h=[].concat([0x50,0x4b,3,4],u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(cr),u32(d.length),u32(d.length),u16(nm.length),u16(0));parts.push(new Uint8Array(h),nm,d);
  cen.push(new Uint8Array([].concat([0x50,0x4b,1,2],u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(cr),u32(d.length),u32(d.length),u16(nm.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(off))),nm);off+=h.length+nm.length+d.length});
 var cs=cen.reduce(function(a,b){return a+b.length},0);return new Blob(parts.concat(cen,[new Uint8Array([].concat([0x50,0x4b,5,6],u16(0),u16(0),u16(files.length),u16(files.length),u32(cs),u32(off),u16(0)))]),{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})}
function xesc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]}).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'')}
function colL(i){var s='';i++;while(i>0){var m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26)}return s}
function xlsx(sheets){var ws=sheets.map(function(sh,si){var w=sh.rows[0]?sh.rows[0].map(function(_,j){return Math.min(60,Math.max(8,Math.max.apply(null,sh.rows.map(function(r){return String(r[j]==null?'':r[j]).length}))+2))}):[];
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">'+(sh.head?'<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>':'')+'</sheetView></sheetViews>'+(w.length?'<cols>'+w.map(function(x,j){return '<col min="'+(j+1)+'" max="'+(j+1)+'" width="'+x+'" customWidth="1"/>'}).join('')+'</cols>':'')+'<sheetData>'+
  sh.rows.map(function(r,i){return '<row r="'+(i+1)+'">'+r.map(function(v,j){var ref=colL(j)+(i+1),st=sh.head&&i===0?' s="1"':'';if(typeof v==='number'&&isFinite(v))return '<c r="'+ref+'"'+st+'><v>'+v+'</v></c>';return '<c r="'+ref+'" t="inlineStr"'+st+'><is><t xml:space="preserve">'+xesc(v)+'</t></is></c>'}).join('')+'</row>'}).join('')+'</sheetData></worksheet>'});
 var files=[{n:'[Content_Types].xml',d:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+ws.map(function(_,i){return '<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'}).join('')+'</Types>'},
  {n:'_rels/.rels',d:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
  {n:'xl/workbook.xml',d:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map(function(s,i){return '<sheet name="'+xesc(s.name.replace(/[\\\/\?\*\[\]:]/g,' ').slice(0,31))+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>'}).join('')+'</sheets></workbook>'},
  {n:'xl/_rels/workbook.xml.rels',d:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map(function(_,i){return '<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>'}).join('')+'<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
  {n:'xl/styles.xml',d:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2E5C57"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'}];
 ws.forEach(function(x,i){files.push({n:'xl/worksheets/sheet'+(i+1)+'.xml',d:x})});return zip(files)}
function nv(v){var n=num(v);return n==null?(v==null?'':String(v)):n}
function exportXlsx(){var list=xList(),root=list[0],sh=[];
 var ov=[['Thuộc tính','Giá trị'],['Dự án',root.name],['Mã',codeOf(root)],['Trạng thái',root.status==='done'?'Hoàn thành':'Đang thực hiện'],['Người thực hiện',S.user.name],['Phòng lab',S.user.lab||''],['Ngày xuất',new Date().toLocaleString('vi-VN')],['Số dự án',list.length],['Số mẫu',list.reduce(function(a,p){return a+p.samples.length},0)]];sh.push({name:'Tổng quan',rows:ov,head:true});
 var ex=[['Mã dự án','Dự án','Mẫu','Bước','Ngày thực hiện','Quy trình','Tệp quy trình','Hóa chất','pH','Nhiệt độ','Đơn vị T','Thời gian','Đơn vị t','Độ ẩm (%)','Áp suất','Đơn vị P','Nồng độ hóa chất','m0','Đơn vị m0','m1','Đơn vị m1','Hiệu suất (%)','Hình ảnh','Ghi chú']];
 var chm=[['Mã dự án','Mẫu','Bước','Hóa chất','Định lượng','Đơn vị','Nồng độ','Đơn vị nồng độ']];
 list.forEach(function(p){p.samples.forEach(function(s){s.steps.forEach(function(st,i){var c=st.cond||{},r=st.res||{},g=function(o,k){return o[k]&&o[k].v!=null?o[k]:{v:'',u:''}};
  ex.push([codeOf(p),p.name,s.code,i+1,fdate(st.date),st.procText,st.procFile?st.procFile.name:'',st.chems.map(function(x){return x.name+(x.amount?' ('+x.amount+' '+x.unit+')':'')}).join('; '),nv(c.pH),nv(g(c,'temp').v),g(c,'temp').u,nv(g(c,'time').v),g(c,'time').u,nv(g(c,'hum').v),nv(g(c,'pres').v),g(c,'pres').u,st.chems.map(function(x){var z=c.conc&&c.conc[x.id];return z&&z.v?x.name+': '+z.v+' '+z.u:''}).filter(Boolean).join('; '),nv(g(r,'m0').v),g(r,'m0').u,nv(g(r,'m1').v),g(r,'m1').u,nv(r.yield),st.images.map(function(x){return x.name}).join('; '),st.note]);
  st.chems.forEach(function(x){var z=c.conc&&c.conc[x.id]||{};chm.push([codeOf(p),s.code,i+1,x.name,nv(x.amount),x.unit,nv(z.v),z.u||''])})})})});
 sh.push({name:'Thí nghiệm',rows:ex,head:true});sh.push({name:'Hóa chất',rows:chm,head:true});
 var ids=list.map(function(p){return p.id});charts().filter(function(c){return ids.indexOf(c.project)>-1}).forEach(function(c,i){var rows=[];E(c).tables(c).forEach(function(t){rows.push([t.name]);rows.push(t.cols.map(function(x){return x[1]}));(c.data[t.k]||[]).forEach(function(r){rows.push(t.cols.map(function(_,j){return nv(r[j])}))});rows.push([])});var o=E(c).run(c,TPL[c.tpl]);if(o.eq.length){rows.push(['Kết quả']);o.eq.forEach(function(e){rows.push([e])})}sh.push({name:'BĐ'+(i+1)+' '+c.name,rows:rows})});
 dl(fname('xlsx'),xlsx(sh))}
function fname(ext){var p=findP(XO.pid);return 'MEMORY_'+codeOf(p)+'_'+(p.name.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').replace(/[^\w]+/g,'_').slice(0,40))+'.'+ext}
/* -- render report to canvas via SVG foreignObject -- */
function reportCanvas(cb){var src=$('paper'),W=794,clone=src.cloneNode(true);clone.style.cssText='width:794px;max-width:none;box-shadow:none;border-radius:0;margin:0';
 var hold=document.createElement('div');hold.style.cssText='position:fixed;left:-10000px;top:0;width:794px';hold.appendChild(clone);document.body.appendChild(hold);var H=Math.ceil(clone.getBoundingClientRect().height);
 clone.querySelectorAll('svg').forEach(function(s){s.setAttribute('width','100%');s.removeAttribute('height')});
 var xml=new XMLSerializer().serializeToString(clone);hold.remove();
 var svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>'+RP_CSS+'</style>'+xml+'</div></foreignObject></svg>';
 var img=new Image();img.onload=function(){var sc=2,c=document.createElement('canvas');c.width=W*sc;c.height=H*sc;var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.scale(sc,sc);x.drawImage(img,0,0);try{c.toDataURL();cb(c)}catch(e){cb(null,e)}};img.onerror=function(e){cb(null,e)};img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)}
function b64bin(d){var s=atob(d.split(',')[1]),u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u}
function pdfFromCanvas(c){var pw=595.28,ph=841.89,pxPage=Math.floor(c.width*ph/pw),pages=[],enc=new TextEncoder();
 for(var y=0;y<c.height;y+=pxPage){var h=Math.min(pxPage,c.height-y),pc=document.createElement('canvas');pc.width=c.width;pc.height=pxPage;var x=pc.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,pc.width,pc.height);x.drawImage(c,0,y,c.width,h,0,0,c.width,h);pages.push(b64bin(pc.toDataURL('image/jpeg',.9)))}
 var objs=[],n=pages.length;objs[1]='<< /Type /Catalog /Pages 2 0 R >>';objs[2]='<< /Type /Pages /Kids ['+pages.map(function(_,i){return (3+i*3)+' 0 R'}).join(' ')+'] /Count '+n+' >>';
 var chunks=[],off=0,xref=[];function add(s){var b=typeof s==='string'?enc.encode(s):s;chunks.push(b);off+=b.length}
 add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
 var put=function(id,body){xref[id]=off;add(id+' 0 obj\n');if(typeof body==='string')add(body+'\nendobj\n');else{body.forEach(add);add('\nendobj\n')}};
 put(1,objs[1]);put(2,objs[2]);
 pages.forEach(function(jpg,i){var pid=3+i*3,cid=pid+1,iid=pid+2,cs='q '+pw+' 0 0 '+ph+' 0 0 cm /Im'+i+' Do Q';
  put(pid,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pw+' '+ph+'] /Resources << /XObject << /Im'+i+' '+iid+' 0 R >> >> /Contents '+cid+' 0 R >>');
  put(cid,'<< /Length '+cs.length+' >>\nstream\n'+cs+'\nendstream');
  put(iid,['<< /Type /XObject /Subtype /Image /Width '+c.width+' /Height '+pxPage+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpg.length+' >>\nstream\n',jpg,'\nendstream'])});
 var total=3+n*3,xo=off;add('xref\n0 '+total+'\n0000000000 65535 f \n');for(var i=1;i<total;i++)add(String(xref[i]).padStart(10,'0')+' 00000 n \n');add('trailer\n<< /Size '+total+' /Root 1 0 R >>\nstartxref\n'+xo+'\n%%EOF');
 return {blob:new Blob(chunks,{type:'application/pdf'}),pages:n}}
function doExport(){var b=$('xbtn');if(!XO.pid)return;b.disabled=true;var old=b.innerHTML;b.innerHTML='Đang tạo tệp…';var done=function(m){b.disabled=false;b.innerHTML=old;if(m)toast(m)};
 if(XO.fmt==='xlsx'){try{exportXlsx();done('Đã xuất Excel')}catch(e){done('Không xuất được Excel')}return}
 reportCanvas(function(c,err){if(!c){done('Trình duyệt chặn kết xuất ảnh. Hãy dùng Chrome hoặc Edge, hoặc in trang (Ctrl+P → Lưu PDF).');return}
  if(XO.fmt==='png'){c.toBlob(function(bl){dl(fname('png'),bl);done('Đã xuất PNG')},'image/png')}
  else{var r=pdfFromCanvas(c);dl(fname('pdf'),r.blob);done('Đã xuất PDF · '+r.pages+' trang')}})}

/* ---------- render ---------- */
function render(){
 var v=$('view');var y=scrollY;
 var keepScroll=(route.v==='project'||route.v==='calc'||route.v==='chart'||route.v==='export')&&v.dataset.v===route.v&&v.dataset.id===route.id;
 var tw=document.querySelector<any>('.tblwrap'),tl=tw?tw.scrollLeft:0,tt=tw?tw.scrollTop:0;
 v.innerHTML=route.v==='menu'?vMenu():route.v==='project'?vProject():route.v==='calc'?vCalc():route.v==='export'?vExport():vChart();
 v.dataset.v=route.v;v.dataset.id=route.id||'';
 if(keepScroll){v.firstChild.style.animation='none';scrollTo(0,y);var t2=document.querySelector<any>('.tblwrap');if(t2){t2.scrollLeft=tl;t2.scrollTop=tt}}else scrollTo(0,0);
 renderTree();renderUser();renderBell();
 if(STORE.role==='viewer'){(v as HTMLElement).querySelectorAll('input,textarea,select,button[data-act],button[data-step]').forEach(function(el){if(!el.matches('[data-go],[data-goP]'))(el as HTMLInputElement).disabled=true});}
 if(route.v==='menu')drawAct();if(route.v==='calc')runCalc();if(route.v==='chart')drawChart();if(route.v==='export')$('xinfo').textContent=xList().length+' dự án · A4';
}
var rz;addEventListener('resize',function(){clearTimeout(rz);rz=setTimeout(function(){if(route.v==='menu')drawAct()},150)});

/* ---------- events ---------- */
document.addEventListener('input',function(e){var t=(e.target as HTMLInputElement);if(route.v==='chart'&&chartEvents(e))return;if(route.v==='export'&&xEvents(e))return;
 if(t.dataset.step&&t.dataset.path){var f=findStep(t.dataset.step);if(!f)return;setPath(f.st,t.dataset.path,t.value);if(t.dataset.path!=='date')f.st.upd=Date.now();touch(f.p);save();if(/^res\.m/.test(t.dataset.path))sugY(t.dataset.step);return}
 if(t.dataset.sample){walk(S.projects,function(p){p.samples.forEach(function(s){if(s.id===t.dataset.sample){s.code=t.value;touch(p)}})});save();return}
 if(t.id==='ptitle'){var p=findP(route.id);p.name=t.value;touch(p);save();renderTree();crumb(['Dự án'].concat(pathOf(p.id).map(function(x){return x.name})));return}
 if(route.v==='calc')calcEvents(e)});
document.addEventListener('change',function(e){var t=(e.target as HTMLInputElement);if(route.v==='chart'||route.v==='export')return;
 if(t.dataset.step&&t.dataset.path&&t.tagName==='SELECT'){var f=findStep(t.dataset.step);setPath(f.st,t.dataset.path,t.value);f.st.upd=Date.now();save();sugY(t.dataset.step);return}
 if(t.id==='pstatus'){var p=findP(route.id);p.status=t.value;touch(p);logA((t.value==='done'?'Đánh dấu hoàn thành ':'Mở lại ')+'<b>'+esc(p.name)+'</b>',p.id);save();renderTree();toast(t.value==='done'?'Đã đánh dấu hoàn thành':'Đã chuyển sang đang thực hiện');return}
 if(route.v==='calc')calcEvents(e)});

var pick={cb:null};
$('filePick').addEventListener('change',function(){var fs=Array.prototype.slice.call(this.files);this.value='';if(pick.cb&&fs.length)pick.cb(fs)});
function choose(accept,multi,cb){var f=$('filePick');f.accept=accept||'';f.multiple=!!multi;pick.cb=cb;f.click()}
function thumb(file,cb){if(!/^image\//.test(file.type)){cb(null);return}var r=new FileReader();r.onload=function(){var im=new Image();im.onload=function(){var s=Math.min(1,360/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);c.getContext('2d').drawImage(im,0,0,c.width,c.height);try{cb(c.toDataURL('image/jpeg',.82))}catch(e){cb(null)}};im.onerror=function(){cb(null)};im.src=String(r.result)};r.readAsDataURL(file)}

function newSample(p){var used=[];walk(S.projects,function(x){x.samples.forEach(function(s){used.push(s.code)})});var L=(p.samples[0]&&/^[A-Z]/.test(p.samples[0].code))?p.samples[0].code[0]:String.fromCharCode(65+(all().indexOf(p)%26));var n=1;while(used.indexOf(L+n)>-1)n++;return {id:uid(),code:L+n,steps:[step({chems:[chem('','','g')]})]}}

document.addEventListener('click',function(e){
 var g=(e.target as HTMLInputElement).closest('[data-go]');if(g){go(g.dataset.go);closeSide();return}
 var gp=(e.target as HTMLInputElement).closest('[data-goP]');if(gp&&!(e.target as HTMLInputElement).closest('#npop')){go('project',gp.getAttribute('data-goP'));return}
 var b=(e.target as HTMLInputElement).closest('[data-act]');if(!b)return;var a=b.dataset.act,sid=b.dataset.step,f=sid?findStep(sid):null,p=route.id?findP(route.id):null;
 switch(a){
 case 'toggleTree':S.open.tree=!(S.open.tree!==false);save();renderTree();if(route.v!=='project'&&S.open.tree&&S.projects[0]){}break;
 case 'openFirst':if(S.projects.length)go('project',(S.lastP&&findP(S.lastP))?S.lastP:S.projects[0].id);else{var create=document.querySelector<any>('[data-act="addRoot"]');if(create)create.click()}break;
 case 'addRoot':var np={id:uid(),name:'Dự án mới '+(S.projects.length+1),status:'running',updated:today(0),children:[],samples:[]};S.projects.push(np);S.open.tree=true;logA('Tạo dự án <b>'+esc(np.name)+'</b>',np.id);save();go('project',np.id);setTimeout(function(){var el=document.querySelector<any>('.tn[data-pid="'+np.id+'"]');if(el)startRename(np.id,el)},60);break;
 case 'addChild':var par=findP(b.dataset.pid);var c={id:uid(),name:par.name+' – '+String.fromCharCode(97+par.children.length),status:'running',updated:today(0),children:[],samples:[]};par.children.push(c);S.open.tree=true;logA('Tạo dự án con <b>'+esc(c.name)+'</b>',c.id);save();go('project',c.id);setTimeout(function(){var el=document.querySelector<any>('.tn[data-pid="'+c.id+'"]');if(el)startRename(c.id,el)},60);break;
 case 'renameTree':startRename(b.dataset.pid,b.closest('.tn'));break;
 case 'delProject':if(!p)break;openDlg(dhead('Xác nhận','Xóa “'+esc(p.name)+'”?')+'<div class="db"><div class="hint">Toàn bộ mẫu'+(p.children.length?' và '+p.children.length+' dự án con':'')+' trong dự án này sẽ bị xóa. Không thể hoàn tác.</div></div><div class="df"><button class="btn" data-act="close">Hủy</button><button class="btn dg" data-act="confirmDel">Xóa dự án</button></div>');break;
 case 'confirmDel':var par2=parentOf(p.id),list=par2?par2.children:S.projects;list.splice(list.indexOf(p),1);save();closeDlg();toast('Đã xóa dự án');go(par2?'project':'menu',par2?par2.id:null);break;
 case 'addSample':var ns=newSample(p);p.samples.push(ns);touch(p);logA('Thêm mẫu <b>'+esc(ns.code)+'</b> vào '+esc(p.name),p.id);save();render();setTimeout(function(){var r=document.querySelector<any>('tr[data-sid="'+ns.id+'"]');if(r){r.scrollIntoView({block:'center',behavior:'smooth'});r.classList.add('flash')}},50);break;
 case 'addStep':walk(S.projects,function(x){x.samples.forEach(function(s){if(s.id===b.dataset.sample){s.steps.push(step({}));touch(x)}})});save();render();break;
 case 'delSample':walk(S.projects,function(x){var i=x.samples.findIndex(function(s){return s.id===b.dataset.sample});if(i>-1){var s=x.samples.splice(i,1)[0];toast('Đã xóa mẫu '+s.code);touch(x)}});save();render();break;
 case 'delStep':f.s.steps.splice(f.s.steps.indexOf(f.st),1);touch(f.p);save();render();break;
 case 'addChem':f.st.chems.push(chem('','',f.st.chems.length?f.st.chems[f.st.chems.length-1].unit:'g'));save();render();setTimeout(function(){var ins=document.querySelectorAll<HTMLElement>('input[data-step="'+sid+'"][data-path$=".name"]');if(ins.length)ins[ins.length-1].focus()},30);break;
 case 'delChem':var rm=f.st.chems.splice(+b.dataset.k,1)[0];if(f.st.cond&&f.st.cond.conc)delete f.st.cond.conc[rm.id];save();render();break;
 case 'procFile':choose('',false,async function(fs){try{var rec=await STORE.upload(fs[0]);f.st.procFile=rec;touch(f.p);save();render();toast('Đã đính kèm '+rec.name)}catch(error){toast('Upload thất bại: '+error.message)}});break;
 case 'rmProcFile':(async function(){var old=f.st.procFile;f.st.procFile=null;clearTimeout(saveT);STORE.save(S);render();if(old&&old.id&&await STORE.flush())await STORE.remove(old.id).catch(function(){toast('Đã gỡ file nhưng chưa xóa khỏi máy chủ')})})();break;
 case 'addImg':choose('image/*,.pdf,.csv,.xlsx,.txt',true,async function(fs){var results=await Promise.allSettled(fs.map(function(file){return STORE.upload(file)}));var records=results.filter(function(r){return r.status==='fulfilled'}).map(function(r){return r.value});if(results.some(function(r){return r.status==='rejected'})){await Promise.all(records.map(function(r){return STORE.remove(r.id).catch(function(){})}));toast('Một hoặc nhiều tệp tải lên thất bại');return}f.st.images.push.apply(f.st.images,records);touch(f.p);logA('Tải '+records.length+' tệp cho mẫu <b>'+esc(f.s.code)+'</b>',f.p.id);save();render();toast('Đã thêm '+records.length+' tệp')});break;
 case 'rmImg':e.stopPropagation();(async function(){var old=f.st.images.splice(+b.dataset.k,1)[0];clearTimeout(saveT);STORE.save(S);render();if(old&&old.id&&await STORE.flush())await STORE.remove(old.id).catch(function(){toast('Đã gỡ file nhưng chưa xóa khỏi máy chủ')})})();break;
 case 'view':var im=f.st.images[+b.dataset.k];openDlg(dhead(esc(f.s.code)+' · Hình ảnh',esc(im.name))+'<div class="db">'+(im.src?'<img src="'+im.src+'" alt="" style="max-width:100%;border-radius:10px;display:block;margin:0 auto">':'<a class="btn" href="'+STORE.url(im.id)+'">Tải tệp</a>')+'</div>');$('dlg').parentNode.classList.add('lightbox');break;
 case 'cond':condDlg(sid);break;
 case 'res':resDlg(sid);break;
 case 'clearCond':f.st.cond={};closeDlg();break;
 case 'clearRes':f.st.res={};closeDlg();break;
 case 'applyY':var v=$('ySug').dataset.v;if(v){f.st.res.yield=v;$('yIn').value=v;save()}break;
 case 'close':closeDlg();break;
 case 'settings':$('upop').classList.remove('on');settingsDlg();break;
 case 'saveSettings':(async function(){try{var user=await window.MemoryAuth.update({name:$('setName').value.trim()||S.user.name,lab:$('setLab').value.trim(),language:$('setLanguage').value});S.user.name=user.name;S.user.lab=user.lab;S.user.language=user.language;setLanguage(user.language);save();closeDlg();render();toast('Đã lưu cài đặt')}catch(error){toast('Không lưu được cài đặt')}})();break;
 case 'profile':$('upop').classList.remove('on');profileDlg();break;
 case 'help':$('upop').classList.remove('on');helpDlg();break;
 case 'logout':(async function(){clearTimeout(saveT);STORE.save(S);if(!await STORE.flush()){toast('Chưa lưu được dữ liệu, hãy thử lại sau.');return}try{await window.MemoryAuth.logout();location.href='login.html?out=1'}catch(error){toast('Không đăng xuất được. Hãy thử lại.')}})();break;

 case 'exportJson':dl('memory-lab.json',JSON.stringify(S,null,2),'application/json');break;
 case 'exportLanguageMap':dl('memory-language-map.json',JSON.stringify(languageMapping(),null,2),'application/json');break;
 case 'csv':dl((p.name||'project').replace(/[^\w\-]+/g,'_')+'.csv','﻿'+csv(p),'text/csv');break;
 case 'newChart':var nc=newChart(b.dataset.k,S.lastP&&findP(S.lastP)?S.lastP:null);charts().unshift(nc);save();go('chart',nc.id);toast('Đã tạo biểu đồ từ mẫu');break;
 case 'addRow':var cc1=findC(route.id);cc1.data[b.dataset.t].push([]);$('sheets').innerHTML=sheetHTML(cc1);redraw();break;
 case 'delRow':var cc2=findC(route.id);cc2.data[b.dataset.t].splice(+b.dataset.i,1);$('sheets').innerHTML=sheetHTML(cc2);redraw();break;
 case 'clrSheet':var cc3=findC(route.id);cc3.data[b.dataset.t]=[[],[],[],[],[]];$('sheets').innerHTML=sheetHTML(cc3);redraw(true);break;
 case 'addSer':var cc4=findC(route.id);cc4.params.sn.push('Chuỗi '+(cc4.params.sn.length+1));$('sheets').innerHTML=sheetHTML(cc4);redraw(true);break;
 case 'delSer':var cc5=findC(route.id),j=+b.dataset.j;cc5.params.sn.splice(j,1);cc5.data.d.forEach(function(r){r.splice(j+1,1)});$('sheets').innerHTML=sheetHTML(cc5);redraw(true);break;
 case 'resetSet':var cc6=findC(route.id);cc6.set=defSet(cc6.tpl);save();render();toast('Đã khôi phục tùy chỉnh');break;
 case 'delChart':var cc7=findC(route.id);openDlg(dhead('Xác nhận','Xóa biểu đồ “'+esc(cc7.name)+'”?')+'<div class="db"><div class="hint">Bảng số liệu và tùy chỉnh của biểu đồ sẽ bị xóa.</div></div><div class="df"><button class="btn" data-act="close">Hủy</button><button class="btn dg" data-act="confirmDelChart">Xóa</button></div>');break;
 case 'confirmDelChart':S.charts=charts().filter(function(c){return c.id!==route.id});save();closeDlg();go('chart');toast('Đã xóa biểu đồ');break;
 case 'chartPng':var cc8=findC(route.id);svgPng(chartSVG(cc8,1000,600).svg,(cc8.name||'chart').replace(/[đĐ]/g,'d').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w]+/g,'_')+'.png',2);toast('Đang tạo PNG…');break;
 case 'chartSvg':var cc9=findC(route.id);dl((cc9.name||'chart').replace(/[đĐ]/g,'d').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w]+/g,'_')+'.svg',chartSVG(cc9,1000,600).svg,'image/svg+xml');break;
 case 'fromProj':var cc10=findC(route.id),pp=cc10.project?findP(cc10.project):null;if(!pp){toast('Hãy gắn biểu đồ với một dự án trước');break}var rows=[];walk([pp],function(x){x.samples.forEach(function(sm){var tv=condVal(sm,'temp'),yv=finalYield(sm);if(tv!=null&&yv!=null)rows.push([fmt(tv,2),fmt(yv,2)])})});if(!rows.length){toast('Dự án chưa có mẫu đủ nhiệt độ và hiệu suất');break}cc10.params.xn='Nhiệt độ (°C)';cc10.params.sn=['Hiệu suất (%)'];cc10.data.d=rows.sort(function(a,b2){return a[0]-b2[0]});save();render();toast('Đã lấy '+rows.length+' mẫu từ dự án');break;
 case 'switchTpl':e.preventDefault();var cc11=findC(route.id);cc11.tpl=b.dataset.k;cc11.name=TPL[b.dataset.k].name;save();render();break;
 case 'xfmt':XO.fmt=b.dataset.k;render();break;
 case 'doExport':doExport();break;
 case 'target':cst().t[route.id||CALCS[0].id]=b.dataset.k;save();render();break;
 case 'preset':var cc=C_(route.id),pr=cc.presets[+b.dataset.i][1];Object.keys(pr).forEach(function(k){var r=cval(cc,k);r.v=String(pr[k]);if(cc.v.find(function(v){return v[0]===k})[3]==='mm')r.u='g/mol';if(k==='d')r.u='g/mL'});if(typeof pr==='object'&&pr&&String(ctarget(cc)) in pr)cst().t[cc.id]=cc.t;save();render();toast('Đã điền: '+cc.presets[+b.dataset.i][0]);break;
 case 'phMode':cst().ph.mode=b.dataset.k;save();render();break;
 case 'balEx':cst().bal.eq=b.dataset.e;save();render();break;
 case 'ucDim':cst().uc.d=b.dataset.k;cst().uc.f=DIM[b.dataset.k].b;save();render();break;
 case 'saveHist':var cr=$('cres').dataset.r;if(cr){cst().h.unshift({id:C_(route.id).id,n:C_(route.id).name,r:cr});cst().h=cst().h.slice(0,8);save();render();toast('Đã lưu vào lịch sử')}break;
 case 'clrHist':cst().h=[];save();render();break;
 case 'more':toast('Các công cụ mới sẽ sớm có mặt');break;
 }});
document.addEventListener('click',function(e){var el=(e.target as HTMLInputElement).closest('.ptbl [data-el]');if(el){var F=document.querySelector<any>('[data-mm]');if(F){F.value+=el.dataset.el;cst().mm=F.value;save();F.focus();runCalc()}}});
document.addEventListener('focusout',function(e){if((e.target as HTMLInputElement).id==='ptitle'&&!(e.target as HTMLInputElement).value.trim()){var p=findP(route.id);p.name='Dự án chưa đặt tên';(e.target as HTMLInputElement).value=p.name;save();renderTree()}});
$('scrim').addEventListener('transitionend',function(){if(!$('scrim').classList.contains('on'))$('scrim').classList.remove('lightbox')});
function dl(name,data,type="application/octet-stream"){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},500)}
function csv(p){var q=function(v){v=String(v==null?'':v);return /[",\n;]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};var rows=[['No.','Step','Ngày','Procedure','Procedure file','Hóa chất','Định lượng','Nồng độ','Điều kiện','m0','m1','Hiệu suất (%)','Hình ảnh','Ghi chú']];
 p.samples.forEach(function(s){s.steps.forEach(function(st,i){var c=st.cond||{};var env=COND.map(function(k){var v=k[0]==='pH'?c.pH:c[k[0]]&&c[k[0]].v;return v?k[3]+'='+v+(k[0]==='pH'?'':' '+(c[k[0]].u||'%')):''}).filter(Boolean).join('; ');var conc=concTxt(st).join('; ');var r=st.res||{};
  rows.push([s.code,i+1,fdate(st.date),st.procText,st.procFile?st.procFile.name:'',st.chems.map(function(x){return x.name}).join('; '),st.chems.map(function(x){return x.amount+' '+x.unit}).join('; '),conc,env,r.m0&&r.m0.v?r.m0.v+' '+r.m0.u:'',r.m1&&r.m1.v?r.m1.v+' '+r.m1.u:'',r.yield||'',st.images.map(function(x){return x.name}).join('; '),st.note])})});
 return rows.map(function(r){return r.map(q).join(',')}).join('\n')}

function xEvents(e){var t=(e.target as HTMLInputElement);if(t.dataset.xo){XO[t.dataset.xo]=t.checked;$('paper').innerHTML=reportHTML();$('xinfo').textContent=xList().length+' dự án · A4';return true}if(t.id==='xp'){XO.pid=t.value;$('paper').innerHTML=reportHTML();$('xinfo').textContent=xList().length+' dự án · A4';return true}return false}
document.head.insertAdjacentHTML('beforeend','<style>'+RP_CSS+'</style>');
/* boot */
addEventListener('beforeunload',function(e){if(saveT||STORE.hasPending()){e.preventDefault();e.returnValue=''}});
parse();
addEventListener('hashchange',function(){if(route.v==='project'&&route.id){S.lastP=route.id}});
setLanguage(SESS.language||'vi');installTranslations();
render();
})();
export {};
