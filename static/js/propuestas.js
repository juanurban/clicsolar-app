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
                    <input type="text" id="buscar-prop" class="sq-input pl-12" placeholder="Buscar cliente, código PROP- o título (p. ej. aires)" value="${statePropuestas.buscar}">
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
                                            <span class="text-label-sm text-on-surface-variant">${c.codigo}${c.titulo ? ` <span class="text-primary">· ${escaparHtml(c.titulo)}</span>` : ''}</span>
                                        </div>
                                    </div>
                                </td>
                                <td class="font-label-bold">${c.potencia_kwp} <span class="text-xs text-on-surface-variant font-normal">kWp</span></td>
                                <td class="font-label-bold text-primary">${formatCurrency(c.total_inversion)}</td>
                                <td class="text-on-surface-variant text-sm">${formatDate(c.fecha)}</td>
                                <td>${getStatusBadge(c.estado)}</td>
                                <td class="text-right">
                                    <div class="flex justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                        <button onclick="window.open('/pdf/${c.id}', '_blank')" class="p-2 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-primary" title="Ver / Descargar PDF">
                                            <span class="material-symbols-outlined text-[20px]">picture_as_pdf</span>
                                        </button>
                                        <button onclick="editarPropuesta(${c.id})" class="p-2 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-primary" title="Editar">
                                            <span class="material-symbols-outlined text-[20px]">edit</span>
                                        </button>
                                        <button onclick="clonarPropuesta(${c.id})" class="p-2 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-primary" title="Clonar con un título nuevo (otra configuración para el mismo cliente)">
                                            <span class="material-symbols-outlined text-[20px]">content_copy</span>
                                        </button>
                                        <button onclick="renombrarPropuesta(${c.id})" class="p-2 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-white" title="Editar el título del consecutivo">
                                            <span class="material-symbols-outlined text-[20px]">title</span>
                                        </button>
                                        ${c.estado === 'firmada' ? `<button onclick="crearInstalacionDesdePropuesta(${c.id})" class="p-2 hover:bg-primary/10 rounded-lg text-primary" title="Crear instalación desde esta cotización firmada">
                                            <span class="material-symbols-outlined text-[20px]">solar_power</span>
                                        </button>` : ''}
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

// ══════════════ CLONAR Y TÍTULO DE LA PROPUESTA ══════════════
// El título acompaña al consecutivo (PROP-0007 · Con aires acondicionados) para
// que un mismo cliente pueda llevar varias propuestas con configuraciones
// distintas sin confundirlas al descargar el PDF ni al listarlas.
const SUGERENCIAS_TITULO = [
    'Consumo actual con ventiladores',
    'Con aires acondicionados',
    'Con batería',
    'Ampliación fase 2'
];

function escaparHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, caracter => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[caracter]));
}

function propuestaEnLista(id) {
    return statePropuestas.data.find(c => Number(c.id) === Number(id)) || {};
}

function clonarPropuesta(id) { abrirModalTitulo(id, 'clonar'); }
function renombrarPropuesta(id) { abrirModalTitulo(id, 'renombrar'); }

// Contexto del modal de título: se guarda porque las sugerencias rápidas y la
// vista previa necesitan saber si están clonando (consecutivo aún desconocido) o
// renombrando una propuesta existente.
let modalTituloContexto = { id: null, esClon: true };

function abrirModalTitulo(id, modo) {
    const c = propuestaEnLista(id);
    const esClon = modo === 'clonar';
    const guardar = esClon ? 'ejecutarClonPropuesta' : 'guardarTituloPropuesta';
    modalTituloContexto = { id: Number(id), esClon };

    openModal(`
        <div class="p-8 fade-in">
            <div class="sq-modal-header">
                <div>
                    <h2 class="font-headline-md text-on-surface leading-tight">${esClon ? 'Clonar propuesta' : 'Título de la propuesta'}</h2>
                    <p class="text-sm text-on-surface-variant mt-1">${esClon
                        ? `Se creará una copia en borrador de <b>${escaparHtml(c.codigo || '')}${c.titulo ? ' · ' + escaparHtml(c.titulo) : ''}</b> con su propio consecutivo.`
                        : `El título se muestra al lado del consecutivo <b>${escaparHtml(c.codigo || '')}</b> en la lista y en el PDF.`}</p>
                </div>
                <button type="button" class="sq-modal-close" onclick="closeModal()" title="Cerrar" aria-label="Cerrar">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>

            <label class="sq-label" for="prop-titulo">Título ${esClon ? 'de la nueva propuesta' : 'actual'}</label>
            <input type="text" id="prop-titulo" class="sq-input" maxlength="120" autocomplete="off"
                placeholder="Ej. Con aires acondicionados"
                value="${escaparHtml(esClon ? '' : (c.titulo || ''))}"
                oninput="pintarPreviaTitulo()"
                onkeydown="if (event.key === 'Enter') { event.preventDefault(); ${guardar}(${id}); }">
            <div class="flex flex-wrap gap-2 mt-3">
                ${SUGERENCIAS_TITULO.map(sugerencia => `
                    <button type="button" class="sq-btn sq-btn-ghost sq-btn-sm" data-titulo="${escaparHtml(sugerencia)}" onclick="usarSugerenciaTitulo(this)">${escaparHtml(sugerencia)}</button>
                `).join('')}
            </div>
            <p id="prop-titulo-previa" class="text-xs text-on-surface-variant mt-4"></p>

            ${esClon ? `
            <label class="flex items-center gap-3 mt-5 p-4 border border-outline-variant rounded-xl cursor-pointer hover:bg-surface-container-high">
                <input type="checkbox" id="prop-abrir" class="accent-primary w-5 h-5" checked>
                <span class="text-sm text-on-surface">Abrir la copia ahora para ajustar paneles, inversor y equipos</span>
            </label>` : ''}

            <div class="sq-modal-footer">
                <button type="button" class="sq-btn sq-btn-ghost" onclick="closeModal()">Cancelar</button>
                <button type="button" id="btn-confirmar-titulo" class="sq-btn sq-btn-primary" onclick="${guardar}(${id})">
                    ${esClon ? 'Clonar propuesta' : 'Guardar título'}
                </button>
            </div>
        </div>
    `, 'lg');

    document.getElementById('prop-titulo').focus();
    pintarPreviaTitulo();
}

