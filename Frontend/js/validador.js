const API_URL = ""; // OU VAZIO

// --- Gerador de Áudio Inteligente (Sem precisar de arquivos .mp3) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function tocarSom(tipo) {
  // O navegador pode suspender o áudio até o usuário interagir com a tela
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  if (tipo === 'sucesso') {
    // Som agudo e amigável (Bip de caixa de mercado)
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, audioCtx.currentTime); 
    oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.2);
  } else { 
    // Som grave e de alerta (Buzzer de erro)
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.5);
  }
}

function piscarTela(tipo) {
  // Remove as classes se já existirem para poder reiniciar a animação
  document.body.classList.remove('flash-error-bg', 'flash-success-bg');
  // Hack mágico para forçar o navegador a "reler" o CSS instantaneamente
  void document.body.offsetWidth; 
  
  if (tipo === 'erro') {
    document.body.classList.add('flash-error-bg');
  } else {
    document.body.classList.add('flash-success-bg');
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Adiciona evento para o formulário de leitura manual
  document
    .getElementById("form-leitor-barra")
    .addEventListener("submit", validarLeituraBarra);

  // Foca automaticamente no campo de código
  document.getElementById("codigoBarra").focus();
});

// --- Funções de Leitura Manual/Barra ---

async function validarLeituraBarra(event) {
  event.preventDefault();

  const codigoInput = document.getElementById("codigoBarra");
  const codigo = codigoInput.value.trim();

  if (codigo) {
    await validarVoucher(codigo);
  }

  // Limpa o campo e mantém o foco, ideal para o leitor de barras
  codigoInput.value = "";
  codigoInput.focus();
}

// --- Função Central de Validação (API) ---

async function validarVoucher(codigo) {
  const resultDiv = document.getElementById("qr-result");
  resultDiv.className = "result-box waiting";
  resultDiv.innerHTML = `<p>Verificando Código...</p>`;

  try {
    const response = await fetch(`${API_URL}/voucher/validar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: codigo }),
    });
    const result = await response.json();

    resultDiv.className = "result-box";

    if (result.status === "sucesso") {
      tocarSom('sucesso');
      piscarTela('sucesso');
      
      resultDiv.classList.add("valid");
      resultDiv.innerHTML = `
        <h4><i class="bi bi-check-circle-fill me-2"></i>Voucher Válido!</h4>
        <p class="mb-1">Pode utilizar.</p>
        <p class="mb-1"><strong>Evento:</strong> ${result.evento_nome}</p>
        <p class="mb-0"><strong>Código:</strong> ${codigo}</p>
      `;
    } else if (result.status === "ja_utilizado") {
      tocarSom('erro');
      piscarTela('erro');
      
      resultDiv.classList.add("invalid");
      resultDiv.innerHTML = `
        <h4><i class="bi bi-x-circle-fill me-2"></i>Voucher Já Utilizado!</h4>
        <p class="mb-1">Este voucher já foi usado anteriormente.</p>
        <p class="mb-1"><strong>Evento:</strong> ${result.evento_nome}</p>
        <p class="mb-0"><strong>Código:</strong> ${codigo}</p>
      `;
    } else if (result.status === "expirado") {
      tocarSom('erro');
      piscarTela('erro');
      
      resultDiv.classList.add("invalid");
      resultDiv.innerHTML = `
        <h4><i class="bi bi-clock-fill me-2"></i>Voucher Expirado!</h4>
        <p class="mb-1">Este voucher não é mais válido.</p>
        <p class="mb-1"><strong>Evento:</strong> ${result.evento_nome}</p>
        <p class="mb-0"><strong>Código:</strong> ${codigo}</p>
      `;
    } else {
      tocarSom('erro');
      piscarTela('erro');
      
      resultDiv.classList.add("invalid");
      resultDiv.innerHTML = `
        <h4><i class="bi bi-exclamation-triangle-fill me-2"></i>Voucher Não Encontrado!</h4>
        <p class="mb-1">Este código não existe em nossa base.</p>
        <p class="mb-0"><strong>Código:</strong> ${codigo}</p>
      `;
    }
  } catch (error) {
    tocarSom('erro');
    piscarTela('erro');
    
    console.error("Erro na validação:", error);
    resultDiv.className = "result-box invalid";
    resultDiv.innerHTML = `
      <h4><i class="bi bi-wifi-off me-2"></i>Erro de Conexão</h4>
      <p class="mb-1">Não foi possível se conectar com o servidor.</p>
      <p class="mb-0">Verifique sua conexão e tente novamente.</p>
    `;
  }
}

// Permite que o Enter submeta o formulário mesmo sem botão pressionado
document
  .getElementById("codigoBarra")
  .addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      document
        .getElementById("form-leitor-barra")
        .dispatchEvent(new Event("submit"));
    }
  });