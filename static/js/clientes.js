/**
 * SunQuote — Clientes Module
 */

let stateClientes = {
    data: [],
    page: 1,
    limit: 10,
    buscar: ''
};

let currentArchivos = [];

async function renderClientes() {
    const content = document.getElementById('app-content');
    content.innerHTML = `
        <div class="flex flex-col w-full p-4 lg:p-12 gap-8 fade-in max-w-7xl mx-auto">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div class="flex flex-col gap-3">
                    <span class="font-label-bold text-label-bold text-primary tracking-widest uppercase">Base de Datos</span>
                    <h1 class="font-display-lg text-display-lg text-on-surface">Gestión de Clientes</h1>
                </div>
                <button onclick="openClienteModal()" class="sq-btn sq-btn-primary">
                    <span class="material-symbols-outlined">person_add</span> NUEVO CLIENTE
                </button>
            </div>

            <div class="bg-surface-container-low p-4 lg:p-6 rounded-xl flex items-center">
                <div class="relative w-full md:w-96">
                    <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                    <input type="text" id="buscar-cliente" class="sq-input pl-12" placeholder="Buscar por nombre, NIT, ciudad..." value="${stateClientes.buscar}">
                </div>
            </div>

            <div class="sq-card p-0 overflow-hidden" id="clientes-table-container">
                <div class="p-16 flex justify-center"><div class="sq-spinner"></div></div>
            </div>
        </div>
    `;

    document.getElementById('buscar-cliente').addEventListener('input', (e) => {
        stateClientes.buscar = e.target.value;
        stateClientes.page = 1;
        fetchClientesDebounced();
    });

    await fetchClientes();
}

let timeoutClientes = null;
function fetchClientesDebounced() {
    clearTimeout(timeoutClientes);
    timeoutClientes = setTimeout(fetchClientes, 400);
}

async function fetchClientes() {
    const container = document.getElementById('clientes-table-container');
    try {
        const res = await API.get(`/clientes?page=${stateClientes.page}&limit=${stateClientes.limit}&buscar=${encodeURIComponent(stateClientes.buscar)}`);
        stateClientes.data = res.data;
        
        if (res.data.length === 0) {
            container.innerHTML = `<div class="p-12 text-center text-on-surface-variant">No se encontraron clientes.</div>`;
            return;
        }

        const html = `
            <div class="overflow-x-auto">
                <table class="sq-table">
                    <thead>
                        <tr>
                            <th>Cliente / Empresa</th>
                            <th>Contacto</th>
                            <th>Ubicación</th>
                            <th>Tarifa / Operador</th>
                            <th>Perfil Energético</th>
                            <th class="text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${res.data.map(c => `
                            <tr>
                                <td>
                                    <div class="flex items-center gap-3">
                                        <div class="w-10 h-10 rounded bg-surface-container-high flex items-center justify-center text-primary font-headline-md text-[14px]">
                                            ${getInitials(c.nombre)}
                                        </div>
                                        <div class="flex flex-col">
                                            <span class="font-label-bold text-on-surface">${c.nombre}</span>
                                            <span class="text-label-sm text-on-surface-variant">${c.cedula_nit || '-'}</span>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div class="flex flex-col">
                                        <span class="text-on-surface text-sm">${c.telefono || '-'}</span>
                                        <span class="text-on-surface-variant text-sm">${c.correo || '-'}</span>
                                    </div>
                                </td>
                                <td>${c.ciudad || '-'}</td>
                                <td>
                                    <div class="flex flex-col">
                                        <span class="text-on-surface">${c.tipo_tarifa}</span>
                                        <span class="text-on-surface-variant text-sm">${c.operador_red || '-'}</span>
                                    </div>
                                </td>
                                <td>
                                    <div class="flex flex-col">
                                        <span class="text-primary font-bold">${formatNumber(c.consumo_mensual_kwh)} kWh/mes</span>
                                        <span class="text-on-surface-variant text-sm">${formatCurrency(c.costo_kwh)} / kWh</span>
                                    </div>
                                </td>
                                <td class="text-right">
                                    <div class="flex justify-end gap-2">
                                        <button onclick="crearCotizacionDesdeCliente(${c.id})" class="p-2 hover:bg-surface-container-high rounded-lg text-primary transition-colors" title="Nueva Cotización">
                                            <span class="material-symbols-outlined">calculate</span>
                                        </button>
                                        <button onclick="openClienteModal(${c.id})" class="p-2 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-white transition-colors" title="Editar">
                                            <span class="material-symbols-outlined">edit</span>
                                        </button>
                                        <button onclick="eliminarCliente(${c.id})" class="p-2 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-error transition-colors" title="Eliminar">
                                            <span class="material-symbols-outlined">delete</span>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <!-- Pagination -->
            <div class="px-6 py-4 bg-surface-container-high/50 flex items-center justify-between border-t border-outline-variant">
                <span class="text-label-sm text-on-surface-variant">Mostrando ${res.data.length} de ${res.total}</span>
                <div class="flex gap-2">
                    <button onclick="changePage(-1)" class="sq-btn sq-btn-secondary sq-btn-sm" ${stateClientes.page === 1 ? 'disabled' : ''}>Anterior</button>
                    <button onclick="changePage(1)" class="sq-btn sq-btn-secondary sq-btn-sm" ${res.data.length < res.limit ? 'disabled' : ''}>Siguiente</button>
                </div>
            </div>
        `;
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<div class="p-8 text-error text-center">Error: ${error.message}</div>`;
    }
}

