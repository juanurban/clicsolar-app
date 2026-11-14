/**
 * SunQuote — Instalaciones Fotovoltaicas
 * Lista visible + Drawer lateral derecho (70%) con 4 pestañas.
 */

window.ProyectosModule = (function () {
    let instalaciones = [];
    let filtros = { buscar: '' };
    let current = null;
    let drawerOpen = false;
    let activeTab = 'tareas';
    let saving = false;

    async function init() { await renderListaPage(); }

    async function renderListaPage() {
        const container = document.getElementById('app-content');
        container.innerHTML = `
            <div class="p-4 lg:p-10 max-w-7xl mx-auto fade-in">
                <div class="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 mb-8">
                    <div class="flex flex-col gap-2">
                        <span class="font-label-bold text-label-bold text-primary tracking-widest uppercase">Gestión de instalaciones</span>
                        <h1 class="font-display-lg text-display-lg text-on-surface">Instalaciones Fotovoltaicas</h1>
                        <p class="text-on-surface-variant max-w-2xl">Da clic en una instalación para abrir el panel de trabajo sin perder el contexto del listado.</p>
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
            </div>
            <div id="inst-drawer-root"></div>`;
        document.getElementById('buscar-instalacion').addEventListener('input', debounce((e) => { filtros.buscar = e.target.value; renderLista(); }, 250));
        await cargar();
        renderLista();
        // reabrir drawer si venimos de crear
        if (window.__openInstalacionId) { const id = window.__openInstalacionId; window.__openInstalacionId = null; openDrawer(id); }
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
        const p = i.progreso || { tareasCompletadas: 0, tareasTotal: 0, pct: 0 };
        const label = `${p.tareasCompletadas||0}/${p.tareasTotal||0} tareas`;
        return `<div class="flex items-center gap-3 min-w-[190px]">
            <div class="flex-1 h-2 bg-surface-container-high rounded-full overflow-hidden"><div class="h-full bg-primary rounded-full" style="width:${p.pct||0}%"></div></div>
            <span class="text-xs font-label-bold text-on-surface-variant whitespace-nowrap">${label} · ${p.pct||0}%</span>
        </div>`;
    }

    function renderLista() {
        const container = document.getElementById('instalaciones-container');
        if (!container) return;
        const list = filtradas();
        if (!list.length) {
            container.innerHTML = `<div class="p-16 text-center text-on-surface-variant">
                <span class="material-symbols-outlined text-[56px] mb-4 block opacity-40">solar_power</span>
                <p class="font-headline-md text-on-surface mb-2">No hay instalaciones</p>
                <p class="text-sm mb-6">Crea una instalación desde una cotización firmada para iniciar el seguimiento.</p>
                <button class="sq-btn sq-btn-primary" onclick="ProyectosModule.openNuevaInstalacion()">Crear instalación</button>
            </div>`;
            return;
        }
        container.innerHTML = `<div class="overflow-x-auto"><table class="sq-table"><thead><tr>
            <th>Instalación / Cliente</th><th>Cotización</th><th>Etapa actual</th><th>Progreso</th><th>Actualización</th><th class="text-right">Acciones</th>
        </tr></thead><tbody>${list.map(i => `
            <tr class="group hover:bg-surface-container-high/40">
                <td>
                    <button class="text-left" onclick="ProyectosModule.openDrawer(${i.id})">
                        <div class="flex flex-col">
                            <span class="font-label-bold text-on-surface hover:text-primary transition-colors underline-offset-2 hover:underline">${escapeHtml(i.nombre)}</span>
                            <span class="text-xs text-on-surface-variant flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">person</span>${escapeHtml(i.cliente_nombre||'')}</span>
                        </div>
                    </button>
                </td>
                <td>${i.cotizacion_codigo ? `<span class="font-mono text-primary text-sm">${escapeHtml(i.cotizacion_codigo)}</span>${i.cotizacion_titulo?`<div class="text-xs text-on-surface-variant">· ${escapeHtml(i.cotizacion_titulo)}</div>`:''}` : '<span class="text-on-surface-variant text-sm">—</span>'}</td>
                <td><span class="px-2 py-1 rounded-lg bg-surface-container-high text-xs font-label-bold">${escapeHtml(i.paso_actual || 'Sin etapas')}</span></td>
                <td>${progresoBadge(i)}</td>
                <td class="text-on-surface-variant text-sm">${formatShortDate(i.updated_at || i.created_at)}</td>
                <td class="text-right">
                    <button onclick="ProyectosModule.eliminar(${i.id})" class="p-2 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-error opacity-70 group-hover:opacity-100" title="Eliminar"><span class="material-symbols-outlined text-[20px]">delete</span></button>
                </td>
            </tr>`).join('')}</tbody></table></div>`;
    }

    // ── NUEVA INSTALACIÓN ────────────────────────────────────────────────
    async function openNuevaInstalacion() {
        let cotizaciones = [];
        try { cotizaciones = await API.get('/proyectos/cotizaciones-disponibles'); } catch (e) {}
        openModal(`<div class="p-8 fade-in">
            <div class="flex justify-between items-center mb-6">
                <div><h2 class="font-headline-md text-on-surface">Crear instalación</h2><p class="text-sm text-on-surface-variant mt-1">A partir de una cotización (hereda equipos/materiales) o manualmente.</p></div>
                <button onclick="closeModal()" class="text-on-surface-variant hover:text-error"><span class="material-symbols-outlined">close</span></button>
            </div>
            <form class="space-y-4" onsubmit="ProyectosModule.crearInstalacion(event)">
                <div><label class="block text-label-sm font-label-bold text-on-surface-variant mb-1">Cotización origen</label>
                    <select name="cotizacion_id" id="inst-cotizacion" class="sq-input" onchange="ProyectosModule.onCotizacionChange(this.value)">
                        <option value="">Sin cotización (manual)</option>
                        ${cotizaciones.map(c => `<option value="${c.id}" data-cliente="${escapeAttr(c.cliente_nombre)}" data-codigo="${escapeAttr(c.codigo||'')}" data-titulo="${escapeAttr(c.titulo||'')}" data-cliente-id="${c.cliente_id}">${escapeHtml(c.codigo||'PROP-'+c.id)}${c.titulo?' · '+escapeHtml(c.titulo):''} — ${escapeHtml(c.cliente_nombre)}</option>`).join('')}
                    </select></div>
                <div><label class="block text-label-sm font-label-bold text-on-surface-variant mb-1">Nombre de la instalación *</label>
                    <input type="text" name="nombre" id="inst-nombre" required class="sq-input" placeholder="Ej. Instalación 5 kWp - Cliente"></div>
                <div id="inst-cliente-wrap"><label class="block text-label-sm font-label-bold text-on-surface-variant mb-1">Cliente ID (manual)</label>
                    <input type="number" name="cliente_id" id="inst-cliente-id" class="sq-input" placeholder="ID de cliente"></div>
                <div><label class="block text-label-sm font-label-bold text-on-surface-variant mb-1">Notas</label><textarea name="notas" rows="3" class="sq-input"></textarea></div>
                <div class="flex justify-end gap-3 pt-2"><button type="button" onclick="closeModal()" class="sq-btn sq-btn-ghost">Cancelar</button><button type="submit" class="sq-btn sq-btn-primary">Crear instalación</button></div>
            </form></div>`, '2xl');
    }
    function onCotizacionChange(val) {
        const sel = document.getElementById('inst-cotizacion'); const opt = sel?.options[sel.selectedIndex];
        const nombre = document.getElementById('inst-nombre'); const cid = document.getElementById('inst-cliente-id'); const wrap = document.getElementById('inst-cliente-wrap');
        if (opt && val) {
            const codigo = opt.dataset.codigo || ('PROP-'+val); const titulo = opt.dataset.titulo ? ' · '+opt.dataset.titulo : '';
            if (nombre) nombre.value = `Instalación ${codigo}${titulo} - ${opt.dataset.cliente||''}`.trim();
            if (cid) cid.value = opt.dataset.clienteId || '';
            if (wrap) wrap.style.display = 'none';
        } else if (wrap) wrap.style.display = '';
    }
    async function crearInstalacion(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = { nombre: (fd.get('nombre')||'').trim(), notas: (fd.get('notas')||'').trim() };
        if (fd.get('cotizacion_id')) data.cotizacion_id = Number(fd.get('cotizacion_id'));
        if (fd.get('cliente_id')) data.cliente_id = Number(fd.get('cliente_id'));
        try {
            const res = await API.post('/proyectos', data);
            showToast(res.message || 'Instalación creada', 'success');
            closeModal(); await cargar(); renderLista();
            if (res.id) openDrawer(res.id);
        } catch (err) { showToast(err.message || 'Error al crear instalación', 'error'); }
    }

    // ── DRAWER ───────────────────────────────────────────────────────────
    async function openDrawer(id) {
        const root = document.getElementById('inst-drawer-root');
        if (!root) { window.__openInstalacionId = id; window.location.hash = '#proyectos'; return; }
        drawerOpen = true; activeTab = activeTab || 'tareas';
        root.innerHTML = `
            <div id="inst-drawer-backdrop" class="fixed inset-0 bg-black/40 z-[60]" onclick="ProyectosModule.closeDrawer()"></div>
            <div id="inst-drawer" class="fixed top-0 right-0 h-full w-[70vw] max-w-[1200px] min-w-[360px] bg-surface shadow-2xl z-[70] flex flex-col transform translate-x-0 transition-transform duration-300">
                <div class="p-6 flex items-center justify-center h-full"><div class="sq-spinner"></div></div>
            </div>`;
        try { current = await API.get(`/proyectos/${id}`); renderDrawer(); }
        catch (e) { document.getElementById('inst-drawer').innerHTML = `<div class="p-8 text-on-surface-variant">Error al cargar instalación.</div>`; }
    }
    function closeDrawer() {
        drawerOpen = false; current = null;
        const root = document.getElementById('inst-drawer-root'); if (root) root.innerHTML = '';
        cargar().then(renderLista);
    }

    function canSeeFinanciero() {
        if (App?.user?.es_superadmin) return true;
        const p = App?.permisos || [];
        return p.includes('configuracion') || p.includes('financiero') || p.includes('dashboard') || p.includes('*') || p.includes('all');
    }

    function renderDrawer() {
        const d = document.getElementById('inst-drawer'); if (!d || !current) return;
        const inst = current;
        const prog = inst.progreso || { tareasCompletadas:0, tareasTotal:0, pct:0 };
        const tabs = [
            { id: 'tareas', label: 'Tareas por etapas', icon: 'checklist' },
            { id: 'bom', label: 'Equipos y materiales', icon: 'inventory_2' },
            { id: 'bitacora', label: 'Bitácora y documentos', icon: 'photo_library' },
        ];
        if (canSeeFinanciero()) tabs.push({ id: 'financiero', label: 'Control financiero', icon: 'payments' });
        if (!tabs.find(t=>t.id===activeTab)) activeTab = 'tareas';

        d.innerHTML = `
            <div class="flex flex-col h-full">
                <div class="px-6 py-4 border-b border-outline-variant/30 bg-surface-container-low flex-shrink-0">
                    <div class="flex items-start justify-between gap-4">
                        <div class="min-w-0">
                            <div class="text-xs text-on-surface-variant mb-1">${inst.cotizacion_codigo ? `<span class="font-mono text-primary">${escapeHtml(inst.cotizacion_codigo)}${inst.cotizacion_titulo?' · '+escapeHtml(inst.cotizacion_titulo):''}</span>` : 'Instalación'}</div>
                            <h2 class="font-headline-md text-on-surface truncate">${escapeHtml(inst.nombre)}</h2>
                            <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-on-surface-variant mt-1">
                                <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">person</span>${escapeHtml(inst.cliente_nombre||'')}</span>
                                ${inst.cotizacion?.potencia_kwp ? `<span>${inst.cotizacion.potencia_kwp} kWp</span>` : ''}
                                <span id="save-status" class="text-primary text-xs"></span>
                            </div>
                        </div>
                        <div class="flex items-center gap-3 flex-shrink-0">
                            <div class="hidden md:block min-w-[180px]">
                                <div class="flex justify-between text-xs text-on-surface-variant mb-1"><span>Progreso</span><span class="text-primary font-label-bold">${prog.tareasCompletadas||0}/${prog.tareasTotal||0} · ${prog.pct||0}%</span></div>
                                <div class="h-2 bg-surface-container-high rounded-full overflow-hidden"><div class="h-full bg-primary rounded-full" style="width:${prog.pct||0}%"></div></div>
                            </div>
                            <button onclick="ProyectosModule.closeDrawer()" class="p-2 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-primary" title="Cerrar"><span class="material-symbols-outlined">close</span></button>
                        </div>
                    </div>
                    <div class="flex gap-2 mt-4 overflow-x-auto">
                        ${tabs.map(t => `<button onclick="ProyectosModule.setTab('${t.id}')" class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-label-bold whitespace-nowrap transition-all ${activeTab===t.id?'bg-primary text-on-primary':'bg-surface-container text-on-surface-variant hover:text-on-surface'}"><span class="material-symbols-outlined text-[18px]">${t.icon}</span>${t.label}</button>`).join('')}
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto p-4 lg:p-6 bg-surface" id="drawer-tab-content">${renderTabContent()}</div>
            </div>`;
    }

    function setTab(id) { activeTab = id; renderDrawer(); }
    function renderTabContent() {
        if (activeTab === 'tareas') return renderTabTareas();
        if (activeTab === 'bom') return renderTabBOM();
        if (activeTab === 'bitacora') return renderTabBitacora();
        if (activeTab === 'financiero') return renderTabFinanciero();
        return '';
    }

    // ── TAB 1: TAREAS POR ETAPAS ─────────────────────────────────────────
    function renderTabTareas() {
        const pasos = current.pasos || [];
        return `<div class="space-y-4">
            <div class="flex justify-between items-center">
                <p class="text-sm text-on-surface-variant">Crea etapas y gestiona tareas con fecha límite, responsable y subtareas.</p>
                <button onclick="ProyectosModule.agregarPaso()" class="sq-btn sq-btn-primary sq-btn-sm flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">add</span>Nueva etapa</button>
            </div>
            ${!pasos.length ? `<div class="border border-dashed border-outline-variant/40 rounded-xl p-10 text-center text-on-surface-variant"><p class="mb-4">Aún no hay etapas. Crea la primera para comenzar.</p><button onclick="ProyectosModule.agregarPaso()" class="sq-btn sq-btn-secondary">Crear etapa</button></div>` : ''}
            ${pasos.map((p, idx) => renderPasoBlock(p, idx)).join('')}
        </div>`;
    }
    function renderPasoBlock(p, idx) {
        const tareas = p.tareas || [];
        const done = tareas.length ? tareas.every(t=>t.completada) : false;
        const doneCount = tareas.filter(t=>t.completada).length;
        return `<div class="rounded-xl border ${done && tareas.length?'border-primary/30 bg-primary/5':'border-outline-variant/30 bg-surface-container-low'} overflow-hidden">
            <div class="px-4 py-3 flex items-center justify-between gap-3 border-b border-outline-variant/20">
                <div class="flex items-center gap-3 min-w-0">
                    <span class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-label-bold ${done && tareas.length?'bg-primary text-on-primary':'bg-surface-container-high text-on-surface-variant'}">${done && tareas.length?'✓':idx+1}</span>
                    <div class="min-w-0"><div class="font-label-bold text-on-surface truncate ${done && tareas.length?'opacity-80':''}">${escapeHtml(p.nombre)}</div><div class="text-[11px] text-on-surface-variant">${doneCount}/${tareas.length} tareas completadas</div></div>
                </div>
                <div class="flex items-center gap-1 flex-shrink-0">
                    <button onclick="ProyectosModule.agregarTarea('${p.id}')" class="p-1.5 rounded hover:bg-surface-container text-primary" title="Agregar tarea"><span class="material-symbols-outlined text-[18px]">add_task</span></button>
                    <button onclick="ProyectosModule.renamePaso('${p.id}')" class="p-1.5 rounded hover:bg-surface-container text-on-surface-variant" title="Renombrar etapa"><span class="material-symbols-outlined text-[18px]">edit</span></button>
                    <button onclick="ProyectosModule.deletePaso('${p.id}')" class="p-1.5 rounded hover:bg-surface-container text-error" title="Eliminar etapa"><span class="material-symbols-outlined text-[18px]">delete</span></button>
                </div>
            </div>
            <div class="p-3 space-y-2">
                ${!tareas.length ? `<div class="text-sm text-on-surface-variant text-center py-4">Sin tareas. <button onclick="ProyectosModule.agregarTarea('${p.id}')" class="text-primary underline">Agregar tarea</button></div>` : tareas.map(t => renderTareaRow(p.id, t)).join('')}
            </div>
        </div>`;
    }
    function renderTareaRow(pasoId, t) {
        const subs = t.subtareas || []; const hasSubs = subs.length>0;
        const done = hasSubs ? subs.every(s=>s.completada) : !!t.completada;
        return `<div class="rounded-lg border border-outline-variant/20 bg-surface p-3">
            <div class="flex flex-wrap items-start gap-2">
                ${!hasSubs ? `<button onclick="ProyectosModule.toggleTarea('${pasoId}','${t.id}',null)" class="mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${done?'bg-primary border-primary text-on-primary':'border-outline-variant hover:border-primary'}"><span class="material-symbols-outlined text-[14px]">${done?'check':''}</span></button>` : `<span class="mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${done?'bg-primary/20 text-primary':'bg-surface-container-high text-on-surface-variant'}"><span class="material-symbols-outlined text-[14px]">checklist</span></span>`}
                <div class="flex-1 min-w-[180px]">
                    <div class="font-label-bold text-sm ${done?'line-through opacity-70':''}">${escapeHtml(t.titulo||'')}</div>
                    ${hasSubs ? `<div class="text-[11px] text-on-surface-variant">${subs.filter(s=>s.completada).length}/${subs.length} subtareas</div>` : ''}
                </div>
                <div class="flex flex-wrap items-center gap-2 text-xs">
                    <label class="flex items-center gap-1 text-on-surface-variant"><span class="material-symbols-outlined text-[14px]">event</span><input type="date" class="bg-surface-container border border-outline-variant/30 rounded px-2 py-1 text-on-surface text-xs" value="${t.fecha_limite?String(t.fecha_limite).slice(0,10):''}" onchange="ProyectosModule.updateTareaField('${pasoId}','${t.id}','fecha_limite',this.value)"></label>
                    <label class="flex items-center gap-1 text-on-surface-variant"><span class="material-symbols-outlined text-[14px]">person</span><input type="text" class="bg-surface-container border border-outline-variant/30 rounded px-2 py-1 text-on-surface text-xs w-32" placeholder="Responsable" value="${escapeAttr(t.responsable||'')}" onchange="ProyectosModule.updateTareaField('${pasoId}','${t.id}','responsable',this.value)"></label>
                </div>
                <div class="flex items-center gap-1">
                    <button onclick="ProyectosModule.agregarSubtarea('${pasoId}','${t.id}')" class="p-1 text-primary hover:bg-primary/10 rounded" title="Subtarea"><span class="material-symbols-outlined text-[16px]">playlist_add</span></button>
                    <button onclick="ProyectosModule.editTarea('${pasoId}','${t.id}')" class="p-1 text-on-surface-variant hover:text-primary rounded" title="Editar"><span class="material-symbols-outlined text-[16px]">edit</span></button>
                    <button onclick="ProyectosModule.deleteTarea('${pasoId}','${t.id}')" class="p-1 text-on-surface-variant hover:text-error rounded" title="Eliminar"><span class="material-symbols-outlined text-[16px]">delete</span></button>
                </div>
            </div>
            ${hasSubs ? `<div class="mt-2 ml-7 space-y-1">${subs.map(s=>`
                <div class="flex items-center gap-2 group/sub text-sm">
                    <button onclick="ProyectosModule.toggleTarea('${pasoId}','${t.id}','${s.id}')" class="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${s.completada?'bg-primary border-primary text-on-primary':'border-outline-variant'}"><span class="material-symbols-outlined text-[12px]">${s.completada?'check':''}</span></button>
                    <span class="flex-1 ${s.completada?'line-through text-on-surface-variant':''}">${escapeHtml(s.titulo||'')}</span>
                    <button onclick="ProyectosModule.editSubtarea('${pasoId}','${t.id}','${s.id}')" class="opacity-0 group-hover/sub:opacity-100 text-on-surface-variant hover:text-primary"><span class="material-symbols-outlined text-[14px]">edit</span></button>
                    <button onclick="ProyectosModule.deleteSubtarea('${pasoId}','${t.id}','${s.id}')" class="opacity-0 group-hover/sub:opacity-100 text-on-surface-variant hover:text-error"><span class="material-symbols-outlined text-[14px]">close</span></button>
                </div>`).join('')}</div>` : ''}
        </div>`;
    }

    // ── TAB 2: BOM ───────────────────────────────────────────────────────
    function renderTabBOM() {
        const bom = current.bom || [];
        const cot = current.cotizacion;
        if (!bom.length) return `<div class="text-center text-on-surface-variant py-12"><span class="material-symbols-outlined text-[48px] opacity-30 mb-2 block">inventory_2</span><p>No hay equipos/materiales. ${cot?'La cotización no tiene ítems.':'Vincula una cotización o agrega ítems manualmente.'}</p></div>`;
        return `<div class="space-y-4">
            <p class="text-sm text-on-surface-variant">Lista heredada de la cotización ${cot?`<span class="text-primary font-mono">${escapeHtml(cot.codigo||'')}</span>`:''}. Marca el estado logístico de cada ítem.</p>
            <div class="overflow-x-auto rounded-xl border border-outline-variant/30">
                <table class="sq-table w-full">
                    <thead><tr><th>Ítem</th><th class="text-center">Cant.</th><th class="text-center">Comprado</th><th class="text-center">Despachado</th><th class="text-center">Instalado</th></tr></thead>
                    <tbody>${bom.map((b,i)=>`
                        <tr>
                            <td><div class="font-label-bold text-on-surface">${escapeHtml(b.nombre||'-')}</div><div class="text-xs text-on-surface-variant">${escapeHtml(b.categoria||'')}</div></td>
                            <td class="text-center">${b.cantidad||0} ${escapeHtml(b.unidad||'')}</td>
                            ${['comprado','despachado','instalado'].map(k=>`<td class="text-center"><input type="checkbox" class="w-5 h-5 accent-primary cursor-pointer" ${b[k]?'checked':''} onchange="ProyectosModule.toggleBom(${i},'${k}',this.checked)"></td>`).join('')}
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
            <div class="grid grid-cols-3 gap-4 text-sm">
                ${['comprado','despachado','instalado'].map(k=>{ const n=bom.filter(b=>b[k]).length; return `<div class="bg-surface-container-low rounded-lg p-3 text-center"><div class="text-on-surface-variant capitalize mb-1">${k}</div><div class="font-label-bold text-on-surface">${n}/${bom.length}</div></div>`; }).join('')}
            </div>
        </div>`;
    }

    // ── TAB 3: BITÁCORA ──────────────────────────────────────────────────
    function renderTabBitacora() {
        const bit = current.bitacora || [];
        return `<div class="space-y-6">
            <div class="bg-surface-container-low rounded-xl p-4 border border-outline-variant/30">
                <h3 class="font-label-bold text-on-surface mb-3 flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">note_add</span>Nueva entrada</h3>
                <div class="space-y-3">
                    <textarea id="bit-nota" rows="3" class="sq-input" placeholder="Escribe una nota de seguimiento, observación de obra, avance, etc."></textarea>
                    <div class="flex flex-wrap items-center gap-3">
                        <select id="bit-tipo" class="sq-input max-w-xs text-sm">
                            <option value="nota">Nota de seguimiento</option>
                            <option value="evidencia">Evidencia fotográfica</option>
                            <option value="plano">Plano unifilar / diseño</option>
                            <option value="retie">Certificado RETIE</option>
                            <option value="documento">Otro documento</option>
                        </select>
                        <input type="file" id="bit-file" class="text-sm text-on-surface-variant file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-surface-container-high file:text-on-surface hover:file:bg-surface-variant" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx">
                        <button onclick="ProyectosModule.agregarBitacora()" class="sq-btn sq-btn-primary sq-btn-sm flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">send</span>Publicar</button>
                    </div>
                </div>
            </div>
            <div class="space-y-3">
                <h3 class="font-label-bold text-on-surface">Historial (${bit.length})</h3>
                ${!bit.length ? `<div class="text-sm text-on-surface-variant py-6 text-center">Sin entradas aún. Registra avances, sube evidencias, planos o certificados.</div>` : bit.map(e => renderBitEntry(e)).join('')}
            </div>
        </div>`;
    }
    function renderBitEntry(e) {
        const isImg = e.archivo?.mime?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(e.archivo?.path||'');
        const tipoLabels = {nota:'Nota', evidencia:'Evidencia', plano:'Plano unifilar', retie:'Certificado RETIE', documento:'Documento'};
        const fecha = e.fecha ? new Date(e.fecha).toLocaleString('es-CO',{dateStyle:'medium', timeStyle:'short'}) : '';
        return `<div class="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
            <div class="flex items-start justify-between gap-3 mb-2">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-[11px] px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-bold">${tipoLabels[e.tipo]||e.tipo||'Nota'}</span>
                    <span class="text-xs text-on-surface-variant">${fecha}</span>
                    ${e.autor?`<span class="text-xs text-on-surface-variant">· ${escapeHtml(e.autor)}</span>`:''}
                </div>
            </div>
            ${e.nota?`<p class="text-sm text-on-surface whitespace-pre-wrap mb-2">${escapeHtml(e.nota)}</p>`:''}
            ${e.archivo ? (isImg ? `<a href="${e.archivo.path}" target="_blank"><img src="${e.archivo.path}" alt="${escapeAttr(e.archivo.nombre||'')}" class="max-h-64 rounded-lg border border-outline-variant/20 object-cover"></a><div class="text-xs text-on-surface-variant mt-1">${escapeHtml(e.archivo.nombre||'')}</div>` : `<a href="${e.archivo.path}" target="_blank" class="inline-flex items-center gap-2 text-primary hover:underline text-sm"><span class="material-symbols-outlined text-[18px]">description</span>${escapeHtml(e.archivo.nombre||'Archivo')}</a>`) : ''}
        </div>`;
    }

    // ── TAB 4: FINANCIERO ────────────────────────────────────────────────
    function renderTabFinanciero() {
        const cot = current.cotizacion;
        const cr = current.costos_reales || {};
        const bom = current.bom || [];
        const costoMaterialesBom = bom.reduce((s,b)=> s + (Number(b.costo_unitario||b.precio_unitario||0) * Number(b.cantidad||0)), 0);
        const presupuesto = Number(cot?.total_inversion || cot?.subtotal || 0);
        const realMateriales = Number(cr.materiales ?? costoMaterialesBom) || 0;
        const realManoObra = Number(cr.mano_obra)||0;
        const realLogistica = Number(cr.logistica)||0;
        const realOtros = Number(cr.otros)||0;
        const totalReal = realMateriales + realManoObra + realLogistica + realOtros;
        const diff = presupuesto - totalReal;
        const pct = presupuesto>0 ? Math.round((totalReal/presupuesto)*100) : 0;
        return `<div class="space-y-6">
            ${!cot ? `<div class="p-4 rounded-xl bg-surface-container-low text-on-surface-variant text-sm">Esta instalación no tiene cotización vinculada; ingresa los valores manualmente.</div>` : ''}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="bg-surface-container-low rounded-xl p-4 border border-outline-variant/20"><div class="text-xs text-on-surface-variant mb-1">Presupuesto cotizado</div><div class="font-headline-md text-on-surface">${formatCurrency(presupuesto)}</div>${cot?`<div class="text-xs text-primary mt-1">${escapeHtml(cot.codigo||'')}</div>`:''}</div>
                <div class="bg-surface-container-low rounded-xl p-4 border border-outline-variant/20"><div class="text-xs text-on-surface-variant mb-1">Costo real ejecutado</div><div class="font-headline-md text-on-surface">${formatCurrency(totalReal)}</div><div class="text-xs text-on-surface-variant mt-1">${pct}% del presupuesto</div></div>
                <div class="bg-surface-container-low rounded-xl p-4 border ${diff>=0?'border-primary/30':'border-error/30'}"><div class="text-xs text-on-surface-variant mb-1">${diff>=0?'Margen / ahorro':'Sobrecosto'}</div><div class="font-headline-md ${diff>=0?'text-primary':'text-error'}">${formatCurrency(Math.abs(diff))}</div></div>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-surface-container-low rounded-xl p-5 border border-outline-variant/20">
                    <h3 class="font-label-bold text-on-surface mb-4">Presupuesto (cotización)</h3>
                    <div class="space-y-3 text-sm">
                        <div class="flex justify-between"><span class="text-on-surface-variant">Inversión total cotizada</span><span class="font-label-bold">${formatCurrency(Number(cot?.total_inversion)||0)}</span></div>
                        <div class="flex justify-between"><span class="text-on-surface-variant">Subtotal</span><span>${formatCurrency(Number(cot?.subtotal)||0)}</span></div>
                        <div class="flex justify-between"><span class="text-on-surface-variant">Margen comercial</span><span>${Number(cot?.margen_comercial_pct)||0}%</span></div>
                        <div class="flex justify-between"><span class="text-on-surface-variant">Materiales/equipos (según BOM)</span><span>${formatCurrency(costoMaterialesBom)}</span></div>
                    </div>
                </div>
                <div class="bg-surface-container-low rounded-xl p-5 border border-outline-variant/20">
                    <div class="flex items-center justify-between mb-4"><h3 class="font-label-bold text-on-surface">Costos reales ejecutados</h3><button onclick="ProyectosModule.guardarCostosReales()" class="sq-btn sq-btn-primary sq-btn-sm">Guardar</button></div>
                    <div class="space-y-3">
                        ${costInput('Materiales y equipos','cr-materiales', realMateriales)}
                        ${costInput('Mano de obra','cr-mano', realManoObra)}
                        ${costInput('Logística / transporte','cr-logistica', realLogistica)}
                        ${costInput('Otros costos','cr-otros', realOtros)}
                        <div class="flex justify-between pt-3 border-t border-outline-variant/20 font-label-bold"><span>Total real</span><span id="cr-total">${formatCurrency(totalReal)}</span></div>
                    </div>
                    <div class="mt-4"><label class="block text-xs text-on-surface-variant mb-1">Notas financieras</label><textarea id="cr-notas" rows="3" class="sq-input text-sm" placeholder="Observaciones sobre costos, desviaciones, proveedores...">${escapeHtml(cr.notas||'')}</textarea></div>
                </div>
            </div>
        </div>`;
    }
    function costInput(label,id,val){ return `<label class="block"><span class="text-xs text-on-surface-variant">${label}</span><input type="number" id="${id}" class="sq-input mt-1" value="${val||0}" min="0" step="any" oninput="ProyectosModule.recalcCostos()"></label>`; }

    // ── acciones datos ───────────────────────────────────────────────────
    function findPaso(pid){ return (current?.pasos||[]).find(p=>p.id===pid); }
    function findTarea(pid,tid){ return findPaso(pid)?.tareas?.find(t=>t.id===tid); }
    function recompute(p){ if(!p) return; (p.tareas||[]).forEach(t=>{ if((t.subtareas||[]).length) t.completada=t.subtareas.every(s=>s.completada); }); p.completado=(p.tareas||[]).length>0 && p.tareas.every(t=>t.completada); }

    async function agregarPaso(){ const nombre=prompt('Nombre de la nueva etapa:'); if(!nombre?.trim())return; current.pasos=current.pasos||[]; current.pasos.push({id:genId(),nombre:nombre.trim(),orden:current.pasos.length+1,completado:false,tareas:[]}); await saveCurrent(['pasos']); renderDrawer(); }
    async function renamePaso(pid){ const p=findPaso(pid); if(!p)return; const n=prompt('Nuevo nombre de la etapa:',p.nombre); if(n===null||!n.trim())return; p.nombre=n.trim(); await saveCurrent(['pasos']); renderDrawer(); }
    async function deletePaso(pid){ if(!confirm('¿Eliminar esta etapa y sus tareas?'))return; current.pasos=(current.pasos||[]).filter(p=>p.id!==pid); await saveCurrent(['pasos']); renderDrawer(); }
    async function agregarTarea(pid){ const titulo=prompt('Título de la tarea:'); if(!titulo?.trim())return; const p=findPaso(pid); if(!p)return; p.tareas=p.tareas||[]; p.tareas.push({id:genId(),titulo:titulo.trim(),completada:false,fecha_limite:null,responsable:'',subtareas:[]}); recompute(p); await saveCurrent(['pasos']); renderDrawer(); }
    async function editTarea(pid,tid){ const t=findTarea(pid,tid); if(!t)return; const n=prompt('Editar tarea:',t.titulo); if(n===null||!n.trim())return; t.titulo=n.trim(); await saveCurrent(['pasos']); renderDrawer(); }
    async function deleteTarea(pid,tid){ const p=findPaso(pid); if(!p||!confirm('¿Eliminar esta tarea?'))return; p.tareas=(p.tareas||[]).filter(t=>t.id!==tid); recompute(p); await saveCurrent(['pasos']); renderDrawer(); }
    async function agregarSubtarea(pid,tid){ const titulo=prompt('Título de la subtarea:'); if(!titulo?.trim())return; const t=findTarea(pid,tid); if(!t)return; t.subtareas=t.subtareas||[]; t.subtareas.push({id:genId(),titulo:titulo.trim(),completada:false}); recompute(findPaso(pid)); await saveCurrent(['pasos']); renderDrawer(); }
    async function editSubtarea(pid,tid,sid){ const s=findTarea(pid,tid)?.subtareas?.find(x=>x.id===sid); if(!s)return; const n=prompt('Editar subtarea:',s.titulo); if(n===null||!n.trim())return; s.titulo=n.trim(); await saveCurrent(['pasos']); renderDrawer(); }
    async function deleteSubtarea(pid,tid,sid){ const p=findPaso(pid); const t=findTarea(pid,tid); if(!t)return; t.subtareas=(t.subtareas||[]).filter(s=>s.id!==sid); recompute(p); await saveCurrent(['pasos']); renderDrawer(); }
    async function toggleTarea(pid,tid,sid){ const p=findPaso(pid); const t=findTarea(pid,tid); if(!t)return; if(sid){ const s=(t.subtareas||[]).find(x=>x.id===sid); if(!s)return; s.completada=!s.completada; } else { if((t.subtareas||[]).length)return; t.completada=!t.completada; } recompute(p); await saveCurrent(['pasos']); renderDrawer(); }
    async function updateTareaField(pid,tid,field,val){ const t=findTarea(pid,tid); if(!t)return; t[field]=val||null; await saveCurrent(['pasos']); /* no full rerender to keep focus */ const st=document.getElementById('save-status'); if(st){st.textContent='Guardado'; setTimeout(()=>st.textContent='',1200);} }

    async function toggleBom(idx,key,val){ if(!current.bom||!current.bom[idx])return; current.bom[idx][key]=!!val; await saveCurrent(['bom']); }

    async function agregarBitacora(){
        const nota=(document.getElementById('bit-nota')?.value||'').trim();
        const tipo=document.getElementById('bit-tipo')?.value||'nota';
        const file=document.getElementById('bit-file')?.files?.[0];
        if(!nota && !file){ showToast('Agrega una nota o un archivo','error'); return; }
        try{
            if(file){
                const fd=new FormData(); fd.append('file',file); fd.append('tipo',tipo); fd.append('nota',nota);
                const res=await fetch(`${App.API_BASE_URL}/api/proyectos/${current.id}/documentos`,{method:'POST',body:fd,credentials:'include'});
                const data=await res.json(); if(!res.ok) throw new Error(data.error||data.detail||'Error al subir');
                current.bitacora=data.bitacora||current.bitacora; showToast('Entrada agregada','success');
            } else {
                const data=await API.post(`/proyectos/${current.id}/bitacora-nota`,{nota});
                current.bitacora=data.bitacora||current.bitacora; showToast('Nota agregada','success');
            }
            renderDrawer();
        } catch(e){ showToast(e.message||'Error al agregar entrada','error'); }
    }

    function recalcCostos(){ const v=id=>Number(document.getElementById(id)?.value)||0; const total=v('cr-materiales')+v('cr-mano')+v('cr-logistica')+v('cr-otros'); const el=document.getElementById('cr-total'); if(el) el.textContent=formatCurrency(total); }
    async function guardarCostosReales(){
        const v=id=>Number(document.getElementById(id)?.value)||0;
        current.costos_reales={...(current.costos_reales||{}), materiales:v('cr-materiales'), mano_obra:v('cr-mano'), logistica:v('cr-logistica'), otros:v('cr-otros'), notas:(document.getElementById('cr-notas')?.value||'').trim()};
        await saveCurrent(['costos_reales']); renderDrawer(); showToast('Costos reales guardados','success');
    }

    async function saveCurrent(fields){
        if(!current||saving) return; saving=true; const st=document.getElementById('save-status'); if(st) st.textContent='Guardando...';
        try{
            const body={};
            if(!fields || fields.includes('pasos')) body.pasos=current.pasos||[];
            if(!fields || fields.includes('bom')) body.bom=current.bom||[];
            if(!fields || fields.includes('bitacora')) body.bitacora=current.bitacora||[];
            if(!fields || fields.includes('costos_reales')) body.costos_reales=current.costos_reales||{};
            const res=await API.put(`/proyectos/${current.id}`, body);
            // merge updated
            if(res){ current={...current,...res, pasos:res.pasos??current.pasos, bom:res.bom??current.bom, bitacora:res.bitacora??current.bitacora, costos_reales:res.costos_reales??current.costos_reales}; }
            if(st) st.textContent='Guardado';
            setTimeout(()=>{ const s=document.getElementById('save-status'); if(s) s.textContent=''; },1200);
        } catch(e){ showToast(e.message||'Error al guardar','error'); if(st) st.textContent='Error'; }
        finally{ saving=false; }
    }

    async function eliminar(id){
        confirmAction('¿Eliminar esta instalación y todo su seguimiento?', async ()=>{ try{ await API.delete(`/proyectos/${id}`); showToast('Instalación eliminada','success'); if(current&&current.id===id) closeDrawer(); else {await cargar(); renderLista();} } catch(e){ showToast(e.message||'Error','error'); } });
    }

    function genId(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
    function escapeHtml(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    function escapeAttr(v){ return escapeHtml(v).replace(/"/g,'&quot;'); }

    return { init, openNuevaInstalacion, onCotizacionChange, crearInstalacion, openDrawer, closeDrawer, setTab, agregarPaso, renamePaso, deletePaso, agregarTarea, editTarea, deleteTarea, agregarSubtarea, editSubtarea, deleteSubtarea, toggleTarea, updateTareaField, toggleBom, agregarBitacora, guardarCostosReales, recalcCostos, eliminar };
})();

window.renderProyectos = function() { ProyectosModule.init(); };
