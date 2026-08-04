/**
 * SunQuote — Cotizador Module
 */

let stateCotizador = {
    step: 1,
    clientes: [],
    clienteSelected: null,
    baseConsumo: 'promedio',
    paneles: [],
    inversores: [],
    baterias: [],
    materiales: [],
    servicios: [],
    dimensionamiento: null,
    financiero: null,
    items: [], // Desglose
    removedAutoItems: [],
    cronograma: [],
    config: { margen: 30, deduccion: 50, inflacion: 10, degradacion: 0.74, aom: 1.5, aom_inc: 5, auto: 100, exc: 0, incluir_ley1715: true }
};

let chartInstance = null;
let proyeccionCharts = {};

async function renderCotizador() {
    const content = document.getElementById('app-content');
    content.innerHTML = `
        <div class="flex flex-col w-full p-4 lg:p-12 gap-8 fade-in max-w-6xl mx-auto">
            <div class="flex flex-col gap-3">
                <span class="font-label-bold text-label-bold text-primary tracking-widest uppercase">Generador de Propuestas</span>
                <h1 class="font-display-lg text-display-lg text-on-surface">Dimensionamiento y Cotización</h1>
            </div>

            <!-- Stepper -->
            <div class="sq-stepper">
                <div class="sq-step active" id="step1-btn" onclick="goToStep(1)">
                    <div class="sq-step-number">1</div> Perfil
                </div>
                <div class="sq-step-line" id="line1"></div>

                <div class="sq-step" id="step2-btn" onclick="goToStep(2)">
                    <div class="sq-step-number">2</div> Técnico
                </div>
                <div class="sq-step-line" id="line2"></div>

                <div class="sq-step" id="step3-btn" onclick="goToStep(3)">
                    <div class="sq-step-number">3</div> Financiero
                </div>
                <div class="sq-step-line" id="line3"></div>

                <div class="sq-step" id="step4-btn" onclick="goToStep(4)">
                    <div class="sq-step-number">4</div> Resumen
                </div>
            </div>

            <!-- Steps Content -->
            <div id="step-container" class="sq-card p-0 overflow-hidden min-h-[500px]">
                <div class="p-16 flex justify-center"><div class="sq-spinner"></div></div>
            </div>
        </div>
    `;

    // Load initial data
    try {
        const [resCl, resPa, resIn, resBa, resConf, resMat, resSer] = await Promise.all([
            API.get('/clientes?limit=100'),
            API.get('/equipos?categoria=panel&activo=1'),
            API.get('/equipos?categoria=inversor&activo=1'),
            API.get('/equipos?categoria=bateria&activo=1'),
            API.get('/configuracion'),
            API.get('/equipos?categoria=estructura&activo=1'),
            API.get('/equipos?categoria=servicio&activo=1')
        ]);

        stateCotizador.clientes = resCl.data;
        stateCotizador.paneles = resPa.data;
        stateCotizador.inversores = resIn.data;
        stateCotizador.baterias = resBa.data;
        stateCotizador.materiales = resMat.data;
        stateCotizador.servicios = resSer.data;

        // Apply config
        if (resConf.margen_comercial) stateCotizador.config.margen = parseFloat(resConf.margen_comercial.valor);
        if (resConf.deduccion_renta) stateCotizador.config.deduccion = parseFloat(resConf.deduccion_renta.valor);
        if (resConf.inflacion_tarifa) stateCotizador.config.inflacion = parseFloat(resConf.inflacion_tarifa.valor);
        if (resConf.degradacion_anual) stateCotizador.config.degradacion = parseFloat(resConf.degradacion_anual.valor);
        if (resConf.aom_incremento) stateCotizador.config.aom_inc = parseFloat(resConf.aom_incremento.valor);

        // Load existing proposal for editing
        if (App.editCotizacionData) {
            const ed = App.editCotizacionData;
            const editId = App.editCotizacionId;
            App.editCotizacionData = null;
            App.editCotizacionId = null;

            stateCotizador.clienteSelected = typeof ed.cliente_id === 'object' ? ed.cliente_id : resCl.data.find(c => c.id === ed.cliente_id);
            stateCotizador.step = 4;
            stateCotizador.dimensionamiento = {
                panel: ed.panel || resPa.data.find(p => p.id === ed.panel_id),
                inversor_sugerido: ed.inversor || resIn.data.find(i => i.id === ed.inversor_id),
                potencia_kwp: ed.potencia_kwp,
                num_paneles: ed.num_paneles,
                produccion_diaria_kwh: ed.produccion_diaria_kwh,
                produccion_mensual_kwh: ed.produccion_mensual_kwh,
                area_requerida_m2: ed.area_requerida_m2,
                peso_total_kg: ed.peso_total_kg,
                cobertura_pct: ed.produccion_mensual_kwh && ed.cliente_consumo ? Math.round(ed.produccion_mensual_kwh / ed.cliente_consumo * 100) : 0,
                eficiencia_usada: 0.82,
                consumo_mensual_kwh: ed.cliente_consumo || 0,
                consumo_diario_kwh: 0,
                hsp: ed.cliente_hsp || 4.2
            };
            const rawItems = ed.items_json;
            if (Array.isArray(rawItems)) {
                stateCotizador.items = rawItems;
            } else if (rawItems && typeof rawItems === 'object') {
                stateCotizador.items = rawItems.items || [];
                if (rawItems.incluir_ley1715 !== undefined) {
                    stateCotizador.config.incluir_ley1715 = rawItems.incluir_ley1715;
                }
            } else {
                stateCotizador.items = [];
            }
            stateCotizador.cronograma = Array.isArray(ed.cronograma_json) ? ed.cronograma_json : [];
            stateCotizador.financiero = {
                subtotal: ed.subtotal,
                margen: ed.margen_comercial_pct,
                total_inversion: ed.total_inversion,
                escenario_1: {
                    titulo: 'Sin Incentivos',
                    ahorro_mensual: ed.ahorro_mensual,
                    ahorro_anual: ed.ahorro_anual,
                    roi_meses: ed.roi_sin_incentivos_meses,
                    roi_anos: Math.round(ed.roi_sin_incentivos_meses / 12 * 10) / 10
                },
                escenario_2: {
                    titulo: 'Con Incentivos Ley 1715',
                    deduccion_renta: ed.total_inversion * (ed.deduccion_renta_pct / 100),
                    beneficio_fiscal: ed.total_inversion * (ed.deduccion_renta_pct / 100) * 0.33,
                    inversion_neta: ed.total_inversion - (ed.total_inversion * (ed.deduccion_renta_pct / 100) * 0.33),
                    ahorro_mensual: ed.ahorro_mensual,
                    ahorro_anual: ed.ahorro_anual,
                    roi_meses: ed.roi_con_incentivos_meses,
                    roi_anos: Math.round(ed.roi_con_incentivos_meses / 12 * 10) / 10
                },
                proyeccion: Array.isArray(ed.proyeccion_25_json) ? ed.proyeccion_25_json : [],
                resumen_25_anos: {
                    inversion_inicial: ed.total_inversion,
                    ahorro_neto_25: 0,
                    roi_total_pct: 0
                }
            };
            // Mark as editing
            App.editingCotizacionId = editId;
        }

        // Auto-select if arriving from Clients
        if (App.selectedClienteId) {
            const c = stateCotizador.clientes.find(x => x.id === App.selectedClienteId);
            if (c) {
                stateCotizador.clienteSelected = c;
                stateCotizador.step = 2;
                App.selectedClienteId = null; // consume it
            }
        }

        renderStep();
    } catch (error) {
        document.getElementById('step-container').innerHTML = `<div class="p-8 text-error text-center">Error inicializando cotizador: ${error.message}</div>`;
    }
}

function goToStep(s) {
    if (s > stateCotizador.step) {
        // Validation before moving forward
        if (s === 2 && !stateCotizador.clienteSelected) return showToast('Seleccione un cliente primero', 'error');
        if (s === 3 && !stateCotizador.dimensionamiento) return showToast('Complete el dimensionamiento', 'error');
        if (s === 4 && !stateCotizador.financiero) return showToast('Complete el análisis financiero', 'error');
    }
    stateCotizador.step = s;
    renderStep();
}

