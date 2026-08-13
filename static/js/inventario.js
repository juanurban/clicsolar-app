/**
 * SunQuote — Inventario Module
 */

let stateInventario = {
    categoria: 'panel',
    data: [],
    buscar: '',
    selectedIds: []
};

async function renderInventario() {
    const content = document.getElementById('app-content');
    content.innerHTML = `
        <div class="flex flex-col w-full p-4 lg:p-12 gap-8 fade-in max-w-7xl mx-auto">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div class="flex flex-col gap-3">
                    <span class="font-label-bold text-label-bold text-primary tracking-widest uppercase">Base de Datos</span>
                    <h1 class="font-display-lg text-display-lg text-on-surface">Inventario y Costos</h1>
                </div>
                <div class="flex items-center gap-3">
                    <button id="btn-bulk-delete" onclick="eliminarSeleccionados()" class="sq-btn bg-error text-white hidden">
                        <span class="material-symbols-outlined">delete</span> ELIMINAR (<span id="bulk-delete-count">0</span>)
                    </button>
                    <button onclick="openImportPDFModal()" class="sq-btn sq-btn-ghost border border-primary/30">
                        <span class="material-symbols-outlined">upload_file</span> IMPORTAR PDF
                    </button>
                    <button onclick="openEquipoModal()" class="sq-btn sq-btn-primary">
                        <span class="material-symbols-outlined">add</span> NUEVO ÍTEM
                    </button>
                </div>
            </div>

            <div class="flex flex-col lg:flex-row gap-6 items-center bg-surface-container-low p-4 lg:p-6 rounded-xl">
                <div class="sq-tabs w-full lg:w-auto" id="inv-tabs">
                    <button class="sq-tab active" onclick="switchInvCat('panel')">Paneles</button>
                    <button class="sq-tab" onclick="switchInvCat('inversor')">Inversores</button>
                    <button class="sq-tab" onclick="switchInvCat('bateria')">Baterías</button>
                    <button class="sq-tab" onclick="switchInvCat('estructura')">Materiales</button>
                    <button class="sq-tab" onclick="switchInvCat('servicio')">Servicios</button>
                </div>
                <div class="relative w-full lg:flex-1 lg:max-w-md ml-auto flex items-center gap-3">
                    <div class="flex items-center gap-2 mr-2 bg-surface-container-high px-3 py-2 rounded-lg">
                        <input type="checkbox" id="select-all-equipos" class="w-4 h-4 accent-primary cursor-pointer" onchange="toggleSelectAllEquipos(this.checked)" title="Seleccionar todos">
                        <label for="select-all-equipos" class="text-xs text-on-surface-variant cursor-pointer font-label-bold uppercase tracking-wider whitespace-nowrap">Todos</label>
                    </div>
                    <div class="relative flex-1">
                        <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                        <input type="text" id="buscar-equipo" class="sq-input pl-12" placeholder="Buscar marca, modelo..." value="${stateInventario.buscar}">
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" id="equipos-grid">
                <!-- Loaded via JS -->
            </div>
        </div>
    `;

    document.getElementById('buscar-equipo').addEventListener('input', (e) => {
        stateInventario.buscar = e.target.value;
        fetchEquiposDebounced();
    });

    await fetchEquipos();
}

