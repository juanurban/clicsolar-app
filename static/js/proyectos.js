/**
 * SunQuote — Instalaciones Fotovoltaicas
 * Lista (#proyectos) + página completa de detalle (#proyectos/:id) con pestañas.
 */

window.ProyectosModule = (function () {
    let instalaciones = [];
    let filtros = { buscar: '' };
    let current = null;
    let activeTab = 'tareas';
    let saving = false;

    async function init(id) {
        if (id) return renderDetallePage(id);
        return renderListaPage();
    }

    // ── LISTA ─────────────────────────────────────────────────────────────
    async function renderListaPage() {
        const container = document.getElementById('app-content');
        container.innerHTML = `
            <div class="p-4 lg:p-10 max-w-7xl mx-auto fade-in">
                <div class="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 mb-8">
                    <div class="flex flex-col gap-2">
                        <span class="font-label-bold text-label-bold text-primary tracking-widest uppercase">Gestión de instalaciones</span>
                        <h1 class="font-display-lg text-display-lg text-on-surface">Instalaciones Fotovoltaicas</h1>
                        <p class="text-on-surface-variant max-w-2xl">Da clic en una instalación para abrir su ventana de gestión y seguimiento.</p>
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
                    <a href="#proyectos/${i.id}" class="text-left block">
                        <div class="flex flex-col">
                            <span class="font-label-bold text-on-surface hover:text-primary transition-colors underline-offset-2 hover:underline">${escapeHtml(i.nombre)}</span>
                            <span class="text-xs text-on-surface-variant flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">person</span>${escapeHtml(i.cliente_nombre||'')}</span>
                        </div>
                    </a>
                </td>
                <td>${i.cotizacion_codigo ? `<span class="font-mono text-primary text-sm">${escapeHtml(i.cotizacion_codigo)}</span>${i.cotizacion_titulo?`<div class="text-xs text-on-surface-variant">· ${escapeHtml(i.cotizacion_titulo)}</div>`:''}` : '<span class="text-on-surface-variant text-sm">—</span>'}</td>
                <td><span class="px-2 py-1 rounded-lg bg-surface-container-high text-xs font-label-bold">${escapeHtml(i.paso_actual || 'Sin etapas')}</span></td>
                <td>${progresoBadge(i)}</td>
                <td class="text-on-surface-variant text-sm">${formatShortDate(i.updated_at || i.created_at)}</td>
                <td class="text-right" onclick="event.stopPropagation()">
                    <button onclick="ProyectosModule.eliminar(${i.id}, true)" class="p-2 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-error opacity-70 group-hover:opacity-100" title="Eliminar"><span class="material-symbols-outlined text-[20px]">delete</span></button>
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
            closeModal();
            if (res.id) window.location.hash = '#proyectos/' + res.id;
            else { await cargar(); renderLista(); }
        } catch (err) { showToast(err.message || 'Error al crear instalación', 'error'); }
    }

    // ── DETALLE (página completa) ─────────────────────────────────────────
    async function renderDetallePage(id) {
        const container = document.getElementById('app-content');
        container.innerHTML = `<div class="p-16 flex justify-center"><div class="sq-spinner"></div></div>`;
        try {
            current = await API.get(`/proyectos/${id}`);
            activeTab = activeTab || 'tareas';
            renderDetalle();
        } catch (e) {
            container.innerHTML = `<div class="p-12 text-center text-on-surface-variant">
                <span class="material-symbols-outlined text-[48px] mb-3 block">error</span>
                <p class="mb-4">No se pudo cargar la instalación.</p>
                <a href="#proyectos" class="sq-btn sq-btn-secondary">Volver a instalaciones</a>
            </div>`;
        }
    }

    function canSeeFinanciero() {
        if (App?.user?.es_superadmin) return true;
        const p = App?.permisos || [];
        return p.includes('configuracion') || p.includes('financiero') || p.includes('dashboard') || p.includes('*') || p.includes('all');
    }

    function renderDetalle() {
        if (!current) return;
        const inst = current;
        const container = document.getElementById('app-content');
        const prog = inst.progreso || { tareasCompletadas:0, tareasTotal:0, pct:0 };
        const tabs = [
            { id: 'tareas', label: 'Tareas por etapas', icon: 'checklist' },
            { id: 'bom', label: 'Equipos y materiales', icon: 'inventory_2' },
            { id: 'bitacora', label: 'Archivos', icon: 'folder' },
        ];
        if (!tabs.find(t=>t.id===activeTab)) activeTab = 'tareas';

        container.innerHTML = `
        <div class="min-h-[calc(100vh-4rem)] lg:min-h-[calc(100vh-5rem)] flex flex-col bg-surface">
            <div class="px-4 lg:px-10 py-5 border-b border-outline-variant/30 bg-surface-container-low flex-shrink-0">
                <div class="max-w-7xl mx-auto">
                    <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 text-xs text-on-surface-variant mb-2">
                                <a href="#proyectos" class="hover:text-primary flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">arrow_back</span> Instalaciones</a>
                                ${inst.cotizacion_codigo ? `<span class="font-mono text-primary">· ${escapeHtml(inst.cotizacion_codigo)}${inst.cotizacion_titulo?' · '+escapeHtml(inst.cotizacion_titulo):''}</span>` : ''}
                            </div>
                            <h1 class="font-headline-lg text-on-surface leading-tight">${escapeHtml(inst.nombre)}</h1>
                            <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-on-surface-variant mt-2">
                                <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">person</span>${escapeHtml(inst.cliente_nombre||'')}</span>
                                ${inst.cotizacion?.potencia_kwp ? `<span class="flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">bolt</span>${inst.cotizacion.potencia_kwp} kWp</span>` : ''}
                                ${inst.cotizacion?.total_inversion ? `<span class="text-primary font-label-bold">${formatCurrency(inst.cotizacion.total_inversion)}</span>` : ''}
                                <span id="save-status" class="text-primary text-xs"></span>
                            </div>
                        </div>
                        <div class="flex items-center gap-4 flex-shrink-0">
                            <div class="min-w-[220px]">
                                <div class="flex justify-between text-xs text-on-surface-variant mb-1"><span>Progreso general</span><span class="text-primary font-label-bold">${prog.tareasCompletadas||0}/${prog.tareasTotal||0} · ${prog.pct||0}%</span></div>
                                <div class="h-2.5 bg-surface-container-high rounded-full overflow-hidden"><div class="h-full bg-primary rounded-full transition-all" style="width:${prog.pct||0}%"></div></div>
                            </div>
                            <button onclick="ProyectosModule.eliminar(${inst.id}, false)" class="p-2 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error" title="Eliminar instalación"><span class="material-symbols-outlined">delete</span></button>
                        </div>
                    </div>
                    <div class="flex gap-2 mt-5 overflow-x-auto pb-1">
                        ${tabs.map(t => `<button onclick="ProyectosModule.setTab('${t.id}')" class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-label-bold whitespace-nowrap transition-all ${activeTab===t.id?'bg-primary text-on-primary shadow-md':'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'}"><span class="material-symbols-outlined text-[18px]">${t.icon}</span>${t.label}</button>`).join('')}
                    </div>
                </div>
            </div>
            <div class="flex-1 overflow-y-auto">
                <div class="w-full p-4 lg:p-10" id="tab-content">${renderTabContent()}</div>
            </div>
        </div>`;
    }

    function setTab(id) { activeTab = id; renderDetalle(); }
    function renderTabContent() {
        if (activeTab === 'tareas') return renderTabTareas();
        if (activeTab === 'bom') return renderTabBOM();
        if (activeTab === 'bitacora') return renderTabBitacora();
        if (activeTab === 'financiero') return renderTabFinanciero();
        return '';
    }

    // ── TAB 1: TAREAS POR ETAPAS (Data Grid) ─────────────────────────────
    let taskSort={key:'id',dir:'asc'};
    let taskPage=1;
    let taskPageSize=10;
    function flattenTasks(){
        const out=[]; let idx=0;
        (current.pasos||[]).forEach(p=>{
            (p.tareas||[]).forEach(t=>{
                const cl=t.checklist||[]; const done=cl.filter(c=>c.completed).length; const prog=cl.length?Math.round(done/cl.length*100):(t.completada?100:0);
                const adj = (current.bitacora||[]).filter(b=>(b.etiquetas||[]).includes('tarea:'+t.id)).length;
                out.push({id:++idx, realId:t.id, pasoId:p.id, pasoNombre:p.nombre, title:t.titulo, isCompleted:!!t.completada, startDate:t.fecha_inicio||null, dueDate:t.fecha_limite||null, milestone:p.nombre, assignee:t.responsable||'', status:t.status||(t.completada?'Completado':'Hacer'), tags:[], progress:prog, adjuntos:adj});
            });
        });
        return out;
    }
    function renderTabTareas() {
        const tasks = flattenTasks();
        // sort
        tasks.sort((a,b)=>{
            let va=a[taskSort.key], vb=b[taskSort.key];
            if(va==null) va=''; if(vb==null) vb='';
            if(va<vb) return taskSort.dir==='asc'?-1:1;
            if(va>vb) return taskSort.dir==='asc'?1:-1;
            return 0;
        });
        const total=tasks.length;
        const pages=Math.max(1,Math.ceil(total/taskPageSize));
        if(taskPage>pages) taskPage=pages;
        const slice=tasks.slice((taskPage-1)*taskPageSize, taskPage*taskPageSize);
        const sortIcon=(k)=> taskSort.key===k ? (taskSort.dir==='asc'?'↑':'↓') : '';
        const today=new Date().toISOString().slice(0,10);
        const rows=slice.map(t=>{
            const overdue = t.dueDate && t.dueDate < today && !t.isCompleted;
            return `<tr class="border-b border-outline-variant/10 hover:bg-surface-container/50">
                <td class="px-4 py-3"><input type="checkbox" class="w-4 h-4 accent-primary" ${t.isCompleted?'checked':''} onchange="ProyectosModule.toggleTarea('${t.pasoId}','${t.realId}')"></td>
                <td class="px-4 py-3 text-xs text-on-surface-variant">${Number(t.id)||t.id}</td>
                <td class="px-4 py-3"><a href="#" onclick="ProyectosModule.openTaskModal('${t.pasoId}','${t.realId}');return false;" class="text-on-surface hover:text-primary font-label-bold">${escapeHtml(t.title)}</a></td>
                <td class="px-4 py-3 text-xs text-on-surface-variant">${t.startDate||'-'}</td>
                <td class="px-4 py-3 text-xs ${overdue?'text-error font-bold':'text-on-surface-variant'}">${t.dueDate||'-'}</td>
                <td class="px-4 py-3 text-xs text-on-surface-variant">${escapeHtml(t.milestone)}</td>
                <td class="px-4 py-3 text-xs text-on-surface-variant">${escapeHtml(t.assignee||'-')}</td>
                <td class="px-4 py-3"><div class="w-24 h-2 bg-surface-container-high rounded"><div class="h-2 bg-primary rounded" style="width:${t.progress}%"></div></div><div class="text-[10px] text-on-surface-variant">${t.progress}%</div></td>
                <td class="px-4 py-3 text-center">${t.adjuntos||0}</td>
                <td class="px-4 py-3"><span class="text-[11px] px-2 py-0.5 rounded-full ${t.status==='Completado'?'bg-primary/20 text-primary':'bg-surface-container-high text-on-surface-variant'}">${t.status}</span></td>
                <td class="px-4 py-3 text-center"><button onclick="ProyectosModule.deleteTarea('${t.pasoId}','${t.realId}')" class="p-1 text-on-surface-variant hover:text-error"><span class="material-symbols-outlined text-[16px]">close</span></button></td>
            </tr>`;
        }).join('');
        return `<div class="space-y-4">
            <div class="flex justify-between items-center">
                <p class="text-sm text-on-surface-variant">Gestión de tareas en grilla.</p>
                <button onclick="ProyectosModule.agregarPaso()" class="sq-btn sq-btn-secondary sq-btn-sm flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">add</span>Nueva etapa</button>
                <button onclick="ProyectosModule.agregarTareaRapida()" class="sq-btn sq-btn-primary sq-btn-sm flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">add</span>Agregar tarea</button>
            </div>
            <div class="overflow-x-auto rounded-xl border border-outline-variant/30 bg-surface-container-low">
                <table class="sq-table w-full text-sm" style="width:100%;">
                    <thead><tr>
                        <th class="px-4 py-3"></th>
                        <th class="px-4 py-3 cursor-pointer" onclick="ProyectosModule.sortTasks('id')">ID ${sortIcon('id')}</th>
                        <th class="px-4 py-3 cursor-pointer" onclick="ProyectosModule.sortTasks('title')">Título ${sortIcon('title')}</th>
                        <th class="px-4 py-3 cursor-pointer" onclick="ProyectosModule.sortTasks('startDate')">Inicio ${sortIcon('startDate')}</th>
                        <th class="px-4 py-3 cursor-pointer" onclick="ProyectosModule.sortTasks('dueDate')">Límite ${sortIcon('dueDate')}</th>
                        <th class="px-4 py-3">Hito</th>
                        <th class="px-4 py-3">Asignado</th>
                        <th class="px-4 py-3">Progreso</th>
                        <th class="px-4 py-3">Adjuntos</th>
                        <th class="px-4 py-3 cursor-pointer" onclick="ProyectosModule.sortTasks('status')">Estado ${sortIcon('status')}</th>
                        <th class="px-4 py-3">Acciones</th>
                    </tr></thead>
                    <tbody>${rows||'<tr><td colspan="11" class="text-center py-8 text-on-surface-variant">Sin tareas</td></tr>'}</tbody>
                </table>
            </div>
            <div class="flex items-center justify-between text-sm">
                <div class="flex items-center gap-2">
                    <span class="text-on-surface-variant">Por página:</span>
                    <select class="sq-input text-sm w-20" onchange="ProyectosModule.setTaskPageSize(this.value)">
                        <option value="10" ${taskPageSize==10?'selected':''}>10</option>
                        <option value="25" ${taskPageSize==25?'selected':''}>25</option>
                        <option value="50" ${taskPageSize==50?'selected':''}>50</option>
                    </select>
                </div>
                <div class="text-on-surface-variant">${(taskPage-1)*taskPageSize+1}-${Math.min(taskPage*taskPageSize,total)} / ${total}</div>
                <div class="flex gap-1">
                    <button class="sq-btn sq-btn-secondary sq-btn-sm" onclick="ProyectosModule.prevTaskPage()" ${taskPage<=1?'disabled':''}>&lt;</button>
                    <button class="sq-btn sq-btn-secondary sq-btn-sm" onclick="ProyectosModule.nextTaskPage()" ${taskPage>=pages?'disabled':''}>&gt;</button>
                </div>
            </div>
        </div>`;
    }

    function renderFinancieroResumen() {
        const cot = current.cotizacion;
        const cr = current.costos_reales || {};
        const bom = current.bom || [];
        const costoMaterialesBom = bom.reduce((s,b)=> {
            const pu = Number(b.costo_unitario || 0) || (b.iva ? Number(b.precio_unitario||0)/1.19 : Number(b.precio_unitario||0));
            return s + pu * Number(b.cantidad||0);
        }, 0);
        const presupuesto = (Number(cot?.total_inversion || cot?.subtotal || 0)) / 1.19;
        const realMateriales = Number(cr.materiales ?? costoMaterialesBom) || 0;
        const realManoObra = Number(cr.mano_obra)||0;
        const realLogistica = Number(cr.logistica)||0;
        const realOtros = Number(cr.otros)||0;
        const totalReal = realMateriales + realManoObra + realLogistica + realOtros;
        const diff = presupuesto - totalReal;
        return `<div class="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="bg-surface-container-low rounded-xl p-5 border border-outline-variant/20"><div class="text-xs text-on-surface-variant mb-1">Presupuesto cotizado (sin IVA)</div><div class="font-headline-md text-on-surface">${formatCurrency(presupuesto)}</div></div>
            <div class="bg-surface-container-low rounded-xl p-4 border border-outline-variant/20">${costInput('Mano de obra','cr-mano', realManoObra)}</div>
            <div class="bg-surface-container-low rounded-xl p-4 border border-outline-variant/20">${costInput('Logística / transporte','cr-logistica', realLogistica)}</div>
            <div class="bg-surface-container-low rounded-xl p-4 border border-outline-variant/20">${costInput('Otros costos','cr-otros', realOtros)}</div>
        </div>
        <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-surface-container-low rounded-xl p-5 border border-outline-variant/20"><div class="text-xs text-on-surface-variant mb-1">Costo real ejecutado</div><div class="font-headline-md text-on-surface">${formatCurrency(totalReal)}</div></div>
            <div class="bg-surface-container-low rounded-xl p-5 border ${diff>=0?'border-primary/30':'border-error/30'}"><div class="text-xs text-on-surface-variant mb-1">${diff>=0?'Ganancia final':'Sobrecosto'}</div><div class="font-headline-md ${diff>=0?'text-primary':'text-error'}">${formatCurrency(Math.abs(diff))}</div>
                <button onclick="ProyectosModule.guardarCostosReales()" class="sq-btn sq-btn-primary sq-btn-sm mt-2">Guardar costos</button>
            </div>
        </div>`;
    }
    // ── TAB 2: BOM ───────────────────────────────────────────────────────
    function renderTabBOM() {
        loadBomInventory().then(()=>{ setTimeout(()=>populateBomCategories(),0); });
        const bom = current.bom || [];
        const cot = current.cotizacion;
        if (!bom.length) return `<div class="space-y-4">
            ${renderFinancieroResumen()}
            <div class="flex flex-wrap gap-2 items-end bg-surface-container-low rounded-xl p-3 border border-outline-variant/30">
                <div class="flex flex-col">
                    <label class="text-xs text-on-surface-variant mb-1">Categoría</label>
                    <select id="bom-cat-filter" class="sq-input text-sm" onchange="ProyectosModule.onBomCatChange()"><option value="">Todas</option></select>
                </div>
                <div class="flex flex-col flex-1 min-w-[200px]">
                    <label class="text-xs text-on-surface-variant mb-1">Ítem</label>
                    <select id="bom-item-filter" class="sq-input text-sm"><option value="">Seleccione...</option></select>
                </div>
                <div class="flex flex-col w-24">
                    <label class="text-xs text-on-surface-variant mb-1">Cantidad</label>
                    <input id="bom-qty-filter" type="number" class="sq-input text-sm" value="1" min="1" step="any">
                </div>
                <button type="button" class="sq-btn sq-btn-primary sq-btn-sm" onclick="ProyectosModule.addBomFiltered()"><span class="material-symbols-outlined">add</span> Agregar</button>
                <button type="button" class="sq-btn sq-btn-secondary sq-btn-sm" onclick="ProyectosModule.addBomItem()"><span class="material-symbols-outlined">edit</span> Ítem manual</button>
            </div>
            ${renderFinancieroResumen()}
            <div class="text-center text-on-surface-variant py-16"><span class="material-symbols-outlined text-[56px] opacity-30 mb-3 block">inventory_2</span><p>No hay equipos/materiales. Agrega ítems con los botones de arriba.</p></div>
        </div>`;
        return `<div class="space-y-4">
            ${renderFinancieroResumen()}
            <p class="text-sm text-on-surface-variant">Lista de equipos y materiales de la instalación. Edita cantidad y precio unitario; el total se calcula automáticamente.</p>
            <div class="flex flex-wrap gap-2 items-end bg-surface-container-low rounded-xl p-3 border border-outline-variant/30">
                <div class="flex flex-col">
                    <label class="text-xs text-on-surface-variant mb-1">Categoría</label>
                    <select id="bom-cat-filter" class="sq-input text-sm" onchange="ProyectosModule.onBomCatChange()"><option value="">Todas</option></select>
                </div>
                <div class="flex flex-col flex-1 min-w-[200px]">
                    <label class="text-xs text-on-surface-variant mb-1">Ítem</label>
                    <select id="bom-item-filter" class="sq-input text-sm"><option value="">Seleccione...</option></select>
                </div>
                <div class="flex flex-col w-24">
                    <label class="text-xs text-on-surface-variant mb-1">Cantidad</label>
                    <input id="bom-qty-filter" type="number" class="sq-input text-sm" value="1" min="1" step="any">
                </div>
                <button type="button" class="sq-btn sq-btn-primary sq-btn-sm" onclick="ProyectosModule.addBomFiltered()"><span class="material-symbols-outlined">add</span> Agregar</button>
                <button type="button" class="sq-btn sq-btn-secondary sq-btn-sm" onclick="ProyectosModule.addBomItem()"><span class="material-symbols-outlined">edit</span> Ítem manual</button>
            </div>
            <div class="overflow-x-auto rounded-xl border border-outline-variant/30 bg-surface-container-low">
                <table class="sq-table w-full">
                    <thead><tr><th>Ítem</th><th class="text-center">Cant.</th><th class="text-right">Precio unitario</th><th class="text-right">Precio total</th><th class="text-center">Acciones</th></tr></thead>
                    <tbody>${bom.map((b,i)=>`
                        <tr>
                            <td><input type="text" class="sq-input w-full" value="${escapeHtml(b.nombre||'')}" onchange="ProyectosModule.updateBomNombre(${i}, this.value)" placeholder="Nombre del ítem"><div class="text-xs text-on-surface-variant mt-1">${escapeHtml(b.categoria||'')}</div></td>
                            <td class="text-center"><input type="number" class="sq-input w-20 text-center" value="${b.cantidad||0}" min="0" step="any" onchange="ProyectosModule.updateBomQty(${i}, this.value)"></td>
                            <td class="text-right"><input type="number" class="sq-input w-32 text-right" value="${b.precio_unitario||b.costo_unitario||0}" min="0" step="any" onchange="ProyectosModule.updateBomPrecio(${i}, this.value)"></td>
                            <td class="text-right font-label-bold text-primary">${formatCurrency((Number(b.cantidad)||0)*(Number(b.precio_unitario||b.costo_unitario)||0))}</td>
                            <td class="text-center"><button type="button" class="p-1 text-on-surface-variant hover:text-error" onclick="ProyectosModule.removeBomItem(${i})" title="Eliminar"><span class="material-symbols-outlined text-[18px]">delete</span></button></td>
                        </tr>`).join('')}
                    </tbody>
                    <tfoot><tr><td colspan="3" class="text-right font-bold">Total materiales</td><td class="text-right font-bold text-primary">${formatCurrency(bom.reduce((s,b)=>s+(Number(b.cantidad)||0)*(Number(b.precio_unitario||b.costo_unitario)||0),0))}</td><td></td></tr></tfoot>
                </table>
            </div>
        </div>`;
    }

    // ── TAB 3: BITÁCORA ──────────────────────────────────────────────────
    function renderTabBitacora() {
        const bit = current.bitacora || [];
        return `<div class="space-y-6">
            <div class="bg-surface-container-low rounded-xl p-5 border border-outline-variant/30">
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
                        <input type="text" id="bit-tags" class="sq-input text-sm" placeholder="Etiquetas (separadas por coma)">
                        <button onclick="ProyectosModule.agregarBitacora()" class="sq-btn sq-btn-primary sq-btn-sm flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">send</span>Publicar</button>
                    </div>
                </div>
            </div>
            <div class="bg-surface-container-low rounded-xl p-4 border border-outline-variant/30">
                <h3 class="font-label-bold text-on-surface mb-2 flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">label</span>Etiquetas</h3>
                <div class="flex gap-2 mb-2"><input id="tag-new" class="sq-input text-sm" placeholder="Nueva etiqueta"><button type="button" class="sq-btn sq-btn-primary sq-btn-sm" onclick="ProyectosModule.createTag()">Crear</button></div>
                <div class="flex flex-wrap gap-2">${(current.tags||[]).map(t=>`<span class="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary flex items-center gap-1">${escapeHtml(t)} <button onclick="ProyectosModule.deleteTag('${escapeAttr(t)}')" class="hover:text-error"><span class="material-symbols-outlined text-[14px]">close</span></button></span>`).join('')||'<span class="text-xs text-on-surface-variant">Sin etiquetas</span>'}</div>
            </div>
            <div class="space-y-3">
                <h3 class="font-label-bold text-on-surface">Historial (${bit.length})</h3>
                ${!bit.length ? `<div class="text-sm text-on-surface-variant py-8 text-center border border-dashed border-outline-variant/30 rounded-xl">Sin entradas aún. Registra avances, sube evidencias, planos o certificados.</div>` : bit.map(e => renderBitEntry(e)).join('')}
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
                    ${(e.etiquetas||[]).map(t=>`<span class="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">${escapeHtml(t)}</span>`).join('')}
                </div>
                <button onclick="ProyectosModule.editBitacora('${e.id}')" class="p-1 text-on-surface-variant hover:text-primary" title="Editar"><span class="material-symbols-outlined text-[18px]">edit</span></button>
                <button onclick="ProyectosModule.deleteBitacora('${e.id}')" class="p-1 text-on-surface-variant hover:text-error" title="Eliminar"><span class="material-symbols-outlined text-[18px]">delete</span></button>
            </div>
            ${e.nota?`<p class="text-sm text-on-surface whitespace-pre-wrap mb-2">${escapeHtml(e.nota)}</p>`:''}
            ${e.archivo ? (isImg ? `<a href="${e.archivo.path}" target="_blank"><img src="${e.archivo.path}" alt="${escapeAttr(e.archivo.nombre||'')}" class="max-h-72 rounded-lg border border-outline-variant/20 object-cover"></a><div class="text-xs text-on-surface-variant mt-1">${escapeHtml(e.archivo.nombre||'')}</div>` : `<a href="${e.archivo.path}" target="_blank" class="inline-flex items-center gap-2 text-primary hover:underline text-sm"><span class="material-symbols-outlined text-[18px]">description</span>${escapeHtml(e.archivo.nombre||'Archivo')}</a>`) : ''}
        </div>`;
    }

    // ── TAB 4: FINANCIERO ────────────────────────────────────────────────
    function renderTabFinanciero() {
        const cot = current.cotizacion;
        const cr = current.costos_reales || {};
        const bom = current.bom || [];
        const costoMaterialesBom = bom.reduce((s,b)=> {
            const pu = Number(b.costo_unitario || 0) || (b.iva ? Number(b.precio_unitario||0)/1.19 : Number(b.precio_unitario||0));
            return s + pu * Number(b.cantidad||0);
        }, 0);
        const presupuesto = (Number(cot?.total_inversion || cot?.subtotal || 0)) / 1.19;
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
                <div class="bg-surface-container-low rounded-xl p-5 border border-outline-variant/20"><div class="text-xs text-on-surface-variant mb-1">Presupuesto cotizado (sin IVA)</div><div class="font-headline-md text-on-surface">${formatCurrency(presupuesto)}</div>${cot?`<div class="text-xs text-primary mt-1">${escapeHtml(cot.codigo||'')}</div>`:''}</div>
                <div class="bg-surface-container-low rounded-xl p-5 border border-outline-variant/20"><div class="text-xs text-on-surface-variant mb-1">Costo real ejecutado</div><div class="font-headline-md text-on-surface">${formatCurrency(totalReal)}</div><div class="text-xs text-on-surface-variant mt-1">${pct}% del presupuesto</div></div>
                <div class="bg-surface-container-low rounded-xl p-5 border ${diff>=0?'border-primary/30':'border-error/30'}"><div class="text-xs text-on-surface-variant mb-1">${diff>=0?'Margen / ahorro':'Sobrecosto'}</div><div class="font-headline-md ${diff>=0?'text-primary':'text-error'}">${formatCurrency(Math.abs(diff))}</div></div>
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

    async function agregarPaso(){ const nombre=prompt('Nombre de la nueva etapa:'); if(!nombre?.trim())return; current.pasos=current.pasos||[]; current.pasos.push({id:genId(),nombre:nombre.trim(),orden:current.pasos.length+1,completado:false,tareas:[]}); await saveCurrent(['pasos']); renderDetalle(); }
    async function renamePaso(pid){ const p=findPaso(pid); if(!p)return; const n=prompt('Nuevo nombre de la etapa:',p.nombre); if(n===null||!n.trim())return; p.nombre=n.trim(); await saveCurrent(['pasos']); renderDetalle(); }
    async function deletePaso(pid){ if(!confirm('¿Eliminar esta etapa y sus tareas?'))return; current.pasos=(current.pasos||[]).filter(p=>p.id!==pid); await saveCurrent(['pasos']); renderDetalle(); }
    async function agregarTarea(pid){ const titulo=prompt('Título de la tarea:'); if(!titulo?.trim())return; const p=findPaso(pid); if(!p)return; p.tareas=p.tareas||[]; p.tareas.push({id:genId(),titulo:titulo.trim(),completada:false,status:'Hacer',fecha_limite:null,responsable:'',subtareas:[]}); recompute(p); await saveCurrent(['pasos']); renderDetalle(); }
    function openTaskModal(pid,tid){
        const t=findTarea(pid,tid);
        if(!t) return;
        const p=findPaso(pid);
        const overlay=document.createElement('div');
        overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML=`<div class="bg-surface-container-low text-on-surface rounded-xl w-[90%] max-w-[700px] max-h-[85vh] overflow-auto p-5 border border-outline-variant/30">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <h3 style="font-weight:bold;font-size:18px;">Tarea #${t.id}</h3>
                <button onclick="this.closest('div').parentElement.parentElement.remove()" style="color:#f4bf00;"><span class="material-symbols-outlined">close</span></button>
            </div>
            <input id="tm-title" class="sq-input w-full" value="${escapeAttr(t.titulo||'')}" class="sq-input">
            <textarea id="tm-desc" class="sq-input w-full mt-2" rows="3" placeholder="Descripción..." class="sq-input">${escapeHtml(t.descripcion||'')}</textarea>
            <div style="margin-top:12px;display:flex;gap:12px;flex-wrap:wrap;">
                <label class="text-xs">Estado: <select id="tm-status" class="sq-input text-sm" ><option ${t.completada?'':'selected'} value="Hacer">Hacer</option><option value="En progreso">En progreso</option><option value="Completado" ${t.completada?'selected':''}>Completado</option></select></label>
                <label class="text-xs">Inicio: <input id="tm-start" type="date" class="sq-input text-sm" value="${t.fecha_inicio||''}" class="sq-input"></label>
                <label class="text-xs">Límite: <input id="tm-due" type="date" class="sq-input text-sm" value="${t.fecha_limite||''}" class="sq-input"></label>
                <label class="text-xs">Responsable: <select id="tm-resp" class="sq-input text-sm"><option value="">Sin asignar</option></select></label>
            </div>
            <div style="margin-top:16px;">
                <div style="font-weight:bold;margin-bottom:6px;">Checklist <span id="tm-check-progress" style="font-weight:normal;font-size:12px;color:#888;"></span></div>
                <div id="tm-checklist"></div>
                <div style="display:flex;gap:8px;margin-top:8px;">
                    <input id="tm-check-new" class="sq-input text-sm flex-1" placeholder="Agregar artículo" class="sq-input">
                    <button type="button" class="sq-btn sq-btn-primary sq-btn-sm" id="tm-check-add">Agregar</button>
                </div>
            </div>
            <div style="margin-top:16px;">
                <div style="font-weight:bold;margin-bottom:6px;">Comentarios</div>
                <div id="tm-comments" style="max-height:200px;overflow:auto;margin-bottom:8px;"></div>
                <textarea id="tm-comment" class="sq-input w-full text-sm" rows="2" placeholder="Escribe un comentario..." class="sq-input"></textarea>
                <button type="button" class="sq-btn sq-btn-primary sq-btn-sm mt-2" id="tm-comment-pub">Publicar</button>
            </div>
            <div style="margin-top:16px;">
                <div style="font-weight:bold;margin-bottom:6px;">Adjuntos (van a Archivos)</div>
                <input type="file" id="tm-file" class="text-sm text-on-surface-variant" accept="image/*,video/*,.pdf,.doc,.docx">
                <button type="button" class="sq-btn sq-btn-secondary sq-btn-sm mt-2" id="tm-upload">Subir adjunto</button>
            </div>
            <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
                <button type="button" class="sq-btn sq-btn-secondary sq-btn-sm" onclick="ProyectosModule.deleteTarea('${pid}','${tid}');this.closest('div').parentElement.parentElement.remove();">Eliminar</button>
                <button type="button" class="sq-btn sq-btn-primary sq-btn-sm" id="tm-save">Guardar</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        const checklist = t.checklist || (t.checklist=[]);
        const comments = t.comments || (t.comments=[]);
        window._tmToggleCheck = (i, val) => { checklist[i].completed = val; const allDone = checklist.length>0 && checklist.every(c=>c.completed); if (allDone) t.completada = true; renderChecklist(); };
        window._tmRemoveCheck = (i) => { checklist.splice(i,1); renderChecklist(); };
        const renderChecklist = () => {
            const el = overlay.querySelector('#tm-checklist');
            const done = checklist.filter(c=>c.completed).length;
            const prog = overlay.querySelector('#tm-check-progress');
            if (prog) prog.textContent = `(${done}/${checklist.length})`;
            el.innerHTML = checklist.map((c,i)=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <input type="checkbox" ${c.completed?'checked':''} onchange="window._tmToggleCheck(${i}, this.checked);">
                <span style="flex:1;${c.completed?'text-decoration:line-through;opacity:.6;':''}">${escapeHtml(c.text)}</span>
                <button onclick="window._tmRemoveCheck(${i});" style="color:#f4bf00;"><span class="material-symbols-outlined text-[16px]">close</span></button>
            </div>`).join('') || '<div style="color:#888;font-size:12px;">Sin ítems</div>';
        };
        let replyTo = null;
        const renderComments = () => {
            const el = overlay.querySelector('#tm-comments');
            const topLevel = comments.filter(c=>!c.parentId);
            const renderOne = (c, depth) => {
                const replies = comments.filter(r=>r.parentId===c.id);
                return `<div style="margin-left:${depth*16}px;border-bottom:1px solid #333;padding:6px 0;font-size:13px;">
                    <b>${escapeHtml(c.autor||'Tú')}</b>: ${escapeHtml(c.text)} <span style="color:#888;font-size:10px;">${c.fecha||''}</span>
                    <button type="button" style="color:#f4bf00;font-size:11px;margin-left:8px;" onclick="(function(){const i=document.getElementById('tm-comment'); i.dataset.reply='${c.id}'; i.placeholder='Responder a ${escapeHtml(c.autor||'')}...'; i.focus();})()">Responder</button>
                    ${replies.map(r=>renderOne(r,depth+1)).join('')}
                </div>`;
            };
            el.innerHTML = topLevel.map(c=>renderOne(c,0)).join('') || '<div style="color:#888;font-size:12px;">Sin comentarios</div>';
        };
        // populate users
        (async () => {
            try {
                const users = await API.get('/usuarios');
                const sel = overlay.querySelector('#tm-resp');
                if (sel && Array.isArray(users)) {
                    sel.innerHTML = '<option value="">Sin asignar</option>' + users.map(u=>`<option value="${escapeAttr(u.nombre_completo||u.username)}" ${(t.responsable=== (u.nombre_completo||u.username))?'selected':''}>${escapeHtml(u.nombre_completo||u.username)}</option>`).join('');
                }
            } catch(e){}
        })();
        renderChecklist(); renderComments();
        overlay.querySelector('#tm-check-new').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); overlay.querySelector('#tm-check-add').click(); } });
        overlay.querySelector('#tm-check-add').onclick = () => {
            const v = overlay.querySelector('#tm-check-new').value.trim();
            if(!v) return;
            checklist.push({id:Date.now(), text:v, completed:false});
            overlay.querySelector('#tm-check-new').value='';
            renderChecklist();
        };
        overlay.querySelector('#tm-comment-pub').onclick = () => {
            const inp = overlay.querySelector('#tm-comment');
            const v = inp.value.trim();
            if(!v) return;
            const parentId = inp.dataset.reply || null;
            comments.push({id:Date.now(), autor:'Tú', text:v, fecha:new Date().toLocaleString('es-CO'), parentId: parentId?Number(parentId):null});
            inp.value=''; inp.dataset.reply=''; inp.placeholder='Escribe un comentario...';
            renderComments();
        };
        overlay.querySelector('#tm-upload').onclick = async () => {
            const file = overlay.querySelector('#tm-file')?.files?.[0];
            if (!file) { showToast('Selecciona un archivo','error'); return; }
            const fd = new FormData();
            fd.append('file', file);
            fd.append('tipo', 'documento');
            fd.append('nota', `Adjunto de tarea #${t.id}: ${t.titulo}`);
            fd.append('etiquetas', `tarea:${t.id}`);
            try {
                const res = await fetch(`${App.API_BASE_URL}/api/proyectos/${current.id}/documentos`, {method:'POST', body:fd, credentials:'include'});
                const data = await res.json();
                if (!res.ok) throw new Error(data.error||data.detail||'Error');
                current.bitacora = data.bitacora || current.bitacora;
                showToast('Adjunto subido a Archivos','success');
                overlay.querySelector('#tm-file').value='';
            } catch(e){ showToast(e.message||'Error','error'); }
        };
        overlay.querySelector('#tm-save').onclick = async () => {
            t.titulo = overlay.querySelector('#tm-title').value;
            t.descripcion = overlay.querySelector('#tm-desc').value;
            t.status = overlay.querySelector('#tm-status').value;
            t.completada = (t.status==='Completado');
            let fi = overlay.querySelector('#tm-start').value || null;
            let fl = overlay.querySelector('#tm-due').value || null;
            if (fi && fl && fi > fl) { const tmp=fi; fi=fl; fl=tmp; }
            t.fecha_inicio = fi;
            t.fecha_limite = fl;
            t.responsable = overlay.querySelector('#tm-resp').value;
            t.checklist = checklist;
            t.comments = comments;
            await saveCurrent(['pasos']);
            showToast('Tarea guardada','success');
            delete window._tmToggleCheck; delete window._tmRemoveCheck;
            overlay.remove();
            renderDetalle();
        };
    }
    async function editTarea(pid,tid){ const t=findTarea(pid,tid); if(!t)return; const n=prompt('Editar tarea:',t.titulo); if(n===null||!n.trim())return; t.titulo=n.trim(); await saveCurrent(['pasos']); renderDetalle(); }
    async function deleteTarea(pid,tid){ const p=findPaso(pid); if(!p||!confirm('¿Eliminar esta tarea?'))return; p.tareas=(p.tareas||[]).filter(t=>t.id!==tid); recompute(p); await saveCurrent(['pasos']); renderDetalle(); }
    async function agregarSubtarea(pid,tid){ const titulo=prompt('Título de la subtarea:'); if(!titulo?.trim())return; const t=findTarea(pid,tid); if(!t)return; t.subtareas=t.subtareas||[]; t.subtareas.push({id:genId(),titulo:titulo.trim(),completada:false}); recompute(findPaso(pid)); await saveCurrent(['pasos']); renderDetalle(); }
    async function editSubtarea(pid,tid,sid){ const s=findTarea(pid,tid)?.subtareas?.find(x=>x.id===sid); if(!s)return; const n=prompt('Editar subtarea:',s.titulo); if(n===null||!n.trim())return; s.titulo=n.trim(); await saveCurrent(['pasos']); renderDetalle(); }
    async function deleteSubtarea(pid,tid,sid){ const p=findPaso(pid); const t=findTarea(pid,tid); if(!t)return; t.subtareas=(t.subtareas||[]).filter(s=>s.id!==sid); recompute(p); await saveCurrent(['pasos']); renderDetalle(); }
    async function toggleTarea(pid,tid,sid){ const p=findPaso(pid); const t=findTarea(pid,tid); if(!t)return; if(sid){ const s=(t.subtareas||[]).find(x=>x.id===sid); if(!s)return; s.completada=!s.completada; } else { if((t.subtareas||[]).length)return; t.completada=!t.completada; } recompute(p); await saveCurrent(['pasos']); renderDetalle(); }
    async function updateTareaField(pid,tid,field,val){ const t=findTarea(pid,tid); if(!t)return; t[field]=val||null; await saveCurrent(['pasos']); const st=document.getElementById('save-status'); if(st){st.textContent='Guardado'; setTimeout(()=>st.textContent='',1200);} }

    async function toggleBom(idx,key,val){ if(!current.bom||!current.bom[idx])return; current.bom[idx][key]=!!val; await saveCurrent(['bom']); }
    async function updateBomQty(idx,val){ if(!current.bom||!current.bom[idx])return; current.bom[idx].cantidad=Number(val)||0; await saveCurrent(['bom']); renderDetalle(); }
    async function updateBomPrecio(idx,val){ if(!current.bom||!current.bom[idx])return; current.bom[idx].precio_unitario=Number(val)||0; await saveCurrent(['bom']); renderDetalle(); }
    async function loadBomInventory(){
        if(!window._invItems){
            try {
                const res = await API.get('/equipos');
                window._invItems = Array.isArray(res) ? res : (res?.data || res?.items || []);
            } catch(e){ window._invItems=[]; }
        }
        setTimeout(()=>populateBomCategories(),0);
    }
    function populateBomCategories(){
        const sel = document.getElementById('bom-cat-filter');
        if(!sel || !window._invItems) return;
        const cats = [...new Set(window._invItems.map(e=>e.categoria).filter(Boolean))];
        const cur = sel.value;
        sel.innerHTML = '<option value="">Todas</option>' + cats.map(c=>`<option value="${escapeHtml(c)}" ${c===cur?'selected':''}>${escapeHtml(c)}</option>`).join('');
        onBomCatChange();
    }
    function onBomCatChange(){
        const catSel = document.getElementById('bom-cat-filter');
        const itemSel = document.getElementById('bom-item-filter');
        if(!itemSel || !window._invItems) return;
        const cat = catSel ? catSel.value : '';
        const filtered = window._invItems.filter(e => !cat || e.categoria===cat);
        itemSel.innerHTML = '<option value="">Seleccione...</option>' + filtered.map(e=>`<option value="${e.id}">${escapeHtml((e.marca||'')+' '+(e.modelo||e.nombre||''))}</option>`).join('');
    }
    async function addBomFiltered(){
        const itemSel = document.getElementById('bom-item-filter');
        const qtyInput = document.getElementById('bom-qty-filter');
        const id = itemSel ? itemSel.value : '';
        if(!id){ showToast('Seleccione un ítem','error'); return; }
        const eq = (window._invItems||[]).find(e=>String(e.id)===String(id));
        if(!eq){ showToast('No encontrado','error'); return; }
        if(!current.bom) current.bom=[];
        const basePrice = Number(eq.costo||eq.precio||0);
        const priceIva = eq.iva ? Math.round(basePrice*1.19*100)/100 : basePrice;
        current.bom.push({nombre:`${eq.marca||''} ${eq.modelo||eq.nombre||''}`.trim(), cantidad:Number(qtyInput?.value)||1, precio_unitario:priceIva, categoria:eq.categoria||'', equipo_id:eq.id, iva:!!eq.iva});
        await saveCurrent(['bom']); renderDetalle();
    }
    async function updateBomNombre(idx,val){ if(!current.bom||!current.bom[idx])return; current.bom[idx].nombre=val; await saveCurrent(['bom']); }
    async function addBomItem(){ if(!current.bom) current.bom=[]; current.bom.push({nombre:'', cantidad:1, precio_unitario:0, categoria:''}); await saveCurrent(['bom']); renderDetalle(); }
    async function removeBomItem(idx){ if(!current.bom) return; current.bom.splice(idx,1); await saveCurrent(['bom']); renderDetalle(); }
    async function addBomFromInventario(){
        try {
            const res = await API.get('/equipos');
            const list = Array.isArray(res) ? res : (res?.data || res?.items || []);
            // Modal con buscador
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
            overlay.innerHTML = `<div style="background:#fff;border-radius:12px;width:90%;max-width:600px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;">
                <div style="padding:16px;border-bottom:1px solid #eee;"><input id="bom-inv-search" class="sq-input w-full" placeholder="Buscar producto..." autofocus></div>
                <div id="bom-inv-list" style="overflow:auto;flex:1;padding:8px;"></div>
                <div style="padding:12px;text-align:right;border-top:1px solid #eee;"><button type="button" class="sq-btn sq-btn-secondary sq-btn-sm" onclick="this.closest('div').parentElement.parentElement.remove()">Cerrar</button></div>
            </div>`;
            document.body.appendChild(overlay);
            const search = overlay.querySelector('#bom-inv-search');
            const listEl = overlay.querySelector('#bom-inv-list');
            function renderList(q){
                const filtered = list.filter(e => (`${e.marca||''} ${e.modelo||e.nombre||''} ${e.categoria||''}`).toLowerCase().includes(q.toLowerCase()));
                listEl.innerHTML = filtered.slice(0,50).map(e=>`<div style="padding:8px;cursor:pointer;border-bottom:1px solid #f0f0f0;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background=''" onclick="window._bomInvSelect(${e.id})">${e.marca||''} ${e.modelo||e.nombre||''} <span style="color:#888;font-size:12px;">(${e.categoria||''}) - ${e.costo||e.precio||0}</span></div>`).join('') || '<div style="padding:16px;color:#888;">Sin resultados</div>';
            }
            window._bomInvSelect = async (id) => {
                const eq = list.find(e=>String(e.id)===String(id));
                if(!eq) return;
                if(!current.bom) current.bom=[];
                current.bom.push({nombre:`${eq.marca||''} ${eq.modelo||eq.nombre||''}`.trim(), cantidad:1, precio_unitario:Number(eq.costo||eq.precio||0), categoria:eq.categoria||'', equipo_id:eq.id});
                await saveCurrent(['bom']); renderDetalle();
                overlay.remove();
                delete window._bomInvSelect;
            };
            search.addEventListener('input', ()=>renderList(search.value));
            renderList('');
            search.focus();
        } catch(e){ showToast(e.message||'Error','error'); }
    }

    async function agregarBitacora(){
        const nota=(document.getElementById('bit-nota')?.value||'').trim();
        const tipo=document.getElementById('bit-tipo')?.value||'nota';
        const file=document.getElementById('bit-file')?.files?.[0];
        const tags=(document.getElementById('bit-tags')?.value||'').trim();
        if(!nota && !file){ showToast('Agrega una nota o un archivo','error'); return; }
        try{
            if(file){
                const fd=new FormData(); fd.append('file',file); fd.append('tipo',tipo); fd.append('nota',nota); fd.append('etiquetas',tags);
                const res=await fetch(`${App.API_BASE_URL}/api/proyectos/${current.id}/documentos`,{method:'POST',body:fd,credentials:'include'});
                const data=await res.json(); if(!res.ok) throw new Error(data.error||data.detail||'Error al subir');
                current.bitacora=data.bitacora||current.bitacora; showToast('Entrada agregada','success');
            } else {
                const data=await API.post(`/proyectos/${current.id}/bitacora-nota`,{nota, etiquetas: tags});
                current.bitacora=data.bitacora||current.bitacora; showToast('Nota agregada','success');
            }
            renderDetalle();
        } catch(e){ showToast(e.message||'Error al agregar entrada','error'); }
    }
    async function deleteBitacora(id){
        if(!confirm('¿Eliminar esta entrada?')) return;
        try {
            const data=await API.delete(`/proyectos/${current.id}/bitacora/${id}`);
            current.bitacora=data.bitacora||current.bitacora; renderDetalle();
        } catch(e){ showToast(e.message||'Error','error'); }
    }
    async function editBitacora(id){
        const e=(current.bitacora||[]).find(x=>x.id===id);
        if(!e) return;
        const tags = current.tags||[];
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `<div style="background:#1a1a1a;border-radius:12px;width:90%;max-width:500px;padding:20px;color:#f4bf00;">
            <h3 style="margin-bottom:12px;font-weight:bold;">Editar entrada</h3>
            <textarea id="eb-nota" class="sq-input w-full" rows="4" class="sq-input">${escapeHtml(e.nota||'')}</textarea>
            <div style="margin-top:12px;">
                <div style="font-size:12px;margin-bottom:4px;">Etiquetas:</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
                    ${tags.map(t=>`<label style="font-size:12px;"><input type="checkbox" value="${escapeAttr(t)}" ${(e.etiquetas||[]).includes(t)?'checked':''}> ${escapeHtml(t)}</label>`).join(' ')}
                </div>
                <input id="eb-newtag" class="sq-input w-full text-sm" placeholder="Nueva etiqueta" class="sq-input">
            </div>
            <div style="margin-top:16px;text-align:right;display:flex;gap:8px;justify-content:flex-end;">
                <button type="button" class="sq-btn sq-btn-secondary sq-btn-sm" onclick="this.closest('div').parentElement.parentElement.remove()">Cancelar</button>
                <button type="button" class="sq-btn sq-btn-primary sq-btn-sm" id="eb-save">Guardar</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#eb-save').onclick = async () => {
            const nota = overlay.querySelector('#eb-nota').value;
            const checked = [...overlay.querySelectorAll('input[type=checkbox]:checked')].map(c=>c.value);
            const newTag = overlay.querySelector('#eb-newtag').value.trim();
            if(newTag && !checked.includes(newTag)){ checked.push(newTag); }
            try {
                const data = await API.put(`/proyectos/${current.id}/bitacora/${id}`, {nota, etiquetas: checked});
                // if new tag, persist tags catalog
                if(newTag && !(current.tags||[]).includes(newTag)){
                    current.tags = (current.tags||[]).concat(newTag);
                    await API.put(`/proyectos/${current.id}`, {tags: current.tags});
                }
                current.bitacora = data.bitacora||current.bitacora;
                overlay.remove();
                renderDetalle();
            } catch(err){ showToast(err.message||'Error','error'); }
        };
    }
    async function createTag(){
        const inp=document.getElementById('tag-new');
        const v=(inp?.value||'').trim();
        if(!v) return;
        if((current.tags||[]).includes(v)){ showToast('Ya existe','error'); return; }
        current.tags=(current.tags||[]).concat(v);
        await API.put(`/proyectos/${current.id}`, {tags: current.tags});
        if(inp) inp.value='';
        renderDetalle();
    }
    async function deleteTag(t){
        if(!confirm('¿Eliminar etiqueta?')) return;
        current.tags=(current.tags||[]).filter(x=>x!==t);
        await API.put(`/proyectos/${current.id}`, {tags: current.tags});
        renderDetalle();
    }

    function recalcCostos(){ const v=id=>Number(document.getElementById(id)?.value)||0; const total=v('cr-materiales')+v('cr-mano')+v('cr-logistica')+v('cr-otros'); const el=document.getElementById('cr-total'); if(el) el.textContent=formatCurrency(total); }
    async function guardarCostosReales(){
        const v=id=>Number(document.getElementById(id)?.value)||0;
        current.costos_reales={...(current.costos_reales||{}), materiales:v('cr-materiales'), mano_obra:v('cr-mano'), logistica:v('cr-logistica'), otros:v('cr-otros'), notas:(document.getElementById('cr-notas')?.value||'').trim()};
        await saveCurrent(['costos_reales']); renderDetalle(); showToast('Costos reales guardados','success');
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
            if(res){ current={...current,...res, pasos:res.pasos??current.pasos, bom:res.bom??current.bom, bitacora:res.bitacora??current.bitacora, costos_reales:res.costos_reales??current.costos_reales}; }
            if(st) st.textContent='Guardado';
            setTimeout(()=>{ const s=document.getElementById('save-status'); if(s) s.textContent=''; },1200);
        } catch(e){ showToast(e.message||'Error al guardar','error'); if(st) st.textContent='Error'; }
        finally{ saving=false; }
    }

    async function eliminar(id, fromList){
        confirmAction('¿Eliminar esta instalación y todo su seguimiento?', async ()=>{ try{ await API.delete(`/proyectos/${id}`); showToast('Instalación eliminada','success'); if(fromList){ await cargar(); renderLista(); } else { window.location.hash='#proyectos'; } } catch(e){ showToast(e.message||'Error','error'); } });
    }

    function genId(){ return Date.now(); }
    function escapeHtml(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    function escapeAttr(v){ return escapeHtml(v).replace(/"/g,'&quot;'); }

    async function agregarTareaRapida(){
        const titulo=prompt('Título de la tarea:'); if(!titulo?.trim()) return;
        current.pasos=current.pasos||[];
        let p=current.pasos[0];
        if(!p){ p={id:genId(),nombre:'General',orden:1,completado:false,tareas:[]}; current.pasos.push(p); }
        p.tareas=p.tareas||[];
        p.tareas.push({id:genId(),titulo:titulo.trim(),completada:false,status:'Hacer',fecha_limite:null,responsable:'',subtareas:[]});
        recompute(p);
        await saveCurrent(['pasos']);
        renderDetalle();
    }
    function sortTasks(key){ if(taskSort.key===key) taskSort.dir=taskSort.dir==='asc'?'desc':'asc'; else {taskSort.key=key; taskSort.dir='asc';} renderDetalle(); }
    function setTaskPageSize(v){ taskPageSize=Number(v)||10; taskPage=1; renderDetalle(); }
    function prevTaskPage(){ if(taskPage>1){taskPage--;renderDetalle();} }
    function nextTaskPage(){ const total=flattenTasks().length; const pages=Math.max(1,Math.ceil(total/taskPageSize)); if(taskPage<pages){taskPage++;renderDetalle();} }

    return { init, openNuevaInstalacion, onCotizacionChange, crearInstalacion, openDetalle: (id)=>window.location.hash='#proyectos/'+id, setTab, agregarPaso, renamePaso, deletePaso, agregarTarea, editTarea, deleteTarea, openTaskModal, agregarSubtarea, editSubtarea, deleteSubtarea, toggleTarea, updateTareaField, agregarTareaRapida, sortTasks, setTaskPageSize, prevTaskPage, nextTaskPage, toggleBom, updateBomQty, updateBomPrecio, updateBomNombre, addBomItem, removeBomItem, addBomFromInventario, onBomCatChange, addBomFiltered, agregarBitacora, deleteBitacora, editBitacora, createTag, deleteTag, guardarCostosReales, recalcCostos, eliminar };
})();

window.renderProyectos = function(id) { ProyectosModule.init(id); };
