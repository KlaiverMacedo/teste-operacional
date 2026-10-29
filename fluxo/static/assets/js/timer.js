/* timer.js — tempo sempre calculado por NOW() - inicioEm */
const pad=n=>String(n).padStart(2,'0'),hm=t=>{const d=new Date(t);return pad(d.getHours())+':'+pad(d.getMinutes())};
const fmt=ms=>{const s=Math.max(0,Math.floor(ms/1000));return pad(Math.floor(s/3600))+':'+pad(Math.floor(s%3600/60))+':'+pad(s%60)};
const dur=o=>(o.fimEm||NOW())-o.inicioEm;
