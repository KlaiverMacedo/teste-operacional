// filters.js - Sistema de Filtros para a Tabela de Eventos

let eventosData = [];
let filteredData = [];
let currentSort = { column: "id", direction: "asc" };
let currentPage = 1;
const itemsPerPage = 10;

// Dados de exemplo (substitua pelos dados reais do seu sistema)
const eventosExemplo = [
  { id: 43, evento: "Fiep 82 anos", data: "Fri, 31 Oct 2025 00:00:00 GMT", total: 10, ativos: 10, usados: 0, expirados: 0, uso: 0.0 },
  { id: 44, evento: "thayssa", data: "Sun, 19 Oct 2025 00:00:00 GMT", total: 20, ativos: 16, usados: 4, expirados: 0, uso: 20.0 },
  { id: 47, evento: "teste definitivo", data: "Sun, 19 Oct 2025 00:00:00 GMT", total: 50, ativos: 50, usados: 0, expirados: 0, uso: 0.0 },
  { id: 38, evento: "teste novo", data: "Thu, 16 Oct 2025 00:00:00 GMT", total: 1, ativos: 1, usados: 0, expirados: 0, uso: 0.0 },
  { id: 45, evento: "gggg", data: "Mon, 13 Oct 2025 00:00:00 GMT", total: 2, ativos: 1, usados: 1, expirados: 0, uso: 50.0 },
];

function initFilters() {
  eventosData = [...eventosExemplo];
  filteredData = [...eventosData];

  // Inicializar a tabela
  renderTable();

  // Configurar eventos
  setupEventListeners();

  // Atualizar KPIs
  updateKPIs();
}

function setupEventListeners() {
  // Busca rápida (Verifica se o elemento existe antes de adicionar o evento)
  const searchEvents = document.getElementById("search-events");
  if (searchEvents) searchEvents.addEventListener("input", applyFilters);

  const clearSearchBtn = document.getElementById("clear-search");
  if (clearSearchBtn) clearSearchBtn.addEventListener("click", clearSearch);

  // Filtros avançados
  const btnAplicar = document.getElementById("aplicar-filtros");
  if (btnAplicar) btnAplicar.addEventListener("click", applyFilters);

  const btnLimpar = document.getElementById("limpar-filtros");
  if (btnLimpar) btnLimpar.addEventListener("click", clearAllFilters);

  const btnToggle = document.getElementById("toggle-filters");
  if (btnToggle) btnToggle.addEventListener("click", toggleFilters);

  // Ordenação
  document.querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => sortTable(th.dataset.sort));
  });

  // Paginação
  const prevPageBtn = document.getElementById("prev-page");
  if (prevPageBtn) prevPageBtn.addEventListener("click", prevPage);

  const nextPageBtn = document.getElementById("next-page");
  if (nextPageBtn) nextPageBtn.addEventListener("click", nextPage);

  // Filtros rápidos
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document
        .querySelectorAll(".filter-btn")
        .forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");
      applyQuickFilter(e.target.dataset.filtro);
    });
  });
}