function usarSugerenciaTitulo(boton) {
    const campo = document.getElementById('prop-titulo');
    if (!campo) return;
    campo.value = boton.dataset.titulo || '';
    campo.focus();
    pintarPreviaTitulo();
}

// Muestra cómo quedará el consecutivo, que es donde el usuario distingue una
// propuesta de otra cuando el cliente tiene varias.
function pintarPreviaTitulo() {
    const previa = document.getElementById('prop-titulo-previa');
    const campo = document.getElementById('prop-titulo');
    if (!previa || !campo) return;
    const { id, esClon } = modalTituloContexto;
    const codigo = esClon ? 'PROP-XXXX (nuevo)' : (propuestaEnLista(id).codigo || '');
    const titulo = campo.value.trim();
    previa.innerHTML = titulo
        ? `Así se verá: <b class="text-on-surface">${escaparHtml(codigo)}</b> <span class="text-primary">· ${escaparHtml(titulo)}</span>`
        : `Así se verá: <b class="text-on-surface">${escaparHtml(codigo)}</b> (sin título)`;
}

async function ejecutarClonPropuesta(id) {
    const campo = document.getElementById('prop-titulo');
    const titulo = (campo ? campo.value : '').trim();
    const abrir = document.getElementById('prop-abrir')?.checked !== false;
    const boton = document.getElementById('btn-confirmar-titulo');
    if (boton) boton.disabled = true;

    try {
        const nueva = await API.post(`/cotizaciones/${id}/clonar`, { titulo });
        showToast(nueva.message || 'Propuesta clonada', 'success');
        closeModal();
        if (abrir) {
            // Se entra al asistente con la copia ya guardada: cualquier ajuste se
            // guarda sobre el clon, nunca sobre la propuesta original.
            const cot = await API.get(`/cotizaciones/${nueva.id}`);
            App.editCotizacionId = nueva.id;
            App.editCotizacionData = cot;
            navigateTo('cotizador');
            return;
        }
        await fetchPropuestas();
    } catch (e) {
        showToast(e.message, 'error');
        if (boton) boton.disabled = false;
    }
}

async function guardarTituloPropuesta(id) {
    const campo = document.getElementById('prop-titulo');
    const titulo = (campo ? campo.value : '').trim();
    const boton = document.getElementById('btn-confirmar-titulo');
    if (boton) boton.disabled = true;

    try {
        const res = await API.put(`/cotizaciones/${id}/titulo`, { titulo });
        showToast(res.message || 'Título actualizado', 'success');
        closeModal();
        await fetchPropuestas();
    } catch (e) {
        showToast(e.message, 'error');
        if (boton) boton.disabled = false;
    }
}


async function crearInstalacionDesdePropuesta(id) {
    const c = propuestaEnLista(id);
    const nombre = `Instalación ${c.codigo || 'PROP-'+id}${c.titulo ? ' · '+c.titulo : ''} - ${c.cliente_nombre || ''}`;
    confirmAction(`¿Crear instalación desde la cotización <b>${escaparHtml(c.codigo || '')}${c.titulo ? ' · '+escaparHtml(c.titulo):''}</b>?<br><small class="text-on-surface-variant">Se iniciará el seguimiento con los 12 pasos de instalación.</small>`, async () => {
        try {
            const res = await API.post('/proyectos', { cotizacion_id: id, nombre });
            showToast(res.message || 'Instalación creada', 'success');
            if (res.id) {
                window.location.hash = '#proyectos/' + res.id;
            } else {
                navigateTo('proyectos');
            }
        } catch (e) {
            if (String(e.message||'').includes('ya existe') || String(e.message||'').includes('UNIQUE')) {
                showToast('Esta cotización ya tiene una instalación asociada', 'info');
                navigateTo('proyectos');
            } else {
                showToast(e.message || 'No se pudo crear la instalación', 'error');
            }
        }
    });
}