function changePage(delta) {
    stateClientes.page += delta;
    fetchClientes();
}

async function openClienteModal(id = null) {
    let c = {
        nombre: '', cedula_nit: '', direccion: '', telefono: '', correo: '',
        ciudad: '', operador_red: '', tipo_tarifa: 'Residencial',
        consumo_mensual_kwh: 0, costo_kwh: 0, hsp: 4.2, cargas_especiales_kwh_dia: 0,
        historial_consumo: [], archivos_json: []
    };

    if (id) {
        try {
            c = await API.get(`/clientes/${id}`);
        } catch (e) {
            showToast('Error cargando cliente', 'error');
            return;
        }
    }
    currentArchivos = Array.isArray(c.archivos_json) ? c.archivos_json : [];

    const modalHtml = `
        <div class="p-8 fade-in">
            <h2 class="font-headline-md text-headline-md text-on-surface mb-6">${id ? 'Editar' : 'Nuevo'} Cliente</h2>
            <form id="cliente-form" onsubmit="saveCliente(event, ${id})">
                <div class="sq-tabs mb-6" id="cliente-tabs">
                    <button type="button" class="sq-tab active" onclick="switchClienteTab('datos')">Datos Básicos</button>
                    <button type="button" class="sq-tab" onclick="switchClienteTab('perfil')">Perfil Energético</button>
                    <button type="button" class="sq-tab" onclick="switchClienteTab('archivos')">Archivos Adjuntos</button>
                </div>

                <div id="tab-datos" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="md:col-span-2">
                        <label class="sq-label">Nombre / Razón Social *</label>
                        <input type="text" name="nombre" class="sq-input" required value="${c.nombre}">
                    </div>
                    <div>
                        <label class="sq-label">Cédula / NIT</label>
                        <input type="text" name="cedula_nit" class="sq-input" value="${c.cedula_nit}">
                    </div>
                    <div>
                        <label class="sq-label">Teléfono</label>
                        <input type="text" name="telefono" class="sq-input" value="${c.telefono}">
                    </div>
                    <div>
                        <label class="sq-label">Correo</label>
                        <input type="email" name="correo" class="sq-input" value="${c.correo}">
                    </div>
                    <div>
                        <label class="sq-label">Ciudad</label>
                        <input type="text" name="ciudad" class="sq-input" value="${c.ciudad}">
                    </div>
                    <div class="md:col-span-2">
                        <label class="sq-label">Dirección</label>
                        <input type="text" name="direccion" class="sq-input" value="${c.direccion}">
                    </div>
                </div>

                <div id="tab-perfil" class="hidden grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="sq-label">Operador de Red</label>
                        <input type="text" name="operador_red" class="sq-input" value="${c.operador_red}">
                    </div>
                    <div>
                        <label class="sq-label">Tipo de Tarifa</label>
                        <select name="tipo_tarifa" class="sq-input">
                            <option value="Residencial" ${c.tipo_tarifa==='Residencial'?'selected':''}>Residencial</option>
                            <option value="Comercial" ${c.tipo_tarifa==='Comercial'?'selected':''}>Comercial</option>
                            <option value="Industrial" ${c.tipo_tarifa==='Industrial'?'selected':''}>Industrial</option>
                        </select>
                    </div>
                    
                    <div class="md:col-span-2 bg-surface-container-high p-4 rounded-xl mb-2">
                        <div class="flex justify-between items-center mb-4">
                            <label class="sq-label !mb-0">Consumo Promedio Mensual (kWh)</label>
                            <button type="button" class="sq-btn sq-btn-ghost sq-btn-sm" onclick="toggleHistorial()">
                                Ingresar Historial (Mes a Mes)
                            </button>
                        </div>
                        <input type="number" step="0.1" name="consumo_mensual_kwh" id="inp-consumo" class="sq-input text-lg font-bold text-primary" value="${c.consumo_mensual_kwh}">
                        
                        <div id="historial-grid" class="hidden grid grid-cols-3 md:grid-cols-4 gap-2 mt-4 pt-4 border-t border-outline-variant">
                            ${Array(12).fill(0).map((_,i) => `
                                <div>
                                    <label class="text-[10px] text-on-surface-variant uppercase ml-1">Mes ${i+1}</label>
                                    <input type="number" class="sq-input h-historial" placeholder="kWh" value="${c.historial_consumo[i] || ''}">
                                </div>
                            `).join('')}
                            <div class="col-span-full flex justify-end mt-2">
                                <button type="button" class="sq-btn sq-btn-secondary sq-btn-sm" onclick="calcularPromedio()">Calcular Promedio</button>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label class="sq-label">Costo Actual $/kWh *</label>
                        <input type="number" step="1" name="costo_kwh" class="sq-input" required value="${c.costo_kwh}">
                    </div>
                    <div>
                        <label class="sq-label">Horas Sol Pico (HSP)</label>
                        <input type="number" step="0.1" name="hsp" class="sq-input" value="${c.hsp}">
                    </div>
                    <div class="md:col-span-2">
                        <label class="sq-label">Cargas Especiales Futuras (kWh/día)</label>
                        <input type="number" step="0.1" name="cargas_especiales_kwh_dia" class="sq-input" value="${c.cargas_especiales_kwh_dia}" placeholder="Ej. Carro eléctrico 15 kWh/día">
                    </div>
                </div>

                <div id="tab-archivos" class="hidden flex flex-col gap-4">
                    <div class="bg-surface-container-low border border-outline-variant/30 border-dashed rounded-xl p-6 text-center">
                        <span class="material-symbols-outlined text-4xl text-on-surface-variant mb-2">upload_file</span>
                        <h4 class="font-bold text-on-surface mb-1">Subir Archivos</h4>
                        <p class="text-sm text-on-surface-variant mb-4">Fotos, PDFs de la factura, planos, etc.</p>
                        <input type="file" multiple class="hidden" id="cli-archivos-input" onchange="uploadClientFiles(this)">
                        <button type="button" class="sq-btn sq-btn-secondary sq-btn-sm mx-auto" onclick="document.getElementById('cli-archivos-input').click()">
                            Seleccionar Archivos
                        </button>
                    </div>
                    <div id="cli-archivos-list" class="flex flex-col gap-2 mt-2">
                        <!-- Archivos irán aquí -->
                    </div>
                </div>

                <div class="flex justify-end gap-3 mt-8 pt-6 border-t border-outline-variant">
                    <button type="button" class="sq-btn sq-btn-ghost" onclick="closeModal()">Cancelar</button>
                    <button type="submit" class="sq-btn sq-btn-primary">Guardar Cliente</button>
                </div>
            </form>
        </div>
    `;
    openModal(modalHtml);
    toggleHistorial(true);
    renderClientArchivos();
}

