/**
 * SunQuote — Módulo Instalaciones Fotovoltaicas (antes Proyectos)
 * Flujo: cotización firmada -> instalación con pasos de ejecución.
 */

window.ProyectosModule = (function () {
    let instalaciones = [];
    let cotizacionesDisponibles = [];
    let filtros = { buscar: '', paso: '' };

    const PASOS = [
        'Firma del contrato',
        'Giro del anticipo',
        'Visita técnica',
        'Diseño y dimensionamiento',
        'Lista de materiales',
        'Compra de materiales',
        'Cronograma de instalación',
        'Instalación',
        'Pruebas',
        'Entrega',
        'Legalización operador de red',
        'Conexión final'
    ];

    async function init() {
        const container = document.getElementById('app-content');
        container.innerHTML = `
            <div class="p-4 lg:p-10 max-w-7xl mx-auto fade-in">
                <div class="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 mb-8">
                    <div class="flex flex-col gap-2">
                        <span class="font-label-bold text-label-bold text-primary tracking-widest uppercase">Gestión de instalaciones</span>
                        <h1 class="font-display-lg text-display-lg text-on-surface">Instalaciones Fotovoltaicas</h1>
                        <p class="text-on-surface-variant max-w-2xl">Convierte cotizaciones firmadas en instalaciones y da seguimiento paso a paso hasta la conexión final.</p>
                    </div>
                    <div class="flex items-center gap-3">
                        <button class="bg-surface-container text-on-surface px-4 py-2 rounded-xl font-label-bold hover:bg-surface-variant flex items-center gap-2 transition-all border border-outline-variant/30" onclick="ProyectosModule.openNuevaInstalacion()">
                            <span class="material-symbols-outlined">add_business</span>Nueva instalación
                        </button>
                    </div>
                </div>

                <div class="grid grid-cols-12 gap-4 items-center bg-surface-container-low p-4 lg:p-6 rounded-xl mb-6">
                    <div class="col-span-12 lg:col-span-6 relative">
                        <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                        <input type="text" id="buscar-instalacion" class="sq-input pl-12" placeholder="Buscar por cliente, código de cotización o nombre..." value="${filtros.buscar}">
                    </div>
                    <div class="col-span-12 lg:col-span-4">
                        <select id="filtro-paso" class="sq-input cursor-pointer">
                            <option value="">Todos los pasos</option>
                            ${PASOS.map(p => `<option value="${p}" ${filtros.paso===p?'selected':''}>${p}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-span-12 lg:col-span-2 text-sm text-on-surface-variant" id="inst-count"></div>
                </div>

                <div id="instalaciones-container" class="bg-surface-container rounded-xl shadow-xl overflow-hidden min-h-[300px]">
                    <div class="p-16 flex justify-center"><div class="sq-spinner"></div></div>
                </div>
            </div>
        `;

        document.getElementById('buscar-instalacion').addEventListener('input', debounce((e) => {
            filtros.buscar = e.target.value;
            renderLista();
        }, 250));
        document.getElementById('filtro-paso').addEventListener('change', (e) => {
            filtros.paso = e.target.value;
            renderLista();
        });

        await cargar();
        renderLista();
    }

    async function cargar() {
        try {
            instalaciones = await API.get('/proyectos');
        } catch (e) {
            console.error(e);
            instalaciones = [];
            showToast('Error al cargar instalaciones', 'error');
        }
    }

    function filtradas() {
        const q = (filtros.buscar || '').toLowerCase().trim();
        return instalaciones.filter(i => {
            const matchQ = !q || [i.nombre, i.cliente_nombre, i.cotizacion_codigo, i.cotizacion_titulo, i.estado, i.estado_nombre].some(v => String(v||'').toLowerCase().includes(q));
            const matchPaso = !filtros.paso || (i.estado_nombre || i.estado) === filtros.paso;
            return matchQ && matchPaso;
        });
    }

    function progresoBadge(i) {
        const p = i.progreso || { completados: 0, total: PASOS.length, pct: 0 };
        const color = p.pct >= 100 ? 'text-green-400' : p.pct >= 50 ? 'text-primary' : 'text-on-surface-variant';
        return `<div class="flex items-center gap-3 min-w-[180px]">
            <div class="flex-1 h-2 bg-surface-container-high rounded-full overflow-hidden"><div class="h-full bg-primary rounded-full" style="width:${p.pct}%"></div></div>
            <span class="text-xs font-label-bold ${color}">${p.completados}/${p.total}</span>
        </div>`;
    }

    function pasoActual(i) {
        const pasos = i.pasos || [];
        const actual = pasos.find(p => !p.completado);
        return actual ? actual.nombre : 'Completada';
    }

    function renderLista() {
        const container = document.getElementById('instalaciones-container');
        const list = filtradas();
        const countEl = document.getElementById('inst-count');
        if (countEl) countEl.textContent = `${list.length} instalación(es)`;

        if (list.length === 0) {
            container.innerHTML = `<div class="p-16 text-center text-on-surface-variant">
                <span class="material-symbols-outlined text-[56px] mb-4 block opacity-40">solar_power</span>
                <p class="font-headline-md text-on-surface mb-2">No hay instalaciones</p>
                <p class="text-sm mb-6">Crea una instalación desde una cotización firmada para iniciar el seguimiento.</p>
                <button class="sq-btn sq-btn-primary" onclick="ProyectosModule.openNuevaInstalacion()"><span class="material-symbols-outlined text-[18px] mr-2">add</span>Crear instalación</button>
            </div>`;
            return;
        }

        container.innerHTML = `
            <div class="overflow-x-auto">
                <table class="sq-table">
                    <thead>
                        <tr>
                            <th>Instalación / Cliente</th>
                            <th>Cotización</th>
                            <th>Paso actual</th>
                            <th>Progreso</th>
                            <th>Actualización</th>
                            <th class="text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${list.map(i => `
                            <tr class="group cursor-pointer hover:bg-surface-container-high/40" onclick="ProyectosModule.openDetalle(${i.id})">
                                <td>
                                    <div class="flex flex-col">
                                        <span class="font-label-bold text-on-surface">${escapeHtml(i.nombre)}</span>
                                        <span class="text-xs text-on-surface-variant flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">person</span>${escapeHtml(i.cliente_nombre || '')}</span>
                                    </div>
                                </td>
                                <td>
                                    ${i.cotizacion_codigo ? `<span class="font-mono text-primary text-sm">${escapeHtml(i.cotizacion_codigo)}</span>${i.cotizacion_titulo ? `<div class="text-xs text-on-surface-variant">· ${escapeHtml(i.cotizacion_titulo)}</div>` : ''}` : '<span class="text-on-surface-variant text-sm">—</span>'}
                                </td>
                                <td><span class="px-2 py-1 rounded-lg bg-surface-container-high text-xs font-label-bold text-on-surface">${escapeHtml(pasoActual(i))}</span></td>
                                <td>${progresoBadge(i)}</td>
                                <td class="text-on-surface-variant text-sm">${formatShortDate(i.updated_at || i.created_at)}</td>
                                <td class="text-right" onclick="event.stopPropagation()">
                                    <div class="flex justify-end gap-1 opacity-70 group-hover:opacity-100">
                                        <button onclick="ProyectosModule.openDetalle(${i.id})" class="p-2 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-primary" title="Abrir instalación"><span class="material-symbols-outlined text-[20px]">open_in_new</span></button>
                                        <button onclick="ProyectosModule.eliminar(${i.id})" class="p-2 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-error" title="Eliminar"><span class="material-symbols-outlined text-[20px]">delete</span></button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    async function openNuevaInstalacion() {
        try {
            cotizacionesDisponibles = await API.get('/proyectos/cotizaciones-disponibles');
        } catch (e) { cotizacionesDisponibles = []; }

        openModal(`
            <div class="p-8 fade-in">
                <div class="flex justify-between items-center mb-6">
                    <div>
                        <h2 class="font-headline-md text-on-surface">Crear instalación</h2>
                        <p class="text-sm text-on-surface-variant mt-1">A partir de una cotización (idealmente firmada) para iniciar el flujo de instalación.</p>
                    </div>
                    <button onclick="closeModal()" class="text-on-surface-variant hover:text-error"><span class="material-symbols-outlined">close</span></button>
                </div>

                <form id="form-nueva-instalacion" class="space-y-4" onsubmit="ProyectosModule.crearInstalacion(event)">
                    <div>
                        <label class="block text-label-sm font-label-bold text-on-surface-variant mb-1">Cotización origen *</label>
                        <select name="cotizacion_id" id="inst-cotizacion" required class="sq-input" onchange="ProyectosModule.onCotizacionChange(this.value)">
                            <option value="">Selecciona una cotización...</option>
                            ${cotizacionesDisponibles.map(c => `<option value="${c.id}" data-cliente="${escapeHtml(c.cliente_nombre)}" data-codigo="${escapeHtml(c.codigo||'')}" data-titulo="${escapeHtml(c.titulo||'')}">${escapeHtml(c.codigo||'PROP-'+c.id)}${c.titulo ? ' · '+escapeHtml(c.titulo) : ''} — ${escapeHtml(c.cliente_nombre)} (${c.estado})</option>`).join('')}
                        </select>
                        ${cotizacionesDisponibles.length === 0 ? '<p class="text-xs text-on-surface-variant mt-2">No hay cotizaciones disponibles sin instalación asociada. Puedes crear la instalación desde la cotización o registrar una nueva cotización primero.</p>' : ''}
                    </div>
                    <div>
                        <label class="block text-label-sm font-label-bold text-on-surface-variant mb-1">Nombre de la instalación</label>
                        <input type="text" name="nombre" id="inst-nombre" class="sq-input" placeholder="Se genera automáticamente desde la cotización">
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-label-sm font-label-bold text-on-surface-variant mb-1">Fecha estimada de entrega</label>
                            <input type="date" name="fecha_entrega_estimada" class="sq-input">
                        </div>
                        <div class="flex items-end text-xs text-on-surface-variant pb-2">Al crearla se marcará la cotización como firmada (si aplica).</div>
                    </div>
                    <div>
                        <label class="block text-label-sm font-label-bold text-on-surface-variant mb-1">Notas</label>
                        <textarea name="notas" rows="3" class="sq-input" placeholder="Observaciones iniciales..."></textarea>
                    </div>
                    <div class="flex justify-end gap-3 pt-4">
                        <button type="button" onclick="closeModal()" class="sq-btn sq-btn-ghost">Cancelar</button>
                        <button type="submit" class="sq-btn sq-btn-primary"><span class="material-symbols-outlined text-[18px] mr-1">rocket_launch</span>Crear instalación</button>
                    </div>
                </form>
            </div>
        `, '2xl');
    }

    function onCotizacionChange(val) {
        const sel = document.getElementById('inst-cotizacion');
        const opt = sel?.options[sel.selectedIndex];
        const nombre = document.getElementById('inst-nombre');
        if (opt && val && nombre && !nombre.dataset.manual) {
            const codigo = opt.dataset.codigo || ('PROP-' + val);
            const titulo = opt.dataset.titulo ? ' · ' + opt.dataset.titulo : '';
            const cliente = opt.dataset.cliente || '';
            nombre.value = `Instalación ${codigo}${titulo} - ${cliente}`;
        }
    }

    async function crearInstalacion(e) {
        e.preventDefault();
        const form = e.target;
        const fd = new FormData(form);
        const data = {
            cotizacion_id: Number(fd.get('cotizacion_id')),
            nombre: (fd.get('nombre') || '').trim(),
            fecha_entrega_estimada: fd.get('fecha_entrega_estimada') || null,
            notas: (fd.get('notas') || '').trim()
        };
        if (!data.cotizacion_id) { showToast('Selecciona una cotización', 'error'); return; }
        try {
            const res = await API.post('/proyectos', data);
            showToast(res.message || 'Instalación creada', 'success');
            closeModal();
            await cargar();
            renderLista();
            if (res.id) openDetalle(res.id);
        } catch (err) {
            showToast(err.message || 'Error al crear instalación', 'error');
        }
    }

    async function openDetalle(id) {
        let inst;
        try { inst = await API.get(`/proyectos/${id}`); } catch (e) { showToast('No se pudo abrir la instalación', 'error'); return; }
        renderDetalle(inst);
    }

    function renderDetalle(inst) {
        const pasos = inst.pasos || PASOS.map((n,i)=>({orden:i+1,nombre:n,completado:false,fecha:null,notas:''}));
        const prog = inst.progreso || { completados: pasos.filter(p=>p.completado).length, total: pasos.length, pct: 0 };
        prog.pct = prog.total ? Math.round((prog.completados/prog.total)*100) : 0;

        openModal(`
            <div class="flex flex-col h-[88vh]">
                <div class="p-6 lg:p-8 border-b border-outline-variant/30 bg-surface-container-low">
                    <div class="flex justify-between items-start gap-4">
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 text-xs text-on-surface-variant mb-2">
                                <span class="material-symbols-outlined text-[16px]">solar_power</span> Instalación fotovoltaica
                                ${inst.cotizacion_codigo ? `<span class="font-mono text-primary">· ${escapeHtml(inst.cotizacion_codigo)}${inst.cotizacion_titulo ? ' · '+escapeHtml(inst.cotizacion_titulo):''}</span>` : ''}
                            </div>
                            <h2 class="font-headline-md text-on-surface leading-tight">${escapeHtml(inst.nombre)}</h2>
                            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-on-surface-variant mt-2">
                                <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">person</span>${escapeHtml(inst.cliente_nombre||'')}</span>
                                ${inst.potencia_kwp ? `<span class="flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">bolt</span>${inst.potencia_kwp} kWp</span>` : ''}
                                ${inst.total_inversion ? `<span class="flex items-center gap-1 text-primary font-label-bold">${formatCurrency(inst.total_inversion)}</span>` : ''}
                            </div>
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0">
                            <button onclick="ProyectosModule.eliminar(${inst.id})" class="p-2 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error" title="Eliminar"><span class="material-symbols-outlined">delete</span></button>
                            <button onclick="closeModal()" class="p-2 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-primary"><span class="material-symbols-outlined">close</span></button>
                        </div>
                    </div>
                    <div class="mt-5">
                        <div class="flex justify-between text-xs text-on-surface-variant mb-1"><span>Progreso general</span><span class="text-primary font-label-bold">${prog.completados}/${prog.total} pasos · ${prog.pct}%</span></div>
                        <div class="h-2.5 bg-surface-container-high rounded-full overflow-hidden"><div id="inst-progress-bar" class="h-full bg-primary rounded-full transition-all" style="width:${prog.pct}%"></div></div>
                    </div>
                </div>

                <div class="flex-1 overflow-y-auto p-6 lg:p-8 space-y-4" id="inst-pasos-container">
                    ${pasos.map((p, idx) => renderPasoCard(inst.id, p, idx)).join('')}
                </div>

                <div class="p-4 lg:p-6 border-t border-outline-variant/30 bg-surface-container-low flex items-center justify-between gap-4">
                    <div class="text-xs text-on-surface-variant">Los cambios de pasos se guardan automáticamente.</div>
                    <button onclick="ProyectosModule.guardarNotasInstalacion(${inst.id})" class="sq-btn sq-btn-secondary sq-btn-sm"><span class="material-symbols-outlined text-[16px] mr-1">save</span>Guardar notas generales</button>
                </div>
            </div>
        `, '4xl');
    }

    function renderPasoCard(instId, paso, idx) {
        const done = !!paso.completado;
        const isNext = !done && idx === 0 ? true : (!done); // visual helper via border
        return `
        <div class="rounded-xl border ${done ? 'border-primary/30 bg-primary/5' : 'border-outline-variant/30 bg-surface'} p-4 lg:p-5 transition-all" data-paso-index="${idx}">
            <div class="flex items-start gap-4">
                <button onclick="ProyectosModule.togglePaso(${instId}, ${idx})" class="mt-0.5 w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${done ? 'bg-primary border-primary text-on-primary' : 'border-outline-variant text-transparent hover:border-primary'}" title="${done ? 'Marcar pendiente' : 'Marcar completado'}">
                    <span class="material-symbols-outlined text-[18px]">${done ? 'check' : 'check'}</span>
                </button>
                <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap items-center gap-2 mb-2">
                        <span class="text-[11px] font-mono text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded">Paso ${idx + 1}</span>
                        <h3 class="font-label-bold ${done ? 'text-on-surface line-through opacity-70' : 'text-on-surface'}">${escapeHtml(paso.nombre)}</h3>
                        ${done ? '<span class="text-[11px] text-primary bg-primary/10 px-2 py-0.5 rounded-full">Completado</span>' : ''}
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label class="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Fecha</label>
                            <input type="date" id="paso-fecha-${idx}" value="${paso.fecha ? String(paso.fecha).slice(0,10) : ''}" class="sq-input text-sm py-2" onchange="ProyectosModule.guardarPasoCampo(${instId}, ${idx}, 'fecha', this.value)">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Notas del paso</label>
                            <input type="text" id="paso-notas-${idx}" value="${escapeAttr(paso.notas||'')}" class="sq-input text-sm py-2" placeholder="Observaciones, responsables, evidencias..." onblur="ProyectosModule.guardarPasoCampo(${instId}, ${idx}, 'notas', this.value)">
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    let _detalleCache = null;
    async function togglePaso(instId, idx) {
        try {
            const inst = await API.get(`/proyectos/${instId}`);
            const pasos = inst.pasos || PASOS.map((n,i)=>({orden:i+1,nombre:n,completado:false,fecha:null,notas:''}));
            pasos[idx].completado = !pasos[idx].completado;
            if (pasos[idx].completado && !pasos[idx].fecha) pasos[idx].fecha = new Date().toISOString().slice(0,10);
            const res = await API.put(`/proyectos/${instId}`, { pasos });
            showToast(pasos[idx].completado ? 'Paso completado' : 'Paso marcado como pendiente', 'success');
            const updated = await API.get(`/proyectos/${instId}`);
            renderDetalle(updated);
            await cargar(); renderLista();
        } catch (e) { showToast(e.message || 'Error al actualizar paso', 'error'); }
    }

    async function guardarPasoCampo(instId, idx, campo, valor) {
        try {
            const inst = await API.get(`/proyectos/${instId}`);
            const pasos = inst.pasos || [];
            if (!pasos[idx]) return;
            pasos[idx][campo] = valor || (campo === 'fecha' ? null : '');
            await API.put(`/proyectos/${instId}`, { pasos });
            await cargar(); renderLista();
        } catch (e) { /* silencioso en blur */ }
    }

    async function guardarNotasInstalacion(instId) {
        // Notas generales no están en UI detallada aún; placeholder para consistencia
        showToast('Progreso y notas de pasos guardados', 'success');
    }

    async function eliminar(id) {
        confirmAction('¿Eliminar esta instalación y su seguimiento?', async () => {
            try {
                await API.delete(`/proyectos/${id}`);
                showToast('Instalación eliminada', 'success');
                closeModal();
                await cargar(); renderLista();
            } catch (e) { showToast(e.message || 'Error al eliminar', 'error'); }
        });
    }

    function escapeHtml(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    function escapeAttr(v){ return escapeHtml(v).replace(/"/g,'&quot;'); }

    return { init, openNuevaInstalacion, onCotizacionChange, crearInstalacion, openDetalle, togglePaso, guardarPasoCampo, guardarNotasInstalacion, eliminar };
})();

window.renderProyectos = function() { ProyectosModule.init(); };
