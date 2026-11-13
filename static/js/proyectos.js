/**
 * SunQuote — Instalaciones Fotovoltaicas
 * Vista lista + vista detalle por instalación (página completa, no modal)
 * Etapas creadas por el usuario, cada una con tareas y subtareas tipo planner.
 */

window.ProyectosModule = (function () {
    let instalaciones = [];
    let filtros = { buscar: '' };
    let current = null; // instalación abierta
    let selectedPasoId = null;
    let saving = false;

    async function init(id) {
        if (id) return renderDetallePage(id);
        return renderListaPage();
    }

    // ── LISTA ──────────────────────────────────────────────────────────────
    async function renderListaPage() {
        const container = document.getElementById('app-content');
        container.innerHTML = `
            <div class="p-4 lg:p-10 max-w-7xl mx-auto fade-in">
                <div class="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 mb-8">
                    <div class="flex flex-col gap-2">
                        <span class="font-label-bold text-label-bold text-primary tracking-widest uppercase">Gestión de instalaciones</span>
                        <h1 class="font-display-lg text-display-lg text-on-surface">Instalaciones Fotovoltaicas</h1>
                        <p class="text-on-surface-variant max-w-2xl">Crea instalaciones desde cotizaciones firmadas y gestiona cada etapa con tareas y subtareas hasta su finalización.</p>
                    </div>
                    <button class="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-label-bold hover:brightness-110 flex items-center gap-2 shadow-lg" onclick="ProyectosModule.openNuevaInstalacion()">
                        <span class="material-symbols-outlined">add</span>Nueva instalación
                    </button>
                </div>
                <div class="bg-surface-container-low p-4 lg:p-6 rounded-xl mb-6">
                    <div class="relative max-w-xl">
                        <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                        <input type="text" id="buscar-instalacion" class="sq-input pl-12" placeholder="Buscar por cliente, cotización o nombre..." value="${escapeAttr(filtros.buscar)}">
                    </div>
                </div>
                <div id="instalaciones-container" class="bg-surface-container rounded-xl shadow-xl overflow-hidden min-h-[300px]">
                    <div class="p-16 flex justify-center"><div class="sq-spinner"></div></div>
                </div>
            </div>`;
        document.getElementById('buscar-instalacion').addEventListener('input', debounce((e) => { filtros.buscar = e.target.value; renderLista(); }, 250));
        await cargar();
        renderLista();
    }

    async function cargar() {
        try { instalaciones = await API.get('/proyectos'); }
        catch (e) { instalaciones = []; showToast('Error al cargar instalaciones', 'error'); }
    }

    function filtradas() {
        const q = (filtros.buscar || '').toLowerCase().trim();
        if (!q) return instalaciones;
        return instalaciones.filter(i => [i.nombre, i.cliente_nombre, i.cotizacion_codigo, i.cotizacion_titulo, i.paso_actual].some(v => String(v||'').toLowerCase().includes(q)));
    }

    function progresoBadge(i) {
        const p = i.progreso || { tareasCompletadas: 0, tareasTotal: 0, pct: 0, pasosCompletados: 0, pasosTotal: 0 };
        const label = p.tareasTotal ? `${p.tareasCompletadas}/${p.tareasTotal} tareas` : `${p.pasosCompletados}/${p.pasosTotal} etapas`;
        return `<div class="flex items-center gap-3 min-w-[190px]">
            <div class="flex-1 h-2 bg-surface-container-high rounded-full overflow-hidden"><div class="h-full bg-primary rounded-full" style="width:${p.pct||0}%"></div></div>
            <span class="text-xs font-label-bold text-on-surface-variant whitespace-nowrap">${label} · ${p.pct||0}%</span>
        </div>`;
    }

    function renderLista() {
        const container = document.getElementById('instalaciones-container');
        const list = filtradas();
        if (!list.length) {
            container.innerHTML = `<div class="p-16 text-center text-on-surface-variant">
                <span class="material-symbols-outlined text-[56px] mb-4 block opacity-40">solar_power</span>
                <p class="font-headline-md text-on-surface mb-2">No hay instalaciones</p>
                <p class="text-sm mb-6">Crea una instalación desde una cotización firmada para iniciar el seguimiento por etapas.</p>
                <button class="sq-btn sq-btn-primary" onclick="ProyectosModule.openNuevaInstalacion()">Crear instalación</button>
            </div>`;
            return;
        }
        container.innerHTML = `<div class="overflow-x-auto"><table class="sq-table"><thead><tr>
            <th>Instalación / Cliente</th><th>Cotización</th><th>Etapa actual</th><th>Progreso</th><th>Actualización</th><th class="text-right">Acciones</th>
        </tr></thead><tbody>${list.map(i => `
            <tr class="group cursor-pointer hover:bg-surface-container-high/40" onclick="window.location.hash='#proyectos/${i.id}'">
                <td><div class="flex flex-col"><span class="font-label-bold text-on-surface">${escapeHtml(i.nombre)}</span>
                    <span class="text-xs text-on-surface-variant flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">person</span>${escapeHtml(i.cliente_nombre||'')}</span></div></td>
                <td>${i.cotizacion_codigo ? `<span class="font-mono text-primary text-sm">${escapeHtml(i.cotizacion_codigo)}</span>${i.cotizacion_titulo?`<div class="text-xs text-on-surface-variant">· ${escapeHtml(i.cotizacion_titulo)}</div>`:''}` : '<span class="text-on-surface-variant text-sm">—</span>'}</td>
                <td><span class="px-2 py-1 rounded-lg bg-surface-container-high text-xs font-label-bold">${escapeHtml(i.paso_actual || 'Sin etapas')}</span></td>
                <td>${progresoBadge(i)}</td>
                <td class="text-on-surface-variant text-sm">${formatShortDate(i.updated_at || i.created_at)}</td>
                <td class="text-right" onclick="event.stopPropagation()">
                    <div class="flex justify-end gap-1 opacity-70 group-hover:opacity-100">
                        <a href="#proyectos/${i.id}" class="p-2 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-primary" title="Abrir"><span class="material-symbols-outlined text-[20px]">open_in_new</span></a>
                        <button onclick="ProyectosModule.eliminar(${i.id}, true)" class="p-2 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-error" title="Eliminar"><span class="material-symbols-outlined text-[20px]">delete</span></button>
                    </div>
                </td>
            </tr>`).join('')}</tbody></table></div>`;
    }

    async function openNuevaInstalacion() {
        let cotizaciones = [];
        try { cotizaciones = await API.get('/proyectos/cotizaciones-disponibles'); } catch (e) {}
        openModal(`<div class="p-8 fade-in">
            <div class="flex justify-between items-center mb-6">
                <div><h2 class="font-headline-md text-on-surface">Crear instalación</h2><p class="text-sm text-on-surface-variant mt-1">Desde una cotización firmada o manualmente. Luego podrás crear las etapas y tareas.</p></div>
                <button onclick="closeModal()" class="text-on-surface-variant hover:text-error"><span class="material-symbols-outlined">close</span></button>
            </div>
            <form class="space-y-4" onsubmit="ProyectosModule.crearInstalacion(event)">
                <div><label class="block text-label-sm font-label-bold text-on-surface-variant mb-1">Cotización origen (opcional)</label>
                    <select name="cotizacion_id" id="inst-cotizacion" class="sq-input" onchange="ProyectosModule.onCotizacionChange(this.value)">
                        <option value="">Sin cotización (manual)</option>
                        ${cotizaciones.map(c => `<option value="${c.id}" data-cliente="${escapeAttr(c.cliente_nombre)}" data-codigo="${escapeAttr(c.codigo||'')}" data-titulo="${escapeAttr(c.titulo||'')}" data-cliente-id="${c.cliente_id}">${escapeHtml(c.codigo||'PROP-'+c.id)}${c.titulo?' · '+escapeHtml(c.titulo):''} — ${escapeHtml(c.cliente_nombre)}</option>`).join('')}
                    </select></div>
                <div><label class="block text-label-sm font-label-bold text-on-surface-variant mb-1">Nombre de la instalación *</label>
                    <input type="text" name="nombre" id="inst-nombre" required class="sq-input" placeholder="Ej. Instalación 5 kWp - Cliente"></div>
                <div id="inst-cliente-wrap"><label class="block text-label-sm font-label-bold text-on-surface-variant mb-1">Cliente ID (si es manual)</label>
                    <input type="number" name="cliente_id" id="inst-cliente-id" class="sq-input" placeholder="ID de cliente"></div>
                <div><label class="block text-label-sm font-label-bold text-on-surface-variant mb-1">Notas</label><textarea name="notas" rows="3" class="sq-input"></textarea></div>
                <div class="flex justify-end gap-3 pt-2"><button type="button" onclick="closeModal()" class="sq-btn sq-btn-ghost">Cancelar</button><button type="submit" class="sq-btn sq-btn-primary">Crear instalación</button></div>
            </form></div>`, '2xl');
    }

    function onCotizacionChange(val) {
        const sel = document.getElementById('inst-cotizacion');
        const opt = sel?.options[sel.selectedIndex];
        const nombre = document.getElementById('inst-nombre');
        const cid = document.getElementById('inst-cliente-id');
        const wrap = document.getElementById('inst-cliente-wrap');
        if (opt && val) {
            const codigo = opt.dataset.codigo || ('PROP-' + val);
            const titulo = opt.dataset.titulo ? ' · ' + opt.dataset.titulo : '';
            const cliente = opt.dataset.cliente || '';
            if (nombre && !nombre.dataset.manual) nombre.value = `Instalación ${codigo}${titulo} - ${cliente}`.trim();
            if (cid) cid.value = opt.dataset.clienteId || '';
            if (wrap) wrap.style.display = 'none';
        } else {
            if (wrap) wrap.style.display = '';
        }
    }

    async function crearInstalacion(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = { nombre: (fd.get('nombre')||'').trim(), notas: (fd.get('notas')||'').trim() };
        const cot = fd.get('cotizacion_id');
        if (cot) data.cotizacion_id = Number(cot);
        const cid = fd.get('cliente_id');
        if (cid) data.cliente_id = Number(cid);
        try {
            const res = await API.post('/proyectos', data);
            showToast(res.message || 'Instalación creada', 'success');
            closeModal();
            if (res.id) window.location.hash = '#proyectos/' + res.id; else { await cargar(); renderLista(); }
        } catch (err) { showToast(err.message || 'Error al crear instalación', 'error'); }
    }

    // ── DETALLE (página completa) ──────────────────────────────────────────
    async function renderDetallePage(id) {
        const container = document.getElementById('app-content');
        container.innerHTML = `<div class="p-16 flex justify-center"><div class="sq-spinner"></div></div>`;
        try {
            current = await API.get(`/proyectos/${id}`);
            if (!current.pasos) current.pasos = [];
            if (!selectedPasoId || !current.pasos.find(p => p.id === selectedPasoId)) {
                selectedPasoId = current.pasos[0]?.id || null;
            }
            renderDetalle();
        } catch (e) {
            container.innerHTML = `<div class="p-12 text-center text-on-surface-variant">No se pudo cargar la instalación. <a href="#proyectos" class="text-primary underline">Volver</a></div>`;
        }
    }

    function renderDetalle() {
        const inst = current; if (!inst) return;
        const container = document.getElementById('app-content');
        const pasos = inst.pasos || [];
        const selected = pasos.find(p => p.id === selectedPasoId) || pasos[0] || null;
        if (selected) selectedPasoId = selected.id;
        const prog = inst.progreso || calcLocalProgreso(pasos);

        container.innerHTML = `
        <div class="h-[calc(100vh-4rem)] lg:h-[calc(100vh-5rem)] flex flex-col">
            <div class="px-4 lg:px-8 py-4 border-b border-outline-variant/30 bg-surface-container-low flex-shrink-0">
                <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 text-xs text-on-surface-variant mb-1">
                            <a href="#proyectos" class="hover:text-primary flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">arrow_back</span> Instalaciones</a>
                            ${inst.cotizacion_codigo ? `<span class="font-mono text-primary">· ${escapeHtml(inst.cotizacion_codigo)}${inst.cotizacion_titulo?' · '+escapeHtml(inst.cotizacion_titulo):''}</span>` : ''}
                        </div>
                        <h1 class="font-headline-md text-on-surface truncate">${escapeHtml(inst.nombre)}</h1>
                        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-on-surface-variant mt-1">
                            <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">person</span>${escapeHtml(inst.cliente_nombre||'')}</span>
                            ${inst.potencia_kwp ? `<span>${inst.potencia_kwp} kWp</span>` : ''}
                            <span id="save-status" class="text-primary"></span>
                        </div>
                    </div>
                    <div class="flex items-center gap-4">
                        <div class="min-w-[220px]">
                            <div class="flex justify-between text-xs text-on-surface-variant mb-1"><span>Progreso</span><span class="text-primary font-label-bold">${prog.tareasCompletadas||0}/${prog.tareasTotal||0} tareas · ${prog.pct||0}%</span></div>
                            <div class="h-2 bg-surface-container-high rounded-full overflow-hidden"><div class="h-full bg-primary rounded-full" style="width:${prog.pct||0}%"></div></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="flex-1 flex overflow-hidden">
                <aside class="w-72 lg:w-80 border-r border-outline-variant/30 bg-surface-container-low flex flex-col flex-shrink-0">
                    <div class="p-4 border-b border-outline-variant/20 flex items-center justify-between">
                        <h2 class="font-label-bold text-on-surface">Etapas</h2>
                        <button onclick="ProyectosModule.agregarPaso()" class="sq-btn sq-btn-primary sq-btn-sm flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">add</span>Etapa</button>
                    </div>
                    <div id="pasos-tabs" class="flex-1 overflow-y-auto p-2 space-y-1">${renderTabs(pasos, selectedPasoId)}</div>
                </aside>
                <main class="flex-1 overflow-y-auto bg-surface p-4 lg:p-8" id="paso-panel">${selected ? renderPasoPanel(selected) : renderEmptyPanel()}</main>
            </div>
        </div>`;
    }

    function renderTabs(pasos, selId) {
        if (!pasos.length) return `<div class="p-4 text-sm text-on-surface-variant text-center">Sin etapas. Crea la primera etapa para comenzar.</div>`;
        return pasos.map((p, idx) => {
            const active = p.id === selId;
            const pProg = pasoProgreso(p);
            return `<div class="group flex items-stretch rounded-xl border ${active ? 'border-primary/50 bg-primary/10' : 'border-transparent hover:bg-surface-container'} transition-all">
                <button onclick="ProyectosModule.selectPaso('${p.id}')" class="flex-1 text-left p-3 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-label-bold ${p.completado ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}">${p.completado ? '✓' : (idx+1)}</span>
                        <span class="font-label-bold text-sm truncate ${active ? 'text-primary' : 'text-on-surface'} ${p.completado ? 'line-through opacity-70' : ''}">${escapeHtml(p.nombre)}</span>
                    </div>
                    <div class="ml-8 text-[11px] text-on-surface-variant">${pProg.done}/${pProg.total} tareas ${p.completado ? '· Completada' : ''}</div>
                </button>
                <div class="flex flex-col justify-center pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="ProyectosModule.renamePaso('${p.id}')" class="p-1 text-on-surface-variant hover:text-primary" title="Renombrar"><span class="material-symbols-outlined text-[16px]">edit</span></button>
                    <button onclick="ProyectosModule.deletePaso('${p.id}')" class="p-1 text-on-surface-variant hover:text-error" title="Eliminar"><span class="material-symbols-outlined text-[16px]">delete</span></button>
                </div>
            </div>`;
        }).join('');
    }

    function renderEmptyPanel() {
        return `<div class="h-full flex flex-col items-center justify-center text-center text-on-surface-variant">
            <span class="material-symbols-outlined text-[64px] opacity-30 mb-4">checklist</span>
            <p class="font-headline-md text-on-surface mb-2">Crea una etapa</p>
            <p class="text-sm mb-6 max-w-md">Cada etapa (pestaña) agrupa tareas y subtareas. Cuando todas se completen, la etapa se marcará como completada automáticamente.</p>
            <button onclick="ProyectosModule.agregarPaso()" class="sq-btn sq-btn-primary">Agregar primera etapa</button>
        </div>`;
    }

    function renderPasoPanel(paso) {
        const tareas = paso.tareas || [];
        const pProg = pasoProgreso(paso);
        return `
        <div class="max-w-5xl mx-auto">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
                <div>
                    <div class="flex items-center gap-3 mb-1">
                        <h2 class="font-headline-md text-on-surface">${escapeHtml(paso.nombre)}</h2>
                        ${paso.completado ? '<span class="px-2 py-1 rounded-full bg-primary/15 text-primary text-xs font-label-bold">Etapa completada</span>' : ''}
                    </div>
                    <p class="text-sm text-on-surface-variant">${pProg.done} de ${pProg.total} tareas completadas${pProg.total ? ` · ${Math.round(pProg.done/pProg.total*100)}%` : ''}</p>
                </div>
                <button onclick="ProyectosModule.agregarTarea('${paso.id}')" class="sq-btn sq-btn-primary flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">add_task</span>Nueva tarea</button>
            </div>
            ${!tareas.length ? `<div class="border border-dashed border-outline-variant/40 rounded-xl p-10 text-center text-on-surface-variant">
                <span class="material-symbols-outlined text-[40px] opacity-40 mb-2 block">playlist_add</span>
                <p class="mb-4">Esta etapa aún no tiene tareas.</p>
                <button onclick="ProyectosModule.agregarTarea('${paso.id}')" class="sq-btn sq-btn-secondary">Crear tarea</button>
            </div>` : `
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" id="tareas-grid">
                ${tareas.map(t => renderTareaCard(paso.id, t)).join('')}
            </div>`}
        </div>`;
    }

    function renderTareaCard(pasoId, tarea) {
        const subs = tarea.subtareas || [];
        const hasSubs = subs.length > 0;
        const doneSubs = subs.filter(s => s.completada).length;
        const done = hasSubs ? (doneSubs === subs.length) : !!tarea.completada;
        return `<div class="rounded-xl border ${done ? 'border-primary/30 bg-primary/5' : 'border-outline-variant/30 bg-surface-container-low'} p-4 flex flex-col gap-3">
            <div class="flex items-start gap-2">
                ${!hasSubs ? `<button onclick="ProyectosModule.toggleTarea('${pasoId}','${tarea.id}',null)" class="mt-0.5 w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${done?'bg-primary border-primary text-on-primary':'border-outline-variant hover:border-primary'}"><span class="material-symbols-outlined text-[16px]">${done?'check':''}</span></button>` : `<span class="mt-0.5 w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${done?'bg-primary/20 text-primary':'bg-surface-container-high text-on-surface-variant'}"><span class="material-symbols-outlined text-[16px]">checklist</span></span>`}
                <div class="flex-1 min-w-0">
                    <div class="font-label-bold text-on-surface break-words ${done?'line-through opacity-70':''}">${escapeHtml(tarea.titulo || 'Sin título')}</div>
                    ${hasSubs ? `<div class="text-[11px] text-on-surface-variant mt-0.5">${doneSubs}/${subs.length} subtareas</div>` : ''}
                </div>
                <div class="flex items-center gap-1 flex-shrink-0">
                    <button onclick="ProyectosModule.editTarea('${pasoId}','${tarea.id}')" class="p-1 text-on-surface-variant hover:text-primary" title="Editar"><span class="material-symbols-outlined text-[16px]">edit</span></button>
                    <button onclick="ProyectosModule.deleteTarea('${pasoId}','${tarea.id}')" class="p-1 text-on-surface-variant hover:text-error" title="Eliminar"><span class="material-symbols-outlined text-[16px]">delete</span></button>
                </div>
            </div>
            ${hasSubs ? `<div class="space-y-1 pl-1">${subs.map(s => `
                <div class="flex items-center gap-2 group/sub">
                    <button onclick="ProyectosModule.toggleTarea('${pasoId}','${tarea.id}','${s.id}')" class="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${s.completada?'bg-primary border-primary text-on-primary':'border-outline-variant hover:border-primary'}"><span class="material-symbols-outlined text-[14px]">${s.completada?'check':''}</span></button>
                    <span class="flex-1 text-sm ${s.completada?'line-through text-on-surface-variant':'text-on-surface'}">${escapeHtml(s.titulo||'')}</span>
                    <button onclick="ProyectosModule.editSubtarea('${pasoId}','${tarea.id}','${s.id}')" class="opacity-0 group-hover/sub:opacity-100 p-0.5 text-on-surface-variant hover:text-primary"><span class="material-symbols-outlined text-[14px]">edit</span></button>
                    <button onclick="ProyectosModule.deleteSubtarea('${pasoId}','${tarea.id}','${s.id}')" class="opacity-0 group-hover/sub:opacity-100 p-0.5 text-on-surface-variant hover:text-error"><span class="material-symbols-outlined text-[14px]">close</span></button>
                </div>`).join('')}</div>` : ''}
            <div class="pt-1 border-t border-outline-variant/20">
                <button onclick="ProyectosModule.agregarSubtarea('${pasoId}','${tarea.id}')" class="text-xs text-primary hover:underline flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">add</span>Agregar subtarea</button>
            </div>
        </div>`;
    }

    // ── acciones ───────────────────────────────────────────────────────────
    function selectPaso(id) { selectedPasoId = id; renderDetalle(); }

    async function agregarPaso() {
        const nombre = prompt('Nombre de la nueva etapa:');
        if (!nombre || !nombre.trim()) return;
        current.pasos = current.pasos || [];
        current.pasos.push({ id: genId(), nombre: nombre.trim(), orden: current.pasos.length + 1, completado: false, tareas: [] });
        selectedPasoId = current.pasos[current.pasos.length - 1].id;
        await saveCurrent();
        renderDetalle();
    }

    async function renamePaso(pasoId) {
        const p = (current.pasos||[]).find(x => x.id === pasoId); if (!p) return;
        const nombre = prompt('Nuevo nombre de la etapa:', p.nombre);
        if (nombre === null) return;
        if (!nombre.trim()) return;
        p.nombre = nombre.trim();
        await saveCurrent(); renderDetalle();
    }

    async function deletePaso(pasoId) {
        if (!confirm('¿Eliminar esta etapa y todas sus tareas?')) return;
        current.pasos = (current.pasos||[]).filter(p => p.id !== pasoId);
        if (selectedPasoId === pasoId) selectedPasoId = current.pasos[0]?.id || null;
        await saveCurrent(); renderDetalle();
    }

    async function agregarTarea(pasoId) {
        const titulo = prompt('Título de la tarea:');
        if (!titulo || !titulo.trim()) return;
        const p = (current.pasos||[]).find(x => x.id === pasoId); if (!p) return;
        p.tareas = p.tareas || [];
        p.tareas.push({ id: genId(), titulo: titulo.trim(), completada: false, subtareas: [] });
        recompute(p); await saveCurrent(); renderDetalle();
    }

    async function editTarea(pasoId, tareaId) {
        const p = findPaso(pasoId); const t = p?.tareas.find(x => x.id === tareaId); if (!t) return;
        const titulo = prompt('Editar tarea:', t.titulo); if (titulo === null || !titulo.trim()) return;
        t.titulo = titulo.trim(); await saveCurrent(); renderDetalle();
    }

    async function deleteTarea(pasoId, tareaId) {
        const p = findPaso(pasoId); if (!p) return;
        if (!confirm('¿Eliminar esta tarea?')) return;
        p.tareas = (p.tareas||[]).filter(t => t.id !== tareaId);
        recompute(p); await saveCurrent(); renderDetalle();
    }

    async function agregarSubtarea(pasoId, tareaId) {
        const titulo = prompt('Título de la subtarea:');
        if (!titulo || !titulo.trim()) return;
        const t = findTarea(pasoId, tareaId); if (!t) return;
        t.subtareas = t.subtareas || [];
        // si la tarea estaba completada sin subtareas, al agregar subtareas pasar estado a subtareas
        if (!t.subtareas.length && t.completada) { /* keep */ }
        t.subtareas.push({ id: genId(), titulo: titulo.trim(), completada: false });
        t.completada = false;
        recompute(findPaso(pasoId)); await saveCurrent(); renderDetalle();
    }

    async function editSubtarea(pasoId, tareaId, subId) {
        const t = findTarea(pasoId, tareaId); const s = t?.subtareas?.find(x => x.id === subId); if (!s) return;
        const titulo = prompt('Editar subtarea:', s.titulo); if (titulo === null || !titulo.trim()) return;
        s.titulo = titulo.trim(); await saveCurrent(); renderDetalle();
    }

    async function deleteSubtarea(pasoId, tareaId, subId) {
        const p = findPaso(pasoId); const t = findTarea(pasoId, tareaId); if (!t) return;
        t.subtareas = (t.subtareas||[]).filter(s => s.id !== subId);
        if (!t.subtareas.length) t.completada = false; // requiere marcar manualmente o queda pendiente
        recompute(p); await saveCurrent(); renderDetalle();
    }

    async function toggleTarea(pasoId, tareaId, subId) {
        const p = findPaso(pasoId); const t = findTarea(pasoId, tareaId); if (!t) return;
        if (subId) {
            const s = (t.subtareas||[]).find(x => x.id === subId); if (!s) return;
            s.completada = !s.completada;
        } else {
            if ((t.subtareas||[]).length) return; // se controla por subtareas
            t.completada = !t.completada;
        }
        recompute(p); await saveCurrent(); renderDetalle();
    }

    function recompute(paso) {
        if (!paso) return;
        (paso.tareas||[]).forEach(t => {
            if ((t.subtareas||[]).length) t.completada = t.subtareas.every(s => s.completada);
        });
        const tareas = paso.tareas || [];
        paso.completado = tareas.length > 0 && tareas.every(t => t.completada);
    }
    function findPaso(pid){ return (current?.pasos||[]).find(p=>p.id===pid); }
    function findTarea(pid, tid){ return findPaso(pid)?.tareas?.find(t=>t.id===tid); }
    function pasoProgreso(p){ const items=[]; (p.tareas||[]).forEach(t=>{ if((t.subtareas||[]).length) t.subtareas.forEach(s=>items.push(s.completada)); else items.push(!!t.completada); }); return {done:items.filter(Boolean).length,total:items.length}; }
    function calcLocalProgreso(pasos){ const items=[]; (pasos||[]).forEach(p=>(p.tareas||[]).forEach(t=>{ if((t.subtareas||[]).length) t.subtareas.forEach(s=>items.push(s.completada)); else items.push(!!t.completada);})); const done=items.filter(Boolean).length; return {tareasCompletadas:done,tareasTotal:items.length,pasosCompletados:(pasos||[]).filter(p=>p.completado).length,pasosTotal:(pasos||[]).length,pct:items.length?Math.round(done/items.length*100):0}; }

    async function saveCurrent() {
        if (!current || saving) return;
        saving = true; setSaveStatus('Guardando...');
        try {
            const res = await API.put(`/proyectos/${current.id}`, { pasos: current.pasos });
            if (res && res.pasos) current.pasos = res.pasos;
            if (res && res.progreso) current.progreso = res.progreso;
            setSaveStatus('Guardado');
            setTimeout(() => setSaveStatus(''), 1200);
        } catch (e) {
            setSaveStatus('Error al guardar');
            showToast(e.message || 'Error al guardar', 'error');
        } finally { saving = false; }
    }
    function setSaveStatus(msg){ const el=document.getElementById('save-status'); if(el) el.textContent=msg; }

    async function eliminar(id, fromList) {
        confirmAction('¿Eliminar esta instalación y todo su seguimiento?', async () => {
            try {
                await API.delete(`/proyectos/${id}`);
                showToast('Instalación eliminada', 'success');
                if (fromList) { await cargar(); renderLista(); } else { window.location.hash = '#proyectos'; }
            } catch (e) { showToast(e.message || 'Error al eliminar', 'error'); }
        });
    }

    function genId(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
    function escapeHtml(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    function escapeAttr(v){ return escapeHtml(v).replace(/"/g,'&quot;'); }

    // compat para llamadas antiguas
    async function openDetalle(id){ window.location.hash = '#proyectos/' + id; }

    return { init, openNuevaInstalacion, onCotizacionChange, crearInstalacion, openDetalle, selectPaso, agregarPaso, renamePaso, deletePaso, agregarTarea, editTarea, deleteTarea, agregarSubtarea, editSubtarea, deleteSubtarea, toggleTarea, eliminar };
})();

window.renderProyectos = function(id) { ProyectosModule.init(id); };
