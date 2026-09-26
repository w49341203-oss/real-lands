// MatchConfig v1：開局設定的正式資料格式（P0）。
// 舊版兩陣營選項（map/mode/difficulty/startAge/lockAge/nation/enemyNation）由 fromLegacy 轉成同一格式。
// 這裡只做資料驗證與預設值，不含遊戲規則；引擎與介面都只認 normalize() 產出的 config。
(function(root){
'use strict';
const SCHEMA_VERSION=1;
const MAX_PLAYERS=12;
const MODE_IDS=['europe','china','modern','fantasy','scifi'];
const DIFFICULTIES=['easy','normal','hard'];
const CONTROLLERS=['human','ai'];
const VICTORIES=['conquest','tc','landmark','wonder','timed','scenario'];
const SPAWN_POLICIES=['balanced','allies_adjacent','islands','geographic'];
// 邏輯網格的最長邊（格）。legacy 是舊版 112×112 正方形，供舊設定與既有檢查沿用。
const SIZES={legacy:112,small:160,standard:256,large:384,world:512,worldL:1024,worldXL:1536};/* world*：世界／區域地圖專用（Helen：整個世界地圖放大） */
const COLORS=['#74d8e0','#ee7870','#f2d36b','#8fd676','#c99bf0','#f2a65a','#7fa8ff','#f08fc0','#c58a4a','#3fcbb0','#f4f1e6','#a3a3a3'];
const COLOR_NAMES=['青','紅','黃','綠','紫','橙','藍','粉','棕','湖綠','白','灰'];
function fromLegacy(o={}){
 const startAge=o.startAge|0,lock=!!o.lockAge;
 return {schemaVersion:o.schemaVersion??SCHEMA_VERSION,seed:o.seed,mode:o.mode,map:{id:o.map,size:o.size||'legacy',spawnPolicy:o.spawnPolicy||'balanced'},
  rules:{startAge,maxAge:lock?startAge:(o.maxAge??null),lockAge:lock,popCap:o.popCap??150,victory:o.victory||'tc',lockTeams:true,sharedVision:true},
  players:[{controller:'human',nation:o.nation||o.map,teamId:1,difficulty:o.difficulty||'normal'},{controller:'ai',nation:o.enemyNation||o.map,teamId:2,difficulty:o.difficulty||'normal'}]};
}
function normalize(input){
 const errors=[],warnings=[];
 const src=input&&Array.isArray(input.players)?input:fromLegacy(input||{});
 if(src.schemaVersion!=null&&src.schemaVersion!==SCHEMA_VERSION)errors.push('不支援的設定版本 '+src.schemaVersion+'（目前為 '+SCHEMA_VERSION+'）');
 const mode=MODE_IDS.includes(src.mode)?src.mode:(src.mode==null?'europe':null);if(mode===null)errors.push('未知的文明背景：'+src.mode);
 const map={id:typeof src.map?.id==='string'&&src.map.id?src.map.id:'Taiwan',size:src.map?.size??'legacy',spawnPolicy:src.map?.spawnPolicy||'balanced',projection:src.map?.projection==='mercator'?'mercator':'plate'};/* projection：世界／區域地圖新局用 mercator；舊存檔沒有這欄位就維持原本的等距長方投影 */
 if(typeof map.size==='number'){if(!(map.size>=64&&map.size<=1536))errors.push('地圖邊長需在 64–1536 格之間')}else if(!SIZES[map.size])errors.push('未知的地圖尺寸：'+map.size);
 if(!SPAWN_POLICIES.includes(map.spawnPolicy))errors.push('未知的出生方式：'+map.spawnPolicy);
 const r=src.rules||{};const startAge=Math.max(0,Math.min(3,r.startAge|0));let maxAge=r.maxAge==null?3:Math.max(0,Math.min(3,r.maxAge|0));const lockAge=!!r.lockAge||(r.maxAge!=null&&maxAge===startAge);if(lockAge)maxAge=startAge;
 if(r.maxAge!=null&&(r.maxAge|0)<startAge)errors.push('最高時代不得低於起始時代');
 const victory=r.victory||'conquest';if(!VICTORIES.includes(victory))errors.push('未知的勝利規則：'+victory);
 const rules={startAge,maxAge,lockAge,popCap:Math.max(20,Math.min(200,r.popCap|0||150)),victory,lockTeams:r.lockTeams===true,sharedVision:r.sharedVision!==false,timeLimit:Math.max(5,Math.min(180,r.timeLimit|0||30)),holdMinutes:Math.max(1,Math.min(30,r.holdMinutes|0||5)),landmarks:Math.max(3,Math.min(7,r.landmarks|0||5)),tutorial:r.tutorial!==false,truce:r.truce==null?(map.id==='World'?10:map.id==='EastAsia'?5:0):Math.max(0,Math.min(30,r.truce|0)),events:r.events!==false,spawnSpacing:Math.max(8,Math.min(48,r.spawnSpacing|0||24)),/* 劇情出生點最小間距（格），預設 24；密集的中國內戰用 12 */yearMinutes:r.yearMinutes==null?10:Math.max(0,Math.min(60,r.yearMinutes|0))};/* yearMinutes：每個時代年份走完要幾分鐘，0＝不推進 */
 let players=(src.players||[]).map((p,i)=>({controller:CONTROLLERS.includes(p.controller)?p.controller:'ai',nation:typeof p.nation==='string'&&p.nation?p.nation:map.id,teamId:p.teamId|0||i+1,difficulty:DIFFICULTIES.includes(p.difficulty)?p.difficulty:'normal',color:p.color||null,name:p.name||null,leader:typeof p.leader==='string'&&p.leader?p.leader:null,/* 劇情主帥代號，對應 ruler-data.js 的 leaders */passive:p.passive===true,/* 旁觀勢力：同時期沒參戰的國家，開局與所有人停戰、AI 不會主動開戰（Helen：只有兩方太無聊） */spawn:p.spawn&&Number.isFinite(+p.spawn.lon)&&Number.isFinite(+p.spawn.lat)?{lon:+p.spawn.lon,lat:+p.spawn.lat}:null}));
 if(players.length<1)errors.push('至少需要一個勢力');if(players.length>MAX_PLAYERS)errors.push('勢力數最多 '+MAX_PLAYERS+' 個');
 const humans=players.filter(p=>p.controller==='human');if(humans.length!==1)errors.push('需要恰好一位人類玩家（目前 '+humans.length+' 位）');
 // 人類玩家固定為 0 號，介面與視野都以此為準。
 players=[...players.filter(p=>p.controller==='human'),...players.filter(p=>p.controller!=='human')];
 const teams=new Set(players.map(p=>p.teamId));if(players.length>1&&teams.size<2)errors.push('所有勢力同一隊，沒有對手；請至少分成兩隊');
 const used=new Set();players.forEach((p,i)=>{if(!p.color||used.has(p.color))p.color=COLORS.find(c=>!used.has(c))||COLORS[i%COLORS.length];used.add(p.color);p.colorName=COLOR_NAMES[COLORS.indexOf(p.color)]||'';});
 const seed=Number.isFinite(src.seed)?src.seed>>>0:1709;
 // 劇情戰役：scenario 只做形狀檢查（目標種類與必要參數），劇情文字不進設定。
 const OBJ_KINDS=['survive','destroy','build','age','resource','tech','wonder','burn'],LOSE_KINDS=['protect','deadline'];let scenario=null;
 if(src.scenario&&typeof src.scenario==='object'){const objectives=(Array.isArray(src.scenario.objectives)?src.scenario.objectives:[]).filter(o=>o&&OBJ_KINDS.includes(o.kind)).map(o=>({...o}));const lose=(Array.isArray(src.scenario.lose)?src.scenario.lose:[]).filter(o=>o&&LOSE_KINDS.includes(o.kind)).map(o=>({...o}));scenario={id:String(src.scenario.id||''),title:String(src.scenario.title||''),year:src.scenario.year!=null?String(src.scenario.year):null,era:src.scenario.era!=null?String(src.scenario.era):null,fleets:Array.isArray(src.scenario.fleets)?src.scenario.fleets.map(f=>({player:f.player|0,type:f.type|0,count:Math.max(0,Math.min(40,f.count|0)),at:f.at&&Number.isFinite(+f.at.lon)&&Number.isFinite(+f.at.lat)?{lon:+f.at.lon,lat:+f.at.lat}:null,chained:f.chained===true,fire:f.fire===true})):null,wind:src.scenario.wind&&typeof src.scenario.wind==='object'?{from:String(src.scenario.wind.from||''),turnTo:src.scenario.wind.turnTo?String(src.scenario.wind.turnTo):null,turnAt:Math.max(0,src.scenario.wind.turnAt|0)}:null,advisors:src.scenario.advisors&&typeof src.scenario.advisors==='object'?src.scenario.advisors:null,fireAttack:Array.isArray(src.scenario.fireAttack)?src.scenario.fireAttack.map(n=>n|0):null,objectives,lose};/* year：劇情史實年份，只給畫面顯示 */for(const o of [...objectives,...lose]){if(o.player!=null&&!(Number.isInteger(o.player)&&o.player>=1&&o.player<players.length))errors.push('劇情目標指到不存在的勢力：'+o.player)}}
 if(victory==='scenario'&&!(scenario&&scenario.objectives.length))errors.push('劇情勝利需要至少一個目標');
 const config={schemaVersion:SCHEMA_VERSION,seed,mode:mode||'europe',map,rules,players,scenario};
 return {ok:errors.length===0,errors,warnings,config};
}
function gridSize(size){return typeof size==='number'?Math.round(size):SIZES[size]||SIZES.legacy}
const api={SCHEMA_VERSION,MAX_PLAYERS,MODE_IDS,DIFFICULTIES,VICTORIES,SPAWN_POLICIES,SIZES,COLORS,COLOR_NAMES,fromLegacy,normalize,gridSize};
if(typeof module!=='undefined')module.exports=api;root.MATCH=api;
})(typeof window!=='undefined'?window:globalThis);