function renderStep() {
    // Update Stepper UI
    for(let i=1; i<=4; i++) {
        const btn = document.getElementById(`step${i}-btn`);
        if (btn) {
            btn.classList.remove('active', 'completed');
            if (i < stateCotizador.step) btn.classList.add('completed');
            if (i === stateCotizador.step) btn.classList.add('active');
        }
        const line = document.getElementById(`line${i}`);
        if (line) {
            line.classList.remove('active');
            if (i < stateCotizador.step) line.classList.add('active');
        }
    }

    const container = document.getElementById('step-container');
    container.innerHTML = '';

    if (stateCotizador.step === 1) renderStep1(container);
    else if (stateCotizador.step === 2) renderStep2(container);
    else if (stateCotizador.step === 3) renderStep3(container);
    else if (stateCotizador.step === 4) renderStep4(container);
}

// ══════════════ STEP 1: PERFIL ══════════════
function renderStep1(container) {
    const opts = stateCotizador.clientes.map(c => `<option value="${c.id}" ${stateCotizador.clienteSelected?.id===c.id?'selected':''}>${c.nombre} (${c.ciudad})</option>`).join('');

    let profileHtml = '';
    if (stateCotizador.clienteSelected) {
        const c = stateCotizador.clienteSelected;
        profileHtml = `
            <div class="mt-8 bg-surface-container-high p-6 rounded-xl fade-in grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                    <div class="text-[10px] text-on-surface-variant uppercase">Tarifa</div>
                    <div class="font-label-bold text-on-surface">${c.tipo_tarifa}</div>
                </div>
                <div>
                    <div class="text-[10px] text-on-surface-variant uppercase">Consumo Mes</div>
                    <div class="font-label-bold text-primary text-lg">${formatNumber(c.consumo_mensual_kwh)} kWh</div>
                </div>
                <div>
                    <div class="text-[10px] text-on-surface-variant uppercase">Valor Energía</div>
                    <div class="font-label-bold text-primary text-lg">${formatCurrency(c.costo_kwh)}</div>
                </div>
                <div>
                    <div class="text-[10px] text-on-surface-variant uppercase">Horas Sol (HSP)</div>
                    <div class="font-label-bold text-on-surface">${c.hsp}</div>
                </div>
            </div>
            <div class="mt-8 flex justify-end">
                <button onclick="goToStep(2)" class="sq-btn sq-btn-primary">Continuar al Diseño Técnico <span class="material-symbols-outlined">arrow_forward</span></button>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="p-8 fade-in">
            <h2 class="font-headline-md mb-6">Selección de Cliente</h2>
            <div class="flex flex-col md:flex-col md:flex-row gap-4 items-end">
                <div class="flex-1 w-full">
                    <label class="sq-label">Seleccionar Cliente Existente</label>
                    <select id="select-cliente" class="sq-input" onchange="selectCliente(this.value)">
                        <option value="">-- Seleccione --</option>
                        ${opts}
                    </select>
                </div>
                <div class="pb-2 text-on-surface-variant">o</div>
                <button onclick="navigateTo('clientes')" class="sq-btn sq-btn-secondary w-full md:w-auto h-[42px]">Nuevo Cliente</button>
            </div>
            ${profileHtml}
        </div>
    `;
}

async function selectCliente(id) {
    if (!id) {
        stateCotizador.clienteSelected = null;
        renderStep();
        return;
    }
    try {
        const cliente = await API.get(`/clientes/${id}`);
        stateCotizador.clienteSelected = cliente;
        stateCotizador.dimensionamiento = null;
        stateCotizador.items = [];
        stateCotizador.removedAutoItems = [];
        renderStep();
    } catch (e) {
        showToast('Error al cargar datos del cliente', 'error');
    }
}

// ══════════════ STEP 2: TÉCNICO ══════════════
async function renderStep2(container) {
    // Si no hay dimensionamiento previo, haz uno por defecto con el primer panel
    if (!stateCotizador.dimensionamiento && stateCotizador.paneles.length > 0) {
        await executeDimensionamiento(stateCotizador.paneles[0].id);
    }

    const c = stateCotizador.clienteSelected;
    const d = stateCotizador.dimensionamiento;

    if (!d) {
        container.innerHTML = `<div class="p-8 text-center text-on-surface-variant">No hay paneles disponibles en el inventario para dimensionar.</div>`;
        return;
    }

    const optsPanel = stateCotizador.paneles.map(p => `<option value="${p.id}" ${d.panel.id==p.id?'selected':''}>${p.marca} ${p.potencia_wp}Wp</option>`).join('');

    // Check if suggested inverter is in the list, otherwise add it as option
    let invOptions = '';
    stateCotizador.inversores.forEach(i => {
        const sel = (d.inversor_sugerido && d.inversor_sugerido.id == i.id) ? 'selected' : '';
        invOptions += `<option value="${i.id}" ${sel}>${i.marca} ${i.potencia_kw}kW - ${i.tipo}</option>`;
    });

    const cHist = (c && c.historial_consumo && Array.isArray(c.historial_consumo) && c.historial_consumo.length > 0) ? c.historial_consumo : [];
    const ultConsumo = cHist.length > 0 ? cHist[cHist.length - 1] : (d.consumo_mensual_kwh || 0);
    const maxConsumo = cHist.length > 0 ? Math.max(...cHist) : (d.consumo_mensual_kwh || 0);

    container.innerHTML = `
        <div class="p-8 lg:p-10 fade-in flex flex-col gap-10">

            <!-- Fila de Controles -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                    <label class="sq-label">Base de Consumo</label>
                    <select id="dim-base-consumo" class="sq-input" onchange="triggerDimensionamiento()">
                        <option value="promedio" ${stateCotizador.baseConsumo === 'promedio' ? 'selected' : ''}>Promedio Mensual</option>
                        <option value="ultimo" ${stateCotizador.baseConsumo === 'ultimo' ? 'selected' : ''}>Último Mes</option>
                        <option value="mayor" ${stateCotizador.baseConsumo === 'mayor' ? 'selected' : ''}>Mes de Mayor Consumo</option>
                    </select>
                </div>
                <div>
                    <label class="sq-label">Panel Solar</label>
                    <select id="dim-panel" class="sq-input" onchange="triggerDimensionamiento()">${optsPanel}</select>
                </div>
                <div>
                    <label class="sq-label">Inversor</label>
                    <select id="dim-inversor" class="sq-input" onchange="triggerDimensionamiento()">${invOptions}</select>
                </div>
                <div>
                    <label class="sq-label">Eficiencia (%)</label>
                    <input type="number" id="dim-eficiencia" class="sq-input" value="${d.eficiencia_usada * 100}" onchange="triggerDimensionamiento()">
                </div>
                <div>
                    <label class="sq-label">Margen Comercial</label>
                    <div class="flex items-center gap-3">
                        <input type="range" id="dim-margen" class="flex-1 accent-primary" min="0" max="50" step="1" value="${stateCotizador.config.margen}" oninput="updateStep2Margen(this.value)">
                        <span id="dim-margen-val" class="font-label-bold text-primary text-lg min-w-[48px] text-right">${stateCotizador.config.margen}%</span>
                    </div>
                </div>
            </div>

            <!-- Datos de Consumo -->
            <div class="flex flex-wrap items-center gap-6 p-6 bg-surface-container-high rounded-xl">
                <div class="flex items-center gap-4">
                    <span class="material-symbols-outlined text-primary text-[28px]">bolt</span>
                    <div>
                        <div class="text-[10px] text-on-surface-variant uppercase tracking-wider">Consumo Promedio</div>
                        <div class="font-label-bold text-on-surface text-xl">${formatNumber(d.consumo_mensual_kwh)} kWh</div>
                    </div>
                </div>
                <div class="w-px h-10 bg-outline-variant/30 hidden sm:block"></div>
                <div class="flex items-center gap-4">
                    <span class="material-symbols-outlined text-primary text-[28px]">history</span>
                    <div>
                        <div class="text-[10px] text-on-surface-variant uppercase tracking-wider">Último Consumo</div>
                        <div class="font-label-bold text-on-surface text-xl">${formatNumber(ultConsumo)} kWh</div>
                    </div>
                </div>
                <div class="w-px h-10 bg-outline-variant/30 hidden sm:block"></div>
                <div class="flex items-center gap-4">
                    <span class="material-symbols-outlined text-primary text-[28px]">trending_up</span>
                    <div>
                        <div class="text-[10px] text-on-surface-variant uppercase tracking-wider">Consumo Más Alto</div>
                        <div class="font-label-bold text-on-surface text-xl">${formatNumber(maxConsumo)} kWh</div>
                    </div>
                </div>
                <div class="w-px h-10 bg-outline-variant/30 hidden sm:block"></div>
                <div class="flex items-center gap-4">
                    <span class="material-symbols-outlined text-primary text-[28px]">wb_sunny</span>
                    <div>
                        <div class="text-[10px] text-on-surface-variant uppercase tracking-wider">Consumo Diario</div>
                        <div class="font-label-bold text-on-surface text-xl">${d.consumo_diario_kwh} kWh/día</div>
                    </div>
                </div>
                <div class="w-px h-10 bg-outline-variant/30 hidden sm:block"></div>
                <div class="flex items-center gap-4">
                    <span class="material-symbols-outlined text-primary text-[28px]">hdr_strong</span>
                    <div>
                        <div class="text-[10px] text-on-surface-variant uppercase tracking-wider">HSP</div>
                        <div class="font-label-bold text-on-surface text-xl">${d.hsp} h</div>
                    </div>
                </div>
            </div>

            <!-- Sistema Propuesto -->
            <div>
                <div class="flex justify-between items-center mb-6">
                    <h3 class="font-headline-md text-headline-md text-on-surface">Sistema Propuesto</h3>
                    <div class="text-right">
                        <div class="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">Cobertura</div>
                        <div class="font-display-lg text-primary text-4xl">${d.cobertura_pct}%</div>
                    </div>
                </div>

                <div class="grid grid-cols-2 lg:grid-cols-4 gap-6">
                    <div class="bg-surface-container-low border border-outline-variant/30 p-8 lg:p-10 rounded-xl text-center">
                        <span class="material-symbols-outlined text-primary text-[40px] mb-4">solar_power</span>
                        <div class="font-display-lg text-on-surface text-4xl mb-2">${d.potencia_kwp} <span class="text-xl">kWp</span></div>
                        <div class="text-sm text-on-surface-variant uppercase tracking-wider font-medium">Potencia Instalada</div>
                    </div>

                    <div class="bg-surface-container-low border border-outline-variant/30 p-8 lg:p-10 rounded-xl text-center">
                        <span class="material-symbols-outlined text-primary text-[40px] mb-4">grid_view</span>
                        <div class="font-display-lg text-on-surface text-4xl mb-2">${d.num_paneles} <span class="text-xl">Und</span></div>
                        <div class="text-sm text-on-surface-variant uppercase tracking-wider font-medium">Cantidad Paneles</div>
                    </div>

                    <div class="bg-surface-container-low border border-outline-variant/30 p-8 lg:p-10 rounded-xl text-center">
                        <span class="material-symbols-outlined text-on-surface-variant text-[40px] mb-4">electric_bolt</span>
                        <div class="font-display-lg text-on-surface text-3xl mb-2">${formatNumber(d.produccion_mensual_kwh)} <span class="text-lg">kWh</span></div>
                        <div class="text-sm text-on-surface-variant uppercase tracking-wider font-medium">Producción Mensual</div>
                    </div>

                    <div class="bg-surface-container-low border border-outline-variant/30 p-8 lg:p-10 rounded-xl text-center">
                        <span class="material-symbols-outlined text-on-surface-variant text-[40px] mb-4">architecture</span>
                        <div class="font-display-lg text-on-surface text-3xl mb-2">${d.area_requerida_m2} <span class="text-lg">m²</span></div>
                        <div class="text-sm text-on-surface-variant uppercase tracking-wider font-medium">Área · ${d.peso_total_kg} kg</div>
                    </div>
                </div>
            </div>

            <!-- Grilla de Ítems (BOM) -->
            <div class="bg-surface-container-high rounded-xl overflow-hidden border border-outline-variant/20">
                <div class="p-5 lg:p-6 border-b border-outline-variant/20 flex justify-between items-center bg-surface-container-highest">
                    <h3 class="font-headline-md text-headline-md text-on-surface">Equipos, Materiales y Servicios</h3>
                </div>
                <div class="p-5 lg:p-6 grid grid-cols-1 md:grid-cols-4 gap-5 items-end bg-surface-container-low border-b border-outline-variant/20">
                    <div class="md:col-span-2">
                        <label class="sq-label">Agregar Ítem Extra</label>
                        <select id="extra-item-id" class="sq-input">
                            <option value="">-- Seleccionar --</option>
                            <optgroup label="Paneles">
                                ${stateCotizador.paneles.map(p => `<option value="pan-${p.id}">${p.marca} ${p.modelo}</option>`).join('')}
                            </optgroup>
                            <optgroup label="Inversores">
                                ${stateCotizador.inversores.map(i => `<option value="inv-${i.id}">${i.marca} ${i.modelo}</option>`).join('')}
                            </optgroup>
                            <optgroup label="Baterías">
                                ${stateCotizador.baterias.map(b => `<option value="bat-${b.id}">${b.marca} ${b.modelo}</option>`).join('')}
                            </optgroup>
                            <optgroup label="Materiales">
                                ${stateCotizador.materiales.map(m => `<option value="mat-${m.id}">${m.modelo}</option>`).join('')}
                            </optgroup>
                            <optgroup label="Servicios">
                                ${stateCotizador.servicios.map(s => `<option value="ser-${s.id}">${s.modelo}</option>`).join('')}
                            </optgroup>
                        </select>
                    </div>
                    <div>
                        <label class="sq-label">Cantidad</label>
                        <input type="number" id="extra-item-qty" class="sq-input" value="1" min="1">
                    </div>
                    <div>
                        <button onclick="addExtraItem()" class="sq-btn sq-btn-secondary w-full">Añadir</button>
                    </div>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead class="text-xs uppercase text-on-surface-variant bg-surface-container border-b border-outline-variant/20">
                            <tr>
                                <th class="px-6 py-4">Categoría</th>
                                <th class="px-6 py-4">Ítem</th>
                                <th class="px-6 py-4 text-right">Cant.</th>
                                <th class="px-6 py-4 text-right">Costo</th>
                                <th class="px-6 py-4 text-right">Precio Venta</th>
                                <th class="px-6 py-4 text-right">Subtotal</th>
                                <th class="px-6 py-4 text-center">Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(stateCotizador.items || []).map(it => {
                                const margen = stateCotizador.config.margen || 15;
                                const hasIva = !!it.iva;
                                const precioVenta = Math.round(it.precio_unitario * (1 + margen / 100));
                                return `
                                <tr class="border-b border-outline-variant/10 hover:bg-surface-container/50 transition-colors">
                                    <td class="px-6 py-4 text-sm text-on-surface-variant capitalize">${it.categoria}</td>
                                    <td class="px-6 py-4 font-label-bold">${it.nombre} ${hasIva ? '<span class="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded ml-1">IVA</span>' : ''}</td>
                                    <td class="px-6 py-4 text-right"><input type="number" class="sq-input w-20 text-right inline-block text-sm" value="${it.cantidad}" min="0.1" step="any" onchange="updateItemQty('${it.id}', this.value)"></td>
                                    <td class="px-6 py-4 text-right text-on-surface-variant">${formatCurrency(it.precio_unitario)}</td>
                                    <td class="px-6 py-4 text-right text-primary font-label-bold">${formatCurrency(precioVenta)}</td>
                                    <td class="px-6 py-4 text-right text-primary font-label-bold">${formatCurrency(it.subtotal * (1 + margen / 100))}</td>
                                    <td class="px-6 py-4 text-center">
                                        <button onclick="removeItem('${it.id}')" class="text-on-surface-variant hover:text-error transition-colors p-1">
                                            <span class="material-symbols-outlined text-[18px]">close</span>
                                        </button>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                        <tfoot class="bg-surface-container-highest font-label-bold">
                            <tr>
                                <td colspan="4" class="px-6 py-5 text-right">SUBTOTAL (Costo + Margen ${stateCotizador.config.margen || 15}%)</td>
                                <td></td>
                                <td class="px-6 py-5 text-right text-lg text-primary">${formatCurrency((stateCotizador.items || []).reduce((s, i) => s + i.subtotal * (1 + (stateCotizador.config.margen || 15) / 100), 0))}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

        </div>
        <div class="px-8 lg:px-10 pb-8 lg:pb-10 flex justify-between border-t border-outline-variant/30 pt-6 lg:pt-8">
            <button onclick="goToStep(1)" class="sq-btn sq-btn-ghost">Atrás</button>
            <button onclick="prepareAndGoToStep3()" class="sq-btn sq-btn-primary">Continuar al Financiero <span class="material-symbols-outlined">arrow_forward</span></button>
        </div>
    `;
}

async function executeDimensionamiento(panel_id, inversor_id = null, eficiencia = null, baseConsumo = 'promedio') {
    const c = stateCotizador.clienteSelected;
    let consumo_usar = c.consumo_mensual_kwh;

    if (c.historial_consumo && c.historial_consumo.length > 0) {
        if (baseConsumo === 'ultimo') {
            consumo_usar = c.historial_consumo[c.historial_consumo.length - 1];
        } else if (baseConsumo === 'mayor') {
            consumo_usar = Math.max(...c.historial_consumo);
        }
    } else if (baseConsumo !== 'promedio') {
        showToast('No hay historial de consumo, usando promedio', 'info');
        stateCotizador.baseConsumo = 'promedio';
    }

    try {
        const payload = {
            consumo_mensual_kwh: consumo_usar,
            costo_kwh: c.costo_kwh,
            hsp: c.hsp,
            cargas_especiales_kwh_dia: c.cargas_especiales_kwh_dia,
            panel_id: parseInt(panel_id)
        };
        if (inversor_id) payload.inversor_id = parseInt(inversor_id);
        if (eficiencia) payload.eficiencia = parseFloat(eficiencia) / 100;

        const res = await API.post('/cotizaciones/dimensionar', payload);
        stateCotizador.dimensionamiento = res;

        rebuildBOM();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function triggerDimensionamiento() {
    const pId = document.getElementById('dim-panel').value;
    const iId = document.getElementById('dim-inversor').value;
    const ef = document.getElementById('dim-eficiencia').value;
    const bC = document.getElementById('dim-base-consumo').value;

    stateCotizador.baseConsumo = bC;

    // Show quick loading state in right col
    document.querySelectorAll('.font-display-lg').forEach(el => el.innerHTML = '...');

    await executeDimensionamiento(pId, iId, ef, bC);
    renderStep();
}

function rebuildBOM() {
    const d = stateCotizador.dimensionamiento;
    const conf = stateCotizador.config;
    let autoItems = [];

    // Helper para añadir item auto
    const addAuto = (id, equipo, cant, catName, defaultNombre) => {
        if (!equipo && !defaultNombre) return;
        const eqId = equipo ? equipo.id : 0;
        const nombre = equipo ? `${equipo.marca ? equipo.marca + ' ' : ''}${equipo.modelo}`.trim() : defaultNombre;
        const costo = equipo ? equipo.costo : 0;
        const iva = equipo ? !!equipo.iva : true;
        autoItems.push({
            id,
            equipo_id: eqId,
            categoria: catName,
            nombre,
            cantidad: cant,
            precio_unitario: costo,
            iva,
            subtotal: cant * costo,
            isAuto: true
        });
    };

    // 1. INVERSOR
    if (d.inversor_sugerido) {
        addAuto('auto-inversor', d.inversor_sugerido, 1, 'inversor');
    }

    // 2. PANEL SOLAR
    if (d.panel) {
        addAuto('auto-panel', d.panel, d.num_paneles, 'panel');
    }

    // 3. BATERIAS
    const bat = stateCotizador.baterias && stateCotizador.baterias.length > 0 ? stateCotizador.baterias[0] : null;
    if (bat) {
        addAuto('auto-bateria', bat, 1, 'bateria');
    }

    // 4. ESTRUCTURA
    const est = stateCotizador.materiales.find(e => e.modelo.includes('Aluminio') || e.categoria === 'estructura');
    if (est) {
        addAuto('auto-est', est, d.num_paneles, 'estructura');
    }

    // 5. MEDIDOR BIDIRECCIONAL
    const med = stateCotizador.materiales.find(e => e.modelo.includes('Medidor'));
    if (med) {
        addAuto('auto-med', med, 1, 'estructura');
    }

    // 6. ACCESORIOS DE INSTALACION
    const acc = stateCotizador.materiales.find(e => e.modelo.includes('Accesorios')) || stateCotizador.materiales.find(e => e.modelo.includes('Protecciones'));
    if (acc) {
        addAuto('auto-acc', acc, 1, 'estructura');
    }

    // 7. SERVICIO DE INSTALACION
    let mo = stateCotizador.servicios.find(s => s.modelo.includes('Instalación Residencial') || s.modelo.includes('Instalación'));
    if (d.potencia_kwp > 10) mo = stateCotizador.servicios.find(s => s.modelo.includes('Instalación Comercial')) || mo;
    if (d.potencia_kwp > 50) mo = stateCotizador.servicios.find(s => s.modelo.includes('Instalación Industrial')) || mo;
    if (mo) {
        addAuto('auto-mo', mo, 1, 'servicio');
    }

    // 8. DISEÑOS
    const dis = stateCotizador.servicios.find(s => s.modelo.includes('Diseño'));
    if (dis) {
        addAuto('auto-dis', dis, 1, 'servicio');
    }

    // 9. CERTIFICACION RETIE
    const retie = stateCotizador.servicios.find(s => s.modelo.includes('RETIE'));
    if (retie) {
        addAuto('auto-retie', retie, 1, 'servicio');
    }

    // 10. TRAMITES OPERADOR DE RED
    const opRed = stateCotizador.servicios.find(s => s.modelo.includes('Operador Red') || s.modelo.includes('Trámites Operador'));
    if (opRed) {
        addAuto('auto-opred', opRed, 1, 'servicio');
    }

    // 11. TRAMITE INCENTIVOS
    const inc = stateCotizador.servicios.find(s => s.modelo.includes('Incentivos') || s.modelo.includes('1715'));
    if (inc) {
        addAuto('auto-inc', inc, 1, 'servicio');
    }

    // 12. TRANSPORTE
    const trans = stateCotizador.servicios.find(s => s.modelo.includes('Transporte') || s.modelo.includes('Logística'));
    if (trans) {
        addAuto('auto-trans', trans, 1, 'servicio');
    }

    if (!stateCotizador.items) stateCotizador.items = [];
    if (!stateCotizador.removedAutoItems) stateCotizador.removedAutoItems = [];

    let finalItems = [];
    for (let ai of autoItems) {
        if (!stateCotizador.removedAutoItems.includes(ai.id)) {
            finalItems.push(ai);
        }
    }

    for (let mi of stateCotizador.items) {
        if (!mi.isAuto) finalItems.push(mi);
    }

    stateCotizador.items = finalItems;
}

function addExtraItem() {
    const rawVal = document.getElementById('extra-item-id').value;
    const qty = parseFloat(document.getElementById('extra-item-qty').value) || 1;
    if (!rawVal) return;

    const [type, strId] = rawVal.split('-');
    const eqId = parseInt(strId);

    let eq = null;
    if (type === 'pan') eq = stateCotizador.paneles.find(e => e.id === eqId);
    else if (type === 'inv') eq = stateCotizador.inversores.find(e => e.id === eqId);
    else if (type === 'bat') eq = stateCotizador.baterias.find(e => e.id === eqId);
    else if (type === 'mat') eq = stateCotizador.materiales.find(e => e.id === eqId);
    else if (type === 'ser') eq = stateCotizador.servicios.find(e => e.id === eqId);

    if (!eq) return;

    if (!stateCotizador.items) stateCotizador.items = [];

    stateCotizador.items.push({
        id: crypto.randomUUID(),
        equipo_id: eq.id,
        categoria: eq.categoria,
        nombre: `${eq.marca || ''} ${eq.modelo}`.trim(),
        cantidad: qty,
        precio_unitario: eq.costo,
        iva: !!eq.iva,
        subtotal: qty * eq.costo,
        isAuto: false
    });

    renderStep();
}

function updateItemQty(id, val) {
    const item = stateCotizador.items.find(i => i.id === id);
    if (!item) return;
    const qty = parseFloat(val);
    if (isNaN(qty) || qty <= 0) return;
    item.cantidad = qty;
    item.subtotal = qty * item.precio_unitario;
    renderStep();
}

function removeItem(id) {
    if (id.startsWith('auto-')) {
        if (!stateCotizador.removedAutoItems) stateCotizador.removedAutoItems = [];
        stateCotizador.removedAutoItems.push(id);
    }
    stateCotizador.items = stateCotizador.items.filter(i => i.id !== id);
    renderStep();
}

function updateStep2Margen(val) {
    stateCotizador.config.margen = parseFloat(val);
    document.getElementById('dim-margen-val').textContent = val + '%';
    renderStep();
}

async function prepareAndGoToStep3() {
    if (!stateCotizador.items || stateCotizador.items.length === 0) {
        return showToast('No hay ítems en la cotización', 'error');
    }
    await calculateFinances();
    goToStep(3);
}

async function calculateFinances() {
    const d = stateCotizador.dimensionamiento;
    const c = stateCotizador.clienteSelected;
    const conf = stateCotizador.config;

    // Calculate Subtotal (cost of all items)
    const subtotal = stateCotizador.items.reduce((sum, item) => sum + item.subtotal, 0);
    // Margen applied to subtotal
    const margenMultiplier = 1 + (conf.margen / 100);
    const montoMargen = Math.round(subtotal * (conf.margen / 100));
    const subtotalConMargen = subtotal + montoMargen;
    // IVA on items that have IVA
    const iva_items = stateCotizador.items.filter(i => !!i.iva);
    const subtotalIva = iva_items.reduce((s, i) => s + i.subtotal, 0);
    const montoIva = Math.round(subtotalIva * (1 + conf.margen / 100) * 0.19);
    const totalConIva = subtotalConMargen + montoIva;

    // Call API with totalConIva as the investment
    try {
        const payload = {
            produccion_mensual_kwh: d.produccion_mensual_kwh,
            costo_kwh: c.costo_kwh,
            total_inversion: totalConIva,
            deduccion_renta_pct: conf.deduccion,
            degradacion_anual_pct: conf.degradacion,
            inflacion_tarifa_pct: conf.inflacion,
            aom_anual: totalConIva * (conf.aom / 100),
            aom_incremento_pct: conf.aom_inc,
            pct_autoconsumo: conf.auto,
            precio_excedente_kwh: conf.exc
        };
        const res = await API.post('/cotizaciones/calcular-financiero', payload);
        stateCotizador.financiero = {
            subtotal,
            margen: conf.margen,
            montoMargen,
            subtotalConMargen,
            montoIva,
            ivaPct: 19,
            totalConIva,
            total_inversion: totalConIva,
            ...res
        };
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function renderStep3(container) {
        const f = stateCotizador.financiero;
        const c = stateCotizador.config;

        container.innerHTML = `
        <div class="flex flex-col fade-in">
            <!-- Sección superior: Parámetros horizontales + Ley 1715 -->
            <div class="p-6 lg:p-8 bg-surface-container-low border-b border-outline-variant/20">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-6 items-end">
                    <div>
                        <label class="sq-label flex justify-between">
                            Margen Comercial
                            <span class="text-primary">${c.margen}%</span>
                        </label>
                        <input type="range" class="w-full accent-primary" min="0" max="50" step="1" value="${c.margen}" onchange="updateConfig('margen', this.value)">
                    </div>
                    <div>
                        <label class="sq-label flex justify-between">
                            Deducción Ley 1715
                            <span class="text-primary">${c.deduccion}%</span>
                        </label>
                        <input type="range" class="w-full accent-primary" min="0" max="50" step="5" value="${c.deduccion}" onchange="updateConfig('deduccion', this.value)">
                    </div>
                    <div>
                        <label class="sq-label">Inflación Tarifa (%)</label>
                        <input type="number" step="0.1" class="sq-input" value="${c.inflacion}" onchange="updateConfig('inflacion', this.value)">
                    </div>
                    <div>
                        <label class="sq-label">Degradación Anual (%)</label>
                        <input type="number" step="0.01" class="sq-input" value="${c.degradacion}" onchange="updateConfig('degradacion', this.value)">
                    </div>
                    <div>
                        <label class="sq-label">Excedentes ($/kWh)</label>
                        <input type="number" step="1" class="sq-input" value="${c.exc}" onchange="updateConfig('exc', this.value)">
                    </div>
                </div>
                <div class="flex flex-wrap gap-6 mt-4 pt-4 border-t border-outline-variant/20">
                    <label class="flex items-center gap-3 cursor-pointer text-sm text-on-surface-variant hover:text-on-surface transition-colors">
                        <input type="checkbox" ${c.mostrar_precios_pdf !== false ? 'checked' : ''} onchange="updateConfig('mostrar_precios_pdf', this.checked ? true : false)" class="w-5 h-5 accent-primary rounded">
                        <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">visibility</span> Incluir precios individuales en PDF</span>
                    </label>
                    <label class="flex items-center gap-3 cursor-pointer text-sm text-on-surface-variant hover:text-primary transition-colors ${c.incluir_ley1715 ? 'text-primary' : ''}">
                        <input type="checkbox" ${c.incluir_ley1715 ? 'checked' : ''} onchange="updateConfig('incluir_ley1715', this.checked)" class="w-5 h-5 accent-primary rounded">
                        <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">account_balance</span> Incluir cálculo con Ley 1715 (Beneficio Fiscal)</span>
                    </label>
                </div>
            </div>

            <!-- Cuerpo: Resumen + Escenarios -->
            <div class="p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-2 gap-6">

                <!-- Resumen de Precios (izquierda) -->
                <div class="bg-surface-container-high p-6 rounded-xl order-2 lg:order-1">
                    <h3 class="font-headline-md text-on-surface mb-6">Resumen de Precios</h3>
                    <div class="space-y-4">
                        <div class="flex justify-between items-center pb-2 border-b border-outline-variant/10">
                            <span class="text-on-surface-variant">Subtotal Equipos y Servicios</span>
                            <span class="font-label-bold text-on-surface">${formatCurrency(f.subtotal)}</span>
                        </div>
                        <div class="flex justify-between items-center pb-2 border-b border-outline-variant/10">
                            <span class="text-on-surface-variant">+ Margen Comercial (${f.margen}%)</span>
                            <span class="font-label-bold text-primary">+${formatCurrency(f.montoMargen)}</span>
                        </div>
                        <div class="flex justify-between items-center pb-2 border-b border-outline-variant/10 text-sm">
                            <span class="text-on-surface font-medium">Subtotal con Margen</span>
                            <span class="font-label-bold text-on-surface text-base">${formatCurrency(f.subtotalConMargen)}</span>
                        </div>
                        <div class="flex justify-between items-center pb-2 border-b border-outline-variant/10">
                            <span class="text-on-surface-variant">+ IVA (${f.ivaPct}%)</span>
                            <span class="font-label-bold text-primary">+${formatCurrency(f.montoIva)}</span>
                        </div>
                        <div class="flex justify-between items-center pt-4">
                            <span class="font-label-bold text-on-surface text-headline-md">INVERSIÓN TOTAL</span>
                            <span class="font-display-lg text-primary text-3xl">${formatCurrency(f.totalConIva)}</span>
                        </div>
                    </div>
                </div>

                <!-- Escenarios (derecha, apilados) -->
                <div class="flex flex-col gap-4 order-1 lg:order-2">

                    <!-- Escenario 1 -->
                    <div class="bg-surface-container-high p-5 rounded-xl">
                        <div class="flex items-center justify-between mb-1">
                            <h4 class="text-on-surface-variant font-label-bold uppercase tracking-wider text-xs">Proyección Retorno por Ahorro</h4>
                            <span class="text-[11px] font-bold text-on-surface">ROI: ${f.escenario_1.roi_anos} años</span>
                        </div>
                        <div class="h-[150px] w-full relative">
                            <canvas id="proyeccion-chart-s1"></canvas>
                        </div>
                        <div class="grid grid-cols-3 gap-2 pt-2 border-t border-outline-variant/10 mt-1">
                            <div class="text-center">
                                <div class="text-[9px] text-on-surface-variant uppercase">Inversión</div>
                                <div class="font-label-bold text-on-surface text-xs">${formatCurrency(f.total_inversion)}</div>
                            </div>
                            <div class="text-center">
                                <div class="text-[9px] text-on-surface-variant uppercase">Ahorro / Mes</div>
                                <div class="font-label-bold text-success text-xs">+${formatCurrency(f.escenario_1.ahorro_mensual)}</div>
                            </div>
                            <div class="text-center">
                                <div class="text-[9px] text-on-surface-variant uppercase">Ahorro / Año</div>
                                <div class="font-label-bold text-success text-xs">+${formatCurrency(f.escenario_1.ahorro_anual)}</div>
                            </div>
                        </div>
                    </div>

                    ${c.incluir_ley1715 ? `
                    <!-- Escenario 2: Con Ley 1715 (condicional) -->
                    <div class="bg-surface-container-high p-5 rounded-xl relative overflow-hidden border border-primary/30 shadow-[0_0_20px_rgba(255,200,0,0.08)]">
                        <div class="absolute top-0 left-0 w-1 h-full bg-primary"></div>
                        <div class="flex items-center justify-between mb-1">
                            <h4 class="text-primary font-label-bold uppercase tracking-wider text-xs">${f.escenario_2.titulo}</h4>
                            <span class="flex items-center gap-1.5"><span class="text-[11px] font-bold text-primary">ROI: ${f.escenario_2.roi_anos} años</span> <span class="material-symbols-outlined text-primary text-[16px]">verified</span></span>
                        </div>
                        <div class="h-[150px] w-full relative">
                            <canvas id="proyeccion-chart-s2"></canvas>
                        </div>
                        <div class="grid grid-cols-3 gap-2 pt-2 border-t border-primary/10 mt-1">
                            <div class="text-center">
                                <div class="text-[9px] text-on-surface-variant uppercase">Inversión Neta</div>
                                <div class="font-label-bold text-on-surface text-xs">${formatCurrency(f.escenario_2.inversion_neta)}</div>
                            </div>
                            <div class="text-center">
                                <div class="text-[9px] text-on-surface-variant uppercase">Beneficio Fiscal</div>
                                <div class="font-label-bold text-primary text-xs">${formatCurrency(f.escenario_2.beneficio_fiscal)}</div>
                            </div>
                            <div class="text-center">
                                <div class="text-[9px] text-on-surface-variant uppercase">Deducción (${c.deduccion}%)</div>
                                <div class="font-label-bold text-primary text-xs">${formatCurrency(f.total_inversion * c.deduccion / 100)}</div>
                            </div>
                        </div>
                    </div>
                    ` : ``}

                </div>
            </div>

            <!-- Gráfico 25 Años -->
            <div class="px-6 lg:px-8 pb-6 lg:pb-8">
                <div class="bg-surface-container-low p-6 rounded-xl">
                    <h3 class="font-headline-md text-on-surface mb-6">Proyección de Flujo de Caja (25 Años)</h3>
                    <div class="h-[300px] w-full relative">
                        <canvas id="roi-chart"></canvas>
                    </div>
                    <div class="flex gap-6 mt-4 justify-center">
                        <div class="flex items-center gap-2 text-xs text-on-surface-variant">
                            <span class="w-6 h-0.5 bg-on-surface-variant"></span> Sin Incentivos
                        </div>
                        ${c.incluir_ley1715 ? `
                        <div class="flex items-center gap-2 text-xs text-on-surface-variant">
                            <span class="w-6 h-0.5 bg-primary"></span> Con Ley 1715
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div class="p-6 lg:px-8 lg:pb-8 flex justify-between border-t border-outline-variant/30 pt-6">
                <button onclick="goToStep(2)" class="sq-btn sq-btn-ghost"><span class="material-symbols-outlined">arrow_back</span> Atrás</button>
                <button onclick="goToStep(4)" class="sq-btn sq-btn-primary">Generar Propuesta <span class="material-symbols-outlined">arrow_forward</span></button>
            </div>
        </div>
    `;

    setTimeout(() => {
        renderChart();
        renderProyeccionChart('proyeccion-chart-s1', 'ahorro_acumulado_s1');
        if (stateCotizador.config.incluir_ley1715) {
            renderProyeccionChart('proyeccion-chart-s2', 'ahorro_acumulado_s2');
        }
    }, 150);
}

async function updateConfig(key, val) {
    if (typeof val === 'boolean') {
        stateCotizador.config[key] = val;
    } else {
        stateCotizador.config[key] = parseFloat(val);
    }
    if (key !== 'mostrar_precios_pdf') {
        await calculateFinances();
    }
    renderStep();
}

function renderChart() {
    const ctx = document.getElementById('roi-chart');
    if (!ctx) return;

    if (chartInstance) chartInstance.destroy();

    const data = stateCotizador.financiero.proyeccion;
    const labels = data.map(d => `Año ${d.anio}`);
    const s1 = data.map(d => d.saldo_inversion_s1);
    const incluir1715 = stateCotizador.config.incluir_ley1715;

    Chart.defaults.color = '#9b9078';
    Chart.defaults.font.family = 'Inter';

    const datasets = [
        {
            label: 'Saldo Sin Incentivos',
            data: s1,
            borderColor: '#9b9078',
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 0
        }
    ];

    if (incluir1715) {
        const s2 = data.map(d => d.saldo_inversion_s2);
        datasets.push({
            label: 'Saldo Con Ley 1715',
            data: s2,
            borderColor: '#ffc800',
            backgroundColor: 'rgba(255, 200, 0, 0.1)',
            borderWidth: 3,
            tension: 0.3,
            fill: true,
            pointRadius: 2,
            pointBackgroundColor: '#ffc800'
        });
    }

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1f2020',
                    titleColor: '#e4e2e1',
                    bodyColor: '#e4e2e1',
                    borderColor: '#4f4632',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + formatCurrency(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(79, 70, 50, 0.2)' },
                    ticks: {
                        callback: function(value) {
                            return '$' + (value / 1000000).toFixed(1) + 'M';
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { maxTicksLimit: 12 }
                }
            }
        }
    });
}

