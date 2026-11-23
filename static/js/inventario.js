
function escapeHtml(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(v){ return escapeHtml(v).replace(/"/g,'&quot;'); }
/**
 * SunQuote — Inventario Module
 */

const INV_CATEGORIAS = [
    { valor: 'panel', etiqueta: 'Paneles', icono: 'solar_power' },
    { valor: 'inversor', etiqueta: 'Inversores', icono: 'electric_meter' },
    { valor: 'bateria', etiqueta: 'Baterías', icono: 'battery_charging_full' },
    { valor: 'estructura', etiqueta: 'Materiales', icono: 'construction' },
    { valor: 'producto', etiqueta: 'Productos', icono: 'inventory_2' },
    { valor: 'servicio', etiqueta: 'Servicios', icono: 'engineering' }
];

function etiquetaCategoria(cat) {
    return INV_CATEGORIAS.find(c => c.valor === cat)?.etiqueta || cat || '';
}

let stateInventario = {
    categoria: '', // '' = TODOS
    data: [],
    buscar: '',
    selectedIds: [],
    marca: '',
    estado: 'todos', // 'todos' | 'activos' | 'inactivos'
    ivaFiltro: 'todos', // 'todos' | 'con_iva' | 'sin_iva'
    orden: 'marca_asc', // 'marca_asc', 'marca_desc', 'costo_asc', 'costo_desc', 'recientes'
    vista: 'lista' // 'lista' | 'cuadricula'
};

function setInvVista(vista) {
    stateInventario.vista = vista;
    renderEquiposList();
}

function setInvFilter(key, val) {
    stateInventario[key] = val;
    renderEquiposList();
    renderKPIsInventario();
}

function resetInvFilters() {
    stateInventario.buscar = '';
    stateInventario.categoria = '';
    stateInventario.marca = '';
    stateInventario.estado = 'todos';
    stateInventario.ivaFiltro = 'todos';
    stateInventario.orden = 'marca_asc';
    
    const buscarInput = document.getElementById('buscar-equipo');
    if (buscarInput) buscarInput.value = '';
    
    renderInventarioControls();
    renderEquiposList();
    renderKPIsInventario();
}

function exportarInventarioCSV() {
    const items = getFilteredEquipos();
    if (!items.length) {
        showToast('No hay elementos para exportar', 'warning');
        return;
    }
    const headers = ['ID', 'Categoría', 'Marca', 'Modelo', 'Subtipo', 'Potencia/Capacidad', 'Costo (COP)', 'IVA 19%', 'Unidad', 'Estado'];
    const rows = items.map(e => {
        let pot = '';
        if (e.categoria === 'panel') pot = `${e.potencia_wp || 0} Wp`;
        else if (e.categoria === 'inversor') pot = `${e.potencia_kw || 0} kW`;
        else if (e.categoria === 'bateria') pot = `${e.capacidad_kwh || 0} kWh`;
        else pot = '-';

        return [
            e.id,
            `"${etiquetaCategoria(e.categoria)}"`,
            `"${(e.marca || '').replace(/"/g, '""')}"`,
            `"${(e.modelo || '').replace(/"/g, '""')}"`,
            `"${(e.tipo || '').replace(/"/g, '""')}"`,
            `"${pot}"`,
            Math.round(e.costo || 0),
            e.iva ? 'Sí' : 'No',
            `"${e.unidad || 'und'}"`,
            e.activo ? 'Activo' : 'Inactivo'
        ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `inventario_solar_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`${items.length} ítems exportados a CSV`, 'success');
}

async function duplicarEquipo(id) {
    try {
        const orig = await API.get(`/equipos/${id}`);
        if (!orig) return;
        const copyData = {
            ...orig,
            modelo: `${orig.modelo || ''} (Copia)`,
            descripcion: orig.descripcion ? `${orig.descripcion} [Copia]` : ''
        };
        delete copyData.id;
        delete copyData.created_at;
        const res = await API.post('/equipos', copyData);
        showToast('Ítem duplicado con éxito', 'success');
        await fetchEquipos();
        if (res?.id) {
            openEquipoModal(res.id);
        }
    } catch (e) {
        showToast(e.message || 'Error al duplicar', 'error');
    }
}

async function renderInventario() {
    const content = document.getElementById('app-content');
    content.innerHTML = `
        <div class="flex flex-col w-full p-4 lg:p-10 gap-6 fade-in max-w-7xl mx-auto">
            <!-- Header -->
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-2">
                        <span class="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"></span>
                        <span class="font-label-bold text-xs text-primary uppercase tracking-widest">Base de Datos Maestra</span>
                    </div>
                    <h1 class="font-display-lg text-3xl lg:text-4xl font-extrabold text-on-surface tracking-tight">Inventario y Catálogo</h1>
                    <p class="text-xs text-on-surface-variant">Gestión de paneles, inversores, baterías, materiales y servicios para cotizaciones solares.</p>
                </div>
                <div class="flex flex-wrap items-center gap-2.5">
                    <button id="btn-bulk-delete" onclick="eliminarSeleccionados()" class="sq-btn bg-error text-white hidden text-xs py-2 px-3">
                        <span class="material-symbols-outlined text-[18px]">delete</span> ELIMINAR (<span id="bulk-delete-count">0</span>)
                    </button>
                    <button onclick="exportarInventarioCSV()" class="sq-btn sq-btn-ghost border border-outline-variant/40 hover:bg-surface-container-high text-xs py-2 px-3 text-on-surface" title="Exportar catálogo filtrado a Excel / CSV">
                        <span class="material-symbols-outlined text-[18px]">download</span> Exportar CSV
                    </button>
                    <button onclick="openImportPDFModal()" class="sq-btn sq-btn-ghost border border-primary/40 hover:bg-primary/10 text-primary text-xs py-2 px-3">
                        <span class="material-symbols-outlined text-[18px]">upload_file</span> IMPORTAR PDF
                    </button>
                    <button onclick="openEquipoModal()" class="sq-btn sq-btn-primary text-xs py-2 px-4 shadow-lg shadow-primary/20">
                        <span class="material-symbols-outlined text-[18px]">add</span> NUEVO ÍTEM
                    </button>
                </div>
            </div>

            <!-- KPIs Summary Cards -->
            <div id="inv-kpi-container" class="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
                <!-- Injected via renderKPIsInventario -->
            </div>

            <!-- Advanced Filter & Search Bar -->
            <div id="inv-controls-container" class="bg-surface-container-low border border-outline-variant/20 rounded-2xl p-4 lg:p-5 shadow-sm space-y-4">
                <!-- Injected via renderInventarioControls -->
            </div>

            <!-- Content Area: List / Grid -->
            <div id="equipos-container" class="space-y-3">
                <div class="col-span-full py-12 flex justify-center"><div class="sq-spinner"></div></div>
            </div>
        </div>
    `;

    await fetchEquipos();
}

function renderKPIsInventario() {
    const el = document.getElementById('inv-kpi-container');
    if (!el) return;

    const data = stateInventario.data || [];
    const totalItems = data.length;
    const activos = data.filter(e => e.activo).length;
    const paneles = data.filter(e => e.categoria === 'panel').length;
    const inversores = data.filter(e => e.categoria === 'inversor').length;
    const baterias = data.filter(e => e.categoria === 'bateria').length;
    const materiales = data.filter(e => e.categoria === 'estructura' || e.categoria === 'producto').length;
    const costoPromedio = totalItems > 0 ? (data.reduce((acc, x) => acc + (Number(x.costo) || 0), 0) / totalItems) : 0;
    const totalValuacion = data.reduce((acc, x) => acc + (Number(x.costo) || 0), 0);

    el.innerHTML = `
        <div onclick="switchInvCat('')" class="cursor-pointer p-4 rounded-xl bg-surface-container/60 border ${!stateInventario.categoria ? 'border-primary shadow-sm bg-primary/5' : 'border-outline-variant/15'} hover:border-primary/50 transition-all">
            <div class="flex items-center justify-between text-on-surface-variant text-xs mb-1.5">
                <span class="font-medium">Total Catálogo</span>
                <span class="material-symbols-outlined text-primary text-[18px]">inventory_2</span>
            </div>
            <div class="text-2xl font-bold text-on-surface">${totalItems} <span class="text-xs font-normal text-on-surface-variant">ítems</span></div>
            <div class="text-[11px] text-on-surface-variant/80 mt-1 flex items-center justify-between">
                <span>${activos} activos</span>
                <span class="font-semibold text-primary">${formatCurrency(totalValuacion)}</span>
            </div>
        </div>

        <div onclick="switchInvCat('panel')" class="cursor-pointer p-4 rounded-xl bg-surface-container/60 border ${stateInventario.categoria === 'panel' ? 'border-primary shadow-sm bg-primary/5' : 'border-outline-variant/15'} hover:border-primary/50 transition-all">
            <div class="flex items-center justify-between text-on-surface-variant text-xs mb-1.5">
                <span class="font-medium">Paneles Solares</span>
                <span class="material-symbols-outlined text-yellow-400 text-[18px]">solar_power</span>
            </div>
            <div class="text-2xl font-bold text-on-surface">${paneles} <span class="text-xs font-normal text-on-surface-variant">modelos</span></div>
            <div class="text-[11px] text-on-surface-variant/80 mt-1">
                ${data.filter(e => e.categoria === 'panel' && e.potencia_wp).map(p => p.potencia_wp + 'Wp').slice(0, 2).join(', ') || 'Módulos FV'}
            </div>
        </div>

        <div onclick="switchInvCat('inversor')" class="cursor-pointer p-4 rounded-xl bg-surface-container/60 border ${stateInventario.categoria === 'inversor' ? 'border-primary shadow-sm bg-primary/5' : 'border-outline-variant/15'} hover:border-primary/50 transition-all">
            <div class="flex items-center justify-between text-on-surface-variant text-xs mb-1.5">
                <span class="font-medium">Inversores & Ctrl</span>
                <span class="material-symbols-outlined text-blue-400 text-[18px]">electric_meter</span>
            </div>
            <div class="text-2xl font-bold text-on-surface">${inversores} <span class="text-xs font-normal text-on-surface-variant">equipos</span></div>
            <div class="text-[11px] text-on-surface-variant/80 mt-1">
                On-Grid, Híbridos & Off-Grid
            </div>
        </div>

        <div onclick="switchInvCat('bateria')" class="cursor-pointer p-4 rounded-xl bg-surface-container/60 border ${stateInventario.categoria === 'bateria' ? 'border-primary shadow-sm bg-primary/5' : 'border-outline-variant/15'} hover:border-primary/50 transition-all">
            <div class="flex items-center justify-between text-on-surface-variant text-xs mb-1.5">
                <span class="font-medium">Baterías & Almacenam.</span>
                <span class="material-symbols-outlined text-green-400 text-[18px]">battery_charging_full</span>
            </div>
            <div class="text-2xl font-bold text-on-surface">${baterias} <span class="text-xs font-normal text-on-surface-variant">bancos</span></div>
            <div class="text-[11px] text-on-surface-variant/80 mt-1">
                Litio LiFePO4 & Gel
            </div>
        </div>
    `;
}

function renderInventarioControls() {
    const el = document.getElementById('inv-controls-container');
    if (!el) return;

    // Distinct brands from current data
    const marcas = [...new Set((stateInventario.data || []).map(x => (x.marca || '').trim()).filter(Boolean))].sort();

    const catBadgesHtml = [
        { valor: '', etiqueta: 'Todos', icono: 'apps' },
        ...INV_CATEGORIAS
    ].map(c => {
        const isSel = (stateInventario.categoria || '') === c.valor;
        return `
            <button type="button" onclick="switchInvCat('${c.valor}')" class="px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all ${isSel ? 'bg-primary text-on-primary font-bold shadow-sm' : 'bg-surface-container-high/60 text-on-surface-variant hover:text-white hover:bg-surface-container-high border border-outline-variant/20'}">
                <span class="material-symbols-outlined text-[15px]">${c.icono}</span>
                <span>${c.etiqueta}</span>
            </button>
        `;
    }).join('');

    const hasFilters = Boolean(
        stateInventario.buscar ||
        stateInventario.categoria ||
        stateInventario.marca ||
        stateInventario.estado !== 'todos' ||
        stateInventario.ivaFiltro !== 'todos' ||
        stateInventario.orden !== 'marca_asc'
    );

    el.innerHTML = `
        <!-- Top Row: Category Chips + View Switcher -->
        <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-b border-outline-variant/15 pb-3">
            <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-xs font-semibold text-on-surface-variant mr-1">Categorías:</span>
                ${catBadgesHtml}
            </div>
            
            <div class="flex items-center gap-2 self-end lg:self-auto">
                <div class="flex items-center bg-surface-container-high rounded-xl p-0.5 border border-outline-variant/20">
                    <button type="button" onclick="setInvVista('lista')" class="px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 transition-all ${stateInventario.vista === 'lista' ? 'bg-primary text-on-primary font-bold shadow-sm' : 'text-on-surface-variant hover:text-white'}" title="Vista de Lista">
                        <span class="material-symbols-outlined text-[16px]">view_list</span> Lista
                    </button>
                    <button type="button" onclick="setInvVista('cuadricula')" class="px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 transition-all ${stateInventario.vista === 'cuadricula' ? 'bg-primary text-on-primary font-bold shadow-sm' : 'text-on-surface-variant hover:text-white'}" title="Vista de Cuadrícula / Tarjetas">
                        <span class="material-symbols-outlined text-[16px]">grid_view</span> Cuadrícula
                    </button>
                </div>
            </div>
        </div>

        <!-- Middle Row: Search bar + Select All + Filters -->
        <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            <!-- Search Input -->
            <div class="md:col-span-5 relative">
                <span class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70 text-[20px]">search</span>
                <input type="text" id="buscar-equipo" class="sq-input !py-2 pl-10 pr-8 text-xs w-full rounded-xl bg-surface-container" placeholder="Buscar por marca, modelo, descripción, potencia..." value="${escapeAttr(stateInventario.buscar)}">
                ${stateInventario.buscar ? `<button type="button" onclick="document.getElementById('buscar-equipo').value=''; stateInventario.buscar=''; renderEquiposList(); renderInventarioControls();" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-white"><span class="material-symbols-outlined text-[16px]">close</span></button>` : ''}
            </div>

            <!-- Marca Filter -->
            <div class="md:col-span-3">
                <select class="sq-input !py-2 text-xs rounded-xl bg-surface-container w-full" onchange="setInvFilter('marca', this.value)">
                    <option value="">Todas las marcas</option>
                    ${marcas.map(m => `<option value="${escapeAttr(m)}" ${stateInventario.marca === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
                </select>
            </div>

            <!-- Estado Activo / Inactivo -->
            <div class="md:col-span-2">
                <select class="sq-input !py-2 text-xs rounded-xl bg-surface-container w-full" onchange="setInvFilter('estado', this.value)">
                    <option value="todos" ${stateInventario.estado === 'todos' ? 'selected' : ''}>Todos (Estado)</option>
                    <option value="activos" ${stateInventario.estado === 'activos' ? 'selected' : ''}>Solo Activos</option>
                    <option value="inactivos" ${stateInventario.estado === 'inactivos' ? 'selected' : ''}>Inactivos</option>
                </select>
            </div>

            <!-- Ordenamiento -->
            <div class="md:col-span-2">
                <select class="sq-input !py-2 text-xs rounded-xl bg-surface-container w-full" onchange="setInvFilter('orden', this.value)">
                    <option value="marca_asc" ${stateInventario.orden === 'marca_asc' ? 'selected' : ''}>Marca (A → Z)</option>
                    <option value="marca_desc" ${stateInventario.orden === 'marca_desc' ? 'selected' : ''}>Marca (Z → A)</option>
                    <option value="costo_asc" ${stateInventario.orden === 'costo_asc' ? 'selected' : ''}>Costo menor a mayor</option>
                    <option value="costo_desc" ${stateInventario.orden === 'costo_desc' ? 'selected' : ''}>Costo mayor a menor</option>
                    <option value="recientes" ${stateInventario.orden === 'recientes' ? 'selected' : ''}>Más recientes</option>
                </select>
            </div>
        </div>

        <!-- Bottom Row: Subfilters + Select All + Counter -->
        <div class="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
            <div class="flex items-center gap-3">
                <label class="inline-flex items-center gap-2 cursor-pointer bg-surface-container px-3 py-1.5 rounded-lg border border-outline-variant/15 text-on-surface-variant hover:text-on-surface">
                    <input type="checkbox" id="select-all-equipos" class="w-4 h-4 accent-primary cursor-pointer" onchange="toggleSelectAllEquipos(this.checked)">
                    <span class="font-medium text-[11px] uppercase tracking-wider">Seleccionar todo visible</span>
                </label>

                <!-- IVA filter chip -->
                <div class="flex items-center gap-1 bg-surface-container rounded-lg p-0.5 border border-outline-variant/15">
                    <button type="button" onclick="setInvFilter('ivaFiltro', 'todos')" class="px-2 py-1 rounded text-[11px] ${stateInventario.ivaFiltro === 'todos' ? 'bg-primary/20 text-primary font-bold' : 'text-on-surface-variant hover:text-white'}">Todos IVA</button>
                    <button type="button" onclick="setInvFilter('ivaFiltro', 'con_iva')" class="px-2 py-1 rounded text-[11px] ${stateInventario.ivaFiltro === 'con_iva' ? 'bg-primary/20 text-primary font-bold' : 'text-on-surface-variant hover:text-white'}">Con IVA</button>
                    <button type="button" onclick="setInvFilter('ivaFiltro', 'sin_iva')" class="px-2 py-1 rounded text-[11px] ${stateInventario.ivaFiltro === 'sin_iva' ? 'bg-primary/20 text-primary font-bold' : 'text-on-surface-variant hover:text-white'}">Sin IVA</button>
                </div>
            </div>

            <div class="flex items-center gap-3">
                <div id="inv-filtered-count" class="text-on-surface-variant text-[11px]"></div>
                ${hasFilters ? `
                    <button type="button" onclick="resetInvFilters()" class="text-primary hover:underline text-[11px] font-semibold flex items-center gap-1">
                        <span class="material-symbols-outlined text-[14px]">filter_alt_off</span> Limpiar filtros
                    </button>
                ` : ''}
            </div>
        </div>
    `;

    const buscarInput = document.getElementById('buscar-equipo');
    if (buscarInput) {
        buscarInput.addEventListener('input', (e) => {
            stateInventario.buscar = e.target.value;
            fetchEquiposDebounced();
        });
    }
}

function getFilteredEquipos() {
    let list = [...(stateInventario.data || [])];

    // Categoria
    if (stateInventario.categoria) {
        list = list.filter(e => e.categoria === stateInventario.categoria);
    }

    // Busqueda
    if (stateInventario.buscar?.trim()) {
        const q = stateInventario.buscar.toLowerCase().trim();
        list = list.filter(e => {
            const m = (e.marca || '').toLowerCase();
            const mod = (e.modelo || '').toLowerCase();
            const desc = (e.descripcion || '').toLowerCase();
            const tipo = (e.tipo || '').toLowerCase();
            const pot = `${e.potencia_wp || ''} ${e.potencia_kw || ''} ${e.capacidad_kwh || ''}`;
            return m.includes(q) || mod.includes(q) || desc.includes(q) || tipo.includes(q) || pot.includes(q);
        });
    }

    // Marca
    if (stateInventario.marca) {
        list = list.filter(e => (e.marca || '').trim() === stateInventario.marca);
    }

    // Estado
    if (stateInventario.estado === 'activos') {
        list = list.filter(e => Boolean(e.activo));
    } else if (stateInventario.estado === 'inactivos') {
        list = list.filter(e => !e.activo);
    }

    // IVA
    if (stateInventario.ivaFiltro === 'con_iva') {
        list = list.filter(e => Boolean(e.iva));
    } else if (stateInventario.ivaFiltro === 'sin_iva') {
        list = list.filter(e => !e.iva);
    }

    // Orden
    list.sort((a, b) => {
        if (stateInventario.orden === 'marca_asc') {
            const comp = (a.marca || '').localeCompare(b.marca || '');
            return comp !== 0 ? comp : (a.modelo || '').localeCompare(b.modelo || '');
        }
        if (stateInventario.orden === 'marca_desc') {
            const comp = (b.marca || '').localeCompare(a.marca || '');
            return comp !== 0 ? comp : (b.modelo || '').localeCompare(a.modelo || '');
        }
        if (stateInventario.orden === 'costo_asc') {
            return (Number(a.costo) || 0) - (Number(b.costo) || 0);
        }
        if (stateInventario.orden === 'costo_desc') {
            return (Number(b.costo) || 0) - (Number(a.costo) || 0);
        }
        if (stateInventario.orden === 'recientes') {
            return (b.id || 0) - (a.id || 0);
        }
        return 0;
    });

    return list;
}

function renderEquiposList() {
    const container = document.getElementById('equipos-container');
    if (!container) return;

    const list = getFilteredEquipos();

    // Actualizar contador
    const countEl = document.getElementById('inv-filtered-count');
    if (countEl) {
        countEl.innerHTML = `Mostrando <strong class="text-on-surface">${list.length}</strong> de ${stateInventario.data.length} ítems`;
    }

    // Clean up selectedIds in case some items were filtered out
    syncSelectAllCheckbox();
    updateBulkDeleteUI();

    if (list.length === 0) {
        container.innerHTML = `
            <div class="py-16 text-center bg-surface-container-low/50 border border-outline-variant/15 rounded-2xl p-8 space-y-3">
                <span class="material-symbols-outlined text-5xl text-on-surface-variant/40">inventory_2</span>
                <p class="text-on-surface-variant font-medium text-sm">No se encontraron ítems con los filtros seleccionados.</p>
                <button type="button" onclick="resetInvFilters()" class="sq-btn sq-btn-ghost text-xs border border-primary/30 text-primary">
                    Restablecer filtros
                </button>
            </div>
        `;
        return;
    }

    if (stateInventario.vista === 'cuadricula') {
        renderEquiposGridMode(container, list);
    } else {
        renderEquiposListMode(container, list);
    }
}

function renderEquiposListMode(container, list) {
    const html = `
        <div class="bg-surface-container-low border border-outline-variant/20 rounded-2xl overflow-hidden shadow-sm">
            <div class="overflow-x-auto">
                <table class="w-full text-xs text-left">
                    <thead class="bg-surface-container-high/80 text-on-surface-variant text-[11px] uppercase tracking-wider border-b border-outline-variant/20">
                        <tr>
                            <th class="p-3.5 w-10 text-center">
                                <span class="sr-only">Seleccionar</span>
                            </th>
                            <th class="p-3.5">Equipo / Producto</th>
                            <th class="p-3.5">Categoría</th>
                            <th class="p-3.5">Especificación</th>
                            <th class="p-3.5 text-right">Costo Unit.</th>
                            <th class="p-3.5 text-center">IVA</th>
                            <th class="p-3.5 text-center">Estado</th>
                            <th class="p-3.5 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-outline-variant/10">
                        ${list.map(e => {
                            const isSelected = stateInventario.selectedIds.includes(e.id);
                            let specText = '';
                            if (e.categoria === 'panel') specText = `<span class="font-bold text-primary">${e.potencia_wp || 0} Wp</span> <span class="text-on-surface-variant text-[11px]">(${e.tipo || 'Panel FV'})</span>`;
                            else if (e.categoria === 'inversor') specText = `<span class="font-bold text-primary">${e.potencia_kw || 0} kW</span> <span class="text-on-surface-variant text-[11px]">(${e.tipo || 'Inversor'})</span>`;
                            else if (e.categoria === 'bateria') specText = `<span class="font-bold text-primary">${e.capacidad_kwh || 0} kWh</span> <span class="text-on-surface-variant text-[11px]">(${e.tipo || 'Batería'})</span>`;
                            else specText = `<span class="font-bold text-primary">${e.tipo || '-'}</span> <span class="text-on-surface-variant text-[11px]">(${e.unidad || 'und'})</span>`;

                            const iconName = INV_CATEGORIAS.find(c => c.valor === e.categoria)?.icono || 'inventory_2';
                            const imgHtml = e.imagen_url ?
                                `<img src="${e.imagen_url}" class="w-9 h-9 rounded-lg object-cover border border-outline-variant/30 bg-surface-container flex-shrink-0">` :
                                `<div class="w-9 h-9 bg-surface-container rounded-lg border border-outline-variant/30 text-primary flex items-center justify-center flex-shrink-0">
                                    <span class="material-symbols-outlined text-[18px]">${iconName}</span>
                                </div>`;

                            return `
                                <tr class="hover:bg-surface-container/50 transition-colors ${isSelected ? 'bg-primary/5' : ''} ${e.activo ? '' : 'opacity-60'}">
                                    <td class="p-3.5 text-center">
                                        <input type="checkbox" class="w-4 h-4 accent-primary cursor-pointer" ${isSelected ? 'checked' : ''} onchange="toggleSelectEquipo(${e.id}, this.checked, this)">
                                    </td>
                                    <td class="p-3.5">
                                        <div class="flex items-center gap-3">
                                            ${imgHtml}
                                            <div class="min-w-0">
                                                <div class="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold truncate">${escapeHtml(e.marca || 'Genérico')}</div>
                                                <div class="font-semibold text-on-surface text-sm truncate max-w-xs" title="${escapeAttr(e.modelo)}">${escapeHtml(e.modelo || 'Sin modelo')}</div>
                                                ${e.descripcion ? `<div class="text-[11px] text-on-surface-variant/70 truncate max-w-xs">${escapeHtml(e.descripcion)}</div>` : ''}
                                            </div>
                                        </div>
                                    </td>
                                    <td class="p-3.5 whitespace-nowrap">
                                        <span class="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface font-medium border border-outline-variant/15">
                                            <span class="material-symbols-outlined text-[14px] text-primary">${iconName}</span>
                                            ${etiquetaCategoria(e.categoria)}
                                        </span>
                                    </td>
                                    <td class="p-3.5 whitespace-nowrap">
                                        ${specText}
                                    </td>
                                    <td class="p-3.5 text-right whitespace-nowrap">
                                        <div class="font-bold text-on-surface text-sm">${formatCurrency(e.costo)}</div>
                                        <div class="text-[10px] text-on-surface-variant">por ${escapeHtml(e.unidad || 'und')}</div>
                                    </td>
                                    <td class="p-3.5 text-center whitespace-nowrap">
                                        <button type="button" onclick="toggleIvaEquipo(${e.id}, '${e.categoria}')" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium transition-all ${e.iva ? 'bg-primary/10 border-primary text-primary' : 'bg-surface-container border-outline-variant/30 text-on-surface-variant'}" title="Hacer clic para alternar IVA">
                                            <span class="material-symbols-outlined text-[12px]">${e.iva ? 'check_circle' : 'remove_circle_outline'}</span>
                                            ${e.iva ? '19% IVA' : 'Exento'}
                                        </button>
                                    </td>
                                    <td class="p-3.5 text-center whitespace-nowrap">
                                        <button type="button" onclick="toggleActivoEquipo(${e.id})" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all ${e.activo ? 'bg-success/10 text-success border border-success/30' : 'bg-surface-container text-on-surface-variant/60 border border-outline-variant/20'}" title="Hacer clic para activar o desactivar">
                                            <span class="w-1.5 h-1.5 rounded-full ${e.activo ? 'bg-success' : 'bg-on-surface-variant/60'}"></span>
                                            ${e.activo ? 'Activo' : 'Inactivo'}
                                        </button>
                                    </td>
                                    <td class="p-3.5 text-right whitespace-nowrap">
                                        <div class="flex items-center justify-end gap-1">
                                            <button onclick="duplicarEquipo(${e.id})" class="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors" title="Duplicar ítem">
                                                <span class="material-symbols-outlined text-[17px]">content_copy</span>
                                            </button>
                                            <button onclick="openEquipoModal(${e.id})" class="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant hover:text-white transition-colors" title="Editar ítem">
                                                <span class="material-symbols-outlined text-[17px]">edit</span>
                                            </button>
                                            <button onclick="eliminarEquipo(${e.id})" class="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant hover:text-error transition-colors" title="Eliminar ítem">
                                                <span class="material-symbols-outlined text-[17px]">delete</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    container.innerHTML = html;
}

function renderEquiposGridMode(container, list) {
    const html = `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            ${list.map(e => {
                const isSelected = stateInventario.selectedIds.includes(e.id);
                let specText = '';
                if (e.categoria === 'panel') specText = `<span class="font-bold text-primary">${e.potencia_wp || 0} Wp</span> <span class="text-on-surface-variant">(${e.tipo || 'Panel FV'})</span>`;
                else if (e.categoria === 'inversor') specText = `<span class="font-bold text-primary">${e.potencia_kw || 0} kW</span> <span class="text-on-surface-variant">(${e.tipo || 'Inversor'})</span>`;
                else if (e.categoria === 'bateria') specText = `<span class="font-bold text-primary">${e.capacidad_kwh || 0} kWh</span> <span class="text-on-surface-variant">(${e.tipo || 'Batería'})</span>`;
                else specText = `<span class="font-bold text-primary">${e.tipo || '-'}</span> <span class="text-on-surface-variant">(${e.unidad || 'und'})</span>`;

                const iconName = INV_CATEGORIAS.find(c => c.valor === e.categoria)?.icono || 'inventory_2';
                const imgHtml = e.imagen_url ?
                    `<img src="${e.imagen_url}" class="w-14 h-14 rounded-xl object-cover border border-outline-variant/30 bg-surface-container flex-shrink-0">` :
                    `<div class="w-14 h-14 bg-surface-container rounded-xl border border-outline-variant/30 text-primary flex items-center justify-center flex-shrink-0">
                        <span class="material-symbols-outlined text-2xl">${iconName}</span>
                    </div>`;

                return `
                    <div class="sq-card !p-4 group hover:border-primary/50 border ${isSelected ? 'border-primary bg-primary/5 shadow-md shadow-primary/10' : 'border-outline-variant/20'} transition-all flex flex-col justify-between gap-3 ${e.activo ? '' : 'opacity-60'}">
                        <div>
                            <div class="flex items-start justify-between gap-2 mb-2">
                                <div class="flex items-center gap-2">
                                    <input type="checkbox" class="w-4 h-4 accent-primary cursor-pointer" ${isSelected ? 'checked' : ''} onchange="toggleSelectEquipo(${e.id}, this.checked, this)">
                                    <span class="text-[10px] px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant uppercase tracking-wider font-semibold border border-outline-variant/15 flex items-center gap-1">
                                        <span class="material-symbols-outlined text-[12px] text-primary">${iconName}</span>
                                        ${etiquetaCategoria(e.categoria)}
                                    </span>
                                </div>
                                <div class="flex items-center gap-1">
                                    <button type="button" onclick="toggleActivoEquipo(${e.id})" class="text-[10px] px-2 py-0.5 rounded-full ${e.activo ? 'bg-success/10 text-success' : 'bg-surface-container text-on-surface-variant/60'}" title="Alternar activo">
                                        ${e.activo ? '● Activo' : '○ Inactivo'}
                                    </button>
                                </div>
                            </div>

                            <div class="flex items-center gap-3">
                                ${imgHtml}
                                <div class="min-w-0 flex-1">
                                    <div class="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold truncate">${escapeHtml(e.marca || 'Genérico')}</div>
                                    <div class="font-bold text-on-surface text-sm truncate" title="${escapeAttr(e.modelo)}">${escapeHtml(e.modelo || 'Sin modelo')}</div>
                                    <div class="text-xs mt-0.5">${specText}</div>
                                </div>
                            </div>

                            ${e.descripcion ? `<p class="text-[11px] text-on-surface-variant/80 mt-2.5 line-clamp-2">${escapeHtml(e.descripcion)}</p>` : ''}
                        </div>

                        <div class="pt-3 border-t border-outline-variant/15 flex items-center justify-between gap-2">
                            <div>
                                <div class="text-[10px] text-on-surface-variant uppercase tracking-wider">Costo Compra</div>
                                <div class="font-bold text-base text-primary">${formatCurrency(e.costo)} <span class="text-[10px] font-normal text-on-surface-variant">/${escapeHtml(e.unidad || 'und')}</span></div>
                            </div>
                            <div class="flex items-center gap-1">
                                <button type="button" onclick="toggleIvaEquipo(${e.id}, '${e.categoria}')" class="px-2 py-1 rounded text-[10px] font-medium border ${e.iva ? 'bg-primary/10 border-primary text-primary' : 'bg-surface-container border-outline-variant/30 text-on-surface-variant'}" title="Alternar IVA">
                                    ${e.iva ? '19% IVA' : 'Sin IVA'}
                                </button>
                                <button onclick="duplicarEquipo(${e.id})" class="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors" title="Duplicar">
                                    <span class="material-symbols-outlined text-[17px]">content_copy</span>
                                </button>
                                <button onclick="openEquipoModal(${e.id})" class="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant hover:text-white transition-colors" title="Editar">
                                    <span class="material-symbols-outlined text-[17px]">edit</span>
                                </button>
                                <button onclick="eliminarEquipo(${e.id})" class="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant hover:text-error transition-colors" title="Eliminar">
                                    <span class="material-symbols-outlined text-[17px]">delete</span>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    container.innerHTML = html;
}

function switchInvCat(cat) {
    stateInventario.categoria = cat || '';
    stateInventario.selectedIds = [];
    updateBulkDeleteUI();
    const selectAllCb = document.getElementById('select-all-equipos');
    if (selectAllCb) selectAllCb.checked = false;
    
    renderInventarioControls();
    renderEquiposList();
    renderKPIsInventario();
}

let timeoutEquipos = null;
function fetchEquiposDebounced() {
    clearTimeout(timeoutEquipos);
    timeoutEquipos = setTimeout(fetchEquipos, 250);
}

async function fetchEquipos() {
    try {
        // Obtenemos todo el catalogo para permitir un filtrado, KPIs y ordenamiento super rapido e instantaneo en cliente
        const res = await API.get('/equipos');
        stateInventario.data = res.data || [];
        
        // Clean up selectedIds
        stateInventario.selectedIds = stateInventario.selectedIds.filter(id => stateInventario.data.some(e => e.id === id));
        
        renderKPIsInventario();
        renderInventarioControls();
        renderEquiposList();
    } catch (error) {
        const container = document.getElementById('equipos-container');
        if (container) {
            container.innerHTML = `<div class="col-span-full p-8 text-error text-center">Error cargando inventario: ${error.message}</div>`;
        }
    }
}

async function toggleActivoEquipo(id) {
    const item = stateInventario.data.find(e => e.id === id);
    if (!item) return;
    const newVal = item.activo ? 0 : 1;
    item.activo = newVal;
    try {
        await API.put(`/equipos/${id}`, { activo: newVal });
        renderEquiposList();
        renderKPIsInventario();
        showToast(newVal ? 'Equipo activado' : 'Equipo marcado como inactivo', 'success');
    } catch (e) {
        item.activo = newVal ? 0 : 1;
        renderEquiposList();
        showToast(e.message || 'Error al cambiar estado', 'error');
    }
}

let equipoModalCallback = null;

async function openEquipoModal(id = null, callback = null, defaultCat = null) {
    equipoModalCallback = callback;
    let e = {
        // En la vista TODOS no hay categoría de pestaña; 'producto' es la categoría genérica
        categoria: defaultCat || stateInventario.categoria || 'producto', marca: '', modelo: '', descripcion: '',
        potencia_wp: 0, potencia_kw: 0, capacidad_kwh: 0, tipo: '',
        costo: 0, precio_venta: 0, unidad: 'und', peso_kg: 0, area_m2: 0, activo: 1, imagen_url: '', iva: true
    };

    if (id) {
        try {
            e = await API.get(`/equipos/${id}`);
        } catch (err) {
            showToast('Error cargando ítem', 'error');
            return;
        }
    }

    const importHtml = !id ? `
        <div class="mb-6 p-4 bg-surface-container-low border border-primary/30 rounded-xl">
            <h3 class="font-label-bold text-primary mb-3"><span class="material-symbols-outlined text-sm align-middle mr-1">auto_awesome</span> Autocompletar con IA</h3>
            <div class="flex flex-col md:flex-row gap-3 items-end">
                <div class="flex-1 w-full">
                    <label class="sq-label">URL del producto</label>
                    <input type="url" id="import-url" class="sq-input" placeholder="https://ejemplo.com/producto">
                </div>
                <div class="flex-1 w-full">
                    <label class="sq-label">Ficha Técnica (PDF)</label>
                    <input type="file" id="import-file" class="sq-input py-1 text-sm" accept=".pdf">
                </div>
                <button type="button" onclick="extraerDatosIA()" class="sq-btn bg-primary text-on-primary w-full md:w-auto" id="btn-extract-ia">
                    <span class="material-symbols-outlined">magic_button</span> EXTRAER
                </button>
            </div>
            <div id="import-status" class="text-xs mt-2 hidden"></div>
        </div>
    ` : '';

    const modalHtml = `
        <div class="p-8 fade-in">
            <h2 id="modal-equipo-titulo" data-accion="${id ? 'Editar' : 'Nuevo'}" class="font-headline-md text-headline-md text-on-surface mb-6">${id ? 'Editar' : 'Nuevo'} ${etiquetaCategoria(e.categoria)}</h2>
            ${importHtml}
            <form id="equipo-form" onsubmit="saveEquipo(event, ${id})">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div class="md:col-span-2 flex items-center gap-4 mb-2">
                        <div id="img-preview-container" class="w-16 h-16 rounded border border-outline-variant/50 bg-surface-container-high flex items-center justify-center overflow-hidden flex-shrink-0">
                            ${e.imagen_url ? `<img src="${e.imagen_url}" class="w-full h-full object-cover">` : `<span class="material-symbols-outlined text-on-surface-variant">image</span>`}
                        </div>
                        <div class="flex-1">
                            <label class="sq-label">Foto / Imagen (Opcional)</label>
                            <input type="file" id="file-upload" class="sq-input py-1 text-sm" accept="image/*" onchange="uploadImage(this)">
                            <input type="hidden" name="imagen_url" id="imagen_url" value="${e.imagen_url || ''}">
                        </div>
                    </div>
                    <div>
                        <label class="sq-label">Marca</label>
                        <input type="text" name="marca" class="sq-input" required value="${e.marca}">
                    </div>
                    <div>
                        <label class="sq-label">Modelo / Nombre</label>
                        <input type="text" name="modelo" class="sq-input" required value="${e.modelo}">
                    </div>
                    <div class="md:col-span-2">
                        <label class="sq-label">Descripción</label>
                        <textarea name="descripcion" class="sq-input" rows="2">${e.descripcion}</textarea>
                    </div>
                    <div>
                        <label class="sq-label">Categoría</label>
                        <select name="categoria" id="form-categoria" class="sq-input" onchange="cambiarCategoriaModal(this.value)">
                            ${INV_CATEGORIAS.map(c => `<option value="${c.valor}" ${e.categoria === c.valor ? 'selected' : ''}>${c.etiqueta}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="sq-label">Sub-Tipo (ej. Monocristalino, On-Grid)</label>
                        <input type="text" name="tipo" class="sq-input" value="${e.tipo}">
                    </div>
                    <div>
                        <label class="sq-label">Unidad de medida</label>
                        <input type="text" name="unidad" class="sq-input" value="${e.unidad}">
                    </div>
                    
                    <!-- Campos dinámicos según la categoría seleccionada -->
                    <div id="modal-spec-fields" class="contents"></div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6 border-t border-outline-variant">
                    <div>
                        <label class="sq-label">Costo (Compra) *</label>
                        <input type="text" id="eq-costo-display" class="sq-input" required value="${formatNumber(e.costo)}" oninput="formatCurrencyInput(this)">
                        <input type="hidden" name="costo" id="eq-costo" value="${e.costo}">
                    </div>
                    <div class="flex items-center gap-3 mt-6">
                        <input type="checkbox" name="iva" id="eq-iva" value="1" ${e.iva ? 'checked' : ''} class="w-5 h-5 accent-primary">
                        <label for="eq-iva" class="text-on-surface cursor-pointer">Incluye IVA (19%)</label>
                    </div>
                    <div class="md:col-span-2 flex items-center gap-3 mt-2">
                        <input type="checkbox" name="activo" id="eq-activo" value="1" ${e.activo ? 'checked' : ''} class="w-5 h-5 accent-primary">
                        <label for="eq-activo" class="text-on-surface cursor-pointer">Elemento activo y disponible para cotizar</label>
                    </div>
                </div>

                <div class="flex justify-end gap-3 mt-8 pt-6 border-t border-outline-variant">
                    <button type="button" class="sq-btn sq-btn-ghost" onclick="closeModal()">Cancelar</button>
                    <button type="submit" class="sq-btn sq-btn-primary">Guardar</button>
                </div>
            </form>
        </div>
    `;
    openModal(modalHtml);
    document.getElementById('modal-spec-fields').innerHTML = specFieldsHtml(e.categoria, e);
}

// Campos de especificación que muestra el modal según la categoría elegida
function specFieldsHtml(categoria, vals = {}) {
    const v = (k) => Number(vals[k]) || 0;
    if (categoria === 'panel') {
        return `
            <div><label class="sq-label">Potencia (Wp)</label><input type="number" step="1" name="potencia_wp" class="sq-input" value="${v('potencia_wp')}"></div>
            <div><label class="sq-label">Área (m²)</label><input type="number" step="0.01" name="area_m2" class="sq-input" value="${v('area_m2')}"></div>
            <div><label class="sq-label">Peso (kg)</label><input type="number" step="0.1" name="peso_kg" class="sq-input" value="${v('peso_kg')}"></div>
        `;
    } else if (categoria === 'inversor') {
        return `
            <div><label class="sq-label">Potencia (kW)</label><input type="number" step="0.1" name="potencia_kw" class="sq-input" value="${v('potencia_kw')}"></div>
            <div><label class="sq-label">Peso (kg)</label><input type="number" step="0.1" name="peso_kg" class="sq-input" value="${v('peso_kg')}"></div>
        `;
    } else if (categoria === 'bateria') {
        return `
            <div><label class="sq-label">Capacidad (kWh)</label><input type="number" step="0.1" name="capacidad_kwh" class="sq-input" value="${v('capacidad_kwh')}"></div>
            <div><label class="sq-label">Peso (kg)</label><input type="number" step="0.1" name="peso_kg" class="sq-input" value="${v('peso_kg')}"></div>
        `;
    }
    return '';
}

// Al cambiar la categoría en el modal se refrescan los campos dinámicos conservando valores
function cambiarCategoriaModal(cat) {
    const form = document.getElementById('equipo-form');
    const current = {};
    ['potencia_wp', 'potencia_kw', 'capacidad_kwh', 'peso_kg', 'area_m2'].forEach(k => {
        const el = form.querySelector(`[name="${k}"]`);
        if (el) current[k] = parseFloat(el.value) || 0;
    });
    document.getElementById('modal-spec-fields').innerHTML = specFieldsHtml(cat, current);
    const titulo = document.getElementById('modal-equipo-titulo');
    if (titulo) titulo.textContent = `${titulo.dataset.accion} ${etiquetaCategoria(cat)}`;
}

async function uploadImage(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const res = await fetch('/api/equipos/upload-imagen', { method: 'POST', body: formData });
        const data = await res.json();
        if (res.ok) {
            document.getElementById('imagen_url').value = data.url;
            document.getElementById('img-preview-container').innerHTML = `<img src="${data.url}" class="w-full h-full object-cover">`;
        } else {
            showToast(data.detail || 'Error subiendo imagen', 'error');
        }
    } catch (e) {
        showToast('Error de red al subir imagen', 'error');
    }
}

function formatCurrencyInput(input) {
    // Save cursor position relative to end (to restore after formatting)
    const cursorFromEnd = input.value.length - (input.selectionStart || 0);
    
    // Remove everything that isn't a digit
    let val = input.value.replace(/[^\d]/g, '');
    if (val === '') val = '0';
    const num = parseInt(val, 10);
    
    // Format with Colombian thousands separator (dots)
    const formatted = num.toLocaleString('es-CO', { maximumFractionDigits: 0 });
    input.value = formatted;
    
    // Restore cursor position relative to end
    const newPos = Math.max(0, formatted.length - cursorFromEnd);
    input.setSelectionRange(newPos, newPos);
    
    if (input.id === 'eq-costo-display') {
        document.getElementById('eq-costo').value = num;
    }
}

async function saveEquipo(e, id) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    
    // Parse numbers
    ['potencia_wp', 'potencia_kw', 'capacidad_kwh', 'costo', 'peso_kg', 'area_m2'].forEach(k => {
        data[k] = parseFloat(data[k]) || 0;
    });
    data.activo = fd.get('activo') ? 1 : 0;
    data.iva = fd.get('iva') ? true : false;

    try {
        let createdId = id;
        if (id) {
            await API.put(`/equipos/${id}`, data);
            showToast('Actualizado', 'success');
        } else {
            const res = await API.post('/equipos', data);
            createdId = res.id;
            showToast('Creado', 'success');
        }
        closeModal();
        if (typeof equipoModalCallback === 'function') {
            const cb = equipoModalCallback;
            equipoModalCallback = null;
            await cb({ id: createdId, ...data });
        } else {
            // Refrescar catalogo y mantener categoria si aplica
            if (stateInventario.categoria && data.categoria && data.categoria !== stateInventario.categoria) {
                stateInventario.categoria = data.categoria;
            }
            await fetchEquipos();
        }
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function toggleIvaEquipo(id, categoria) {
    const item = stateInventario.data.find(e => e.id === id);
    if (!item) return;
    const newVal = !item.iva;
    item.iva = newVal;
    API.put(`/equipos/${id}`, { iva: newVal }).then(() => {
        renderEquiposList();
        renderKPIsInventario();
    }).catch(() => {
        item.iva = !newVal;
        renderEquiposList();
        renderKPIsInventario();
    });
}

function eliminarEquipo(id) {
    confirmAction('¿Eliminar este ítem del inventario? Las cotizaciones históricas conservarán sus datos.', async () => {
        try {
            await API.delete(`/equipos/${id}`);
            showToast('Eliminado', 'success');
            // Remove from selected
            stateInventario.selectedIds = stateInventario.selectedIds.filter(x => x !== id);
            updateBulkDeleteUI();
            fetchEquipos();
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}

function toggleSelectEquipo(id, checked, checkboxElem) {
    if (checked) {
        if (!stateInventario.selectedIds.includes(id)) {
            stateInventario.selectedIds.push(id);
        }
    } else {
        stateInventario.selectedIds = stateInventario.selectedIds.filter(x => x !== id);
    }
    syncSelectAllCheckbox();
    updateBulkDeleteUI();
}

function syncSelectAllCheckbox() {
    const selectAllCb = document.getElementById('select-all-equipos');
    if (selectAllCb) {
        const visibleList = getFilteredEquipos();
        if (visibleList.length > 0 && visibleList.every(e => stateInventario.selectedIds.includes(e.id))) {
            selectAllCb.checked = true;
        } else {
            selectAllCb.checked = false;
        }
    }
}

function toggleSelectAllEquipos(checked) {
    const visibleList = getFilteredEquipos();
    if (checked) {
        visibleList.forEach(e => {
            if (!stateInventario.selectedIds.includes(e.id)) {
                stateInventario.selectedIds.push(e.id);
            }
        });
    } else {
        const visibleIds = new Set(visibleList.map(e => e.id));
        stateInventario.selectedIds = stateInventario.selectedIds.filter(id => !visibleIds.has(id));
    }
    updateBulkDeleteUI();
    renderEquiposList();
}

function updateBulkDeleteUI() {
    const btn = document.getElementById('btn-bulk-delete');
    const count = document.getElementById('bulk-delete-count');
    if (btn && count) {
        if (stateInventario.selectedIds.length > 0) {
            count.innerText = stateInventario.selectedIds.length;
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    }
}

function eliminarSeleccionados() {
    if (stateInventario.selectedIds.length === 0) return;
    
    confirmAction(`¿Eliminar ${stateInventario.selectedIds.length} ítems seleccionados? Esta acción no se puede deshacer.`, async () => {
        try {
            await API.post('/equipos/bulk-delete', { ids: stateInventario.selectedIds });
            showToast('Ítems eliminados', 'success');
            stateInventario.selectedIds = [];
            const selectAllCb = document.getElementById('select-all-equipos');
            if (selectAllCb) selectAllCb.checked = false;
            updateBulkDeleteUI();
            fetchEquipos();
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}

async function extraerDatosIA() {
    const urlInput = document.getElementById('import-url').value;
    const fileInput = document.getElementById('import-file').files[0];
    const statusEl = document.getElementById('import-status');
    const btn = document.getElementById('btn-extract-ia');
    const categoria = document.getElementById('form-categoria').value;

    if (!urlInput && !fileInput) {
        showToast('Por favor, ingresa una URL o selecciona un PDF', 'error');
        return;
    }

    statusEl.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin align-middle mr-1">sync</span> Extrayendo datos con IA... esto puede tomar unos segundos.';
    statusEl.className = 'text-xs mt-2 text-primary font-medium block';
    btn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('categoria', categoria);
        if (urlInput) formData.append('url', urlInput);
        if (fileInput) formData.append('file', fileInput);

        // Can't use App.API.post easily with FormData, so use fetch directly
        const response = await fetch('/api/equipos/extract-data', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || 'Error al extraer datos');
        }

        // Fill form fields if they exist
        const form = document.getElementById('equipo-form');
        
        if (data.marca) form.querySelector('[name="marca"]').value = data.marca;
        if (data.modelo) form.querySelector('[name="modelo"]').value = data.modelo;
        if (data.descripcion) form.querySelector('[name="descripcion"]').value = data.descripcion;
        if (data.tipo) form.querySelector('[name="tipo"]').value = data.tipo;
        
        if (data.potencia_wp && form.querySelector('[name="potencia_wp"]')) form.querySelector('[name="potencia_wp"]').value = data.potencia_wp;
        if (data.potencia_kw && form.querySelector('[name="potencia_kw"]')) form.querySelector('[name="potencia_kw"]').value = data.potencia_kw;
        if (data.capacidad_kwh && form.querySelector('[name="capacidad_kwh"]')) form.querySelector('[name="capacidad_kwh"]').value = data.capacidad_kwh;
        if (data.peso_kg && form.querySelector('[name="peso_kg"]')) form.querySelector('[name="peso_kg"]').value = data.peso_kg;
        if (data.area_m2 && form.querySelector('[name="area_m2"]')) form.querySelector('[name="area_m2"]').value = data.area_m2;

        // El costo tiene un campo oculto (valor) y uno visible formateado (millas con puntos)
        if (data.costo && form.querySelector('[name="costo"]')) {
            const costoNum = Math.round(Number(data.costo)) || 0;
            if (costoNum > 0) {
                form.querySelector('[name="costo"]').value = costoNum;
                const display = document.getElementById('eq-costo-display');
                if (display) display.value = costoNum.toLocaleString('es-CO', { maximumFractionDigits: 0 });
            }
        }

        if (data.imagen_url) {
            form.querySelector('[name="imagen_url"]').value = data.imagen_url;
            document.getElementById('img-preview-container').innerHTML = `<img src="${data.imagen_url}" class="w-full h-full object-cover">`;
        }

        statusEl.innerHTML = '<span class="material-symbols-outlined text-sm align-middle mr-1">check_circle</span> Datos extraídos correctamente. Por favor verifica antes de guardar.';
        statusEl.className = 'text-xs mt-2 text-green-500 font-medium block';
        showToast('Datos extraídos', 'success');

    } catch (error) {
        statusEl.innerHTML = '<span class="material-symbols-outlined text-sm align-middle mr-1">error</span> Error: ' + error.message;
        statusEl.className = 'text-xs mt-2 text-error font-medium block';
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

// ── Bulk Import from PDF ──
let importedProducts = [];

function openImportPDFModal() {
    importedProducts = [];
    const modalHtml = `
        <div class="p-8 fade-in" style="max-width:900px;">
            <h2 class="font-headline-md text-headline-md text-on-surface mb-2">Importar Listado de Precios</h2>
            <p class="text-on-surface-variant text-sm mb-6">Sube un PDF con el listado de precios de tu proveedor. La IA identificará los productos, los clasificará como inversores, baterías o paneles, y extraerá los precios automáticamente.</p>

            <div id="import-pdf-upload-section">
                <div class="flex flex-col md:flex-row gap-4 items-end">
                    <div class="flex-1 w-full">
                        <label class="sq-label">Listado de precios (PDF)</label>
                        <input type="file" id="import-pdf-file" class="sq-input py-1 text-sm" accept=".pdf">
                    </div>
                    <button type="button" onclick="procesarPDFMasivo()" class="sq-btn bg-primary text-on-primary w-full md:w-auto" id="btn-procesar-pdf">
                        <span class="material-symbols-outlined">auto_awesome</span> ANALIZAR CON IA
                    </button>
                </div>
                <div id="import-pdf-status" class="text-xs mt-3 hidden"></div>
            </div>

            <div id="import-pdf-results" class="hidden mt-6">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="font-label-bold text-lg text-on-surface">
                        Productos encontrados: <span id="import-count" class="text-primary">0</span>
                    </h3>
                    <div class="flex gap-2">
                        <button type="button" onclick="toggleSelectAllImport()" class="sq-btn sq-btn-ghost text-xs px-3 py-1">
                            <span class="material-symbols-outlined text-sm">select_all</span> Sel. todos
                        </button>
                    </div>
                </div>
                <div class="overflow-x-auto rounded-xl border border-outline-variant/30" style="max-height:400px; overflow-y:auto;">
                    <table class="w-full text-sm">
                        <thead class="bg-surface-container-high sticky top-0">
                            <tr>
                                <th class="p-3 text-left w-8"><input type="checkbox" id="import-select-all" checked onchange="toggleSelectAllImport(this.checked)" class="w-4 h-4 accent-primary"></th>
                                <th class="p-3 text-left">Categoría</th>
                                <th class="p-3 text-left">Marca</th>
                                <th class="p-3 text-left">Modelo</th>
                                <th class="p-3 text-left">Tipo</th>
                                <th class="p-3 text-left">Potencia/Cap.</th>
                                <th class="p-3 text-right">Costo</th>
                            </tr>
                        </thead>
                        <tbody id="import-table-body">
                        </tbody>
                    </table>
                </div>
                <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-outline-variant">
                    <button type="button" class="sq-btn sq-btn-ghost" onclick="closeModal()">Cancelar</button>
                    <button type="button" onclick="confirmarImportacion()" class="sq-btn sq-btn-primary" id="btn-confirmar-import">
                        <span class="material-symbols-outlined">save</span> IMPORTAR SELECCIONADOS
                    </button>
                </div>
            </div>
        </div>
    `;
    openModal(modalHtml);
}

async function procesarPDFMasivo() {
    const fileInput = document.getElementById('import-pdf-file').files[0];
    const statusEl = document.getElementById('import-pdf-status');
    const btn = document.getElementById('btn-procesar-pdf');

    if (!fileInput) {
        showToast('Selecciona un archivo PDF', 'error');
        return;
    }

    statusEl.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin align-middle mr-1">sync</span> Analizando el PDF con IA... esto puede tomar entre 10 y 30 segundos dependiendo del tamaño del listado.';
    statusEl.className = 'text-xs mt-3 text-primary font-medium block';
    btn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('file', fileInput);

        const response = await fetch('/api/equipos/bulk-import-pdf', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Error al procesar el PDF');

        importedProducts = data.productos.map((p, i) => ({ ...p, selected: true, index: i }));

        renderImportTable();

        document.getElementById('import-count').textContent = importedProducts.length;
        document.getElementById('import-pdf-results').classList.remove('hidden');
        document.getElementById('import-pdf-upload-section').classList.add('hidden');

        showToast(`${importedProducts.length} productos encontrados`, 'success');
    } catch (error) {
        statusEl.innerHTML = '<span class="material-symbols-outlined text-sm align-middle mr-1">error</span> ' + error.message;
        statusEl.className = 'text-xs mt-3 text-error font-medium block';
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

function renderImportTable() {
    const tbody = document.getElementById('import-table-body');
    const catIcons = { panel: '☀️', inversor: '⚡', bateria: '🔋' };
    const catColors = { panel: 'text-yellow-400', inversor: 'text-blue-400', bateria: 'text-green-400' };

    tbody.innerHTML = importedProducts.map((p, i) => {
        let specValue = '-';
        if (p.categoria === 'panel' && p.potencia_wp) specValue = `${p.potencia_wp} Wp`;
        else if (p.categoria === 'inversor' && p.potencia_kw) specValue = `${p.potencia_kw} kW`;
        else if (p.categoria === 'bateria' && p.capacidad_kwh) specValue = `${p.capacidad_kwh} kWh`;

        return `
            <tr class="border-t border-outline-variant/20 hover:bg-surface-container-low/50 ${p.selected ? '' : 'opacity-40'}">
                <td class="p-3"><input type="checkbox" ${p.selected ? 'checked' : ''} onchange="toggleImportItem(${i}, this.checked)" class="w-4 h-4 accent-primary"></td>
                <td class="p-3">
                    <select onchange="changeImportCategory(${i}, this.value)" class="bg-transparent border border-outline-variant/30 rounded px-2 py-1 text-xs ${catColors[p.categoria] || ''}">
                        <option value="inversor" ${p.categoria === 'inversor' ? 'selected' : ''}>⚡ Inversor</option>
                        <option value="bateria" ${p.categoria === 'bateria' ? 'selected' : ''}>🔋 Batería</option>
                        <option value="panel" ${p.categoria === 'panel' ? 'selected' : ''}>☀️ Panel</option>
                    </select>
                </td>
                <td class="p-3 font-medium">${p.marca || '-'}</td>
                <td class="p-3">${p.modelo || '-'}</td>
                <td class="p-3 text-on-surface-variant">${p.tipo || '-'}</td>
                <td class="p-3 font-medium">${specValue}</td>
                <td class="p-3 text-right font-medium">${formatCurrency(p.costo || 0)}</td>
            </tr>
        `;
    }).join('');
}

function toggleImportItem(index, checked) {
    importedProducts[index].selected = checked;
}

function toggleSelectAllImport(checked) {
    if (checked === undefined) {
        const cb = document.getElementById('import-select-all');
        checked = !cb.checked;
        cb.checked = checked;
    }
    importedProducts.forEach(p => p.selected = checked);
    renderImportTable();
}

function changeImportCategory(index, newCat) {
    importedProducts[index].categoria = newCat;
}

async function confirmarImportacion() {
    const selected = importedProducts.filter(p => p.selected);
    if (selected.length === 0) {
        showToast('Selecciona al menos un producto', 'error');
        return;
    }

    const btn = document.getElementById('btn-confirmar-import');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> Importando...';

    try {
        const payload = { productos: selected };
        const res = await API.post('/equipos/bulk-create', payload);
        showToast(res.message, 'success');
        closeModal();
        // Con un filtro de categoría específico, mover al filtro de la primera categoría
        // importada para que se vean los ítems; con "TODOS" basta con refrescar la lista.
        if (stateInventario.categoria) {
            const primeraCat = selected.map(p => p.categoria).find(c => c && c !== stateInventario.categoria);
            if (primeraCat) switchInvCat(primeraCat);
            else fetchEquipos();
        } else {
            fetchEquipos();
        }
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined">save</span> IMPORTAR SELECCIONADOS';
    }
}
