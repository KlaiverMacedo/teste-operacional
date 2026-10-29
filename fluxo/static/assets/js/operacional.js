/* operacional.js — telas e ações do operador */
let cur={room:null,op:null},lock=false,tick,dbt;
const A=$('#app');
const chips=(arr,f,sel)=>`<div class="chips">${arr.map(v=>`<button class="chip ${sel===v?'on':''}" data-a="chip" data-f="${f}" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>`;
const foot=(a,t,sec)=>`<div class="foot noprint">${sec||''}<button class="p" data-a="${a}">${t}</button></div>`;
function home(){A.innerHTML=`<main><div class="top"><b>Fluxo</b><a class="btn g" style="min-height:44px;font-size:16px" href="#admin">Área da gestão</a></div>
<h1>Aponte a câmera para o QR Code da sala</h1><p class="sub">Cada sala tem um QR Code colado. Ao ler, o serviço começa na sala certa, sem precisar escolher nada.</p>
<div class="card empty">Nenhuma sala aberta. Use a câmera do celular no QR Code da sala.</div></main>`}
async function sala(){const r=cur.room,op=cur.op,n=op?(await API.fotos(op.id)).length:0;
 const date=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
 const hd=`<div class="top"><span>${esc(date)}</span></div>`;
 clearInterval(tick);
 if(!op){A.innerHTML=`<main>${hd}<p class="sub" style="margin:0">Você está na</p><div class="room">${esc(r.nome)}</div><div class="badge o">Pronto para começar</div></main>${foot('start','Começar serviço','<small>O tempo começa a contar automaticamente</small>')}`;return}
 const tm=`<div class="top"><span class="badge">${esc(r.nome)}</span><b class="tm2" id="tm" style="font-variant-numeric:tabular-nums"></b></div>`;
 if(op.etapa==='tipo'){A.innerHTML=`<main>${tm}<h1>O que você vai fazer?</h1><p class="sub">Toque em uma opção.</p>
 ${[['montagem','Montagem','Vou montar a sala',I.mont],['desmontagem','Desmontagem','Vou desmontar a sala',I.des],['troca','Desmontagem + montagem','Vou trocar o layout',I.troca]].map(([k,t,s,i])=>`<button class="opt ${op.tipo===k?'on':''}" data-a="tipo" data-v="${k}" aria-pressed="${op.tipo===k}">${i}<div><b>${t}</b><span>${s}</span></div></button>`).join('')}
 ${op.tipo==='troca'?`<h2>Como está hoje?</h2>${chips(LAYOUTS,'antes',op.antes)}<h2>Como vai ficar?</h2>${chips(LAYOUTS,'depois',op.depois)}`:''}</main>${op.tipo==='troca'?foot('det','Continuar'):''}`}
 else if(op.etapa==='det'){const ev=(cur.rec||{}).evento||[],ch=(cur.rec||{}).chapas||[];A.innerHTML=`<main>${tm}<h1>Mais alguma informação?</h1><p class="sub">Tudo aqui é opcional.</p>
 <label for="ev">Nome do evento</label><input type="text" id="ev" data-in="evento" value="${esc(op.evento)}" autocomplete="off">${chips(ev,'evento',op.evento)}
 <label for="ch">Chapas</label><input type="text" id="ch" data-in="chapas" value="${esc(op.chapas)}" autocomplete="off">${chips(ch,'chapas',op.chapas)}
 <div style="margin-top:16px">${fotoBtn('inicial','Tirar foto do espaço')}${n?`<p class="sub">${n} foto(s) salva(s)</p>`:''}</div></main>${foot('and','Continuar','<button class="g" data-a="and">Pular</button>')}`}
 else if(op.etapa==='and'){A.innerHTML=`<main>${tm}<span class="badge">${TIPOS[op.tipo]}</span><p class="sub" style="margin-top:12px">Início às ${hm(op.inicioEm)}</p><div class="tm" id="tm2" role="timer" aria-label="Tempo de serviço"></div>
 ${fotoBtn('andamento','Adicionar foto')}${n?`<p class="sub">${n} foto(s) salva(s)</p>`:''}</main>${foot('fin','Finalizar serviço')}`}
 else if(op.etapa==='fin'){A.innerHTML=`<main>${tm}<h1>Como ficou a sala?</h1><p class="sub">Tudo opcional.</p>${fotoBtn('final','Tirar foto final')}${n?`<p class="sub">${n} foto(s) salva(s)</p>`:''}
 <h2>Observação</h2>${chips(['Sala pronta','Mesas organizadas','Equipamentos testados','Palco montado'],'descFim',op.descFim)}</main>${foot('rev','Continuar')}`}
 else if(op.etapa==='rev'){A.innerHTML=`<main><h1>Confere se está certo</h1><div class="card rev"><div><span>Sala</span><b>${esc(r.nome)}</b></div><div><span>Serviço</span><b>${TIPOS[op.tipo]||'—'}</b></div><div><span>Início</span><b>${hm(op.inicioEm)}</b></div><div><span>Fim</span><b>${hm(NOW())}</b></div><div><span>Duração</span><b>${fmt(NOW()-op.inicioEm)}</b></div></div></main>${foot('ok','Terminei, salvar','<button data-a="back">Voltar</button>')}`}
 else if(op.etapa==='fim'){A.innerHTML=`<main><svg class="ck" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke-dasharray="none"/><path d="M8 12.5l3 3 5-6"/></svg><h1 style="text-align:center">Deu certo!</h1><p class="sub" style="text-align:center">Duração: ${fmt(dur(op))}</p></main>${foot('done','Concluir e voltar ao início')}`}
 const upd=()=>{const e=$('#tm2');if(e)e.textContent=fmt(NOW()-op.inicioEm);const m=$('#tm');if(m&&op.etapa!=='fim')m.textContent=op.etapa==='and'?'':fmt(NOW()-op.inicioEm)};upd();tick=setInterval(upd,1000)}
async function save(p){await API.salvar(cur.op.id,p);Object.assign(cur.op,p)}
const ACT={
 async start(){if(lock||cur.op)return;lock=true;setTimeout(()=>lock=false,500);const j=await API.iniciar(cur.room.slug);cur.op=j.op;sala()},
 async tipo(e){await save({tipo:e.dataset.v,etapa:e.dataset.v==='troca'?'tipo':'det'});sala()},
 async chip(e){const f=e.dataset.f,v=e.dataset.v;await save({[f]:cur.op[f]===v?'':v});sala()},
 async det(){await save({etapa:'det'});sala()},async and(){await save({etapa:'and'});sala()},
 async fin(){await save({etapa:'fin'});sala()},async rev(){await save({etapa:'rev'});sala()},async back(){await save({etapa:'fin'});sala()},
 async ok(){if(lock)return;lock=true;try{cur.op=(await API.finalizar(cur.op.id)).op}finally{lock=false}buzz();toast('Serviço registrado!');sala()},
 async done(){const j=await API.sala(cur.room.slug);cur.op=j.op;cur.rec=j.recentes;sala()}};
document.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(b&&ACT[b.dataset.a]){buzz();Promise.resolve(ACT[b.dataset.a](b)).catch(fail)}const t=e.target.closest('[data-tab]');if(t){tab=t.dataset.tab;admin().catch(fail)}});
document.addEventListener('change',e=>{const f=e.target.dataset.foto;if(f&&e.target.files[0])addFoto(e.target.files[0],f)});
document.addEventListener('input',e=>{const k=e.target.dataset.in;if(k&&cur.op){cur.op[k]=e.target.value;clearTimeout(dbt);dbt=setTimeout(()=>save({[k]:cur.op[k]}).catch(fail),600)}});