function renderProyeccionChart(canvasId, acumuladoField) {
    // Destroy existing chart instance for this canvas
    if (proyeccionCharts[canvasId]) {
        proyeccionCharts[canvasId].destroy();
    }

    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const data = stateCotizador.financiero.proyeccion;
    if (!data || data.length === 0) return;

    const labels = data.map(d => d.anio);
    const valorEnergia = data.map(d => d.valor_energia);
    const aom = data.map(d => -d.aom);
    const acumulado = data.map(d => d[acumuladoField] || 0);

    proyeccionCharts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Valor Energía',
                    data: valorEnergia,
                    backgroundColor: 'rgba(76, 175, 80, 0.5)',
                    borderColor: '#4caf50',
                    borderWidth: 1,
                    borderRadius: 2,
                    order: 2
                },
                {
                    label: 'Costo AOM',
                    data: aom,
                    backgroundColor: 'rgba(244, 67, 54, 0.4)',
                    borderColor: '#f44336',
                    borderWidth: 1,
                    borderRadius: 2,
                    order: 2
                },
                {
                    label: 'Ahorro Acumulado',
                    data: acumulado,
                    type: 'line',
                    borderColor: '#ffc800',
                    backgroundColor: 'rgba(255, 200, 0, 0.08)',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.3,
                    fill: true,
                    yAxisID: 'y1',
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1f2020',
                    titleColor: '#e4e2e1',
                    bodyColor: '#e4e2e1',
                    borderColor: '#4f4632',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            const val = context.parsed.y;
                            const label = context.dataset.label;
                            if (label === 'Costo AOM') {
                                return label + ': -' + formatCurrency(Math.abs(val));
                            }
                            return label + ': ' + formatCurrency(val);
                        }
                    }
                }
            },
            scales: {
                y: {
                    position: 'left',
                    grid: { color: 'rgba(79, 70, 50, 0.15)', drawBorder: false },
                    border: { display: false },
                    ticks: {
                        maxTicksLimit: 5,
                        callback: function(value) {
                            if (Math.abs(value) >= 1000000) {
                                return '$' + (value / 1000000).toFixed(1) + 'M';
                            }
                            return '$' + (value / 1000).toFixed(0) + 'K';
                        },
                        font: { size: 9 }
                    }
                },
                y1: {
                    position: 'right',
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        maxTicksLimit: 4,
                        callback: function(value) {
                            if (Math.abs(value) >= 1000000) {
                                return '$' + (value / 1000000).toFixed(1) + 'M';
                            }
                            return '$' + (value / 1000).toFixed(0) + 'K';
                        },
                        font: { size: 9 }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { maxTicksLimit: 8, font: { size: 8 } }
                }
            }
        }
    });
}