function switchClienteTab(tab) {
    document.querySelectorAll('#cliente-tabs .sq-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`#cliente-tabs button[onclick*="${tab}"]`).classList.add('active');
    
    document.getElementById('tab-datos').classList.add('hidden');
    document.getElementById('tab-perfil').classList.add('hidden');
    document.getElementById('tab-archivos').classList.add('hidden');
    
    document.getElementById(`tab-${tab}`).classList.remove('hidden');
}



async function uploadClientFiles(input) {
    if (!input.files || input.files.length === 0) return;
    showToast('Subiendo archivos...', 'info');
    
    for (const file of input.files) {
        const fd = new FormData();
        fd.append('file', file);
        try {
            const res = await fetch('/api/clientes/upload', { method: 'POST', body: fd });
            if (!res.ok) throw new Error('Error al subir');
            const fileData = await res.json();
            currentArchivos.push(fileData);
        } catch (e) {
            showToast(`Error al subir ${file.name}`, 'error');
        }
    }
    input.value = '';
    renderClientArchivos();
    showToast('Archivos subidos exitosamente', 'success');
}

function removeClientFile(idx) {
    currentArchivos.splice(idx, 1);
    renderClientArchivos();
}

function renderClientArchivos() {
    const list = document.getElementById('cli-archivos-list');
    if (!list) return;
    
    if (currentArchivos.length === 0) {
        list.innerHTML = '<p class="text-sm text-on-surface-variant text-center py-2">No hay archivos adjuntos.</p>';
        return;
    }

    list.innerHTML = currentArchivos.map((a, i) => {
        const isPdf = a.name.toLowerCase().endsWith('.pdf');
        const isImg = a.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/);
        let icon = 'insert_drive_file';
        if (isPdf) icon = 'picture_as_pdf';
        if (isImg) icon = 'image';

        return `
        <div class="flex items-center justify-between bg-surface-container-high p-3 rounded-lg border border-outline-variant/50">
            <div class="flex items-center gap-3 overflow-hidden">
                <span class="material-symbols-outlined text-primary">${icon}</span>
                <a href="${a.url}" target="_blank" class="text-sm text-on-surface hover:text-primary hover:underline truncate">${a.name}</a>
            </div>
            <button type="button" class="p-1 text-on-surface-variant hover:text-error rounded-md hover:bg-surface-container-highest transition-colors" onclick="removeClientFile(${i})">
                <span class="material-symbols-outlined text-lg">close</span>
            </button>
        </div>
        `;
    }).join('');
}

