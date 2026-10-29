/* Endereço dos QR Codes: por padrão o próprio site (https://<site>/fluxo/?sala=<slug>). Pode ser trocado em Configurações. */
const base=()=>(localStorage.getItem('fluxo:baseUrl')||(location.origin+'/fluxo/')).replace(/\/*$/,'/');
const qrUrl=r=>base()+'?sala='+r.slug;
function viewConfig(){return`<div class="card"><h2 style="margin-top:0">Endereço dos QR Codes</h2><p class="sub">Normalmente não precisa mudar. Use só se o site tiver outro endereço (por exemplo, um domínio próprio). Depois de mudar, imprima os QR Codes de novo.</p>
 <label for="bu">Endereço do Fluxo</label><input type="text" id="bu" placeholder="${esc(location.origin+'/fluxo/')}" value="${esc(localStorage.getItem('fluxo:baseUrl')||'')}">
 <p><button class="p" style="width:auto" data-a="baseSave">Salvar endereço</button></p></div>`}
