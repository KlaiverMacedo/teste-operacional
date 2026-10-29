/* operations.js — regras de negócio */
const TIPOS={montagem:'Montagem',desmontagem:'Desmontagem',troca:'Desmontagem + montagem'};
const LAYOUTS=['Auditório em fileiras','Mesas em U','Escolar','Coquetel','Vazio'];
const sameDay=t=>new Date(t).toDateString()===new Date().toDateString();