function switchInvCat(cat) {
    stateInventario.categoria = cat;
    stateInventario.selectedIds = [];
    updateBulkDeleteUI();
    const selectAllCb = document.getElementById('select-all-equipos');
    if (selectAllCb) selectAllCb.checked = false;
    document.querySelectorAll('#inv-tabs .sq-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`#inv-tabs button[onclick*="${cat}"]`).classList.add('active');
    fetchEquipos();
}

let timeoutEquipos = null;
function fetchEquiposDebounced() {
    clearTimeout(timeoutEquipos);
    timeoutEquipos = setTimeout(fetchEquipos, 300);
}

async function fetchEquipos() {
    const grid = document.getElementById('equipos-grid');
    grid.innerHTML = `<div class="col-span-full py-12 flex justify-center"><div class="sq-spinner"></div></div>`;
    
    try {
        const res = await API.get(`/equipos?categoria=${stateInventario.categoria}&buscar=${encodeURIComponent(stateInventario.buscar)}`);
        stateInventario.data = res.data;
        
        // Clean up selectedIds in case some items were deleted or filtered out
        stateInventario.selectedIds = stateInventario.selectedIds.filter(id => stateInventario.data.some(e => e.id === id));
        syncSelectAllCheckbox();
        updateBulkDeleteUI();
        
        if (res.data.length === 0) {
            grid.innerHTML = `<div class="col-span-full py-12 text-center text-on-surface-variant">No se encontraron ítems en esta categoría.</div>`;
            return;
        }

        const icons = {
            panel: 'solar_power',
            inversor: 'electric_meter',
            bateria: 'battery_charging_full',
            estructura: 'construction',
            servicio: 'engineering'
        };

        const html = res.data.map(e => {
            let specHtml = '';
            if (e.categoria === 'panel') specHtml = `<div class="font-bold text-primary text-xl">${e.potencia_wp} Wp</div><div class="text-xs text-on-surface-variant">${e.tipo}</div>`;
            else if (e.categoria === 'inversor') specHtml = `<div class="font-bold text-primary text-xl">${e.potencia_kw} kW</div><div class="text-xs text-on-surface-variant">${e.tipo}</div>`;
            else if (e.categoria === 'bateria') specHtml = `<div class="font-bold text-primary text-xl">${e.capacidad_kwh} kWh</div><div class="text-xs text-on-surface-variant">${e.tipo}</div>`;
            else specHtml = `<div class="font-bold text-primary">${e.tipo || '-'}</div><div class="text-xs text-on-surface-variant">Unidad: ${e.unidad}</div>`;

            let imgHtml = e.imagen_url ? 
                `<img src="${e.imagen_url}" class="w-12 h-12 rounded object-cover border border-outline-variant/30 bg-surface-container-highest">` :
                `<div class="p-2 bg-surface-container-high rounded-lg text-primary w-12 h-12 flex items-center justify-center">
                    <span class="material-symbols-outlined">${icons[e.categoria]}</span>
                </div>`;

            let isSelected = stateInventario.selectedIds.includes(e.id);
            return `
                <div class="sq-card relative group hover:border-primary/50 border ${isSelected ? 'border-primary' : 'border-transparent'} transition-colors flex flex-col h-full ${e.activo ? '' : 'opacity-50'}">
                    <div class="absolute -top-3 -left-3 z-10 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity bg-surface-container rounded-full shadow p-1">
                        <input type="checkbox" class="w-5 h-5 accent-primary cursor-pointer" ${isSelected ? 'checked' : ''} onchange="toggleSelectEquipo(${e.id}, this.checked, this)">
                    </div>
                    <div class="flex justify-between items-start mb-6">
                        ${imgHtml}
                        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onclick="openEquipoModal(${e.id})" class="p-1 text-on-surface-variant hover:text-white"><span class="material-symbols-outlined text-[18px]">edit</span></button>
                            <button onclick="eliminarEquipo(${e.id})" class="p-1 text-on-surface-variant hover:text-error"><span class="material-symbols-outlined text-[18px]">delete</span></button>
                        </div>
                    </div>
                    <div class="mb-6 flex-1">
                        <div class="text-xs text-on-surface-variant uppercase tracking-wider mb-2">${e.marca}</div>
                        <div class="font-label-bold text-lg leading-tight mb-3">${e.modelo}</div>
                        ${specHtml}
                    </div>
                    <div class="pt-6 border-t border-outline-variant/30 flex justify-between items-center">
                        <div>
                            <div class="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">Costo</div>
                            <div class="font-body-md">${formatCurrency(e.costo)}</div>
                        </div>
                        <div class="flex items-center gap-1 cursor-pointer" onclick="toggleIvaEquipo(${e.id}, '${e.categoria}')" title="Incluye IVA">
                            <span class="w-4 h-4 rounded-full border-2 flex items-center justify-center ${e.iva ? 'bg-primary border-primary' : 'border-outline-variant'}">
                                ${e.iva ? '<span class="material-symbols-outlined text-on-primary text-[10px]">check</span>' : ''}
                            </span>
                            <span class="text-[10px] ${e.iva ? 'text-primary' : 'text-on-surface-variant'}">IVA</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        grid.innerHTML = html;
    } catch (error) {
        grid.innerHTML = `<div class="col-span-full p-8 text-error text-center">Error: ${error.message}</div>`;
    }
}

async function openEquipoModal(id = null) {
    let e = {
        categoria: stateInventario.categoria, marca: '', modelo: '', descripcion: '',
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

    // Dynamic fields based on category
    let specFields = '';
    if (e.categoria === 'panel') {
        specFields = `
            <div><label class="sq-label">Potencia (Wp)</label><input type="number" step="1" name="potencia_wp" class="sq-input" value="${e.potencia_wp}"></div>
            <div><label class="sq-label">Área (m²)</label><input type="number" step="0.01" name="area_m2" class="sq-input" value="${e.area_m2}"></div>
            <div><label class="sq-label">Peso (kg)</label><input type="number" step="0.1" name="peso_kg" class="sq-input" value="${e.peso_kg}"></div>
        `;
    } else if (e.categoria === 'inversor') {
        specFields = `
            <div><label class="sq-label">Potencia (kW)</label><input type="number" step="0.1" name="potencia_kw" class="sq-input" value="${e.potencia_kw}"></div>
            <div><label class="sq-label">Peso (kg)</label><input type="number" step="0.1" name="peso_kg" class="sq-input" value="${e.peso_kg}"></div>
        `;
    } else if (e.categoria === 'bateria') {
        specFields = `
            <div><label class="sq-label">Capacidad (kWh)</label><input type="number" step="0.1" name="capacidad_kwh" class="sq-input" value="${e.capacidad_kwh}"></div>
            <div><label class="sq-label">Peso (kg)</label><input type="number" step="0.1" name="peso_kg" class="sq-input" value="${e.peso_kg}"></div>
        `;
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
            <h2 class="font-headline-md text-headline-md text-on-surface mb-6">${id ? 'Editar' : 'Nuevo'} ${e.categoria}</h2>
            ${importHtml}
            <form id="equipo-form" onsubmit="saveEquipo(event, ${id})">
                <input type="hidden" name="categoria" id="form-categoria" value="${e.categoria}">
                
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
                        <label class="sq-label">Sub-Tipo (ej. Monocristalino, On-Grid)</label>
                        <input type="text" name="tipo" class="sq-input" value="${e.tipo}">
                    </div>
                    <div>
                        <label class="sq-label">Unidad de medida</label>
                        <input type="text" name="unidad" class="sq-input" value="${e.unidad}">
                    </div>
                    
                    <!-- Dinámico -->
                    ${specFields}
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
        if (id) {
            await API.put(`/equipos/${id}`, data);
            showToast('Actualizado', 'success');
        } else {
            await API.post('/equipos', data);
            showToast('Creado', 'success');
        }
        closeModal();
        fetchEquipos();
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
        fetchEquipos();
    }).catch(() => {
        item.iva = !newVal;
        fetchEquipos();
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
        checkboxElem.closest('.sq-card').classList.add('border-primary');
        checkboxElem.closest('.sq-card').classList.remove('border-transparent');
        checkboxElem.parentElement.classList.remove('opacity-0', 'group-hover:opacity-100');
        checkboxElem.parentElement.classList.add('opacity-100');
    } else {
        stateInventario.selectedIds = stateInventario.selectedIds.filter(x => x !== id);
        checkboxElem.closest('.sq-card').classList.remove('border-primary');
        checkboxElem.closest('.sq-card').classList.add('border-transparent');
        checkboxElem.parentElement.classList.add('opacity-0', 'group-hover:opacity-100');
        checkboxElem.parentElement.classList.remove('opacity-100');
    }
    syncSelectAllCheckbox();
    updateBulkDeleteUI();
}

function syncSelectAllCheckbox() {
    const selectAllCb = document.getElementById('select-all-equipos');
    if (selectAllCb) {
        if (stateInventario.data.length > 0 && stateInventario.selectedIds.length === stateInventario.data.length) {
            selectAllCb.checked = true;
        } else {
            selectAllCb.checked = false;
        }
    }
}

function toggleSelectAllEquipos(checked) {
    if (checked) {
        stateInventario.selectedIds = stateInventario.data.map(e => e.id);
    } else {
        stateInventario.selectedIds = [];
    }
    updateBulkDeleteUI();
    
    document.querySelectorAll('#equipos-grid .sq-card input[type="checkbox"]').forEach(cb => {
        cb.checked = checked;
        const card = cb.closest('.sq-card');
        const container = cb.parentElement;
        if (checked) {
            card.classList.add('border-primary');
            card.classList.remove('border-transparent');
            container.classList.remove('opacity-0', 'group-hover:opacity-100');
            container.classList.add('opacity-100');
        } else {
            card.classList.remove('border-primary');
            card.classList.add('border-transparent');
            container.classList.add('opacity-0', 'group-hover:opacity-100');
            container.classList.remove('opacity-100');
        }
    });
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
        const res = await API.post('/equipos/bulk-create', { productos: selected });
        showToast(res.message, 'success');
        closeModal();
        fetchEquipos();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined">save</span> IMPORTAR SELECCIONADOS';
    }
}
