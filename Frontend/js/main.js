// server.js - Sistema Completo de Gerenciamento de Vouchers FIEP
const API_URL = "";

class VoucherSystem {
  constructor() {
    this.eventos = JSON.parse(localStorage.getItem("eventos")) || [];
    this.vouchers = JSON.parse(localStorage.getItem("vouchers")) || [];
    this.filtroAtual = "todos"; 

    this.devolucao = {
      eventosDisponiveis: [],
      elementos: {},
    };

    // Necessário para chamadas via HTML onclick
    window.voucherSystem = this;

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.carregarEventosNosSelects();
    this.carregarRelatorios();
    this.carregarControleEmissoes(); 
    this.carregarConfiguracoesPrecos(); // <-- Adicionado para carregar a nova tela de preços
    
    if (typeof this.fetchUserInfo === "function") {
      this.fetchUserInfo();
    }
    
    this.mostrarSecao("inicio"); 

    setTimeout(() => {
      this.inicializarSistemaDevolucao();
    }, 100);
  }

  // =========================================================
  // GESTÃO DE PREÇOS E CONFIGURAÇÕES DINÂMICAS
  // =========================================================
  async carregarConfiguracoesPrecos() {
    const tbodyPrecos = document.getElementById("tabela-precos-body");
    const tbodyLogs = document.getElementById("tabela-logs-precos");
    if (!tbodyPrecos) return;

    try {
      const response = await fetch(`${API_URL}/api/configuracoes/precos`);
      if (response.ok) {
        const dados = await response.json();
        const precos = dados.precos || [];
        const logs = dados.logs || [];

        if (precos.length === 0) {
          tbodyPrecos.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Nenhuma configuração de preço encontrada.</td></tr>';
        } else {
          tbodyPrecos.innerHTML = precos.map(p => `
            <tr>
              <td class="fw-bold text-uppercase">${p.grupo}</td>
              <td><span class="badge bg-light text-dark">${p.tipo_bebida === 'com_bebida' ? 'Com Bebida' : 'Sem Bebida'}</span></td>
              <td class="fw-bold text-success">R$ ${parseFloat(p.valor).toFixed(2).replace('.', ',')}</td>
              <td>${p.atualizado_por || 'Sistema'}</td>
              <td>${p.data_atualizacion || '-'}</td>
              <td class="text-center">
                <button class="btn btn-sm btn-outline-info" onclick="window.voucherSystem.editarPreco(${p.id}, '${p.grupo}', '${p.tipo_bebida}', ${p.valor})">
                  <i class="bi bi-pencil-square"></i> Editar
                </button>
              </td>
            </tr>
          `).join('');
        }

        if (logs.length === 0) {
          if (tbodyLogs) tbodyLogs.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Nenhum histórico de alteração de preço registrado.</td></tr>';
        } else {
          if (tbodyLogs) {
            tbodyLogs.innerHTML = logs.map(l => `
              <tr>
                <td>${l.data}</td>
                <td>${l.responsavel}</td>
                <td class="text-uppercase">${l.grupo}</td>
                <td>${l.tipo_bebida}</td>
                <td class="text-muted">R$ ${parseFloat(l.valor_antigo).toFixed(2).replace('.', ',')}</td>
                <td class="fw-bold text-success">R$ ${parseFloat(l.valor_novo).toFixed(2).replace('.', ',')}</td>
              </tr>
            `).join('');
          }
        }
      }
    } catch (error) {
      if (tbodyPrecos) tbodyPrecos.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar preços.</td></tr>';
    }
  }

