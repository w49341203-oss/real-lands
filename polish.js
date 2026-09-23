// 列國紀元 質感層（P12 第一階段，純程式、不生圖）：環境動態、生態裝飾、光影、天氣、粒子、死亡淡出、人物分層擺動、環境音與背景音樂。
// 只影響畫面與聲音，不碰遊戲規則與存檔；rts.js 用 window.POLISH?.xxx() 呼叫，沒載入時照常運作。
// 讀取 rts.js 的頂層變數：g（window.game）、cam、ctx、width、height、screen()、ground()、sound、rects、atlas、atlasReady。
(function(root){
'use strict';
const S={on:true,dayNight:true,weather:true,ambient:true,music:true,particles:[],ghosts:[],birds:[],animals:[],shake:0,shakeT:0,alive:new Map(),progress:new Map(),game:null,t:0,gtime:0,weatherState:'clear',weatherUntil:0,rain:[],lastBlasts:new WeakSet(),chopT:new Map(),emitT:new Map(),footT:0};
const KEY='nations.polish';
try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');for(const k of ['on','dayNight','weather','ambient','music'])if(typeof saved[k]==='boolean')S[k]=saved[k]}catch{}
function persist(){try{localStorage.setItem(KEY,JSON.stringify({on:S.on,dayNight:S.dayNight,weather:S.weather,ambient:S.ambient,music:S.music}))}catch{}}
const G=()=>root.game;
const rnd=()=>Math.random();
// ---------- 每幀更新 ----------
function reset(g){S.game=g;S.particles=[];S.ghosts=[];S.birds=[];S.alive=new Map();S.progress=new Map();S.animals=makeAnimals(g);S.weatherState='clear';S.weatherUntil=S.t+180+rnd()*180;S.chopT=new Map();S.emitT=new Map()}
function update(dt){const g=G();if(!g)return;if(g!==S.game)reset(g);S.t+=dt;const gdt=Math.max(0,g.time-S.gtime);S.gtime=g.time;if(!S.on)return;
 // 死亡：上一幀還活著、這幀死了或消失 → 留一個倒下淡出的殘影。
 const now=new Map();for(const u of g.units){if(u.hp>0&&!u.inside)now.set(u.id,u)}
 for(const [id,rec] of S.alive){const u=now.get(id);if(!u){const d=rec.draw;if(g.visible[g.at(rec.x,rec.y)]){const sheet=rec.anim?ANIM.sheets.get(rec.anim):null;if(sheet&&sheet.ready&&animFrames(sheet,'death')>0)S.ghosts.push({x:rec.x,y:rec.y,anim:sheet,h:rec.h||40,t:0,face:rec.face||1});else if(d&&d.img)S.ghosts.push({x:rec.x,y:rec.y,draw:d,t:0,face:rec.face||1})}}}
 S.alive=new Map();for(const [id,u] of now){const d=S.lastDraw?.get(id)||null;S.alive.set(id,{x:u.x,y:u.y,draw:d,face:u.facing||1,anim:u.type<=3?animKey(u):null,h:d?d.h:40})}
 for(const gh of S.ghosts)gh.t+=dt;S.ghosts=S.ghosts.filter(gh=>gh.t<2.2);
 // 粒子發射（只對鏡頭內、看得見的東西；每種都有節流）。
 if(gdt>0){emitBuildings(g,gdt);emitUnits(g,gdt);for(const e of g.effects){if(e.type==='blast'&&!S.lastBlasts.has(e)){S.lastBlasts.add(e);S.shake=Math.max(S.shake,6);S.shakeT=.35}}}
 for(const p of S.particles){p.life-=dt;p.wx+=p.vx*dt;p.wy+=p.vy*dt;p.dz+=p.vz*dt;if(p.type==='smoke'||p.type==='fire'){p.vx+=(S.wind*.15)*dt;p.size+=p.grow*dt}if(p.type==='chip'||p.type==='blood'||p.type==='dust'){p.vz-=(p.type==='dust'?40:220)*dt;if(p.dz<0){p.dz=0;p.vz=0;p.vx*=.5;p.vy*=.5}}}
 S.particles=S.particles.filter(p=>p.life>0);if(S.particles.length>900)S.particles.splice(0,S.particles.length-900);
 if(S.shakeT>0){S.shakeT-=dt;if(S.shakeT<=0)S.shake=0}
 S.wind=Math.sin(S.t*.23)*.6+Math.sin(S.t*.071)*.4;
 updateBirds(g,dt);updateAnimals(g,dt);updateWeather(g,dt);updateAudio(g,dt);
}
function inView(wx,wy,margin=80){const p=screen(wx,wy);return p.x>-margin&&p.x<width+margin&&p.y>-margin&&p.y<height+margin}
function emit(p){S.particles.push(Object.assign({wx:0,wy:0,dz:0,vx:0,vy:0,vz:0,life:1,ttl:1,size:3,grow:0,color:'#fff',type:'dust'},p))}
function emitBuildings(g,dt){const t=S.t;for(const b of g.buildings){if(b.hp<=0)continue;const c=g.center(b);if(!g.visible[g.at(c.x,c.y)]&&!(b.owner===0||g.isAllied(0,b.owner)))continue;if(!inView(c.x,c.y))continue;
  // 完工那一刻揚塵。
  const prev=S.progress.get(b.id);if(prev!=null&&prev<1&&b.progress>=1)for(let i=0;i<14;i++)emit({wx:c.x+(rnd()-.5)*b.size,wy:c.y+(rnd()-.5)*b.size,vx:(rnd()-.5)*1.2,vy:(rnd()-.5)*1.2,vz:20+rnd()*30,life:.9,ttl:.9,size:4+rnd()*4,grow:3,color:'#d8c9a3',type:'dust'});S.progress.set(b.id,b.progress);
  if(b.progress<1)continue;const key='b'+b.id;const last=S.emitT.get(key)||0;
  // 民居／主城／磨坊煙囪；受損冒黑煙，重傷起火。
  const hurt=b.hp/b.maxHp;const chimney=['house','tc','mill','barracks','lumber','mine'].includes(b.type);
  const interval=hurt<.25?.08:hurt<.5?.18:chimney?.55:Infinity;if(t-last<interval)continue;S.emitT.set(key,t);
  const top=b.type==='tc'?58:b.type==='house'?34:40;
  if(hurt<.5){emit({wx:c.x+(rnd()-.5)*b.size*.8,wy:c.y+(rnd()-.5)*b.size*.8,dz:10+rnd()*top*.6,vx:(rnd()-.5)*.2,vy:(rnd()-.5)*.2,vz:18+rnd()*12,life:2.2,ttl:2.2,size:5+rnd()*4,grow:5,color:'#2b2622',type:'smoke'});if(hurt<.25)for(let i=0;i<2;i++)emit({wx:c.x+(rnd()-.5)*b.size*.7,wy:c.y+(rnd()-.5)*b.size*.7,dz:4+rnd()*top*.5,vx:0,vy:0,vz:26+rnd()*20,life:.45,ttl:.45,size:3+rnd()*3,grow:-3,color:rnd()<.5?'#ffb347':'#ff6a2a',type:'fire'})}
  else if(chimney&&g.time>20)emit({wx:c.x+b.size*.3,wy:c.y-b.size*.2,dz:top,vx:.05,vy:-.05,vz:14+rnd()*8,life:2.6,ttl:2.6,size:2.5+rnd()*2,grow:3.5,color:'#cfc9bd',type:'smoke'});}}
function emitUnits(g,dt){const t=S.t;for(const u of g.units){if(u.hp<=0||u.inside||u.domain!=='land')continue;if(!g.visible[g.at(u.x,u.y)]||!inView(u.x,u.y,40))continue;const key='u'+u.id;const last=S.emitT.get(key)||0;
  if(u.path.length&&t-last>.22){S.emitT.set(key,t);emit({wx:u.x+(rnd()-.5)*.3,wy:u.y+(rnd()-.5)*.3,vx:(rnd()-.5)*.3,vy:(rnd()-.5)*.3,vz:10+rnd()*10,life:.55,ttl:.55,size:2+rnd()*2,grow:4,color:'#c9b68f',type:'dust'});continue}
  // 採集：斧頭／鎬頭落下時在資源點噴木屑／火花；建造：木屑。
  if((u.task.kind==='gather'&&u.phase==='out'&&u.work>0&&!u.path.length)||u.task.kind==='build'){const n=g.get(u.task.target);if(!n)continue;const ph=(t*9/(2*Math.PI)+u.id*1.7/(2*Math.PI))%1;const lastChop=S.chopT.get(u.id)||0;if(t-lastChop>.66&&ph<.12){S.chopT.set(u.id,t);const c=g.center(n);const res=n.kind==='node'?n.resource:n.type==='farm'?0:-1;const color=res===1?'#d9b46a':res===2?'#ffd23f':res===3?'#cfcfcf':res===0?'#9fd26a':'#e0d3ad';for(let i=0;i<4;i++)emit({wx:c.x+(rnd()-.5)*.6,wy:c.y+(rnd()-.5)*.6,dz:8+rnd()*10,vx:(rnd()-.5)*1.6,vy:(rnd()-.5)*1.6,vz:50+rnd()*60,life:.6,ttl:.6,size:res===2?1.5:2,grow:0,color,type:'chip'})}}
  // 命中：被打的那一刻噴塵／血點。
  if(u.lastHit!=null&&g.time-u.lastHit<.06&&t-(S.emitT.get('h'+u.id)||0)>.15){S.emitT.set('h'+u.id,t);const blood=g.mode!=='scifi';for(let i=0;i<5;i++)emit({wx:u.x,wy:u.y,dz:14+rnd()*10,vx:(rnd()-.5)*2,vy:(rnd()-.5)*2,vz:30+rnd()*50,life:.5,ttl:.5,size:1.6+rnd(),grow:0,color:blood?'#8f1d1d':'#9fe3ff',type:'blood'})}}}
// ---------- 鳥群、動物 ----------
function viewRect(){const a=ground(0,0),b=ground(width,0),c=ground(0,height),d=ground(width,height);return {x0:Math.min(a.x,b.x,c.x,d.x),x1:Math.max(a.x,b.x,c.x,d.x),y0:Math.min(a.y,b.y,c.y,d.y),y1:Math.max(a.y,b.y,c.y,d.y)}}
function updateBirds(g,dt){const r=viewRect();S.birds=S.birds.filter(f=>f.x>r.x0-40&&f.x<r.x1+40&&f.y>r.y0-40&&f.y<r.y1+40&&f.life>0);for(const f of S.birds){f.x+=f.vx*dt;f.y+=f.vy*dt;f.life-=dt}
 if(S.birds.length<2&&rnd()<dt*.12&&!isNight()){const side=rnd()<.5;const f={x:side?r.x0-10:r.x0+rnd()*(r.x1-r.x0),y:side?r.y0+rnd()*(r.y1-r.y0):r.y0-10,vx:0,vy:0,life:60,n:4+Math.floor(rnd()*4),ph:rnd()*6,gull:false};const ang=rnd()*Math.PI*2;const sp=2.2+rnd();f.vx=Math.cos(ang)*sp;f.vy=Math.sin(ang)*sp;const cx=Math.floor((r.x0+r.x1)/2),cy=Math.floor((r.y0+r.y1)/2);f.gull=g.inBounds(cx,cy)&&!g.land[g.at(cx,cy)];S.birds.push(f)}}
function makeAnimals(g){let seed=(g.seed||1)>>>0;const R=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};const out=[];const want=Math.min(90,Math.floor(g.landCells/320));let tries=0;while(out.length<want&&tries++<want*40){const i=Math.floor(R()*g.W*g.H);if(!g.land[i]||g.blocked[i]||!g.mainland?.has(i))continue;const x=i%g.W+.5,y=Math.floor(i/g.W)+.5;if(g.bases.some(b=>Math.hypot(b.x-x,b.y-y)<10))continue;if(g.altitude[i]>2600)continue;const forest=g.nodes.some(n=>n.resource===1&&n.amount>0&&Math.hypot(n.x-x,n.y-y)<4);const kind=forest?'deer':R()<.6?'sheep':'deer';const n=kind==='sheep'?2+Math.floor(R()*3):1+Math.floor(R()*2);for(let k=0;k<n;k++)out.push({kind,x:x+(R()-.5)*1.5,y:y+(R()-.5)*1.5,hx:x,hy:y,tx:x,ty:y,wait:R()*4,face:R()<.5?1:-1,ph:R()*6})}return out}
function updateAnimals(g,dt){for(const a of S.animals){if(a.wait>0){a.wait-=dt;continue}const dx=a.tx-a.x,dy=a.ty-a.y,d=Math.hypot(dx,dy);if(d<.1){a.wait=1+rnd()*5;for(let k=0;k<6;k++){const nx=a.hx+(rnd()-.5)*7,ny=a.hy+(rnd()-.5)*7;if(g.inBounds(nx,ny)&&g.walkable(nx,ny)){a.tx=nx;a.ty=ny;break}}continue}const sp=a.kind==='deer'?.9:.5;a.x+=dx/d*sp*dt;a.y+=dy/d*sp*dt;a.face=dx-dy>0?1:-1}}
function decor(){if(!S.on||!G())return[];const g=G();if(g.nodes.some(n=>n.animal))return[];/* 引擎已有可獵的動物時不再畫裝飾動物 */const r=viewRect();return S.animals.filter(a=>a.x>r.x0-2&&a.x<r.x1+2&&a.y>r.y0-2&&a.y<r.y1+2&&g.visible[g.at(a.x,a.y)]).map(a=>({kind:'animal',hp:1,a,x:a.x,y:a.y}))}
function drawAnimal(e){const a=e.a,p=screen(a.x,a.y),z=cam.z,t=S.t;const moving=a.wait<=0&&!a.dead;const step=moving?Math.sin(t*10+a.ph):0;ctx.save();if(a.dead){ctx.translate(p.x,p.y);ctx.rotate(a.face>0?1.3:-1.3);ctx.translate(-p.x,-p.y);ctx.globalAlpha=.85}ctx.fillStyle='#0b170d';ctx.globalAlpha=.25;ctx.beginPath();ctx.ellipse(p.x,p.y+1*z,(a.kind==='deer'?9:7)*z,3.5*z,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.translate(p.x,p.y);ctx.scale(a.face,1);
 if(a.kind==='boar'){ctx.fillStyle='#3c2e24';ctx.beginPath();ctx.ellipse(0,-7*z,9*z,5*z,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(8.5*z,-9*z,4*z,3.2*z,-.3,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#3c2e24';ctx.lineWidth=Math.max(1,1.6*z);ctx.beginPath();for(const lx of [-5,-2,3,6]){ctx.moveTo(lx*z,-4*z);ctx.lineTo(lx*z+(lx<0?-step:step)*1.2*z,0)}ctx.stroke();ctx.strokeStyle='#f1ede0';ctx.lineWidth=Math.max(1,1.2*z);ctx.beginPath();ctx.moveTo(11*z,-8*z);ctx.lineTo(13*z,-10.5*z);ctx.stroke()}
 else if(a.kind==='sheep'){ctx.fillStyle='#e9e4d6';ctx.beginPath();ctx.ellipse(0,-6*z,7*z,4.5*z,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#3a3226';ctx.beginPath();ctx.ellipse(6.5*z,-6.5*z,2.6*z,2*z,0,0,Math.PI*2);ctx.fill();ctx.fillRect(-4*z,-3*z,1.6*z,3*z+step*z);ctx.fillRect(2*z,-3*z,1.6*z,3*z-step*z)}
 else{ctx.fillStyle='#8a5a2b';ctx.beginPath();ctx.ellipse(0,-9*z,8*z,4*z,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(8*z,-13*z,3*z,2.2*z,-.4,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#8a5a2b';ctx.lineWidth=Math.max(1,1.3*z);ctx.beginPath();ctx.moveTo(-5*z,-6*z);ctx.lineTo(-5*z-step*1.5*z,0);ctx.moveTo(-2*z,-6*z);ctx.lineTo(-2*z+step*1.5*z,0);ctx.moveTo(3*z,-6*z);ctx.lineTo(3*z+step*1.5*z,0);ctx.moveTo(6*z,-6*z);ctx.lineTo(6*z-step*1.5*z,0);ctx.stroke();ctx.strokeStyle='#5c3b18';ctx.beginPath();ctx.moveTo(9*z,-15*z);ctx.lineTo(11*z,-20*z);ctx.moveTo(9*z,-15*z);ctx.lineTo(7.5*z,-20*z);ctx.stroke()}
 ctx.restore()}
// ---------- 畫面 ----------
function isNight(){const g=G();if(!g||!S.dayNight)return false;const k=dayPhase();return k>.62&&k<.95}
function dayPhase(){const g=G();return g?((g.time/540)+.15)%1:.3}
function beginFrame(){if(!S.on)return;ctx.save();if(S.shake>0){ctx.translate((rnd()-.5)*S.shake*2,(rnd()-.5)*S.shake)}}
function drawWater(){if(!S.on)return;const g=G();if(!g)return;const z=cam.z,t=S.t,r=viewRect();const x0=Math.max(0,Math.floor(r.x0)),x1=Math.min(g.W-1,Math.ceil(r.x1)),y0=Math.max(0,Math.floor(r.y0)),y1=Math.min(g.H-1,Math.ceil(r.y1));const stride=z<.6?3:2;ctx.save();ctx.lineCap='round';
 for(let y=y0;y<=y1;y+=stride)for(let x=x0;x<=x1;x+=stride){const i=y*g.W+x;if(g.land[i]||!g.explored[i])continue;const h=((x*73856093)^(y*19349663))>>>0;const ph=(h%997)/997;
  // 波光：每個水格一條隨時間閃動的短亮線。
  const a=Math.max(0,Math.sin(t*1.6+ph*6.28+x*.9-y*.7));if(a>.55){const p=screen(x+.5+ph*.4,y+.5-ph*.3);if(p.x<-20||p.x>width+20||p.y<-20||p.y>height+20)continue;ctx.strokeStyle=`rgba(210,235,255,${(a-.55)*.5})`;ctx.lineWidth=Math.max(1,1.2*z);ctx.beginPath();ctx.moveTo(p.x-6*z,p.y);ctx.lineTo(p.x+6*z,p.y);ctx.stroke()}
  // 岸邊白浪：水格緊鄰陸地時，沿陸地那側畫一道週期性湧上的弧。
  let shore=null;if(x<g.W-1&&g.land[i+1])shore=[1,0];else if(y<g.H-1&&g.land[i+g.W])shore=[0,1];else if(x>0&&g.land[i-1])shore=[-1,0];else if(y>0&&g.land[i-g.W])shore=[0,-1];
  if(shore){const k=(Math.sin(t*1.1+ph*6.28)+1)/2;const p=screen(x+.5+shore[0]*(.15+k*.3),y+.5+shore[1]*(.15+k*.3));ctx.strokeStyle=`rgba(235,245,250,${.35*(1-k)+.1})`;ctx.lineWidth=Math.max(1,2*z*(1-k*.5));ctx.beginPath();const ang=shore[0]?0:1;const q1=screen(x+.5+shore[0]*(.15+k*.3)-ang*.45,y+.5+shore[1]*(.15+k*.3)-(1-ang)*.45),q2=screen(x+.5+shore[0]*(.15+k*.3)+ang*.45,y+.5+shore[1]*(.15+k*.3)+(1-ang)*.45);ctx.moveTo(q1.x,q1.y);ctx.quadraticCurveTo(p.x,p.y-2*z,q2.x,q2.y);ctx.stroke()}}
 ctx.restore()}
function drawParticles(){if(!S.on)return;const z=cam.z;ctx.save();for(const p of S.particles){const s=screen(p.wx,p.wy);const y=s.y-p.dz*z;if(s.x<-30||s.x>width+30||y<-30||y>height+30)continue;const k=p.life/p.ttl;if(p.type==='smoke'){ctx.globalAlpha=.28*k;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(s.x,y,p.size*z,0,Math.PI*2);ctx.fill()}else if(p.type==='fire'){ctx.globalAlpha=.85*k;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(s.x,y,Math.max(.5,p.size*z*k),0,Math.PI*2);ctx.fill()}else if(p.type==='dust'){ctx.globalAlpha=.35*k;ctx.fillStyle=p.color;ctx.beginPath();ctx.ellipse(s.x,y,p.size*z,p.size*.6*z,0,0,Math.PI*2);ctx.fill()}else{ctx.globalAlpha=Math.min(1,k*1.5);ctx.fillStyle=p.color;ctx.fillRect(s.x-p.size*z/2,y-p.size*z/2,p.size*z,p.size*z)}}
 // 死亡殘影：倒下（旋轉 80°）再淡出。
 for(const gh of S.ghosts){const s=screen(gh.x,gh.y),z=cam.z;const fade=gh.t<1.2?1:Math.max(0,1-(gh.t-1.2)/1);ctx.globalAlpha=.9*fade;if(gh.anim){const n=animFrames(gh.anim,'death');const frame=Math.min(n-1,Math.floor(gh.t*8));ctx.save();drawAnimFrame(ctx,gh.anim,'death',frame,s.x,s.y+4*z,gh.h,gh.face<0);ctx.restore();continue}const d=gh.draw;const fall=Math.min(1,gh.t/.45);ctx.save();ctx.translate(s.x,s.y+4*z);ctx.rotate(-fall*1.35*gh.face);ctx.scale(d.flipped?-1:1,1);try{ctx.drawImage(d.img,...d.r,-d.w/2,-d.h,d.w,d.h)}catch{}ctx.restore()}
 ctx.restore()}
function endFrame(){if(!S.on)return;const g=G();
 // 鳥群（畫在所有東西之上）。
 ctx.save();for(const f of S.birds){for(let k=0;k<f.n;k++){const p=screen(f.x-k*.45*Math.sign(f.vx||1)+Math.sin(k*1.3)*.2,f.y-k*.25+Math.cos(k)*.2);const y=p.y-120*Math.max(.5,cam.z);const flap=Math.sin(S.t*9+f.ph+k)*3;const sz=(f.gull?4.5:3.5)*Math.max(.6,cam.z);ctx.strokeStyle=f.gull?'#f2f2ee':'#2a2620';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(p.x-sz,y+flap*.5);ctx.quadraticCurveTo(p.x-sz*.4,y-flap,p.x,y);ctx.quadraticCurveTo(p.x+sz*.4,y-flap,p.x+sz,y+flap*.5);ctx.stroke()}}ctx.restore();
 // 天氣。
 if(S.weather&&S.weatherState!=='clear')drawWeather();
 // 日夜色調：以遊戲時間 9 分鐘為一天；夜晚偏藍變暗、晨昏偏暖。
 if(S.dayNight&&g){const k=dayPhase();const night=Math.max(0,Math.min(1,(k-.55)/.12))*Math.max(0,Math.min(1,(.98-k)/.12));const warm=Math.max(0,1-Math.abs(k-.55)/.08)+Math.max(0,1-Math.abs(k-.02)/.06);if(night>0){ctx.save();ctx.globalCompositeOperation='multiply';ctx.globalAlpha=night*.62;ctx.fillStyle='#6f7fb8';ctx.fillRect(-20,-20,width+40,height+40);ctx.restore()}if(warm>0){ctx.save();ctx.globalAlpha=warm*.12;ctx.fillStyle='#ff9a4a';ctx.fillRect(-20,-20,width+40,height+40);ctx.restore()}}
 ctx.restore()}
// ---------- 天氣 ----------
function updateWeather(g,dt){if(!S.weather){S.weatherState='clear';return}if(g&&g.hazards&&g.hazards.some(h=>h.kind==='storm'&&h.until>g.time)){if(S.weatherState!=='rain'){S.weatherState='rain';S.rain=[];for(let i=0;i<260;i++)S.rain.push({x:rnd(),y:rnd(),s:1+rnd()*.8})}S.weatherUntil=S.t+5;return}/* 颱風事件：強制暴雨 */if(S.t>S.weatherUntil){if(S.weatherState==='clear'){S.weatherState=rnd()<.7?'rain':'clear';S.weatherUntil=S.t+(S.weatherState==='clear'?150+rnd()*200:60+rnd()*80);if(S.weatherState==='rain'){S.rain=[];for(let i=0;i<160;i++)S.rain.push({x:rnd(),y:rnd(),s:.6+rnd()*.6})}}else{S.weatherState='clear';S.weatherUntil=S.t+200+rnd()*260}}}
function cold(){const g=G();if(!g)return false;const c=ground(width/2,height/2);const cx=Math.floor(c.x),cy=Math.floor(c.y);if(!g.inBounds(cx,cy))return false;const lat=g.lonLat?g.lonLat(cx,cy).lat:0;return Math.abs(lat)>52||g.altitude[g.at(cx,cy)]>2200}
function drawWeather(){const snow=cold();ctx.save();ctx.globalAlpha=snow?.85:.5;ctx.strokeStyle=snow?'#ffffff':'#cfe3f5';ctx.fillStyle='#ffffff';ctx.lineWidth=1;const t=S.t;for(const d of S.rain){if(snow){const x=((d.x+Math.sin(t*.5+d.y*9)*.02+t*.01*d.s)%1)*width,y=((d.y+t*.06*d.s)%1)*height;ctx.beginPath();ctx.arc(x,y,1.2+d.s,0,Math.PI*2);ctx.fill()}else{const x=((d.x+t*.25*d.s)%1)*width,y=((d.y+t*.9*d.s)%1)*height;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-4,y+12*d.s);ctx.stroke()}}ctx.restore();if(!snow){ctx.save();ctx.globalAlpha=.12;ctx.fillStyle='#2a3a4a';ctx.fillRect(-20,-20,width+40,height+40);ctx.restore()}}
// ---------- 人物、樹、農田、建築 的繪製輔助 ----------
function noteUnit(e,drawn,flip){if(!drawn)return;if(!S.lastDraw)S.lastDraw=new Map();S.lastDraw.set(e.id,{img:drawn.pack?drawn.pack.image:atlas,r:drawn.r,w:drawn.w,h:drawn.h,flipped:flip})}
// ---------- 人物動畫幀表（Codex 交付 dist/art/anim/<code>-<family>-age<N>-<unit>.png，規格見 Codex美術發包_人物動畫.md）----------
// 有表就播幀，沒有就退回「一張圖＋剪切」。列：idle／walk／work／attack／death／carry，每列 8 格，格 128 px（騎兵 160）。
const ANIM={sheets:new Map(),manifest:null,manifestTried:false};
const ANIM_ROWS={idle:0,walk:1,work:2,attack:3,death:4,carry:5};const ANIM_FRAMES={idle:4,walk:8,work:6,attack:6,death:5,carry:4};
const UNIT_KEYS=['villager','infantry','ranged','cavalry'];
function animKey(e){const g=G();if(!g||e.type>3)return null;const code=(g.artCodes?g.artCodes(e.owner)[0]:null)||g.artCode(e.owner);/* 專屬圖集（ti）沒有動畫表就維持靜態，不套家族動畫 */if(!code)return null;const family=['modern','fantasy','scifi'].includes(g.mode)?g.mode:'historical';return code+'-'+family+'-age'+(g.ages[e.owner]||0)+'-'+UNIT_KEYS[e.type]}
function animSheet(e){const key=animKey(e);if(!key)return null;let s=ANIM.sheets.get(key);if(s===undefined){if(!ANIM.manifestTried){ANIM.manifestTried=true;try{fetch('art/anim/manifest.json').then(r=>r.ok?r.json():null).then(j=>{ANIM.manifest=j||{}}).catch(()=>{ANIM.manifest={}})}catch{ANIM.manifest={}}}
  s={image:new Image(),ready:false,missing:false,cell:e.type===3?160:128,key};s.image.onload=()=>{s.bodyPixels=measureAnimBody(s);s.ready=true};s.image.onerror=()=>{s.missing=true};s.image.src='art/anim/'+key+'.png';ANIM.sheets.set(key,s)}
 return s&&s.ready&&!s.missing?s:null}
function animFrames(sheet,row){const unit=sheet.key.split('-').pop();const m=ANIM.manifest?.[unit]?.[row];return m!=null?m:ANIM_FRAMES[row]}
// 依單位狀態決定列與格：走路依時間循環、工作跟原本 9 rad/s 節奏同步、攻擊依上次出手時間、待機慢速呼吸。
function animState(e){const g=G();const t=S.t;if(e.path.length)return {row:e.type===0&&e.load>0?'carry':'walk',fps:10,t:t+e.id*.37};if((e.task.kind==='gather'&&e.phase==='out'&&e.work>0)||e.task.kind==='build')return {row:e.type===0?'work':'attack',fps:9/(2*Math.PI)*6,t:t+e.id*1.7/9};if(e.task.kind==='attack'){const since=g.time-(e.strike??-9);if(since>=0&&since<.6)return {row:'attack',fps:10,t:since,once:true};return {row:'idle',fps:4,t:t+e.id*.37}}return {row:'idle',fps:4,t:t+e.id*.37}}
function measureAnimBody(sheet){try{const c=sheet.cell,canvas=document.createElement('canvas');canvas.width=canvas.height=c;const cx=canvas.getContext('2d',{willReadFrequently:true});cx.drawImage(sheet.image,0,0,c,c,0,0,c,c);const alpha=cx.getImageData(0,0,c,c).data;let left=c,top=c,right=-1,bottom=-1;for(let y=0;y<c;y++)for(let x=0;x<c;x++)if(alpha[(y*c+x)*4+3]>160){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}if(right<left)return c*.8;return infantryBodyHeight({r:[left,top,right-left+1,bottom-top+1],pack:{image:{width:c},alpha}})}catch{return sheet.cell*.8}}
// Match static sprites' body height; weapon length and transparent padding do not set scale.
// Use current camera zoom for death as well, so a fallen sprite never jumps size.
function drawAnimFrame(context,sheet,row,frame,cx,bottom,h,flip){const n=animFrames(sheet,row);if(n<=0)return false;const f=Math.max(0,Math.min(n-1,frame));const rowIdx=ANIM_ROWS[row];const c=sheet.cell;const target=(sheet.key.endsWith('-cavalry')?52:sheet.key.endsWith('-infantry')?46:40)*cam.z;const dh=target*c/(sheet.bodyPixels||c*.8),dw=dh;context.save();context.translate(cx,bottom);context.scale(flip?-1:1,1);context.drawImage(sheet.image,f*c,rowIdx*c,c,c,-dw/2,-dh+8*(dh/c),dw,dh);context.restore();return true}
function animUnit(context,e,x,y,w,h,flip){if(!S.on)return false;const sheet=animSheet(e);if(!sheet)return false;const st=animState(e);const n=animFrames(sheet,st.row);if(n<=0&&st.row!=='idle')return animUnitRow(context,sheet,e,'idle',x,y,w,h,flip);const frame=st.once?Math.floor(st.t*st.fps):Math.floor(st.t*st.fps)%Math.max(1,n);return drawAnimFrame(context,sheet,st.row,frame,x+w/2,y+h,h,flip)}
function animUnitRow(context,sheet,e,row,x,y,w,h,flip){const n=animFrames(sheet,row);if(n<=0)return false;return drawAnimFrame(context,sheet,row,Math.floor(S.t*4)%n,x+w/2,y+h,h,flip)}
// 走路：下半身左右交錯剪切、上半身微前傾；其他狀態照常畫。
function drawUnitSprite(context,index,x,y,w,h,e,walking){if(S.on&&animUnit(context,e,x,y,w,h,false))return null;/* 有動畫幀表就播幀；鏡像已由外層 ctx.scale 處理 */if(!S.on||!walking||typeof index==='string')return sprite(context,index,x,y,w,h);const custom=typeof index==='object';if(!custom&&!atlasReady)return null;const r=custom?index.r:rects[index],image=custom?index.pack.image:atlas,ratio=r[2]/r[3];let ww=w,hh=w/ratio;if(hh>h){hh=h;ww=h*ratio}const dx=x+(w-ww)/2,dy=y+h-hh;const ph=S.t*11+e.id*1.7;const legK=Math.sin(ph)*.22;const split=.56;const sh=r[3]*split;
 // 下半身以腳底為軸剪切；上半身平移到剪切後的腰線位置再反向微剪切，腰線兩段才會接得上（Helen 回報「走動時人會切一半」的修正）。
 const legH=hh*(1-split),waistShift=-legK*legH;
 context.save();context.translate(dx+ww/2,dy+hh);context.transform(1,0,legK,1,0,0);context.drawImage(image,r[0],r[1]+sh,r[2],r[3]-sh,-ww/2,-legH,ww,legH+.6);context.restore();
 context.save();context.translate(dx+ww/2+waistShift,dy+hh-legH+.3);context.transform(1,0,-legK*.35,1,0,0);context.drawImage(image,r[0],r[1],r[2],sh,-ww/2,-hh*split,ww,hh*split);context.restore();
 return {x:dx,y:dy,w:ww,h:hh,r,pack:custom?index.pack:null}}
// 被擊中閃白（再疊一次自己的圖，加亮）。
function hitFlash(e,drawn){if(!S.on||!drawn||!drawn.r||e.lastHit==null)return;const g=G();if(g.time-e.lastHit>.12)return;const img=drawn.pack?drawn.pack.image:atlas;ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.55;try{ctx.drawImage(img,...drawn.r,drawn.x,drawn.y,drawn.w,drawn.h)}catch{}ctx.restore()}
// 樹木隨風：以樹根為軸微幅左右擺，風向與相位依位置錯開。
function treeSway(e){if(!S.on)return 0;return Math.sin(S.t*1.4+e.x*.9+e.y*.6)*(.028+.02*Math.abs(S.wind))+S.wind*.018}
// 農田麥浪：三道半透明亮帶隨時間掃過。
function farmWave(e,drawn,z){if(!S.on||!drawn||e.progress<1||e.amount<=0)return;ctx.save();ctx.beginPath();ctx.ellipse(drawn.x+drawn.w/2,drawn.y+drawn.h*.62,drawn.w*.44,drawn.h*.3,0,0,Math.PI*2);ctx.clip();ctx.globalAlpha=.14;ctx.fillStyle='#fff6c4';for(let k=0;k<3;k++){const ph=((S.t*.35+k/3+e.id*.1)%1);const x=drawn.x+drawn.w*ph;ctx.beginPath();ctx.moveTo(x-drawn.w*.08,drawn.y);ctx.lineTo(x+drawn.w*.05,drawn.y);ctx.lineTo(x-drawn.w*.05,drawn.y+drawn.h);ctx.lineTo(x-drawn.w*.18,drawn.y+drawn.h);ctx.fill()}ctx.restore()}
// 施工：建築從地面「長」出來，外面圍鷹架。
function drawConstruction(context,index,x,y,w,h,progress,z){if(!S.on)return sprite(context,index,x,y,w,h);context.save();context.beginPath();context.rect(x-4,y+h*(1-progress)-2,w+8,h*progress+6);context.clip();const drawn=sprite(context,index,x,y,w,h);context.restore();const bx=drawn?drawn.x:x,by=drawn?drawn.y:y,bw=drawn?drawn.w:w,bh=drawn?drawn.h:h;context.save();context.strokeStyle='#7a5a32';context.lineWidth=Math.max(1,1.6*z);context.globalAlpha=.85;const top=by+bh*(1-Math.min(1,progress+.15));for(const fx of [bx+bw*.12,bx+bw*.5,bx+bw*.88]){context.beginPath();context.moveTo(fx,by+bh);context.lineTo(fx,top);context.stroke()}for(let k=0;k<3;k++){const yy=by+bh-(k+1)*bh*.28;if(yy<top)break;context.beginPath();context.moveTo(bx+bw*.08,yy);context.lineTo(bx+bw*.92,yy);context.stroke()}context.restore();return drawn}
// ---------- 聲音：環境音、腳步、背景音樂 ----------
const A={nodes:null,birdT:0,musicT:0,bar:0};
function ensureAudio(){const s=typeof sound!=='undefined'?sound:null;if(!s||!s.ctx||!s.master)return null;if(A.nodes)return A.nodes;const c=s.ctx;const mk=(freq,type,q)=>{const len=c.sampleRate*2,buf=c.createBuffer(1,len,c.sampleRate),d=buf.getChannelData(0);let b=0;for(let i=0;i<len;i++){const w=Math.random()*2-1;b=type==='brown'?(b+.02*w)/1.02:w;d[i]=type==='brown'?b*3.5:w}const src=c.createBufferSource();src.buffer=buf;src.loop=true;const f=c.createBiquadFilter();f.type='bandpass';f.frequency.value=freq;f.Q.value=q;const gnode=c.createGain();gnode.gain.value=0;src.connect(f);f.connect(gnode);gnode.connect(s.master);src.start();return {src,f,g:gnode}};
 A.nodes={wind:mk(420,'white',.4),waves:mk(240,'brown',.6),rain:mk(1800,'white',.3),music:c.createGain()};A.nodes.music.gain.value=0;A.nodes.music.connect(s.master);return A.nodes}
function updateAudio(g,dt){const s=typeof sound!=='undefined'?sound:null;if(!s)return;if(!s.ctx||!s.enabled){if(s.enabled)updateTracks(g,dt,s);return}const n=ensureAudio();if(!n)return;const c=s.ctx;const on=S.ambient&&S.on;
 // 鏡頭下的地形組成：水多→浪，樹多→鳥與風。
 if(!A.mix||S.t-A.mixT>.5){A.mixT=S.t;const r=viewRect();let water=0,trees=0,total=0;const step=Math.max(1,Math.floor((r.x1-r.x0)/12));for(let y=Math.floor(r.y0);y<r.y1;y+=step)for(let x=Math.floor(r.x0);x<r.x1;x+=step){if(!g.inBounds(x,y))continue;total++;if(!g.land[g.at(x,y)])water++}for(const nd of g.nodes){if(nd.resource===1&&nd.amount>0&&nd.x>r.x0&&nd.x<r.x1&&nd.y>r.y0&&nd.y<r.y1)trees++}A.mix={water:total?water/total:0,trees:Math.min(1,trees/25)}}
 const night=isNight();const rain=S.weather&&S.weatherState==='rain';const t=c.currentTime;const set=(gn,v)=>gn.gain.setTargetAtTime(on?v:0,t,.6);
 set(n.wind.g,(.012+.02*Math.abs(S.wind))*(1-A.mix.water*.5));n.wind.f.frequency.setTargetAtTime(380+S.wind*160,t,1);
 set(n.waves.g,.05*A.mix.water*(.6+.4*Math.sin(S.t*1.2)));set(n.rain.g,rain?.035:0);
 // 鳥叫（白天、有樹、沒下雨）；夜裡蟲鳴。
 A.birdT-=dt;if(on&&A.birdT<=0){A.birdT=(night?.6:1.2)+rnd()*(night?1.2:2.5);if(!night&&!rain&&A.mix.trees>.1&&rnd()<.3+A.mix.trees*.6){const f0=2400+rnd()*1200;const nchirp=2+Math.floor(rnd()*3);for(let k=0;k<nchirp;k++)setTimeout(()=>s.tone(f0*(1+(rnd()-.5)*.1),.06,'sine',.018,f0*1.35),k*90)}else if(night&&A.mix.water<.8){s.tone(4200,.03,'sine',.008);setTimeout(()=>s.tone(4200,.03,'sine',.008),60)}}
 // 腳步：畫面裡有我方單位走動時輕輕的沙沙聲。
 S.footT-=dt;if(on&&S.footT<=0){const walkers=g.units.filter(u=>u.owner===0&&u.hp>0&&u.path.length&&u.domain==='land'&&inView(u.x,u.y,0)).length;if(walkers){S.footT=Math.max(.16,.5/Math.min(walkers,6));s.noise(.03,.035*Math.min(1,walkers/4),900)}else S.footT=.3}
 updateMusic(g,dt,s,n)}
// 背景音樂：五聲音階、慢速、隨背景換調；程式合成，不用素材。
const SCALES={europe:[0,2,4,7,9],china:[0,2,4,7,9],modern:[0,3,5,7,10],fantasy:[0,2,3,7,8],scifi:[0,2,5,7,10]};
// 音樂檔（Helen 用 SUNO 生成，dist/music/*.mp3）：主選單 menu、各背景 calm／battle；基地附近有敵軍或我方在交戰時淡入 battle，平靜 12 秒後淡回 calm。檔案缺或載入失敗就退回程式合成。
const M={tracks:{},failed:new Set(),current:null,battleUntil:0,unlocked:false};
function track(name){if(M.failed.has(name))return null;let a=M.tracks[name];if(!a){a=new Audio('music/'+name+'.mp3');a.loop=true;a.preload='auto';a.volume=0;a.onerror=()=>{M.failed.add(name);delete M.tracks[name]};M.tracks[name]=a}return a}
function inBattle(g){const t=g.time;if(g.units.some(u=>u.owner===0&&u.hp>0&&u.strike!=null&&t-u.strike<3&&t-u.strike>=0))M.battleUntil=Math.max(M.battleUntil,t+12);else{for(const b of g.buildings){if(b.owner!==0||b.hp<=0)continue;const c=g.center(b);if(g.unitsNear(c.x,c.y,16,u=>u.type>0&&g.isHostile(0,u.owner)).length){M.battleUntil=Math.max(M.battleUntil,t+12);break}}}return t<M.battleUntil}
function updateTracks(g,dt,s){const master=(S.music&&S.on&&s.enabled)?s.volume*.6:0;const inMenu=typeof gameStarted!=='undefined'&&(!gameStarted||!!document.querySelector('#setup[open]'));const want=inMenu?'menu':(g.mode+(inBattle(g)?'_battle':'_calm'));const a=track(want);if(!a)return false;if(M.current!==want){M.current=want;if(a.paused){const p=a.play();if(p&&p.catch)p.catch(()=>{})}}
 for(const [name,el] of Object.entries(M.tracks)){const target=name===want?master:0;const v=el.volume+(target-el.volume)*Math.min(1,dt*.7);el.volume=Math.max(0,Math.min(1,v));if(target===0&&el.volume<.01&&!el.paused)el.pause();else if(target>0&&el.paused){const p=el.play();if(p&&p.catch)p.catch(()=>{})}}return true}
function updateMusic(g,dt,s,n){const c=s.ctx;if(updateTracks(g,dt,s)){n.music.gain.setTargetAtTime(0,c.currentTime,.5);return}const vol=S.music&&S.on?.05:0;n.music.gain.setTargetAtTime(vol,c.currentTime,1.5);if(!S.music||!S.on)return;A.musicT-=dt;if(A.musicT>0)return;const bpm=g.mode==='scifi'?68:72;const beat=60/bpm;A.musicT=beat;A.bar++;const scale=SCALES[g.mode]||SCALES.europe;const base=g.mode==='china'?220:g.mode==='scifi'?196:196;const t=c.currentTime+.05;const play=(semi,dur,type,gain)=>{const o=c.createOscillator(),e=c.createGain();o.type=type;o.frequency.value=base*Math.pow(2,semi/12);e.gain.setValueAtTime(.0001,t);e.gain.exponentialRampToValueAtTime(gain,t+.08);e.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(e);e.connect(n.music);o.start(t);o.stop(t+dur+.05);o.onended=()=>{o.disconnect();e.disconnect()}};
 if(A.bar%4===1){const root=scale[(Math.floor(A.bar/4))%scale.length]-12;play(root,beat*4,'triangle',.5);play(root+7,beat*4,'sine',.3)}
 if(rnd()<.62){if(A.melody==null)A.melody=2;A.melody=Math.max(0,Math.min(scale.length*2-1,A.melody+(rnd()<.5?-1:1)*(rnd()<.7?1:2)));const semi=scale[A.melody%scale.length]+12*Math.floor(A.melody/scale.length);play(semi,beat*(rnd()<.3?2:1)*.9,g.mode==='scifi'?'sawtooth':'sine',g.mode==='scifi'?.18:.42)}}
// ---------- 設定 ----------
function set(key,val){if(key in S){S[key]=!!val;persist()}}
function get(){return {on:S.on,dayNight:S.dayNight,weather:S.weather,ambient:S.ambient,music:S.music}}
root.POLISH={anim:ANIM,music:M,quake(){S.shake=Math.max(S.shake,10);S.shakeT=1.2},update,beginFrame,drawWater,drawParticles,endFrame,decor,drawAnimal,noteUnit,drawUnitSprite,hitFlash,treeSway,farmWave,drawConstruction,set,get,state:S};
})(typeof window!=='undefined'?window:globalThis);
