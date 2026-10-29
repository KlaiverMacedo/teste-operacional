/* admin.js — painel da gestão */
let tab='painel';
async function admin(){clearInterval(tick);const ops=(await API.todas()).sort((a,b)=>b.inicioEm-a.inicioEm);
 const hj=ops.filter(o=>sameDay(o.inicioEm)),ok=hj.filter(o=>o.status==='concluida'),and=ops.filter(o=>o.status==='em_andamento'),at=and.filter(o=>dur(o)>8*36e5);
 let body='';
 if(tab==='painel'){const by={};ok.forEach(o=>by[o.salaNome]=(by[o.salaNome]||0)+dur(o));const mx=Math.max(1,...Object.values(by));
  body=`<div class="kp"><div class="card">Concluídas hoje<b>${ok.length}</b></div><div class="card">Tempo total hoje<b>${fmt(ok.reduce((s,o)=>s+dur(o),0))}</b></div><div class="card">Espaços atendidos<b>${Object.keys(by).length}</b></div><div class="card">Em andamento<b>${and.length}</b></div><div class="card">Precisam de atenção<b>${at.length}</b></div></div>
  <h2>Horas por espaço (hoje)</h2><div class="card">${Object.keys(by).length?Object.entries(by).map(([k,v])=>`<div class="bar"><span>${esc(k)}</span><i style="width:${v/mx*50}%"></i><span>${fmt(v)}</span></div>`).join(''):'<div class="empty">Ainda não há serviços concluídos hoje.</div>'}</div>
  <h2>Serviços registrados</h2><div class="card tw">${ops.length?`<table><tr><th>Espaço</th><th>Serviço</th><th>Evento</th><th>Início</th><th>Duração</th><th>Status</th></tr>${ops.slice(0,100).map(o=>`<tr><td>${esc(o.salaNome)}</td><td>${TIPOS[o.tipo]||'—'}</td><td>${esc(o.evento)||'—'}</td><td>${new Date(o.inicioEm).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</td><td>${fmt(dur(o))}</td><td>${o.status==='concluida'?'<span class="badge o">Concluída</span>':dur(o)>8*36e5?'<span class="badge w">Atenção: iniciada há muito tempo</span>':'<span class="badge">Em andamento</span>'}</td></tr>`).join('')}</table>`:'<div class="empty">Nenhum serviço ainda. Leia o QR Code de uma sala para começar.</div>'}</div>
  <p><button data-a="csv">Baixar planilha (CSV)</button></p>`}
 if(tab==='qr'){body=`<p class="sub">Endereço usado nos QR Codes: <b>${esc(base())}</b>. Para mudar, vá em Configurações antes de imprimir.</p><p class="noprint"><button class="p" style="width:auto" data-a="print">Imprimir todos (A4)</button></p><div class="qg">${ROOMS.map(r=>{const q=qrcode(0,'M');q.addData(qrUrl(r));q.make();const u=q.createDataURL(12,4);return`<div class="card"><img src="${u}" alt="QR Code ${esc(r.nome)}"><h3>${esc(r.nome)}</h3><small>Aponte a câmera do celular para começar</small><br><a class="noprint" href="${u}" download="qr-${r.slug}.png">Baixar PNG</a></div>`}).join('')}</div>`}
 if(tab==='backup'){body=`<div class="card"><p>Faça uma cópia dos registros regularmente.</p><button class="p" style="width:auto" data-a="bk">Baixar cópia de segurança</button></div>`}
 if(tab==='rel')body=await viewRel(ops);if(tab==='config')body=viewConfig();
 A.innerHTML=`<div class="adm"><main><div class="top noprint"><b>Fluxo · Gestão</b><span><a class="btn g" href="#">Tela do operador</a></span></div><h1>Gestão de Operações de Espaços</h1>
 
 <div class="tabs noprint">${[['painel','Painel'],['rel','Relatórios'],['qr','QR Codes'],['config','Configurações']].map(([k,t])=>`<button data-tab="${k}" class="${tab===k?'on':''}">${t}</button>`).join('')}</div>${body}</main></div>`}
Object.assign(ACT,{
 async csv(){exportCsv(await API.todas())},async csvf(){exportCsv(filtrar(await API.todas()))},
 print(){window.print()},
 ver(e){sel=e.dataset.id;admin()},fechar(){sel=null;admin()},
 pg(e){pg=Math.max(0,pg+Number(e.dataset.v));admin()},
 printrec(){document.body.classList.add('pr1');window.print();setTimeout(()=>document.body.classList.remove('pr1'),500)},
 zoom(e){const d=document.createElement('div');d.className='lb';d.innerHTML='<button class="p" style="width:auto;min-height:48px" aria-label="Fechar foto">Fechar</button><img alt="Foto ampliada">';d.querySelector('img').src=e.dataset.u;d.querySelector('button').onclick=()=>d.remove();d.querySelector('img').onclick=ev=>ev.target.classList.toggle('z');document.body.append(d)},
 baseSave(){let v=$('#bu').value.trim();if(v&&!/^https?:\/\//i.test(v))v='https://'+v;v?localStorage.setItem('fluxo:baseUrl',v):localStorage.removeItem('fluxo:baseUrl');toast('Endereço salvo');admin()},
});


