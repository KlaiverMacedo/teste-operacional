/* ui.js — helpers de interface */
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const IC=p=>`<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${p}"/></svg>`;
const I={mont:IC('M12 5v14M5 12h14'),des:IC('M5 12h14'),troca:IC('M17 2l4 4-4 4M3 11v-1a4 4 0 014-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 01-4 4H3'),cam:IC('M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3zM12 17a4 4 0 100-8 4 4 0 000 8z')};

const toast=m=>{const t=document.createElement('div');t.className='toast';t.setAttribute('role','status');t.textContent=m;document.body.append(t);setTimeout(()=>t.remove(),2600)};
const buzz=()=>navigator.vibrate?.(10);
/* Diálogo em tela cheia (substitui confirm()) */
function ask(msg,okTxt,onOk){const d=document.createElement('div');d.className='ov';d.setAttribute('role','alertdialog');d.setAttribute('aria-modal','true');
 d.innerHTML='<div class="card"><p></p><button class="p" id="ay"></button><button id="an" style="width:100%;margin-top:8px">Cancelar</button></div>';
 d.querySelector('p').textContent=msg;d.querySelector('#ay').textContent=okTxt;document.body.append(d);d.querySelector('#ay').focus();
 d.querySelector('#an').onclick=()=>d.remove();d.querySelector('#ay').onclick=()=>{d.remove();onOk()}}