function toggleHistorial(forceShow = false) {
    const grid = document.getElementById('historial-grid');
    if (forceShow || grid.classList.contains('hidden')) {
        grid.classList.remove('hidden');
    } else {
        grid.classList.add('hidden');
    }
}

function calcularPromedio() {
    const inputs = document.querySelectorAll('.h-historial');
    let sum = 0, count = 0;
    inputs.forEach(inp => {
        const val = parseFloat(inp.value);
        if (!isNaN(val)) { sum += val; count++; }
    });
    if (count > 0) {
        document.getElementById('inp-consumo').value = (sum / count).toFixed(1);
        showToast('Promedio calculado', 'success');
    }
}

async function saveCliente(e, id) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    
    // Parse numbers
    ['consumo_mensual_kwh', 'costo_kwh', 'hsp', 'cargas_especiales_kwh_dia'].forEach(k => {
        data[k] = parseFloat(data[k]) || 0;
    });

    // Gather historial
    const historial = [];
    document.querySelectorAll('.h-historial').forEach(inp => {
        const val = parseFloat(inp.value);
        if (!isNaN(val)) historial.push(val);
    });
    data.historial_consumo = historial;
    data.archivos_json = currentArchivos;

    try {
        let res;
        if (id) {
            res = await API.put(`/clientes/${id}`, data);
            showToast('Cliente actualizado', 'success');
        } else {
            res = await API.post('/clientes', data);
            showToast('Cliente creado', 'success');
        }
        const targetId = id || (res ? res.id : null);
        if (typeof stateCotizador !== 'undefined' && stateCotizador.clienteSelected && stateCotizador.clienteSelected.id === targetId) {
            selectCliente(targetId);
        }
        closeModal();
        fetchClientes();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function eliminarCliente(id) {
    confirmAction('¿Estás seguro de eliminar este cliente? Esto no se puede deshacer.', async () => {
        try {
            await API.delete(`/clientes/${id}`);
            showToast('Cliente eliminado', 'success');
            fetchClientes();
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}

function crearCotizacionDesdeCliente(id) {
    // Save to App state and jump to cotizador
    App.selectedClienteId = id;
    navigateTo('cotizador');
}