  async editarPreco(id, grupo, bebida, valorAtual) {
    const novoValorStr = prompt(`Atualizar valor para o grupo [${grupo.toUpperCase()} - ${bebida}]:`, valorAtual);
    if (novoValorStr === null) return;

    const novoValor = parseFloat(novoValorStr.replace(',', '.'));
    if (isNaN(novoValor) || novoValor < 0) {
      alert("Por favor, insira um valor numérico válido.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/configuracoes/precos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, valor: novoValor, responsavel: "Admin" })
      });

      const resultado = await response.json();
      if (response.ok) {
        this.mostrarMensagem(resultado.sucesso || "Preço atualizado com sucesso!", "success");
        this.carregarConfiguracoesPrecos();
        this.carregarRelatorios();
      } else {
        throw new Error(resultado.erro || "Erro ao atualizar preço");
      }
    } catch (error) {
      this.mostrarMensagem(error.message, "error");
    }
  }

  async carregarControleEmissoes() {
    const tbody = document.getElementById("tabela-controle-body");
    if (!tbody) return;

    try {
      const response = await fetch(`${API_URL}/api/controle-emissoes`);
      if (response.ok) {
        const dados = await response.json();
        
        if (dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Nenhum evento ativo encontrado.</td></tr>';
            return;
        }

        tbody.innerHTML = dados.map(ev => {
            const pendentes = ev.capacidade - ev.gerados;
            const percentual = ev.capacidade > 0 ? Math.round((ev.gerados / ev.capacidade) * 100) : 0;
            
            let corBarra = "bg-success";
            let statusTexto = `<span class="badge bg-success">Disponível</span>`;
            
            if (percentual >= 100) {
                corBarra = "bg-danger";
                statusTexto = `<span class="badge bg-danger">Esgotado</span>`;
            } else if (percentual >= 80) {
                corBarra = "bg-warning";
                statusTexto = `<span class="badge bg-warning text-dark">Quase Esgotado</span>`;
            }

            return `
            <tr>
                <td class="fw-bold">${ev.evento}</td>
                <td>${ev.data}</td>
                <td class="text-center">${ev.capacidade}</td>
                <td class="text-center"><span class="text-info fw-bold">${ev.gerados}</span></td>
                <td class="text-center"><span class="text-warning fw-bold">${pendentes > 0 ? pendentes : 0}</span></td>
                <td>
                    <div class="d-flex align-items-center justify-content-between mb-1">
                        <small>${statusTexto}</small>
                        <small class="fw-bold">${percentual}%</small>
                    </div>
                    <div class="progress" style="height: 6px; background-color: #333;">
                        <div class="progress-bar ${corBarra}" role="progressbar" style="width: ${percentual}%"></div>
                    </div>
                </td>
            </tr>`;
        }).join('');
      }
    } catch (error) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar dados de controle.</td></tr>';
    }
  }

  // =========================================================
  // RELATÓRIO DE ENTRADAS (CHECK-IN)
  // =========================================================
  async carregarRelatorioEntradas() {
    const eventoId = document.getElementById("eventoEntradasSelect") ? document.getElementById("eventoEntradasSelect").value : null;
    const filtroStatus = document.getElementById("filtroStatusEntradas") ? document.getElementById("filtroStatusEntradas").value : "todos";
    const ordem = document.getElementById("ordemEntradas") ? document.getElementById("ordemEntradas").value : "recentes";
    const tbody = document.getElementById("tabela-entradas-body");
    
    if (!eventoId) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Selecione um evento para carregar o histórico de entradas.</td></tr>';
        return;
    }
    
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center"><div class="spinner-border text-info" role="status"></div><br>Carregando dados...</td></tr>';
    
    try {
        const response = await fetch(`${API_URL}/api/relatorio-entradas/${eventoId}`);
        if (!response.ok) throw new Error("Erro ao buscar dados do histórico");
        
        const data = await response.json();
        let entradas = data.entradas || [];
        
        if (entradas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted"><i class="bi bi-inbox me-2"></i>Nenhum voucher encontrado para este evento.</td></tr>';
            return;
        }

        if (filtroStatus === "expirado") {
             entradas = entradas.filter(e => e.status === 'expirado' || e.status === 'devolvido');
        } else if (filtroStatus !== "todos") {
             entradas = entradas.filter(e => e.status === filtroStatus);
        }

        if (ordem === "codigo") {
            entradas.sort((a, b) => a.codigo.localeCompare(b.codigo));
        } else {
            entradas.sort((a, b) => {
                if (a.status === 'usado' && b.status !== 'usado') return -1;
                if (b.status === 'usado' && a.status !== 'usado') return 1;
                return 0;
            });
        }
        
        if (entradas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Nenhum voucher corresponde ao filtro selecionado.</td></tr>';
            return;
        }
        
        tbody.innerHTML = entradas.map(ent => {
            let statusBadge = '';
            if (ent.status === 'usado') statusBadge = '<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i> Validado</span>';
            else if (ent.status === 'ativo') statusBadge = '<span class="badge bg-secondary">Aguardando Uso</span>';
            else if (ent.status === 'expirado') statusBadge = '<span class="badge bg-danger">Expirado</span>';
            else if (ent.status === 'devolvido') statusBadge = '<span class="badge bg-warning text-dark">Devolvido</span>';
            else statusBadge = `<span class="badge bg-dark">${ent.status}</span>`;
                
            return `
            <tr>
                <td class="fw-bold">${ent.codigo}</td>
                <td><span class="badge bg-light text-dark">${ent.tipo_acesso}</span></td>
                <td><span class="badge bg-light text-dark">${ent.tipo_bebida}</span></td>
                <td>${statusBadge}</td>
                <td>${ent.data_uso}</td>
                <td class="fw-bold ${ent.hora_uso !== 'N/A' ? 'text-info' : 'text-muted'}">
                    <i class="bi bi-clock me-1"></i> ${ent.hora_uso}
                </td>
            </tr>
            `;
        }).join('');
        
    } catch (error) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar o relatório de entradas.</td></tr>';
        this.mostrarMensagem(error.message, "error");
    }
  }

  // =========================================================
  // RELATÓRIO DIÁRIO (POR DATA)
  // =========================================================
  async carregarRelatorioDiario() {
    const inputData = document.getElementById("dataFiltroDiario");
    if (!inputData || !inputData.value) return;

    const dataEscolhida = inputData.value;
    const tbody = document.getElementById("tabela-diario-body");
    const containerResumo = document.getElementById("resumo-diario-cards");
    
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center"><div class="spinner-border text-info" role="status"></div><br>Buscando validações do dia...</td></tr>';
    if (containerResumo) containerResumo.innerHTML = '';

    try {
        const response = await fetch(`${API_URL}/api/relatorio-diario?data=${dataEscolhida}`);
        if (!response.ok) throw new Error("Erro ao buscar dados diários");
        
        const registros = await response.json();
        
        if (!registros || registros.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-light"><i class="bi bi-inbox me-2"></i>Nenhum voucher foi utilizado neste dia.</td></tr>';
            return;
        }

        const contagemPorEvento = {};
        registros.forEach(r => {
            contagemPorEvento[r.evento] = (contagemPorEvento[r.evento] || 0) + 1;
        });

        const dataFormatada = dataEscolhida.split('-').reverse().join('/');
        let htmlResumo = `
            <div class="col-12 mb-2">
                <h5 class="text-white border-bottom border-secondary pb-2">Total Utilizado em ${dataFormatada}: <strong class="text-info">${registros.length} vouchers</strong></h5>
            </div>
        `;
        
        for (const [nomeEvento, qtd] of Object.entries(contagemPorEvento)) {
            htmlResumo += `
            <div class="col-md-3 mb-3">
                <div class="card bg-dark border-secondary" style="border-left: 4px solid #0dcaf0 !important;">
                    <div class="card-body py-2 px-3">
                        <div class="text-light" style="font-size: 0.75rem; text-transform: uppercase;">Evento</div>
                        <div class="fw-bold text-white text-truncate" title="${nomeEvento}">${nomeEvento}</div>
                        <div class="fs-4 fw-bold text-info">${qtd} <span class="fs-6 text-light fw-normal">validados</span></div>
                    </div>
                </div>
            </div>`;
        }
        containerResumo.innerHTML = htmlResumo;
        
        tbody.innerHTML = registros.map(r => `
        <tr>
            <td class="fw-bold text-info"><i class="bi bi-clock me-1"></i> ${r.hora_uso}</td>
            <td class="fw-bold">${r.codigo}</td>
            <td>${r.evento}</td>
            <td><span class="badge bg-light text-dark">${r.tipo_acesso}</span></td>
            <td><span class="badge bg-light text-dark">${r.tipo_bebida}</span></td>
            <td class="text-light"><i class="bi bi-person-fill"></i> ${r.criado_por}</td>
        </tr>
        `).join('');
        
    } catch (error) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar o relatório diário.</td></tr>';
        this.mostrarMensagem(error.message, "error");
    }
  }

  // =========================================================
  // GESTÃO DE USUÁRIOS
  // =========================================================
  async carregarUsuarios() {
    const tbody = document.getElementById("tabela-usuarios-body");
    if (!tbody) return;
    
    try {
        const response = await fetch(`${API_URL}/api/usuarios`);
        if (response.ok) {
            const usuarios = await response.json();
            if (usuarios.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Nenhum usuário encontrado.</td></tr>';
                return;
            }
            
            tbody.innerHTML = usuarios.map(usr => {
                let badgeClass = "bg-secondary";
                if (usr.nivel_acesso === "master") badgeClass = "bg-danger";
                if (usr.nivel_acesso === "admin") badgeClass = "bg-warning text-dark";
                if (usr.nivel_acesso === "operacional") badgeClass = "bg-info text-dark";
                
                return `
                <tr>
                    <td class="fw-bold">${usr.nome}</td>
                    <td>${usr.email}</td>
                    <td><span class="badge ${badgeClass}">${usr.nivel_acesso.toUpperCase()}</span></td>
                    <td>${usr.criado_em}</td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-outline-danger" onclick="window.deletarUsuarioGlobal(${usr.id}, '${usr.nome}')" title="Remover Usuário">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>`;
            }).join('');
        }
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Erro ao carregar lista de usuários.</td></tr>';
    }
  }

  async cadastrarUsuario() {
    const nome = document.getElementById("nomeUsuario").value.trim();
    const email = document.getElementById("emailUsuario").value.trim();
    const nivel = document.getElementById("nivelUsuario").value;
    
    try {
        const response = await fetch(`${API_URL}/api/usuarios`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nome, email, nivel_acesso: nivel })
        });
        
        const resultado = await response.json();
        
        if (response.ok) {
            this.mostrarMensagem(resultado.sucesso, "success");
            document.getElementById("form-usuario").reset();
            this.carregarUsuarios();
        } else {
            throw new Error(resultado.erro);
        }
    } catch (error) {
        this.mostrarMensagem(error.message, "error");
    }
  }

  // =========================================================
  // SISTEMA DE DEVOLUÇÃO
  // =========================================================
  inicializarSistemaDevolucao() {
    this.carregarElementosDevolucao();
    this.carregarEventosParaDevolucao();
    this.configurarEventosDevolucao();
    this.carregarHistoricoDevolucao();
  }

  carregarElementosDevolucao() {
    this.devolucao.elementos = {
      selectEvento: document.getElementById("eventoDevolucaoSelect"),
      inputQuantidade: document.getElementById("quantidadeDevolucao"),
      inputData: document.getElementById("dataDevolucao"),
      inputResponsavel: document.getElementById("responsavelDevolucao"),
      inputObservacoes: document.getElementById("observacaoDevolucao"),
      btnConfirmar: document.getElementById("btn-confirmar-devolucao"),
      containerResumo: document.getElementById("resumo-devolucao"),
      containerHistorico: document.getElementById("historico-devolucoes"),
      spanMaxVouchers: document.getElementById("max-devolucao"),
      formDevolucao: document.getElementById("form-devolucao"),
    }; 

    if (this.devolucao.elementos.inputData) {
      const hoje = new Date().toISOString().split("T")[0];
      this.devolucao.elementos.inputData.value = hoje;
    }
  }

  async carregarEventosParaDevolucao() {
    try {
      const response = await fetch(`${API_URL}/relatorios`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const eventos = await response.json();
      this.devolucao.eventosDisponiveis = [];

      eventos.forEach((evento) => {
        // Agora precisamos apenas da quantidade de vouchers ativos para definir o limite
        const ativos = parseInt(evento.ativos) || 0;

        // Se houver vouchers ativos, a devolução é permitida
        if (ativos > 0) {
          this.devolucao.eventosDisponiveis.push({
            id: evento.id,
            evento: evento.nome,
            data: evento.data_evento,
            disponiveis: ativos,
            // A devolução máxima passa a ser o total de ativos disponíveis
            devolucao_maxima: ativos, 
          });
        }
      });
      
      this.preencherSelectDevolucao();

    } catch (error) {
      this.mostrarMensagem("Erro ao carregar eventos para devolução.", "warning");
    }
  }

  preencherSelectDevolucao() {
    const { selectEvento } = this.devolucao.elementos;
    if (!selectEvento) return;

    selectEvento.innerHTML = '<option value="">-- Selecione um evento --</option>';

    this.devolucao.eventosDisponiveis.forEach((evento) => {
      const option = document.createElement("option");
      option.value = evento.id;
      option.textContent = `${evento.evento} (${evento.data}) - ${evento.disponiveis} disponíveis`;
      option.setAttribute("data-max", evento.devolucao_maxima);
      option.setAttribute("data-disponiveis", evento.disponiveis);
      selectEvento.appendChild(option);
    });

    this.atualizarQuantidadeMaximaDevolucao();
  }

  configurarEventosDevolucao() {
    const {
      selectEvento,
      inputQuantidade,
      inputData,
      inputResponsavel,
      inputObservacoes,
      btnConfirmar,
    } = this.devolucao.elementos;

    if (selectEvento) {
      selectEvento.addEventListener("change", () => {
        this.atualizarQuantidadeMaximaDevolucao();
        this.atualizarResumoDevolucao();
      });
    }

    if (inputQuantidade) {
      inputQuantidade.addEventListener("input", () => {
        this.validarQuantidadeDevolucao();
        this.atualizarResumoDevolucao();
      });
    }

    const campos = [inputData, inputResponsavel, inputObservacoes];
    campos.forEach((campo) => {
      if (campo) {
        campo.addEventListener("input", () => this.atualizarResumoDevolucao());
      }
    });

    if (btnConfirmar) {
      btnConfirmar.addEventListener("click", (e) => {
        e.preventDefault();
        this.confirmarDevolucao();
      });
    }
  }

  atualizarQuantidadeMaximaDevolucao() {
    const { selectEvento, inputQuantidade, spanMaxVouchers } = this.devolucao.elementos;
    if (!selectEvento || !inputQuantidade) return;

    const selectedOption = selectEvento.options[selectEvento.selectedIndex];

    if (selectedOption && selectedOption.value) {
      const maxDevolucao = parseInt(selectedOption.getAttribute("data-max")) || 0;
      const disponiveis = parseInt(selectedOption.getAttribute("data-disponiveis")) || 0;

      inputQuantidade.max = Math.min(maxDevolucao, disponiveis);
      inputQuantidade.placeholder = `Máx: ${inputQuantidade.max} vouchers`;
      inputQuantidade.disabled = false;

      if (spanMaxVouchers) spanMaxVouchers.textContent = inputQuantidade.max;
    } else {
      inputQuantidade.max = 0;
      inputQuantidade.placeholder = "Selecione um evento primeiro";
      inputQuantidade.disabled = true;
      if (spanMaxVouchers) spanMaxVouchers.textContent = "0";
    }
  }

  validarQuantidadeDevolucao() {
    const { inputQuantidade } = this.devolucao.elementos;
    if (!inputQuantidade) return;

    const quantidade = parseInt(inputQuantidade.value) || 0;
    const maxPermitido = parseInt(inputQuantidade.max) || 0;

    if (quantidade > maxPermitido) {
      inputQuantidade.value = maxPermitido;
      this.mostrarMensagem(`Quantidade ajustada para o máximo permitido: ${maxPermitido}`, "warning");
    }
    if (quantidade < 0) {
      inputQuantidade.value = 0;
    }
  }

  atualizarResumoDevolucao() {
    const { selectEvento, inputQuantidade, inputData, inputResponsavel, inputObservacoes, containerResumo, btnConfirmar } = this.devolucao.elementos;
    if (!containerResumo) return;

    const eventoId = selectEvento ? selectEvento.value : "";
    const quantidade = inputQuantidade ? parseInt(inputQuantidade.value) || 0 : 0;
    const data = inputData ? inputData.value : "";
    const responsavel = inputResponsavel ? inputResponsavel.value.trim() : "";
    const observacoes = inputObservacoes ? inputObservacoes.value.trim() : "";

    const eventoSelecionado = this.devolucao.eventosDisponiveis.find((e) => e.id == eventoId);
    const todosCamposPreenchidos = eventoId && quantidade > 0 && data && responsavel;

    if (todosCamposPreenchidos) {
      containerResumo.style.display = "block";
      containerResumo.innerHTML = `
        <div class="card-header bg-success text-white"><i class="bi bi-check-circle"></i> Resumo da Devolução</div>
        <div class="card-body">
          <div class="row">
            <div class="col-md-6"><strong>Evento:</strong> <span id="resumo-evento">${eventoSelecionado ? eventoSelecionado.evento : "N/A"}</span></div>
            <div class="col-md-6"><strong>Quantidade:</strong> <span id="resumo-quantidade">${quantidade}</span> vouchers</div>
            <div class="col-md-6"><strong>Data:</strong> <span id="resumo-data">${this.formatarDataDevolucao(data)}</span></div>
            <div class="col-md-6"><strong>Responsável:</strong> <span id="resumo-responsavel">${responsavel}</span></div>
            <div class="col-md-12 mt-2"><strong>Observações:</strong> <span id="resumo-observacoes">${observacoes || "-"}</span></div>
          </div>
        </div>`;

      if (btnConfirmar) {
        btnConfirmar.disabled = false;
        btnConfirmar.classList.remove("btn-secondary");
        btnConfirmar.classList.add("btn-primary");
      }
    } else {
      containerResumo.style.display = "none";
      if (btnConfirmar) {
        btnConfirmar.disabled = true;
        btnConfirmar.classList.remove("btn-primary");
        btnConfirmar.classList.add("btn-secondary");
      }
    }
  }

  async confirmarDevolucao() {
    const { selectEvento, inputQuantidade, inputData, inputResponsavel, inputObservacoes, btnConfirmar } = this.devolucao.elementos;

    try {
      const eventoId = selectEvento.value;
      const quantidade = parseInt(inputQuantidade.value) || 0;
      const dataDevolucao = inputData.value;
      const responsavel = inputResponsavel.value.trim();
      const observacoes = inputObservacoes.value.trim();

      if (!eventoId || !quantidade || !dataDevolucao || !responsavel) {
        this.mostrarMensagem("Preencha todos os campos obrigatórios", "error");
        return;
      }

      const eventoSelecionado = this.devolucao.eventosDisponiveis.find((e) => e.id == eventoId);
      const maxPermitido = eventoSelecionado ? eventoSelecionado.devolucao_maxima : 0;

      if (quantidade > maxPermitido) {
        this.mostrarMensagem(`Quantidade excede o máximo permitido de ${maxPermitido} vouchers`, "error");
        return;
      } 

      const confirmacao = confirm(
        `🎫 CONFIRMAR DEVOLUÇÃO\n\n` +
        `Evento: ${eventoSelecionado.evento}\nQuantidade: ${quantidade} vouchers\n` +
        `Data: ${this.formatarDataDevolucao(dataDevolucao)}\nResponsável: ${responsavel}\n\nDeseja confirmar?`
      );

      if (!confirmacao) return; 

      btnConfirmar.disabled = true;
      btnConfirmar.innerHTML = '<i class="bi bi-hourglass-split"></i> Processando...';

      const dadosDevolucao = {
        evento_id: parseInt(eventoId),
        quantidade: quantidade,
        data_devolucao: dataDevolucao,
        responsavel: responsavel,
        observacoes: observacoes,
      };

      const response = await fetch(`${API_URL}/api/devolucoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dadosDevolucao),
      });

      const resultado = await response.json();

      if (response.ok && resultado.success) {
        this.mostrarMensagem(resultado.message, "success");
        this.limparFormularioDevolucao();
        await this.carregarEventosParaDevolucao();
        await this.carregarHistoricoDevolucao(); 
        this.carregarRelatorios();
      } else {
        throw new Error(resultado.erro || "Erro ao registrar devolução");
      }
    } catch (error) {
      this.mostrarMensagem(error.message, "error");
    } finally {
      if (btnConfirmar) {
        btnConfirmar.disabled = false;
        btnConfirmar.innerHTML = '<i class="bi bi-check-lg"></i> Confirmar Devolução';
      }
    }
  }

  async carregarHistoricoDevolucao() {
    try {
      const { containerHistorico } = this.devolucao.elementos;
      if (!containerHistorico) return;

      const response = await fetch(`${API_URL}/api/devolucoes`);
      if (!response.ok) throw new Error("Erro ao carregar histórico");

      const devolucoes = await response.json();
      this.atualizarTabelaHistoricoDevolucao(devolucoes);
    } catch (error) {
      this.atualizarTabelaHistoricoDevolucao([]);
    }
  }

  atualizarTabelaHistoricoDevolucao(devolucoes) {
    const { containerHistorico } = this.devolucao.elementos;
    if (!containerHistorico) return;

    if (!devolucoes || devolucoes.length === 0) {
      containerHistorico.innerHTML = `<tr><td colspan="5" class="text-center text-light"><i class="bi bi-inbox"></i> Nenhuma devolução registrada</td></tr>`;
      return;
    }

    const tabelaHTML = devolucoes.map((devolucao) => `
          <tr>
            <td>${devolucao.data_devolucao_formatada || this.formatarDataDevolucao(devolucao.data_devolucao)}</td>
            <td>${devolucao.evento_nome || "N/A"}</td>
            <td><span class="badge bg-primary">${devolucao.quantidade}</span></td>
            <td>${devolucao.responsavel}</td>
            <td><span class="badge bg-success">Concluída</span></td>
          </tr>
        `).join("");

    containerHistorico.innerHTML = tabelaHTML;
  }

  limparFormularioDevolucao() {
    const { selectEvento, inputQuantidade, inputResponsavel, inputObservacoes, inputData, containerResumo } = this.devolucao.elementos;

    if (selectEvento) selectEvento.value = "";
    if (inputQuantidade) { inputQuantidade.value = ""; inputQuantidade.disabled = true; }
    if (inputResponsavel) inputResponsavel.value = "";
    if (inputObservacoes) inputObservacoes.value = "";
    if (inputData) {
      const hoje = new Date().toISOString().split("T")[0];
      inputData.value = hoje;
    }
    if (containerResumo) containerResumo.style.display = "none";

    this.atualizarResumoDevolucao();
    this.atualizarQuantidadeMaximaDevolucao();
  }

  formatarDataDevolucao(dataString) {
    try { return new Date(dataString).toLocaleDateString("pt-BR"); } catch (error) { return dataString; }
  }

  // =========================================================
  // CANCELAMENTO DE VOUCHERS (FILTRO REVERSO + UUID STRINGS)
  // =========================================================
  async carregarVouchersParaCancelamento(eventoId) {
    const areaTabela = document.getElementById("area-tabela-cancelamento");
    const tbody = document.getElementById("tabela-cancelamento-body");
    
    if (!eventoId) { areaTabela.style.display = "none"; return; }
    
    areaTabela.style.display = "block";
    tbody.innerHTML = '<tr><td colspan="4" class="text-center"><div class="spinner-border text-warning spinner-border-sm"></div> Buscando...</td></tr>';
    this.atualizarContadorCancelamento();

    try {
        const response = await fetch(`${API_URL}/vouchers/${eventoId}`);
        if (response.ok) {
            const result = await response.json();
            
            let listaVouchers = [];
            if (Array.isArray(result)) {
                listaVouchers = result;
            } else if (result && (result.vouchers || result.data)) {
                listaVouchers = result.vouchers || result.data;
            } else if (result && typeof result === 'object') {
                const arrayKey = Object.keys(result).find(k => Array.isArray(result[k]));
                if (arrayKey) listaVouchers = result[arrayKey];
            }
            
            const vouchersAtivos = listaVouchers.filter(v => {
                if (!v.status) return true; 
                const statusVoucher = String(v.status).toLowerCase().trim();
                return statusVoucher !== 'usado' && 
                       statusVoucher !== 'cancelado' && 
                       statusVoucher !== 'devolvido' && 
                       statusVoucher !== 'expirado' &&
                       statusVoucher !== 'aguardando_cancelamento';
            });
            
            if (vouchersAtivos.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Nenhum voucher disponível encontrado (Todos já foram usados, devolvidos, cancelados ou já estão aguardando aprovação).</td></tr>';
                return;
            }
            
            vouchersAtivos.sort((a, b) => {
                const numA = parseInt(String(a.codigo || "").split('_').pop(), 10) || 0;
                const numB = parseInt(String(b.codigo || "").split('_').pop(), 10) || 0;
                return numA - numB;
            });

            tbody.innerHTML = vouchersAtivos.map(v => `
                <tr style="cursor: pointer;" onclick="const chk = document.getElementById('chk-${v.id}'); chk.checked = !chk.checked; window.voucherSystem.atualizarContadorCancelamento();">
                    <td class="text-center" onclick="event.stopPropagation();">
                        <input class="form-check-input check-cancelamento" type="checkbox" id="chk-${v.id}" value="${v.id}" onchange="window.voucherSystem.atualizarContadorCancelamento()" style="transform: scale(1.3);">
                    </td>
                    <td class="fw-bold">${v.codigo || 'Sem Código'}</td>
                    <td><span class="badge bg-light text-dark">${v.tipo_acesso || 'N/A'}</span></td>
                    <td><span class="badge bg-light text-dark">${v.tipo_bebida || 'N/A'}</span></td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Erro do servidor: ${response.statusText}</td></tr>`;
        }
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Erro ao carregar vouchers: ${error.message}</td></tr>`;
    }
  }

  atualizarContadorCancelamento() {
    const count = document.querySelectorAll(".check-cancelamento:checked").length;
    const spanCount = document.getElementById("count-cancelamento");
    const btnConfirmar = document.getElementById("btn-confirmar-cancelamento");
    
    if (spanCount) spanCount.textContent = count;
    if (btnConfirmar) btnConfirmar.disabled = count === 0;
  }

  toggleSelecionarTodosCancelamento() {
    const checkboxes = document.querySelectorAll(".check-cancelamento");
    const todosMarcados = Array.from(checkboxes).every(c => c.checked);
    checkboxes.forEach(c => c.checked = !todosMarcados);
    this.atualizarContadorCancelamento();
  }

  async confirmarCancelamento() {
    const checkboxes = document.querySelectorAll(".check-cancelamento:checked");
    if (checkboxes.length === 0) return;
    
    const idsCancelamento = Array.from(checkboxes).map(c => c.value);
    
    const motivo = prompt(`⚠️ SOLICITAÇÃO DE CANCELAMENTO\n\nVocê está solicitando o cancelamento de ${idsCancelamento.length} voucher(s).\nIsso será enviado para aprovação do Admin.\n\nInforme o motivo da solicitação:`);
    if (!motivo || motivo.trim() === "") {
        this.mostrarMensagem("A justificativa é obrigatória para solicitar o cancelamento.", "error");
        return;
    }
    
    const btnConfirmar = document.getElementById("btn-confirmar-cancelamento");
    btnConfirmar.disabled = true;
    btnConfirmar.innerHTML = '<i class="spinner-border spinner-border-sm"></i> Solicitando...';
    
    try {
        const response = await fetch(`${API_URL}/api/vouchers/solicitar-cancelamento`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                ids: idsCancelamento, 
                motivo: motivo.trim(),
                usuario: "Operacional" 
            })
        });
        
        const resultado = await response.json();
        
        if (response.ok) {
            this.mostrarMensagem(resultado.sucesso || "Solicitação enviada ao Admin com sucesso!", "success");
            const eventoId = document.getElementById("eventoCancelamentoSelect").value;
            this.carregarVouchersParaCancelamento(eventoId);
            this.carregarRelatorios();
        } else {
            throw new Error(resultado.erro || "Erro ao solicitar cancelamento");
        }
    } catch (error) {
        this.mostrarMensagem(error.message, "error");
        btnConfirmar.disabled = false;
        btnConfirmar.innerHTML = '<i class="bi bi-trash3-fill"></i> CONFIRMAR CANCELAMENTO';
    }
  }

  // =========================================================
  // APROVAÇÃO DE CANCELAMENTO (PAINEL DO ADMIN)
  // =========================================================
  async carregarPendentesCancelamento() {
    const tbody = document.getElementById("tabela-pendentes-cancelamento-body");
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="text-center"><div class="spinner-border spinner-border-sm text-danger"></div> Carregando solicitações...</td></tr>';
    this.atualizarContadorPendentes();

    try {
        const response = await fetch(`${API_URL}/api/vouchers/pendentes-cancelamento`);
        if (response.ok) {
            const lista = await response.json();
            
            if (!lista || lista.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-light">Nenhuma solicitação de cancelamento pendente.</td></tr>';
                return;
            }

            tbody.innerHTML = lista.map(item => `
                <tr style="cursor: pointer;" onclick="const chk = document.getElementById('chk-p-${item.id}'); chk.checked = !chk.checked; window.voucherSystem.atualizarContadorPendentes();">
                    <td class="text-center" onclick="event.stopPropagation();">
                        <input class="form-check-input check-pendente" type="checkbox" id="chk-p-${item.id}" value="${item.id}" onchange="window.voucherSystem.atualizarContadorPendentes()" style="transform: scale(1.2);">
                    </td>
                    <td class="fw-bold text-warning">${item.codigo}</td>
                    <td>${item.evento_nome}</td>
                    <td>${item.solicitado_por || 'Operacional'}</td>
                    <td><span class="badge bg-secondary">${item.motivo || 'Sem motivo'}</span></td>
                    <td><small>${item.data}</small></td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar solicitações do servidor.</td></tr>';
        }
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Erro de conexão: ${error.message}</td></tr>`;
    }
  }

  atualizarContadorPendentes() {
    const checkboxes = document.querySelectorAll(".check-pendente:checked");
    const count = checkboxes.length;
    const span = document.getElementById("count-pendentes");
    const btn = document.getElementById("btn-aprovar-cancelamento-lote");

    if (span) span.textContent = count;
    if (btn) btn.disabled = count === 0;
  }

  toggleSelecionarTodosPendentes(masterCheckbox) {
    const checkboxes = document.querySelectorAll(".check-pendente");
    checkboxes.forEach(c => c.checked = masterCheckbox.checked);
    this.atualizarContadorPendentes();
  }

  async aprovarCancelamentoSelecionados() {
    const checkboxes = document.querySelectorAll(".check-pendente:checked");
    if (checkboxes.length === 0) return;

    const ids = Array.from(checkboxes).map(c => c.value);

    if (!confirm(`Confirma a aprovação e o cancelamento DEFINITIVO de ${ids.length} voucher(s)?`)) return;

    const btn = document.getElementById("btn-aprovar-cancelamento-lote");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Processando...';

    try {
        const response = await fetch(`${API_URL}/api/vouchers/aprovar-cancelamento`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: ids })
        });

        const resultado = await response.json();

        if (response.ok) {
            this.mostrarMensagem(resultado.sucesso || "Vouchers cancelados com sucesso!", "success");
            this.carregarPendentesCancelamento();
            this.carregarRelatorios();
        } else {
            throw new Error(resultado.erro || "Erro ao aprovar cancelamentos");
        }
    } catch (error) {
        this.mostrarMensagem(error.message, "error");
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> APROVAR CANCELAMENTO DEFINITIVO';
    }
  }

  // =========================================================
  // SETUP E EVENTOS BASE
  // =========================================================
  setupEventListeners() {
    this.carregarHistoricoExclusoes();
    
    document.querySelectorAll(".menu-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (!item.getAttribute("target")) {
          e.preventDefault();
          const targetId = item.getAttribute("href").substring(1);
          this.mostrarSecao(targetId);

          document.querySelectorAll(".menu-item").forEach((link) => link.classList.remove("active"));
          item.classList.add("active");
        }
      });
    });

    document.getElementById("form-evento")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.cadastrarEvento();
    });

    document.getElementById("form-vouchers")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.gerarVouchers();
    });

    document.getElementById("form-acessar-vouchers")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.acessarVouchers();
    });

    document.getElementById("form-excluir")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.excluirEvento();
    });
    
    document.getElementById("form-usuario")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.cadastrarUsuario();
    });

    // CANCELAMENTO LISTENERS
    document.getElementById("eventoCancelamentoSelect")?.addEventListener("change", (e) => {
      this.carregarVouchersParaCancelamento(e.target.value);
    });
    document.getElementById("btn-selecionar-todos-cancelamento")?.addEventListener("click", () => {
      this.toggleSelecionarTodosCancelamento();
    });
    document.getElementById("btn-confirmar-cancelamento")?.addEventListener("click", () => {
      this.confirmarCancelamento();
    });

    setTimeout(() => {
      this.setupFiltrosListeners();
      this.setupBotaoAtualizar();
      this.setupBotaoExportar();
    }, 100);
  }

  setupFiltrosListeners() {
    document.querySelectorAll("[data-filtro]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const filtro = btn.getAttribute("data-filtro");
        this.aplicarFiltro(filtro);
      });
    });

    const filtrosIds = ["filtro-todos", "filtro-ativos", "filtro-concluidos", "filtro-este-mes", "filtro-alta-performance"];
    filtrosIds.forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const filtro = id.replace("filtro-", "");
          this.aplicarFiltro(filtro);
        });
      }
    });
  }

  setupBotaoAtualizar() {
    const btnAtualizar = document.querySelector(".btn-atualizar");
    if (btnAtualizar) {
      btnAtualizar.addEventListener("click", (e) => {
        e.preventDefault();
        this.carregarRelatorios();
        this.mostrarMensagem("Dados atualizados com sucesso!", "success");
      });
    }
  }

  setupBotaoExportar() {
    const btnExportar = document.querySelector(".btn-dashboard");
    if (btnExportar) {
      btnExportar.addEventListener("click", async (e) => {
        e.preventDefault();
        await this.exportarDados();
      });
    }
  }

  aplicarFiltro(filtro) {
    this.filtroAtual = filtro; 
    document.querySelectorAll(".filter-btn").forEach((btn) => btn.classList.remove("active"));
    const btnAtivo = document.querySelector(`[data-filtro="${filtro}"]`) || document.getElementById(`filtro-${filtro}`);
    if (btnAtivo) btnAtivo.classList.add("active");
    this.carregarRelatorios();
  }

  mostrarMensagem(mensagem, tipo = "info") {
    let container = document.getElementById("fiep-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "fiep-toast-container";
      document.body.appendChild(container);
    }

    const isError = tipo === "error" || tipo === "danger" || tipo === "warning";
    const iconClass = isError ? "bi-exclamation-octagon-fill" : "bi-check-circle-fill";
    const toastClass = isError ? "toast-error" : "toast-success";

    const toast = document.createElement("div");
    toast.className = `fiep-toast ${toastClass}`;
    toast.innerHTML = `<i class="bi ${iconClass}"></i><div class="toast-message">${mensagem}</div>`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = "toastFadeOut 0.4s ease forwards";
      setTimeout(() => { if (toast.parentNode) toast.remove(); }, 400);
    }, 3500);
  }

  fetchUserInfo() {
    const nomeCompleto = "Klaiver Macedo"; 
    const primeiroNome = nomeCompleto.split(' ')[0]; 
    
    const userMenuName = document.getElementById("user-menu-name");
    if (userMenuName) userMenuName.textContent = primeiroNome;

    const dropdownUserName = document.getElementById("dropdown-user-name");
    if (dropdownUserName) dropdownUserName.textContent = primeiroNome;
  }

  mostrarSecao(secaoId) {
    document.querySelectorAll(".content-section").forEach((sec) => sec.classList.remove("active"));
    const targetSection = document.getElementById(secaoId);
    if (targetSection) targetSection.classList.add("active");

    if (secaoId === "relatorios") this.carregarRelatorios();
    if (secaoId === "usuarios") this.carregarUsuarios();
    if (secaoId === "configuracoes") this.carregarConfiguracoesPrecos();
    if (secaoId === "devolucao") setTimeout(() => { this.carregarEventosParaDevolucao(); this.carregarHistoricoDevolucao(); }, 50);
    if (secaoId === "cancelamento") {
        const eventoId = document.getElementById("eventoCancelamentoSelect").value;
        if (eventoId) this.carregarVouchersParaCancelamento(eventoId);
    }
    if (secaoId === "aprovar-cancelamento") {
        this.carregarPendentesCancelamento();
    }
    if (secaoId === "entradas") {
        const eventoSelecionado = document.getElementById("eventoEntradasSelect");
        if (eventoSelecionado && eventoSelecionado.value) {
            this.carregarRelatorioEntradas();
        }
    }
    if (secaoId === "diario") {
        const inputData = document.getElementById("dataFiltroDiario");
        if (inputData && !inputData.value) {
            inputData.value = new Date().toISOString().split("T")[0];
        }
        this.carregarRelatorioDiario();
    }
  }

  async carregarEventosNosSelects() {
    const selects = ["eventoSelect", "eventoAcessarSelect", "eventoExcluirSelect", "eventoEntradasSelect", "eventoCancelamentoSelect"];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); 

      const response = await fetch(`${API_URL}/eventos`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const eventos = await response.json();
        selects.forEach((selectId) => {
          const select = document.getElementById(selectId);
          if (select) {
            select.innerHTML = '<option value="">-- Selecione um evento --</option>';
            eventos.forEach((evento) => {
              
              if (selectId === "eventoSelect" && evento.total_gerados >= evento.capacidade) {
                return; 
              }

              const option = document.createElement("option");
              option.value = evento.id;
              
              const tipoBebida = evento.tipo_bebida === "com_bebida" ? "COM BEBIDA" : "SEM BEBIDA";
              const tipoAcesso = evento.tipo_acesso === "interno" ? "INTERNO" : (evento.tipo_acesso === "externo" ? "EXTERNO" : "ÁTRIO");
              const dataFormatada = evento.data ? ` - ${evento.data}` : "";
              
              let textoExtra = "";
              if (selectId === "eventoSelect") {
                  const restante = evento.capacidade - evento.total_gerados;
                  textoExtra = ` [Resta: ${restante} vagas]`;
              }
              
              option.textContent = `${evento.nome}${dataFormatada} (${tipoBebida} - ${tipoAcesso})${textoExtra}`;
              option.setAttribute("data-tipo-bebida", evento.tipo_bebida);
              option.setAttribute("data-tipo-acesso", evento.tipo_acesso);
              select.appendChild(option);
            });
          }
        });
      }
    } catch (error) {
        selects.forEach((selectId) => {
            const select = document.getElementById(selectId);
            if (select && select.options.length <= 1) {
                select.innerHTML = '<option value="">Erro ao buscar eventos locais</option>';
            }
        });
    }
  }

  async cadastrarEvento() {
    const nome = document.getElementById("nomeEvento").value;
    const data = document.getElementById("dataEvento").value;
    const capacidade = parseInt(document.getElementById("capacidadeEvento").value);
    const tipoBebida = document.querySelector('input[name="tipoBebida"]:checked').value;
    const tipoAcesso = document.querySelector('input[name="tipoAcesso"]:checked').value;

    if (!nome || !data || !capacidade || isNaN(capacidade)) {
      alert("Por favor, preencha todos os campos, incluindo a lotação máxima!");
      return;
    }

    if (!confirm(`🎫 CONFIRMAR CADASTRO:\n\n📝 Nome: ${nome}\n📅 Data: ${new Date(data).toLocaleDateString("pt-BR")}\n👥 Lotação: ${capacidade} vouchers\nDeseja cadastrar este evento?`)) return;

    try {
      const response = await fetch(`${API_URL}/evento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, data, capacidade, tipo_bebida: tipoBebida, tipo_acesso: tipoAcesso }),
      });

      if (response.ok) {
        this.mostrarMensagem(`✅ Evento cadastrado com sucesso!`, "success");
        document.getElementById("form-evento").reset();
        this.carregarEventosNosSelects();
        this.carregarRelatorios();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.erro || "Erro ao cadastrar evento");
      }
    } catch (error) {
      this.mostrarMensagem(error.message, "error");
    }
  }

  // =========================================================
  // 🚨 FLUXO DE EXCLUSÃO DE EVENTOS
  // =========================================================
  async excluirEvento() {
    const select = document.getElementById("eventoExcluirSelect");
    const motivoInput = document.getElementById("motivoExclusao");
    const eventoId = parseInt(select.value);
    const motivo = motivoInput.value.trim();

    if (!eventoId || isNaN(eventoId)) {
      this.mostrarMensagem("Selecione um evento válido.", "error");
      return;
    }
    if (!motivo) {
      this.mostrarMensagem("A justificativa é obrigatória.", "error");
      return;
    }

    const eventoNome = select.options[select.selectedIndex].text;
    if (!confirm(`🚨 SOLICITAR EXCLUSÃO 🚨\n\nVocê está pedindo para excluir:\n${eventoNome}\n\nMotivo: ${motivo}\n\nDeseja enviar para aprovação?`)) return;

    try {
      const response = await fetch(`${API_URL}/eventos/solicitar-exclusao/${eventoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo, usuario: "Operacional" })
      });

      const resultado = await response.json();

      if (response.ok) {
        this.mostrarMensagem(resultado.sucesso, "success");
        motivoInput.value = "";
        select.value = "";
        this.carregarHistoricoExclusoes();
        this.carregarEventosNosSelects(); 
      } else {
        throw new Error(resultado.erro);
      }
    } catch (error) {
      this.mostrarMensagem(error.message, "error");
    }
  }

  async carregarHistoricoExclusoes() {
    const tbody = document.getElementById("historico-exclusoes");
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Carregando solicitações...</td></tr>';

    try {
      const response = await fetch(`${API_URL}/eventos/pendentes-exclusao`);
      if (response.ok) {
        const historico = await response.json();
        
        if (historico.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Nenhuma solicitação de exclusão registrada.</td></tr>';
            return;
        }

        tbody.innerHTML = historico.map(ev => {
            if (ev.status_exclusao === 'excluido') {
                return `
                <tr style="opacity: 0.7;">
                    <td>${ev.data_solicitacao}</td>
                    <td class="fw-bold text-decoration-line-through">${ev.nome}</td>
                    <td>${ev.solicitado_por || 'Sistema'}</td>
                    <td><small class="text-muted">${ev.motivo}</small></td>
                    <td>
                        <span class="badge bg-danger mb-1">Excluído</span><br>
                        <small style="font-size:10px"><i class="bi bi-person-check"></i> ${ev.aprovado_por} em ${ev.data_aprovacao}</small>
                    </td>
                    <td class="text-center"><button class="btn btn-secondary btn-sm" disabled><i class="bi bi-lock-fill"></i> Arquivado</button></td>
                </tr>`;
            } else {
                return `
                <tr>
                    <td>${ev.data_solicitacao}</td>
                    <td class="fw-bold">${ev.nome}</td>
                    <td>${ev.solicitado_por || 'Sistema'}</td>
                    <td><span class="badge bg-warning text-dark">${ev.motivo || 'Sem motivo'}</span></td>
                    <td><span class="badge bg-warning text-dark">Aguardando Aprovação</span></td>
                    <td class="text-center">
                        <button class="btn btn-outline-danger btn-sm fw-bold" onclick="window.aprovarExclusaoGlobal(${ev.id})">
                            <i class="bi bi-check2-circle"></i> Aprovar
                        </button>
                    </td>
                </tr>`;
            }
        }).join('');
      }
    } catch (error) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar histórico.</td></tr>';
    }
  }

  // =========================================================
  // GERAÇÃO E IMPRESSÃO
  // =========================================================
  async gerarVouchers() {
    const eventoSelect = document.getElementById("eventoSelect");
    const eventoId = parseInt(eventoSelect.value);
    const quantidade = parseInt(document.getElementById("quantidadeVouchers").value);
    const statusDiv = document.getElementById("status-geracao");

    if (!eventoId || isNaN(eventoId) || !quantidade || quantidade <= 0) {
      statusDiv.innerHTML = `<div class="alert alert-danger">Verifique os dados preenchidos.</div>`;
      return;
    }

    statusDiv.innerHTML = `<div class="alert alert-info">Gerando ${quantidade} vouchers...</div>`;

    try {
      const response = await fetch(`${API_URL}/vouchers/gerar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evento_id: eventoId, quantidade: quantidade }),
      });

      if (response.ok) {
        const result = await response.json();
        statusDiv.innerHTML = `<div class="alert alert-success">${result.sucesso}</div>`;
        this.carregarRelatorios();
        document.getElementById("form-vouchers").reset();
      } else {
        const errorData = await response.json();
        statusDiv.innerHTML = `<div class="alert alert-danger">${errorData.erro}</div>`;
      }
    } catch (error) {
      statusDiv.innerHTML = `<div class="alert alert-danger">Erro de conexão: ${error.message}</div>`;
    }
  }

  async acessarVouchers() {
    const eventoId = parseInt(document.getElementById("eventoAcessarSelect").value);
    const tamanho = document.getElementById("tamanhoImpressao").value;

    const filtroStatus = document.getElementById("filtroStatusImpressao") ? document.getElementById("filtroStatusImpressao").value : "todos";
    const inicioInput = document.getElementById("intervaloInicio") ? parseInt(document.getElementById("intervaloInicio").value) : NaN;
    const fimInput = document.getElementById("intervaloFim") ? parseInt(document.getElementById("intervaloFim").value) : NaN;

    if (!eventoId) { alert("Selecione um evento."); return; }

    try {
      const response = await fetch(`${API_URL}/vouchers/${eventoId}`);
      if (response.ok) {
        const result = await response.json();
        
        let vouchersFiltrados = [];
        if (Array.isArray(result)) {
            vouchersFiltrados = result;
        } else if (result && (result.vouchers || result.data)) {
            vouchersFiltrados = result.vouchers || result.data;
        } else if (result && typeof result === 'object') {
            const arrayKey = Object.keys(result).find(k => Array.isArray(result[k]));
            if (arrayKey) vouchersFiltrados = result[arrayKey];
        }

        if (vouchersFiltrados.length === 0) {
            alert("Este evento ainda não possui vouchers gerados.");
            return;
        }

        vouchersFiltrados.reverse();
        
        const totalVouchersEmitidos = vouchersFiltrados.length;

        if (filtroStatus !== "todos") {
          vouchersFiltrados = vouchersFiltrados.filter(v => v.status && String(v.status).toLowerCase().trim() === filtroStatus.toLowerCase());
        }

        if (!isNaN(inicioInput) || !isNaN(fimInput)) {
          vouchersFiltrados = vouchersFiltrados.filter(v => {
            if (!v.codigo) return false;
            const partes = String(v.codigo).split('_');
            const numeroStr = partes[partes.length - 1]; 
            const numeroReal = parseInt(numeroStr, 10);

            if (isNaN(numeroReal)) return false;

            const min = !isNaN(inicioInput) ? inicioInput : -Infinity;
            const max = !isNaN(fimInput) ? fimInput : Infinity;

            return numeroReal >= min && numeroReal <= max;
          });
        }

        if (vouchersFiltrados.length === 0) {
          alert("Nenhum voucher foi encontrado com os filtros e intervalo de códigos selecionados.");
          return;
        }

        vouchersFiltrados.sort((a, b) => {
            const numA = parseInt(String(a.codigo || "").split('_').pop(), 10) || 0;
            const numB = parseInt(String(b.codigo || "").split('_').pop(), 10) || 0;
            return numA - numB;
        });

        vouchersFiltrados = vouchersFiltrados.map((v) => {
            const numeroReal = parseInt(String(v.codigo || "").split('_').pop(), 10) || 0;
            return {
                ...v,
                numeracao_real: `${numeroReal} de ${totalVouchersEmitidos}`
            };
        });

        this.gerarPaginaDeImpressao(vouchersFiltrados, tamanho);
      } else {
        alert("Erro do servidor ao buscar vouchers: " + response.statusText);
      }
    } catch (error) {
      alert("Falha no processamento: " + error.message);
    }
  }

  async gerarPaginaDeImpressao(vouchers, tamanho = "80") {
    if (vouchers.length === 0) {
      alert("Nenhum voucher para imprimir.");
      return;
    }

    try {
      const response = await fetch("http://127.0.0.1:3005/health");
      const status = await response.json();

      if (status.impressora === "conectada") {
        await this.imprimirComImpressoraTermica(vouchers);
        return;
      }
    } catch (error) {}

    this.imprimirNormal(vouchers);
  }

  async imprimirComImpressoraTermica(vouchers) {
    const totalVouchers = vouchers.length;

    const confirmacao = confirm(
      `🎫 IMPRESSORA TÉRMICA DETECTADA! 🖨️\n\n` +
      `Deseja imprimir ${totalVouchers} vouchers com CORTE AUTOMÁTICO?\n\n` +
      `✅ Numeração sequencial visual\n` +
      `✅ Código de barras mantido para validação\n\n` +
      `Clique em OK para imprimir ou Cancelar para impressão normal.`
    );

    if (!confirmacao) {
      this.imprimirNormal(vouchers);
      return;
    }

    const modalProgresso = this.mostrarModalProgresso(totalVouchers);

    try {
      const vouchersParaImpressao = vouchers.map((voucher, index) => ({
        ...voucher,
        numeracao: voucher.numeracao_real || `${index + 1} de ${totalVouchers}`,
        indice: index + 1,
        total: totalVouchers,
      }));

      const response = await fetch("http://127.0.0.1:3005/imprimir-lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vouchers: vouchersParaImpressao, delayEntreVouchers: 2000, usarNumeracao: false }),
      });

      const resultado = await response.json();
      modalProgresso.fechar();

      if (resultado.success) {
        alert(`🎉 IMPRESSÃO CONCLUÍDA! \n✅ ${resultado.impressos} impressos\n❌ ${resultado.erros} erros`);
      } else {
        throw new Error(resultado.error);
      }
    } catch (error) {
      modalProgresso.fechar();
      alert(`❌ Erro na impressão automática:\n${error.message}\n\nVoltando para impressão normal...`);
      this.imprimirNormal(vouchers);
    }
  }

  mostrarModalProgresso(total) {
    const modal = document.createElement("div");
    modal.id = "modal-impressao-fiep";
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9);
        display: flex; flex-direction: column; justify-content: center; align-items: center; color: white; z-index: 10000;
    `;
    modal.innerHTML = `
        <div style="text-align: center; background: #2c3e50; padding: 30px; border-radius: 15px; min-width: 400px;">
            <h2 style="color: #27ae60; margin-bottom: 20px;">🖨️ Imprimindo Vouchers</h2>
            <div style="font-size: 48px; margin-bottom: 15px;">⏳</div>
            <p>Processando <strong>${total}</strong> vouchers...</p>
            <div style="background: #34495e; border-radius: 10px; margin: 20px 0;">
                <div id="progresso-bar-fiep" style="height: 12px; background: #27ae60; width: 0%; transition: width 0.3s;"></div>
            </div>
            <div id="progresso-texto-fiep">Iniciando...</div>
        </div>`;
    document.body.appendChild(modal);

    return {
      atualizar: (atual, mensagem) => {
        const percentual = Math.min((atual / total) * 100, 100);
        const bar = document.getElementById("progresso-bar-fiep");
        const texto = document.getElementById("progresso-texto-fiep");
        if (bar) bar.style.width = percentual + "%";
        if (texto) texto.innerHTML = mensagem || `Imprimindo ${atual} de ${total}...`;
      },
      fechar: () => {
        if (document.body.contains(modal)) document.body.removeChild(modal);
      },
    };
  }

  imprimirNormal(vouchers) {
    const impressaoJanela = window.open("", "_blank");
    let htmlContent = `<!DOCTYPE html><html><head><title>Vouchers para Impressão</title>
        <style>
            body { font-family: 'Arial'; margin: 0; padding: 10px; width: 80mm; }
            .voucher { border: 2px solid #000; padding: 12px; margin-bottom: 10px; text-align: center; page-break-after: always; }
            .voucher:last-child { page-break-after: auto; }
            .detalhes { background: #f8f9fa; padding: 6px; margin: 8px 0; border-radius: 3px; border: 1px dashed #ccc; }
            .codigo-barras { margin: 8px 0; }
        </style></head><body><div id="container-vouchers">`;

    vouchers.forEach((voucher, index) => {
      const codigo = voucher.codigo || `voucher-${voucher.id}`;
      const tipoBebida = voucher.tipo_bebida === "com_bebida" ? "COM BEBIDA" : "SEM BEBIDA";
      const tipoAcesso = voucher.tipo_acesso === "interno" ? "INTERNO" : (voucher.tipo_acesso === "externo" ? "EXTERNO" : "ÁTRIO");

      htmlContent += `<div class="voucher">
            <h3>FIEP - VOUCHER</h3>
            <p>${voucher.numeracao_real || `${index + 1} de${vouchers.length}`}</p>
            <div class="detalhes">
                <p><strong>Evento:</strong><br>${voucher.nome_evento || "N/A"}</p>
                <p><strong>Acesso:</strong> ${tipoAcesso}</p>
                <p><strong>Bebida:</strong> ${tipoBebida}</p>
            </div>
            <div class="codigo-barras">
                <svg id="barcode-${index}"></svg>
                <p style="font-size: 10px">${codigo}</p>
            </div>
        </div>`;
    });

    htmlContent += `</div>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
        <script>
            setTimeout(() => {
                ${vouchers.map((v, i) => `JsBarcode("#barcode-${i}", "${v.codigo || `voucher-${v.id}`}", {format: "CODE128", width: 1.5, height: 40, displayValue: false});`).join("")}
            }, 100);
            setTimeout(() => window.print(), 800);
            window.onafterprint = function() { setTimeout(() => window.close(), 1000); };
        </script></body></html>`;
        
    impressaoJanela.document.write(htmlContent);
    impressaoJanela.document.close();
  }

  // =========================================================
  // RELATÓRIOS E DASHBOARD
  // =========================================================
  async carregarRelatorios() {
    const tbody = document.querySelector("#relatorios .events-table tbody");
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="10" class="text-center">Carregando...</td></tr>';

    try {
      const response = await fetch(`${API_URL}/relatorios`);
      if (response.ok) {
        const relatorios = await response.json();
        if (relatorios && relatorios.length > 0) {
          const relatoriosFiltrados = this.aplicarFiltroNosDados(relatorios);
          this.atualizarTabelaRelatorios(relatoriosFiltrados);
          this.atualizarKPIs(relatoriosFiltrados);
          this.renderInsights(relatoriosFiltrados);
          setTimeout(() => { this.renderGraficos(relatoriosFiltrados); }, 300);
        } else {
          this.mostrarMensagemSemDados();
        }
      }
    } catch (error) {
      this.mostrarMensagemSemDados();
    }
  }

  mostrarMensagemSemDados() {
    this.atualizarTabelaRelatorios([]);
    this.atualizarKPIs([]);
    this.destroyGraficos();
    
    const container = document.getElementById("insights-bar");
    if (container) {
      container.innerHTML = `
        <div class="alert alert-secondary w-100 text-center mt-3" style="background: rgba(255,255,255,0.05); border: 1px dashed #555; color: #aaa;">
          <i class="bi bi-inbox" style="font-size: 1.5rem; display: block; margin-bottom: 10px;"></i>
          <strong>Sistema Zerado!</strong> Nenhum evento ou relatório encontrado no banco de dados.
        </div>
      `;
    }
  }

  aplicarFiltroNosDados(relatorios) {
    if (!relatorios || relatorios.length === 0) return [];

    const hoje = new Date();
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

    switch (this.filtroAtual) {
      case "ativos": return relatorios.filter((rel) => rel.ativos > 0);
      case "concluidos": return relatorios.filter((rel) => {
          const dataEvento = new Date(rel.data_evento.split("/").reverse().join("-"));
          return dataEvento < hoje && rel.usados > 0;
        });
      case "este-mes": return relatorios.filter((rel) => {
          const dataEvento = new Date(rel.data_evento.split("/").reverse().join("-"));
          return dataEvento >= primeiroDiaMes && dataEvento <= ultimoDiaMes;
        });
      case "alta-performance": return relatorios.filter((rel) => rel.percentual_uso >= 50);
      case "todos": default: return relatorios;
    }
  }

  atualizarKPIs(relatorios) {
    if (!relatorios || relatorios.length === 0) return;

    const eventosAtivos = relatorios.filter(r => r.status_exclusao !== 'excluido');
    const eventosCancelados = relatorios.filter(r => r.status_exclusao === 'excluido');

    const totalEventos = eventosAtivos.length;
    const totalVouchers = eventosAtivos.reduce((s, r) => s + (parseInt(r.total_vouchers) || 0), 0);
    const vouchersAtivos = eventosAtivos.reduce((s, r) => s + (parseInt(r.ativos) || 0), 0);
    const vouchersUsados = eventosAtivos.reduce((s, r) => s + (parseInt(r.usados) || 0), 0);
    const vouchersDevolvidos = eventosAtivos.reduce((s, r) => s + (parseInt(r.devolvidos) || 0), 0);
    const vouchersExpirados = eventosAtivos.reduce((s, r) => s + (parseInt(r.expirados) || 0), 0);

    const taxaUso = totalVouchers > 0 ? Math.round((vouchersUsados / totalVouchers) * 100) : 0;
    const naoUtilizados = vouchersDevolvidos + vouchersExpirados;
    const taxaOciosidade = totalVouchers > 0 ? Math.round((naoUtilizados / totalVouchers) * 100) : 0;

    let faturadoInterno = 0, faturadoExterno = 0, geradoInterno = 0, geradoExterno = 0;

    eventosAtivos.forEach(rel => {
        const usados = rel.usados || 0;
        const gerados = rel.total_vouchers || 0;
        let preco = rel.tipo_acesso === 'interno' ? (rel.tipo_bebida === 'com_bebida' ? 45 : 40) : (rel.tipo_bebida === 'com_bebida' ? 48 : 45);

        if (rel.tipo_acesso === 'interno') { faturadoInterno += (usados * preco); geradoInterno += (gerados * preco); } 
        else { faturadoExterno += (usados * preco); geradoExterno += (gerados * preco); }
    });

    const totalCancelados = eventosCancelados.length;
    const vouchersInutilizados = eventosCancelados.reduce((s, r) => s + (parseInt(r.cancelados) || 0), 0);
    
    let faturamentoPerdido = 0;
    eventosCancelados.forEach(rel => {
        let preco = rel.tipo_acesso === 'interno' ? (rel.tipo_bebida === 'com_bebida' ? 45 : 40) : (rel.tipo_bebida === 'com_bebida' ? 48 : 45);
        faturamentoPerdido += ((rel.cancelados || 0) * preco);
    });

    const formatarMoeda = (valor) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    set("kpi-total-eventos", totalEventos);
    set("kpi-ativos", vouchersAtivos);
    set("kpi-usados", vouchersUsados);
    set("kpi-taxa-uso", `${taxaUso}%`);
    set("kpi-devolvidos", vouchersDevolvidos);
    set("kpi-expirados", vouchersExpirados);
    set("kpi-ociosidade", `${taxaOciosidade}%`);
    set("kpi-faturado-interno", formatarMoeda(faturadoInterno));
    set("kpi-faturado-externo", formatarMoeda(faturadoExterno));
    set("kpi-faturado-total", formatarMoeda(faturadoInterno + faturadoExterno));
    set("kpi-gerado-interno", formatarMoeda(geradoInterno));
    set("kpi-gerado-externo", formatarMoeda(geradoExterno));
    set("kpi-gerado-total", formatarMoeda(geradoInterno + geradoExterno));

    set("kpi-eventos-cancelados", totalCancelados);
    set("kpi-vouchers-cancelados", vouchersInutilizados);
    set("kpi-faturamento-perdido", formatarMoeda(faturamentoPerdido));
  }

  atualizarTabelaRelatorios(relatorios) {
    const tbody = document.getElementById("events-table-body") || document.querySelector("#relatorios .events-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!relatorios || relatorios.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="text-center">Nenhum evento encontrado.</td></tr>`;
      return;
    }

    relatorios.forEach((relatorio) => {
      const row = document.createElement("tr");
      const pct = parseFloat(relatorio.percentual_uso) || 0;
      let percentClass = pct > 75 ? "usage-high" : pct > 40 ? "usage-medium" : "usage-low";
      let barColor = pct > 75 ? "var(--dash-green, #00c17a)" : pct > 40 ? "var(--dash-yellow, #f4b942)" : "var(--dash-red, #f0385a)";

      const estiloExpirado = `background: rgba(240, 56, 90, 0.1); color: #f0385a; padding: 4px 8px; border-radius: 6px; font-weight: 700; font-size: 0.85rem; display: inline-block; min-width: 32px; text-align: center;`;
      const estiloCancelado = `background: rgba(255, 193, 7, 0.1); color: #ffc107; padding: 4px 8px; border-radius: 6px; font-weight: 700; font-size: 0.85rem; display: inline-block; min-width: 32px; text-align: center;`;

      if (relatorio.status_exclusao === 'excluido') {
          row.innerHTML = `
            <td><strong class="text-danger">#${relatorio.id}</strong></td>
            <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${relatorio.nome}">
                <div style="font-weight:600; text-decoration: line-through; color: #dc3545;">${relatorio.nome}</div>
                <small style="color:#aaa;font-size:0.75rem;"><i class="bi bi-person-fill"></i> ${relatorio.criado_por || 'Sistema'}</small>
            </td>
            <td>${relatorio.data_evento}</td>
            <td colspan="6" class="text-center">
                <div class="alert alert-danger p-1 m-0 fw-bold border-danger" style="font-size: 12px; background: rgba(220,53,69,0.1);">
                    <i class="bi bi-slash-circle"></i> EVENTO CANCELADO
                </div>
            </td>
            <td>
              <div class="td-uso-wrap">
                <span class="usage-percent text-danger">0%</span>
                <div class="td-uso-bar"><div class="td-uso-bar-fill" style="width:0%;background:#dc3545"></div></div>
              </div>
            </td>
          `;
      } else {
          row.innerHTML = `
            <td><strong style="color:var(--dash-accent,#4c0094)">#${relatorio.id}</strong></td>
            <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${relatorio.nome}">
                <div style="font-weight:600">${relatorio.nome}</div>
                <small style="color:#aaa;font-size:0.75rem;"><i class="bi bi-person-fill"></i> ${relatorio.criado_por || 'Sistema'}</small>
            </td>
            <td style="white-space:nowrap">${relatorio.data_evento}</td>
            <td style="font-weight:700">${relatorio.total_vouchers}</td>
            <td><span class="status-badge badge-active">${relatorio.ativos}</span></td>
            <td><span class="status-badge badge-used">${relatorio.usados}</span></td>
            <td><span class="status-badge badge-devolved">${relatorio.devolvidos || 0}</span></td>
            <td><span style="${estiloCancelado}">${relatorio.cancelados || 0}</span></td>
            <td><span style="${estiloExpirado}">${relatorio.expirados || 0}</span></td>
            <td>
              <div class="td-uso-wrap">
                <span class="usage-percent ${percentClass}">${pct}%</span>
                <div class="td-uso-bar"><div class="td-uso-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>
              </div>
            </td>
          `;
      }
      
      tbody.appendChild(row);
    });
  }

  async exportarDados() {
    try {
      const response = await fetch(`${API_URL}/relatorios`);
      if (!response.ok) throw new Error("Falha ao buscar dados");
      
      const relatorios = await response.json();
      if (!relatorios || relatorios.length === 0) return;

      const cabecalho = ["ID", "Evento", "Data", "Total Vouchers", "Ativos", "Usados", "Devolvidos", "Cancelados", "Expirados", "% Uso"];
      const linhas = relatorios.map((r) => [r.id, r.nome, r.data_evento, r.total_vouchers, r.ativos, r.usados, r.devolvidos || 0, r.cancelados || 0, r.expirados || 0, r.percentual_uso]);

      const conteudoCSV = [cabecalho, ...linhas].map((l) => l.join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + conteudoCSV], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `relatorio_vouchers_fiep.csv`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      this.mostrarMensagem("Erro ao exportar dados.", "error");
    }
  }

  // =========================================================
  // GRÁFICOS APEXCHARTS
  // =========================================================
  renderGraficos(relatorios) {
    if (typeof ApexCharts === "undefined") {
      setTimeout(() => this.renderGraficos(relatorios), 500);
      return;
    }

    this.destroyGraficos();

    const totalAtivos = relatorios.reduce((s, r) => s + (parseInt(r.ativos) || 0), 0);
    const totalUsados = relatorios.reduce((s, r) => s + (parseInt(r.usados) || 0), 0);
    const totalDevolvidos = relatorios.reduce((s, r) => s + (parseInt(r.devolvidos) || 0), 0);
    const totalCancelados = relatorios.reduce((s, r) => s + (parseInt(r.cancelados) || 0), 0);
    const totalExpirados = relatorios.reduce((s, r) => s + (parseInt(r.expirados) || 0), 0);

    const totalGeral = totalAtivos + totalUsados + totalDevolvidos + totalCancelados + totalExpirados;

    const donutTotal = document.getElementById("chart-donut-total");
    if (donutTotal) donutTotal.textContent = `Total: ${totalGeral} vouchers`;

    const donutEl = document.getElementById("chart-donut");
    if (donutEl) {
      donutEl.style.display = "block";
      donutEl.style.minHeight = "260px";

      try {
        const donutOpts = {
          series: [totalAtivos, totalUsados, totalDevolvidos, totalCancelados, totalExpirados],
          labels: ["Ativos", "Usados", "Devolvidos", "Cancelados", "Expirados"],
          chart: { type: "donut", height: 260, toolbar: { show: false } },
          colors: ["#3b6bfa", "#00c17a", "#f4b942", "#ffc107", "#f0385a"],
          legend: { position: "bottom" },
          plotOptions: {
            pie: { donut: { size: "65%", labels: { show: true, total: { show: true, label: "Total", formatter: () => totalGeral.toString() } } } }
          }
        };

        this._donutChart = new ApexCharts(donutEl, donutOpts);
        this._donutChart.render();
      } catch (err) {}
    }

    const barsEl = document.getElementById("chart-bars");
    if (barsEl && relatorios.length > 0) {
      barsEl.style.display = "block";
      barsEl.style.minHeight = "260px";

      try {
        const dadosBars = relatorios.slice(0, 10);
        const barsOpts = {
          series: [
            { name: "Ativos", data: dadosBars.map(r => parseInt(r.ativos) || 0) },
            { name: "Usados", data: dadosBars.map(r => parseInt(r.usados) || 0) },
            { name: "Devolvidos", data: dadosBars.map(r => parseInt(r.devolvidos) || 0) },
            { name: "Cancelados", data: dadosBars.map(r => parseInt(r.cancelados) || 0) }
          ],
          chart: { type: "bar", height: 260, stacked: true, toolbar: { show: false } },
          colors: ["#3b6bfa", "#00c17a", "#f4b942", "#ffc107"],
          xaxis: { categories: dadosBars.map(r => r.nome.length > 14 ? r.nome.substring(0, 14) + "…" : r.nome) },
          legend: { position: "top" }
        };

        this._barsChart = new ApexCharts(barsEl, barsOpts);
        this._barsChart.render();
      } catch (err) {}
    }
  }

  renderInsights(relatorios) {
    const container = document.getElementById("insights-bar");
    if (!container) return;
    if (!relatorios || relatorios.length === 0) { container.innerHTML = ""; return; }

    const topEvento = relatorios.reduce((best, r) => (r.percentual_uso || 0) > (best.percentual_uso || 0) ? r : best, relatorios[0]);
    const maisPopuloso = relatorios.reduce((best, r) => (r.total_vouchers || 0) > (best.total_vouchers || 0) ? r : best, relatorios[0]);

    container.innerHTML = `
      <div class="insight-chip">
        <div class="insight-chip-icon" style="background:rgba(155,93,229,0.12);color:#9b5de5"><i class="bi bi-trophy-fill"></i></div>
        <div class="insight-chip-body">
          <div class="insight-chip-label">Top Performance</div>
          <div class="insight-chip-value">${topEvento ? topEvento.nome : "—"}</div>
        </div>
      </div>
      <div class="insight-chip">
        <div class="insight-chip-icon" style="background:rgba(59,107,250,0.10);color:#3b6bfa"><i class="bi bi-bar-chart-steps"></i></div>
        <div class="insight-chip-body">
          <div class="insight-chip-label">Maior Volume</div>
          <div class="insight-chip-value">${maisPopuloso ? maisPopuloso.nome : "—"}</div>
        </div>
      </div>
    `;
  }

  destroyGraficos() {
    if (this._donutChart) { try { this._donutChart.destroy(); } catch (e) {} this._donutChart = null; }
    if (this._barsChart) { try { this._barsChart.destroy(); } catch (e) {} this._barsChart = null; }
    
    ["chart-donut", "chart-bars"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = "";
    });
  }
}