function applyFilters() {
  // Lê os valores com segurança (retorna string vazia se o elemento não existir)
  const searchEl = document.getElementById("search-events");
  const searchTerm = searchEl ? searchEl.value.toLowerCase() : "";

  const filterEventoEl = document.getElementById("filter-evento");
  const filterEvento = filterEventoEl ? filterEventoEl.value.toLowerCase() : "";

  const filterDataInicioEl = document.getElementById("filter-data-inicio");
  const filterDataInicio = filterDataInicioEl ? filterDataInicioEl.value : "";

  const filterDataFimEl = document.getElementById("filter-data-fim");
  const filterDataFim = filterDataFimEl ? filterDataFimEl.value : "";

  const filterStatusEl = document.getElementById("filter-status");
  const filterStatus = filterStatusEl ? filterStatusEl.value : "";

  const filterUsoEl = document.getElementById("filter-uso");
  const filterUso = filterUsoEl ? filterUsoEl.value : "";

  filteredData = eventosData.filter((evento) => {
    // Filtro de busca rápida
    if (searchTerm && !evento.evento.toLowerCase().includes(searchTerm)) {
      return false;
    }

    // Filtro por nome do evento
    if (filterEvento && !evento.evento.toLowerCase().includes(filterEvento)) {
      return false;
    }

    // Filtro por data
    if (filterDataInicio || filterDataFim) {
      const eventDate = new Date(evento.data);
      if (filterDataInicio && eventDate < new Date(filterDataInicio)) {
        return false;
      }
      if (filterDataFim && eventDate > new Date(filterDataFim)) {
        return false;
      }
    }

    // Filtro por status
    if (filterStatus) {
      if (filterStatus === "ativos" && evento.ativos === 0) return false;
      if (filterStatus === "usados" && evento.usados === 0) return false;
      if (filterStatus === "expirados" && evento.expirados === 0) return false;
    }

    // Filtro por % de uso
    if (filterUso) {
      if (filterUso === "alta" && evento.uso <= 50) return false;
      if (filterUso === "media" && (evento.uso < 20 || evento.uso > 50))
        return false;
      if (filterUso === "baixa" && evento.uso >= 20) return false;
    }

    return true;
  });

  currentPage = 1;
  renderTable();
  updateKPIs();
}

function applyQuickFilter(tipo) {
  switch (tipo) {
    case "ativos":
      filteredData = eventosData.filter((e) => e.ativos > 0);
      break;
    case "concluidos":
      filteredData = eventosData.filter((e) => e.usados > 0);
      break;
    case "este-mes":
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      filteredData = eventosData.filter((e) => new Date(e.data) >= firstDay);
      break;
    case "alta-performance":
      filteredData = eventosData.filter((e) => e.uso >= 50);
      break;
    default:
      filteredData = [...eventosData];
  }

  currentPage = 1;
  renderTable();
  updateKPIs();
}

function clearSearch() {
  const searchEl = document.getElementById("search-events");
  if (searchEl) searchEl.value = "";
  applyFilters();
}

function clearAllFilters() {
  const inputsToClear = [
    "search-events",
    "filter-evento",
    "filter-data-inicio",
    "filter-data-fim",
    "filter-status",
    "filter-uso"
  ];

  inputsToClear.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
  });

  // Reativar filtro "Todos"
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.remove("active");
    if (btn.dataset.filtro === "todos") {
      btn.classList.add("active");
    }
  });

  applyFilters();
}

function toggleFilters() {
  const content = document.getElementById("filter-content");
  const button = document.getElementById("toggle-filters");
  
  if (!content || !button) return; // Segurança caso o botão de toggle não exista

  const icon = button.querySelector("i");

  content.classList.toggle("collapsed");
  if (content.classList.contains("collapsed")) {
    if (icon) icon.className = "bi bi-chevron-right";
  } else {
    if (icon) icon.className = "bi bi-chevron-down";
  }
}

function sortTable(column) {
  if (currentSort.column === column) {
    currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
  } else {
    currentSort.column = column;
    currentSort.direction = "asc";
  }

  // Atualizar indicadores visuais
  document.querySelectorAll("th[data-sort]").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    const icon = th.querySelector("i");
    if (icon) icon.className = "bi bi-arrow-down-up";
  });

  const currentTh = document.querySelector(`th[data-sort="${column}"]`);
  if (currentTh) {
      currentTh.classList.add(`sort-${currentSort.direction}`);
      const icon = currentTh.querySelector("i");
      if (icon) {
          icon.className = currentSort.direction === "asc" ? "bi bi-arrow-up" : "bi bi-arrow-down";
      }
  }

  // Ordenar dados
  filteredData.sort((a, b) => {
    let aValue = a[column];
    let bValue = b[column];

    if (column === "data") {
      aValue = new Date(aValue);
      bValue = new Date(bValue);
    }

    if (aValue < bValue) return currentSort.direction === "asc" ? -1 : 1;
    if (aValue > bValue) return currentSort.direction === "asc" ? 1 : -1;
    return 0;
  });

  renderTable();
}

