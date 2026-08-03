/**
 * SunQuote — Propuestas Module
 */

let statePropuestas = {
    data: [],
    page: 1,
    buscar: '',
    estado: ''
};

async function renderPropuestas() {
    const content = document.getElementById('app-content');
    content.innerHTML = `
        <div class="flex flex-col w-full p-4 lg:p-12 gap-8 fade-in max-w-7xl mx-auto">
            <div class="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
                <div class="flex flex-col gap-3">
                    <span class="font-label-bold text-label-bold text-primary tracking-widest uppercase">Management Console</span>
                    <h1 class="font-display-lg text-display-lg text-on-surface">Proposals Pipeline</h1>
                    <p class="font-body-md text-body-md text-on-surface-variant max-w-xl">Rastrea, gestiona y finaliza acuerdos de instalación solar.</p>
                </div>
            </div>

            <div class="grid grid-cols-12 gap-6 items-center bg-surface-container-low p-4 lg:p-6 rounded-xl">
                <div class="col-span-12 lg:col-span-5 relative">
                    <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                    <input type="text" id="buscar-prop" class="sq-input pl-12" placeholder="Buscar cliente o código PROP-..." value="${statePropuestas.buscar}">
                </div>
                <div class="col-span-12 lg:col-span-4">
                    <select id="filtro-estado" class="sq-input cursor-pointer">
                        <option value="">Todos los Estados</option>
                        <option value="borrador" ${statePropuestas.estado==='borrador'?'selected':''}>Borrador</option>
                        <option value="enviada" ${statePropuestas.estado==='enviada'?'selected':''}>Enviada</option>
                        <option value="firmada" ${statePropuestas.estado==='firmada'?'selected':''}>Firmada</option>
                        <option value="rechazada" ${statePropuestas.estado==='rechazada'?'selected':''}>Rechazada</option>
                    </select>
                </div>
            </div>

            <div class="bg-surface-container rounded-xl shadow-xl overflow-hidden relative">
                <div class="absolute -top-24 -right-24 w-96 h-96 bg-primary/5 blur-[100px] rounded-full pointer-events-none"></div>
                <div id="propuestas-table-container">
                    <div class="p-16 flex justify-center"><div class="sq-spinner"></div></div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('buscar-prop').addEventListener('input', (e) => {
        statePropuestas.buscar = e.target.value;
        statePropuestas.page = 1;
        fetchPropuestasDebounced();
    });

    document.getElementById('filtro-estado').addEventListener('change', (e) => {
        statePropuestas.estado = e.target.value;
        statePropuestas.page = 1;
        fetchPropuestas();
    });

    await fetchPropuestas();
}

let timeoutProps = null;
function fetchPropuestasDebounced() {
    clearTimeout(timeoutProps);
    timeoutProps = setTimeout(fetchPropuestas, 400);
}

async function fetchPropuestas() {
    const container = document.getElementById('propuestas-table-container');
    try {
        let url = `/cotizaciones?page=${statePropuestas.page}`;
        if (statePropuestas.buscar) url += `&buscar=${encodeURIComponent(statePropuestas.buscar)}`;
        if (statePropuestas.estado) url += `&estado=${statePropuestas.estado}`;

        const res = await API.get(url);
        statePropuestas.data = res.data;
        
        if (res.data.length === 0) {
            container.innerHTML = `<div class="p-12 text-center text-on-surface-variant">No se encontraron propuestas.</div>`;
            return;
        }

        const html = `
            <div class="overflow-x-auto">
                <table class="sq-table">
                    <thead>
                        <tr>
                            <th>Cliente</th>
                            <th>Sistema</th>
                            <th>Inversión</th>
                            <th>Fecha</th>
                            <th>Estado</th>
                            <th class="text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${res.data.map(c => `
                            <tr class="group">
                                <td>
                                    <div class="flex items-center gap-3">
                                        <div class="w-10 h-10 rounded bg-surface-container-high flex items-center justify-center text-primary font-headline-md text-[14px]">
                                            ${getInitials(c.cliente_nombre)}
                                        </div>
                                        <div class="flex flex-col">
                                            <span class="font-label-bold text-on-surface">${c.cliente_nombre}</span>
                                            <span class="text-label-sm text-on-surface-variant">${c.codigo}</span>
                                        </div>
                                    </div>
                                </td>
                                <td class="font-label-bold">${c.potencia_kwp} <span class="text-xs text-on-surface-variant font-normal">kWp</span></td>
                                <td class="font-label-bold text-primary">${formatCurrency(c.total_inversion)}</td>
                                <td class="text-on-surface-variant text-sm">${formatDate(c.fecha)}</td>
                                <td>${getStatusBadge(c.estado)}</td>
                                <td class="text-right">
                                    <div class="flex justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                        <button onclick="window.open('/pdf/${c.id}', '_blank')" class="p-2 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-primary" title="Ver PDF">
                                            <span class="material-symbols-outlined text-[20px]">picture_as_pdf</span>
                                        </button>
                                        <button onclick="editarPropuesta(${c.id})" class="p-2 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-primary" title="Editar">
                                            <span class="material-symbols-outlined text-[20px]">edit</span>
                                        </button>
                                        <button onclick="cambiarEstadoModal(${c.id}, '${c.estado}')" class="p-2 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-white" title="Cambiar Estado">
                                            <span class="material-symbols-outlined text-[20px]">swap_horiz</span>
                                        </button>
                                        <button onclick="eliminarPropuesta(${c.id})" class="p-2 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-error" title="Eliminar">
                                            <span class="material-symbols-outlined text-[20px]">delete</span>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="px-6 py-4 bg-surface-container-high/50 flex items-center justify-between border-t border-outline-variant">
                <span class="text-label-sm text-on-surface-variant">Mostrando ${res.data.length} de ${res.total}</span>
                <div class="flex gap-2">
                    <button onclick="changePageProp(-1)" class="sq-btn sq-btn-secondary sq-btn-sm" ${statePropuestas.page === 1 ? 'disabled' : ''}>Anterior</button>
                    <button onclick="changePageProp(1)" class="sq-btn sq-btn-secondary sq-btn-sm" ${res.data.length < res.limit ? 'disabled' : ''}>Siguiente</button>
                </div>
            </div>
        `;
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<div class="p-8 text-error text-center">Error: ${error.message}</div>`;
    }
}

