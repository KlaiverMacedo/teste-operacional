/* photos.js — captura e compressão */
async function comp(f){const im=await createImageBitmap(f),k=Math.min(1,1600/im.width),c=document.createElement('canvas');c.width=im.width*k;c.height=im.height*k;c.getContext('2d').drawImage(im,0,0,c.width,c.height);return new Promise(r=>c.toBlob(r,'image/jpeg',.8))}
async function addFoto(f,tipo){try{const blob=await comp(f);await API.enviarFoto(cur.op.id,tipo,blob);toast('Foto salva');buzz()}catch(e){if(e.message!=='401'&&e.message!=='403')toast('Não deu para enviar a foto. Confira a internet e tente de novo.')}sala()}
const fotoBtn=(t,txt)=>`<label class="btn" style="margin:0;width:100%">${I.cam} ${txt}<input type="file" accept="image/*" capture="environment" data-foto="${t}" hidden></label>`;
