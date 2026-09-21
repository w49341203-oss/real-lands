// 君主對話資料（2026-09-21，Helen：「跨國之間有王與王的溝通時，跳出君主立繪與對話」）。
// resolve(game, owner) → {key, name, title, portrait, lines}：依「國籍→家族代碼→背景→時代」找君主；劇情戰役的主帥（players[].leader）優先。
// 歷史時代用真實君主（12 家族 × 4 時代＝48 位，由劇本工作流撰寫、審稿），現代／架空／科幻用虛構元首（不指名真實政治人物，Helen 2026-09-21 拍板）。
// 立繪：portraits/<portrait>.png（Codex 生圖，見 Codex美術發包_君主立繪.md）；沒有圖就顯示剪影＋姓氏。台詞是遊戲設計，不是史料。
(function(root){
'use strict';
const DATA=root.RULER_DATA||(typeof require==='function'?(()=>{try{return require('./ruler-data.js')}catch{return null}})():null)||{families:{},nations:{},generic:{},leaders:{}};
const KINDS=['intro','contact','war','warReply','peace','accept','reject','rebuff','betray','truceEnd','attacking','attacked','defeated','victory','allyAccept','allyReject'];
const FALLBACK={intro:['{n}在此。此地的規矩，由本國來定。','{n}向你問候。願彼此各安其土。'],contact:['你的人踏進了{n}的疆界。','{n}的城池就在眼前，請自重。'],war:['{n}對你宣戰！','從今日起，{n}與你勢不兩立。'],warReply:['你選擇了戰爭，{n}奉陪到底。','既然如此，戰場上見。'],peace:['{n}願意停戰，你意下如何？','刀兵無益，{n}提議罷手。'],accept:['好，{n}答應你。','就依你所言，兩國罷兵。'],reject:['{n}不接受。','時機未到，{n}拒絕。'],rebuff:['你拒絕了{n}的善意，後果自負。','既然不領情，那就別再談了。'],betray:['{n}撕毀盟約，向你宣戰！','和平到此為止。'],truceEnd:['休戰結束，{n}不會再客氣。','時候到了，各憑本事。'],attacking:['{n}的大軍已經出發。','準備好，{n}來了。'],attacked:['你竟敢攻打{n}的都城！','{n}的城牆不會輕易倒下。'],defeated:['{n}……敗了。','記住今日，{n}不會被遺忘。'],victory:['勝利屬於{n}。','這片土地，如今歸{n}所有。'],allyAccept:['{n}願與你結盟。','從今起，你我共進退。'],allyReject:['{n}不與你結盟。','結盟之事，免談。']};
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
function groupOf(mode){return ['modern','fantasy','scifi'].includes(mode)?mode:'historical'}
function nationZh(game,owner){try{return game.nationLabel?game.nationLabel(owner).replace(/（.*$/,''):game.players[owner].nation}catch{return game.players[owner].nation}}
function resolve(game,owner){const p=game.players?.[owner];if(!p)return null;const group=groupOf(game.mode),age=game.ages?.[owner]||0,code=game.artCode?.(owner)||null;
 // 劇情主帥（之後擴充）：players[].leader 對應 DATA.leaders
 if(p.leader&&DATA.leaders?.[p.leader]){const L=DATA.leaders[p.leader];return {key:'leader:'+p.leader,name:L.name,title:L.title||'',portrait:L.portrait||('leader-'+p.leader),lines:L.lines}}
 if(group==='historical'){const byNation=DATA.nations?.[p.nation]?.[age];if(byNation)return {key:p.nation+':'+age,name:byNation.name,title:byNation.title||'',portrait:byNation.portrait||((DATA.nationCodes?.[p.nation]||code||'xx')+'-historical-age'+age),lines:byNation.lines,era:byNation.era};
  const fam=code&&DATA.families?.[code]?.[age];if(fam)return {key:code+':'+age,name:fam.name,title:fam.title||'',portrait:fam.portrait||(code+'-historical-age'+age),lines:fam.lines,era:fam.era};
  const polity=game.playerName?game.playerName(owner):p.nation;return {key:'generic:'+owner,name:polity+'君主',title:'',portrait:'generic-historical',lines:FALLBACK,generic:true}}
 const gen=DATA.generic?.[group+'-'+code]||DATA.generic?.[group];const nz=nationZh(game,owner);
 if(gen)return {key:group+':'+(code||owner),name:group==='modern'?gen.name:nz+gen.name,title:gen.title||'',portrait:gen.portrait||(group==='modern'?code+'-modern':group),lines:gen.lines,generic:true};
 return {key:'generic:'+owner,name:nz+'元首',title:'',portrait:'generic-'+group,lines:FALLBACK,generic:true}}
function line(who,kind,seed=0){const set=(who?.lines?.[kind]&&who.lines[kind].length?who.lines[kind]:FALLBACK[kind])||[];if(!set.length)return '';const s=set[hash(String(seed)+kind)%set.length];return s.replace(/\{n\}/g,who.name||'')}
root.RULERS={resolve,line,KINDS,data:DATA};
if(typeof module!=='undefined'&&module.exports)module.exports=root.RULERS;
})(typeof window!=='undefined'?window:globalThis);