function renderTable() {
  const tbody = document.getElementById("events-table-body");
  if (!tbody) return; // Segurança extra

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageData = filteredData.slice(startIndex, endIndex);
  
  const searchEl = document.getElementById("search-events");
  const searchValue = searchEl ? searchEl.value : "";

  if (pageData.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center">
                    <div class="alert alert-info">
                        <i class="bi bi-info-circle"></i>
                        Nenhum evento encontrado com os filtros aplicados.
                    </div>
                </td>
            </tr>
        `;
  } else {
    tbody.innerHTML = pageData
      .map(
        (evento) => `
            <tr>
                <td>${evento.id}</td>
                <td>${highlightText(evento.evento, searchValue)}</td>
                <td>${formatDate(evento.data)}</td>
                <td>${evento.total}</td>
                <td><span class="status-badge badge-ativo">${evento.ativos}</span></td>
                <td><span class="status-badge badge-usado">${evento.usados}</span></td>
                <td><span class="status-badge badge-expirado">${evento.expirados}</span></td>
                <td class="usage-percent ${getUsageClass(evento.uso)}">${evento.uso.toFixed(2)}%</td>
            </tr>
        `
      )
      .join("");
  }

  updatePagination();
  updateTableInfo();
}

function highlightText(text, searchTerm) {
  if (!searchTerm) return text;
  const regex = new RegExp(`(${searchTerm})`, "gi");
  return text.replace(regex, '<mark class="highlight">$1</mark>');
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR");
}

function getUsageClass(usage) {
  if (usage >= 50) return "usage-high";
  if (usage >= 20) return "usage-medium";
  return "usage-low";
}

function updatePagination() {
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const prevBtn = document.getElementById("prev-page");
  const nextBtn = document.getElementById("next-page");
  const pageInfo = document.getElementById("page-info");

  // Agora verificamos se os botões existem antes de desabilitá-los!
  if (prevBtn) prevBtn.disabled = currentPage === 1;
  if (nextBtn) nextBtn.disabled = currentPage === totalPages || totalPages === 0;
  if (pageInfo) pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
}

function updateTableInfo() {
  const total = filteredData.length;
  const start = Math.min((currentPage - 1) * itemsPerPage + 1, total);
  const end = Math.min(currentPage * itemsPerPage, total);

  const tableInfo = document.getElementById("table-info");
  if (tableInfo) {
      tableInfo.textContent = `Mostrando ${start} a ${end} de ${total} eventos`;
  }
}

function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    renderTable();
  }
}

function nextPage() {
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  if (currentPage < totalPages) {
    currentPage++;
    renderTable();
  }
}

function updateKPIs() {
  const totalEventos = eventosData.length;
  const vouchersAtivos = eventosData.reduce((sum, e) => sum + e.ativos, 0);
  const taxaUso =
    eventosData.length > 0
      ? (
          (eventosData.reduce((sum, e) => sum + e.usados, 0) /
            eventosData.reduce((sum, e) => sum + e.total, 0)) *
          100
        ).toFixed(1)
      : 0;
  const vouchersExpirados = eventosData.reduce(
    (sum, e) => sum + e.expirados,
    0
  );

  const kpiValues = document.querySelectorAll(".kpi-value");
  
  if (kpiValues.length >= 4) {
      kpiValues[0].textContent = totalEventos;
      kpiValues[1].textContent = vouchersAtivos;
      kpiValues[2].textContent = `${taxaUso}%`;
      kpiValues[3].textContent = vouchersExpirados;
  }
}

// Inicializar quando o DOM estiver carregado
document.addEventListener("DOMContentLoaded", initFilters);