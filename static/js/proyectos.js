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

        if (activeTab === 'tareas') {
            setTimeout(() => {
                const bInp = document.getElementById('tf-buscar');
                if (bInp) {
                    bInp.oninput = debounce((e) => {
                        taskFilters.buscar = e.target.value;
                        taskPage = 1;
                        renderDetalle();
                        const reInp = document.getElementById('tf-buscar');
                        if (reInp) {
                            reInp.focus();
                            reInp.setSelectionRange(reInp.value.length, reInp.value.length);
                        }
                    }, 250);
                }
            }, 0);
        }
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
    let taskFilters = {
        buscar: '',
        etapa: '',
        estado: '',
        prioridad: '',
        responsable: '',
        soloAdjuntos: false,
        soloVencidas: false
    };

    function setTaskFilter(key, val) {
        taskFilters[key] = val;
        taskPage = 1;
        renderDetalle();
    }

    function toggleTaskFilter(key) {
        taskFilters[key] = !taskFilters[key];
        taskPage = 1;
        renderDetalle();
    }

    function resetTaskFilters() {
        taskFilters = {
            buscar: '',
            etapa: '',
            estado: '',
            prioridad: '',
            responsable: '',
            soloAdjuntos: false,
            soloVencidas: false
        };
        taskPage = 1;
        renderDetalle();
    }

    function formatFileSize(bytes) {
        if (!bytes || isNaN(bytes)) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function prioBadge(prio) {
        switch(prio) {
            case 'Urgente': return '<span class="text-[10px] px-2 py-0.5 rounded-full bg-error/20 text-error font-bold inline-flex items-center gap-0.5"><span class="material-symbols-outlined text-[12px]">priority_high</span>Urgente</span>';
            case 'Alta': return '<span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold">Alta</span>';
            case 'Baja': return '<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">Baja</span>';
            default: return '<span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-bold">Media</span>';
        }
    }

    function flattenTasks(){
        const out=[]; let idx=0;
        (current.pasos||[]).forEach(p=>{
            (p.tareas||[]).forEach(t=>{
                const cl=t.checklist||[]; const done=cl.filter(c=>c.completed).length; const prog=cl.length?Math.round(done/cl.length*100):(t.completada?100:0);
                const bitMatches = (current.bitacora||[]).filter(b=>(b.etiquetas||[]).includes('tarea:'+t.id) || String(b.tarea_id)===String(t.id));
                const taskArchivos = Array.isArray(t.archivos) ? t.archivos : [];
                const totalAdj = Math.max(taskArchivos.length, bitMatches.length);
                out.push({id:++idx, realId:t.id, pasoId:p.id, pasoNombre:p.nombre, title:t.titulo, descripcion:t.descripcion||'', isCompleted:!!t.completada, startDate:t.fecha_inicio||null, dueDate:t.fecha_limite||null, milestone:p.nombre, assignee:t.responsable||'', status:t.status||(t.completada?'Completado':'Hacer'), prioridad:t.prioridad||'Media', tags:[], progress:prog, adjuntos:totalAdj});
            });
        });
        return out;
    }

    function applyTaskFilters(list) {
        const today = new Date().toISOString().slice(0, 10);
        return list.filter(t => {
            // Buscador por texto
            if (taskFilters.buscar) {
                const q = taskFilters.buscar.toLowerCase().trim();
                const textMatch = [t.title, t.descripcion, t.assignee, t.milestone, String(t.id), String(t.realId)]
                    .some(v => String(v || '').toLowerCase().includes(q));
                if (!textMatch) return false;
            }
            // Filtro por etapa
            if (taskFilters.etapa && t.milestone !== taskFilters.etapa) {
                return false;
            }
            // Filtro por estado
            if (taskFilters.estado && t.status !== taskFilters.estado) {
                return false;
            }
            // Filtro por prioridad
            if (taskFilters.prioridad && (t.prioridad || 'Media') !== taskFilters.prioridad) {
                return false;
            }
            // Filtro por responsable
            if (taskFilters.responsable) {
                if (taskFilters.responsable === '_sin_asignar') {
                    if (t.assignee && t.assignee.trim()) return false;
                } else if (t.assignee !== taskFilters.responsable) {
                    return false;
                }
            }
            // Solo con adjuntos
            if (taskFilters.soloAdjuntos && (!t.adjuntos || t.adjuntos <= 0)) {
                return false;
            }
            // Solo vencidas
            if (taskFilters.soloVencidas) {
                const isOverdue = t.dueDate && t.dueDate < today && !t.isCompleted;
                if (!isOverdue) return false;
            }
            return true;
        });
    }

    function renderTabTareas() {
        const allTasks = flattenTasks();
        const filteredTasks = applyTaskFilters(allTasks);

        // Ordenamiento
        filteredTasks.sort((a,b)=>{
            let va=a[taskSort.key], vb=b[taskSort.key];
            if(va==null) va=''; if(vb==null) vb='';
            if(va<vb) return taskSort.dir==='asc'?-1:1;
            if(va>vb) return taskSort.dir==='asc'?1:-1;
            return 0;
        });

        const total = filteredTasks.length;
        const totalOriginal = allTasks.length;
        const pages = Math.max(1, Math.ceil(total / taskPageSize));
        if (taskPage > pages) taskPage = pages;
        const slice = filteredTasks.slice((taskPage-1)*taskPageSize, taskPage*taskPageSize);
        const sortIcon = (k) => taskSort.key===k ? (taskSort.dir==='asc'?'↑':'↓') : '';
        const today = new Date().toISOString().slice(0,10);

        // Responsables únicos para el dropdown
        const distinctAssignees = [...new Set(allTasks.map(t => t.assignee).filter(Boolean))];
        const hasActiveFilters = Boolean(
            taskFilters.buscar ||
            taskFilters.etapa ||
            taskFilters.estado ||
            taskFilters.prioridad ||
            taskFilters.responsable ||
            taskFilters.soloAdjuntos ||
            taskFilters.soloVencidas
        );

        const rows = slice.map(t => {
            const overdue = t.dueDate && t.dueDate < today && !t.isCompleted;
            return `<tr class="border-b border-outline-variant/10 hover:bg-surface-container/50 transition-colors">
                <td class="px-4 py-3"><input type="checkbox" class="w-4 h-4 accent-primary rounded cursor-pointer" ${t.isCompleted?'checked':''} onchange="ProyectosModule.toggleTarea('${t.pasoId}','${t.realId}')"></td>
                <td class="px-4 py-3 text-xs text-on-surface-variant font-mono">#${Number(t.id)||t.id}</td>
                <td class="px-4 py-3">
                    <a href="#" onclick="ProyectosModule.openTaskModal('${t.pasoId}','${t.realId}');return false;" class="text-on-surface hover:text-primary font-label-bold transition-colors flex items-center gap-2">
                        <span>${escapeHtml(t.title)}</span>
                    </a>
                </td>
                <td class="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">${t.startDate||'-'}</td>
                <td class="px-4 py-3 text-xs ${overdue?'text-error font-bold':'text-on-surface-variant'} whitespace-nowrap">${t.dueDate ? (overdue ? '⚠️ ' + t.dueDate : t.dueDate) : '-'}</td>
                <td class="px-4 py-3 text-xs text-on-surface-variant"><span class="px-2 py-0.5 rounded bg-surface-container text-[11px] font-medium">${escapeHtml(t.milestone)}</span></td>
                <td class="px-4 py-3 text-xs text-on-surface-variant">${escapeHtml(t.assignee||'Sin asignar')}</td>
                <td class="px-4 py-3"><div class="w-24 h-2 bg-surface-container-high rounded-full overflow-hidden"><div class="h-2 bg-primary rounded-full transition-all" style="width:${t.progress}%"></div></div><div class="text-[10px] text-on-surface-variant mt-0.5">${t.progress}%</div></td>
                <td class="px-4 py-3 text-center">
                    <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${t.adjuntos>0?'bg-primary/10 text-primary font-bold':'text-on-surface-variant'}">
                        <span class="material-symbols-outlined text-[14px]">attachment</span> ${t.adjuntos||0}
                    </span>
                </td>
                <td class="px-4 py-3">${prioBadge(t.prioridad)}</td>
                <td class="px-4 py-3"><span class="text-[11px] px-2 py-0.5 rounded-full font-label-bold ${t.status==='Completado'?'bg-emerald-500/20 text-emerald-400':(t.status==='En progreso'?'bg-amber-500/20 text-amber-400':'bg-surface-container-high text-on-surface-variant')}">${t.status}</span></td>
                <td class="px-4 py-3 text-center"><button onclick="ProyectosModule.deleteTarea('${t.pasoId}','${t.realId}')" class="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-surface-container-high transition-colors" title="Eliminar tarea"><span class="material-symbols-outlined text-[16px]">close</span></button></td>
            </tr>`;
        }).join('');

        return `<div class="space-y-4">
            <!-- BARRA DE FILTROS Y BÚSQUEDA AVANZADA -->
            <div class="bg-surface-container-low rounded-2xl p-4 border border-outline-variant/30 space-y-3 shadow-sm">
                <!-- Fila 1: Buscador de texto + Botón Agregar Tarea -->
                <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div class="relative flex-1 max-w-lg">
                        <span class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
                        <input type="text" id="tf-buscar" class="sq-input !pl-10 !py-2 text-sm w-full rounded-xl" placeholder="Buscar por título, ID o descripción..." value="${escapeAttr(taskFilters.buscar)}">
                        ${taskFilters.buscar ? `<button onclick="ProyectosModule.setTaskFilter('buscar','');" class="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface" title="Borrar búsqueda"><span class="material-symbols-outlined text-[16px]">close</span></button>` : ''}
                    </div>
                    <div class="flex items-center gap-2">
                        ${hasActiveFilters ? `<button onclick="ProyectosModule.resetTaskFilters()" class="sq-btn sq-btn-ghost sq-btn-sm text-xs text-on-surface-variant hover:text-error flex items-center gap-1 rounded-xl"><span class="material-symbols-outlined text-[16px]">filter_alt_off</span> Limpiar filtros</button>` : ''}
                        <button onclick="ProyectosModule.agregarTareaRapida()" class="sq-btn sq-btn-primary sq-btn-sm flex items-center gap-1.5 rounded-xl shadow-md whitespace-nowrap">
                            <span class="material-symbols-outlined text-[18px]">add</span> Nueva tarea
                        </button>
                    </div>
                </div>

                <!-- Fila 2: Selectores de Etapa, Estado, Prioridad y Asignado -->
                <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 pt-1">
                    <div>
                        <label class="block text-[10px] font-label-bold text-on-surface-variant uppercase tracking-wider mb-1">Etapa</label>
                        <select class="sq-input text-xs !py-1.5 rounded-lg w-full" onchange="ProyectosModule.setTaskFilter('etapa', this.value)">
                            <option value="">Todas las etapas</option>
                            ${(current.pasos||[]).map(s=>`<option value="${escapeAttr(s.nombre)}" ${taskFilters.etapa===s.nombre?'selected':''}>${escapeHtml(s.nombre)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-[10px] font-label-bold text-on-surface-variant uppercase tracking-wider mb-1">Estado</label>
                        <select class="sq-input text-xs !py-1.5 rounded-lg w-full" onchange="ProyectosModule.setTaskFilter('estado', this.value)">
                            <option value="">Todos los estados</option>
                            <option value="Hacer" ${taskFilters.estado==='Hacer'?'selected':''}>Hacer</option>
                            <option value="En progreso" ${taskFilters.estado==='En progreso'?'selected':''}>En progreso</option>
                            <option value="Completado" ${taskFilters.estado==='Completado'?'selected':''}>Completado</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-[10px] font-label-bold text-on-surface-variant uppercase tracking-wider mb-1">Prioridad</label>
                        <select class="sq-input text-xs !py-1.5 rounded-lg w-full" onchange="ProyectosModule.setTaskFilter('prioridad', this.value)">
                            <option value="">Todas las prioridades</option>
                            <option value="Urgente" ${taskFilters.prioridad==='Urgente'?'selected':''}>🔴 Urgente</option>
                            <option value="Alta" ${taskFilters.prioridad==='Alta'?'selected':''}>🟠 Alta</option>
                            <option value="Media" ${taskFilters.prioridad==='Media'?'selected':''}>🔵 Media</option>
                            <option value="Baja" ${taskFilters.prioridad==='Baja'?'selected':''}>🟢 Baja</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-[10px] font-label-bold text-on-surface-variant uppercase tracking-wider mb-1">Responsable</label>
                        <select class="sq-input text-xs !py-1.5 rounded-lg w-full" onchange="ProyectosModule.setTaskFilter('responsable', this.value)">
                            <option value="">Todos los asignados</option>
                            <option value="_sin_asignar" ${taskFilters.responsable==='_sin_asignar'?'selected':''}>Sin asignar</option>
                            ${distinctAssignees.map(a=>`<option value="${escapeAttr(a)}" ${taskFilters.responsable===a?'selected':''}>${escapeHtml(a)}</option>`).join('')}
                        </select>
                    </div>

                    <!-- Filtros Rápidos (Toggles) -->
                    <div class="col-span-2 flex items-end gap-2 pb-0.5">
                        <button type="button" onclick="ProyectosModule.toggleTaskFilter('soloAdjuntos')" class="flex-1 py-1.5 px-3 rounded-lg text-xs font-label-bold border flex items-center justify-center gap-1.5 transition-all ${taskFilters.soloAdjuntos?'bg-primary/20 border-primary text-primary shadow-sm':'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:text-on-surface'}">
                            <span class="material-symbols-outlined text-[16px]">attachment</span> Con adjuntos
                        </button>
                        <button type="button" onclick="ProyectosModule.toggleTaskFilter('soloVencidas')" class="flex-1 py-1.5 px-3 rounded-lg text-xs font-label-bold border flex items-center justify-center gap-1.5 transition-all ${taskFilters.soloVencidas?'bg-error/20 border-error text-error shadow-sm':'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:text-on-surface'}">
                            <span class="material-symbols-outlined text-[16px]">warning</span> Vencidas
                        </button>
                    </div>
                </div>
            </div>

            <!-- TABLA DE TAREAS -->
            <div class="overflow-x-auto rounded-xl border border-outline-variant/30 bg-surface-container-low shadow-sm">
                <table class="sq-table w-full text-sm" style="width:100%;">
                    <thead><tr>
                        <th class="px-4 py-3"></th>
                        <th class="px-4 py-3 cursor-pointer" onclick="ProyectosModule.sortTasks('id')">ID ${sortIcon('id')}</th>
                        <th class="px-4 py-3 cursor-pointer" onclick="ProyectosModule.sortTasks('title')">Título ${sortIcon('title')}</th>
                        <th class="px-4 py-3 cursor-pointer" onclick="ProyectosModule.sortTasks('startDate')">Inicio ${sortIcon('startDate')}</th>
                        <th class="px-4 py-3 cursor-pointer" onclick="ProyectosModule.sortTasks('dueDate')">Límite ${sortIcon('dueDate')}</th>
                        <th class="px-4 py-3">Etapa</th>
                        <th class="px-4 py-3">Asignado</th>
                        <th class="px-4 py-3">Progreso</th>
                        <th class="px-4 py-3 text-center">Adjuntos</th>
                        <th class="px-4 py-3 cursor-pointer" onclick="ProyectosModule.sortTasks('prioridad')">Prioridad ${sortIcon('prioridad')}</th>
                        <th class="px-4 py-3 cursor-pointer" onclick="ProyectosModule.sortTasks('status')">Estado ${sortIcon('status')}</th>
                        <th class="px-4 py-3 text-center">Acciones</th>
                    </tr></thead>
                    <tbody>${rows||'<tr><td colspan="12" class="text-center py-10 text-on-surface-variant"><span class="material-symbols-outlined text-[40px] opacity-30 block mb-2">search_off</span>No se encontraron tareas con los filtros seleccionados.</td></tr>'}</tbody>
                </table>
            </div>

            <!-- PAGINACIÓN Y RESUMEN -->
            <div class="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm px-2">
                <div class="flex items-center gap-2">
                    <span class="text-xs text-on-surface-variant">Por página:</span>
                    <select class="sq-input text-xs !py-1 w-20 rounded-lg" onchange="ProyectosModule.setTaskPageSize(this.value)">
                        <option value="10" ${taskPageSize==10?'selected':''}>10</option>
                        <option value="25" ${taskPageSize==25?'selected':''}>25</option>
                        <option value="50" ${taskPageSize==50?'selected':''}>50</option>
                    </select>
                </div>
                <div class="text-xs text-on-surface-variant">
                    Mostrando ${(taskPage-1)*taskPageSize + (total>0?1:0)} – ${Math.min(taskPage*taskPageSize, total)} de <span class="font-bold text-on-surface">${total}</span> tareas ${hasActiveFilters ? `(filtradas de ${totalOriginal})` : ''}
                </div>
                <div class="flex gap-1.5">
                    <button class="sq-btn sq-btn-secondary sq-btn-sm !py-1 px-3 rounded-lg" onclick="ProyectosModule.prevTaskPage()" ${taskPage<=1?'disabled':''}>Anterior</button>
                    <span class="px-2 py-1 text-xs text-on-surface-variant font-medium flex items-center">Pág. ${taskPage} de ${pages}</span>
                    <button class="sq-btn sq-btn-secondary sq-btn-sm !py-1 px-3 rounded-lg" onclick="ProyectosModule.nextTaskPage()" ${taskPage>=pages?'disabled':''}>Siguiente</button>
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
        const isPdf = e.archivo?.mime === 'application/pdf' || /\.pdf$/i.test(e.archivo?.path||'');
        const tipoLabels = {nota:'Nota', evidencia:'Evidencia', plano:'Plano unifilar', retie:'Certificado RETIE', documento:'Documento'};
        const fecha = e.fecha ? new Date(e.fecha).toLocaleString('es-CO',{dateStyle:'medium', timeStyle:'short'}) : '';

        // Identificar si proviene de una tarea
        const tareaId = e.tarea_id || (e.etiquetas||[]).find(t=>typeof t==='string'&&t.startsWith('tarea:'))?.replace('tarea:','');
        let tareaBadge = '';
        if (tareaId) {
            let taskTitle = '';
            (current.pasos||[]).forEach(p => {
                (p.tareas||[]).forEach(t => {
                    if (String(t.id) === String(tareaId)) taskTitle = t.titulo;
                });
            });
            tareaBadge = `<span class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-label-bold" title="Archivo vinculado a tarea">
                <span class="material-symbols-outlined text-[13px]">task_alt</span> ${escapeHtml(taskTitle || 'Tarea #' + tareaId)}
            </span>`;
        }

        const sizeStr = e.archivo?.size ? formatFileSize(e.archivo.size) : '';

        return `<div class="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
            <div class="flex items-start justify-between gap-3 mb-2">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-[11px] px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-bold">${tipoLabels[e.tipo]||e.tipo||'Nota'}</span>
                    <span class="text-xs text-on-surface-variant">${fecha}</span>
                    ${e.autor?`<span class="text-xs text-on-surface-variant">· ${escapeHtml(e.autor)}</span>`:''}
                    ${tareaBadge}
                    ${(e.etiquetas||[]).filter(t=>!t.startsWith('tarea:')).map(t=>`<span class="text-[10px] px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">${escapeHtml(t)}</span>`).join('')}
                </div>
                <div class="flex items-center gap-1">
                    <button onclick="ProyectosModule.editBitacora('${e.id}')" class="p-1 text-on-surface-variant hover:text-primary rounded" title="Editar"><span class="material-symbols-outlined text-[18px]">edit</span></button>
                    <button onclick="ProyectosModule.deleteBitacora('${e.id}')" class="p-1 text-on-surface-variant hover:text-error rounded" title="Eliminar"><span class="material-symbols-outlined text-[18px]">delete</span></button>
                </div>
            </div>
            ${e.nota?`<p class="text-sm text-on-surface whitespace-pre-wrap mb-2">${escapeHtml(e.nota)}</p>`:''}
            ${e.archivo ? (isImg
                ? `<div class="mt-2">
                    <a href="${e.archivo.path}" target="_blank" class="inline-block group relative">
                        <img src="${e.archivo.path}" alt="${escapeAttr(e.archivo.nombre||'')}" class="max-h-72 rounded-lg border border-outline-variant/20 object-cover group-hover:brightness-105 transition-all">
                        <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center text-white text-xs font-bold gap-1">
                            <span class="material-symbols-outlined text-[18px]">visibility</span> Ver original
                        </div>
                    </a>
                    <div class="text-xs text-on-surface-variant mt-1.5 flex items-center gap-2">
                        <span>${escapeHtml(e.archivo.nombre||'')}</span>
                        ${sizeStr ? `<span>(${sizeStr})</span>` : ''}
                        <a href="${e.archivo.path}" target="_blank" download class="text-primary hover:underline ml-1">Descargar</a>
                    </div>
                   </div>`
                : `<div class="mt-2 p-3 rounded-lg bg-surface-container border border-outline-variant/30 flex items-center justify-between gap-3 max-w-lg">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <span class="material-symbols-outlined ${isPdf?'text-error':'text-primary'} text-[28px] flex-shrink-0">${isPdf?'picture_as_pdf':'description'}</span>
                        <div class="min-w-0">
                            <a href="${e.archivo.path}" target="_blank" class="text-sm font-label-bold text-on-surface hover:text-primary transition-colors truncate block">${escapeHtml(e.archivo.nombre||'Archivo')}</a>
                            ${sizeStr ? `<span class="text-[11px] text-on-surface-variant">${sizeStr}</span>` : ''}
                        </div>
                    </div>
                    <a href="${e.archivo.path}" target="_blank" download class="sq-btn sq-btn-secondary sq-btn-sm flex items-center gap-1 flex-shrink-0">
                        <span class="material-symbols-outlined text-[16px]">download</span> Descargar
                    </a>
                   </div>`
            ) : ''}
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

        // Inicializar y sincronizar adjuntos de la tarea
        t.archivos = Array.isArray(t.archivos) ? t.archivos : [];
        (current.bitacora || []).forEach(b => {
            const isThisTask = String(b.tarea_id) === String(t.id) || (b.etiquetas || []).includes('tarea:' + t.id);
            if (isThisTask && b.archivo && !t.archivos.some(a => a.id === b.id || a.path === b.archivo.path)) {
                t.archivos.push({
                    id: b.id,
                    nombre: b.archivo.nombre,
                    path: b.archivo.path,
                    mime: b.archivo.mime,
                    size: b.archivo.size,
                    fecha: b.fecha,
                    autor: b.autor
                });
            }
        });

        let activeSubtab = 'general';

        const overlay=document.createElement('div');
        overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(3px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
        overlay.innerHTML=`<div class="bg-surface-container-low text-on-surface rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col border border-outline-variant/30 shadow-2xl overflow-hidden">
            <!-- CABECERA DEL MODAL -->
            <div class="px-6 py-4 border-b border-outline-variant/20 bg-surface-container/60 flex items-center justify-between gap-4 flex-shrink-0">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap mb-1">
                        <span class="text-[11px] font-label-bold text-primary tracking-widest uppercase flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">view_timeline</span> Etapa:
                        </span>
                        <select id="tm-step" class="sq-input !py-0.5 !px-2 text-xs font-label-bold rounded-lg bg-surface-container-high border-outline-variant/40 max-w-[200px]" title="Mover a otra etapa">
                            ${(current.pasos||[]).map(s=>`<option value="${s.id}" ${s.id===pid?'selected':''}>${escapeHtml(s.nombre)}</option>`).join('')}
                        </select>
                        <span class="text-xs text-on-surface-variant font-mono">#${escapeHtml(t.id)}</span>
                    </div>
                    <input id="tm-title" class="sq-input w-full font-headline-md text-on-surface !py-1 text-base md:text-lg font-bold bg-transparent border-transparent hover:border-outline-variant/40 focus:border-primary transition-all rounded-lg" value="${escapeAttr(t.titulo||'')}" placeholder="Título de la tarea">
                </div>
                <button type="button" class="sq-btn sq-btn-ghost p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors flex-shrink-0" onclick="window._tmCleanAndClose()" title="Cerrar (Esc)">
                    <span class="material-symbols-outlined text-[22px]">close</span>
                </button>
            </div>

            <!-- BARRA DE SUB-PESTAÑAS -->
            <div class="px-6 pt-2 bg-surface-container-low border-b border-outline-variant/20 flex gap-2 flex-shrink-0 overflow-x-auto">
                <button type="button" class="tm-subtab active flex items-center gap-1.5 px-4 py-2.5 text-xs font-label-bold border-b-2 border-primary text-primary transition-colors" data-tab="general">
                    <span class="material-symbols-outlined text-[16px]">edit_note</span> General y Checklist
                </button>
                <button type="button" class="tm-subtab flex items-center gap-1.5 px-4 py-2.5 text-xs font-label-bold border-b-2 border-transparent text-on-surface-variant hover:text-on-surface transition-colors" data-tab="adjuntos">
                    <span class="material-symbols-outlined text-[16px]">attachment</span> Adjuntos <span id="tm-badge-adj" class="ml-0.5 px-1.5 py-0.2 rounded-full bg-surface-container-high text-[10px] font-bold"></span>
                </button>
                <button type="button" class="tm-subtab flex items-center gap-1.5 px-4 py-2.5 text-xs font-label-bold border-b-2 border-transparent text-on-surface-variant hover:text-on-surface transition-colors" data-tab="comentarios">
                    <span class="material-symbols-outlined text-[16px]">chat</span> Comentarios <span id="tm-badge-comm" class="ml-0.5 px-1.5 py-0.2 rounded-full bg-surface-container-high text-[10px] font-bold"></span>
                </button>
            </div>

            <!-- CUERPO PRINCIPAL CON SCROLL -->
            <div class="p-6 overflow-y-auto flex-1 space-y-6">
                <!-- PESTAÑA 1: GENERAL & CHECKLIST -->
                <div id="tm-tab-general" class="space-y-5">
                    <!-- METADATOS COMPACTOS -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 p-3.5 rounded-xl bg-surface-container/50 border border-outline-variant/20">
                        <div>
                            <label class="block text-[11px] font-label-bold text-on-surface-variant mb-1">Estado</label>
                            <select id="tm-status" class="sq-input text-xs !py-1.5">
                                <option ${t.status==='Hacer'?'selected':''} value="Hacer">Hacer</option>
                                <option ${t.status==='En progreso'?'selected':''} value="En progreso">En progreso</option>
                                <option ${t.status==='Completado'?'selected':''} value="Completado">Completado</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-[11px] font-label-bold text-on-surface-variant mb-1">Prioridad</label>
                            <select id="tm-prioridad" class="sq-input text-xs !py-1.5 font-bold">
                                <option value="Baja" ${t.prioridad==='Baja'?'selected':''}>🟢 Baja</option>
                                <option value="Media" ${(!t.prioridad||t.prioridad==='Media')?'selected':''}>🔵 Media</option>
                                <option value="Alta" ${t.prioridad==='Alta'?'selected':''}>🟠 Alta</option>
                                <option value="Urgente" ${t.prioridad==='Urgente'?'selected':''}>🔴 Urgente</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-[11px] font-label-bold text-on-surface-variant mb-1">Fecha inicio</label>
                            <input id="tm-start" type="date" class="sq-input text-xs !py-1.5" value="${t.fecha_inicio||''}">
                        </div>
                        <div>
                            <label class="block text-[11px] font-label-bold text-on-surface-variant mb-1">Fecha límite</label>
                            <input id="tm-due" type="date" class="sq-input text-xs !py-1.5" value="${t.fecha_limite||''}">
                        </div>
                        <div class="col-span-2 md:col-span-4 pt-1">
                            <label class="block text-[11px] font-label-bold text-on-surface-variant mb-1">Responsable asignado</label>
                            <select id="tm-resp" class="sq-input text-xs !py-1.5">
                                <option value="">Sin asignar</option>
                            </select>
                        </div>
                    </div>

                    <!-- DESCRIPCIÓN -->
                    <div>
                        <label class="block text-xs font-label-bold text-on-surface-variant mb-1 flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-[16px] text-primary">notes</span> Descripción y detalles
                        </label>
                        <textarea id="tm-desc" class="sq-input w-full text-sm rounded-xl" rows="3" placeholder="Añade instrucciones específicas, especificaciones técnicas o requerimientos para esta tarea...">${escapeHtml(t.descripcion||'')}</textarea>
                    </div>

                    <!-- CHECKLIST ENRIQUECIDO -->
                    <div class="p-4 rounded-xl bg-surface-container/40 border border-outline-variant/20 space-y-3">
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div class="flex items-center gap-2">
                                <span class="font-label-bold text-sm text-on-surface flex items-center gap-1.5">
                                    <span class="material-symbols-outlined text-primary text-[18px]">checklist</span>
                                    Criterios de verificación (Checklist)
                                </span>
                                <span id="tm-check-progress-badge" class="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold"></span>
                            </div>
                            <div class="flex items-center gap-2">
                                <button type="button" class="text-[11px] text-primary hover:underline font-label-bold" onclick="window._tmCheckAll(true)">Marcar todos</button>
                                <span class="text-on-surface-variant/40">|</span>
                                <button type="button" class="text-[11px] text-on-surface-variant hover:underline font-label-bold" onclick="window._tmCheckAll(false)">Desmarcar</button>
                            </div>
                        </div>

                        <!-- Barra de progreso -->
                        <div class="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
                            <div id="tm-check-bar" class="h-full bg-primary rounded-full transition-all duration-300" style="width:0%"></div>
                        </div>

                        <!-- Lista de ítems -->
                        <div id="tm-checklist" class="space-y-1.5 pt-1"></div>

                        <!-- Añadir nuevo ítem -->
                        <div class="flex gap-2 pt-2">
                            <input id="tm-check-new" class="sq-input text-sm flex-1 !py-2 rounded-xl" placeholder="Escribe un ítem y pulsa Enter...">
                            <button type="button" class="sq-btn sq-btn-primary sq-btn-sm flex items-center gap-1 rounded-xl px-3" id="tm-check-add">
                                <span class="material-symbols-outlined text-[16px]">add</span> Añadir
                            </button>
                        </div>
                    </div>
                </div>

                <!-- PESTAÑA 2: ADJUNTOS & EVIDENCIAS (DRAG & DROP) -->
                <div id="tm-tab-adjuntos" class="hidden space-y-4">
                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="font-label-bold text-sm text-on-surface flex items-center gap-1.5">
                                <span class="material-symbols-outlined text-primary text-[20px]">folder_open</span>
                                Biblioteca de adjuntos de la tarea
                            </h4>
                            <p class="text-xs text-on-surface-variant mt-0.5">Sube fotos de evidencia, planos, fichas técnicas o informes asociados a esta tarea.</p>
                        </div>
                    </div>

                    <!-- DROPZONE / ÁREA DE ARRASTRE -->
                    <div id="tm-dropzone" class="border-2 border-dashed border-outline-variant/40 hover:border-primary/60 rounded-2xl p-6 text-center transition-all bg-surface-container/30 cursor-pointer group">
                        <input type="file" id="tm-file" multiple class="hidden" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.zip">
                        <div class="flex flex-col items-center justify-center gap-2 pointer-events-none">
                            <div class="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                                <span class="material-symbols-outlined text-[28px]">cloud_upload</span>
                            </div>
                            <div>
                                <span class="text-sm font-label-bold text-on-surface">Arrastra tus archivos aquí</span>
                                <span class="text-xs text-on-surface-variant block mt-0.5">o haz clic para explorar tus documentos</span>
                            </div>
                            <span class="text-[11px] text-on-surface-variant/70">Imágenes (JPG, PNG), PDFs, hojas de cálculo, documentos Word o ZIP</span>
                        </div>
                        <div id="tm-upload-status" class="hidden mt-3 text-xs text-primary font-bold flex items-center justify-center gap-2">
                            <span class="sq-spinner w-4 h-4"></span> <span id="tm-upload-status-text">Subiendo archivos...</span>
                        </div>
                    </div>

                    <!-- LISTA / GRID DE ADJUNTOS -->
                    <div>
                        <div class="text-xs font-label-bold text-on-surface-variant uppercase tracking-wider mb-2 flex items-center justify-between">
                            <span>Archivos cargados (<span id="tm-att-count">0</span>)</span>
                        </div>
                        <div id="tm-attachments-list" class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1"></div>
                    </div>
                </div>

                <!-- PESTAÑA 3: COMENTARIOS & HISTORIAL -->
                <div id="tm-tab-comentarios" class="hidden space-y-4">
                    <div>
                        <h4 class="font-label-bold text-sm text-on-surface flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-primary text-[20px]">forum</span>
                            Comentarios y notas de avance
                        </h4>
                        <p class="text-xs text-on-surface-variant mt-0.5">Deja notas internas, actualizaciones del equipo o reportes de estado.</p>
                    </div>

                    <div id="tm-comments" class="max-h-64 overflow-y-auto space-y-3 p-2 bg-surface-container/30 rounded-xl border border-outline-variant/20"></div>

                    <div class="p-3 bg-surface-container/60 rounded-xl border border-outline-variant/30 space-y-2">
                        <div class="flex items-center justify-between text-xs text-on-surface-variant">
                            <span id="tm-replying-banner" class="hidden text-primary font-bold flex items-center gap-1">
                                <span class="material-symbols-outlined text-[14px]">reply</span> Respondiendo a comentario...
                                <button type="button" class="text-on-surface-variant hover:text-error ml-2" onclick="window._tmCancelReply()">✕</button>
                            </span>
                            <span>Escribe tu comentario</span>
                        </div>
                        <textarea id="tm-comment" class="sq-input w-full text-sm rounded-lg" rows="2" placeholder="Escribe un comentario o nota de avance..."></textarea>
                        <div class="flex justify-end">
                            <button type="button" class="sq-btn sq-btn-primary sq-btn-sm flex items-center gap-1" id="tm-comment-pub">
                                <span class="material-symbols-outlined text-[16px]">send</span> Publicar comentario
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- PIE DE PÁGINA / BOTONES -->
            <div class="px-6 py-4 border-t border-outline-variant/20 bg-surface-container/60 flex items-center justify-between gap-3 flex-shrink-0">
                <button type="button" class="sq-btn sq-btn-ghost text-error hover:bg-error/10 sq-btn-sm flex items-center gap-1 rounded-xl" onclick="if(confirm('¿Eliminar esta tarea definitivamente?')){ProyectosModule.deleteTarea('${pid}','${tid}');window._tmCleanAndClose();}">
                    <span class="material-symbols-outlined text-[18px]">delete</span> Eliminar
                </button>
                <div class="flex items-center gap-3">
                    <span class="hidden sm:inline text-xs text-on-surface-variant/70">Atajo: <kbd class="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 font-mono text-[10px]">Ctrl + Enter</kbd></span>
                    <button type="button" class="sq-btn sq-btn-secondary sq-btn-sm rounded-xl" onclick="window._tmCleanAndClose()">Cancelar</button>
                    <button type="button" class="sq-btn sq-btn-primary sq-btn-sm flex items-center gap-1.5 rounded-xl shadow-lg" id="tm-save">
                        <span class="material-symbols-outlined text-[18px]">check</span> Guardar cambios
                    </button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(overlay);

        // Control de sub-pestañas internas
        const subtabs = overlay.querySelectorAll('.tm-subtab');
        subtabs.forEach(btn => {
            btn.onclick = () => {
                subtabs.forEach(b => {
                    b.classList.remove('border-primary', 'text-primary');
                    b.classList.add('border-transparent', 'text-on-surface-variant');
                });
                btn.classList.remove('border-transparent', 'text-on-surface-variant');
                btn.classList.add('border-primary', 'text-primary');
                const target = btn.dataset.tab;
                overlay.querySelector('#tm-tab-general').classList.toggle('hidden', target !== 'general');
                overlay.querySelector('#tm-tab-adjuntos').classList.toggle('hidden', target !== 'adjuntos');
                overlay.querySelector('#tm-tab-comentarios').classList.toggle('hidden', target !== 'comentarios');
            };
        });

        // Limpieza y cierre
        window._tmCleanAndClose = () => {
            document.removeEventListener('keydown', handleKeyNav);
            delete window._tmToggleCheck;
            delete window._tmRemoveCheck;
            delete window._tmCheckAll;
            delete window._tmRemoveAttachment;
            delete window._tmCancelReply;
            delete window._tmCleanAndClose;
            overlay.remove();
        };

        const handleKeyNav = (e) => {
            if (e.key === 'Escape') {
                window._tmCleanAndClose();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                overlay.querySelector('#tm-save').click();
            }
        };
        document.addEventListener('keydown', handleKeyNav);

        const checklist = t.checklist || (t.checklist=[]);
        const comments = t.comments || (t.comments=[]);

        // CHECKLIST LOGIC
        window._tmToggleCheck = (i, val) => {
            checklist[i].completed = val;
            const allDone = checklist.length>0 && checklist.every(c=>c.completed);
            if (allDone) {
                t.completada = true;
                overlay.querySelector('#tm-status').value = 'Completado';
            }
            renderChecklist();
        };
        window._tmRemoveCheck = (i) => { checklist.splice(i,1); renderChecklist(); };
        window._tmCheckAll = (val) => {
            checklist.forEach(c => c.completed = val);
            if (val && checklist.length > 0) {
                t.completada = true;
                overlay.querySelector('#tm-status').value = 'Completado';
            }
            renderChecklist();
        };

        const renderChecklist = () => {
            const el = overlay.querySelector('#tm-checklist');
            const done = checklist.filter(c=>c.completed).length;
            const total = checklist.length;
            const pct = total ? Math.round((done/total)*100) : (t.completada?100:0);

            const badge = overlay.querySelector('#tm-check-progress-badge');
            if (badge) badge.textContent = `${done}/${total} (${pct}%)`;

            const bar = overlay.querySelector('#tm-check-bar');
            if (bar) bar.style.width = `${pct}%`;

            el.innerHTML = checklist.map((c,i)=>`<div class="flex items-center gap-2.5 p-2 rounded-xl bg-surface-container/50 hover:bg-surface-container border border-outline-variant/10 transition-colors group">
                <input type="checkbox" class="w-4 h-4 accent-primary rounded cursor-pointer" ${c.completed?'checked':''} onchange="window._tmToggleCheck(${i}, this.checked);">
                <span class="flex-1 text-sm ${c.completed?'line-through text-on-surface-variant/60':'text-on-surface font-medium'}">${escapeHtml(c.text)}</span>
                <button onclick="window._tmRemoveCheck(${i});" class="text-on-surface-variant hover:text-error opacity-40 group-hover:opacity-100 p-1 rounded transition-opacity" title="Quitar ítem">
                    <span class="material-symbols-outlined text-[16px]">close</span>
                </button>
            </div>`).join('') || '<div class="text-xs text-on-surface-variant/70 italic py-2 text-center bg-surface-container/20 rounded-xl">No hay ítems en el checklist. Añade tareas de verificación para llevar el control.</div>';
        };

        // RENDER DE ADJUNTOS
        const renderTaskAttachments = () => {
            const el = overlay.querySelector('#tm-attachments-list');
            const countEl = overlay.querySelector('#tm-att-count');
            const badgeEl = overlay.querySelector('#tm-badge-adj');
            const total = (t.archivos || []).length;
            if (countEl) countEl.textContent = total;
            if (badgeEl) badgeEl.textContent = total;

            if (!t.archivos || t.archivos.length === 0) {
                el.innerHTML = `<div class="col-span-full text-xs text-on-surface-variant/70 italic py-6 text-center bg-surface-container/20 rounded-2xl border border-dashed border-outline-variant/30">
                    <span class="material-symbols-outlined text-[36px] opacity-30 block mb-1">attachment</span>
                    No hay archivos adjuntos en esta tarea todavía.<br>Arrastra archivos o haz clic arriba para agregar evidencias o planos.
                </div>`;
                return;
            }

            el.innerHTML = t.archivos.map((a, idx) => {
                const isImg = a.mime?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(a.path || a.nombre || '');
                const isPdf = a.mime === 'application/pdf' || /\.pdf$/i.test(a.path || a.nombre || '');
                const icon = isImg ? 'image' : (isPdf ? 'picture_as_pdf' : 'description');
                const sizeStr = a.size ? formatFileSize(a.size) : '';

                return `<div class="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container border border-outline-variant/30 hover:border-primary/50 transition-all shadow-sm group">
                    <div class="flex items-center gap-3 min-w-0 flex-1">
                        ${isImg
                            ? `<a href="${a.path}" target="_blank" title="Ver imagen en tamaño completo" class="flex-shrink-0">
                                <img src="${a.path}" alt="${escapeAttr(a.nombre)}" class="w-12 h-12 rounded-lg object-cover border border-outline-variant/30 group-hover:scale-105 transition-transform">
                               </a>`
                            : `<div class="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center flex-shrink-0"><span class="material-symbols-outlined ${isPdf?'text-error':'text-primary'} text-[26px]">${icon}</span></div>`
                        }
                        <div class="min-w-0 flex-1">
                            <a href="${a.path}" target="_blank" class="text-xs md:text-sm font-label-bold text-on-surface hover:text-primary transition-colors truncate block" title="${escapeAttr(a.nombre)}">
                                ${escapeHtml(a.nombre)}
                            </a>
                            <div class="text-[11px] text-on-surface-variant flex items-center gap-2 mt-0.5">
                                ${sizeStr ? `<span class="font-mono">${sizeStr}</span>` : ''}
                                ${a.fecha ? `<span>· ${formatShortDate(a.fecha)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-1 flex-shrink-0">
                        <a href="${a.path}" target="_blank" download class="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors" title="Descargar archivo">
                            <span class="material-symbols-outlined text-[18px]">download</span>
                        </a>
                        <button type="button" onclick="window._tmRemoveAttachment(${idx})" class="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-surface-container-high transition-colors" title="Eliminar adjunto">
                            <span class="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                    </div>
                </div>`;
            }).join('');
        };

        window._tmRemoveAttachment = async (idx) => {
            if (!confirm('¿Eliminar este archivo adjunto?')) return;
            const removed = t.archivos.splice(idx, 1)[0];
            if (removed) {
                const bitEntry = (current.bitacora || []).find(b => b.id === removed.id || b.archivo?.path === removed.path);
                if (bitEntry) {
                    try { await API.delete(`/proyectos/${current.id}/bitacora/${bitEntry.id}`); } catch(e) {}
                }
                current.bitacora = (current.bitacora || []).filter(b => b.id !== removed.id && b.archivo?.path !== removed.path);
                await saveCurrent(['pasos', 'bitacora']);
                renderTaskAttachments();
                showToast('Adjunto eliminado', 'success');
            }
        };

        // SUBIDA DE ARCHIVOS CON DRAG & DROP
        const processUploadFiles = async (fileList) => {
            if (!fileList || !fileList.length) return;
            const statusEl = overlay.querySelector('#tm-upload-status');
            const statusText = overlay.querySelector('#tm-upload-status-text');
            if (statusEl) statusEl.classList.remove('hidden');

            let successCount = 0;
            for (let i = 0; i < fileList.length; i++) {
                const file = fileList[i];
                if (statusText) statusText.textContent = `Subiendo (${i + 1}/${fileList.length}): ${file.name}...`;

                const fd = new FormData();
                fd.append('file', file);
                fd.append('tipo', file.type?.startsWith('image/') ? 'evidencia' : 'documento');
                fd.append('nota', `Adjunto de tarea #${t.id}: ${t.titulo || 'Sin título'}`);
                fd.append('tarea_id', String(t.id));
                fd.append('paso_id', String(pid));
                fd.append('etiquetas', `tarea:${t.id}`);

                try {
                    const res = await fetch(`${App.API_BASE_URL}/api/proyectos/${current.id}/documentos`, {
                        method: 'POST',
                        body: fd,
                        credentials: 'include'
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || data.detail || 'Error al subir');

                    current.bitacora = data.bitacora || current.bitacora;
                    if (data.pasos) {
                        current.pasos = data.pasos;
                        const freshPaso = findPaso(pid);
                        const freshTarea = freshPaso?.tareas?.find(x => String(x.id) === String(t.id));
                        if (freshTarea) t.archivos = freshTarea.archivos || [];
                    } else if (data.entry && data.entry.archivo) {
                        t.archivos.unshift({
                            id: data.entry.id,
                            nombre: data.entry.archivo.nombre,
                            path: data.entry.archivo.path,
                            mime: data.entry.archivo.mime,
                            size: data.entry.archivo.size,
                            fecha: data.entry.fecha,
                            autor: data.entry.autor
                        });
                        await saveCurrent(['pasos']);
                    }
                    successCount++;
                } catch(e) {
                    showToast(`Error al subir ${file.name}: ${e.message}`, 'error');
                }
            }

            if (statusEl) statusEl.classList.add('hidden');
            if (successCount > 0) {
                showToast(`${successCount} archivo(s) adjuntado(s) exitosamente`, 'success');
                renderTaskAttachments();
            }
        };

        const dropzone = overlay.querySelector('#tm-dropzone');
        const fileInput = overlay.querySelector('#tm-file');

        dropzone.onclick = () => fileInput.click();
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('border-primary', 'bg-primary/10');
        });
        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('border-primary', 'bg-primary/10');
        });
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('border-primary', 'bg-primary/10');
            if (e.dataTransfer?.files?.length) {
                processUploadFiles(e.dataTransfer.files);
            }
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files?.length) {
                processUploadFiles(e.target.files);
                fileInput.value = '';
            }
        });

        // COMENTARIOS
        let replyingToId = null;
        window._tmCancelReply = () => {
            replyingToId = null;
            overlay.querySelector('#tm-replying-banner').classList.add('hidden');
            const inp = overlay.querySelector('#tm-comment');
            inp.placeholder = 'Escribe un comentario o nota de avance...';
        };

        const renderComments = () => {
            const el = overlay.querySelector('#tm-comments');
            const badgeEl = overlay.querySelector('#tm-badge-comm');
            if (badgeEl) badgeEl.textContent = comments.length;

            const topLevel = comments.filter(c=>!c.parentId);
            const renderOne = (c, depth) => {
                const replies = comments.filter(r=>r.parentId===c.id);
                const initials = (c.autor||'Tú').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
                return `<div style="margin-left:${depth*16}px;" class="p-3 rounded-xl bg-surface-container border border-outline-variant/10 text-xs space-y-1.5">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <div class="w-6 h-6 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-[10px]">${initials}</div>
                            <span class="font-label-bold text-on-surface">${escapeHtml(c.autor||'Tú')}</span>
                            <span class="text-on-surface-variant text-[10px]">${c.fecha||''}</span>
                        </div>
                        <button type="button" class="text-primary text-[11px] font-bold hover:underline flex items-center gap-0.5" onclick="(function(){ replyingToId='${c.id}'; const b=document.getElementById('tm-replying-banner'); if(b)b.classList.remove('hidden'); const i=document.getElementById('tm-comment'); i.placeholder='Respondiendo a ${escapeHtml(c.autor||'')}...'; i.focus(); })()">
                            <span class="material-symbols-outlined text-[14px]">reply</span> Responder
                        </button>
                    </div>
                    <p class="text-on-surface whitespace-pre-wrap pl-8">${escapeHtml(c.text)}</p>
                    ${replies.length ? `<div class="space-y-2 mt-2">${replies.map(r=>renderOne(r,depth+1)).join('')}</div>` : ''}
                </div>`;
            };
            el.innerHTML = topLevel.map(c=>renderOne(c,0)).join('') || '<div class="text-xs text-on-surface-variant/70 italic py-4 text-center">Sin comentarios aún. Sé el primero en dejar una nota.</div>';
        };

        overlay.querySelector('#tm-comment-pub').onclick = () => {
            const inp = overlay.querySelector('#tm-comment');
            const v = inp.value.trim();
            if(!v) return;
            const currentUser = (typeof App!=='undefined'&&App.user?.nombre_completo)||App?.user?.username||'Tú';
            comments.push({
                id: Date.now(),
                autor: currentUser,
                text: v,
                fecha: new Date().toLocaleString('es-CO', { dateStyle:'short', timeStyle:'short' }),
                parentId: replyingToId ? Number(replyingToId) : null
            });
            inp.value = '';
            window._tmCancelReply();
            renderComments();
        };

        // Población de usuarios
        (async () => {
            try {
                const users = await API.get('/usuarios');
                const sel = overlay.querySelector('#tm-resp');
                if (sel && Array.isArray(users)) {
                    sel.innerHTML = '<option value="">Sin asignar</option>' + users.map(u=>`<option value="${escapeAttr(u.nombre_completo||u.username)}" ${(t.responsable=== (u.nombre_completo||u.username))?'selected':''}>${escapeHtml(u.nombre_completo||u.username)}</option>`).join('');
                }
            } catch(e){}
        })();

        renderChecklist();
        renderTaskAttachments();
        renderComments();

        // Control checklist con Enter
        overlay.querySelector('#tm-check-new').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                overlay.querySelector('#tm-check-add').click();
            }
        });
        overlay.querySelector('#tm-check-add').onclick = () => {
            const inp = overlay.querySelector('#tm-check-new');
            const v = inp.value.trim();
            if(!v) return;
            checklist.push({id:Date.now(), text:v, completed:false});
            inp.value='';
            inp.focus();
            renderChecklist();
        };

        // GUARDAR CAMBIOS
        overlay.querySelector('#tm-save').onclick = async () => {
            const saveBtn = overlay.querySelector('#tm-save');
            saveBtn.disabled = true;
            saveBtn.innerHTML = `<span class="sq-spinner w-3.5 h-3.5 inline-block mr-1"></span> Guardando...`;

            t.titulo = overlay.querySelector('#tm-title').value.trim() || t.titulo;
            t.descripcion = overlay.querySelector('#tm-desc').value.trim();
            t.status = overlay.querySelector('#tm-status').value;
            t.prioridad = overlay.querySelector('#tm-prioridad').value;
            t.completada = (t.status==='Completado');

            let fi = overlay.querySelector('#tm-start').value || null;
            let fl = overlay.querySelector('#tm-due').value || null;
            if (fi && fl && fi > fl) { const tmp=fi; fi=fl; fl=tmp; }
            t.fecha_inicio = fi;
            t.fecha_limite = fl;
            t.responsable = overlay.querySelector('#tm-resp').value;
            t.checklist = checklist;
            t.comments = comments;

            // Revisar si se cambió la etapa
            const targetStepId = overlay.querySelector('#tm-step').value;
            if (targetStepId && targetStepId !== pid) {
                const targetPaso = findPaso(targetStepId);
                if (targetPaso) {
                    p.tareas = (p.tareas||[]).filter(x => String(x.id) !== String(t.id));
                    targetPaso.tareas = targetPaso.tareas || [];
                    targetPaso.tareas.push(t);
                    recompute(p);
                    recompute(targetPaso);
                }
            } else {
                recompute(p);
            }

            await saveCurrent(['pasos']);
            showToast('Tarea actualizada correctamente', 'success');
            window._tmCleanAndClose();
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

    return { init, openNuevaInstalacion, onCotizacionChange, crearInstalacion, openDetalle: (id)=>window.location.hash='#proyectos/'+id, setTab, agregarPaso, renamePaso, deletePaso, agregarTarea, editTarea, deleteTarea, openTaskModal, agregarSubtarea, editSubtarea, deleteSubtarea, toggleTarea, updateTareaField, agregarTareaRapida, sortTasks, setTaskPageSize, prevTaskPage, nextTaskPage, setTaskFilter, toggleTaskFilter, resetTaskFilters, toggleBom, updateBomQty, updateBomPrecio, updateBomNombre, addBomItem, removeBomItem, addBomFromInventario, onBomCatChange, addBomFiltered, agregarBitacora, deleteBitacora, editBitacora, createTag, deleteTag, guardarCostosReales, recalcCostos, eliminar };
})();

window.renderProyectos = function(id) { ProyectosModule.init(id); };
