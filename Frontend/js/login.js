document.addEventListener("DOMContentLoaded", async () => {
  const btnMicrosoft = document.getElementById("btn-microsoft");
  const feedback = document.getElementById("login-feedback");

  if (btnMicrosoft) {
    btnMicrosoft.addEventListener("click", () => {
      btnMicrosoft.classList.add("disabled");
      btnMicrosoft.innerHTML = '<i class="bi bi-arrow-repeat spinner me-2"></i>Conectando ao sistema seguro...';
      feedback.className = "mt-3 text-center text-primary";
      feedback.innerHTML = "Aguarde, validando credenciais no Entra ID...";
    });
  }
});