// =========================================================
// INICIALIZAÇÃO
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
  new VoucherSystem();
});

// =========================================================
// FUNÇÕES GLOBAIS DE ADMIN (BOTÕES HTML)
// =========================================================

window.aprovarExclusaoGlobal = async function(eventoId) {
    if (!confirm("Tem certeza que deseja aprovar o arquivamento definitivo deste evento?")) return;
    
    try {
        const response = await fetch(`${API_URL}/eventos/aprovar-exclusao/${eventoId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: "Admin" }) 
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert("✅ " + data.sucesso);
            window.location.reload(); 
        } else {
            alert("❌ Erro: " + data.erro);
        }
    } catch (error) {
        alert("Falha na comunicação com o servidor.");
    }
};

window.deletarUsuarioGlobal = async function(id, nome) {
    if (!confirm(`🚨 ATENÇÃO: Tem certeza que deseja remover o acesso de ${nome} ao sistema?`)) return;
    
    try {
        const response = await fetch(`${API_URL}/api/usuarios/${id}`, { method: 'DELETE' });
        const data = await response.json();
        
        if (response.ok) {
            alert("✅ " + data.sucesso);
            window.location.reload(); 
        } else {
            alert("❌ Erro: " + data.erro);
        }
    } catch (error) {
        alert("Falha na comunicação com o servidor.");
    }
};