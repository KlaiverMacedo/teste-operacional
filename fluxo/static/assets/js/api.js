/* api.js — adapter de dados: fala com a API Flask (/api/fluxo). Era IndexedDB na versão de testes. */
let drift = 0;                                  // diferença entre o relógio do servidor e o do aparelho
const NOW = () => Date.now() + drift;           // o cronômetro usa a hora do servidor
async function api(path, opt = {}) {
  const fd = opt.body instanceof FormData;
  const r = await fetch('/api/fluxo' + path, {
    method: opt.method || 'GET', credentials: 'same-origin',
    headers: opt.body && !fd ? { 'Content-Type': 'application/json' } : {},
    body: opt.body ? (fd ? opt.body : JSON.stringify(opt.body)) : undefined });
  if (r.status === 401) {                       // sessão Microsoft expirada: entra de novo e volta para a mesma tela
    location.href = '/.auth/login/aad?post_login_redirect_uri=' + encodeURIComponent(location.pathname + location.search + location.hash);
    throw new Error('401');
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 403) { showDenied(j.erro); throw new Error('403'); }
  if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
  if (j.agora) drift = j.agora - Date.now();
  return j;
}
const API = {
  sala: slug => api('/sala/' + slug),
  iniciar: slug => api('/sala/' + slug + '/iniciar', { method: 'POST', body: {} }),
  salvar: (id, p) => api('/operacoes/' + id, { method: 'PATCH', body: p }),
  finalizar: id => api('/operacoes/' + id + '/finalizar', { method: 'POST', body: {} }),
  fotos: id => api('/operacoes/' + id + '/fotos').then(j => j.fotos),
  enviarFoto: (id, tipo, blob) => { const fd = new FormData(); fd.append('tipo', tipo); fd.append('foto', blob, 'foto.jpg'); return api('/operacoes/' + id + '/fotos', { method: 'POST', body: fd }); },
  todas: () => api('/operacoes?limite=5000').then(j => j.operacoes)
};
function showDenied(msg) {
  clearInterval(tick);
  A.innerHTML = '<main><h1>Acesso não liberado</h1><p class="sub"></p><div class="card empty">Peça à gestão para liberar o seu e-mail no sistema.</div></main>';
  A.querySelector('.sub').textContent = msg || '';
}
const fail = e => { if (e && (e.message === '401' || e.message === '403')) return; toast(e && e.message && e.message !== 'Failed to fetch' ? e.message : 'Sem conexão. Tente de novo.'); };
