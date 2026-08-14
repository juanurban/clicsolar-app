/**
 * SunQuote - Módulo de Proyectos (Kanban)
 */

window.ProyectosModule = (function () {
    let ESTADOS_KANBAN = [];
    let proyectosList = [];
    let clientesList = [];
    let currentDragProyectoId = null;

    async function init() {
        const container = document.getElementById('app-content');
        container.innerHTML = `
            <div class="p-6 h-[calc(100vh-80px)] flex flex-col">
                <div class="flex justify-between items-center mb-6">
                    <div>
                        <h1 class="text-headline-md font-headline-md text-on-surface">Proyectos</h1>
                        <p class="text-on-surface-variant mt-1">Gestión y seguimiento de proyectos (Kanban)</p>
                    </div>
                    <div class="flex items-center gap-3">
                        <button class="bg-surface-container text-on-surface px-4 py-2 rounded-xl font-label-bold hover:bg-surface-variant flex items-center gap-2 transition-all border border-outline-variant/30" onclick="ProyectosModule.openManageEstadosModal()">
                            <span class="material-symbols-outlined">settings_view_kanban</span>Estados
                        </button>
                        <button class="bg-primary text-on-primary px-6 py-2 rounded-xl font-label-bold hover:brightness-110 flex items-center gap-2 shadow-lg transition-all" onclick="ProyectosModule.openCrearModal()">
                            <span class="material-symbols-outlined">add</span>Nuevo Proyecto
                        </button>
                    </div>
                </div>
                
                <div class="flex-1 overflow-x-auto pb-4">
                    <div class="flex gap-4 min-w-max h-full" id="kanban-board">
                        <!-- Columnas inyectadas aquí -->
                    </div>
                </div>
            </div>
        `;
        
        await loadEstados();
        await loadClientes();
        await loadProyectos();
        renderKanban();
    }

    async function loadEstados() {
        try {
            const res = await fetch('/api/proyectos/estados');
            if(res.ok) ESTADOS_KANBAN = await res.json();
        } catch (e) { console.error('Error loading estados:', e); }
    }

    async function loadClientes() {
        try {
            const res = await fetch('/api/clientes');
            if(res.ok) clientesList = await res.json();
        } catch (e) { console.error('Error loading clientes:', e); }
    }

    async function loadProyectos() {
        try {
            const res = await fetch('/api/proyectos');
            if (res.ok) proyectosList = await res.json();
        } catch (error) {
            console.error('Error cargando proyectos:', error);
            window.showToast('Error al cargar proyectos', 'error');
        }
    }

    function renderKanban() {
        const board = document.getElementById('kanban-board');
        if (!board) return;
        board.innerHTML = '';

        if (ESTADOS_KANBAN.length === 0) {
            board.innerHTML = '<div class="w-full text-center p-8 text-on-surface-variant">No hay estados configurados. Configura los estados primero.</div>';
            return;
        }

        ESTADOS_KANBAN.forEach(estado => {
            const col = document.createElement('div');
            col.className = 'w-[320px] bg-surface-container-low rounded-2xl flex flex-col flex-shrink-0 border border-outline-variant/30 shadow-sm overflow-hidden';
            
            // Header
            const header = document.createElement('div');
            header.className = 'p-4 border-b border-outline-variant/50 flex justify-between items-center bg-surface-container';
            const title = document.createElement('h3');
            title.className = 'font-label-bold text-on-surface flex items-center gap-2';
            title.innerHTML = `<div class="w-3 h-3 rounded-full ${estado.color.split(' ')[1]} shadow-sm"></div> ${estado.nombre}`;
            
            const count = proyectosList.filter(p => p.estado_id === estado.id).length;
            const badge = document.createElement('span');
            badge.className = 'bg-surface-dim text-on-surface-variant text-xs px-2 py-1 rounded-md font-label-bold';
            badge.innerText = count;

            header.appendChild(title);
            header.appendChild(badge);
            col.appendChild(header);

            // Drop zone
            const list = document.createElement('div');
            list.className = 'flex-1 p-3 overflow-y-auto space-y-3 min-h-[150px] transition-colors';
            list.dataset.estadoId = estado.id;
            
            list.addEventListener('dragover', handleDragOver);
            list.addEventListener('dragleave', handleDragLeave);
            list.addEventListener('drop', handleDrop);

            // Cards
            const proyectosEstado = proyectosList.filter(p => p.estado_id === estado.id);
            proyectosEstado.forEach(p => {
                const card = createCard(p, estado);
                list.appendChild(card);
            });

            col.appendChild(list);
            board.appendChild(col);
        });
    }

    function createCard(proyecto, estado) {
        const card = document.createElement('div');
        card.className = `p-4 rounded-xl cursor-grab active:cursor-grabbing hover:shadow-md transition-all group relative ${estado.color}`;
        card.draggable = true;
        card.dataset.id = proyecto.id;

        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);

        // Optional date formatting
        const dateStr = new Date(proyecto.created_at).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });

        card.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <h4 class="font-label-bold text-on-surface leading-tight pr-6">${proyecto.nombre}</h4>
                <button class="absolute top-3 right-3 text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity hover:text-primary" onclick="ProyectosModule.openProyecto(${proyecto.id})">
                    <span class="material-symbols-outlined text-[20px]">open_in_new</span>
                </button>
            </div>
            <div class="text-xs text-on-surface-variant mb-3 flex items-center gap-1">
                <span class="material-symbols-outlined text-[14px]">person</span> ${proyecto.cliente_nombre}
            </div>
            ${proyecto.cotizacion_codigo ? `
            <div class="text-xs font-mono bg-surface-dim inline-block px-2 py-1 rounded text-primary mb-2">
                ${proyecto.cotizacion_codigo}
            </div>` : ''}
            <div class="flex justify-between items-center text-xs text-on-surface-variant mt-2">
                <div class="flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px]">calendar_today</span>
                    ${dateStr}
                </div>
            </div>
        `;
        return card;
    }

    // Drag & Drop Handlers
    function handleDragStart(e) {
        currentDragProyectoId = this.dataset.id;
        this.classList.add('opacity-50', 'scale-95');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dataset.id);
    }

    function handleDragEnd(e) {
        this.classList.remove('opacity-50', 'scale-95');
        currentDragProyectoId = null;
        document.querySelectorAll('[data-estado-id]').forEach(list => list.classList.remove('bg-surface-variant/30'));
    }

    function handleDragOver(e) {
        if (e.preventDefault) { e.preventDefault(); }
        e.dataTransfer.dropEffect = 'move';
        this.classList.add('bg-surface-variant/30');
        return false;
    }

    function handleDragLeave(e) {
        this.classList.remove('bg-surface-variant/30');
    }

    async function handleDrop(e) {
        if (e.stopPropagation) { e.stopPropagation(); }
        this.classList.remove('bg-surface-variant/30');
        
        const nuevoEstadoId = parseInt(this.dataset.estadoId);
        const proyectoId = parseInt(currentDragProyectoId);

        if (!proyectoId || !nuevoEstadoId) return false;

        const proyecto = proyectosList.find(p => p.id === proyectoId);
        if (proyecto && proyecto.estado_id !== nuevoEstadoId) {
            // Optimistic UI update
            const oldEstadoId = proyecto.estado_id;
            proyecto.estado_id = nuevoEstadoId;
            renderKanban();

            // API Call
            try {
                const res = await fetch(\`/api/proyectos/\${proyectoId}\`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ estado_id: nuevoEstadoId })
                });
                
                if (!res.ok) throw new Error('Failed to update');
                window.showToast('Estado actualizado', 'success');
            } catch (error) {
                console.error(error);
                proyecto.estado_id = oldEstadoId; // revert
                renderKanban();
                window.showToast('Error al actualizar estado', 'error');
            }
        }
        return false;
    }

    // Modals
    function openManageEstadosModal() {
        let rowsHtml = ESTADOS_KANBAN.map(e => `
            <div class="flex items-center gap-3 p-3 bg-surface-container rounded-lg border border-outline-variant/30">
                <div class="w-4 h-4 rounded-full \${e.color.split(' ')[1]} shadow-sm"></div>
                <span class="flex-1 font-label-bold">\${e.nombre}</span>
                <span class="text-xs text-on-surface-variant bg-surface px-2 py-1 rounded">Orden \${e.orden}</span>
                <button onclick="ProyectosModule.deleteEstado(\${e.id})" class="text-on-surface-variant hover:text-error transition-colors p-1" title="Eliminar">
                    <span class="material-symbols-outlined text-[18px]">delete</span>
                </button>
            </div>
        `).join('');

        if (ESTADOS_KANBAN.length === 0) {
            rowsHtml = '<p class="text-sm text-on-surface-variant italic">No hay estados configurados.</p>';
        }

        const html = `
            <div class="p-6">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-headline-md font-headline-md">Gestionar Estados del Kanban</h2>
                    <button onclick="window.closeModal()" class="text-on-surface-variant hover:text-error">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                
                <div class="space-y-3 mb-6 max-h-[40vh] overflow-y-auto">
                    \${rowsHtml}
                </div>

                <form onsubmit="ProyectosModule.saveEstado(event)" class="bg-surface-container p-4 rounded-xl border border-outline-variant/50">
                    <h3 class="font-label-bold mb-3">Añadir Nuevo Estado</h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input type="text" name="nombre" placeholder="Nombre (ej. Instalación)" required class="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2 text-on-surface text-sm focus:border-primary outline-none">
                        <select name="color" class="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2 text-on-surface text-sm focus:border-primary outline-none">
                            <option value="border-l-4 border-gray-400 bg-surface-container">Gris</option>
                            <option value="border-l-4 border-blue-400 bg-surface-container">Azul</option>
                            <option value="border-l-4 border-purple-400 bg-surface-container">Morado</option>
                            <option value="border-l-4 border-yellow-400 bg-surface-container">Amarillo</option>
                            <option value="border-l-4 border-orange-400 bg-surface-container">Naranja</option>
                            <option value="border-l-4 border-teal-400 bg-surface-container">Verde Azulado</option>
                            <option value="border-l-4 border-green-500 bg-surface-container">Verde</option>
                            <option value="border-l-4 border-red-500 bg-surface-container">Rojo</option>
                        </select>
                        <input type="number" name="orden" placeholder="Orden (ej. 1)" required class="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2 text-on-surface text-sm focus:border-primary outline-none">
                    </div>
                    <div class="mt-4 flex justify-end">
                        <button type="submit" class="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-bold text-sm hover:brightness-110">Añadir Estado</button>
                    </div>
                </form>
            </div>
        `;
        window.openModal(html);
    }

    async function saveEstado(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        data.orden = parseInt(data.orden);

        try {
            const res = await fetch('/api/proyectos/estados', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                window.showToast('Estado creado', 'success');
                await loadEstados();
                renderKanban();
                openManageEstadosModal(); // refresh modal
            } else {
                throw new Error('Error al crear estado');
            }
        } catch (err) {
            window.showToast('Error al crear estado', 'error');
        }
    }

    async function deleteEstado(id) {
        if(!confirm('¿Estás seguro? No se puede eliminar si hay proyectos en este estado.')) return;
        try {
            const res = await fetch(\`/api/proyectos/estados/\${id}\`, { method: 'DELETE' });
            if (res.ok) {
                window.showToast('Estado eliminado', 'success');
                await loadEstados();
                renderKanban();
                openManageEstadosModal();
            } else {
                const data = await res.json();
                window.showToast(data.error || 'Error al eliminar', 'error');
            }
        } catch (err) {
            console.error(err);
        }
    }

    function openCrearModal() {
        if(ESTADOS_KANBAN.length === 0) {
            window.showToast('Debes crear al menos un estado primero', 'error');
            return;
        }
        const html = `
            <div class="p-6">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-headline-md font-headline-md">Nuevo Proyecto</h2>
                    <button onclick="window.closeModal()" class="text-on-surface-variant hover:text-error">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <form id="form-proyecto" class="space-y-4" onsubmit="ProyectosModule.saveProyecto(event)">
                    <div>
                        <label class="block text-label-sm font-label-bold text-on-surface-variant mb-1">Nombre del Proyecto</label>
                        <input type="text" name="nombre" required class="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all">
                    </div>
                    <div>
                        <label class="block text-label-sm font-label-bold text-on-surface-variant mb-1">Cliente</label>
                        <select name="cliente_id" required class="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all">
                            <option value="">Seleccione un cliente...</option>
                            \${clientesList.map(c => \`<option value="\${c.id}">\${c.nombre}</option>\`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-label-sm font-label-bold text-on-surface-variant mb-1">Notas (Opcional)</label>
                        <textarea name="notas" rows="3" class="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"></textarea>
                    </div>
                    <div class="flex justify-end gap-3 mt-8">
                        <button type="button" onclick="window.closeModal()" class="px-6 py-2 rounded-lg font-label-bold text-on-surface-variant hover:bg-surface-container transition-colors">Cancelar</button>
                        <button type="submit" class="bg-primary text-on-primary px-6 py-2 rounded-lg font-label-bold hover:brightness-110 shadow-lg transition-all">Crear Proyecto</button>
                    </div>
                </form>
            </div>
        `;
        window.openModal(html);
    }

    async function saveProyecto(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        data.cliente_id = parseInt(data.cliente_id);
        
        try {
            const res = await fetch('/api/proyectos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                window.showToast('Proyecto creado', 'success');
                window.closeModal();
                await loadProyectos();
                renderKanban();
            } else {
                throw new Error('Error saving');
            }
        } catch (error) {
            window.showToast('Error al guardar', 'error');
        }
    }

    async function openProyecto(id) {
        const proyecto = proyectosList.find(p => p.id === id);
        if(!proyecto) return;

        // Fetch tareas
        let tareas = [];
        try {
            const res = await fetch(\`/api/proyectos/\${id}/tareas\`);
            if(res.ok) tareas = await res.json();
        } catch(e) { console.error(e); }

        const html = `
            <div class="p-6 h-[80vh] flex flex-col">
                <div class="flex justify-between items-center mb-6">
                    <div>
                        <h2 class="text-headline-md font-headline-md">\${proyecto.nombre}</h2>
                        <div class="flex items-center gap-4 text-sm text-on-surface-variant mt-2">
                            <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">person</span> \${proyecto.cliente_nombre}</span>
                            <span class="bg-surface-dim px-2 py-1 rounded text-primary">\${proyecto.estado}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="ProyectosModule.deleteProyecto(\${proyecto.id})" class="text-error hover:bg-error/10 p-2 rounded-lg transition-colors flex items-center justify-center" title="Eliminar proyecto">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                        <button onclick="window.closeModal()" class="text-on-surface-variant hover:text-primary p-2 rounded-lg transition-colors">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>

                <div class="flex-1 overflow-y-auto space-y-6 pr-2">
                    <!-- Notas -->
                    <div class="bg-surface p-4 rounded-xl border border-outline-variant/30">
                        <h3 class="font-label-bold text-on-surface mb-2 flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">notes</span> Notas</h3>
                        <p class="text-on-surface-variant text-sm whitespace-pre-wrap">\${proyecto.notas || 'Sin notas.'}</p>
                    </div>

                    <!-- Tareas (Checklist) -->
                    <div class="bg-surface p-4 rounded-xl border border-outline-variant/30">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="font-label-bold text-on-surface flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">checklist</span> Tareas</h3>
                        </div>
                        
                        <div class="space-y-2 mb-4" id="tareas-list">
                            \${tareas.map(t => `
                                <div class="flex items-center gap-3 p-2 hover:bg-surface-container rounded-lg transition-colors group">
                                    <input type="checkbox" \${t.completada ? 'checked' : ''} onchange="ProyectosModule.toggleTarea(\${t.id}, this.checked)" class="w-5 h-5 text-primary rounded border-outline-variant focus:ring-primary focus:ring-2 cursor-pointer bg-surface accent-primary">
                                    <span class="flex-1 \${t.completada ? 'line-through text-on-surface-variant' : 'text-on-surface'}">\${t.descripcion}</span>
                                    <button onclick="ProyectosModule.deleteTarea(\${t.id}, \${proyecto.id})" class="text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span class="material-symbols-outlined text-[18px]">delete</span>
                                    </button>
                                </div>
                            `).join('')}
                            \${tareas.length === 0 ? '<p class="text-sm text-on-surface-variant italic">No hay tareas creadas.</p>' : ''}
                        </div>

                        <form onsubmit="ProyectosModule.addTarea(event, \${proyecto.id})" class="flex gap-2 mt-4">
                            <input type="text" name="descripcion" placeholder="Nueva tarea..." required class="flex-1 bg-surface-container border border-outline-variant/50 rounded-lg px-4 py-2 text-on-surface text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all">
                            <button type="submit" class="bg-surface-container-highest hover:bg-surface-variant text-on-surface px-4 py-2 rounded-lg font-label-bold transition-all text-sm">Añadir</button>
                        </form>
                    </div>
                </div>
            </div>
        `;
        window.openModal(html);
    }

    async function toggleTarea(tareaId, completada) {
        try {
            await fetch(\`/api/proyectos/tareas/\${tareaId}\`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completada })
            });
            // Text strike-through is handled via CSS checked pseudo-class indirectly or by re-opening modal
        } catch (e) {
            console.error(e);
            window.showToast('Error actualizando tarea', 'error');
        }
    }

    async function addTarea(e, proyectoId) {
        e.preventDefault();
        const input = e.target.elements.descripcion;
        const descripcion = input.value;
        
        try {
            const res = await fetch(\`/api/proyectos/\${proyectoId}/tareas\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ descripcion })
            });
            if(res.ok) {
                input.value = '';
                openProyecto(proyectoId); // reload modal content
            }
        } catch(e) { console.error(e); }
    }

    async function deleteTarea(tareaId, proyectoId) {
        if(!confirm('¿Eliminar esta tarea?')) return;
        try {
            const res = await fetch(\`/api/proyectos/tareas/\${tareaId}\`, { method: 'DELETE' });
            if(res.ok) {
                openProyecto(proyectoId);
            }
        } catch(e) { console.error(e); }
    }

    async function deleteProyecto(id) {
        if(!confirm('¿Estás seguro de que deseas eliminar este proyecto y todas sus tareas?')) return;
        try {
            const res = await fetch(\`/api/proyectos/\${id}\`, { method: 'DELETE' });
            if (res.ok) {
                window.closeModal();
                window.showToast('Proyecto eliminado', 'success');
                await loadProyectos();
                renderKanban();
            }
        } catch(e) { console.error(e); }
    }

    return {
        init,
        openCrearModal,
        saveProyecto,
        openProyecto,
        toggleTarea,
        addTarea,
        deleteTarea,
        deleteProyecto,
        openManageEstadosModal,
        saveEstado,
        deleteEstado
    };
})();

// Expose the render function for the router
window.renderProyectos = function() {
    ProyectosModule.init();
};