// ══════════════ STEP 4: RESUMEN Y GUARDAR ══════════════
function addDays(d, n) {
    const r = new Date(d);
    r.setHours(12, 0, 0, 0);
    r.setDate(r.getDate() + n);
    return r.toISOString().split('T')[0];
}

function renderStep4(container) {
    const c = stateCotizador.clienteSelected;
    const d = stateCotizador.dimensionamiento;
    const f = stateCotizador.financiero;

    // Convert old format (semana) to new format (fecha_inicio/fecha_fin)
    if (stateCotizador.cronograma.length > 0 && stateCotizador.cronograma[0].semana !== undefined) {
        const today = new Date();
        stateCotizador.cronograma = stateCotizador.cronograma.map(r => {
            const start = new Date(today);
            start.setDate(start.getDate() + (r.semana - 1) * 7);
            const end = new Date(start);
            end.setDate(end.getDate() + 3);
            return { fecha_inicio: start.toISOString().split('T')[0], fecha_fin: end.toISOString().split('T')[0], actividad: r.actividad, completado: r.completado || false };
        });
    }

    // Generate default cronograma if empty
    if (!stateCotizador.cronograma || stateCotizador.cronograma.length === 0) {
        const hoy = new Date();
        stateCotizador.cronograma = [
            {fecha_inicio: addDays(hoy,0), fecha_fin: addDays(hoy,2), actividad:'Firma de contrato y anticipo', completado:false},
            {fecha_inicio: addDays(hoy,0), fecha_fin: addDays(hoy,5), actividad:'Compra de equipos y materiales', completado:false},
            {fecha_inicio: addDays(hoy,3), fecha_fin: addDays(hoy,7), actividad:'Diseño eléctrico y memorias de cálculo', completado:false},
            {fecha_inicio: addDays(hoy,3), fecha_fin: addDays(hoy,7), actividad:'Trámites ante operador de red', completado:false},
            {fecha_inicio: addDays(hoy,8), fecha_fin: addDays(hoy,14), actividad:'Instalación de estructura y paneles', completado:false},
            {fecha_inicio: addDays(hoy,8), fecha_fin: addDays(hoy,14), actividad:'Instalación eléctrica e inversor', completado:false},
            {fecha_inicio: addDays(hoy,15), fecha_fin: addDays(hoy,21), actividad:'Pruebas, puesta en marcha y certificación', completado:false},
            {fecha_inicio: addDays(hoy,15), fecha_fin: addDays(hoy,21), actividad:'Entrega y capacitación', completado:false}
        ];
    }

    container.innerHTML = `
        <div class="p-8 fade-in flex flex-col gap-8">
            <div class="flex flex-col md:flex-row gap-8">
                <div class="flex-1">
                    <div class="bg-surface-container-high p-6 rounded-xl border border-primary/20 relative overflow-hidden mb-6">
                        <div class="absolute -right-12 -top-12 opacity-10">
                            <span class="material-symbols-outlined text-[150px] text-primary">verified</span>
                        </div>
                        <h2 class="font-headline-md text-primary mb-1">¡Propuesta Lista!</h2>
                        <p class="text-on-surface-variant font-body-md mb-6">Revisa los datos y genera el documento final.</p>

                        <div class="grid grid-cols-2 gap-y-4 gap-x-2 text-sm">
                            <div class="text-on-surface-variant">Cliente:</div>
                            <div class="font-label-bold">${c.nombre}</div>
                            <div class="text-on-surface-variant">Sistema:</div>
                            <div class="font-label-bold">${d.potencia_kwp} kWp</div>
                            <div class="text-on-surface-variant">Inversión:</div>
                            <div class="font-label-bold text-primary">${formatCurrency(f.total_inversion)}</div>
                            <div class="text-on-surface-variant">Retorno (Ley 1715):</div>
                            <div class="font-label-bold">${f.escenario_2.roi_anos} Años</div>
                            <div class="text-on-surface-variant">Ahorro 25 Años:</div>
                            <div class="font-label-bold text-success">+${formatCurrency(f.resumen_25_anos.ahorro_neto_25)}</div>
                        </div>
                    </div>

                    <div class="mb-4">
                        <label class="sq-label">Notas Adicionales (Internas)</label>
                        <textarea id="cot-notas" class="sq-input" rows="3"></textarea>
                    </div>
                </div>

                <div class="w-full md:w-64 flex flex-col gap-4 justify-center">
                    <button onclick="guardarCotizacion('borrador')" class="sq-btn sq-btn-secondary sq-btn-lg justify-start">
                        <span class="material-symbols-outlined">save</span> Guardar Borrador
                    </button>
                    <button onclick="guardarCotizacion('enviada', true)" class="sq-btn sq-btn-secondary sq-btn-lg justify-start">
                        <span class="material-symbols-outlined">visibility</span> Guardar y Vista Previa
                    </button>
                    <button onclick="guardarYDescargarPDF()" class="sq-btn sq-btn-primary sq-btn-lg justify-start shadow-xl shadow-primary/20">
                        <span class="material-symbols-outlined">download</span> Guardar y Descargar PDF
                    </button>
                </div>
            </div>

            <!-- Cronograma editable -->
            <div class="bg-surface-container-low p-6 rounded-xl">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="font-headline-md text-on-surface">Cronograma de Ejecución y Pagos</h3>
                    <button onclick="addCronogramaRow()" class="sq-btn sq-btn-secondary sq-btn-sm">
                        <span class="material-symbols-outlined text-[16px]">add</span> Agregar Fila
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead class="text-xs uppercase text-on-surface-variant bg-surface-container border-b border-outline-variant/20">
                            <tr>
                                <th class="px-2 py-3 w-8"></th>
                                <th class="px-4 py-3 w-28">Inicio</th>
                                <th class="px-4 py-3 w-28">Fin</th>
                                <th class="px-4 py-3">Actividad</th>
                                <th class="px-4 py-3 w-12"></th>
                            </tr>
                        </thead>
                        <tbody id="crono-rows" class="crono-drag-container">
                            ${stateCotizador.cronograma.map((r, i) => cronoRowHtml(r, i)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        <div class="px-8 pb-8 flex border-t border-outline-variant/30 pt-6 mt-4">
            <button onclick="goToStep(3)" class="sq-btn sq-btn-ghost">Atrás</button>
        </div>
    `;

    setupCronoDragDrop();
}

