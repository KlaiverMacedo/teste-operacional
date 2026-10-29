/* Boot e rotas: ?sala=<slug> abre a sala; #admin abre a gestão */
async function route(){const h=decodeURIComponent(location.hash.slice(1));document.body.className='';
 if(h==='admin'||h==='/admin'){return admin()}
 const r=ROOMS.find(x=>x.slug===(new URLSearchParams(location.search).get('sala')||h));if(!r){cur={room:null,op:null};return home()}
 cur.room=r;const j=await API.sala(r.slug);cur.op=j.op;cur.rec=j.recentes;sala()}
addEventListener('hashchange',()=>route().catch(fail));route().catch(fail);
if('storage' in navigator&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});

