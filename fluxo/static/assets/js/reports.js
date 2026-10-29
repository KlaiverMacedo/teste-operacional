/* reports.js — CSV e relatórios */
const csv=ops=>{const h=['Espaço','Serviço','Evento','Chapas','Início','Fim','Duração','Status','Registrado por'],r=ops.map(o=>[o.salaNome,TIPOS[o.tipo]||'',o.evento,o.chapas,new Date(o.inicioEm).toLocaleString('pt-BR'),o.fimEm?new Date(o.fimEm).toLocaleString('pt-BR'):'',fmt(dur(o)),o.status,o.criadoPor].map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';'));return'\uFEFF'+[h.join(';'),...r].join('\r\n')};
const dl=(name,data,type)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click()};
/* Relatórios: filtros, totais, detalhe, CSV (UTF-8 BOM, separador ;) */
let fl={de:'',ate:'',sala:'',status:'',tipo:'',q:''},sel=null,pg=0;
const PAGE=20;
const filtrar=ops=>ops.filter(o=>(!fl.de||o.inicioEm>=new Date(fl.de+'T00:00:00').getTime())&&(!fl.ate||o.inicioEm<=new Date(fl.ate+'T23:59:59').getTime())&&(!fl.sala||o.salaSlug===fl.sala)&&(!fl.status||o.status===fl.status)&&(!fl.tipo||o.tipo===fl.tipo)&&(!fl.q||((o.evento||'')+' '+(o.chapas||'')).toLowerCase().includes(fl.q.toLowerCase())));
const exportCsv=ops=>dl('fluxo-operacoes.csv',csv(ops),'text/csv;charset=utf-8');
const stB=o=>o.status==='concluida'?'<span class="badge o">Concluída</span>':dur(o)>8*36e5?'<span class="badge w">Atenção: iniciada há muito tempo</span>':'<span class="badge">Em andamento</span>';
document.addEventListener('change',e=>{const k=e.target.dataset.fl;if(k){fl[k]=e.target.value;pg=0;admin()}});
async function viewRel(ops){const L=filtrar(ops),tot={};L.forEach(o=>{const t=tot[o.salaNome]||(tot[o.salaNome]={n:0,ms:0});t.n++;t.ms+=dur(o)});
 const S=(k,opts,all)=>`<select data-fl="${k}" aria-label="${all}"><option value="">${all}</option>${opts.map(([v,t])=>`<option value="${v}" ${fl[k]===v?'selected':''}>${esc(t)}</option>`).join('')}</select>`;
 let det='';if(sel){const o=ops.find(x=>x.id===sel);if(o){const fs=await API.fotos(o.id);
  det=`<div class="card" id="det" style="margin-bottom:16px"><div class="phd"><b>Fluxo — Gestão de Operações de Espaços</b></div><h2 style="margin-top:0">${esc(o.salaNome)}</h2><div class="rev">
  ${[['Serviço',TIPOS[o.tipo]||'—'],['Como estava',o.antes||'—'],['Como ficou',o.depois||'—'],['Evento',o.evento||'—'],['Chapas',o.chapas||'—'],['Início',new Date(o.inicioEm).toLocaleString('pt-BR')],['Fim',o.fimEm?new Date(o.fimEm).toLocaleString('pt-BR'):'—'],['Duração',fmt(dur(o))],['Observação final',o.descFim||'—'],['Registrado por',o.criadoPor||'—']].map(([a,b])=>`<div><span>${a}</span><b>${esc(b)}</b></div>`).join('')}</div>
  <div class="ph" style="margin:12px 0">${fs.length?fs.map(f=>{const u='/api/fluxo/fotos/'+f.id;return`<img src="${u}" alt="Foto ${f.tipo}" data-a="zoom" data-u="${u}">`}).join(''):'<span class="sub">Sem fotos neste serviço.</span>'}</div>
  <p class="noprint"><button class="p" style="width:auto" data-a="printrec">Imprimir este registro</button> <button data-a="fechar">Fechar</button></p></div>`}}
 const pgs=Math.max(1,Math.ceil(L.length/PAGE)),rows=L.slice(pg*PAGE,pg*PAGE+PAGE);
 return`${det}<div class="rel-list"><div class="filters noprint"><input type="date" data-fl="de" value="${fl.de}" aria-label="De"><input type="date" data-fl="ate" value="${fl.ate}" aria-label="Até">
 ${S('sala',ROOMS.map(r=>[r.slug,r.nome]),'Todos os espaços')}${S('tipo',Object.entries(TIPOS),'Todos os serviços')}${S('status',[['concluida','Concluída'],['em_andamento','Em andamento']],'Todos os status')}
 <input type="text" data-fl="q" value="${esc(fl.q)}" placeholder="Evento ou chapa" aria-label="Evento ou chapa"></div>
 <h2>Tempo por espaço</h2><div class="card tw">${L.length?`<table><tr><th>Espaço</th><th>Serviços</th><th>Tempo total</th></tr>${Object.entries(tot).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v.n}</td><td>${fmt(v.ms)}</td></tr>`).join('')}</table>`:'<div class="empty">Nenhum serviço com esses filtros. Tente mudar as datas ou limpar os filtros.</div>'}</div>
 <h2>Serviços (${L.length})</h2><div class="card tw">${rows.length?`<table><tr><th>Espaço</th><th>Serviço</th><th>Início</th><th>Duração</th><th>Status</th><th></th></tr>${rows.map(o=>`<tr><td>${esc(o.salaNome)}</td><td>${TIPOS[o.tipo]||'—'}</td><td>${new Date(o.inicioEm).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</td><td>${fmt(dur(o))}</td><td>${stB(o)}</td><td><button style="min-height:44px;font-size:16px" data-a="ver" data-id="${o.id}">Ver</button></td></tr>`).join('')}</table>`:'<div class="empty">Sem serviços para mostrar.</div>'}</div>
 <div class="pager noprint"><button data-a="pg" data-v="-1" ${pg<=0?'disabled':''}>Anterior</button><span>Página ${pg+1} de ${pgs}</span><button data-a="pg" data-v="1" ${pg+1>=pgs?'disabled':''}>Próxima</button></div>
 <p class="noprint"><button data-a="csvf">Baixar planilha (CSV) dos filtros</button> <button data-a="print">Imprimir</button></p></div>`}