function cronoRowHtml(row, idx) {
    return `
        <tr draggable="true" data-index="${idx}" class="border-b border-outline-variant/10 hover:bg-surface-container/50 transition-colors crono-drag-row">
            <td class="px-2 py-2 text-center cursor-grab text-on-surface-variant crono-drag-handle">
                <span class="material-symbols-outlined text-[18px]">drag_indicator</span>
            </td>
            <td class="px-4 py-2">
                <input type="date" class="sq-input w-full text-sm" value="${row.fecha_inicio || ''}" onchange="updateCrono(${idx},'fecha_inicio',this.value)">
            </td>
            <td class="px-4 py-2">
                <input type="date" class="sq-input w-full text-sm" value="${row.fecha_fin || ''}" onchange="updateCrono(${idx},'fecha_fin',this.value)">
            </td>
            <td class="px-4 py-2">
                <input type="text" class="sq-input w-full text-sm" value="${row.actividad.replace(/"/g,'&quot;')}" onchange="updateCrono(${idx},'actividad',this.value)">
            </td>
            <td class="px-4 py-2 text-center">
                <button onclick="removeCronoRow(${idx})" class="text-on-surface-variant hover:text-error transition-colors p-1">
                    <span class="material-symbols-outlined text-[18px]">close</span>
                </button>
            </td>
        </tr>
    `;
}