function changePageProp(delta) {
    statePropuestas.page += delta;
    fetchPropuestas();
}

function cambiarEstadoModal(id, actual) {
    openModal(`
        <div class="p-8 fade-in">
            <h2 class="font-headline-md text-on-surface mb-6">Actualizar Estado</h2>
            <div class="flex flex-col gap-3 mb-8">
                ${['borrador', 'enviada', 'firmada', 'rechazada'].map(e => `
                    <label class="flex items-center gap-3 p-4 border border-outline-variant rounded-xl cursor-pointer hover:bg-surface-container-high transition-colors ${e===actual?'bg-surface-container-high border-primary/50':''}">
                        <input type="radio" name="nuevo_estado" value="${e}" ${e===actual?'checked':''} class="accent-primary w-5 h-5">
                        <div class="flex-1">${getStatusBadge(e)}</div>
                    </label>
                `).join('')}
            </div>
            <div class="flex justify-end gap-3">
                <button class="sq-btn sq-btn-ghost" onclick="closeModal()">Cancelar</button>
                <button class="sq-btn sq-btn-primary" onclick="guardarEstado(${id})">Actualizar</button>
            </div>
        </div>
    `, 'md');
}

async function guardarEstado(id) {
    const estado = document.querySelector('input[name="nuevo_estado"]:checked').value;
    try {
        await API.put(`/cotizaciones/${id}/estado`, { estado });
        showToast('Estado actualizado', 'success');
        closeModal();
        fetchPropuestas();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function eliminarPropuesta(id) {
    confirmAction('¿Eliminar esta propuesta permanentemente?', async () => {
        try {
            await API.delete(`/cotizaciones/${id}`);
            showToast('Propuesta eliminada', 'success');
            fetchPropuestas();
        } catch (e) {
            showToast(e.message, 'error');
        }
    });
}

async function editarPropuesta(id) {
    try {
        const cot = await API.get(`/cotizaciones/${id}`);
        App.editCotizacionId = id;
        App.editCotizacionData = cot;
        navigateTo('cotizador');
    } catch (e) {
        showToast('Error al cargar la propuesta', 'error');
    }
}
