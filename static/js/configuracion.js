/**
 * SunQuote — Configuración Module
 */

async function renderConfiguracion() {
    const content = document.getElementById('app-content');
    content.innerHTML = `<div class="flex items-center justify-center h-[60vh]"><div class="sq-spinner"></div></div>`;

    try {
        const res = await API.get('/configuracion');
        
        // Helper to extract value safely
        const v = (key) => res[key] ? res[key].valor : '';

        const html = `
            <div class="flex flex-col w-full p-4 lg:p-12 gap-8 fade-in max-w-6xl mx-auto">
                <div class="flex flex-col gap-3">
                    <span class="font-label-bold text-label-bold text-primary tracking-widest uppercase">Ajustes del Sistema</span>
                    <h1 class="font-display-lg text-display-lg text-on-surface">Configuración Global</h1>
                </div>

                <form id="config-form" onsubmit="saveConfiguracion(event)">
                    
                    <!-- Parámetros Técnicos y Financieros -->
                    <div class="bg-surface-container-low p-8 lg:p-10 rounded-xl">
                        <div class="flex items-center gap-4 mb-8">
                            <div class="p-3 bg-surface-container-high rounded-lg text-primary">
                                <span class="material-symbols-outlined">analytics</span>
                            </div>
                            <h2 class="font-headline-md text-headline-md text-on-surface">Parámetros por Defecto (Técnicos y Financieros)</h2>
                        </div>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div>
                                <label class="sq-label">Eficiencia del Sistema (0-1)</label>
                                <input type="number" step="0.01" name="eficiencia_sistema" class="sq-input" value="${v('eficiencia_sistema')}">
                            </div>
                            <div>
                                <label class="sq-label">HSP Promedio Nacional</label>
                                <input type="number" step="0.1" name="hsp_defecto" class="sq-input" value="${v('hsp_defecto')}">
                            </div>
                            <div>
                                <label class="sq-label">Margen Comercial (%)</label>
                                <input type="number" step="1" name="margen_comercial" class="sq-input" value="${v('margen_comercial')}">
                            </div>
                            <div>
                                <label class="sq-label">Inflación Anual Tarifa (%)</label>
                                <input type="number" step="0.1" name="inflacion_tarifa" class="sq-input" value="${v('inflacion_tarifa')}">
                            </div>
                            <div>
                                <label class="sq-label">Degradación Panel (%)</label>
                                <input type="number" step="0.01" name="degradacion_anual" class="sq-input" value="${v('degradacion_anual')}">
                            </div>
                            <div>
                                <label class="sq-label">Costo AOM (% Inversión)</label>
                                <input type="number" step="0.1" name="aom_porcentaje" class="sq-input" value="${v('aom_porcentaje')}">
                            </div>
                            <div>
                                <label class="sq-label">Incremento Anual AOM (%)</label>
                                <input type="number" step="0.1" name="aom_incremento" class="sq-input" value="${v('aom_incremento')}">
                            </div>
                            <div>
                                <label class="sq-label">Deducción Ley 1715 (%)</label>
                                <input type="number" step="1" name="deduccion_renta" class="sq-input" value="${v('deduccion_renta')}">
                            </div>
                            <div>
                                <label class="sq-label">Tasa Impositiva (%)</label>
                                <input type="number" step="1" name="tasa_impositiva" class="sq-input" value="${v('tasa_impositiva')}">
                            </div>
                        </div>
                    </div>

                    <!-- Datos de la Empresa (Para PDF) -->
                    <div class="bg-surface-container-low p-8 lg:p-10 rounded-xl">
                        <div class="flex items-center gap-4 mb-8">
                            <div class="p-3 bg-surface-container-high rounded-lg text-primary">
                                <span class="material-symbols-outlined">business</span>
                            </div>
                            <h2 class="font-headline-md text-headline-md text-on-surface">Datos de la Empresa (PDF)</h2>
                        </div>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="sq-label">Razón Social</label>
                                <input type="text" name="empresa_nombre" class="sq-input font-bold" value="${v('empresa_nombre')}">
                            </div>
                            <div>
                                <label class="sq-label">Nombre abreviado (Sidebar)</label>
                                <input type="text" name="empresa_nombre_corto" class="sq-input" value="${v('empresa_nombre_corto')}">
                            </div>
                            <div>
                                <label class="sq-label">NIT</label>
                                <input type="text" name="empresa_nit" class="sq-input" value="${v('empresa_nit')}">
                            </div>
                            <div>
                                <label class="sq-label">Dirección Principal</label>
                                <input type="text" name="empresa_direccion" class="sq-input" value="${v('empresa_direccion')}">
                            </div>
                            <div>
                                <label class="sq-label">Teléfono de Contacto</label>
                                <input type="text" name="empresa_telefono" class="sq-input" value="${v('empresa_telefono')}">
                            </div>
                            <div>
                                <label class="sq-label">Correo Electrónico</label>
                                <input type="email" name="empresa_correo" class="sq-input" value="${v('empresa_correo')}">
                            </div>
                            <div>
                                <label class="sq-label">Sitio Web</label>
                                <input type="text" name="empresa_web" class="sq-input" value="${v('empresa_web')}">
                            </div>
                            <div class="md:col-span-2">
                                <label class="sq-label">Logo de la Empresa</label>
                                <div class="flex items-start gap-4">
                                    <div class="flex-1">
                                        <input type="hidden" name="empresa_logo" id="inp-empresa_logo" value="${v('empresa_logo')}">
                                        <input type="file" accept="image/*" id="inp-empresa_logo-upload" class="sq-input file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-primary file:text-on-primary file:cursor-pointer" onchange="uploadFile(this, 'empresa_logo', 'preview-empresa_logo', 'logo')">
                                        <div id="preview-empresa_logo" class="${v('empresa_logo') ? '' : 'hidden'} mt-3">
                                            <img src="${v('empresa_logo')}" class="max-h-20 rounded-lg border border-outline-variant/30">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Diseños de Plantas Solares -->
                    <div class="bg-surface-container-low p-8 lg:p-10 rounded-xl">
                        <div class="flex items-center gap-4 mb-8">
                            <div class="p-3 bg-surface-container-high rounded-lg text-primary">
                                <span class="material-symbols-outlined">image</span>
                            </div>
                            <h2 class="font-headline-md text-headline-md text-on-surface">Diseños de Plantas Solares (PDF)</h2>
                        </div>
                        <p class="text-on-surface-variant text-sm mb-6">Estas imágenes se mostrarán en las propuestas según el tipo de sistema configurado.</p>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label class="sq-label">On Grid con Baterías</label>
                                <input type="hidden" name="diseno_on_grid_bat" id="inp-diseno_on_grid_bat" value="${v('diseno_on_grid_bat')}">
                                <input type="file" accept="image/*" class="sq-input file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-primary file:text-on-primary file:cursor-pointer text-sm" onchange="uploadFile(this, 'diseno_on_grid_bat', 'preview-diseno_on_grid_bat', 'diseno')">
                                <div id="preview-diseno_on_grid_bat" class="${v('diseno_on_grid_bat') ? '' : 'hidden'} mt-3">
                                    <img src="${v('diseno_on_grid_bat')}" class="max-h-24 rounded-lg border border-outline-variant/30 w-full object-contain">
                                </div>
                            </div>
                            <div>
                                <label class="sq-label">On Grid sin Baterías</label>
                                <input type="hidden" name="diseno_on_grid" id="inp-diseno_on_grid" value="${v('diseno_on_grid')}">
                                <input type="file" accept="image/*" class="sq-input file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-primary file:text-on-primary file:cursor-pointer text-sm" onchange="uploadFile(this, 'diseno_on_grid', 'preview-diseno_on_grid', 'diseno')">
                                <div id="preview-diseno_on_grid" class="${v('diseno_on_grid') ? '' : 'hidden'} mt-3">
                                    <img src="${v('diseno_on_grid')}" class="max-h-24 rounded-lg border border-outline-variant/30 w-full object-contain">
                                </div>
                            </div>
                            <div>
                                <label class="sq-label">Off Grid</label>
                                <input type="hidden" name="diseno_off_grid" id="inp-diseno_off_grid" value="${v('diseno_off_grid')}">
                                <input type="file" accept="image/*" class="sq-input file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-primary file:text-on-primary file:cursor-pointer text-sm" onchange="uploadFile(this, 'diseno_off_grid', 'preview-diseno_off_grid', 'diseno')">
                                <div id="preview-diseno_off_grid" class="${v('diseno_off_grid') ? '' : 'hidden'} mt-3">
                                    <img src="${v('diseno_off_grid')}" class="max-h-24 rounded-lg border border-outline-variant/30 w-full object-contain">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Asesor Comercial -->
                    <div class="bg-surface-container-low p-8 lg:p-10 rounded-xl">
                        <div class="flex items-center gap-4 mb-8">
                            <div class="p-3 bg-surface-container-high rounded-lg text-primary">
                                <span class="material-symbols-outlined">badge</span>
                            </div>
                            <h2 class="font-headline-md text-headline-md text-on-surface">Asesor Comercial</h2>
                        </div>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="sq-label">Nombre del Asesor</label>
                                <input type="text" name="asesor_nombre" class="sq-input" value="${v('asesor_nombre')}" placeholder="Nombre completo">
                            </div>
                            <div>
                                <label class="sq-label">Teléfono</label>
                                <input type="text" name="asesor_telefono" class="sq-input" value="${v('asesor_telefono')}" placeholder="+57 300 123 4567">
                            </div>
                            <div>
                                <label class="sq-label">Correo Electrónico</label>
                                <input type="email" name="asesor_correo" class="sq-input" value="${v('asesor_correo')}" placeholder="asesor@sunquote.co">
                            </div>
                        </div>
                    </div>

                    <!-- Hitos Comerciales -->
                    <div class="bg-surface-container-low p-8 lg:p-10 rounded-xl">
                        <div class="flex items-center gap-4 mb-8">
                            <div class="p-3 bg-surface-container-high rounded-lg text-primary">
                                <span class="material-symbols-outlined">event</span>
                            </div>
                            <h2 class="font-headline-md text-headline-md text-on-surface">Condiciones Comerciales</h2>
                        </div>
                        
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label class="sq-label">Anticipo (%)</label>
                                <input type="number" step="1" name="pago_anticipo_pct" class="sq-input" value="${v('pago_anticipo_pct')}">
                            </div>
                            <div>
                                <label class="sq-label">Contra Entrega (%)</label>
                                <input type="number" step="1" name="pago_contraentrega_pct" class="sq-input" value="${v('pago_contraentrega_pct')}">
                            </div>
                            <div>
                                <label class="sq-label">Semanas Cronograma</label>
                                <input type="number" step="1" name="cronograma_semanas" class="sq-input" value="${v('cronograma_semanas')}">
                            </div>
                        </div>
                    </div>

                    <div class="flex justify-end gap-4 pb-8">
                        <button type="submit" class="sq-btn sq-btn-primary sq-btn-lg">
                            <span class="material-symbols-outlined">save</span> Guardar Cambios
                        </button>
                    </div>

                </form>
            </div>
        `;
        content.innerHTML = html;
    } catch (e) {
        content.innerHTML = `<div class="p-8 text-error text-center">Error cargando configuración: ${e.message}</div>`;
    }
}

async function saveConfiguracion(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    
    try {
        await API.put('/configuracion', { configuracion: data });
        await updateBranding();
        showToast('Configuración guardada exitosamente', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function uploadFile(input, fieldName, previewId, prefix = 'file') {
    const file = input.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('prefix', prefix);
    try {
        const res = await fetch('/api/configuracion/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Error al subir archivo');
        document.getElementById(`inp-${fieldName}`).value = data.url;
        const preview = document.getElementById(previewId);
        preview.querySelector('img').src = data.url;
        preview.classList.remove('hidden');
        showToast('Archivo subido exitosamente', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}