function updateCrono(idx, field, val) {
    stateCotizador.cronograma[idx][field] = val;
}

function removeCronoRow(idx) {
    stateCotizador.cronograma.splice(idx, 1);
    renderStep();
}

function setupCronoDragDrop() {
    const tbody = document.getElementById('crono-rows');
    if (!tbody) return;

    // Remove old listeners by cloning (to avoid duplicates on re-render)
    const newTbody = tbody.cloneNode(true);
    tbody.parentNode.replaceChild(newTbody, tbody);

    newTbody.addEventListener('dragstart', e => {
        const tr = e.target.closest('.crono-drag-row');
        if (!tr) return;
        tr.classList.add('opacity-40');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', tr.dataset.index);
    });

    newTbody.addEventListener('dragend', e => {
        const tr = e.target.closest('.crono-drag-row');
        if (tr) tr.classList.remove('opacity-40');
        newTbody.querySelectorAll('.crono-drag-row').forEach(r => r.classList.remove('border-t-2', 'border-primary'));
    });

    newTbody.addEventListener('dragover', e => {
        e.preventDefault();
        const tr = e.target.closest('.crono-drag-row');
        if (!tr) return;
        newTbody.querySelectorAll('.crono-drag-row').forEach(r => r.classList.remove('border-t-2', 'border-primary'));
        const rect = tr.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) {
            tr.classList.add('border-t-2', 'border-primary');
        } else {
            // Add a visual indicator on the bottom by targeting the next sibling
            const next = tr.nextElementSibling;
            if (next && next.classList.contains('crono-drag-row')) {
                next.classList.add('border-t-2', 'border-primary');
            }
        }
    });

    newTbody.addEventListener('drop', e => {
        e.preventDefault();
        newTbody.querySelectorAll('.crono-drag-row').forEach(r => r.classList.remove('border-t-2', 'border-primary'));
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
        const tr = e.target.closest('.crono-drag-row');
        if (!tr || isNaN(fromIdx)) return;
        let toIdx = parseInt(tr.dataset.index);
        if (fromIdx === toIdx) return;

        const rect = tr.getBoundingClientRect();
        const insertAfter = e.clientY > rect.top + rect.height / 2;
        let insertAt;
        if (fromIdx < toIdx) {
            insertAt = insertAfter ? toIdx : toIdx - 1;
        } else {
            insertAt = insertAfter ? toIdx + 1 : toIdx;
        }

        const item = stateCotizador.cronograma.splice(fromIdx, 1)[0];
        stateCotizador.cronograma.splice(insertAt, 0, item);
        renderStep();
    });
}

function addCronogramaRow() {
    const last = stateCotizador.cronograma[stateCotizador.cronograma.length - 1];
    const lastEnd = last ? last.fecha_fin : new Date().toISOString().split('T')[0];
    stateCotizador.cronograma.push({fecha_inicio: lastEnd, fecha_fin: lastEnd, actividad: '', completado: false});
    renderStep();
}

async function guardarCotizacion(estado, openPdf = false) {
    const c = stateCotizador.clienteSelected;
    const d = stateCotizador.dimensionamiento;
    const f = stateCotizador.financiero;
    const notas = document.getElementById('cot-notas').value;

    const payload = {
        cliente_id: c.id,
        estado: estado,
        panel_id: d.panel.id,
        inversor_id: d.inversor_sugerido ? d.inversor_sugerido.id : null,
        bateria_id: (stateCotizador.items.find(i => i.categoria === 'bateria') || {}).equipo_id || null,
        num_baterias: (stateCotizador.items.find(i => i.categoria === 'bateria') || {}).cantidad || 0,
        potencia_kwp: d.potencia_kwp,
        num_paneles: d.num_paneles,
        produccion_diaria_kwh: d.produccion_diaria_kwh,
        produccion_mensual_kwh: d.produccion_mensual_kwh,
        area_requerida_m2: d.area_requerida_m2,
        peso_total_kg: d.peso_total_kg,
        items_json: JSON.stringify({
            mostrar_precios: stateCotizador.config.mostrar_precios_pdf !== false,
            incluir_ley1715: stateCotizador.config.incluir_ley1715,
            base_consumo: stateCotizador.baseConsumo || 'promedio',
            items: stateCotizador.items
        }),
        subtotal: f.subtotal,
        margen_comercial_pct: f.margen,
        total_inversion: f.total_inversion,
        ahorro_mensual: f.escenario_1.ahorro_mensual,
        ahorro_anual: f.escenario_1.ahorro_anual,
        roi_sin_incentivos_meses: f.escenario_1.roi_meses,
        roi_con_incentivos_meses: f.escenario_2.roi_meses,
        deduccion_renta_pct: stateCotizador.config.deduccion,
        degradacion_anual_pct: stateCotizador.config.degradacion,
        inflacion_tarifa_pct: stateCotizador.config.inflacion,
        aom_anual: f.proyeccion && f.proyeccion[0] ? f.proyeccion[0].aom : 0,
        aom_incremento_pct: stateCotizador.config.aom_inc,
        pct_autoconsumo: stateCotizador.config.auto,
        precio_excedente_kwh: stateCotizador.config.exc,
        proyeccion_25_json: JSON.stringify(f.proyeccion),
        cronograma_json: JSON.stringify(stateCotizador.cronograma || []),
        notas: notas
    };

    try {
        let res;
        const editId = App.editingCotizacionId;
        if (editId) {
            res = await API.put(`/cotizaciones/${editId}`, { ...payload, estado });
            showToast('Propuesta actualizada', 'success');
            App.editingCotizacionId = null;
        } else {
            res = await API.post('/cotizaciones', payload);
            showToast(res.message, 'success');
        }

        // Reset state
        stateCotizador = { step: 1, clientes: [], clienteSelected: null, baseConsumo: 'promedio', paneles: stateCotizador.paneles, inversores: stateCotizador.inversores, baterias: stateCotizador.baterias, materiales: stateCotizador.materiales, servicios: stateCotizador.servicios, dimensionamiento: null, financiero: null, items: [], removedAutoItems: [], cronograma: [], config: stateCotizador.config };

        const targetId = editId || res.id;
        App.guardandoPdfId = targetId;
        if (openPdf) {
            window.open(`/pdf/${targetId}`, '_blank');
        }
        navigateTo('propuestas');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function guardarYDescargarPDF() {
    App.guardandoPdfId = null;
    await guardarCotizacion('enviada');
    const id = App.guardandoPdfId;
    if (!id) return;
    App.guardandoPdfId = null;
    setTimeout(async () => {
        try {
            const res = await fetch(`/api/cotizaciones/${id}/pdf-download`);
            if (!res.ok) throw new Error('Error al generar PDF');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `propuesta_${id}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('PDF descargado exitosamente', 'success');
        } catch (e) {
            showToast('Error generando PDF: ' + e.message, 'error');
        }
    }, 1000);
}