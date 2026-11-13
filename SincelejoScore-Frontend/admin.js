/**
 * ============================================================================
 * SINCELEJOSCORE - PANEL DE ADMINISTRACIÓN INTEGRAL (admin.js)
 * Conexión completa con la API .NET (ApiSincelejoScore) en https://apisincelejoscore-production.up.railway.app/api
 * ============================================================================
 */

// ============================================================================
// GUARDIÁN DE ACCESO INMEDIATO (AUTENTICACIÓN Y SESIÓN)
// ============================================================================
(function() {
    const sesionStr = localStorage.getItem('usuario_sesion');
    if (!sesionStr) {
        window.location.replace('login.html');
        return;
    }
    try {
        const sesionObj = JSON.parse(sesionStr);
        if (!sesionObj || (!sesionObj.username && !sesionObj.Username && !sesionObj.id && !sesionObj.Id)) {
            localStorage.removeItem('usuario_sesion');
            window.location.replace('login.html');
            return;
        }
    } catch (_) {
        localStorage.removeItem('usuario_sesion');
        window.location.replace('login.html');
        return;
    }
})();

function cerrarSesion() {
    localStorage.removeItem('usuario_sesion');
    window.location.replace('login.html');
}
window.cerrarSesion = cerrarSesion;

function obtenerUsuarioSesion() {
    try {
        const str = localStorage.getItem('usuario_sesion');
        return str ? JSON.parse(str) : null;
    } catch (_) {
        return null;
    }
}

function aplicarInfoSesionYRoles() {
    const sesion = obtenerUsuarioSesion();
    if (!sesion) return;

    const nombre = sesion.nombreCompleto || sesion.NombreCompleto || sesion.username || sesion.Username || 'Usuario';
    const rol = (sesion.rol || sesion.Rol || 'ADMIN').toUpperCase();
    const torneoIdAsignado = sesion.torneoId ?? sesion.TorneoId ?? null;

    // Pintar nombre y rol en el header
    const nombreEl = document.getElementById('nombre-usuario-sesion');
    if (nombreEl) nombreEl.textContent = nombre;

    const rolEl = document.getElementById('rol-usuario-sesion');
    if (rolEl) {
        rolEl.textContent = rol;
        rolEl.className = `rol-usuario-sesion rol-${rol.toLowerCase()}`;
    }

    // Enlazar evento al botón de cierre de sesión
    document.getElementById('btn-logout')?.addEventListener('click', cerrarSesion);

    // Adaptación según el Rol
    const tabUsuariosBtn = document.getElementById('nav-tab-usuarios') || document.querySelector('[data-tab="tab-usuarios"]');
    if (rol === 'SUPERADMIN') {
        // Flujo normal: todas las pestañas visibles y selectores habilitados
        if (tabUsuariosBtn) tabUsuariosBtn.style.display = 'inline-flex';
    } else {
        if (tabUsuariosBtn) tabUsuariosBtn.style.display = 'none';
        if (rol === 'PLANILLERO') {
            aplicarRestriccionesPlanillero(torneoIdAsignado);
        }
    }
}

function aplicarRestriccionesPlanillero(torneoIdAsignado) {
    // 1. Ocultar de la barra de pestañas los módulos ajenos al planillero
    const tabsAOcultar = ['tab-torneos', 'tab-equipos', 'tab-deportes', 'tab-usuarios'];
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        const tab = btn.getAttribute('data-tab');
        if (tabsAOcultar.includes(tab)) {
            btn.style.display = 'none';
        }
    });

    // 2. Ocultar botones de administración ajenos
    const btnExcel = document.getElementById('btn-abrir-modal-excel');
    if (btnExcel) btnExcel.style.display = 'none';

    // 3. Activar automáticamente la pestaña de Mesa Técnica
    cambiarPestana('tab-mesa');

    // 4. Bloquear y seleccionar torneo asignado
    if (torneoIdAsignado) {
        const selectsTorneo = [
            document.getElementById('select-torneo-mesa'),
            document.getElementById('fixture-torneo-select'),
            document.getElementById('filtro-equipo-torneo')
        ];

        selectsTorneo.forEach(sel => {
            if (sel) {
                sel.value = torneoIdAsignado;
                sel.disabled = true;
                sel.title = 'Torneo asignado exclusivamente a este usuario.';
            }
        });

        if (typeof cargarPartidosFixture === 'function') {
            cargarPartidosFixture(torneoIdAsignado);
        }
    }
}

// Detección automática de entorno (Local vs Producción)
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5291/api'
    : 'https://apisincelejoscore-production.up.railway.app/api';

// Estado global de la aplicación administrativa
const state = {
    deportes: [],
    canchas: [],
    torneos: [],
    equipos: [],
    equiposMap: {}, // Diccionario id -> nombre
    partidos: [],
    partidoActivoMesa: null,
    marcadorLocalTemp: 0,
    marcadorVisitTemp: 0,
    jugadoresMesaMap: {} // mapa de jugadores por id para la mesa técnica
};

// Temporizador de polling en vivo (10 segundos)
let pollingMesaInterval = null;

// ============================================================================
// GESTOR GLOBAL DE CRONÓMETROS Y SINCRONIZACIÓN MULTIDEPORTE (admin.js)
// ============================================================================
const gestorPartidosEnJuego = new Map(); // id (string) -> objeto partido
let gestorSyncInterval = null; // Ticker central de 10 segundos para TODOS los partidos en juego
let cronometroMesaActivaInterval = null; // Ticker de 1 segundo para la mesa táctil activa

// Variables de compatibilidad individual
let cronometroBaloncestoInterval = null;
let segundosBaloncestoNeto = 0;
let basketUltimoTickTimestamp = null;
let partidoBaloncestoBg = null;
let ultimoSyncBaloncestoTimestamp = 0;

let cronometroFutbolInterval = null;
let segundosFutbolNeto = 0;
let partidoFutbolBg = null;
let ultimoSyncFutbolTimestamp = 0;

let cronometroMicrofutbolInterval = null;
let segundosMicrofutbolNeto = 0;
let ultimoSyncMicrofutbolTimestamp = 0;

function obtenerEstadoTimerFutbol(partidoId) {
    if (!partidoId) return null;
    try {
        const item = localStorage.getItem(`futbol_cronometro_${partidoId}`) || localStorage.getItem(`futbol_timer_${partidoId}`);
        if (!item) return null;
        const parsed = JSON.parse(item);
        if (typeof parsed !== 'object' || parsed === null) return null;
        if (parsed.segundosNetos === undefined && parsed.accumulatedSeconds !== undefined) {
            parsed.segundosNetos = parsed.accumulatedSeconds;
        }
        if (parsed.accumulatedSeconds === undefined && parsed.segundosNetos !== undefined) {
            parsed.accumulatedSeconds = parsed.segundosNetos;
        }
        if (parsed.minutoActual === undefined && parsed.minuto_actual !== undefined) {
            parsed.minutoActual = parsed.minuto_actual;
        }
        return parsed;
    } catch (e) {
        return null;
    }
}

function guardarEstadoTimerFutbol(partidoId, data) {
    if (!partidoId || !data) return;
    try {
        const segs = data.segundosNetos !== undefined ? data.segundosNetos : (data.accumulatedSeconds || 0);
        const minAct = data.minutoActual !== undefined ? data.minutoActual : (data.minuto_actual !== undefined ? data.minuto_actual : 0);
        const payload = {
            running: !!data.running,
            startTimestamp: data.startTimestamp || Date.now(),
            segundosNetos: segs,
            minutoActual: minAct,
            minuto_actual: minAct,
            periodo: data.periodo || ''
        };
        payload.accumulatedSeconds = segs;
        const json = JSON.stringify(payload);
        localStorage.setItem(`futbol_cronometro_${partidoId}`, json);
        localStorage.setItem(`futbol_timer_${partidoId}`, json);
    } catch (e) {}
}

function limpiarEstadoTimerFutbol(partidoId) {
    if (!partidoId) return;
    try {
        localStorage.removeItem(`futbol_cronometro_${partidoId}`);
        localStorage.removeItem(`futbol_timer_${partidoId}`);
    } catch (e) {}
}

function obtenerEstadoTimerBaloncesto(partidoId) {
    if (!partidoId) return null;
    try {
        const item = localStorage.getItem(`baloncesto_cronometro_${partidoId}`) || localStorage.getItem(`baloncesto_timer_${partidoId}`);
        if (!item) return null;
        const parsed = JSON.parse(item);
        if (typeof parsed !== 'object' || parsed === null) return null;
        if (parsed.segundosNetos === undefined && parsed.accumulatedSeconds !== undefined) {
            parsed.segundosNetos = parsed.accumulatedSeconds;
        }
        if (parsed.accumulatedSeconds === undefined && parsed.segundosNetos !== undefined) {
            parsed.accumulatedSeconds = parsed.segundosNetos;
        }
        if (parsed.minutoActual === undefined && parsed.minuto_actual !== undefined) {
            parsed.minutoActual = parsed.minuto_actual;
        }
        return parsed;
    } catch (e) {
        return null;
    }
}

function guardarEstadoTimerBaloncesto(partidoId, data) {
    if (!partidoId || !data) return;
    try {
        const segs = data.segundosNetos !== undefined ? data.segundosNetos : (data.accumulatedSeconds || 0);
        const minAct = data.minutoActual !== undefined ? data.minutoActual : (data.minuto_actual || 1);
        const payload = {
            running: !!data.running,
            startTimestamp: data.startTimestamp || Date.now(),
            segundosNetos: segs,
            minutoActual: minAct,
            minuto_actual: minAct,
            periodo: data.periodo || ''
        };
        payload.accumulatedSeconds = segs;
        const json = JSON.stringify(payload);
        localStorage.setItem(`baloncesto_cronometro_${partidoId}`, json);
        localStorage.setItem(`baloncesto_timer_${partidoId}`, json);
    } catch (e) {}
}

function limpiarEstadoTimerBaloncesto(partidoId) {
    if (!partidoId) return;
    try {
        localStorage.removeItem(`baloncesto_cronometro_${partidoId}`);
        localStorage.removeItem(`baloncesto_timer_${partidoId}`);
    } catch (e) {}
}

function obtenerEstadoTimerMicrofutbol(partidoId) {
    if (!partidoId) return null;
    try {
        const item = localStorage.getItem(`microfutbol_cronometro_${partidoId}`) || localStorage.getItem(`microfutbol_timer_${partidoId}`);
        if (!item) return null;
        const parsed = JSON.parse(item);
        if (typeof parsed !== 'object' || parsed === null) return null;
        if (parsed.segundosNetos === undefined && parsed.accumulatedSeconds !== undefined) {
            parsed.segundosNetos = parsed.accumulatedSeconds;
        }
        if (parsed.accumulatedSeconds === undefined && parsed.segundosNetos !== undefined) {
            parsed.accumulatedSeconds = parsed.segundosNetos;
        }
        if (parsed.minutoActual === undefined && parsed.minuto_actual !== undefined) {
            parsed.minutoActual = parsed.minuto_actual;
        }
        return parsed;
    } catch (e) {
        return null;
    }
}

function guardarEstadoTimerMicrofutbol(partidoId, data) {
    if (!partidoId || !data) return;
    try {
        const segs = data.segundosNetos !== undefined ? data.segundosNetos : (data.accumulatedSeconds || 0);
        const minAct = data.minutoActual !== undefined ? data.minutoActual : (data.minuto_actual !== undefined ? data.minuto_actual : 0);
        const payload = {
            running: !!data.running,
            startTimestamp: data.startTimestamp || Date.now(),
            segundosNetos: segs,
            minutoActual: minAct,
            minuto_actual: minAct,
            periodo: data.periodo || ''
        };
        payload.accumulatedSeconds = segs;
        const json = JSON.stringify(payload);
        localStorage.setItem(`microfutbol_cronometro_${partidoId}`, json);
        localStorage.setItem(`microfutbol_timer_${partidoId}`, json);
    } catch (e) {}
}

function limpiarEstadoTimerMicrofutbol(partidoId) {
    if (!partidoId) return;
    try {
        localStorage.removeItem(`microfutbol_cronometro_${partidoId}`);
        localStorage.removeItem(`microfutbol_timer_${partidoId}`);
    } catch (e) {}
}

// Compatibilidad de selector para el campo de minuto de incidencia
if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
    const _origGetElementById = document.getElementById.bind(document);
    document.getElementById = function(id) {
        if (id === 'incidencia_minuto') {
            return _origGetElementById('incidencia_minuto') || _origGetElementById('evento-minuto');
        }
        return _origGetElementById(id);
    };
}

// ============================================================================
// INICIALIZACIÓN
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Inicializar visualización de sesión y roles
    aplicarInfoSesionYRoles();

    configurarNavegacionTabs();
    configurarModales();
    configurarEventosMesa();

    // Inicializar gestor centralizado de cronómetros en segundo plano
    iniciarGestorGlobalCronometros();

    // Carga inicial secuencial
    await cargarDeportes();
    await cargarCanchas();
    await cargarTorneos();
    await cargarEquiposGlobal();
    await cargarEquipos();
    await cargarDeportesAdmin();
});

// ============================================================================
// SISTEMA DE NOTIFICACIONES TOAST
// ============================================================================
function mostrarToast(mensaje, tipo = 'exito') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-msg toast-${tipo}`;
    
    let icono = '✅';
    if (tipo === 'error') icono = '❌';
    if (tipo === 'info') icono = 'ℹ️';

    toast.innerHTML = `<span>${icono}</span> <span>${mensaje}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOutToast 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ============================================================================
// MODAL DE CONFIRMACIÓN OSCURO PERSONALIZADO (SINCELEJOSCORE)
// ============================================================================
function mostrarConfirmacionModal(mensaje, titulo = '⚠️ Confirmación', textoAceptar = 'Aceptar', textoCancelar = 'Cancelar') {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-confirmacion-admin');
        const msgEl = document.getElementById('modal-confirm-message');
        const titleEl = document.getElementById('modal-confirm-title');
        const btnAccept = document.getElementById('btn-confirm-accept');
        const btnCancel = document.getElementById('btn-confirm-cancel');
        const btnClose = document.getElementById('btn-cerrar-confirm-modal');

        if (!modal || !msgEl || !btnAccept) {
            resolve(window.confirm(mensaje));
            return;
        }

        if (titleEl) titleEl.innerHTML = titulo;
        msgEl.textContent = mensaje;
        if (btnAccept) btnAccept.textContent = textoAceptar || 'Aceptar';

        if (btnCancel) {
            if (textoCancelar) {
                btnCancel.style.display = 'inline-block';
                btnCancel.textContent = textoCancelar;
            } else {
                btnCancel.style.display = 'none';
            }
        }

        const cleanup = () => {
            modal.classList.add('hidden');
            btnAccept.removeEventListener('click', onAccept);
            if (btnCancel) btnCancel.removeEventListener('click', onCancel);
            if (btnClose) btnClose.removeEventListener('click', onCancel);
        };

        const onAccept = () => {
            cleanup();
            resolve(true);
        };

        const onCancel = () => {
            cleanup();
            resolve(false);
        };

        btnAccept.addEventListener('click', onAccept);
        if (btnCancel) btnCancel.addEventListener('click', onCancel);
        if (btnClose) btnClose.addEventListener('click', onCancel);

        modal.classList.remove('hidden');
    });
}

// ============================================================================
// NAVEGACIÓN ENTRE PESTAÑAS
// ============================================================================
function configurarNavegacionTabs() {
    const tabButtons = document.querySelectorAll('.admin-tab-btn');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-tab');
            cambiarPestana(targetId);
        });
    });
}

function cambiarPestana(targetTabId) {
    const tabButtons = document.querySelectorAll('.admin-tab-btn');
    const tabPanes = document.querySelectorAll('.admin-tab-pane');

    tabButtons.forEach(btn => {
        if (btn.getAttribute('data-tab') === targetTabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    tabPanes.forEach(pane => {
        if (pane.id === targetTabId) {
            pane.classList.remove('hidden');
        } else {
            pane.classList.add('hidden');
        }
    });

    // Control del temporizador de polling de la Mesa Técnica
    if (targetTabId === 'tab-mesa') {
        cargarTarjetasMesaEnVivo();
        iniciarPollingMesa();
    } else {
        detenerPollingMesa();
    }

    // Refrescos contextuales al entrar a otras pestañas
    if (targetTabId === 'tab-torneos') {
        cargarTorneos();
    } else if (targetTabId === 'tab-equipos') {
        cargarEquipos();
    } else if (targetTabId === 'tab-fixture') {
        const torSelect = document.getElementById('fixture-torneo-select');
        if (torSelect && torSelect.value) {
            cargarPartidosFixture(torSelect.value);
        }
    } else if (targetTabId === 'tab-deportes') {
        cargarDeportesAdmin();
    } else if (targetTabId === 'tab-usuarios') {
        cargarUsuariosAdmin();
    }
}

// ============================================================================
// POLLING AUTOMÁTICO EN VIVO (CADA 10 SEGUNDOS)
// ============================================================================
function iniciarPollingMesa() {
    detenerPollingMesa();
    pollingMesaInterval = setInterval(async () => {
        const paneMesa = document.getElementById('tab-mesa');
        if (!paneMesa || paneMesa.classList.contains('hidden')) {
            return;
        }

        // Si hay una mesa técnica táctil abierta, sincronizar ese partido
        if (state.partidoActivoMesa) {
            await sincronizarPartidoMesaEnVivo(state.partidoActivoMesa.id || state.partidoActivoMesa.Id);
        } else {
            // Si está en el listado de tarjetas, refrescar las tarjetas sin recargar toda la página
            await cargarTarjetasMesaEnVivo(false);
        }
    }, 10000); // 10 segundos exactos
}

function detenerPollingMesa() {
    if (pollingMesaInterval) {
        clearInterval(pollingMesaInterval);
        pollingMesaInterval = null;
    }
}

// ============================================================================
// MODALES GLOBALES
// ============================================================================
function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('hidden');
}

function cerrarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
}

function configurarModales() {
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.add('hidden');
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        }
    });
}

// ============================================================================
// CARGA Y CACHÉ DE EQUIPOS GLOBAL
// ============================================================================
async function cargarEquiposGlobal() {
    try {
        const res = await fetch(`${API_URL}/equipos`);
        if (!res.ok) return;
        const equipos = await res.json();
        state.equipos = Array.isArray(equipos) ? equipos : [];
        equipos.forEach(eq => {
            const id = eq.id || eq.Id;
            const nombre = eq.nombre || eq.Nombre;
            if (id && nombre) {
                state.equiposMap[id] = nombre;
            }
        });
    } catch (err) {
        console.error('Error cargando catálogo global de equipos:', err);
    }
}

function obtenerNombreEquipo(equipoId) {
    if (!equipoId) return 'Equipo';
    return state.equiposMap[equipoId] || `Equipo #${equipoId}`;
}

// ============================================================================
// PESTAÑA 1: TORNEOS Y SEDES
// ============================================================================

async function cargarDeportes() {
    try {
        const res = await fetch(`${API_URL}/deportes`);
        if (!res.ok) throw new Error('Error al obtener deportes');
        state.deportes = await res.json();

        const select = document.getElementById('torneo-deporte');
        if (select) {
            select.innerHTML = '<option value="">-- Selecciona un deporte --</option>' +
                state.deportes.map(d => `<option value="${d.id || d.Id}">${d.nombre || d.Nombre}</option>`).join('');
        }
    } catch (err) {
        console.error('Error cargando deportes:', err);
    }
}

// ============================================================================
// PESTAÑA 5: GESTIÓN DE DEPORTES (CRUD COMPLETO)
// ============================================================================
let deportesAdminLista = [];

async function cargarDeportesAdmin() {
    const tbody = document.getElementById('tabla-deportes-body');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:#888; padding:20px;">Cargando deportes...</td></tr>`;
    }

    try {
        const res = await fetch(`${API_URL}/deportes`);
        if (!res.ok) throw new Error('Error al consultar lista de deportes');
        const data = await res.json();
        deportesAdminLista = Array.isArray(data) ? data : [];
        state.deportes = deportesAdminLista;

        // Mantener actualizado el select de torneos
        const select = document.getElementById('torneo-deporte');
        if (select) {
            const valSel = select.value;
            select.innerHTML = '<option value="">-- Selecciona un deporte --</option>' +
                state.deportes.map(d => `<option value="${d.id || d.Id}">${d.nombre || d.Nombre}</option>`).join('');
            if (valSel) select.value = valSel;
        }

        renderizarTablaDeportes(deportesAdminLista);
    } catch (err) {
        console.error('Error en cargarDeportesAdmin:', err);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:#ef4444; padding:20px;">No se pudieron cargar los deportes: ${err.message}</td></tr>`;
        }
    }
}

function renderizarTablaDeportes(deportes) {
    const tbody = document.getElementById('tabla-deportes-body');
    if (!tbody) return;

    if (!deportes || deportes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:#888; padding:24px;">No hay deportes registrados. Crea el primero arriba.</td></tr>`;
        return;
    }

    tbody.innerHTML = deportes.map(d => {
        const id = d.id ?? d.Id;
        const nombre = d.nombre ?? d.Nombre ?? 'Sin Nombre';
        const tipoPeriodo = d.tipoPeriodo ?? d.TipoPeriodo ?? 'Tiempo';
        const cantPeriodos = d.cantidadPeriodosBase ?? d.CantidadPeriodosBase ?? 2;
        const duracion = d.duracionPeriodoMinutos ?? d.DuracionPeriodoMinutos ?? 0;
        const descanso = d.descansoMinutos ?? d.DescansoMinutos ?? 0;
        const duracionTotal = d.duracionTotalEstimadaMinutos ?? d.DuracionTotalEstimadaMinutos ?? ((cantPeriodos * duracion) + descanso);
        const unidad = d.unidadMarcador ?? d.UnidadMarcador ?? 'Puntos';
        const permiteEmpate = Boolean(d.permiteEmpate ?? d.PermiteEmpate);
        const tieneReloj = Boolean(d.tieneReloj ?? d.TieneReloj ?? true);

        const relojBadge = tieneReloj 
            ? `<span style="color:#10b981; font-weight:700;">⏱️ Con reloj</span>` 
            : `<span style="color:#a1a1aa;">Sin reloj</span>`;
        const empateBadge = permiteEmpate 
            ? `<span style="color:#00d2ff; font-size:11px;">(Empate Sí)</span>` 
            : `<span style="color:#64748b; font-size:11px;">(Sin Empate)</span>`;

        return `
            <tr>
                <td><strong>#${id}</strong></td>
                <td><strong style="color:#fff; font-size:13.5px;">${nombre}</strong></td>
                <td><span style="color:#e1e1e6;">${cantPeriodos} ${tipoPeriodo}(s)</span></td>
                <td><span style="color:#e1e1e6;">${duracion} min</span></td>
                <td><span style="color:#888;">${descanso} min</span></td>
                <td><strong style="color:#ff0044;">${duracionTotal} min</strong></td>
                <td><span style="color:#38bdf8;">${unidad}</span></td>
                <td><div>${relojBadge}</div><div>${empateBadge}</div></td>
                <td><span class="badge-deporte-activo">ACTIVO</span></td>
                <td style="text-align:center;">
                    <div style="display:flex; justify-content:center; gap:6px;">
                        <button type="button" class="btn-action-edit" onclick="editarDeporte(${id})" title="Editar Deporte">✏️ Editar</button>
                        <button type="button" class="btn-action-del" onclick="eliminarDeporte(${id})" title="Eliminar Deporte">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function limpiarFormDeporte() {
    const form = document.getElementById('form-deporte');
    if (form) form.reset();
    const idInput = document.getElementById('deporte-id');
    if (idInput) idInput.value = '';
    const title = document.getElementById('deporte-form-title');
    if (title) title.textContent = '🏅 Registrar Nuevo Deporte';
    const btnSubmit = document.getElementById('btn-guardar-deporte');
    if (btnSubmit) btnSubmit.textContent = '💾 Guardar Deporte';
}

window.editarDeporte = function(id) {
    const dep = deportesAdminLista.find(d => (d.id ?? d.Id) === id);
    if (!dep) {
        mostrarToast('No se encontró el deporte seleccionado.', 'error');
        return;
    }

    document.getElementById('deporte-id').value = dep.id ?? dep.Id;
    document.getElementById('deporte-nombre').value = dep.nombre ?? dep.Nombre ?? '';
    document.getElementById('deporte-cantidad-periodos').value = dep.cantidadPeriodosBase ?? dep.CantidadPeriodosBase ?? 2;
    document.getElementById('deporte-duracion-periodo').value = dep.duracionPeriodoMinutos ?? dep.DuracionPeriodoMinutos ?? 0;
    document.getElementById('deporte-descanso-minutos').value = dep.descansoMinutos ?? dep.DescansoMinutos ?? 15;
    document.getElementById('deporte-tipo-periodo').value = dep.tipoPeriodo ?? dep.TipoPeriodo ?? 'Tiempo';
    document.getElementById('deporte-unidad-marcador').value = dep.unidadMarcador ?? dep.UnidadMarcador ?? 'Puntos';
    document.getElementById('deporte-permite-empate').checked = Boolean(dep.permiteEmpate ?? dep.PermiteEmpate);
    document.getElementById('deporte-tiene-reloj').checked = Boolean(dep.tieneReloj ?? dep.TieneReloj ?? true);
    document.getElementById('deporte-estado').checked = true;

    const title = document.getElementById('deporte-form-title');
    if (title) title.textContent = `✏️ Editar Deporte: ${dep.nombre ?? dep.Nombre}`;
    const btnSubmit = document.getElementById('btn-guardar-deporte');
    if (btnSubmit) btnSubmit.textContent = '💾 Actualizar Deporte';

    document.getElementById('deporte-nombre')?.focus();
};

window.guardarDeporte = async function(e) {
    if (e && e.preventDefault) e.preventDefault();

    const id = document.getElementById('deporte-id')?.value;
    const nombre = document.getElementById('deporte-nombre')?.value.trim();
    const cantPeriodos = parseInt(document.getElementById('deporte-cantidad-periodos')?.value, 10);
    const duracionPeriodo = parseInt(document.getElementById('deporte-duracion-periodo')?.value, 10);
    const descansoMinutos = parseInt(document.getElementById('deporte-descanso-minutos')?.value, 10) || 0;
    const tipoPeriodo = document.getElementById('deporte-tipo-periodo')?.value || 'Tiempo';
    const unidadMarcador = document.getElementById('deporte-unidad-marcador')?.value || 'Puntos';
    const permiteEmpate = document.getElementById('deporte-permite-empate')?.checked || false;
    const tieneReloj = document.getElementById('deporte-tiene-reloj')?.checked || false;
    const duracionTotal = (cantPeriodos * duracionPeriodo) + descansoMinutos;

    if (!nombre) {
        mostrarToast('El nombre del deporte es obligatorio.', 'error');
        return;
    }
    if (isNaN(cantPeriodos) || cantPeriodos < 1) {
        mostrarToast('La cantidad de tiempos o periodos debe ser mayor a 0.', 'error');
        return;
    }
    if (isNaN(duracionPeriodo) || duracionPeriodo < 0) {
        mostrarToast('La duración por periodo debe ser válida.', 'error');
        return;
    }

    const payload = {
        nombre: nombre,
        tipoPeriodo: tipoPeriodo,
        cantidadPeriodosBase: cantPeriodos,
        duracionPeriodoMinutos: duracionPeriodo,
        descansoMinutos: descansoMinutos,
        duracionTotalEstimadaMinutos: duracionTotal,
        permiteEmpate: permiteEmpate,
        tieneReloj: tieneReloj,
        unidadMarcador: unidadMarcador
    };

    const btnSubmit = document.getElementById('btn-guardar-deporte');
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = '⏳ Guardando...';
    }

    try {
        let res;
        if (id) {
            payload.id = parseInt(id, 10);
            res = await fetch(`${API_URL}/deportes/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`${API_URL}/deportes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        if (!res.ok) {
            const errTxt = await res.text().catch(() => '');
            throw new Error(errTxt || `Error HTTP ${res.status}`);
        }

        mostrarToast(id ? 'Deporte actualizado con éxito.' : 'Deporte registrado con éxito.', 'exito');
        limpiarFormDeporte();
        await cargarDeportesAdmin();
        await cargarDeportes();
    } catch (err) {
        console.error('Error al guardar deporte:', err);
        mostrarToast(`No se pudo guardar el deporte: ${err.message}`, 'error');
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.textContent = id ? '💾 Actualizar Deporte' : '💾 Guardar Deporte';
        }
    }
};

window.eliminarDeporte = async function(id) {
    const dep = deportesAdminLista.find(d => (d.id ?? d.Id) === id);
    const nom = dep ? (dep.nombre ?? dep.Nombre) : `#${id}`;

    const ok = await mostrarConfirmacionModal(
        `¿Estás seguro de que deseas eliminar el deporte "${nom}"?\n\nNota: Si ya existen torneos vinculados a este deporte, la base de datos protegerá la integridad de los datos.`,
        '🗑️ Eliminar Deporte',
        'Sí, Eliminar',
        'Cancelar'
    );

    if (!ok) return;

    try {
        const res = await fetch(`${API_URL}/deportes/${id}`, {
            method: 'DELETE'
        });

        if (!res.ok) {
            if (res.status === 409 || res.status === 500) {
                throw new Error('No es posible eliminar el deporte porque tiene torneos o partidos asociados en la base de datos.');
            }
            throw new Error(`Error ${res.status}: no se pudo eliminar el deporte.`);
        }

        mostrarToast(`Deporte "${nom}" eliminado exitosamente.`, 'exito');
        if (document.getElementById('deporte-id')?.value == id) {
            limpiarFormDeporte();
        }
        await cargarDeportesAdmin();
        await cargarDeportes();
    } catch (err) {
        console.error('Error al eliminar deporte:', err);
        mostrarToast(err.message, 'error');
    }
};

// Event Listeners Módulo Deportes
document.getElementById('filtro-buscar-deporte')?.addEventListener('input', (e) => {
    const texto = e.target.value.toLowerCase().trim();
    const filtrados = deportesAdminLista.filter(d => {
        const nom = (d.nombre || d.Nombre || '').toLowerCase();
        const tipo = (d.tipoPeriodo || d.TipoPeriodo || '').toLowerCase();
        const unidad = (d.unidadMarcador || d.UnidadMarcador || '').toLowerCase();
        return nom.includes(texto) || tipo.includes(texto) || unidad.includes(texto);
    });
    renderizarTablaDeportes(filtrados);
});

document.getElementById('btn-limpiar-deporte')?.addEventListener('click', limpiarFormDeporte);
document.getElementById('btn-cancelar-deporte')?.addEventListener('click', limpiarFormDeporte);
document.getElementById('form-deporte')?.addEventListener('submit', window.guardarDeporte);

async function cargarCanchas() {
    try {
        const res = await fetch(`${API_URL}/canchas`);
        if (!res.ok) throw new Error('Error al obtener canchas');
        state.canchas = await res.json();

        // Dropdown en Formulario de Torneo
        const selectTorneo = document.getElementById('torneo-cancha');
        if (selectTorneo) {
            selectTorneo.innerHTML = '<option value="">-- Sin Cancha Sede Fija (Multicancha) --</option>' +
                state.canchas.map(c => `<option value="${c.id || c.Id}">${c.nombre || c.Nombre} (${c.ubicacion || c.Ubicacion || 'Sincelejo'})</option>`).join('');
        }

        // Dropdown en Formulario de Partido
        const selectPartido = document.getElementById('partido-cancha');
        if (selectPartido) {
            selectPartido.innerHTML = '<option value="">-- Selecciona una Cancha --</option>' +
                state.canchas.map(c => `<option value="${c.id || c.Id}">${c.nombre || c.Nombre}</option>`).join('');
        }
    } catch (err) {
        console.error('Error cargando canchas:', err);
    }
}

async function cargarTorneos() {
    try {
        const res = await fetch(`${API_URL}/torneos`);
        if (!res.ok) throw new Error('Error al obtener torneos');
        state.torneos = await res.json();

        renderizarTablaTorneos(state.torneos);
        poblarSelectsTorneo(state.torneos);
    } catch (err) {
        console.error('Error cargando torneos:', err);
        mostrarToast('No se pudieron cargar los torneos desde el servidor.', 'error');
    }
}

function poblarSelectsTorneo(torneos) {
    // 1. Filtro en Equipos
    const filtroEq = document.getElementById('filtro-equipo-torneo');
    if (filtroEq) {
        const valorActual = filtroEq.value;
        filtroEq.innerHTML = '<option value="">-- Todos los Torneos --</option>' +
            torneos.map(t => `<option value="${t.id || t.Id}">${t.nombre || t.Nombre}</option>`).join('');
        if (valorActual) filtroEq.value = valorActual;
    }

    // 2. Select en Modal Nuevo Equipo
    const asignarEq = document.getElementById('equipo-torneo-asignar');
    if (asignarEq) {
        asignarEq.innerHTML = '<option value="">-- Selecciona el Torneo --</option>' +
            torneos.map(t => `<option value="${t.id || t.Id}">${t.nombre || t.Nombre}</option>`).join('');
    }

    // 3. Select en Fixture / Programación
    const fixtTor = document.getElementById('fixture-torneo-select');
    if (fixtTor) {
        const valorActual = fixtTor.value;
        fixtTor.innerHTML = torneos.map(t => `<option value="${t.id || t.Id}">${t.nombre || t.Nombre} (${obtenerNombreDeporte(t)})</option>`).join('');
        const sesion = obtenerUsuarioSesion();
        const rol = (sesion?.rol || sesion?.Rol || '').toUpperCase();
        const torIdAsignado = sesion?.torneoId ?? sesion?.TorneoId;

        if (rol === 'PLANILLERO' && torIdAsignado) {
            fixtTor.value = torIdAsignado;
            fixtTor.disabled = true;
            fixtTor.title = 'Torneo asignado exclusivamente a este usuario.';
        } else if (valorActual && torneos.some(t => (t.id || t.Id) == valorActual)) {
            fixtTor.value = valorActual;
        } else if (torneos.length > 0) {
            fixtTor.value = torneos[0].id || torneos[0].Id;
        }
        // Si hay torneo seleccionado, cargar partidos
        if (fixtTor.value) {
            cargarPartidosFixture(fixtTor.value);
        }
    }

    // 4. Select en Modal Carga Masiva Excel
    const excelTor = document.getElementById('excel-torneo-select');
    if (excelTor) {
        const valorActual = excelTor.value;
        excelTor.innerHTML = '<option value="">-- Selecciona el Torneo --</option>' +
            torneos.map(t => `<option value="${t.id || t.Id}">${t.nombre || t.Nombre} (${obtenerNombreDeporte(t)})</option>`).join('');
        if (valorActual) excelTor.value = valorActual;
    }

    // 5. Select en Módulo Usuarios y Planilleros
    const usrTor = document.getElementById('usuario-torneo-asignar');
    if (usrTor) {
        const valorActual = usrTor.value;
        usrTor.innerHTML = '<option value="">-- Sin Torneo / No Aplica --</option>' +
            torneos.map(t => `<option value="${t.id || t.Id}">${t.nombre || t.Nombre} (${obtenerNombreDeporte(t)})</option>`).join('');
        if (valorActual) usrTor.value = valorActual;
    }
}

function obtenerNombreDeporte(torneo) {
    if (torneo.deporte && (torneo.deporte.nombre || torneo.deporte.Nombre)) {
        return torneo.deporte.nombre || torneo.deporte.Nombre;
    }
    const depId = torneo.deporte_id || torneo.DeporteId || torneo.deporteId;
    const dep = state.deportes.find(d => (d.id || d.Id) === depId);
    return dep ? (dep.nombre || dep.Nombre) : 'General';
}

function obtenerNombreCancha(canchaId) {
    if (!canchaId) return 'Sin Cancha Asignada';
    const c = state.canchas.find(x => (x.id || x.Id) === canchaId);
    return c ? (c.nombre || c.Nombre) : `Cancha #${canchaId}`;
}

function renderizarTablaTorneos(torneos) {
    const tbody = document.getElementById('tabla-torneos-body');
    if (!tbody) return;

    if (!torneos || torneos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#888; padding:24px;">No hay torneos registrados.</td></tr>`;
        return;
    }

    tbody.innerHTML = torneos.map(t => {
        const id = t.id || t.Id;
        const nombre = t.nombre || t.Nombre;
        const deporteNom = obtenerNombreDeporte(t);
        const esMulti = t.es_multicancha || t.esMulticancha || t.EsMulticancha;
        const canchaSedeId = t.cancha_sede_id || t.canchaSedeId || t.CanchaSedeId;
        
        let canchaSedeTexto = '';
        if (esMulti) {
            canchaSedeTexto = `<span class="badge-status badge-multicancha">🌐 Multicancha (Múltiples sedes)</span>`;
        } else if (canchaSedeId) {
            canchaSedeTexto = `<strong>${obtenerNombreCancha(canchaSedeId)}</strong>`;
        } else {
            canchaSedeTexto = `<span style="color:#888;">No asignada</span>`;
        }

        const regimenBadge = esMulti
            ? `<span class="badge-status badge-multicancha">Multicancha</span>`
            : `<span class="badge-status badge-fija">Sede Fija</span>`;

        const temporada = t.temporada || t.Temporada || '2026';

        return `
            <tr>
                <td><strong>#${id}</strong></td>
                <td><strong style="color:#fff;">${nombre}</strong></td>
                <td><span style="color:#ff0044; font-weight:600;">${deporteNom}</span></td>
                <td>${canchaSedeTexto}</td>
                <td>${regimenBadge}</td>
                <td>${temporada}</td>
                <td style="text-align: center;">
                    <div style="display:flex; justify-content:center; gap:6px;">
                        <button class="btn-action-edit" onclick="editarTorneo(${id})" title="Editar Torneo">✏️ Editar</button>
                        <button class="btn-action-view" onclick="irAFixtureTorneo(${id})" title="Ver / Generar Fixture">📅 Fixture</button>
                        <button class="btn-action-del" onclick="eliminarTorneo(${id})" title="Eliminar Torneo">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Búsqueda en vivo de torneos
document.getElementById('filtro-buscar-torneo')?.addEventListener('input', (e) => {
    const texto = e.target.value.toLowerCase().trim();
    const filtrados = state.torneos.filter(t => {
        const nom = (t.nombre || t.Nombre || '').toLowerCase();
        const dep = obtenerNombreDeporte(t).toLowerCase();
        return nom.includes(texto) || dep.includes(texto);
    });
    renderizarTablaTorneos(filtrados);
});

// Guardar o Actualizar Torneo
document.getElementById('form-torneo')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('torneo-id').value;
    const nombre = document.getElementById('torneo-nombre').value.trim();
    const deporteId = parseInt(document.getElementById('torneo-deporte').value);
    const canchaSedeIdVal = document.getElementById('torneo-cancha').value;
    const canchaSedeId = canchaSedeIdVal ? parseInt(canchaSedeIdVal) : null;
    const temporada = document.getElementById('torneo-temporada').value.trim() || '2026';
    const esMulticancha = document.getElementById('torneo-multicancha').checked;

    if (!nombre || !deporteId) {
        mostrarToast('Por favor completa los campos obligatorios del torneo.', 'error');
        return;
    }

    const payload = {
        id: id ? parseInt(id) : 0,
        nombre: nombre,
        deporteId: deporteId,
        deporte_id: deporteId,
        canchaSedeId: canchaSedeId,
        cancha_sede_id: canchaSedeId,
        esMulticancha: esMulticancha,
        es_multicancha: esMulticancha,
        temporada: temporada
    };

    try {
        let res;
        if (id) {
            res = await fetch(`${API_URL}/torneos/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`${API_URL}/torneos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.mensaje || 'Error al guardar el torneo en el servidor');
        }

        mostrarToast(id ? 'Torneo actualizado exitosamente.' : 'Torneo creado exitosamente.', 'exito');
        limpiarFormTorneo();
        await cargarTorneos();
    } catch (err) {
        console.error('Error guardando torneo:', err);
        mostrarToast(err.message, 'error');
    }
});

function limpiarFormTorneo() {
    document.getElementById('torneo-id').value = '';
    document.getElementById('torneo-nombre').value = '';
    document.getElementById('torneo-deporte').value = '';
    document.getElementById('torneo-cancha').value = '';
    document.getElementById('torneo-temporada').value = '2026';
    document.getElementById('torneo-multicancha').checked = false;
    document.getElementById('torneo-form-title').textContent = '🏆 Registrar Nuevo Torneo';
    document.getElementById('btn-guardar-torneo').textContent = '💾 Guardar Torneo';
}

document.getElementById('btn-limpiar-torneo')?.addEventListener('click', limpiarFormTorneo);

window.editarTorneo = function(id) {
    const t = state.torneos.find(x => (x.id || x.Id) === id);
    if (!t) return;

    document.getElementById('torneo-id').value = id;
    document.getElementById('torneo-nombre').value = t.nombre || t.Nombre;
    document.getElementById('torneo-deporte').value = t.deporte_id || t.DeporteId || t.deporteId || '';
    document.getElementById('torneo-cancha').value = t.cancha_sede_id || t.canchaSedeId || t.CanchaSedeId || '';
    document.getElementById('torneo-temporada').value = t.temporada || t.Temporada || '2026';
    document.getElementById('torneo-multicancha').checked = !!(t.es_multicancha || t.esMulticancha || t.EsMulticancha);

    document.getElementById('torneo-form-title').textContent = `✏️ Editando Torneo: ${t.nombre || t.Nombre}`;
    document.getElementById('btn-guardar-torneo').textContent = '💾 Actualizar Torneo';

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.eliminarTorneo = async function(id) {
    const ok = await mostrarConfirmacionModal(
        `¿Estás seguro de eliminar el torneo #${id}? Esta acción eliminará también sus partidos y configuraciones.`,
        '🗑️ Eliminar Torneo'
    );
    if (!ok) return;

    try {
        const res = await fetch(`${API_URL}/torneos/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.mensaje || 'No fue posible eliminar el torneo');
        }

        mostrarToast('Torneo eliminado exitosamente.', 'exito');
        await cargarTorneos();
    } catch (err) {
        console.error('Error eliminando torneo:', err);
        mostrarToast(err.message, 'error');
    }
};

window.irAFixtureTorneo = function(torneoId) {
    const select = document.getElementById('fixture-torneo-select');
    if (select) {
        select.value = torneoId;
        cargarPartidosFixture(torneoId);
    }
    cambiarPestana('tab-fixture');
};

// ============================================================================
// PESTAÑA 2: EQUIPOS Y NÓMINAS
// ============================================================================

async function cargarEquipos() {
    const filtroTorneoId = document.getElementById('filtro-equipo-torneo')?.value;
    const tbody = document.getElementById('tabla-equipos-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#888; padding:20px;">Cargando equipos...</td></tr>`;

    try {
        let equipos = [];
        if (filtroTorneoId) {
            const res = await fetch(`${API_URL}/TorneoEquipos/torneo/${filtroTorneoId}`);
            if (res.ok) equipos = await res.json();
        } else {
            const res = await fetch(`${API_URL}/equipos`);
            if (res.ok) equipos = await res.json();
        }

        state.equipos = equipos;
        // Actualizar diccionario de equipos
        equipos.forEach(eq => {
            const id = eq.id || eq.Id;
            const nom = eq.nombre || eq.Nombre;
            if (id && nom) state.equiposMap[id] = nom;
        });

        renderizarTablaEquipos(equipos, filtroTorneoId);
    } catch (err) {
        console.error('Error cargando equipos:', err);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#ff4444; padding:20px;">Error al cargar equipos.</td></tr>`;
    }
}

document.getElementById('filtro-equipo-torneo')?.addEventListener('change', () => {
    cargarEquipos();
});

function renderizarTablaEquipos(equipos, torneoFiltradoId) {
    const tbody = document.getElementById('tabla-equipos-body');
    if (!tbody) return;

    if (!equipos || equipos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#888; padding:24px;">No se encontraron equipos registrados en esta vista.</td></tr>`;
        return;
    }

    let nomTorneoFiltrado = 'Multitorneo / General';
    if (torneoFiltradoId) {
        const t = state.torneos.find(x => (x.id || x.Id) == torneoFiltradoId);
        if (t) nomTorneoFiltrado = t.nombre || t.Nombre;
    }

    tbody.innerHTML = equipos.map(eq => {
        const id = eq.id || eq.Id;
        const nombre = eq.nombre || eq.Nombre;
        const delegacion = eq.delegacion || eq.Delegacion || 'Sincelejo';

        return `
            <tr>
                <td><strong>#${id}</strong></td>
                <td><strong style="color:#fff; font-size:14px;">${nombre}</strong></td>
                <td><span style="color:#bbb;">${delegacion}</span></td>
                <td><span class="badge-status badge-fija">${nomTorneoFiltrado}</span></td>
                <td style="text-align: center;">
                    <div style="display:flex; justify-content:center; gap:6px;">
                        <button class="btn-action-view" onclick="abrirNominaEquipo(${id}, '${nombre.replace(/'/g, "\\'")}')" title="Ver / Administrar Nómina">👥 Nómina</button>
                        <button class="btn-action-edit" onclick="editarEquipoModal(${id}, '${nombre.replace(/'/g, "\\'")}', '${delegacion.replace(/'/g, "\\'")}')" title="Editar Equipo">✏️</button>
                        <button class="btn-action-del" onclick="eliminarEquipo(${id}, '${nombre.replace(/'/g, "\\'")}')" title="Eliminar Equipo">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Abrir Modal Crear Equipo
document.getElementById('btn-abrir-modal-equipo')?.addEventListener('click', () => {
    document.getElementById('equipo-id').value = '';
    document.getElementById('equipo-nombre').value = '';
    document.getElementById('equipo-delegacion').value = 'Sincelejo, Sucre';
    document.getElementById('modal-equipo-title').textContent = 'Registrar Nuevo Equipo';

    const filtroTor = document.getElementById('filtro-equipo-torneo')?.value;
    if (filtroTor) {
        document.getElementById('equipo-torneo-asignar').value = filtroTor;
    }

    abrirModal('modal-equipo-admin');
});

window.editarEquipoModal = function(id, nombre, delegacion) {
    document.getElementById('equipo-id').value = id;
    document.getElementById('equipo-nombre').value = nombre;
    document.getElementById('equipo-delegacion').value = delegacion;
    document.getElementById('modal-equipo-title').textContent = `✏️ Editar Equipo: ${nombre}`;
    abrirModal('modal-equipo-admin');
};

document.getElementById('form-equipo-admin')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('equipo-id').value;
    const nombre = document.getElementById('equipo-nombre').value.trim();
    const delegacion = document.getElementById('equipo-delegacion').value.trim();
    const torneoIdVal = document.getElementById('equipo-torneo-asignar').value;

    if (!nombre || !delegacion) {
        mostrarToast('Nombre y delegación son requeridos.', 'error');
        return;
    }

    try {
        if (id) {
            const res = await fetch(`${API_URL}/equipos/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: parseInt(id), nombre, delegacion })
            });
            if (!res.ok) throw new Error('Error al actualizar equipo');
            mostrarToast('Equipo actualizado correctamente.', 'exito');
        } else {
            if (!torneoIdVal) {
                mostrarToast('Debes seleccionar el torneo en que participará el equipo.', 'error');
                return;
            }
            const res = await fetch(`${API_URL}/equipos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nombre,
                    delegacion,
                    torneoId: parseInt(torneoIdVal)
                })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.mensaje || 'Error al inscribir equipo');
            }
            mostrarToast('Equipo creado e inscrito exitosamente.', 'exito');
        }

        cerrarModal('modal-equipo-admin');
        await cargarEquiposGlobal();
        await cargarEquipos();
    } catch (err) {
        console.error('Error guardando equipo:', err);
        mostrarToast(err.message, 'error');
    }
});

window.eliminarEquipo = async function(id, nombre) {
    const ok = await mostrarConfirmacionModal(
        `¿Deseas eliminar definitivamente el equipo "${nombre}" (#${id})?`,
        '🗑️ Eliminar Equipo'
    );
    if (!ok) return;

    try {
        const res = await fetch(`${API_URL}/equipos/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('No se pudo eliminar el equipo');
        mostrarToast('Equipo eliminado exitosamente.', 'exito');
        await cargarEquiposGlobal();
        await cargarEquipos();
    } catch (err) {
        console.error('Error eliminando equipo:', err);
        mostrarToast(err.message, 'error');
    }
};

// ============================================================================
// CARGA MASIVA DESDE EXCEL (MODAL Y PROCESAMIENTO)
// ============================================================================
document.getElementById('btn-abrir-modal-excel')?.addEventListener('click', () => {
    const formExcel = document.getElementById('form-carga-excel');
    if (formExcel) formExcel.reset();

    const reporteContainer = document.getElementById('excel-reporte-container');
    if (reporteContainer) reporteContainer.classList.add('hidden');

    const listaErroresWrapper = document.getElementById('excel-lista-errores-wrapper');
    if (listaErroresWrapper) listaErroresWrapper.classList.add('hidden');

    const excelTorneoSelect = document.getElementById('excel-torneo-select');
    if (excelTorneoSelect && state.torneos && state.torneos.length > 0) {
        const valorActual = excelTorneoSelect.value;
        excelTorneoSelect.innerHTML = '<option value="">-- Selecciona el Torneo --</option>' +
            state.torneos.map(t => `<option value="${t.id || t.Id}">${t.nombre || t.Nombre} (${obtenerNombreDeporte(t)})</option>`).join('');
        const filtroTor = document.getElementById('filtro-equipo-torneo')?.value;
        if (filtroTor) {
            excelTorneoSelect.value = filtroTor;
        } else if (valorActual) {
            excelTorneoSelect.value = valorActual;
        }
    }

    abrirModal('modal-carga-excel');
});

document.getElementById('form-carga-excel')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const torneoId = document.getElementById('excel-torneo-select')?.value;
    if (!torneoId) {
        mostrarToast('Por favor selecciona un torneo destino.', 'error');
        return;
    }

    const archivoInput = document.getElementById('excel-archivo-input');
    if (!archivoInput || !archivoInput.files || archivoInput.files.length === 0) {
        mostrarToast('Por favor selecciona un archivo Excel (.xlsx o .xls).', 'error');
        return;
    }

    const file = archivoInput.files[0];
    const tipoCarga = document.getElementById('excel-tipo-carga')?.value || 'jugadores';
    const btnProcesar = document.getElementById('btn-procesar-excel');

    // Deshabilitar botón durante procesamiento
    if (btnProcesar) {
        btnProcesar.disabled = true;
        btnProcesar.innerHTML = '⏳ Procesando archivo...';
    }

    const formData = new FormData();
    formData.append('archivo', file);

    const baseUrl = (typeof API_BASE_URL !== 'undefined') ? API_BASE_URL : API_URL;
    const endpoint = (tipoCarga === 'equipos')
        ? `${baseUrl}/equipos/cargar-excel?torneoId=${torneoId}`
        : `${baseUrl}/jugadores/cargar-excel?torneoId=${torneoId}`;

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            body: formData
        });

        let data = null;
        try {
            data = await res.json();
        } catch (_) {
            const txt = await res.text().catch(() => '');
            data = { mensaje: txt || (res.ok ? 'Procesamiento finalizado.' : 'Error al procesar el archivo.'), errores: [] };
        }

        const reporteContainer = document.getElementById('excel-reporte-container');
        const cantInsertados = document.getElementById('excel-cant-insertados');
        const cantOmitidos = document.getElementById('excel-cant-omitidos');
        const cantErrores = document.getElementById('excel-cant-errores');
        const mensajeServidor = document.getElementById('excel-mensaje-servidor');
        const listaErroresWrapper = document.getElementById('excel-lista-errores-wrapper');
        const listaErrores = document.getElementById('excel-lista-errores');

        // Extraer cantidades
        let insertados = 0;
        let omitidos = 0;
        const errores = Array.isArray(data.errores) ? data.errores : [];

        if (data.insertadosCount !== undefined) {
            insertados = Number(data.insertadosCount);
        } else if (data.mensaje) {
            const mIns = data.mensaje.match(/(?:registraron|insertaron)\s+(\d+)/i);
            if (mIns) insertados = parseInt(mIns[1], 10);
        }

        if (data.omitidosCount !== undefined) {
            omitidos = Number(data.omitidosCount);
        } else if (data.mensaje) {
            const mOm = data.mensaje.match(/omitieron\s+(\d+)/i);
            if (mOm) omitidos = parseInt(mOm[1], 10);
        }

        // Mostrar reporte
        if (reporteContainer) reporteContainer.classList.remove('hidden');
        if (cantInsertados) cantInsertados.textContent = insertados;
        if (cantOmitidos) cantOmitidos.textContent = omitidos;
        if (cantErrores) cantErrores.textContent = errores.length;
        if (mensajeServidor) {
            mensajeServidor.textContent = data.mensaje || (res.ok ? 'Archivo procesado con éxito.' : 'Hubo inconsistencias en el archivo.');
            if (res.ok && insertados > 0) {
                mensajeServidor.style.borderColor = '#10b981';
                mensajeServidor.style.background = 'rgba(16, 185, 129, 0.1)';
            } else if (errores.length > 0 || !res.ok) {
                mensajeServidor.style.borderColor = '#ef4444';
                mensajeServidor.style.background = 'rgba(239, 68, 68, 0.1)';
            } else {
                mensajeServidor.style.borderColor = '#f59e0b';
                mensajeServidor.style.background = 'rgba(245, 158, 11, 0.1)';
            }
        }

        // Listar errores si los hay
        if (errores.length > 0) {
            if (listaErroresWrapper) listaErroresWrapper.classList.remove('hidden');
            if (listaErrores) {
                listaErrores.innerHTML = errores.map(err => `<div style="margin-bottom: 5px;">⚠️ ${err}</div>`).join('');
            }
        } else {
            if (listaErroresWrapper) listaErroresWrapper.classList.add('hidden');
            if (listaErrores) listaErrores.innerHTML = '';
        }

        if (res.ok && insertados > 0) {
            mostrarToast(data.mensaje || 'Carga exitosa de registros desde Excel.', 'exito');
            // Refrescar tabla de equipos y nóminas
            await cargarEquiposGlobal();
            await cargarEquipos();
            const eqIdNom = document.getElementById('jugador-equipo-id')?.value;
            if (eqIdNom && typeof cargarNomina === 'function') {
                await cargarNomina(eqIdNom);
            }
        } else {
            mostrarToast(data.mensaje || 'Proceso finalizado con advertencias o sin inserciones.', (errores.length > 0 || !res.ok) ? 'error' : 'info');
            // Refrescar de todos modos si hubo inserciones parciales
            if (insertados > 0) {
                await cargarEquiposGlobal();
                await cargarEquipos();
            }
        }
    } catch (err) {
        console.error('Error al procesar archivo Excel:', err);
        mostrarToast('Error de comunicación con el servidor al subir el archivo Excel.', 'error');
        const reporteContainer = document.getElementById('excel-reporte-container');
        const mensajeServidor = document.getElementById('excel-mensaje-servidor');
        if (reporteContainer) reporteContainer.classList.remove('hidden');
        if (mensajeServidor) {
            mensajeServidor.textContent = `Error: ${err.message || 'No se pudo conectar con el servidor.'}`;
            mensajeServidor.style.borderColor = '#ef4444';
            mensajeServidor.style.background = 'rgba(239, 68, 68, 0.1)';
        }
    } finally {
        if (btnProcesar) {
            btnProcesar.disabled = false;
            btnProcesar.innerHTML = '⚡ Procesar Archivo';
        }
    }
});

// ============================================================================
// GESTIÓN DE NÓMINA DE JUGADORES (MODAL)
// ============================================================================

window.abrirNominaEquipo = async function(equipoId, nombreEquipo) {
    document.getElementById('modal-nomina-title').textContent = `Nómina: ${nombreEquipo}`;
    document.getElementById('modal-nomina-sub').textContent = `Equipo #${equipoId} - Registro y Nómina Oficial`;
    document.getElementById('jugador-equipo-id').value = equipoId;

    limpiarFormJugador();
    abrirModal('modal-nomina');
    await cargarNomina(equipoId);
};

async function cargarNomina(equipoId) {
    const tbody = document.getElementById('tabla-nomina-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#888; padding:15px;">Cargando jugadores...</td></tr>`;

    try {
        const res = await fetch(`${API_URL}/jugadores/equipo/${equipoId}`);
        if (!res.ok) throw new Error('Error al cargar nómina');
        const dataJug = await res.json();
        const jugadores = (Array.isArray(dataJug) ? dataJug : []).filter(j => {
            const jEqId = typeof extraerEquipoIdJugador === 'function' ? extraerEquipoIdJugador(j) : (j.equipo_id ?? j.equipoId ?? j.EquipoId ?? (j.equipo ? (j.equipo.id || j.equipo.Id) : null));
            return jEqId !== null && jEqId !== undefined && String(jEqId) === String(equipoId);
        });

        if (jugadores.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#888; padding:20px;">No hay jugadores inscritos en este equipo aún. Agrega el primero arriba.</td></tr>`;
            return;
        }

        tbody.innerHTML = jugadores.map(j => {
            const id = j.id || j.Id;
            const dorsal = j.numeroCamiseta ?? j.NumeroCamiseta ?? '-';
            const nombre = j.nombre || j.Nombre;
            const cedula = j.cedula || j.Cedula || '-';
            const pos = j.posicion || j.Posicion || '-';
            const edad = j.edad || j.Edad || '-';
            const estatura = j.estatura || j.Estatura ? `${j.estatura || j.Estatura} m` : '-';

            return `
                <tr>
                    <td><strong>#${id}</strong></td>
                    <td><span style="font-weight:800; color:#ff0044; font-size:14px;">${dorsal}</span></td>
                    <td><strong style="color:#fff;">${nombre}</strong></td>
                    <td><span style="color:#aaa;">${cedula}</span></td>
                    <td>${pos}</td>
                    <td>${edad}</td>
                    <td>${estatura}</td>
                    <td style="text-align:center;">
                        <button class="btn-action-edit" onclick="editarJugador(${id}, '${nombre.replace(/'/g, "\\'")}', '${cedula}', '${dorsal}', '${pos}', '${edad}', '${j.estatura || j.Estatura || ''}')" title="Editar">✏️</button>
                        <button class="btn-action-del" onclick="eliminarJugador(${id}, ${equipoId})" title="Eliminar">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error cargando nómina:', err);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#ff4444; padding:15px;">Error al cargar nómina.</td></tr>`;
    }
}

function limpiarFormJugador() {
    document.getElementById('jugador-id').value = '';
    document.getElementById('jugador-nombre').value = '';
    document.getElementById('jugador-cedula').value = '';
    document.getElementById('jugador-dorsal').value = '';
    document.getElementById('jugador-posicion').value = '';
    document.getElementById('jugador-edad').value = '';
    document.getElementById('jugador-estatura').value = '';
    document.getElementById('btn-guardar-jugador').textContent = '+ Guardar Jugador';
}

document.getElementById('btn-limpiar-jugador')?.addEventListener('click', limpiarFormJugador);

window.editarJugador = function(id, nombre, cedula, dorsal, pos, edad, estatura) {
    document.getElementById('jugador-id').value = id;
    document.getElementById('jugador-nombre').value = nombre;
    document.getElementById('jugador-cedula').value = cedula === '-' ? '' : cedula;
    document.getElementById('jugador-dorsal').value = dorsal === '-' ? '' : dorsal;
    document.getElementById('jugador-posicion').value = pos === '-' ? '' : pos;
    document.getElementById('jugador-edad').value = edad === '-' ? '' : edad;
    document.getElementById('jugador-estatura').value = estatura || '';
    document.getElementById('btn-guardar-jugador').textContent = '💾 Actualizar Jugador';
};

document.getElementById('form-jugador')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('jugador-id').value;
    const equipoId = parseInt(document.getElementById('jugador-equipo-id').value);
    const nombre = document.getElementById('jugador-nombre').value.trim();
    const cedula = document.getElementById('jugador-cedula').value.trim() || null;
    const dorsalVal = document.getElementById('jugador-dorsal').value;
    const numeroCamiseta = dorsalVal ? parseInt(dorsalVal) : null;
    const posicion = document.getElementById('jugador-posicion').value.trim() || null;
    const edadVal = document.getElementById('jugador-edad').value;
    const edad = edadVal ? parseInt(edadVal) : null;
    const estVal = document.getElementById('jugador-estatura').value;
    const estatura = estVal ? parseFloat(estVal) : null;

    if (!nombre || !equipoId) {
        mostrarToast('El nombre del jugador es requerido.', 'error');
        return;
    }

    const payload = {
        id: id ? parseInt(id) : 0,
        equipoId: equipoId,
        nombre: nombre,
        cedula: cedula,
        numeroCamiseta: numeroCamiseta,
        posicion: posicion,
        edad: edad,
        estatura: estatura
    };

    try {
        let res;
        if (id) {
            res = await fetch(`${API_URL}/jugadores/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`${API_URL}/jugadores`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        if (!res.ok) throw new Error('Error al guardar datos del jugador');
        mostrarToast(id ? 'Jugador actualizado.' : 'Jugador inscrito con éxito.', 'exito');
        limpiarFormJugador();
        await cargarNomina(equipoId);
    } catch (err) {
        console.error('Error guardando jugador:', err);
        mostrarToast(err.message, 'error');
    }
});

window.eliminarJugador = async function(id, equipoId) {
    const ok = await mostrarConfirmacionModal(
        `¿Eliminar jugador #${id} de la nómina?`,
        '🗑️ Eliminar Jugador'
    );
    if (!ok) return;

    try {
        const res = await fetch(`${API_URL}/jugadores/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar jugador');
        mostrarToast('Jugador retirado de la nómina.', 'exito');
        await cargarNomina(equipoId);
    } catch (err) {
        console.error('Error eliminando jugador:', err);
        mostrarToast(err.message, 'error');
    }
};

// ============================================================================
// PESTAÑA 3: PROGRAMACIÓN Y FIXTURE (EXCLUSIVO CALENDARIO Y CANCHAS)
// ============================================================================

document.getElementById('fixture-torneo-select')?.addEventListener('change', (e) => {
    cargarPartidosFixture(e.target.value);
});

async function cargarPartidosFixture(torneoId) {
    const tbody = document.getElementById('tabla-fixture-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#888; padding:20px;">Cargando programación del torneo #${torneoId}...</td></tr>`;

    try {
        const res = await fetch(`${API_URL}/partidos/torneo/${torneoId}`);
        if (!res.ok) throw new Error('Error al obtener partidos del torneo');
        const partidos = await res.json();

        // Actualizar equipos disponibles para partido manual en este torneo
        await cargarEquiposParaPartido(torneoId);

        renderizarTablaFixture(partidos);
        await actualizarEstadoPlayoffsAdmin(torneoId, partidos);
    } catch (err) {
        console.error('Error cargando fixture:', err);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#ff4444; padding:20px;">Error al cargar programación.</td></tr>`;
    }
}

async function cargarEquiposParaPartido(torneoId) {
    try {
        let equipos = [];
        try {
            const res = await fetch(`${API_URL}/TorneoEquipos/torneo/${torneoId}`);
            if (res.ok) {
                equipos = await res.json();
            }
        } catch (e) {
            console.warn('Error al obtener equipos vinculados al torneo:', e);
        }

        if (!Array.isArray(equipos) || equipos.length === 0) {
            equipos = state.equipos || [];
        }

        const optHtml = '<option value="">-- Selecciona un equipo --</option>' +
            equipos.map(e => `<option value="${e.id || e.Id}">${e.nombre || e.Nombre}</option>`).join('');

        const selLocal = document.getElementById('partido-local');
        const selVisit = document.getElementById('partido-visitante');
        if (selLocal) selLocal.innerHTML = optHtml;
        if (selVisit) selVisit.innerHTML = optHtml;

        // Auto-seleccionar cancha sede fija si no es multicancha
        const torneo = state.torneos.find(t => (t.id || t.Id) == torneoId);
        if (torneo && !torneo.es_multicancha && !torneo.esMulticancha && (torneo.cancha_sede_id || torneo.canchaSedeId)) {
            const canchaSede = torneo.cancha_sede_id || torneo.canchaSedeId;
            const selCancha = document.getElementById('partido-cancha');
            if (selCancha) selCancha.value = canchaSede;
        }
    } catch (err) {
        console.error('Error cargando equipos del torneo:', err);
    }
}

function esPartidoPlayoff(p) {
    if (!p) return false;
    const fId = Number(p.faseId ?? p.FaseId ?? 0);
    // En BD, faseId null, 0 o 1 representa Fase Regular / Todos contra Todos
    if (fId > 1) return true;

    const textoFase = `${p.fase || ''} ${p.faseNombre || ''} ${p.FaseNombre || ''} ${p.estadoDetalle || ''} ${p.EstadoDetalle || ''}`.toLowerCase();
    if (textoFase.includes('final') || textoFase.includes('semifinal') || 
        textoFase.includes('cuarto') || textoFase.includes('octavo') || 
        textoFase.includes('playoff') || textoFase.includes('llave')) {
        return true;
    }
    return false;
}

function renderizarTablaFixture(partidos) {
    const tbody = document.getElementById('tabla-fixture-body');
    if (!tbody) return;

    // La tabla superior debe mostrar ÚNICAMENTE partidos de la Fase Regular / Todos contra Todos (excluye playoffs)
    const partidosRegulares = (partidos || []).filter(p => !esPartidoPlayoff(p));

    if (partidosRegulares.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#888; padding:24px;">No hay partidos de fase regular programados en este torneo. ¡Usa el botón de Generar Fixture Automático o agrega uno manual!</td></tr>`;
        return;
    }

    tbody.innerHTML = partidosRegulares.map(p => {
        const id = p.id || p.Id;
        const jornada = p.jornada || p.Jornada || 1;
        const textoJornada = `<span style="font-weight:700; color:#aaa;">Fecha ${jornada}</span>`;
        
        // Nombres reales garantizados mediante JOIN o catálogo de equipos
        const local = p.equipoLocalNombre || p.EquipoLocalNombre || (p.equipoLocal ? p.equipoLocal.nombre : obtenerNombreEquipo(p.equipoLocalId || p.EquipoLocalId));
        const visit = p.equipoVisitanteNombre || p.EquipoVisitanteNombre || (p.equipoVisitante ? p.equipoVisitante.nombre : obtenerNombreEquipo(p.equipoVisitanteId || p.EquipoVisitanteId));
        const cancha = p.canchaNombre || p.CanchaNombre || obtenerNombreCancha(p.canchaId || p.CanchaId);
        
        const fechaHoraStr = formatearFechaHora(p.fechaHora || p.FechaHora);
        const puntosLocal = p.puntosLocal ?? p.PuntosLocal ?? 0;
        const puntosVisit = p.puntosVisitante ?? p.PuntosVisitante ?? 0;
        const estado = (p.estado || p.Estado || 'PROGRAMADO').toUpperCase();
        const estadoDetalle = p.estadoDetalle || p.EstadoDetalle || '';
        const minuto = p.minutoActual ?? p.MinutoActual;

        const fhVal = p.fechaHora || p.FechaHora;
        const esFhDef = fhVal && !fhVal.startsWith('2099');
        const dtLocal = parsearFechaHoraLocal(fhVal);
        const yaPasoHora = esFhDef && dtLocal && (dtLocal.getTime() <= (Date.now() - 60000));
        const esNoIniciado = (estado === 'PROGRAMADO' || estado === 'PENDIENTE' || !estado);
        const estaRetrasado = (estado !== 'FINALIZADO' && estado !== 'EN_JUEGO' && estado !== 'EN VIVO') &&
            (esFhDef ? (yaPasoHora && (estado === 'RETRASADO' || estadoDetalle.toUpperCase() === 'RETRASADO' || esNoIniciado)) : (estado === 'RETRASADO' || estadoDetalle.toUpperCase() === 'RETRASADO'));
        const esSuspendido = (estado === 'SUSPENDIDO') || (estadoDetalle.toUpperCase() === 'SUSPENDIDO');

        let badgeClass = 'badge-programado';
        let badgeTexto = estado;
        if (esSuspendido) {
            badgeClass = 'badge-suspendido';
            badgeTexto = '⚠️ SUSPENDIDO';
        } else if (estado === 'EN_JUEGO' || estado === 'EN VIVO') {
            badgeClass = 'badge-vivo';
            const depPlayoff = obtenerDeporteDePartido(p);
            const textoVivo = calcularTiempoEnVivoAdmin(p, depPlayoff);
            badgeTexto = `🔴 ${textoVivo}`;
        } else if (estado === 'FINALIZADO') {
            badgeClass = 'badge-finalizado';
            badgeTexto = 'FINALIZADO';
        } else if (estaRetrasado) {
            badgeClass = 'badge-retrasado';
            badgeTexto = '⏳ RETRASADO';
        }

        // Columna de acciones: EXCLUSIVAMENTE Editar y Eliminar (sin botón Mesa)
        return `
            <tr>
                <td><strong>#${id}</strong></td>
                <td>${textoJornada}</td>
                <td>${fechaHoraStr}</td>
                <td><strong style="color:#ddd;">${cancha}</strong></td>
                <td>
                    <div style="font-size:13px;">
                        <strong style="color:#fff;">${local}</strong> <span style="color:#ff0044; font-weight:700;">vs</span> <strong style="color:#fff;">${visit}</strong>
                    </div>
                </td>
                <td>
                    <span style="font-size:15px; font-weight:800; color:#ff0044;">${puntosLocal} - ${puntosVisit}</span>
                </td>
                <td><span class="badge-status ${badgeClass}">${badgeTexto}</span></td>
                <td style="text-align: center;">
                    <div style="display:flex; justify-content:center; gap:6px;">
                        <button class="btn-action-edit" onclick="editarPartidoManual(${id})" title="Editar Fecha/Hora o Cancha">✏️ Editar</button>
                        <button class="btn-action-del" onclick="eliminarPartido(${id})" title="Eliminar Partido">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function parsearFechaHoraLocal(fh) {
    if (!fh) return null;
    if (fh instanceof Date) return fh;
    const s = String(fh).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) {
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const day = parseInt(m[3], 10);
    const hour = m[4] !== undefined ? parseInt(m[4], 10) : 0;
    const min = m[5] !== undefined ? parseInt(m[5], 10) : 0;
    const sec = m[6] !== undefined ? parseInt(m[6], 10) : 0;
    return new Date(year, month, day, hour, min, sec);
}

function normalizarHora24(horaStr) {
    if (!horaStr) return '00:00:00';
    horaStr = String(horaStr).trim();
    const matchAmPm = horaStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|a\.?\s*m\.?|p\.?\s*m\.?)$/i);
    if (matchAmPm) {
        let h = parseInt(matchAmPm[1], 10);
        const m = matchAmPm[2].padStart(2, '0');
        const s = (matchAmPm[3] || '00').padStart(2, '0');
        const isPm = matchAmPm[4].toLowerCase().includes('p');
        if (isPm && h < 12) h += 12;
        if (!isPm && h === 12) h = 0;
        return `${String(h).padStart(2, '0')}:${m}:${s}`;
    }
    const match24 = horaStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match24) {
        const h = String(parseInt(match24[1], 10)).padStart(2, '0');
        const m = match24[2].padStart(2, '0');
        const s = (match24[3] || '00').padStart(2, '0');
        return `${h}:${m}:${s}`;
    }
    return '00:00:00';
}

function esFechaPorDefinir(fh) {
    if (!fh) return true;
    const str = String(fh).trim();
    return str.includes('2099') || str.includes('1970') || str.startsWith('0001') || str.toUpperCase().includes('DEFINIR') || str.toUpperCase().includes('TBD');
}

function formatearFechaHora(fechaIso) {
    if (!fechaIso || esFechaPorDefinir(fechaIso)) return `<span style="background: #2a2024; color: #f59e0b; border: 1px solid #d97706; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; gap: 4px;">⏳ POR DEFINIR</span>`;
    try {
        const d = parsearFechaHoraLocal(fechaIso);
        if (!d || isNaN(d.getTime())) return fechaIso;
        const opciones = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };
        return d.toLocaleDateString('es-CO', opciones);
    } catch {
        return fechaIso;
    }
}

// Botón Generar Fixture Automático
document.getElementById('btn-generar-fixture')?.addEventListener('click', async () => {
    const torneoId = document.getElementById('fixture-torneo-select')?.value;
    if (!torneoId) {
        mostrarToast('Selecciona un torneo primero.', 'error');
        return;
    }

    // Obtener y validar el número de vueltas seleccionado (1 a 4)
    const vueltasSelect = document.getElementById('fixture-vueltas-select');
    let vueltas = parseInt(vueltasSelect?.value) || 1;
    if (vueltas < 1 || vueltas > 4) vueltas = 1;

    const t = state.torneos.find(x => (x.id || x.Id) == torneoId);
    const nombreTorneo = t ? (t.nombre || t.Nombre) : `#${torneoId}`;
    const textoVueltas = vueltas === 1 ? '1 Vuelta (Ida)' : (vueltas === 2 ? '2 Vueltas (Ida y Vuelta)' : `${vueltas} Vueltas`);

    const ok = await mostrarConfirmacionModal(
        `¿Generar fixture Round-Robin automático (${textoVueltas}) para "${nombreTorneo}"?\n\nEsto calculará todos los enfrentamientos para ${vueltas} vuelta(s), asignará jornadas consecutivas con inversión de localías y la cancha sede institucional automáticamente.`,
        '📅 Generar Fixture Round-Robin'
    );
    if (!ok) return;

    try {
        mostrarToast(`Generando fixture de ${vueltas} vuelta(s), por favor espera...`, 'info');
        const res = await fetch(`${API_URL}/partidos/generar-fixture/${torneoId}?numeroDeVueltas=${vueltas}`, {
            method: 'POST'
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.mensaje || 'Error al generar fixture');
        }

        mostrarToast(data.mensaje || `¡Fixture de ${vueltas} vuelta(s) generado correctamente!`, 'exito');
        await cargarPartidosFixture(torneoId);
    } catch (err) {
        console.error('Error generando fixture:', err);
        mostrarToast(err.message, 'error');
    }
});

// Toggle Formulario Partido Manual
document.getElementById('btn-nuevo-partido-manual')?.addEventListener('click', () => {
    const container = document.getElementById('form-partido-container');
    if (!container) return;
    container.classList.remove('hidden');
    limpiarFormPartido();
    document.getElementById('partido-form-title').textContent = '➕ Programar Nuevo Partido Manual';
    container.scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('btn-cancelar-partido')?.addEventListener('click', () => {
    document.getElementById('form-partido-container')?.classList.add('hidden');
    limpiarFormPartido();
});

// Eventos para Fases Finales / Playoffs (Cuadro)
document.getElementById('btn-configurar-playoffs')?.addEventListener('click', async () => {
    const panel = document.getElementById('panel-config-playoffs');
    if (!panel) return;
    panel.classList.remove('hidden');
    await generarFormularioLlavesPlayoffs();
    panel.scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('btn-cancelar-playoffs')?.addEventListener('click', () => {
    document.getElementById('panel-config-playoffs')?.classList.add('hidden');
});

document.getElementById('playoff-ronda-inicial')?.addEventListener('change', async () => {
    await generarFormularioLlavesPlayoffs();
});

document.getElementById('playoff-formato-serie')?.addEventListener('change', async () => {
    await generarFormularioLlavesPlayoffs();
});

document.getElementById('btn-sembrar-posiciones')?.addEventListener('click', async () => {
    await sembrarPlayoffsSegunPosiciones();
});

document.getElementById('btn-publicar-playoffs')?.addEventListener('click', async () => {
    await publicarPlayoffsHabilitarCuadro();
});

function obtenerTorneoSeleccionadoId() {
    const sel = document.getElementById('select-torneo-programacion') || 
                document.getElementById('fixture-torneo-select') ||
                document.getElementById('select-torneo-fixture');
    return (sel && sel.value) ? sel.value : state.torneoSeleccionadoId;
}
window.obtenerTorneoSeleccionadoId = obtenerTorneoSeleccionadoId;

document.getElementById('btn-sincronizar-playoffs')?.addEventListener('click', async () => {
    const torneoId = obtenerTorneoSeleccionadoId();
    await sincronizarFasesSiguientesTorneo(torneoId);
});

document.getElementById('btn-sincronizar-playoffs-tabla')?.addEventListener('click', async () => {
    const torneoId = obtenerTorneoSeleccionadoId();
    await sincronizarFasesSiguientesTorneo(torneoId);
});

function limpiarFormPartido() {
    const inputId = document.getElementById('partido-id');
    if (inputId) {
        inputId.value = '';
        delete inputId.dataset.puntosLocal;
        delete inputId.dataset.puntosVisitante;
    }
    document.getElementById('partido-jornada').value = '1';
    document.getElementById('partido-local').value = '';
    document.getElementById('partido-visitante').value = '';
    document.getElementById('partido-estado').value = 'PROGRAMADO';
    
    // Default fecha/hora: hoy dentro de 1 hora
    const hoy = new Date();
    hoy.setHours(hoy.getHours() + 1, 0, 0, 0);
    const pad = n => String(n).padStart(2, '0');
    const localIso = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}T${pad(hoy.getHours())}:${pad(hoy.getMinutes())}`;
    document.getElementById('partido-fechahora').value = localIso;
}

// Guardar Partido Manual (Crear o Editar)
document.getElementById('form-partido')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('partido-id').value;
    const torneoId = parseInt(document.getElementById('fixture-torneo-select').value);
    const jornada = parseInt(document.getElementById('partido-jornada').value) || 1;
    const localId = parseInt(document.getElementById('partido-local').value);
    const visitId = parseInt(document.getElementById('partido-visitante').value);
    const canchaId = parseInt(document.getElementById('partido-cancha').value);
    const fechaHora = document.getElementById('partido-fechahora').value;
    const estado = document.getElementById('partido-estado').value;

    if (!torneoId || !localId || !visitId || !canchaId || !fechaHora) {
        mostrarToast('Por favor completa todos los campos obligatorios del partido.', 'error');
        return;
    }

    if (localId === visitId) {
        mostrarToast('El equipo local y visitante no pueden ser el mismo.', 'error');
        return;
    }

    // Si se está editando un partido existente (id > 0), conservar los puntos actuales de BD / memoria
    let puntosLocalActual = 0;
    let puntosVisitanteActual = 0;

    if (id) {
        const inputId = document.getElementById('partido-id');
        if (inputId && inputId.dataset.puntosLocal !== undefined && inputId.dataset.puntosVisitante !== undefined) {
            puntosLocalActual = Number(inputId.dataset.puntosLocal) || 0;
            puntosVisitanteActual = Number(inputId.dataset.puntosVisitante) || 0;
        } else {
            try {
                const resActual = await fetch(`${API_URL}/partidos/${id}`);
                if (resActual.ok) {
                    const pActual = await resActual.json();
                    puntosLocalActual = Number(pActual.puntosLocal ?? pActual.PuntosLocal ?? pActual.puntos_local ?? 0);
                    puntosVisitanteActual = Number(pActual.puntosVisitante ?? pActual.PuntosVisitante ?? pActual.puntos_visitante ?? 0);
                }
            } catch (errPre) {
                console.warn('No se pudo consultar el marcador previo del partido:', errPre);
            }
        }
    }

    const payload = {
        id: id ? parseInt(id) : 0,
        torneoId: torneoId,
        equipoLocalId: localId,
        equipoVisitanteId: visitId,
        canchaId: canchaId,
        jornada: jornada,
        fechaHora: (fechaHora.length === 16 ? `${fechaHora}:00` : fechaHora),
        estado: estado,
        estadoDetalle: (estado === 'FINALIZADO') ? 'FINALIZADO' : (estado === 'EN_JUEGO' ? '1T' : 'PROGRAMADO'),
        puntosLocal: id ? puntosLocalActual : 0,
        puntosVisitante: id ? puntosVisitanteActual : 0,
        minutoActual: (estado === 'EN_JUEGO') ? 1 : null
    };

    try {
        let res;
        if (id) {
            res = await fetch(`${API_URL}/partidos/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`${API_URL}/partidos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.mensaje || 'Error al guardar el partido');
        }

        mostrarToast(id ? 'Partido actualizado.' : 'Partido programado exitosamente.', 'exito');
        document.getElementById('form-partido-container')?.classList.add('hidden');
        limpiarFormPartido();
        await cargarPartidosFixture(torneoId);
    } catch (err) {
        console.error('Error guardando partido:', err);
        mostrarToast(err.message, 'error');
    }
});

window.editarPartidoManual = async function(id) {
    try {
        const res = await fetch(`${API_URL}/partidos/${id}`);
        if (!res.ok) throw new Error('No se pudo cargar el partido');
        const p = await res.json();

        const container = document.getElementById('form-partido-container');
        container.classList.remove('hidden');
        document.getElementById('partido-form-title').textContent = `✏️ Editando Partido #${id}`;

        const inputId = document.getElementById('partido-id');
        inputId.value = id;
        inputId.dataset.puntosLocal = (p.puntosLocal ?? p.PuntosLocal ?? p.puntos_local ?? 0);
        inputId.dataset.puntosVisitante = (p.puntosVisitante ?? p.PuntosVisitante ?? p.puntos_visitante ?? 0);
        document.getElementById('partido-jornada').value = p.jornada || p.Jornada || 1;
        document.getElementById('partido-local').value = p.equipoLocalId || p.EquipoLocalId;
        document.getElementById('partido-visitante').value = p.equipoVisitanteId || p.EquipoVisitanteId;
        document.getElementById('partido-cancha').value = p.canchaId || p.CanchaId;
        document.getElementById('partido-estado').value = p.estado || p.Estado || 'PROGRAMADO';

        const fhManual = p.fechaHora || p.FechaHora;
        const fhManualStr = fhManual ? String(fhManual).trim() : '';
        if (fhManual && !fhManualStr.includes('2099') && !esFechaPorDefinir(fhManual)) {
            const m = fhManualStr.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
            if (m) {
                document.getElementById('partido-fechahora').value = `${m[1]}T${m[2]}`;
            } else {
                const d = parsearFechaHoraLocal(fhManual);
                if (d && !isNaN(d.getTime())) {
                    const pad = n => String(n).padStart(2, '0');
                    document.getElementById('partido-fechahora').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                } else {
                    document.getElementById('partido-fechahora').value = '';
                }
            }
        } else {
            document.getElementById('partido-fechahora').value = '';
        }

        container.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
        console.error('Error editando partido:', err);
        mostrarToast(err.message, 'error');
    }
};

window.eliminarPartido = async function(id) {
    const ok = await mostrarConfirmacionModal(
        `¿Eliminar definitivamente el partido #${id}?`,
        '🗑️ Eliminar Partido'
    );
    if (!ok) return;

    try {
        const res = await fetch(`${API_URL}/partidos/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar partido');
        mostrarToast('Partido eliminado.', 'exito');

        const torSelect = document.getElementById('fixture-torneo-select');
        if (torSelect && torSelect.value) {
            await cargarPartidosFixture(torSelect.value);
        }
    } catch (err) {
        console.error('Error eliminando partido:', err);
        mostrarToast(err.message, 'error');
    }
};

// ============================================================================
// PESTAÑA 4: MESA TÉCNICA EN VIVO (VISUAL CON TARJETAS Y AUTO-POLLING)
// ============================================================================

function normalizarDeporte(nombre) {
    if (!nombre) return 'FUTBOL';
    const n = nombre.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (n.includes('SOFTBOL') || n.includes('SOFTH')) return 'SOFTBOL';
    if (n.includes('BEISBOL') || n.includes('BASEBALL')) return 'BEISBOL';
    if (n.includes('VOLEIBOL') || n.includes('VOLLEY')) return 'VOLEIBOL';
    if (n.includes('BALONCESTO') || n.includes('BASKET')) return 'BALONCESTO';
    if (n.includes('MICRO') || n.includes('SALON') || n.includes('FUTSAL')) return 'MICROFUTBOL';
    if (n.includes('FUTBOL')) return 'FUTBOL';
    return 'FUTBOL';
}

function obtenerDeporteDePartido(partido) {
    if (!partido) return 'FUTBOL';

    const nomDep = partido.deporteNombre || partido.DeporteNombre || (partido.deporte && (partido.deporte.nombre || partido.deporte.Nombre));
    if (nomDep) {
        return normalizarDeporte(nomDep);
    }

    const torId = partido.torneoId || partido.TorneoId;
    if (torId && Array.isArray(state.torneos)) {
        const torneo = state.torneos.find(t => (t.id || t.Id) == torId);
        if (torneo) {
            const nomTorDep = torneo.deporteNombre || torneo.DeporteNombre || obtenerNombreDeporte(torneo);
            if (nomTorDep && nomTorDep !== 'Deporte') {
                return normalizarDeporte(nomTorDep);
            }
        }
    }

    const depId = partido.deporteId || partido.DeporteId || (partido.deporte && (partido.deporte.id || partido.deporte.Id));
    if (depId == 16) return 'MICROFUTBOL';
    if (depId == 1) return 'FUTBOL';
    if (depId == 2) return 'BALONCESTO';
    if (depId == 3) return 'BEISBOL';
    if (depId == 4) return 'SOFTBOL';
    if (depId == 5) return 'VOLEIBOL';

    return 'FUTBOL';
}

function esPartidoDeHoyOEnJuego(p) {
    const estado = (p.estado || p.Estado || '').toUpperCase();
    if (estado === 'EN_JUEGO' || estado === 'EN VIVO' || estado === 'RETRASADO' || estado === 'SUSPENDIDO') return true;

    const fechaStr = p.fechaHora || p.FechaHora;
    if (!fechaStr) return false;

    const d = new Date(fechaStr);
    const hoy = new Date();
    return d.getFullYear() === hoy.getFullYear() &&
           d.getMonth() === hoy.getMonth() &&
           d.getDate() === hoy.getDate();
}

async function cargarTarjetasMesaEnVivo(mostrarLoading = true) {
    const container = document.getElementById('mesa-lista-cards');
    if (!container) return;

    if (mostrarLoading) {
        container.innerHTML = `<p style="text-align:center; color:#888; padding:30px;">Cargando partidos activos de hoy...</p>`;
    }

    try {
        const res = await fetch(`${API_URL}/partidos`);
        if (!res.ok) throw new Error('Error al obtener partidos');
        const todosPartidos = await res.json();
        state.partidos = todosPartidos;

        // Registrar / actualizar automáticamente todos los partidos EN_JUEGO en el Gestor Global
        todosPartidos.forEach(p => {
            const pId = p.id || p.Id;
            const est = (p.estado || p.Estado || '').toUpperCase();
            if (est === 'EN_JUEGO' || est === 'EN VIVO') {
                if (!gestorPartidosEnJuego.has(String(pId))) {
                    gestorPartidosEnJuego.set(String(pId), p);
                } else {
                    const ex = gestorPartidosEnJuego.get(String(pId));
                    Object.assign(ex, p);
                }
            } else if (est === 'FINALIZADO' || est === 'TERMINADO') {
                gestorPartidosEnJuego.delete(String(pId));
            }
        });

        const mostrarTodos = document.getElementById('chk-mostrar-todos-partidos-mesa')?.checked;
        
        // Filtrar partidos: ÚNICAMENTE los que están en juego ('EN_JUEGO') o son de HOY (salvo checkbox)
        let partidosFiltrados = mostrarTodos 
            ? todosPartidos 
            : todosPartidos.filter(p => esPartidoDeHoyOEnJuego(p));

        // Restricción por rol PLANILLERO: solo su torneo asignado
        const sesion = obtenerUsuarioSesion();
        const rol = (sesion?.rol || sesion?.Rol || '').toUpperCase();
        const torIdAsignado = sesion?.torneoId ?? sesion?.TorneoId;
        if (rol === 'PLANILLERO' && torIdAsignado) {
            partidosFiltrados = partidosFiltrados.filter(p => {
                const pTorId = p.torneoId || p.TorneoId;
                return String(pTorId) === String(torIdAsignado);
            });
        }

        if (partidosFiltrados.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; background: #141418; border-radius: 8px; border: 1px dashed #2a2a34;">
                    <div style="font-size: 32px; margin-bottom: 10px;">⏱️</div>
                    <h4 style="margin: 0 0 8px; color: #fff;">No hay partidos en juego ni programados para hoy</h4>
                    <p style="font-size: 13px; color: #888; max-width: 480px; margin: 0 auto 16px;">
                        Actualmente no hay encuentros activos en las canchas de Sincelejo. Puedes activar la casilla "Mostrar todos los partidos" arriba o programar nuevos partidos en la pestaña Fixture.
                    </p>
                </div>
            `;
            return;
        }

        // Agrupar partidos por Torneo
        const gruposPorTorneo = {};
        partidosFiltrados.forEach(p => {
            const torId = p.torneoId || p.TorneoId;
            const torNom = p.torneoNombre || p.TorneoNombre || (state.torneos.find(t => (t.id || t.Id) == torId)?.nombre) || `Torneo #${torId}`;
            const depNom = p.deporteNombre || p.DeporteNombre || '';
            
            if (!gruposPorTorneo[torId]) {
                gruposPorTorneo[torId] = {
                    id: torId,
                    nombre: torNom,
                    deporte: depNom,
                    partidos: []
                };
            }
            gruposPorTorneo[torId].partidos.push(p);
        });

        // Renderizar grupos y tarjetas
        container.innerHTML = Object.values(gruposPorTorneo).map(grupo => {
            const cardsHtml = grupo.partidos.map(p => {
                const id = p.id || p.Id;
                const local = p.equipoLocalNombre || p.EquipoLocalNombre || (p.equipoLocal ? p.equipoLocal.nombre : obtenerNombreEquipo(p.equipoLocalId || p.EquipoLocalId));
                const visit = p.equipoVisitanteNombre || p.EquipoVisitanteNombre || (p.equipoVisitante ? p.equipoVisitante.nombre : obtenerNombreEquipo(p.equipoVisitanteId || p.EquipoVisitanteId));
                const cancha = p.canchaNombre || p.CanchaNombre || obtenerNombreCancha(p.canchaId || p.CanchaId);
                const puntosLocal = p.puntosLocal ?? p.PuntosLocal ?? 0;
                const puntosVisit = p.puntosVisitante ?? p.PuntosVisitante ?? 0;
                const estado = p.estado || p.Estado || 'PROGRAMADO';
                const detalle = p.estadoDetalle || p.EstadoDetalle || '';
                const minuto = p.minutoActual ?? p.MinutoActual;
                const depNorm = obtenerDeporteDePartido(p);

                const fhVal = p.fechaHora || p.FechaHora;
                const esFhDef = fhVal && !fhVal.startsWith('2099');
                const dtLocal = parsearFechaHoraLocal(fhVal);
                const yaPasoHora = esFhDef && dtLocal && (dtLocal.getTime() <= (Date.now() - 60000));
                const esNoIniciado = (estado === 'PROGRAMADO' || estado === 'PENDIENTE' || !estado);
                const estaRetrasado = (estado !== 'FINALIZADO' && estado !== 'EN_JUEGO' && estado !== 'EN VIVO') &&
                    (esFhDef ? (yaPasoHora && (estado === 'RETRASADO' || detalle.toUpperCase() === 'RETRASADO' || esNoIniciado)) : (estado === 'RETRASADO' || detalle.toUpperCase() === 'RETRASADO'));
                const esSuspendido = (estado === 'SUSPENDIDO') || (detalle.toUpperCase() === 'SUSPENDIDO');

                let badgeEstado = '';
                if (esSuspendido) {
                    badgeEstado = `<span class="badge-status badge-suspendido">⚠️ SUSPENDIDO</span>`;
                } else if (estado === 'FINALIZADO') {
                    badgeEstado = `<span class="badge-status badge-finalizado">🏁 FINALIZADO</span>`;
                } else if (estado === 'EN_JUEGO' || estado === 'EN VIVO') {
                    const textoVivo = calcularTiempoEnVivoAdmin(p, depNorm);
                    badgeEstado = `<span class="badge-status badge-vivo">🔴 EN VIVO &bull; ${textoVivo}</span>`;
                } else if (estaRetrasado) {
                    badgeEstado = `<span class="badge-status badge-retrasado">⏳ RETRASADO</span>`;
                } else {
                    const horaStr = formatearHora(p.fechaHora || p.FechaHora);
                    badgeEstado = `<span class="badge-status badge-programado">📅 ${horaStr}</span>`;
                }

                return `
                    <div class="mesa-match-card">
                        <div>
                            <div class="mesa-card-top">
                                <span class="mesa-card-cancha">🏟️ ${cancha}</span>
                                ${badgeEstado}
                            </div>
                            <div class="mesa-card-teams">
                                <div class="mesa-card-team-row">
                                    <span class="mesa-card-team-name">${local}</span>
                                    <span class="mesa-card-team-score">${puntosLocal}</span>
                                </div>
                                <div class="mesa-card-team-row">
                                    <span class="mesa-card-team-name">${visit}</span>
                                    <span class="mesa-card-team-score">${puntosVisit}</span>
                                </div>
                            </div>
                        </div>
                        <button type="button" class="mesa-card-btn-abrir" onclick="abrirMesaTactil(${id})">
                            ⚡ Abrir Mesa Técnica
                        </button>
                    </div>
                `;
            }).join('');

            return `
                <div class="mesa-torneo-group">
                    <div class="mesa-torneo-header">
                        <div class="mesa-torneo-title">
                            🏆 ${grupo.nombre}
                            ${grupo.deporte ? `<span style="font-size:12px; color:#ff0044; font-weight:700;">(${grupo.deporte})</span>` : ''}
                        </div>
                        <span style="font-size: 11px; color: #888;">${grupo.partidos.length} partido(s)</span>
                    </div>
                    <div class="mesa-cards-grid">
                        ${cardsHtml}
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Error cargando tarjetas de mesa técnica:', err);
        container.innerHTML = `<p style="text-align:center; color:#ff4444; padding:20px;">No fue posible cargar los partidos en vivo.</p>`;
    }
}

function formatearHora(fechaIso) {
    if (!fechaIso) return '-';
    try {
        const d = parsearFechaHoraLocal(fechaIso);
        if (!d || isNaN(d.getTime())) return fechaIso;
        return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return fechaIso;
    }
}

function calcularTiempoEnVivoAdmin(p, depNorm = '') {
    if (!p) return 'EN VIVO';
    const estado = (p.estado || p.Estado || '').toUpperCase();
    const estadoDetalle = (p.estadoDetalle || p.EstadoDetalle || '').trim().toUpperCase();
    if (estado === 'SUSPENDIDO' || estadoDetalle === 'SUSPENDIDO') return '⚠️ SUSPENDIDO';
    if (estado === 'RETRASADO' || estadoDetalle === 'RETRASADO') return '⏳ RETRASADO';
    if (estado === 'FINALIZADO') return 'FINALIZADO';
    if (estado !== 'EN_JUEGO' && estado !== 'EN VIVO' && estado !== 'JUGANDO') return estado || 'PROGRAMADO';

    const dep = (depNorm || obtenerDeporteDePartido(p) || '').toUpperCase();
    const esBaloncesto = dep.includes('BALONCESTO') || dep.includes('BASKET');
    const esMicro = dep.includes('MICRO') || dep.includes('SALÓN') || dep.includes('SALON');
    const esFutbol = !esMicro && (dep.includes('FUTBOL') || dep.includes('FÚTBOL'));
    const esBeisbolOSoftbol = dep.includes('BEISBOL') || dep.includes('BÉISBOL') || dep.includes('SOFTBOL');
    const esVoleibol = dep.includes('VOLEIBOL') || dep.includes('VOLEY');

    const minutoActual = p.minutoActual ?? p.MinutoActual;
    const tieneMinuto = (minutoActual !== null && minutoActual !== undefined && minutoActual !== '' && !isNaN(minutoActual) && Number(minutoActual) >= 0);

    // Voleibol / Béisbol / Sóftbol
    if (esVoleibol) return estadoDetalle || 'SET 1';
    if (esBeisbolOSoftbol) return estadoDetalle || 'INNING 1';

    // Extras y Pausas universales
    if (estadoDetalle.includes('PENAL')) return 'PENALES';
    if (estadoDetalle.includes('OVERTIME') || estadoDetalle === 'OT' || estadoDetalle.includes('PRORROGA') || estadoDetalle.includes('PRÓRROGA')) {
        return tieneMinuto ? `OT ${minutoActual}'` : 'PRÓRROGA (OT)';
    }
    if (estadoDetalle.includes('EXTRA')) return tieneMinuto ? `EXTRA ${minutoActual}'` : 'TIEMPO EXTRA';
    if (estadoDetalle === 'PAUSA' || estadoDetalle === 'PAUSA Q1' || estadoDetalle === 'PAUSA Q3') return estadoDetalle;
    if (estadoDetalle === 'T. MUERTO' || estadoDetalle === 'TIEMPO MUERTO') return 'T. MUERTO';
    if (estadoDetalle === 'ENTRETIEMPO' || estadoDetalle === 'DESCANSO') return estadoDetalle;

    // Minutos reales transcurridos
    const fechaHoraStr = p.fechaHora || p.FechaHora;
    let minutosReales = 0;
    if (fechaHoraStr && !fechaHoraStr.startsWith('2099')) {
        const diffMs = Date.now() - new Date(fechaHoraStr).getTime();
        minutosReales = Math.max(0, Math.floor(diffMs / 60000));
    }

    if (esFutbol) {
        if (estadoDetalle === 'DESCANSO' || estadoDetalle === 'ENTRETIEMPO') return 'DESCANSO';
        const pId = p.id || p.Id;
        const timerFutbol = pId ? obtenerEstadoTimerFutbol(pId) : null;
        let minFutbol = tieneMinuto ? Number(minutoActual) : 0;
        if (timerFutbol && timerFutbol.running && timerFutbol.startTimestamp) {
            const trans = Math.floor((Date.now() - timerFutbol.startTimestamp) / 1000);
            const totalSeg = (timerFutbol.segundosNetos !== undefined ? timerFutbol.segundosNetos : 0) + trans;
            minFutbol = Math.floor(totalSeg / 60);
        }
        if (estadoDetalle === '1T') {
            const m = Math.min(45, Math.max(0, minFutbol));
            return `1T ${m}'`;
        }
        if (estadoDetalle === '2T') {
            const m = Math.min(90, Math.max(45, minFutbol));
            return `2T ${m}'`;
        }
        return `1T ${Math.min(45, Math.max(0, minFutbol))}'`;
    }

    if (esMicro) {
        if (estadoDetalle === 'DESCANSO' || estadoDetalle === 'ENTRETIEMPO') return 'DESCANSO';
        const pId = p.id || p.Id;
        const timerMicro = pId ? obtenerEstadoTimerMicrofutbol(pId) : null;
        let minMicro = tieneMinuto ? Number(minutoActual) : 0;
        if (timerMicro && timerMicro.running && timerMicro.startTimestamp) {
            const trans = Math.floor((Date.now() - timerMicro.startTimestamp) / 1000);
            const totalSeg = (timerMicro.segundosNetos !== undefined ? timerMicro.segundosNetos : 0) + trans;
            minMicro = Math.floor(totalSeg / 60);
        }
        if (estadoDetalle === '1T') {
            const m = Math.min(20, Math.max(0, minMicro));
            return `1T ${m}'`;
        }
        if (estadoDetalle === '2T') {
            const m = Math.min(40, Math.max(20, minMicro));
            return `2T ${m}'`;
        }
        return `1T ${Math.min(20, Math.max(0, minMicro))}'`;
    }

    if (esBaloncesto) {
        if (estadoDetalle === 'TIEMPO MUERTO' || estadoDetalle === 'T. MUERTO') {
            return tieneMinuto ? `T. MUERTO (${minutoActual}')` : 'TIEMPO MUERTO';
        }
        if (estadoDetalle === 'PAUSA') {
            return tieneMinuto ? `PAUSA (${minutoActual}')` : 'PAUSA';
        }
        if (estadoDetalle === 'PAUSA Q1') return 'PAUSA Q1';
        if (estadoDetalle === 'DESCANSO' || estadoDetalle === 'MT') return 'DESCANSO';
        if (estadoDetalle === 'PAUSA Q3') return 'PAUSA Q3';
        if (estadoDetalle.includes('OVERTIME') || estadoDetalle === 'OT' || estadoDetalle.includes('PRORROGA') || estadoDetalle.includes('PRÓRROGA')) {
            return tieneMinuto ? `OT ${minutoActual}'` : 'PRÓRROGA (OT)';
        }
        if (estadoDetalle === 'Q1' || estadoDetalle === 'Q2' || estadoDetalle === 'Q3' || estadoDetalle === 'Q4') {
            return tieneMinuto ? `${estadoDetalle} ${minutoActual}'` : estadoDetalle;
        }
        if (tieneMinuto) return `${estadoDetalle || 'Q1'} ${minutoActual}'`;
        return estadoDetalle || 'Q1';
    }

    if (estadoDetalle === 'DESCANSO' || estadoDetalle === 'ENTRETIEMPO') return estadoDetalle;
    if (tieneMinuto) return `${estadoDetalle || 'EN VIVO'} ${minutoActual}'`;
    return estadoDetalle || 'EN VIVO';
}

function configurarInputMinutoIncidencias() {
    const elMinuto = document.getElementById('evento-minuto') || document.getElementById('incidencia_minuto');
    if (!elMinuto) return;

    elMinuto.type = 'text';
    elMinuto.removeAttribute('readonly');
    elMinuto.removeAttribute('disabled');
    elMinuto.removeAttribute('pattern');
    elMinuto.removeAttribute('maxlength');
    elMinuto.readOnly = false;
    elMinuto.disabled = false;
    elMinuto.style.pointerEvents = 'auto';
    elMinuto.style.cursor = 'text';
    elMinuto.style.textAlign = 'center';

    elMinuto.onkeydown = null;
    elMinuto.onkeypress = null;
    elMinuto.onkeyup = null;

    if (!elMinuto.dataset.listenersConfigurados) {
        elMinuto.dataset.listenersConfigurados = 'true';

        elMinuto.addEventListener('focus', function() {
            this.select();
        });
        elMinuto.addEventListener('click', function() {
            this.select();
        });

        elMinuto.addEventListener('input', function() {
            this.value = this.value.replace(/[^0-9]/g, '').slice(0, 3);
        });
    }
}
window.configurarInputMinutoIncidencias = configurarInputMinutoIncidencias;

function configurarEventosMesa() {
    // Botón refrescar lista de tarjetas
    document.getElementById('btn-refrescar-lista-mesa')?.addEventListener('click', () => {
        cargarTarjetasMesaEnVivo(true);
        mostrarToast('Listado de partidos actualizado.', 'info');
    });

    // Checkbox mostrar todos los partidos
    document.getElementById('chk-mostrar-todos-partidos-mesa')?.addEventListener('change', () => {
        cargarTarjetasMesaEnVivo(true);
    });

    // Botón volver de la mesa táctil a la lista de tarjetas
    document.getElementById('btn-volver-lista-mesa')?.addEventListener('click', () => {
        cerrarMesaTactil();
    });

    // Botón manual sincronizar dentro de la mesa activa
    document.getElementById('btn-recargar-mesa')?.addEventListener('click', async () => {
        if (state.partidoActivoMesa) {
            const pId = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
            await sincronizarPartidoMesaEnVivo(pId);
            mostrarToast('Marcador sincronizado desde el servidor.', 'info');
        }
    });

    document.getElementById('btn-guardar-marcador')?.addEventListener('click', guardarMarcadorMesa);
    document.getElementById('btn-finalizar-partido-oficial')?.addEventListener('click', finalizarPartidoOficial);
    document.getElementById('form-evento')?.addEventListener('submit', registrarEventoMesa);

    // Habilitar edición libre de teclado en input de incidencias (Minuto / Periodo)
    configurarInputMinutoIncidencias();

    const inputMinutoMesa = document.getElementById('mesa-minuto-actual');
    if (inputMinutoMesa) {
        inputMinutoMesa.removeAttribute('readonly');
        inputMinutoMesa.removeAttribute('disabled');
        inputMinutoMesa.readOnly = false;
        inputMinutoMesa.disabled = false;
        inputMinutoMesa.style.pointerEvents = 'auto';
        inputMinutoMesa.style.cursor = 'text';
        inputMinutoMesa.addEventListener('keydown', (e) => {
            e.stopPropagation();
        });
    }

    // Controles Operativos Híbridos (Mesa Técnica)
    document.getElementById('btn-mesa-iniciar')?.addEventListener('click', iniciarPartidoMesa);
    document.getElementById('btn-mesa-suspender')?.addEventListener('click', suspenderPartidoMesa);
    document.getElementById('btn-mesa-reanudar')?.addEventListener('click', reanudarPartidoMesa);
    document.getElementById('btn-mesa-aplazar')?.addEventListener('click', aplazarPartidoMesa);
    document.getElementById('btn-mesa-fin-periodo')?.addEventListener('click', finalizarPeriodoMesa);
    document.getElementById('btn-mesa-siguiente-periodo')?.addEventListener('click', iniciarSiguientePeriodoMesa);
    document.getElementById('btn-mesa-pausa-reloj')?.addEventListener('click', pausarRelojMesa);
    document.getElementById('btn-mesa-tiempo-muerto')?.addEventListener('click', tiempoMuertoMesa);
    document.getElementById('btn-mesa-reanudar-reloj')?.addEventListener('click', reanudarRelojMesa);
    document.getElementById('btn-mesa-iniciar-ot')?.addEventListener('click', iniciarOTBaloncestoMesa);
    document.getElementById('btn-penal-gol')?.addEventListener('click', () => registrarTiroPenal('GOL'));
    document.getElementById('btn-penal-fallo')?.addEventListener('click', () => registrarTiroPenal('FALLO'));
    document.getElementById('btn-penal-deshacer')?.addEventListener('click', () => deshacerUltimoTiroPenal());
    document.getElementById('btn-mesa-guardar-penales')?.addEventListener('click', guardarPenalesMesa);
    document.getElementById('btn-mesa-cancelar-penales')?.addEventListener('click', cancelarPenalesMesa);

    // Evento de cambio en el selector de sub-estado para actualizar roles, minutos congelados y alertas
    document.getElementById('mesa-estado-detalle')?.addEventListener('change', (e) => {
        if (!state.partidoActivoMesa) return;
        state.partidoActivoMesa.estadoDetalle = e.target.value;
        const selDetEl = document.getElementById('mesa-estado-detalle');
        if (selDetEl) selDetEl.dataset.userModified = 'true';
        const depNorm = obtenerDeporteDePartido(state.partidoActivoMesa);
        if (depNorm === 'BEISBOL' || depNorm === 'SOFTBOL') {
            actualizarRolesBateadorLanzador(depNorm, e.target.value);
            verificarKnockoutBeisbolSoftbol();
        } else if (depNorm === 'VOLEIBOL') {
            actualizarDisplayVoleibolMesa();
        } else if (depNorm === 'BALONCESTO') {
            const inputMin = document.getElementById('mesa-minuto-actual');
            if (inputMin) {
                if (e.target.value === 'PAUSA Q1') inputMin.value = 10;
                else if (e.target.value === 'DESCANSO') inputMin.value = 20;
                else if (e.target.value === 'PAUSA Q3') inputMin.value = 30;
            }
            const estaPausado = (e.target.value === 'PAUSA' || e.target.value === 'TIEMPO MUERTO' || e.target.value === 'T. MUERTO' ||
                                 e.target.value === 'PAUSA Q1' || e.target.value === 'DESCANSO' || e.target.value === 'PAUSA Q3' ||
                                 e.target.value === 'PAUSA EXTRA TIEMPO' ||
                                 e.target.value === 'FINALIZADO' || e.target.value === 'SUSPENDIDO');
            if (estaPausado) {
                detenerCronometroBaloncesto(false);
            } else {
                iniciarCronometroBaloncesto(false);
            }
        } else if (depNorm === 'FUTBOL') {
            const inputMin = document.getElementById('mesa-minuto-actual');
            const pId = state.partidoActivoMesa ? (state.partidoActivoMesa.id || state.partidoActivoMesa.Id) : null;
            if (e.target.value === 'ENTRETIEMPO' || e.target.value === 'DESCANSO') {
                if (inputMin) inputMin.value = 45;
                detenerCronometroFutbol(false);
                segundosFutbolNeto = 2700;
                if (pId) {
                    guardarEstadoTimerFutbol(pId, {
                        running: false,
                        startTimestamp: null,
                        segundosNetos: 2700,
                        accumulatedSeconds: 2700,
                        minutoActual: 45,
                        periodo: 'DESCANSO'
                    });
                }
            } else if (e.target.value === '1T' || e.target.value === '2T') {
                const estGen = document.getElementById('mesa-estado-general')?.value || '';
                if (estGen === 'EN_JUEGO') {
                    iniciarCronometroFutbol(false);
                }
            } else if (e.target.value === 'PENALES') {
                detenerCronometroFutbol(false);
                const nomLoc = state.partidoActivoMesa?.equipoLocalNombre || state.partidoActivoMesa?.EquipoLocalNombre || 'Local';
                const nomVis = state.partidoActivoMesa?.equipoVisitanteNombre || state.partidoActivoMesa?.EquipoVisitanteNombre || 'Visitante';
                activarModuloPenalesMesa(nomLoc, nomVis);
            } else if (e.target.value === 'FINALIZADO' || e.target.value === 'SUSPENDIDO') {
                detenerCronometroFutbol(false);
            }
        } else if (depNorm === 'MICROFUTBOL') {
            const inputMin = document.getElementById('mesa-minuto-actual');
            const pId = state.partidoActivoMesa ? (state.partidoActivoMesa.id || state.partidoActivoMesa.Id) : null;
            if (e.target.value === 'DESCANSO' || e.target.value === 'ENTRETIEMPO') {
                detenerCronometroMicrofutbol(false);
                segundosMicrofutbolNeto = 1200;
                if (inputMin) inputMin.value = 20;
                if (pId) {
                    const timerData = obtenerEstadoTimerMicrofutbol(pId) || {};
                    timerData.running = false;
                    timerData.startTimestamp = null;
                    timerData.segundosNetos = 1200;
                    timerData.accumulatedSeconds = 1200;
                    timerData.minutoActual = 20;
                    timerData.periodo = 'DESCANSO';
                    guardarEstadoTimerMicrofutbol(pId, timerData);
                }
            } else if (e.target.value === '1T' || e.target.value === '2T') {
                const estGen = document.getElementById('mesa-estado-general')?.value || '';
                if (e.target.value === '2T') {
                    if (segundosMicrofutbolNeto < 1200) segundosMicrofutbolNeto = 1200;
                    if (inputMin && (!inputMin.value || parseInt(inputMin.value) < 20)) inputMin.value = 20;
                }
                if (estGen === 'EN_JUEGO') {
                    iniciarCronometroMicrofutbol(false);
                }
            } else if (e.target.value === 'PENALES') {
                detenerCronometroMicrofutbol(false);
                const nomLoc = state.partidoActivoMesa?.equipoLocalNombre || state.partidoActivoMesa?.EquipoLocalNombre || 'Local';
                const nomVis = state.partidoActivoMesa?.equipoVisitanteNombre || state.partidoActivoMesa?.EquipoVisitanteNombre || 'Visitante';
                activarModuloPenalesMesa(nomLoc, nomVis);
            } else if (e.target.value === 'FINALIZADO' || e.target.value === 'SUSPENDIDO') {
                detenerCronometroMicrofutbol(false);
            }
        }
        actualizarControlesOperativosMesa();
    });

    document.getElementById('mesa-minuto-actual')?.addEventListener('change', (e) => {
        if (!state.partidoActivoMesa) return;
        const depNorm = obtenerDeporteDePartido(state.partidoActivoMesa);
        if (depNorm === 'BALONCESTO') {
            const pId = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
            const nuevoMin = parseInt(e.target.value) || 1;
            const timerData = obtenerEstadoTimerBaloncesto(pId) || { running: false };
            const segsNuevos = Math.max(0, (nuevoMin - 1) * 60);
            timerData.segundosNetos = segsNuevos;
            timerData.accumulatedSeconds = segsNuevos;
            timerData.minutoActual = nuevoMin;
            timerData.startTimestamp = Date.now();
            segundosBaloncestoNeto = segsNuevos;
            guardarEstadoTimerBaloncesto(pId, timerData);
        } else if (depNorm === 'FUTBOL') {
            const pId = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
            const nuevoMin = Math.max(0, Math.min(90, parseInt(e.target.value) || 0));
            const timerData = obtenerEstadoTimerFutbol(pId) || { running: false };
            const segsNuevos = nuevoMin * 60;
            timerData.segundosNetos = segsNuevos;
            timerData.accumulatedSeconds = segsNuevos;
            timerData.minutoActual = nuevoMin;
            timerData.startTimestamp = Date.now();
            segundosFutbolNeto = segsNuevos;
            guardarEstadoTimerFutbol(pId, timerData);
        } else if (depNorm === 'MICROFUTBOL') {
            const pId = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
            const nuevoMin = Math.max(0, Math.min(40, parseInt(e.target.value) || 0));
            const timerData = obtenerEstadoTimerMicrofutbol(pId) || { running: false };
            const segsNuevos = nuevoMin * 60;
            timerData.segundosNetos = segsNuevos;
            timerData.accumulatedSeconds = segsNuevos;
            timerData.minutoActual = nuevoMin;
            if (timerData.running) {
                timerData.startTimestamp = Date.now();
            }
            segundosMicrofutbolNeto = segsNuevos;
            guardarEstadoTimerMicrofutbol(pId, timerData);
        }
    });

    document.getElementById('mesa-estado-general')?.addEventListener('change', (e) => {
        if (state.partidoActivoMesa) {
            state.partidoActivoMesa.estado = e.target.value;
            const selEstEl = document.getElementById('mesa-estado-general');
            if (selEstEl) selEstEl.dataset.userModified = 'true';
            const depNorm = obtenerDeporteDePartido(state.partidoActivoMesa);
            if (depNorm === 'BALONCESTO') {
                if (e.target.value === 'EN_JUEGO') {
                    iniciarCronometroBaloncesto(false);
                } else {
                    detenerCronometroBaloncesto(false);
                }
            } else if (depNorm === 'FUTBOL') {
                if (e.target.value === 'EN_JUEGO') {
                    iniciarCronometroFutbol(false);
                } else {
                    detenerCronometroFutbol(false);
                }
            } else if (depNorm === 'MICROFUTBOL') {
                if (e.target.value === 'EN_JUEGO') {
                    iniciarCronometroMicrofutbol(false);
                } else {
                    detenerCronometroMicrofutbol(false);
                }
            }
        }
        actualizarBadgeVivo(document.getElementById('mesa-estado-general')?.value);
        actualizarControlesOperativosMesa();
    });
}

// Abrir la consola interactiva de control táctil para un partido específico
window.abrirMesaTactil = async function(partidoId) {
    // Si había un partido activo en mesa, persistir sus segundos antes de abrir el nuevo
    const partidoPrev = state.partidoActivoMesa;
    if (partidoPrev) {
        const prevId = partidoPrev.id || partidoPrev.Id;
        const depNormPrev = obtenerDeporteDePartido(partidoPrev);
        const estGenP = (document.getElementById('mesa-estado-general')?.value || partidoPrev.estado || '').toUpperCase();
        const selDetP = document.getElementById('mesa-estado-detalle');
        const estDetP = (selDetP ? selDetP.value : (partidoPrev.estadoDetalle || '')).toUpperCase();
        const inpMP = document.getElementById('mesa-minuto-actual');
        const minAP = inpMP ? (parseInt(inpMP.value) || 0) : (partidoPrev.minutoActual || 0);

        if (estGenP === 'EN_JUEGO') {
            gestorPartidosEnJuego.set(String(prevId), Object.assign({}, partidoPrev, {
                estado: estGenP,
                estadoDetalle: estDetP,
                minutoActual: minAP,
                puntosLocal: state.marcadorLocalTemp ?? partidoPrev.puntosLocal ?? 0,
                puntosVisitante: state.marcadorVisitTemp ?? partidoPrev.puntosVisitante ?? 0
            }));
        }

        if (depNormPrev === 'BALONCESTO') {
            const pausadoP = (estDetP === 'PAUSA' || estDetP === 'TIEMPO MUERTO' || estDetP === 'T. MUERTO' ||
                              estDetP === 'PAUSA Q1' || estDetP === 'DESCANSO' || estDetP === 'PAUSA Q3' ||
                              estDetP === 'PAUSA EXTRA TIEMPO' ||
                              estDetP === 'FINALIZADO' || estDetP === 'SUSPENDIDO' || estGenP === 'SUSPENDIDO' || estGenP === 'FINALIZADO');
            if (estGenP === 'EN_JUEGO' && !pausadoP) {
                const timerPrevio = obtenerEstadoTimerBaloncesto(prevId);
                let segsActuales = segundosBaloncestoNeto;
                if (timerPrevio && timerPrevio.running && timerPrevio.startTimestamp) {
                    const elapsed = Math.floor((Date.now() - timerPrevio.startTimestamp) / 1000);
                    const baseSegs = timerPrevio.segundosNetos !== undefined ? timerPrevio.segundosNetos : (timerPrevio.accumulatedSeconds || 0);
                    segsActuales = baseSegs + elapsed;
                }
                guardarEstadoTimerBaloncesto(prevId, {
                    running: true,
                    startTimestamp: Date.now(),
                    segundosNetos: segsActuales,
                    minutoActual: minAP || 1,
                    minuto_actual: minAP || 1,
                    periodo: estDetP
                });
            } else if (estGenP === 'FINALIZADO') {
                limpiarEstadoTimerBaloncesto(prevId);
            }
        } else if (depNormPrev === 'FUTBOL') {
            const pausadoP = (estDetP === 'DESCANSO' || estDetP === 'ENTRETIEMPO' || estDetP === 'PENALES' ||
                              estDetP === 'FINALIZADO' || estDetP === 'SUSPENDIDO' || estGenP === 'SUSPENDIDO' || estGenP === 'FINALIZADO');
            if (estGenP === 'EN_JUEGO' && !pausadoP) {
                const timerPrevio = obtenerEstadoTimerFutbol(prevId);
                let segsActuales = segundosFutbolNeto;
                if (timerPrevio && timerPrevio.running && timerPrevio.startTimestamp) {
                    const elapsed = Math.floor((Date.now() - timerPrevio.startTimestamp) / 1000);
                    const baseSegs = timerPrevio.segundosNetos !== undefined ? timerPrevio.segundosNetos : 0;
                    segsActuales = baseSegs + elapsed;
                }
                guardarEstadoTimerFutbol(prevId, {
                    running: true,
                    startTimestamp: Date.now(),
                    segundosNetos: segsActuales,
                    minutoActual: minAP,
                    periodo: estDetP
                });
            } else if (estGenP === 'FINALIZADO') {
                limpiarEstadoTimerFutbol(prevId);
            }
        } else if (depNormPrev === 'MICROFUTBOL') {
            const pausadoP = (estDetP === 'DESCANSO' || estDetP === 'ENTRETIEMPO' || estDetP === 'PENALES' ||
                              estDetP === 'FINALIZADO' || estDetP === 'SUSPENDIDO' || estGenP === 'SUSPENDIDO' || estGenP === 'FINALIZADO');
            if (estGenP === 'EN_JUEGO' && !pausadoP) {
                const timerPrevio = obtenerEstadoTimerMicrofutbol(prevId);
                let segsActuales = segundosMicrofutbolNeto;
                if (timerPrevio && timerPrevio.running && timerPrevio.startTimestamp) {
                    const elapsed = Math.floor((Date.now() - timerPrevio.startTimestamp) / 1000);
                    const baseSegs = timerPrevio.segundosNetos !== undefined ? timerPrevio.segundosNetos : 0;
                    segsActuales = baseSegs + elapsed;
                }
                guardarEstadoTimerMicrofutbol(prevId, {
                    running: true,
                    startTimestamp: Date.now(),
                    segundosNetos: segsActuales,
                    minutoActual: minAP,
                    periodo: estDetP
                });
            } else if (estGenP === 'FINALIZADO') {
                limpiarEstadoTimerMicrofutbol(prevId);
            }
        }
    }

    if (cronometroBaloncestoInterval) { clearInterval(cronometroBaloncestoInterval); cronometroBaloncestoInterval = null; }
    if (cronometroFutbolInterval) { clearInterval(cronometroFutbolInterval); cronometroFutbolInterval = null; }
    if (cronometroMicrofutbolInterval) { clearInterval(cronometroMicrofutbolInterval); cronometroMicrofutbolInterval = null; }

    document.getElementById('mesa-vista-lista')?.classList.add('hidden');
    document.getElementById('mesa-vista-activa')?.classList.remove('hidden');

    await cargarPartidoAMesa(partidoId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

function cerrarMesaTactil() {
    if (state.partidoActivoMesa) {
        const pId = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
        const depNorm = obtenerDeporteDePartido(state.partidoActivoMesa);
        const estadoGen = (document.getElementById('mesa-estado-general')?.value || state.partidoActivoMesa.estado || '').toUpperCase();
        const selDet = document.getElementById('mesa-estado-detalle');
        const estadoDet = (selDet ? selDet.value : (state.partidoActivoMesa.estadoDetalle || '')).toUpperCase();
        const inputMin = document.getElementById('mesa-minuto-actual');
        const minAct = inputMin ? (parseInt(inputMin.value) || 0) : (state.partidoActivoMesa.minutoActual || 0);

        if (estadoGen === 'EN_JUEGO') {
            // Mantener en el gestor global de partidos en juego
            gestorPartidosEnJuego.set(String(pId), Object.assign({}, state.partidoActivoMesa, {
                estado: estadoGen,
                estadoDetalle: estadoDet,
                minutoActual: minAct,
                puntosLocal: state.marcadorLocalTemp ?? state.partidoActivoMesa.puntosLocal ?? 0,
                puntosVisitante: state.marcadorVisitTemp ?? state.partidoActivoMesa.puntosVisitante ?? 0
            }));
        } else if (estadoGen === 'FINALIZADO') {
            gestorPartidosEnJuego.delete(String(pId));
        }

        if (depNorm === 'BALONCESTO') {
            const estaPausado = (estadoDet === 'PAUSA' || estadoDet === 'TIEMPO MUERTO' || estadoDet === 'T. MUERTO' ||
                                 estadoDet === 'PAUSA Q1' || estadoDet === 'DESCANSO' || estadoDet === 'PAUSA Q3' ||
                                 estadoDet === 'PAUSA EXTRA TIEMPO' ||
                                 estadoDet === 'FINALIZADO' || estadoDet === 'SUSPENDIDO' || estadoGen === 'SUSPENDIDO' || estadoGen === 'FINALIZADO');
            if (estadoGen === 'EN_JUEGO' && !estaPausado) {
                const timerPrevio = obtenerEstadoTimerBaloncesto(pId);
                let segsActuales = segundosBaloncestoNeto;
                if (timerPrevio && timerPrevio.running && timerPrevio.startTimestamp) {
                    const elapsed = Math.floor((Date.now() - timerPrevio.startTimestamp) / 1000);
                    const baseSegs = timerPrevio.segundosNetos !== undefined ? timerPrevio.segundosNetos : (timerPrevio.accumulatedSeconds || 0);
                    segsActuales = baseSegs + elapsed;
                }
                guardarEstadoTimerBaloncesto(pId, {
                    running: true,
                    startTimestamp: Date.now(),
                    segundosNetos: segsActuales,
                    minutoActual: minAct || 1,
                    minuto_actual: minAct || 1,
                    periodo: estadoDet
                });
            } else if (estadoGen === 'FINALIZADO') {
                limpiarEstadoTimerBaloncesto(pId);
            }
        } else if (depNorm === 'FUTBOL') {
            const estaPausado = (estadoDet === 'DESCANSO' || estadoDet === 'ENTRETIEMPO' || estadoDet === 'PENALES' ||
                                 estadoDet === 'FINALIZADO' || estadoDet === 'SUSPENDIDO' || estadoGen === 'SUSPENDIDO' || estadoGen === 'FINALIZADO');
            if (estadoGen === 'EN_JUEGO' && !estaPausado) {
                const timerPrevio = obtenerEstadoTimerFutbol(pId);
                let segsActuales = segundosFutbolNeto;
                if (timerPrevio && timerPrevio.running && timerPrevio.startTimestamp) {
                    const elapsed = Math.floor((Date.now() - timerPrevio.startTimestamp) / 1000);
                    const baseSegs = timerPrevio.segundosNetos !== undefined ? timerPrevio.segundosNetos : 0;
                    segsActuales = baseSegs + elapsed;
                }
                guardarEstadoTimerFutbol(pId, {
                    running: true,
                    startTimestamp: Date.now(),
                    segundosNetos: segsActuales,
                    minutoActual: minAct,
                    periodo: estadoDet
                });
            } else if (estadoGen === 'FINALIZADO') {
                limpiarEstadoTimerFutbol(pId);
            }
        } else if (depNorm === 'MICROFUTBOL') {
            const estaPausado = (estadoDet === 'DESCANSO' || estadoDet === 'ENTRETIEMPO' || estadoDet === 'PENALES' ||
                                 estadoDet === 'FINALIZADO' || estadoDet === 'SUSPENDIDO' || estadoGen === 'SUSPENDIDO' || estadoGen === 'FINALIZADO');
            if (estadoGen === 'EN_JUEGO' && !estaPausado) {
                const timerPrevio = obtenerEstadoTimerMicrofutbol(pId);
                let segsActuales = segundosMicrofutbolNeto;
                if (timerPrevio && timerPrevio.running && timerPrevio.startTimestamp) {
                    const elapsed = Math.floor((Date.now() - timerPrevio.startTimestamp) / 1000);
                    const baseSegs = timerPrevio.segundosNetos !== undefined ? timerPrevio.segundosNetos : 0;
                    segsActuales = baseSegs + elapsed;
                }
                guardarEstadoTimerMicrofutbol(pId, {
                    running: true,
                    startTimestamp: Date.now(),
                    segundosNetos: segsActuales,
                    minutoActual: minAct,
                    periodo: estadoDet
                });
            } else if (estadoGen === 'FINALIZADO') {
                limpiarEstadoTimerMicrofutbol(pId);
            }
        }
    }

    if (cronometroBaloncestoInterval) { clearInterval(cronometroBaloncestoInterval); cronometroBaloncestoInterval = null; }
    if (cronometroFutbolInterval) { clearInterval(cronometroFutbolInterval); cronometroFutbolInterval = null; }
    if (cronometroMicrofutbolInterval) { clearInterval(cronometroMicrofutbolInterval); cronometroMicrofutbolInterval = null; }

    state.partidoActivoMesa = null;
    document.getElementById('mesa-vista-activa')?.classList.add('hidden');
    document.getElementById('mesa-vista-lista')?.classList.remove('hidden');
    cargarTarjetasMesaEnVivo(false);
}

// ============================================================================
// CONTROL DE OUTS Y AUTOMATIZACIÓN DE INNING (BÉISBOL Y SÓFTBOL)
// ============================================================================
let outsActuales = 0;

window.sumarOut = async function() {
    if (!state.partidoActivoMesa) {
        mostrarToast('Primero selecciona un partido para operar la mesa técnica.', 'error');
        return;
    }
    const depNorm = obtenerDeporteDePartido(state.partidoActivoMesa);
    if (depNorm !== 'BEISBOL' && depNorm !== 'SOFTBOL') return;

    outsActuales++;
    if (outsActuales >= 3) {
        await avanzarInningPorTercerOut(depNorm);
    } else {
        actualizarDisplayOuts();
        await guardarMarcadorMesa();
    }
};

window.resetearOuts = async function() {
    outsActuales = 0;
    actualizarDisplayOuts();
    await guardarMarcadorMesa();
};

function actualizarDisplayOuts() {
    const dot1 = document.getElementById('out-dot-1');
    const dot2 = document.getElementById('out-dot-2');
    const dot3 = document.getElementById('out-dot-3');
    const txt = document.getElementById('mesa-outs-texto');

    if (dot1) dot1.classList.toggle('active', outsActuales >= 1);
    if (dot2) dot2.classList.toggle('active', outsActuales >= 2);
    if (dot3) dot3.classList.toggle('active', outsActuales >= 3);
    if (txt) txt.textContent = `OUTS: [ ${outsActuales} / 3 ]`;
}

async function avanzarInningPorTercerOut(depNorm) {
    const selectDetalle = document.getElementById('mesa-estado-detalle');
    const selectEstadoGen = document.getElementById('mesa-estado-general');
    if (!selectDetalle) return;

    // 1. Reinicia Outs a 0
    outsActuales = 0;
    actualizarDisplayOuts();

    const valActual = selectDetalle.value || '';
    const esAlta = valActual.includes('Alta') || valActual.includes('▲');
    const esBaja = valActual.includes('Baja') || valActual.includes('▼');
    const esEE = valActual.includes('EE') || valActual.includes('Extra');
    const mNum = valActual.match(/(\d+)/);
    const inningNum = mNum ? parseInt(mNum[1]) : 1;
    const maxInnings = (depNorm === 'BEISBOL') ? 9 : 7;

    const ptsLocal = state.marcadorLocalTemp ?? 0;
    const ptsVisit = state.marcadorVisitTemp ?? 0;

    let nuevoValor = '';
    let nuevoEstadoGeneral = selectEstadoGen ? selectEstadoGen.value : 'EN_JUEGO';
    let mensajeToast = '';

    if (esAlta) {
        // PARTE ALTA (▲):
        // 1. Reinicia Outs a 0 (ya hecho)
        // 2. Cambia automáticamente el sub-estado a PARTE BAJA (▼) de esa misma entrada
        // 3. Invierte los roles: Local pasa a 'AL BATE' (🏏) y Visita a 'LANZANDO' (⚾)
        if (esEE) {
            nuevoValor = '▼ Baja EE';
            mensajeToast = '¡3er Out! Cambio de lado en Extra Inning: Ahora batea el Local (▼ Baja EE)';
        } else {
            nuevoValor = `▼ Baja ${inningNum}ª`;
            mensajeToast = `¡3er Out! Cambio de lado: Ahora batea el Local (▼ Baja ${inningNum}ª)`;
        }
    } else {
        // PARTE BAJA (▼):
        // 1. Reinicia Outs a 0 (ya hecho)
        if (inningNum >= maxInnings || esEE) {
            // Entrada 9 (o 7 en sóftbol) o un Extra-Inning
            if (ptsLocal !== ptsVisit) {
                // Hay diferencia de carreras (no hay empate): Cambia el estado general automáticamente a 'FINALIZADO'
                nuevoEstadoGeneral = 'FINALIZADO';
                nuevoValor = 'FINALIZADO';
                if (selectEstadoGen) selectEstadoGen.value = 'FINALIZADO';
                const ganador = ptsLocal > ptsVisit 
                    ? (document.getElementById('mesa-nom-local')?.textContent || 'Local') 
                    : (document.getElementById('mesa-nom-visit')?.textContent || 'Visitante');
                mensajeToast = `🏁 ¡FINAL DEL PARTIDO! Concluyen las ${inningNum} entradas reglamentarias. Ganador: ${ganador} (${ptsLocal} - ${ptsVisit})`;
            } else {
                // Persiste el empate: Avanza a '▲ Alta Extra Inning (EE)'
                nuevoValor = '▲ Alta EE';
                mensajeToast = `⚖️ ¡Empate tras ${maxInnings} entradas (${ptsLocal} - ${ptsVisit})! Avanza a ▲ Alta Extra Inning (EE). Ahora batea la Visita 🏏.`;
            }
        } else {
            // Menor a la entrada 9: Avanza a la PARTE ALTA (▲) de la siguiente entrada e invierte los roles
            const sigInning = inningNum + 1;
            nuevoValor = `▲ Alta ${sigInning}ª`;
            mensajeToast = `¡3er Out! Entrada ${inningNum} finalizada. Avanza a la entrada ${sigInning}: Ahora batea la Visita (▲ Alta ${sigInning}ª)`;
        }
    }

    if (Array.from(selectDetalle.options).some(o => o.value === nuevoValor)) {
        selectDetalle.value = nuevoValor;
    } else {
        const opt = Array.from(selectDetalle.options).find(o => o.value.toUpperCase() === nuevoValor.toUpperCase());
        if (opt) selectDetalle.value = opt.value;
    }

    if (selectEstadoGen && nuevoEstadoGeneral) {
        selectEstadoGen.value = nuevoEstadoGeneral;
    }

    actualizarBadgeVivo(nuevoEstadoGeneral);
    actualizarRolesBateadorLanzador(depNorm, nuevoValor);
    verificarKnockoutBeisbolSoftbol();
    mostrarToast(mensajeToast, nuevoEstadoGeneral === 'FINALIZADO' ? 'exito' : 'info');

    // Persistir de inmediato en la API
    await guardarMarcadorMesa();
}

function actualizarRolesBateadorLanzador(depNorm, estadoDetalle) {
    const rolLocal = document.getElementById('mesa-rol-local');
    const rolVisit = document.getElementById('mesa-rol-visit');
    if (!rolLocal || !rolVisit) return;

    if (depNorm !== 'BEISBOL' && depNorm !== 'SOFTBOL') {
        rolLocal.classList.add('hidden');
        rolVisit.classList.add('hidden');
        return;
    }

    rolLocal.classList.remove('hidden');
    rolVisit.classList.remove('hidden');

    const det = (estadoDetalle || '').toUpperCase();
    const esBaja = det.includes('BAJA') || det.includes('▼');

    if (esBaja) {
        // Parte baja: Local batea (🏏), Visita lanza (⚾)
        rolLocal.innerHTML = '🏏 AL BATE';
        rolLocal.style.background = 'rgba(46, 213, 115, 0.2)';
        rolLocal.style.color = '#2ed573';
        rolLocal.style.border = '1px solid #2ed573';

        rolVisit.innerHTML = '⚾ LANZANDO';
        rolVisit.style.background = 'rgba(0, 210, 255, 0.2)';
        rolVisit.style.color = '#00d2ff';
        rolVisit.style.border = '1px solid #00d2ff';
    } else {
        // Parte alta: Visita batea (🏏), Local lanza (⚾)
        rolLocal.innerHTML = '⚾ LANZANDO';
        rolLocal.style.background = 'rgba(0, 210, 255, 0.2)';
        rolLocal.style.color = '#00d2ff';
        rolLocal.style.border = '1px solid #00d2ff';

        rolVisit.innerHTML = '🏏 AL BATE';
        rolVisit.style.background = 'rgba(46, 213, 115, 0.2)';
        rolVisit.style.color = '#2ed573';
        rolVisit.style.border = '1px solid #2ed573';
    }
}

function verificarKnockoutBeisbolSoftbol() {
    const alertBox = document.getElementById('mesa-alerta-knockout');
    if (!alertBox || !state.partidoActivoMesa) return;

    const depNorm = obtenerDeporteDePartido(state.partidoActivoMesa);
    if (depNorm !== 'BEISBOL' && depNorm !== 'SOFTBOL') {
        alertBox.classList.add('hidden');
        alertBox.innerHTML = '';
        return;
    }

    const estadoDetalle = (document.getElementById('mesa-estado-detalle')?.value || '').toUpperCase();
    if (estadoDetalle === 'FINALIZADO') {
        alertBox.classList.add('hidden');
        alertBox.innerHTML = '';
        return;
    }

    const mNum = estadoDetalle.match(/(\d+)/);
    const inningNum = mNum ? parseInt(mNum[1]) : (estadoDetalle.includes('EE') ? 10 : 1);

    const scoreLocal = state.marcadorLocalTemp || 0;
    const scoreVisit = state.marcadorVisitTemp || 0;
    const diff = Math.abs(scoreLocal - scoreVisit);
    const nomLocal = document.getElementById('mesa-nom-local')?.textContent || 'Local';
    const nomVisit = document.getElementById('mesa-nom-visit')?.textContent || 'Visitante';
    const lider = scoreLocal > scoreVisit ? nomLocal : (scoreVisit > scoreLocal ? nomVisit : null);

    let hayKO = false;
    let tipoKO = '';
    let reglaTexto = '';

    if (lider && diff > 0) {
        if (depNorm === 'BEISBOL') {
            // Regla oficial Béisbol: >= 15 carreras tras 5 innings, o >= 10 tras 7 innings
            if (inningNum >= 5 && diff >= 15) {
                hayKO = true;
                tipoKO = 'SÚPER KNOCKOUT';
                reglaTexto = `Ventaja de ${diff} carreras (>= 15) en el Inning ${inningNum}`;
            } else if (inningNum >= 7 && diff >= 10) {
                hayKO = true;
                tipoKO = 'KNOCKOUT OFICIAL (Mercy Rule)';
                reglaTexto = `Ventaja de ${diff} carreras (>= 10) en el Inning ${inningNum}`;
            }
        } else if (depNorm === 'SOFTBOL') {
            // Regla oficial Sóftbol: >= 15 en 3er inning, >= 10 en 4to inning, o >= 7 en 5to inning
            if (inningNum >= 3 && diff >= 15) {
                hayKO = true;
                tipoKO = 'SÚPER KNOCKOUT';
                reglaTexto = `Ventaja de ${diff} carreras (>= 15) en el Inning ${inningNum}`;
            } else if (inningNum >= 4 && diff >= 10) {
                hayKO = true;
                tipoKO = 'KNOCKOUT OFICIAL';
                reglaTexto = `Ventaja de ${diff} carreras (>= 10) en el Inning ${inningNum}`;
            } else if (inningNum >= 5 && diff >= 7) {
                hayKO = true;
                tipoKO = 'MERCY RULE';
                reglaTexto = `Ventaja de ${diff} carreras (>= 7) en el Inning ${inningNum}`;
            }
        }
    }

    if (hayKO) {
        alertBox.classList.remove('hidden');
        alertBox.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; width: 100%;">
                <div>
                    <div style="font-weight: 800; font-size: 13px; color: #ffeb3b; display: flex; align-items: center; gap: 6px;">
                        ⚠️ ${tipoKO} DETECTADO
                    </div>
                    <div style="font-size: 12px; color: #f1f1f5; margin-top: 2px;">
                        ${reglaTexto}. Líder: <strong style="color: #2ed573;">${lider}</strong> (${scoreLocal} - ${scoreVisit}).
                    </div>
                </div>
                <button type="button" class="btn-ko-action" onclick="aplicarCierreKnockout('${tipoKO}')">
                    ⚡ Aplicar Cierre por Knockout
                </button>
            </div>
        `;
    } else {
        alertBox.classList.add('hidden');
        alertBox.innerHTML = '';
    }
}

window.aplicarCierreKnockout = async function(tipoKO) {
    if (!state.partidoActivoMesa) return;
    const confirmMsg = `¿Deseas finalizar este partido inmediatamente aplicando ${tipoKO}?\n\nMarcador Oficial: ${state.marcadorLocalTemp} - ${state.marcadorVisitTemp}`;
    const okKO = await mostrarConfirmacionModal(confirmMsg, `⚡ Cierre por ${tipoKO}`);
    if (!okKO) return;

    const valDetalleAntes = document.getElementById('mesa-estado-detalle')?.value || '';
    const mNumKO = valDetalleAntes.match(/(\d+)/);
    if (mNumKO) {
        try {
            const pId = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
            let bInn = JSON.parse(localStorage.getItem(`baseball_innings_${pId}`) || '{"vis":{},"loc":{}}');
            bInn.maxInning = parseInt(mNumKO[1]);
            localStorage.setItem(`baseball_innings_${pId}`, JSON.stringify(bInn));
        } catch(e) {}
    }

    const koId = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
    detenerCronometroBaloncesto(true);
    detenerCronometroFutbol(true);
    detenerCronometroMicrofutbol(true);
    limpiarEstadoTimerMicrofutbol(koId);
    gestorPartidosEnJuego.delete(String(koId));
    document.getElementById('mesa-estado-general').value = 'FINALIZADO';
    document.getElementById('mesa-estado-detalle').value = 'FINALIZADO';
    await guardarMarcadorMesa();
    mostrarToast(`¡Partido finalizado oficialmente por ${tipoKO}!`, 'exito');
};

// ============================================================================
// ADAPTACIÓN DE LA MESA TÉCNICA SEGÚN EL DEPORTE
// ============================================================================
function adaptarMesaSegunDeporte(deporteNorm, estadoDetalleActual) {
    const contMinuto = document.getElementById('mesa-container-minuto');
    const contIncidencias = document.getElementById('mesa-container-incidencias');
    const selectDetalle = document.getElementById('mesa-estado-detalle');
    const labelDetalle = document.getElementById('mesa-label-estado-detalle');
    const btnsBaloncesto = document.querySelectorAll('.btn-baloncesto');
    const contOuts = document.getElementById('mesa-container-outs');

    let opcionesDetalle = [];
    let labelTexto = 'Sub-Estado Flashscore:';

    if (deporteNorm === 'SOFTBOL' || deporteNorm === 'BEISBOL') {
        // 1. SÓFTBOL / BÉISBOL:
        // - Ocultar completamente contenedor de incidencias (no aplican goles ni tarjetas)
        contIncidencias?.classList.add('hidden');
        // - Ocultar campo de Minuto de juego (no se rigen por cronómetro)
        contMinuto?.classList.add('hidden');
        // - Ocultar botones adaptativos de baloncesto
        btnsBaloncesto.forEach(b => b.classList.add('hidden'));
        // - Mostrar panel de Control de Outs
        contOuts?.classList.remove('hidden');

        labelTexto = 'Inning y Mitad Activa:';
        const maxInnings = (deporteNorm === 'BEISBOL') ? 9 : 7;
        for (let i = 1; i <= maxInnings; i++) {
            opcionesDetalle.push({ valor: `▲ Alta ${i}ª`, texto: `▲ Alta ${i}ª (Batea Visita)` });
            opcionesDetalle.push({ valor: `▼ Baja ${i}ª`, texto: `▼ Baja ${i}ª (Batea Local)` });
        }
        opcionesDetalle.push({ valor: '▲ Alta EE', texto: '▲ Alta EE (Extra Inning Visita)' });
        opcionesDetalle.push({ valor: '▼ Baja EE', texto: '▼ Baja EE (Extra Inning Local)' });
        opcionesDetalle.push({ valor: 'FINALIZADO', texto: 'FINALIZADO' });

    } else if (deporteNorm === 'VOLEIBOL') {
        // 2. VOLEIBOL:
        contIncidencias?.classList.add('hidden');
        contMinuto?.classList.add('hidden');
        contOuts?.classList.add('hidden');
        btnsBaloncesto.forEach(b => b.classList.add('hidden'));

        labelTexto = 'Set Activo:';
        for (let i = 1; i <= 5; i++) {
            opcionesDetalle.push({ valor: `SET ${i}`, texto: `Set ${i}` });
        }
        opcionesDetalle.push({ valor: 'FINALIZADO', texto: 'FINALIZADO' });

    } else if (deporteNorm === 'BALONCESTO') {
        // 3. BALONCESTO (4 cuartos de 10 min netos + pausas reglamentarias):
        contIncidencias?.classList.add('hidden');
        contMinuto?.classList.remove('hidden');
        contOuts?.classList.add('hidden');
        btnsBaloncesto.forEach(b => b.classList.remove('hidden'));

        labelTexto = 'Periodo / Cuarto Activo:';
        opcionesDetalle = [
            { valor: 'Q1', texto: 'Q1 (1° Cuarto - 10 min)' },
            { valor: 'PAUSA Q1', texto: 'PAUSA Q1 (Pausa 2 min)' },
            { valor: 'Q2', texto: 'Q2 (2° Cuarto - 10 min)' },
            { valor: 'DESCANSO', texto: 'DESCANSO (Medio Tiempo 10 min)' },
            { valor: 'Q3', texto: 'Q3 (3° Cuarto - 10 min)' },
            { valor: 'PAUSA Q3', texto: 'PAUSA Q3 (Pausa 2 min)' },
            { valor: 'Q4', texto: 'Q4 (4° Cuarto - 10 min)' },
            { valor: 'PAUSA EXTRA TIEMPO', texto: '⏸ PAUSA EXTRA TIEMPO' },
            { valor: 'OVERTIME', texto: 'OVERTIME (Tiempo Extra 1)' },
            { valor: '2OT', texto: '2OT (Tiempo Extra 2)' },
            { valor: '3OT', texto: '3OT (Tiempo Extra 3)' },
            { valor: 'TIEMPO MUERTO', texto: '⏸ TIEMPO MUERTO' },
            { valor: 'PAUSA', texto: '⏸ PAUSA (Balón Fuera)' },
            { valor: 'FINALIZADO', texto: 'FINALIZADO' }
        ];

    } else if (deporteNorm === 'MICROFUTBOL') {
        // 4. MICROFÚTBOL / FUTSAL (2 tiempos de 20 min netos + 10 descanso):
        contIncidencias?.classList.remove('hidden');
        contMinuto?.classList.remove('hidden');
        contOuts?.classList.add('hidden');
        btnsBaloncesto.forEach(b => b.classList.add('hidden'));

        labelTexto = 'Tiempo de Juego:';
        opcionesDetalle = [
            { valor: '1T', texto: '1T (Primer Tiempo - 20 min)' },
            { valor: 'DESCANSO', texto: 'DESCANSO (10 min)' },
            { valor: '2T', texto: '2T (Segundo Tiempo - 20 min)' },
            { valor: 'TIEMPO EXTRA', texto: 'TIEMPO EXTRA' },
            { valor: 'PENALES', texto: 'PENALES' },
            { valor: 'FINALIZADO', texto: 'FINALIZADO' }
        ];

    } else {
        // 5. FÚTBOL (2 tiempos de 45 min netos + descanso):
        contIncidencias?.classList.remove('hidden');
        contMinuto?.classList.remove('hidden');
        contOuts?.classList.add('hidden');
        btnsBaloncesto.forEach(b => b.classList.add('hidden'));

        labelTexto = 'Tiempo de Juego:';
        opcionesDetalle = [
            { valor: '1T', texto: '1T (Primer Tiempo - 45 min)' },
            { valor: 'DESCANSO', texto: 'DESCANSO (Entretiempo)' },
            { valor: 'ENTRETIEMPO', texto: 'ENTRETIEMPO (15 min)' },
            { valor: '2T', texto: '2T (Segundo Tiempo - 45 min)' },
            { valor: 'TIEMPO EXTRA', texto: 'TIEMPO EXTRA' },
            { valor: 'PENALES', texto: 'PENALES' },
            { valor: 'FINALIZADO', texto: 'FINALIZADO' }
        ];
    }

    if (labelDetalle) {
        labelDetalle.textContent = labelTexto;
    }

    if (selectDetalle) {
        selectDetalle.innerHTML = opcionesDetalle.map(o => 
            `<option value="${o.valor}">${o.texto}</option>`
        ).join('');

        let valorBuscado = (estadoDetalleActual || '').trim();
        // Si viene en formato heredado "INNING X", mapear a "▲ Alta Xª"
        const mLegacy = valorBuscado.match(/INNING\s*(\d+)/i);
        if (mLegacy) {
            valorBuscado = `▲ Alta ${mLegacy[1]}ª`;
        }

        const matchOpt = opcionesDetalle.find(o => o.valor.toUpperCase() === valorBuscado.toUpperCase());
        if (matchOpt) {
            selectDetalle.value = matchOpt.valor;
        } else if (opcionesDetalle.length > 0) {
            selectDetalle.value = opcionesDetalle[0].valor;
        }
    }

    // Actualizar roles de bateador/lanzador y estado de outs
    if (deporteNorm === 'SOFTBOL' || deporteNorm === 'BEISBOL') {
        actualizarRolesBateadorLanzador(deporteNorm, selectDetalle ? selectDetalle.value : '');
        actualizarDisplayOuts();
        verificarKnockoutBeisbolSoftbol();
    } else {
        document.getElementById('mesa-rol-local')?.classList.add('hidden');
        document.getElementById('mesa-rol-visit')?.classList.add('hidden');
        document.getElementById('mesa-alerta-knockout')?.classList.add('hidden');
    }

    // Adaptar vista táctil de Voleibol (Sets ganados y parciales)
    if (deporteNorm === 'VOLEIBOL') {
        document.getElementById('mesa-vol-sets-local')?.classList.remove('hidden');
        document.getElementById('mesa-vol-sets-visit')?.classList.remove('hidden');
        document.getElementById('mesa-vol-summary')?.classList.remove('hidden');
        const subLoc = document.getElementById('mesa-score-sub-local');
        const subVis = document.getElementById('mesa-score-sub-visit');
        if (subLoc) subLoc.textContent = 'Puntos Set Actual';
        if (subVis) subVis.textContent = 'Puntos Set Actual';
    } else {
        desbloquearControlesPuntos();
        document.getElementById('mesa-vol-sets-local')?.classList.add('hidden');
        document.getElementById('mesa-vol-sets-visit')?.classList.add('hidden');
        document.getElementById('mesa-vol-summary')?.classList.add('hidden');
        const subLoc = document.getElementById('mesa-score-sub-local');
        const subVis = document.getElementById('mesa-score-sub-visit');
        if (subLoc) subLoc.textContent = '';
        if (subVis) subVis.textContent = '';
    }

    // Configurar tipos de incidencias según el deporte (Microfútbol, Fútbol, etc.)
    configurarSelectTipoIncidencias(deporteNorm);
}

function configurarSelectTipoIncidencias(deporteNorm) {
    const selTipo = document.getElementById('evento-tipo');
    if (!selTipo) return;

    const valActual = selTipo.value;
    let html = '';

    if (deporteNorm === 'MICROFUTBOL') {
        html = `
            <option value="GOL">⚽ Gol</option>
            <option value="AUTOGOL">⚽ Autogol</option>
            <option value="TARJETA_AMARILLA">🟨 Tarjeta Amarilla</option>
            <option value="TARJETA_AZUL">🟦 Tarjeta Azul (Descalificación con reemplazo)</option>
            <option value="TARJETA_ROJA">🟥 Tarjeta Roja (Expulsión directa)</option>
            <option value="SUSTITUCION">🔄 Sustitución</option>
            <option value="OTRO">📝 Comentario / Incidencia</option>
        `;
    } else if (deporteNorm === 'FUTBOL') {
        html = `
            <option value="GOL">⚽ Gol</option>
            <option value="AUTOGOL">⚽ Autogol</option>
            <option value="TARJETA_AMARILLA">🟨 Tarjeta Amarilla</option>
            <option value="TARJETA_ROJA">🟥 Tarjeta Roja</option>
            <option value="SUSTITUCION">🔄 Sustitución</option>
            <option value="OTRO">📝 Comentario / Incidencia</option>
        `;
    } else {
        html = `
            <option value="GOL">⚽ Gol</option>
            <option value="AUTOGOL">⚽ Autogol</option>
            <option value="TARJETA_AMARILLA">🟨 Tarjeta Amarilla</option>
            <option value="TARJETA_AZUL">🟦 Tarjeta Azul</option>
            <option value="TARJETA_ROJA">🟥 Tarjeta Roja</option>
            <option value="PUNTO">🏀 Punto / Cesta</option>
            <option value="CARRERA">⚾ Carrera</option>
            <option value="SUSTITUCION">🔄 Sustitución</option>
            <option value="OTRO">📝 Comentario / Incidencia</option>
        `;
    }

    selTipo.innerHTML = html.trim();
    if (valActual && selTipo.querySelector(`option[value="${valActual}"]`)) {
        selTipo.value = valActual;
    }
}
window.configurarSelectTipoIncidencias = configurarSelectTipoIncidencias;

async function cargarPartidoAMesa(partidoId) {
    try {
        const res = await fetch(`${API_URL}/partidos/${partidoId}`);
        if (!res.ok) throw new Error('Error al cargar datos del partido');
        const partido = await res.json();
        state.partidoActivoMesa = partido;
        delete document.getElementById('mesa-estado-detalle')?.dataset.userModified;
        delete document.getElementById('mesa-estado-general')?.dataset.userModified;

        const id = partido.id || partido.Id;
        const local = partido.equipoLocalNombre || partido.EquipoLocalNombre || (partido.equipoLocal ? partido.equipoLocal.nombre : obtenerNombreEquipo(partido.equipoLocalId || partido.EquipoLocalId));
        const visit = partido.equipoVisitanteNombre || partido.EquipoVisitanteNombre || (partido.equipoVisitante ? partido.equipoVisitante.nombre : obtenerNombreEquipo(partido.equipoVisitanteId || partido.EquipoVisitanteId));
        const torneo = partido.torneoNombre || partido.TorneoNombre || 'Torneo Oficial';
        const cancha = partido.canchaNombre || partido.CanchaNombre || obtenerNombreCancha(partido.canchaId || partido.CanchaId);
        const jornada = partido.jornada || partido.Jornada || 1;
        const deporteNom = partido.deporteNombre || partido.DeporteNombre || '';
        const deporteNorm = obtenerDeporteDePartido(partido);

        state.marcadorLocalTemp = partido.puntosLocal ?? partido.PuntosLocal ?? 0;
        state.marcadorVisitTemp = partido.puntosVisitante ?? partido.PuntosVisitante ?? 0;

        // Normalización estricta para Voleibol: ningún equipo puede superar 3 sets ganados ni empatar 3-3
        if (deporteNorm === 'VOLEIBOL') {
            state.marcadorLocalTemp = Math.min(3, Math.max(0, state.marcadorLocalTemp));
            state.marcadorVisitTemp = Math.min(3, Math.max(0, state.marcadorVisitTemp));
            if (state.marcadorLocalTemp === 3 && state.marcadorVisitTemp === 3) {
                state.marcadorVisitTemp = 2;
            }
        }

        // Renderizar encabezado y nombres
        document.getElementById('mesa-meta').innerHTML = `
            <strong>${torneo.toUpperCase()}</strong> &bull; ${cancha} &bull; Jornada ${jornada} &bull; Partido #${id}
            ${deporteNom ? ` &bull; <span style="color:#ff0044; font-weight:700;">${deporteNom.toUpperCase()}</span>` : ''}
        `;
        document.getElementById('mesa-nom-local').textContent = local;
        document.getElementById('mesa-nom-visit').textContent = visit;
        document.getElementById('mesa-score-local').textContent = state.marcadorLocalTemp;
        document.getElementById('mesa-score-visit').textContent = state.marcadorVisitTemp;

        // Adaptar controles y sub-estados según la naturaleza del deporte
        adaptarMesaSegunDeporte(deporteNorm, partido.estadoDetalle || partido.EstadoDetalle);

        // Estado general y Minuto
        const estGenCarga = (partido.estado || partido.Estado || 'PROGRAMADO').toUpperCase();
        const estDetCarga = (partido.estadoDetalle || partido.EstadoDetalle || '').toUpperCase();
        const esSuspCarga = (estGenCarga === 'SUSPENDIDO' || estDetCarga === 'SUSPENDIDO');

        document.getElementById('mesa-estado-general').value = esSuspCarga ? 'SUSPENDIDO' : estGenCarga;
        const inputMinuto = document.getElementById('mesa-minuto-actual');
        if (inputMinuto) {
            inputMinuto.value = partido.minutoActual ?? partido.MinutoActual ?? '';
        }

        actualizarBadgeVivo(esSuspCarga ? 'SUSPENDIDO' : partido.estado);
        actualizarTimestampSync();
        verificarBotonFinalizarBaloncesto();
        actualizarControlesOperativosMesa();

        if (deporteNorm === 'BALONCESTO') {
            const timerBal = obtenerEstadoTimerBaloncesto(id);
            const estaPausado = (estDetCarga === 'PAUSA' || estDetCarga === 'TIEMPO MUERTO' || estDetCarga === 'T. MUERTO' ||
                                 estDetCarga === 'PAUSA Q1' || estDetCarga === 'DESCANSO' || estDetCarga === 'PAUSA Q3' ||
                                 estDetCarga === 'PAUSA EXTRA TIEMPO' ||
                                 estDetCarga === 'FINALIZADO' || esSuspCarga);

            if (estGenCarga === 'EN_JUEGO' && !estaPausado) {
                if (timerBal && timerBal.running) {
                    const elapsed = timerBal.startTimestamp ? Math.floor((Date.now() - timerBal.startTimestamp) / 1000) : 0;
                    const baseSegs = timerBal.segundosNetos !== undefined ? timerBal.segundosNetos : (timerBal.accumulatedSeconds || 0);
                    const totalSeg = baseSegs + elapsed;
                    segundosBaloncestoNeto = totalSeg;

                    const limitePeriodo = obtenerLimitePeriodoBaloncesto(estDetCarga, partido.minutoActual || 1);
                    const limiteSegundos = limitePeriodo * 60;
                    const basePeriodo = obtenerSegundosBasePeriodoBaloncesto(estDetCarga, partido.minutoActual || 1);
                    const segsCuarto = Math.max(0, totalSeg - basePeriodo);
                    const minReal = (totalSeg >= limiteSegundos) ? limitePeriodo : calcularMinutoBaloncesto(estDetCarga, totalSeg, limitePeriodo, basePeriodo, segsCuarto);

                    if (inputMinuto) inputMinuto.value = minReal;

                    guardarEstadoTimerBaloncesto(id, {
                        running: true,
                        startTimestamp: Date.now(),
                        segundosNetos: totalSeg,
                        minutoActual: minReal,
                        periodo: estDetCarga
                    });
                } else if (!timerBal) {
                    const minAct = partido.minutoActual ?? 1;
                    const baseSegs = obtenerSegundosBasePeriodoBaloncesto(estDetCarga, minAct);
                    segundosBaloncestoNeto = baseSegs;
                    guardarEstadoTimerBaloncesto(id, {
                        running: true,
                        startTimestamp: Date.now(),
                        segundosNetos: baseSegs,
                        minutoActual: minAct,
                        periodo: estDetCarga
                    });
                }
                iniciarCronometroBaloncesto(false);
            } else {
                detenerCronometroBaloncesto(false);
                limpiarEstadoTimerBaloncesto(id);
            }
        }

        if (deporteNorm === 'FUTBOL') {
            const timerFut = obtenerEstadoTimerFutbol(id);
            const estaPausado = (estDetCarga === 'DESCANSO' || estDetCarga === 'ENTRETIEMPO' ||
                                 estDetCarga === 'FINALIZADO' || esSuspCarga ||
                                 estGenCarga === 'PROGRAMADO' || estGenCarga === 'RETRASADO');

            if (estGenCarga === 'EN_JUEGO' && !estaPausado) {
                if (timerFut && timerFut.running) {
                    const elapsed = timerFut.startTimestamp ? Math.floor((Date.now() - timerFut.startTimestamp) / 1000) : 0;
                    const baseSegs = timerFut.segundosNetos !== undefined ? timerFut.segundosNetos : 0;
                    const totalSeg = baseSegs + elapsed;
                    segundosFutbolNeto = totalSeg;

                    const minReal = (estDetCarga === '2T')
                        ? Math.min(90, Math.max(45, Math.floor(totalSeg / 60)))
                        : Math.min(45, Math.max(0, Math.floor(totalSeg / 60)));

                    if (inputMinuto) inputMinuto.value = minReal;

                    guardarEstadoTimerFutbol(id, {
                        running: true,
                        startTimestamp: Date.now(),
                        segundosNetos: totalSeg,
                        minutoActual: minReal,
                        periodo: estDetCarga
                    });
                    iniciarCronometroFutbol(false);
                }
            } else {
                detenerCronometroFutbol(false);
                if (estGenCarga === 'PROGRAMADO' || estGenCarga === 'RETRASADO') {
                    limpiarEstadoTimerFutbol(id);
                }
            }
        }

        if (deporteNorm === 'MICROFUTBOL') {
            const timerMicro = obtenerEstadoTimerMicrofutbol(id);
            const estaPausado = (estDetCarga === 'DESCANSO' || estDetCarga === 'ENTRETIEMPO' ||
                                 estDetCarga === 'FINALIZADO' || esSuspCarga ||
                                 estGenCarga === 'PROGRAMADO' || estGenCarga === 'RETRASADO');

            if (estGenCarga === 'EN_JUEGO' && !estaPausado) {
                if (timerMicro && timerMicro.running) {
                    const elapsed = timerMicro.startTimestamp ? Math.floor((Date.now() - timerMicro.startTimestamp) / 1000) : 0;
                    const baseSegs = timerMicro.segundosNetos !== undefined ? timerMicro.segundosNetos : 0;
                    const totalSeg = baseSegs + elapsed;
                    segundosMicrofutbolNeto = totalSeg;

                    const minReal = (estDetCarga === '2T')
                        ? Math.min(40, Math.max(20, Math.floor(totalSeg / 60)))
                        : Math.min(20, Math.max(0, Math.floor(totalSeg / 60)));

                    if (inputMinuto) inputMinuto.value = minReal;

                    guardarEstadoTimerMicrofutbol(id, {
                        running: true,
                        startTimestamp: Date.now(),
                        segundosNetos: totalSeg,
                        minutoActual: minReal,
                        periodo: estDetCarga
                    });
                    iniciarCronometroMicrofutbol(false);
                }
            } else {
                detenerCronometroMicrofutbol(false);
                if (estGenCarga === 'PROGRAMADO' || estGenCarga === 'RETRASADO') {
                    limpiarEstadoTimerMicrofutbol(id);
                }
            }
        }

        if (estGenCarga === 'EN_JUEGO') {
            gestorPartidosEnJuego.set(String(id), partido);
        }

        // Inicializar conteo de Outs para Béisbol y Sóftbol
        if (deporteNorm === 'BEISBOL' || deporteNorm === 'SOFTBOL') {
            const rawOuts = partido.minutoActual ?? 0;
            outsActuales = Math.min(2, Math.max(0, rawOuts));
            actualizarDisplayOuts();
            await sincronizarInningsBeisbolDesdeBD(id, partido.equipoLocalId || partido.EquipoLocalId);
        }

        // Inicializar datos y parciales para Voleibol
        if (deporteNorm === 'VOLEIBOL') {
            await sincronizarVoleibolDesdeBD(id, partido.equipoLocalId || partido.EquipoLocalId);
            actualizarDisplayVoleibolMesa();
            if (state.marcadorLocalTemp >= 3 || state.marcadorVisitTemp >= 3 || (partido.estado || partido.Estado) === 'FINALIZADO') {
                bloquearControlesVoleibolFinalizado();
            } else {
                desbloquearControlesPuntos();
            }
        }

        // Cargar selectores de jugadores por equipo de forma aislada
        await poblarSelectoresJugadores(partido);

        // Solo si es Fútbol o Microfútbol cargamos incidencias
        if (deporteNorm === 'FUTBOL' || deporteNorm === 'MICROFUTBOL') {
            configurarSelectTipoIncidencias(deporteNorm);
            await cargarEventosPartidoMesa(id);

            // Asegurar que el input de incidencias permanezca editable libremente por teclado
            configurarInputMinutoIncidencias();
        }

    } catch (err) {
        console.error('Error cargando partido a mesa:', err);
        mostrarToast(err.message, 'error');
    }
}

// Sincronización en vivo silenciosa mediante polling
async function sincronizarPartidoMesaEnVivo(partidoId) {
    try {
        const deporteNorm = obtenerDeporteDePartido(state.partidoActivoMesa);
        const esFutbolOMicro = (deporteNorm === 'FUTBOL' || deporteNorm === 'MICROFUTBOL');

        const peticiones = [fetch(`${API_URL}/partidos/${partidoId}`)];
        if (esFutbolOMicro) {
            peticiones.push(fetch(`${API_URL}/eventospartido/partido/${partidoId}`));
        }

        const respuestas = await Promise.all(peticiones);
        const resPart = respuestas[0];
        const resEv = esFutbolOMicro ? respuestas[1] : null;

        if (resPart.ok) {
            const partido = await resPart.json();
            state.partidoActivoMesa = partido;

            // Actualizar tablero
            state.marcadorLocalTemp = partido.puntosLocal ?? partido.PuntosLocal ?? 0;
            state.marcadorVisitTemp = partido.puntosVisitante ?? partido.PuntosVisitante ?? 0;
            
            const elLocal = document.getElementById('mesa-score-local');
            const elVisit = document.getElementById('mesa-score-visit');
            if (elLocal) elLocal.textContent = state.marcadorLocalTemp;
            if (elVisit) elVisit.textContent = state.marcadorVisitTemp;
            verificarBotonFinalizarBaloncesto();

            const estGenSync = (partido.estado || partido.Estado || 'PROGRAMADO').toUpperCase();
            let estDetSync = (partido.estadoDetalle || partido.EstadoDetalle || '').toUpperCase();
            const esSuspSync = (estGenSync === 'SUSPENDIDO' || estDetSync === 'SUSPENDIDO');

            // Actualizar minuto si no está en foco por el usuario y si el cronómetro no está corriendo activamente
            const inputMinuto = document.getElementById('mesa-minuto-actual');
            const timerBal = obtenerEstadoTimerBaloncesto(partidoId);
            const timerFut = obtenerEstadoTimerFutbol(partidoId);
            const timerMicro = obtenerEstadoTimerMicrofutbol(partidoId);
            if (deporteNorm === 'BALONCESTO' && timerBal && timerBal.running) {
                const transcurrido = timerBal.startTimestamp ? Math.floor((Date.now() - timerBal.startTimestamp) / 1000) : 0;
                const baseSegs = timerBal.segundosNetos !== undefined ? timerBal.segundosNetos : (timerBal.accumulatedSeconds || 0);
                const totalSeg = baseSegs + transcurrido;
                const limitePeriodo = obtenerLimitePeriodoBaloncesto(estDetSync, inputMinuto ? parseInt(inputMinuto.value) : 1);
                const minReal = (totalSeg >= limitePeriodo * 60) ? limitePeriodo : Math.min(limitePeriodo, Math.floor(totalSeg / 60) + 1);
                if (inputMinuto && document.activeElement !== inputMinuto) {
                    inputMinuto.value = minReal;
                }
            } else if (deporteNorm === 'FUTBOL' && timerFut && timerFut.running) {
                const transcurrido = timerFut.startTimestamp ? Math.floor((Date.now() - timerFut.startTimestamp) / 1000) : 0;
                const baseSegs = timerFut.segundosNetos !== undefined ? timerFut.segundosNetos : 0;
                const totalSeg = baseSegs + transcurrido;
                const minReal = (estDetSync === '2T')
                    ? Math.min(90, Math.max(45, Math.floor(totalSeg / 60)))
                    : Math.min(45, Math.max(0, Math.floor(totalSeg / 60)));
                if (inputMinuto && document.activeElement !== inputMinuto) {
                    inputMinuto.value = minReal;
                }
            } else if (deporteNorm === 'MICROFUTBOL' && timerMicro && timerMicro.running) {
                const transcurrido = timerMicro.startTimestamp ? Math.floor((Date.now() - timerMicro.startTimestamp) / 1000) : 0;
                const baseSegs = timerMicro.segundosNetos !== undefined ? timerMicro.segundosNetos : 0;
                const totalSeg = baseSegs + transcurrido;
                const minReal = (estDetSync === '2T')
                    ? Math.min(40, Math.max(20, Math.floor(totalSeg / 60)))
                    : Math.min(20, Math.max(0, Math.floor(totalSeg / 60)));
                if (inputMinuto && document.activeElement !== inputMinuto) {
                    inputMinuto.value = minReal;
                }
            } else if (inputMinuto && document.activeElement !== inputMinuto && !cronometroBaloncestoInterval && !cronometroFutbolInterval && !cronometroMicrofutbolInterval) {
                inputMinuto.value = partido.minutoActual ?? partido.MinutoActual ?? '';
            }

            const selectDetalle = document.getElementById('mesa-estado-detalle');
            if (selectDetalle && document.activeElement !== selectDetalle && selectDetalle.dataset.userModified !== 'true') {
                const det = estDetSync;
                if (det && Array.from(selectDetalle.options).some(o => o.value === det)) {
                    selectDetalle.value = det;
                }
            }

            const selectEstado = document.getElementById('mesa-estado-general');
            if (selectEstado && document.activeElement !== selectEstado && selectEstado.dataset.userModified !== 'true') {
                selectEstado.value = esSuspSync ? 'SUSPENDIDO' : estGenSync;
            }

            actualizarBadgeVivo(esSuspSync ? 'SUSPENDIDO' : partido.estado);
            actualizarTimestampSync();
            verificarBotonFinalizarBaloncesto();
            actualizarControlesOperativosMesa();
            verificarKnockoutBeisbolSoftbol();
            if (deporteNorm === 'BEISBOL' || deporteNorm === 'SOFTBOL') {
                const rawOuts = partido.minutoActual ?? 0;
                outsActuales = Math.min(2, Math.max(0, rawOuts));
                actualizarDisplayOuts();
                actualizarRolesBateadorLanzador(deporteNorm, selectDetalle ? selectDetalle.value : '');
            }
            if (deporteNorm === 'VOLEIBOL') {
                actualizarDisplayVoleibolMesa();
            }
        }

        if (resEv && resEv.ok) {
            const eventos = await resEv.json();
            renderizarTablaEventos(eventos);
        }
    } catch (err) {
        console.warn('Auto-sync mesa en vivo no pudo completarse en este ciclo:', err);
    }
}

function actualizarBadgeVivo(estado) {
    const badgeVivo = document.getElementById('mesa-badge-vivo');
    if (!badgeVivo) return;

    let est = (estado || '').toUpperCase();
    const estDet = (state.partidoActivoMesa?.estadoDetalle || state.partidoActivoMesa?.EstadoDetalle || document.getElementById('mesa-estado-detalle')?.value || '').toUpperCase();
    if (est === 'SUSPENDIDO' || estDet === 'SUSPENDIDO') {
        est = 'SUSPENDIDO';
    } else if (state.partidoActivoMesa && (est === 'PROGRAMADO' || est === 'PENDIENTE' || !est)) {
        const fh = state.partidoActivoMesa.fechaHora || state.partidoActivoMesa.FechaHora;
        const esFh = fh && !fh.startsWith('2099');
        const dtLocal = parsearFechaHoraLocal(fh);
        const yaPaso = esFh && dtLocal && (dtLocal.getTime() <= (Date.now() - 60000));
        if (esFh ? yaPaso : (estDet === 'RETRASADO')) {
            est = 'RETRASADO';
        }
    }

    if (estDet === 'PENALES' || est === 'PENALES') {
        badgeVivo.textContent = '⏸ PENALES';
        badgeVivo.style.backgroundColor = 'rgba(225, 29, 72, 0.2)';
        badgeVivo.style.borderColor = '#e11d48';
        badgeVivo.style.color = '#fb7185';
    } else if (estDet === 'PAUSA EXTRA TIEMPO') {
        badgeVivo.textContent = '⏸ PAUSA EXTRA TIEMPO';
        badgeVivo.style.backgroundColor = 'rgba(124, 58, 237, 0.2)';
        badgeVivo.style.borderColor = '#7c3aed';
        badgeVivo.style.color = '#a78bfa';
    } else if (estDet === 'PAUSA Q1') {
        badgeVivo.textContent = '⏸ PAUSA Q1';
        badgeVivo.style.backgroundColor = 'rgba(245, 158, 11, 0.2)';
        badgeVivo.style.borderColor = '#f59e0b';
        badgeVivo.style.color = '#f59e0b';
    } else if (estDet === 'DESCANSO' || estDet === 'ENTRETIEMPO') {
        badgeVivo.textContent = '⏸ DESCANSO';
        badgeVivo.style.backgroundColor = 'rgba(245, 158, 11, 0.2)';
        badgeVivo.style.borderColor = '#f59e0b';
        badgeVivo.style.color = '#f59e0b';
    } else if (estDet === 'PAUSA Q3') {
        badgeVivo.textContent = '⏸ PAUSA Q3';
        badgeVivo.style.backgroundColor = 'rgba(245, 158, 11, 0.2)';
        badgeVivo.style.borderColor = '#f59e0b';
        badgeVivo.style.color = '#f59e0b';
    } else if (estDet === 'TIEMPO MUERTO' || estDet === 'T. MUERTO') {
        badgeVivo.textContent = '⏸ TIEMPO MUERTO';
        badgeVivo.style.backgroundColor = 'rgba(236, 72, 153, 0.2)';
        badgeVivo.style.borderColor = '#ec4899';
        badgeVivo.style.color = '#f472b6';
    } else if (estDet === 'PAUSA' || est === 'PAUSA') {
        badgeVivo.textContent = '⏸ PAUSA';
        badgeVivo.style.backgroundColor = 'rgba(245, 158, 11, 0.2)';
        badgeVivo.style.borderColor = '#f59e0b';
        badgeVivo.style.color = '#f59e0b';
    } else if (est === 'EN_JUEGO' || est === 'EN VIVO') {
        badgeVivo.textContent = '🔴 EN VIVO';
        badgeVivo.style.backgroundColor = 'rgba(255, 0, 68, 0.2)';
        badgeVivo.style.borderColor = '#ff0044';
        badgeVivo.style.color = '#ff0044';
    } else if (est === 'FINALIZADO') {
        badgeVivo.textContent = '🏁 FINALIZADO';
        badgeVivo.style.backgroundColor = 'rgba(46, 213, 115, 0.2)';
        badgeVivo.style.borderColor = '#2ed573';
        badgeVivo.style.color = '#2ed573';
    } else if (est === 'RETRASADO') {
        badgeVivo.textContent = '⏳ RETRASADO';
        badgeVivo.style.backgroundColor = 'rgba(245, 158, 11, 0.2)';
        badgeVivo.style.borderColor = '#f59e0b';
        badgeVivo.style.color = '#f59e0b';
    } else if (est === 'SUSPENDIDO') {
        badgeVivo.textContent = '⚠️ SUSPENDIDO';
        badgeVivo.style.backgroundColor = 'rgba(217, 119, 6, 0.2)';
        badgeVivo.style.borderColor = '#d97706';
        badgeVivo.style.color = '#fbbf24';
    } else if (est === 'APLAZADO' || est === 'CANCELADO') {
        badgeVivo.textContent = `🛑 ${est}`;
        badgeVivo.style.backgroundColor = 'rgba(107, 114, 128, 0.2)';
        badgeVivo.style.borderColor = '#6b7280';
        badgeVivo.style.color = '#9ca3af';
    } else {
        badgeVivo.textContent = '📅 PROGRAMADO';
        badgeVivo.style.backgroundColor = 'rgba(113, 89, 193, 0.2)';
        badgeVivo.style.borderColor = '#7159c1';
        badgeVivo.style.color = '#7159c1';
    }
}

function actualizarTimestampSync() {
    const el = document.getElementById('mesa-sync-time');
    if (el) {
        const ahora = new Date();
        el.textContent = `Sincronizado: ${ahora.toLocaleTimeString('es-CO')}`;
    }
}

async function sincronizarInningsBeisbolDesdeBD(partidoId, localId) {
    try {
        const res = await fetch(`${API_URL}/eventospartido/partido/${partidoId}`);
        if (!res.ok) return;
        const evs = await res.json();
        const bInn = { loc: {}, vis: {} };
        evs.forEach(ev => {
            const tipo = (ev.tipoEvento || ev.TipoEvento || '').toUpperCase();
            if (tipo === 'CARRERA') {
                const eqId = ev.equipoId || ev.EquipoId;
                const perStr = String(ev.minutoOPeriodo || ev.MinutoOPeriodo || '1').toUpperCase();
                let innKey = '1';
                if (perStr.includes('EE') || perStr.includes('EXTRA')) {
                    innKey = 'EE';
                } else {
                    const m = perStr.match(/(\d+)/);
                    innKey = m ? m[1] : '1';
                }
                const side = (String(eqId) === String(localId)) ? 'loc' : 'vis';
                const val = Number(ev.valorPuntos || ev.ValorPuntos || 1);
                bInn[side][innKey] = (bInn[side][innKey] || 0) + val;
            }
        });
        if (evs.length > 0) {
            localStorage.setItem(`baseball_innings_${partidoId}`, JSON.stringify(bInn));
        }
    } catch (e) {
        console.warn('No fue posible sincronizar eventos de carreras desde BD:', e);
    }
}

// ============================================================================
// AUTOMATIZACIÓN Y SINCRONIZACIÓN DE VOLEIBOL (MESA TÉCNICA)
// ============================================================================
function obtenerSetsVoleibol(partidoId) {
    let vSets = { "1": { loc: 0, vis: 0 }, "2": { loc: 0, vis: 0 }, "3": { loc: 0, vis: 0 }, "4": { loc: 0, vis: 0 }, "5": { loc: 0, vis: 0 } };
    try {
        const raw = localStorage.getItem(`volley_sets_${partidoId}`);
        if (raw) {
            const parsed = JSON.parse(raw);
            vSets = { ...vSets, ...parsed };
        }
    } catch (e) {}
    return vSets;
}

function guardarSetsVoleibol(partidoId, vSets) {
    try {
        localStorage.setItem(`volley_sets_${partidoId}`, JSON.stringify(vSets));
    } catch (e) {}
}

async function sincronizarVoleibolDesdeBD(partidoId, localId) {
    try {
        const res = await fetch(`${API_URL}/eventospartido/partido/${partidoId}`);
        if (!res.ok) return;
        const evs = await res.json();
        const vSets = { "1": { loc: 0, vis: 0 }, "2": { loc: 0, vis: 0 }, "3": { loc: 0, vis: 0 }, "4": { loc: 0, vis: 0 }, "5": { loc: 0, vis: 0 } };
        let hayPuntos = false;
        evs.forEach(ev => {
            const tipo = (ev.tipoEvento || ev.TipoEvento || '').toUpperCase();
            if (tipo === 'PUNTO' || tipo === 'SET' || tipo === 'CARRERA') {
                const eqId = ev.equipoId || ev.EquipoId;
                const perStr = String(ev.minutoOPeriodo || ev.MinutoOPeriodo || '1');
                const m = perStr.match(/(\d+)/);
                const setKey = m ? m[1] : '1';
                if (!vSets[setKey]) vSets[setKey] = { loc: 0, vis: 0 };
                const side = (String(eqId) === String(localId)) ? 'loc' : 'vis';
                const val = Number(ev.valorPuntos || ev.ValorPuntos || 1);
                vSets[setKey][side] = (vSets[setKey][side] || 0) + val;
                hayPuntos = true;
            }
        });
        if (hayPuntos) {
            guardarSetsVoleibol(partidoId, vSets);
        }
    } catch (e) {
        console.warn('No fue posible sincronizar eventos de voleibol desde BD:', e);
    }
}

function bloquearControlesVoleibolFinalizado() {
    // 1. Selector de sub-estado fijado en FINALIZADO
    const selectDetalle = document.getElementById('mesa-estado-detalle');
    if (selectDetalle) {
        selectDetalle.value = 'FINALIZADO';
        selectDetalle.disabled = true;
    }
    // 2. Estado general fijado en FINALIZADO
    const estadoGen = document.getElementById('mesa-estado-general');
    if (estadoGen) {
        estadoGen.value = 'FINALIZADO';
    }
    // 3. Deshabilita por completo (disabled = true) los botones '+1' y '-1' de ambos equipos
    const btnsScore = document.querySelectorAll('.btn-score-adjust');
    btnsScore.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.35';
        btn.style.pointerEvents = 'none';
        btn.style.cursor = 'not-allowed';
        btn.title = 'Partido de Voleibol Finalizado (máximo 3 sets alcanzados).';
    });
}

function desbloquearControlesPuntos() {
    const selectDetalle = document.getElementById('mesa-estado-detalle');
    if (selectDetalle) {
        selectDetalle.disabled = false;
    }
    const btnsScore = document.querySelectorAll('.btn-score-adjust');
    btnsScore.forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.style.cursor = 'pointer';
        btn.title = '';
    });
}

function actualizarDisplayVoleibolMesa() {
    if (!state.partidoActivoMesa) return;
    const depNorm = obtenerDeporteDePartido(state.partidoActivoMesa);
    if (depNorm !== 'VOLEIBOL') return;

    // Normalización estricta: en Voleibol ningún equipo puede tener más de 3 sets ni puede haber empate 3-3
    let setsLoc = Math.min(3, Math.max(0, state.marcadorLocalTemp || 0));
    let setsVis = Math.min(3, Math.max(0, state.marcadorVisitTemp || 0));
    if (setsLoc === 3 && setsVis === 3) {
        setsVis = 2; // Forzar máximo reglamentario FIVB (3-2)
    }
    state.marcadorLocalTemp = setsLoc;
    state.marcadorVisitTemp = setsVis;

    const pId = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
    const vSets = obtenerSetsVoleibol(pId);
    const selectDetalle = document.getElementById('mesa-estado-detalle');
    const estadoGen = (document.getElementById('mesa-estado-general')?.value || '').toUpperCase();
    const detVal = selectDetalle ? (selectDetalle.value || 'SET 1').toUpperCase() : 'SET 1';

    const esFinalizado = (setsLoc >= 3 || setsVis >= 3 || detVal === 'FINALIZADO' || estadoGen === 'FINALIZADO');

    if (esFinalizado) {
        bloquearControlesVoleibolFinalizado();
    } else {
        desbloquearControlesPuntos();
    }

    let setKey = '1';
    const m = detVal.match(/(\d+)/);
    if (m) setKey = m[1];

    // Actualizar badges de Sets ganados
    const elSetsLoc = document.getElementById('mesa-sets-val-local');
    const elSetsVis = document.getElementById('mesa-sets-val-visit');
    if (elSetsLoc) elSetsLoc.textContent = setsLoc;
    if (elSetsVis) elSetsVis.textContent = setsVis;

    // Actualizar marcadores táctiles grandes con los puntos del set activo
    const elScoreLoc = document.getElementById('mesa-score-local');
    const elScoreVis = document.getElementById('mesa-score-visit');
    const currentPoints = vSets[setKey] || { loc: 0, vis: 0 };

    if (!esFinalizado && detVal !== 'FINALIZADO') {
        if (elScoreLoc) elScoreLoc.textContent = currentPoints.loc;
        if (elScoreVis) elScoreVis.textContent = currentPoints.vis;
    } else {
        if (elScoreLoc) elScoreLoc.textContent = setsLoc;
        if (elScoreVis) elScoreVis.textContent = setsVis;
    }

    // Actualizar resumen visual de parciales (máximo 5 sets en total: 3-0, 3-1 o 3-2)
    const summaryEl = document.getElementById('mesa-vol-summary');
    if (summaryEl) {
        const totalSetsDisputados = esFinalizado ? (setsLoc + setsVis) : Math.min(5, Math.max(parseInt(setKey) || 1, setsLoc + setsVis + 1));
        let parts = [];
        for (let s = 1; s <= 5; s++) {
            const sk = String(s);
            const data = vSets[sk];
            const isCurrent = (sk === setKey && !esFinalizado);
            if (s <= totalSetsDisputados && data && (data.loc > 0 || data.vis > 0 || isCurrent || s <= (setsLoc + setsVis))) {
                const badgeStyle = isCurrent 
                    ? 'color: #ff0044; font-weight: 800; border-bottom: 2px solid #ff0044;' 
                    : 'color: #2ed573;';
                parts.push(`<span style="${badgeStyle}">Set ${s}: ${data ? data.loc : 0}-${data ? data.vis : 0}${isCurrent ? ' 🔴' : ''}</span>`);
            } else {
                parts.push(`<span style="color: #666;">Set ${s}: -</span>`);
            }
        }
        summaryEl.innerHTML = `<span style="color:#8d8d99; margin-right: 8px;">🏐 PARCIALES:</span> ${parts.join(' &nbsp;|&nbsp; ')}`;
    }
}

window.ajustarPuntos = async function(lado, delta) {
    if (!state.partidoActivoMesa) {
        mostrarToast('Primero selecciona un partido para operar la mesa técnica.', 'error');
        return;
    }

    const depNorm = obtenerDeporteDePartido(state.partidoActivoMesa);
    const pId = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;

    if (depNorm === 'BEISBOL' || depNorm === 'SOFTBOL') {
        const selectDetalle = document.getElementById('mesa-estado-detalle');
        const valDetalle = selectDetalle ? selectDetalle.value : '';

        let inningKey = '1';
        const detUpper = (valDetalle || '').toUpperCase();
        if (detUpper.includes('EE') || detUpper.includes('EXTRA')) {
            inningKey = 'EE';
        } else {
            const m = detUpper.match(/(\d+)/);
            inningKey = m ? m[1] : '1';
        }

        const sideKey = (lado === 'local') ? 'loc' : 'vis';
        const teamId = (lado === 'local')
            ? (state.partidoActivoMesa.equipoLocalId || state.partidoActivoMesa.EquipoLocalId)
            : (state.partidoActivoMesa.equipoVisitanteId || state.partidoActivoMesa.EquipoVisitanteId);

        let bInn = { loc: {}, vis: {} };
        try {
            const raw = localStorage.getItem(`baseball_innings_${pId}`);
            if (raw) bInn = JSON.parse(raw);
        } catch (e) {}
        if (!bInn.loc) bInn.loc = {};
        if (!bInn.vis) bInn.vis = {};

        const runsEnEstaEntrada = bInn[sideKey][inningKey] || 0;

        if (delta < 0 && runsEnEstaEntrada <= 0) {
            mostrarToast(`No hay carreras para restar en la entrada ${inningKey} para este equipo.`, 'info');
            return;
        }

        if (delta > 0) {
            bInn[sideKey][inningKey] = runsEnEstaEntrada + 1;
            if (inningKey !== 'EE') {
                const numK = parseInt(inningKey);
                if (!isNaN(numK)) {
                    bInn.maxInning = Math.max(bInn.maxInning || 0, numK);
                }
            } else {
                bInn.esEE = true;
            }

            if (lado === 'local') {
                state.marcadorLocalTemp = (state.marcadorLocalTemp || 0) + 1;
            } else {
                state.marcadorVisitTemp = (state.marcadorVisitTemp || 0) + 1;
            }

            localStorage.setItem(`baseball_innings_${pId}`, JSON.stringify(bInn));

            try {
                await fetch(`${API_URL}/eventospartido`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        partidoId: pId,
                        equipoId: teamId,
                        tipoEvento: 'CARRERA',
                        minutoOPeriodo: String(inningKey),
                        valorPuntos: 1,
                        comentario: `Carrera en Entrada ${inningKey}`
                    })
                });
            } catch (err) {
                console.warn('Error guardando carrera en backend:', err);
            }
        } else if (delta < 0) {
            bInn[sideKey][inningKey] = Math.max(0, runsEnEstaEntrada - 1);
            if (lado === 'local') {
                state.marcadorLocalTemp = Math.max(0, (state.marcadorLocalTemp || 0) - 1);
            } else {
                state.marcadorVisitTemp = Math.max(0, (state.marcadorVisitTemp || 0) - 1);
            }

            localStorage.setItem(`baseball_innings_${pId}`, JSON.stringify(bInn));

            try {
                const resEv = await fetch(`${API_URL}/eventospartido/partido/${pId}`);
                if (resEv.ok) {
                    const evs = await resEv.json();
                    const evParaBorrar = evs.slice().reverse().find(e => 
                        String(e.equipoId || e.EquipoId) === String(teamId) &&
                        String(e.minutoOPeriodo || e.MinutoOPeriodo).toUpperCase() === String(inningKey).toUpperCase() &&
                        (e.tipoEvento || e.TipoEvento || '').toUpperCase() === 'CARRERA'
                    );
                    if (evParaBorrar) {
                        const evId = evParaBorrar.id || evParaBorrar.Id;
                        await fetch(`${API_URL}/eventospartido/${evId}`, { method: 'DELETE' });
                    }
                }
            } catch (err) {
                console.warn('Error eliminando carrera en backend:', err);
            }
        }

        const elem = document.getElementById(lado === 'local' ? 'mesa-score-local' : 'mesa-score-visit');
        if (elem) {
            elem.textContent = (lado === 'local') ? state.marcadorLocalTemp : state.marcadorVisitTemp;
            animarScore(elem);
        }

        verificarKnockoutBeisbolSoftbol();
        await guardarMarcadorMesa();
        return;
    }

    if (depNorm === 'VOLEIBOL') {
        const selectDetalle = document.getElementById('mesa-estado-detalle');
        let valDetalle = selectDetalle ? (selectDetalle.value || 'SET 1').toUpperCase() : 'SET 1';
        const estadoGen = (document.getElementById('mesa-estado-general')?.value || '').toUpperCase();

        const setsLocActual = state.marcadorLocalTemp || 0;
        const setsVisActual = state.marcadorVisitTemp || 0;

        // Bloqueo estricto: si un equipo ya tiene 3 sets o el partido está FINALIZADO
        if (setsLocActual >= 3 || setsVisActual >= 3 || valDetalle === 'FINALIZADO' || estadoGen === 'FINALIZADO') {
            bloquearControlesVoleibolFinalizado();
            mostrarToast('⛔ El partido de Voleibol ya ha FINALIZADO (se alcanzaron 3 sets ganados). Los controles están bloqueados.', 'error');
            return;
        }

        let setKey = '1';
        const m = (valDetalle || '').match(/(\d+)/);
        if (m) setKey = m[1];
        let setNum = parseInt(setKey) || 1;
        if (setNum > 5) setNum = 5;

        // Si ya se jugaron 5 sets en total, bloquear para evitar sets extra
        if (setsLocActual + setsVisActual >= 5) {
            bloquearControlesVoleibolFinalizado();
            mostrarToast('⛔ En Voleibol el máximo de sets es 5. El partido debe quedar FINALIZADO.', 'error');
            return;
        }

        const vSets = obtenerSetsVoleibol(pId);
        if (!vSets[setKey]) vSets[setKey] = { loc: 0, vis: 0 };

        const sideKey = (lado === 'local') ? 'loc' : 'vis';
        const teamId = (lado === 'local')
            ? (state.partidoActivoMesa.equipoLocalId || state.partidoActivoMesa.EquipoLocalId)
            : (state.partidoActivoMesa.equipoVisitanteId || state.partidoActivoMesa.EquipoVisitanteId);

        const nomLocal = state.partidoActivoMesa.equipoLocalNombre || state.partidoActivoMesa.EquipoLocalNombre || obtenerNombreEquipo(state.partidoActivoMesa.equipoLocalId || state.partidoActivoMesa.EquipoLocalId);
        const nomVisit = state.partidoActivoMesa.equipoVisitanteNombre || state.partidoActivoMesa.EquipoVisitanteNombre || obtenerNombreEquipo(state.partidoActivoMesa.equipoVisitanteId || state.partidoActivoMesa.EquipoVisitanteId);

        if (delta < 0 && vSets[setKey][sideKey] <= 0) {
            mostrarToast(`No hay puntos para restar en el Set ${setKey} para este equipo.`, 'info');
            return;
        }

        if (delta > 0) {
            vSets[setKey][sideKey] += 1;
            try {
                fetch(`${API_URL}/eventospartido`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        partidoId: pId,
                        equipoId: teamId,
                        tipoEvento: 'PUNTO',
                        minutoOPeriodo: String(setKey),
                        valorPuntos: 1,
                        comentario: `Punto en Set ${setKey}`
                    })
                }).catch(() => {});
            } catch (e) {}
        } else {
            vSets[setKey][sideKey] = Math.max(0, vSets[setKey][sideKey] - 1);
            try {
                fetch(`${API_URL}/eventospartido/partido/${pId}`)
                    .then(res => res.json())
                    .then(evs => {
                        const evParaBorrar = evs.slice().reverse().find(e => 
                            String(e.equipoId || e.EquipoId) === String(teamId) &&
                            String(e.minutoOPeriodo || e.MinutoOPeriodo) === String(setKey) &&
                            (e.tipoEvento || e.TipoEvento || '').toUpperCase() === 'PUNTO'
                        );
                        if (evParaBorrar) {
                            fetch(`${API_URL}/eventospartido/${evParaBorrar.id || evParaBorrar.Id}`, { method: 'DELETE' }).catch(() => {});
                        }
                    }).catch(() => {});
            } catch (e) {}
        }

        guardarSetsVoleibol(pId, vSets);

        // Reglas oficiales FIVB para ganar el set:
        // Sets 1 al 4: Mínimo 25 puntos y ventaja de 2 puntos.
        // Set 5 (Tie-break): Mínimo 15 puntos y ventaja de 2 puntos.
        const targetPuntos = (setNum === 5) ? 15 : 25;
        const ptsLoc = vSets[setKey].loc;
        const ptsVis = vSets[setKey].vis;

        const ganoLocal = (ptsLoc >= targetPuntos && (ptsLoc - ptsVis) >= 2);
        const ganoVisit = (ptsVis >= targetPuntos && (ptsVis - ptsLoc) >= 2);

        if (ganoLocal || ganoVisit) {
            const nomGanadorSet = ganoLocal ? nomLocal : nomVisit;
            if (ganoLocal) {
                state.marcadorLocalTemp = Math.min(3, (state.marcadorLocalTemp || 0) + 1);
            } else {
                state.marcadorVisitTemp = Math.min(3, (state.marcadorVisitTemp || 0) + 1);
            }

            // Normalización estricta: nunca más de 3 sets ni empate 3-3
            let setsLoc = state.marcadorLocalTemp || 0;
            let setsVis = state.marcadorVisitTemp || 0;
            if (setsLoc >= 3 && setsVis >= 3) {
                if (ganoLocal) setsVis = 2;
                else setsLoc = 2;
                state.marcadorLocalTemp = setsLoc;
                state.marcadorVisitTemp = setsVis;
            }

            // Verificar si alguno alcanzó 3 sets ganados (BLOQUEO Y CIERRE DEFINITIVO)
            if (setsLoc >= 3 || setsVis >= 3) {
                const nomCampeon = setsLoc >= 3 ? nomLocal : nomVisit;
                const setsG = 3;
                let setsP = 0;

                if (setsLoc >= 3) {
                    state.marcadorLocalTemp = 3;
                    state.marcadorVisitTemp = Math.min(2, Math.max(0, setsVis));
                    setsP = state.marcadorVisitTemp;
                } else {
                    state.marcadorVisitTemp = 3;
                    state.marcadorLocalTemp = Math.min(2, Math.max(0, setsLoc));
                    setsP = state.marcadorLocalTemp;
                }

                document.getElementById('mesa-estado-general').value = 'FINALIZADO';
                if (selectDetalle) selectDetalle.value = 'FINALIZADO';
                
                bloquearControlesVoleibolFinalizado();
                actualizarDisplayVoleibolMesa();
                await guardarMarcadorMesa();

                // Avance automático en Playoffs si era partido de eliminación directa
                if (state.partidoActivoMesa) {
                    const fIdV = Number(state.partidoActivoMesa.faseId || state.partidoActivoMesa.FaseId || 0);
                    if (fIdV === 16 || fIdV === 8 || fIdV === 4 || fIdV === 2) {
                        await procesarAvancePlayoff(state.partidoActivoMesa, state.marcadorLocalTemp, state.marcadorVisitTemp);
                    }
                }

                const msgVictoria = `${nomCampeon} ha ganado el encuentro ${setsG} - ${setsP}`;
                mostrarToast(`🏆 ¡PARTIDO FINALIZADO! ${msgVictoria}.`, 'exito');
                await mostrarConfirmacionModal(
                    `🏆 ¡PARTIDO FINALIZADO OFICIALMENTE!\n\n${msgVictoria}.\n(Parcial Set ${setKey}: ${ptsLoc} - ${ptsVis})\n\nEl partido ha alcanzado 3 sets ganados y ha sido guardado oficialmente como FINALIZADO. Los controles han sido bloqueados.`,
                    '🏐 Partido Finalizado',
                    'Entendido',
                    ''
                );
                return;
            } else {
                // Avanzar automáticamente al siguiente Set (máximo Set 5)
                const nextSet = setNum + 1;
                if (nextSet <= 5) {
                    if (selectDetalle) selectDetalle.value = `SET ${nextSet}`;
                    if (!vSets[String(nextSet)]) vSets[String(nextSet)] = { loc: 0, vis: 0 };
                    guardarSetsVoleibol(pId, vSets);
                    
                    document.getElementById('mesa-estado-general').value = 'EN_JUEGO';
                    await guardarMarcadorMesa();
                    actualizarDisplayVoleibolMesa();

                    mostrarToast(`🏐 ¡Set ${setKey} finalizado! Ganó ${nomGanadorSet} (${ptsLoc} - ${ptsVis}). Avanzando automáticamente al Set ${nextSet}...`, 'exito');
                    return;
                } else {
                    const nomCampeon = setsLoc > setsVis ? nomLocal : nomVisit;
                    const setsG = Math.max(setsLoc, setsVis);
                    const setsP = Math.min(setsLoc, setsVis);
                    bloquearControlesVoleibolFinalizado();
                    actualizarDisplayVoleibolMesa();
                    await guardarMarcadorMesa();
                    mostrarToast(`🏆 ¡PARTIDO FINALIZADO! ${nomCampeon} ha ganado el encuentro ${setsG} - ${setsP}.`, 'exito');
                    return;
                }
            }
        }

        // Animar y refrescar display
        const elem = document.getElementById(lado === 'local' ? 'mesa-score-local' : 'mesa-score-visit');
        if (elem) animarScore(elem);
        actualizarDisplayVoleibolMesa();
        await guardarMarcadorMesa();
        return;
    }

    if (lado === 'local') {
        state.marcadorLocalTemp = Math.max(0, state.marcadorLocalTemp + delta);
        const elem = document.getElementById('mesa-score-local');
        elem.textContent = state.marcadorLocalTemp;
        animarScore(elem);
    } else {
        state.marcadorVisitTemp = Math.max(0, state.marcadorVisitTemp + delta);
        const elem = document.getElementById('mesa-score-visit');
        elem.textContent = state.marcadorVisitTemp;
        animarScore(elem);
    }

    verificarBotonFinalizarBaloncesto();
    verificarKnockoutBeisbolSoftbol();
    actualizarControlesOperativosMesa();
};

function verificarBotonFinalizarBaloncesto() {
    if (!state.partidoActivoMesa) return;
    const deporteNorm = obtenerDeporteDePartido(state.partidoActivoMesa);
    const btnFin = document.getElementById('btn-finalizar-partido-oficial');
    if (!btnFin) return;

    if (deporteNorm === 'BALONCESTO') {
        const inputMin = document.getElementById('mesa-minuto-actual');
        const minAct = inputMin ? (parseInt(inputMin.value) || 0) : 0;
        const selDet = document.getElementById('mesa-estado-detalle');
        const det = (selDet ? selDet.value : '').toUpperCase();
        const esPeriodoFinal = (minAct >= 40 || det === 'Q4' || det.includes('OT') || det.includes('OVERTIME'));

        if (state.marcadorLocalTemp === state.marcadorVisitTemp) {
            btnFin.disabled = true;
            btnFin.style.opacity = '0.5';
            btnFin.style.cursor = 'not-allowed';
            btnFin.style.background = 'transparent';
            btnFin.title = 'En Baloncesto no existen empates: Habilita el periodo OT (Prórroga) hasta definir un ganador.';
        } else {
            btnFin.disabled = false;
            btnFin.style.opacity = '1';
            btnFin.style.cursor = 'pointer';
            btnFin.title = 'Finalizar partido oficial con ganador definido';
            if (esPeriodoFinal) {
                btnFin.style.background = 'rgba(239, 68, 68, 0.2)';
                btnFin.style.borderColor = '#ef4444';
            } else {
                btnFin.style.background = 'transparent';
                btnFin.style.borderColor = '#ff4444';
            }
        }
    } else {
        btnFin.disabled = false;
        btnFin.style.opacity = '1';
        btnFin.style.cursor = 'pointer';
        btnFin.title = '';
    }
}

function animarScore(elem) {
    elem.style.transform = 'scale(1.2)';
    elem.style.color = '#2ed573';
    setTimeout(() => {
        elem.style.transform = 'scale(1)';
        elem.style.color = '#fff';
    }, 200);
}

// ============================================================================
// PANEL OPERATIVO HÍBRIDO (CONTROL DE PARTIDO, PERIODOS, PAUSAS Y PENALES)
// ============================================================================
function actualizarControlesOperativosMesa() {
    if (!state.partidoActivoMesa) return;

    const partido = state.partidoActivoMesa;
    const depNorm = obtenerDeporteDePartido(partido);
    const estado = (document.getElementById('mesa-estado-general')?.value || partido.estado || partido.Estado || 'PROGRAMADO').toUpperCase();
    const estadoDetalle = (document.getElementById('mesa-estado-detalle')?.value || partido.estadoDetalle || partido.EstadoDetalle || '').toUpperCase();
    const minutoVal = document.getElementById('mesa-minuto-actual')?.value;
    const ptsLoc = state.marcadorLocalTemp || 0;
    const ptsVis = state.marcadorVisitTemp || 0;

    const btnIniciar = document.getElementById('btn-mesa-iniciar');
    const btnSuspender = document.getElementById('btn-mesa-suspender');
    const btnReanudar = document.getElementById('btn-mesa-reanudar');
    const btnAplazar = document.getElementById('btn-mesa-aplazar');
    const btnFinPeriodo = document.getElementById('btn-mesa-fin-periodo');
    const btnSigPeriodo = document.getElementById('btn-mesa-siguiente-periodo');
    const btnPausaReloj = document.getElementById('btn-mesa-pausa-reloj');
    const btnTiempoMuerto = document.getElementById('btn-mesa-tiempo-muerto');
    const btnReanudarReloj = document.getElementById('btn-mesa-reanudar-reloj');
    const btnIniciarOT = document.getElementById('btn-mesa-iniciar-ot');
    const infoLabel = document.getElementById('mesa-operativo-info');

    const tieneReloj = (depNorm === 'FUTBOL' || depNorm === 'MICROFUTBOL' || depNorm === 'BALONCESTO');
    const esBaloncesto = (depNorm === 'BALONCESTO');
    const esMicro = (depNorm === 'MICROFUTBOL');

    // 1. Botón Iniciar (solo si PROGRAMADO o RETRASADO)
    if (estado === 'PROGRAMADO' || estado === 'RETRASADO') {
        btnIniciar?.classList.remove('hidden');
        btnSuspender?.classList.add('hidden');
        btnReanudar?.classList.add('hidden');
        btnAplazar?.classList.remove('hidden');
        btnFinPeriodo?.classList.add('hidden');
        btnSigPeriodo?.classList.add('hidden');
        btnPausaReloj?.classList.add('hidden');
        btnTiempoMuerto?.classList.add('hidden');
        btnReanudarReloj?.classList.add('hidden');
        btnIniciarOT?.classList.add('hidden');
        if (infoLabel) {
            infoLabel.innerHTML = (estado === 'RETRASADO')
                ? `<span style="color:#f59e0b; font-weight:800;">⏳ Partido Retrasado (Esperando pitazo inicial de Mesa Técnica)</span>`
                : `<span>📅 Partido Programado listo para iniciar</span>`;
        }
        return;
    }

    btnIniciar?.classList.add('hidden');

    // 2. Si el partido está SUSPENDIDO
    const esSuspendido = (estado === 'SUSPENDIDO' || estadoDetalle === 'SUSPENDIDO');
    if (esSuspendido) {
        btnSuspender?.classList.add('hidden');
        if (btnReanudar) {
            btnReanudar.classList.remove('hidden');
            btnReanudar.innerHTML = '▶ Reanudar Partido Suspendido';
            btnReanudar.style.background = '#10b981';
            btnReanudar.style.borderColor = '#10b981';
        }
        btnAplazar?.classList.remove('hidden');
        btnFinPeriodo?.classList.add('hidden');
        btnSigPeriodo?.classList.add('hidden');
        btnPausaReloj?.classList.add('hidden');
        btnTiempoMuerto?.classList.add('hidden');
        btnReanudarReloj?.classList.add('hidden');
        btnIniciarOT?.classList.add('hidden');
        if (infoLabel) {
            infoLabel.innerHTML = `<span style="color:#fbbf24; font-weight:800;">⚠️ Partido Suspendido (Minuto ${minutoVal || 0}' congelado)</span>`;
        }
        return;
    }

    // 3. Si el partido está FINALIZADO
    if (estado === 'FINALIZADO') {
        btnSuspender?.classList.add('hidden');
        btnReanudar?.classList.add('hidden');
        btnAplazar?.classList.add('hidden');
        btnFinPeriodo?.classList.add('hidden');
        btnSigPeriodo?.classList.add('hidden');
        btnPausaReloj?.classList.add('hidden');
        btnTiempoMuerto?.classList.add('hidden');
        btnReanudarReloj?.classList.add('hidden');
        btnIniciarOT?.classList.add('hidden');
        if (infoLabel) {
            infoLabel.innerHTML = `<span style="color:#2ed573; font-weight:800;">🏁 Partido Oficialmente Concluido</span>`;
        }
        return;
    }

    // 4. Si el partido está EN_JUEGO
    btnSuspender?.classList.remove('hidden');
    btnReanudar?.classList.add('hidden');
    btnAplazar?.classList.add('hidden');

    // Deportes sin reloj (Béisbol, Sóftbol, Voleibol)
    if (!tieneReloj) {
        btnFinPeriodo?.classList.add('hidden');
        btnSigPeriodo?.classList.add('hidden');
        btnPausaReloj?.classList.add('hidden');
        btnTiempoMuerto?.classList.add('hidden');
        btnReanudarReloj?.classList.add('hidden');
        btnIniciarOT?.classList.add('hidden');
        if (infoLabel) {
            infoLabel.innerHTML = `<span>⚡ En Juego (${estadoDetalle})</span>`;
        }
        return;
    }

    // Deportes con reloj:
    const esPausaReloj = (estadoDetalle === 'PAUSA' || estadoDetalle === 'T. MUERTO' || estadoDetalle === 'TIEMPO MUERTO');
    const esDescanso = (estadoDetalle === 'ENTRETIEMPO' || estadoDetalle === 'DESCANSO' || estadoDetalle === 'PAUSA Q1' || estadoDetalle === 'PAUSA Q3' || estadoDetalle === 'PAUSA EXTRA TIEMPO');

    // Controles de Pausa para Baloncesto y Micro
    if (esBaloncesto || esMicro) {
        if (esPausaReloj) {
            btnPausaReloj?.classList.add('hidden');
            btnTiempoMuerto?.classList.add('hidden');
            btnReanudarReloj?.classList.remove('hidden');
        } else if (!esDescanso) {
            btnPausaReloj?.classList.remove('hidden');
            btnTiempoMuerto?.classList.remove('hidden');
            btnReanudarReloj?.classList.add('hidden');
        } else {
            btnPausaReloj?.classList.add('hidden');
            btnTiempoMuerto?.classList.add('hidden');
            btnReanudarReloj?.classList.add('hidden');
        }
    } else {
        btnPausaReloj?.classList.add('hidden');
        btnTiempoMuerto?.classList.add('hidden');
        btnReanudarReloj?.classList.add('hidden');
    }

    // Controles de Fin / Inicio de Periodo
    if (estadoDetalle === 'PENALES') {
        btnFinPeriodo?.classList.add('hidden');
        btnSigPeriodo?.classList.add('hidden');
        if (infoLabel) {
            infoLabel.innerHTML = `<span style="color:#e11d48; font-weight:800;">🥅 Tanda de Penales Reglamentaria &bull; Define el clasificado</span>`;
        }
    } else if (estadoDetalle === 'PAUSA EXTRA TIEMPO') {
        btnFinPeriodo?.classList.add('hidden');
        btnSigPeriodo?.classList.add('hidden');
        if (infoLabel) {
            const minStr = (esBaloncesto && minutoVal !== undefined) ? ` &bull; Minuto ${minutoVal}' : 00s` : '';
            infoLabel.innerHTML = `<span style="color:#7c3aed; font-weight:800;">⏸ PAUSA EXTRA TIEMPO (${ptsLoc} - ${ptsVis})${minStr} &bull; Pulsa [⚡ Iniciar Tiempo Extra (OT)]</span>`;
        }
    } else if (esDescanso) {
        btnFinPeriodo?.classList.add('hidden');
        btnSigPeriodo?.classList.remove('hidden');
        if (infoLabel) {
            const minStr = ((esBaloncesto || depNorm === 'FUTBOL') && minutoVal !== undefined && minutoVal !== '') ? ` &bull; Minuto ${minutoVal}' : 00s` : '';
            infoLabel.innerHTML = `<span style="color:#f59e0b; font-weight:800;">⏸ ${estadoDetalle}${minStr} (Reloj detenido)</span>`;
        }
    } else {
        btnFinPeriodo?.classList.remove('hidden');
        btnSigPeriodo?.classList.add('hidden');
        if (infoLabel) {
            const minDisp = (depNorm === 'FUTBOL' && (minutoVal === 0 || minutoVal === '0')) ? 0 : (minutoVal || 1);
            infoLabel.innerHTML = esPausaReloj
                ? `<span style="color:#ec4899; font-weight:800;">⏸ ${estadoDetalle} (Reloj pausado temporalmente)</span>`
                : `<span style="color:#2ed573; font-weight:800;">🔴 En Juego: ${estadoDetalle} &bull; Minuto ${minDisp}'</span>`;
        }
    }

    // Baloncesto: Prórroga / OT si hay empate en periodo final o PAUSA EXTRA TIEMPO
    const esFinPeriodoEmpatado = (estadoDetalle === 'Q4' || estadoDetalle.includes('OVERTIME') || estadoDetalle.includes('OT') || estadoDetalle.includes('PRORROGA') || estadoDetalle === 'PAUSA EXTRA TIEMPO');
    if (esBaloncesto && ptsLoc === ptsVis && esFinPeriodoEmpatado) {
        let sigOT = 'OT';
        const minAct = parseInt(minutoVal) || 0;
        if (estadoDetalle === '2OT' || estadoDetalle === 'OT2' || minAct >= 50) sigOT = '3OT';
        else if (estadoDetalle.includes('OVERTIME') || estadoDetalle === 'OT' || estadoDetalle === 'OT1' || minAct >= 45) sigOT = '2OT';
        else sigOT = 'OT';

        if (btnIniciarOT) {
            btnIniciarOT.innerHTML = `⚡ Iniciar Tiempo Extra (${sigOT}) (5 minutos netos)`;
            btnIniciarOT.classList.remove('hidden');
        }
        btnFinPeriodo?.classList.add('hidden');
    } else {
        btnIniciarOT?.classList.add('hidden');
    }
}

// ============================================================================
// CRONÓMETRO AUTÓNOMO CONTINUO EN MESA TÉCNICA (EXCLUSIVO BALONCESTO)
// ============================================================================
function obtenerLimitePeriodoBaloncesto(periodoStr, minutoActual = 0) {
    const p = (periodoStr || '').toUpperCase().trim();
    if (p.includes('Q1') || p.includes('1Q') || p.includes('1° CUARTO') || p.includes('PRIMER CUARTO')) return 10;
    if (p.includes('Q2') || p.includes('2Q') || p.includes('2° CUARTO') || p.includes('SEGUNDO CUARTO')) return 20;
    if (p.includes('Q3') || p.includes('3Q') || p.includes('3° CUARTO') || p.includes('TERCER CUARTO')) return 30;
    if (p.includes('Q4') || p.includes('4Q') || p.includes('4° CUARTO') || p.includes('CUARTO CUARTO')) return 40;
    if (p.includes('2OT') || p.includes('OT2')) return 50;
    if (p.includes('3OT') || p.includes('OT3')) return 55;
    if (p.includes('4OT') || p.includes('OT4')) return 60;
    if (p.includes('5OT') || p.includes('OT5')) return 65;
    if (p.includes('OVERTIME') || p.includes('OT') || p.includes('PRORROGA') || p.includes('PRÓRROGA')) return 45;

    const m = p.match(/(\d+)\s*OT/) || p.match(/OT\s*(\d+)/);
    if (m) {
        const n = parseInt(m[1]);
        return 40 + (n * 5);
    }
    const min = parseInt(minutoActual) || 0;
    if (min > 40) {
        const rem = min % 5;
        return rem === 0 ? min : min + (5 - rem);
    }
    if (min <= 10) return 10;
    if (min <= 20) return 20;
    if (min <= 30) return 30;
    return 40;
}

function obtenerSegundosBasePeriodoBaloncesto(periodoStr, minutoActual = 0) {
    const p = (periodoStr || '').toUpperCase().trim();
    if (p.includes('Q1') || p.includes('1Q') || p.includes('1° CUARTO')) return 0;
    if (p.includes('Q2') || p.includes('2Q') || p.includes('2° CUARTO')) return 600;
    if (p.includes('Q3') || p.includes('3Q') || p.includes('3° CUARTO')) return 1200;
    if (p.includes('Q4') || p.includes('4Q') || p.includes('4° CUARTO')) return 1800;
    if (p.includes('2OT') || p.includes('OT2')) return 2700;
    if (p.includes('3OT') || p.includes('OT3')) return 3000;
    if (p.includes('4OT') || p.includes('OT4')) return 3300;
    if (p.includes('OVERTIME') || p.includes('OT') || p.includes('PRORROGA') || p.includes('PRÓRROGA')) return 2400;

    const min = parseInt(minutoActual) || 0;
    if (min > 0) {
        return min * 60;
    }
    return 0;
}

function calcularMinutoBaloncesto(curPeriodo, totalSegundos, limitePeriodo, basePeriodo = 0, segsCuarto = 0) {
    const p = (curPeriodo || '').toUpperCase();
    if (p.includes('Q1') || p.includes('1Q')) {
        return Math.min(10, Math.floor(totalSegundos / 60));
    }
    if (p.includes('Q2') || p.includes('2Q')) {
        return Math.min(20, 10 + Math.floor(segsCuarto / 60));
    }
    if (p.includes('Q3') || p.includes('3Q')) {
        return Math.min(30, 20 + Math.floor(segsCuarto / 60));
    }
    if (p.includes('Q4') || p.includes('4Q')) {
        return Math.min(40, 30 + Math.floor(segsCuarto / 60));
    }
    const baseMinOT = Math.floor(basePeriodo / 60);
    return Math.min(limitePeriodo, baseMinOT + Math.floor(segsCuarto / 60));
}

async function sincronizarMinutoBaloncestoAPI(partido, minuto, estado, estadoDetalle) {
    if (!partido) return;
    const pId = partido.id || partido.Id;
    if (!pId) return;

    const estGen = estado || partido.estado || partido.Estado || 'EN_JUEGO';
    const estDet = estadoDetalle || partido.estadoDetalle || partido.EstadoDetalle || 'Q1';
    const ptsL = (partido.puntosLocal !== undefined ? partido.puntosLocal : partido.PuntosLocal) ?? (state.marcadorLocalTemp || 0);
    const ptsV = (partido.puntosVisitante !== undefined ? partido.puntosVisitante : partido.PuntosVisitante) ?? (state.marcadorVisitTemp || 0);

    const payload = {
        id: pId,
        torneoId: partido.torneoId || partido.TorneoId,
        jornada: partido.jornada || partido.Jornada || 1,
        faseId: partido.faseId || partido.FaseId || null,
        grupoId: partido.grupoId || partido.GrupoId || null,
        canchaId: partido.canchaId || partido.CanchaId,
        equipoLocalId: partido.equipoLocalId || partido.EquipoLocalId,
        equipoVisitanteId: partido.equipoVisitanteId || partido.EquipoVisitanteId,
        puntosLocal: ptsL,
        puntosVisitante: ptsV,
        estado: estGen,
        estadoDetalle: estDet,
        minutoActual: minuto,
        fechaHora: partido.fechaHora || partido.FechaHora || new Date().toISOString()
    };

    try {
        await fetch(`${API_URL}/partidos/${pId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.warn('Error en auto-sync baloncesto (PUT /api/Partidos):', e);
    }
}

function iniciarCronometroBaloncesto(resetSegundos = false) {
    const partido = state.partidoActivoMesa;
    if (!partido) return;
    const depNorm = obtenerDeporteDePartido(partido);
    if (depNorm !== 'BALONCESTO') return;

    const pId = partido.id || partido.Id;
    if (!pId) return;

    const inputGen = document.getElementById('mesa-estado-general');
    const estadoGen = (state.partidoActivoMesa && inputGen ? inputGen.value : (partido.estado || '')).toUpperCase();
    const selDet = document.getElementById('mesa-estado-detalle');
    const estadoDet = (state.partidoActivoMesa && selDet ? selDet.value : (partido.estadoDetalle || '')).toUpperCase();

    // No correr si no está EN_JUEGO o si está en pausa, tiempo muerto, descanso o suspendido
    const estaPausado = (estadoDet === 'PAUSA' || estadoDet === 'TIEMPO MUERTO' || estadoDet === 'T. MUERTO' ||
                         estadoDet === 'PAUSA Q1' || estadoDet === 'DESCANSO' || estadoDet === 'PAUSA Q3' ||
                         estadoDet === 'PAUSA EXTRA TIEMPO' ||
                         estadoDet === 'FINALIZADO' || estadoDet === 'SUSPENDIDO' || estadoGen === 'SUSPENDIDO' || estadoGen === 'FINALIZADO');
    if (estadoGen !== 'EN_JUEGO' || estaPausado) {
        detenerCronometroBaloncesto(false);
        return;
    }

    let timerData = obtenerEstadoTimerBaloncesto(pId);
    const inputMin = document.getElementById('mesa-minuto-actual');
    const minActual = (state.partidoActivoMesa && inputMin) ? (parseInt(inputMin.value) || 1) : (partido.minutoActual || 1);

    if (resetSegundos || !timerData) {
        const baseSeconds = obtenerSegundosBasePeriodoBaloncesto(estadoDet, minActual);
        segundosBaloncestoNeto = baseSeconds;
        timerData = {
            running: true,
            startTimestamp: Date.now(),
            segundosNetos: baseSeconds,
            minutoActual: minActual,
            minuto_actual: minActual,
            periodo: estadoDet
        };
    } else {
        const segsBase = timerData.segundosNetos !== undefined ? timerData.segundosNetos : (timerData.accumulatedSeconds || 0);
        segundosBaloncestoNeto = segsBase;
        timerData.running = true;
        timerData.startTimestamp = Date.now();
        timerData.segundosNetos = segsBase;
        timerData.minutoActual = minActual;
        timerData.minuto_actual = minActual;
        timerData.periodo = estadoDet;
    }

    guardarEstadoTimerBaloncesto(pId, timerData);

    if (cronometroBaloncestoInterval) {
        clearInterval(cronometroBaloncestoInterval);
        cronometroBaloncestoInterval = null;
    }

    cronometroBaloncestoInterval = setInterval(async () => {
        await tickCronometroBaloncesto();
    }, 1000);

    // Sincronización visual inmediata
    tickCronometroBaloncesto();
}

function detenerCronometroBaloncesto(limpiarCompletamente = false) {
    if (cronometroBaloncestoInterval) {
        clearInterval(cronometroBaloncestoInterval);
        cronometroBaloncestoInterval = null;
    }
    const partido = state.partidoActivoMesa;
    if (!partido) return;
    const pId = partido.id || partido.Id;
    if (!pId) return;

    if (limpiarCompletamente) {
        limpiarEstadoTimerBaloncesto(pId);
        return;
    }

    const timerData = obtenerEstadoTimerBaloncesto(pId);
    if (timerData) {
        if (timerData.running && timerData.startTimestamp) {
            const transcurrido = Math.floor((Date.now() - timerData.startTimestamp) / 1000);
            const baseSegs = timerData.segundosNetos !== undefined ? timerData.segundosNetos : (timerData.accumulatedSeconds || 0);
            const nuevoSegs = baseSegs + Math.max(0, transcurrido);
            timerData.segundosNetos = nuevoSegs;
            timerData.accumulatedSeconds = nuevoSegs;
            segundosBaloncestoNeto = nuevoSegs;
        }
        timerData.running = false;
        timerData.startTimestamp = null;
        guardarEstadoTimerBaloncesto(pId, timerData);
    }
}

async function tickCronometroBaloncesto(partidoParam = null) {
    const partido = partidoParam || state.partidoActivoMesa;
    if (!partido) {
        if (!partidoParam) detenerCronometroBaloncesto(false);
        return;
    }

    const depNorm = obtenerDeporteDePartido(partido);
    if (depNorm !== 'BALONCESTO') {
        if (!partidoParam) detenerCronometroBaloncesto(false);
        return;
    }

    const pId = partido.id || partido.Id;
    if (!pId) return;

    const estaEnMesa = !!(state.partidoActivoMesa && String(state.partidoActivoMesa.id || state.partidoActivoMesa.Id) === String(pId));
    const selGen = document.getElementById('mesa-estado-general');
    const estadoGen = (estaEnMesa && selGen ? selGen.value : (partido.estado || partido.Estado || '')).toUpperCase();
    const selDet = document.getElementById('mesa-estado-detalle');
    const curPeriodo = (estaEnMesa && selDet ? selDet.value : (partido.estadoDetalle || partido.EstadoDetalle || 'Q1')).toUpperCase().trim();

    const estaPausado = (curPeriodo === 'PAUSA' || curPeriodo === 'TIEMPO MUERTO' || curPeriodo === 'T. MUERTO' ||
                         curPeriodo === 'PAUSA Q1' || curPeriodo === 'DESCANSO' || curPeriodo === 'PAUSA Q3' ||
                         curPeriodo === 'PAUSA EXTRA TIEMPO' ||
                         curPeriodo === 'FINALIZADO' || curPeriodo === 'SUSPENDIDO' || estadoGen === 'SUSPENDIDO' || estadoGen === 'FINALIZADO');
    if (estadoGen !== 'EN_JUEGO' || estaPausado) {
        if (estaEnMesa) {
            detenerCronometroBaloncesto(false);
        }
        // Si un partido se pausa (tiempo muerto, descanso, penal o suspendido), el gestor no incrementa su tiempo y envía el minuto congelado correspondiente.
        const minCongelado = partido.minutoActual || 1;
        await sincronizarMinutoBaloncestoAPI(partido, minCongelado, estadoGen, curPeriodo);
        return;
    }

    let timerData = obtenerEstadoTimerBaloncesto(pId);
    if (!timerData) {
        if (estaEnMesa) {
            iniciarCronometroBaloncesto(false);
            timerData = obtenerEstadoTimerBaloncesto(pId);
        }
        if (!timerData) return;
    }

    const ahora = Date.now();
    const transcurrido = (timerData.running && timerData.startTimestamp)
        ? Math.floor((ahora - timerData.startTimestamp) / 1000)
        : 0;
    const segsBase = timerData.segundosNetos !== undefined ? timerData.segundosNetos : (timerData.accumulatedSeconds || 0);
    const totalSegundos = segsBase + transcurrido;
    if (estaEnMesa) segundosBaloncestoNeto = totalSegundos;

    const inputMin = document.getElementById('mesa-minuto-actual');
    const minActualInput = (estaEnMesa && inputMin) ? (parseInt(inputMin.value) || 0) : (partido.minutoActual || 0);
    const limitePeriodo = obtenerLimitePeriodoBaloncesto(curPeriodo, minActualInput);
    const limiteSegundos = limitePeriodo * 60;

    const basePeriodo = obtenerSegundosBasePeriodoBaloncesto(curPeriodo, minActualInput);
    const segundosAcumuladosCuarto = Math.max(0, totalSegundos - basePeriodo);
    const esOT = curPeriodo.includes('OT') || curPeriodo.includes('OVERTIME') || curPeriodo.includes('PRORROGA') || curPeriodo.includes('PRÓRROGA');
    const maxSegundosCuarto = esOT ? 300 : 600;

    // Comprobar si se completó el periodo reglamentario EXACTO:
    // Q1: 600 seg netos (10' 00'') -> Detener en 10' y poner 'PAUSA Q1' (evitando saltar a 11')
    // Q2: 600 seg netos (20' 00'') -> Detener en 20' y poner 'DESCANSO'
    // Q3: 600 seg netos (30' 00'') -> Detener en 30' y poner 'PAUSA Q3'
    // Q4: 600 seg netos (40' 00'') -> Detener en 40' y verificar ganador o prórroga
    // OT: 300 seg netos adicionales exactos (45', 50', etc.)
    if (segundosAcumuladosCuarto >= maxSegundosCuarto || totalSegundos >= limiteSegundos) {
        if (estaEnMesa) {
            segundosBaloncestoNeto = limiteSegundos;
            if (inputMin) inputMin.value = limitePeriodo;
            detenerCronometroBaloncesto(false);
        }
        partido.minutoActual = limitePeriodo;
        partido.MinutoActual = limitePeriodo;

        timerData.running = false;
        timerData.startTimestamp = null;
        timerData.segundosNetos = limiteSegundos;
        timerData.accumulatedSeconds = limiteSegundos;
        timerData.minutoActual = limitePeriodo;
        timerData.minuto_actual = limitePeriodo;
        guardarEstadoTimerBaloncesto(pId, timerData);

        const ptsLoc = estaEnMesa ? (state.marcadorLocalTemp || 0) : ((partido.puntosLocal !== undefined ? partido.puntosLocal : partido.PuntosLocal) || 0);
        const ptsVis = estaEnMesa ? (state.marcadorVisitTemp || 0) : ((partido.puntosVisitante !== undefined ? partido.puntosVisitante : partido.PuntosVisitante) || 0);

        let nuevoEstado = 'EN_JUEGO';
        let nuevoDetalle = '';

        if (curPeriodo.includes('Q1') || curPeriodo.includes('1Q')) {
            nuevoDetalle = 'PAUSA Q1';
            if (estaEnMesa && selDet) selDet.value = 'PAUSA Q1';
            if (estaEnMesa) mostrarToast('⏸ ¡Fin del 1° Cuarto (10 min)! Pausa reglamentaria de 2 minutos.', 'info');
        } else if (curPeriodo.includes('Q2') || curPeriodo.includes('2Q')) {
            nuevoDetalle = 'DESCANSO';
            if (estaEnMesa && selDet) selDet.value = 'DESCANSO';
            if (estaEnMesa) mostrarToast('⏸ ¡Medio Tiempo (20 min)! Descanso reglamentario de 10 minutos.', 'info');
        } else if (curPeriodo.includes('Q3') || curPeriodo.includes('3Q')) {
            nuevoDetalle = 'PAUSA Q3';
            if (estaEnMesa && selDet) selDet.value = 'PAUSA Q3';
            if (estaEnMesa) mostrarToast('⏸ ¡Fin del 3° Cuarto (30 min)! Pausa reglamentaria de 2 minutos.', 'info');
        } else {
            // Límite alcanzado en Q4 (min 40 / 2400 seg) o en Prórroga (min 45 en OT, min 50 en 2OT, etc.)
            if (ptsLoc !== ptsVis) {
                // CASO A: Ganador Definido (diferencia >= 1)
                nuevoEstado = 'FINALIZADO';
                nuevoDetalle = 'FINALIZADO';
                gestorPartidosEnJuego.delete(String(pId));
                if (estaEnMesa && selGen) selGen.value = 'FINALIZADO';
                if (estaEnMesa && selDet) selDet.value = 'FINALIZADO';
                const ganadorNom = ptsLoc > ptsVis 
                    ? (partido.equipoLocalNombre || partido.EquipoLocalNombre || 'Local')
                    : (partido.equipoVisitanteNombre || partido.EquipoVisitanteNombre || 'Visitante');
                if (estaEnMesa) mostrarToast(`🏆 ¡Fin del partido oficial (${limitePeriodo}')! Ganador: ${ganadorNom} (${ptsLoc} - ${ptsVis}).`, 'exito');
            } else {
                // CASO B: Empate estricto (ptsLoc === ptsVis)
                nuevoDetalle = 'PAUSA EXTRA TIEMPO';
                if (estaEnMesa && selDet) {
                    if (!Array.from(selDet.options).some(o => o.value === 'PAUSA EXTRA TIEMPO')) {
                        const opt = document.createElement('option');
                        opt.value = 'PAUSA EXTRA TIEMPO';
                        opt.textContent = '⏸ PAUSA EXTRA TIEMPO';
                        selDet.appendChild(opt);
                    }
                    selDet.value = 'PAUSA EXTRA TIEMPO';
                }
                if (estaEnMesa) mostrarToast(`⚖️ ¡Fin de ${curPeriodo} en EMPATE (${ptsLoc} - ${ptsVis})! Pausa reglamentaria: Pulsa [⚡ Iniciar Tiempo Extra (OT)].`, 'error');
            }
        }

        partido.estado = nuevoEstado;
        partido.estadoDetalle = nuevoDetalle;
        if (state.partidoActivoMesa && estaEnMesa) {
            state.partidoActivoMesa.estado = nuevoEstado;
            state.partidoActivoMesa.estadoDetalle = nuevoDetalle;
        }

        const infoLabel = document.getElementById('mesa-operativo-info');
        if (estaEnMesa && infoLabel) {
            if (nuevoEstado === 'FINALIZADO') {
                infoLabel.innerHTML = `<span style="color:#2ed573; font-weight:800;">🏁 FINALIZADO &bull; Minuto ${limitePeriodo}' : 00s (Partido Concluido)</span>`;
            } else if (nuevoDetalle === 'PAUSA EXTRA TIEMPO') {
                infoLabel.innerHTML = `<span style="color:#7c3aed; font-weight:800;">⏸ PAUSA EXTRA TIEMPO &bull; Minuto ${limitePeriodo}' : 00s (Reloj detenido)</span>`;
            } else {
                infoLabel.innerHTML = `<span style="color:#f39c12; font-weight:800;">⏸ ${nuevoDetalle} &bull; Minuto ${limitePeriodo}' : 00s (Reloj detenido)</span>`;
            }
        }

        if (estaEnMesa) {
            actualizarBadgeVivo(nuevoEstado);
            await guardarMarcadorMesa();
            verificarBotonFinalizarBaloncesto();
            actualizarControlesOperativosMesa();
        } else {
            await sincronizarMinutoBaloncestoAPI(partido, limitePeriodo, nuevoEstado, nuevoDetalle);
        }
        return;
    }

    // El periodo sigue en marcha activa
    const minutoCalculado = calcularMinutoBaloncesto(curPeriodo, totalSegundos, limitePeriodo, basePeriodo, segundosAcumuladosCuarto);
    const segDisplay = totalSegundos % 60;
    const segStr = (segDisplay < 10 ? '0' : '') + segDisplay;

    // Actualizar etiqueta operativa en vivo con el tiempo neto
    const infoLabel = document.getElementById('mesa-operativo-info');
    if (estaEnMesa && infoLabel) {
        infoLabel.innerHTML = `<span style="color:#2ed573; font-weight:800;">🔴 En Juego: ${curPeriodo} &bull; Minuto ${minutoCalculado}' : ${segStr}s (Reloj en marcha)</span>`;
    }

    const minutoCambio = (estaEnMesa && inputMin && inputMin.value != minutoCalculado);
    if (minutoCambio && inputMin) {
        inputMin.value = minutoCalculado;
    }
    partido.minutoActual = minutoCalculado;
    partido.MinutoActual = minutoCalculado;

    // AUTO-SYNC CADA 10 SEGUNDOS (PUT /api/Partidos/{id})
    const ahoraSync = Date.now();
    if (ahoraSync - ultimoSyncBaloncestoTimestamp >= 10000 || minutoCambio || !estaEnMesa) {
        if (estaEnMesa) ultimoSyncBaloncestoTimestamp = ahoraSync;
        timerData.minutoActual = minutoCalculado;
        timerData.minuto_actual = minutoCalculado;
        guardarEstadoTimerBaloncesto(pId, timerData);
        if (estaEnMesa && minutoCambio) {
            await guardarMarcadorMesa();
        } else {
            await sincronizarMinutoBaloncestoAPI(partido, minutoCalculado, estadoGen, curPeriodo);
        }
    }
}

// ============================================================================
// CRONÓMETRO AUTÓNOMO Y REGLAMENTARIO DE FÚTBOL 11 (45' + 45' = 90' NETOS)
// ============================================================================

function esFaseGruposOTodosFutbol(partido) {
    if (!partido) return true;
    const tf = String(partido.tipo_fase || partido.tipoFase || partido.TipoFase || '').toUpperCase().trim();
    if (tf === 'GRUPOS' || tf === 'GRUPO' || tf === 'TODOS_CONTRA_TODOS' || tf === 'TODOS CONTRA TODOS') {
        return true;
    }
    const fn = String(partido.fase || partido.faseNombre || partido.FaseNombre || '').toUpperCase().trim();
    if (fn.includes('GRUPO') || fn.includes('TODOS CONTRA TODOS') || fn.includes('REGULAR')) {
        return true;
    }
    const fId = Number(partido.faseId ?? partido.FaseId ?? 0);
    if (fId <= 1 && !esPartidoPlayoff(partido)) {
        return true;
    }
    return false;
}

async function sincronizarMinutoFutbolAPI(partido, minuto, estado, estadoDetalle) {
    if (!partido) return;
    const pId = partido.id || partido.Id;
    if (!pId) return;

    const estGen = estado || partido.estado || partido.Estado || 'EN_JUEGO';
    const estDet = estadoDetalle || partido.estadoDetalle || partido.EstadoDetalle || '1T';
    const ptsL = (partido.puntosLocal !== undefined ? partido.puntosLocal : partido.PuntosLocal) ?? (state.marcadorLocalTemp || 0);
    const ptsV = (partido.puntosVisitante !== undefined ? partido.puntosVisitante : partido.PuntosVisitante) ?? (state.marcadorVisitTemp || 0);

    let estadoDb = estGen;
    let estadoDetalleDb = estDet;
    if (estGen === 'SUSPENDIDO') {
        estadoDb = 'EN_JUEGO';
        estadoDetalleDb = 'SUSPENDIDO';
    } else if (estGen === 'RETRASADO') {
        estadoDb = 'PROGRAMADO';
        estadoDetalleDb = 'RETRASADO';
    } else if (estGen === 'APLAZADO') {
        estadoDb = 'PROGRAMADO';
        estadoDetalleDb = 'APLAZADO';
    }

    const payload = {
        puntosLocal: Number(ptsL),
        puntosVisitante: Number(ptsV),
        estado: estadoDb,
        estadoDetalle: estadoDetalleDb,
        minutoActual: Number(minuto)
    };

    try {
        await fetch(`${API_URL}/partidos/${pId}/marcador`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.warn('Error en auto-sync fútbol (PATCH /api/partidos/{id}/marcador):', e);
    }
}

async function verificarEmpateEliminatoriaFutbol(partido, ptsLoc, ptsVis) {
    if (!partido) return false;
    const pId = partido.id || partido.Id;
    const fId = Number(partido.faseId || partido.FaseId || 0);
    const jNum = Number(partido.jornada || partido.Jornada || 1);
    const torneoId = partido.torneoId || partido.TorneoId;
    const eqLocId = partido.equipoLocalId || partido.EquipoLocalId;
    const eqVisId = partido.equipoVisitanteId || partido.EquipoVisitanteId;

    let partidosLlave = [];
    try {
        const resL = await fetch(`${API_URL}/partidos/torneo/${torneoId}`);
        if (resL.ok) {
            const allP = await resL.json();
            partidosLlave = allP.filter(p => Number(p.faseId || p.FaseId || 0) === fId && Number(p.jornada || p.Jornada || 1) === jNum);
        }
    } catch (e) {}

    const esIdaVuelta = (partidosLlave.length === 2);

    if (esIdaVuelta) {
        const otros = partidosLlave.filter(p => (p.id || p.Id) !== pId);
        // Si el otro partido ya concluyó (está FINALIZADO), este es el partido de VUELTA
        if (otros.length === 1 && (otros[0].estado || otros[0].Estado) === 'FINALIZADO') {
            const oLocId = otros[0].equipoLocalId || otros[0].EquipoLocalId;
            const oPtsL = Number(otros[0].puntosLocal || otros[0].PuntosLocal || 0);
            const oPtsV = Number(otros[0].puntosVisitante || otros[0].PuntosVisitante || 0);

            // Marcador global acumulado de la serie
            const globLoc = (eqLocId === oLocId ? oPtsL : oPtsV) + Number(ptsLoc);
            const globVis = (eqVisId === oLocId ? oPtsL : oPtsV) + Number(ptsVis);
            return (globLoc === globVis);
        }
        // En el partido de ida nunca hay penales
        return false;
    } else {
        // Partido único de eliminación directa
        return (Number(ptsLoc) === Number(ptsVis));
    }
}

// ============================================================================
// MÓDULO OPERATIVO INTERACTIVO DE PENALES POR TURNOS (FÚTBOL / MICROFÚTBOL)
// ============================================================================
const estadoTandaPenales = {
    partidoId: null,
    maxTirosInicial: 5,
    nomLocal: 'Local',
    nomVisit: 'Visitante',
    tirosLocal: [],     // Array de 'GOL' | 'FALLO'
    tirosVisitante: [], // Array de 'GOL' | 'FALLO'
    historialTiros: [], // Array de { equipo: 'LOCAL' | 'VISITANTE', resultado: 'GOL' | 'FALLO' }
    ganador: null       // 'LOCAL' | 'VISITANTE' | null
};

function activarModuloPenalesMesa(nomLoc, nomVis) {
    const modPen = document.getElementById('mesa-modulo-penales') || document.getElementById('contenedor-penales');
    if (!modPen) return;

    modPen.classList.remove('hidden');

    const partido = state.partidoActivoMesa;
    const pId = partido ? (partido.id || partido.Id) : null;
    const depNorm = partido ? obtenerDeporteDePartido(partido) : 'FUTBOL';

    // Determinar cantidad de tiros reglamentarios: 3 para Microfútbol o según torneo / partido, 5 para Fútbol
    const tirosConfig = Number(partido?.tirosPenales || partido?.tandaPenales || (state.torneoActivo && (state.torneoActivo.tirosPenales || state.torneoActivo.tandaPenales)));
    const cantTiros = (tirosConfig === 3 || tirosConfig === 5) ? tirosConfig : (depNorm === 'MICROFUTBOL' ? 3 : 5);

    estadoTandaPenales.partidoId = pId;
    estadoTandaPenales.maxTirosInicial = cantTiros;
    estadoTandaPenales.nomLocal = nomLoc || 'Local';
    estadoTandaPenales.nomVisit = nomVis || 'Visitante';
    estadoTandaPenales.tirosLocal = [];
    estadoTandaPenales.tirosVisitante = [];
    estadoTandaPenales.historialTiros = [];
    estadoTandaPenales.ganador = null;

    const nomLocEl = document.getElementById('mesa-penales-nom-local');
    const nomVisEl = document.getElementById('mesa-penales-nom-visit');
    const lblLocEl = document.getElementById('penales-label-local');
    const lblVisEl = document.getElementById('penales-label-visit');

    if (nomLocEl) nomLocEl.textContent = estadoTandaPenales.nomLocal;
    if (nomVisEl) nomVisEl.textContent = estadoTandaPenales.nomVisit;
    if (lblLocEl) lblLocEl.textContent = estadoTandaPenales.nomLocal;
    if (lblVisEl) lblVisEl.textContent = estadoTandaPenales.nomVisit;

    document.getElementById('penales-panel-finalizado')?.classList.add('hidden');
    const panelTurno = document.getElementById('penales-panel-turno');
    if (panelTurno) panelTurno.style.display = 'block';

    const btnGol = document.getElementById('btn-penal-gol');
    const btnFallo = document.getElementById('btn-penal-fallo');
    if (btnGol) btnGol.disabled = false;
    if (btnFallo) btnFallo.disabled = false;

    renderizarTableroPenales();
    modPen.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderizarTableroPenales() {
    const maxInicial = estadoTandaPenales.maxTirosInicial || 5;
    const tirosL = estadoTandaPenales.tirosLocal;
    const tirosV = estadoTandaPenales.tirosVisitante;
    const golesL = tirosL.filter(t => t === 'GOL').length;
    const golesV = tirosV.filter(t => t === 'GOL').length;

    const scoreLocEl = document.getElementById('penales-score-local');
    const scoreVisEl = document.getElementById('penales-score-visit');
    if (scoreLocEl) scoreLocEl.textContent = golesL;
    if (scoreVisEl) scoreVisEl.textContent = golesV;

    const inpLoc = document.getElementById('mesa-penales-val-local');
    const inpVis = document.getElementById('mesa-penales-val-visit');
    if (inpLoc) inpLoc.value = golesL;
    if (inpVis) inpVis.value = golesV;

    const esMuerteSubita = (tirosL.length >= maxInicial && tirosV.length >= maxInicial) || (tirosL.length > maxInicial || tirosV.length > maxInicial);
    const badgeFase = document.getElementById('penales-badge-fase');
    if (badgeFase) {
        if (esMuerteSubita) {
            badgeFase.textContent = '⚡ Muerte Súbita (1 a 1)';
            badgeFase.style.color = '#ffeb3b';
            badgeFase.style.borderColor = '#eab308';
            badgeFase.style.background = 'rgba(234, 179, 8, 0.15)';
            badgeFase.style.cursor = 'default';
            badgeFase.onclick = null;
        } else {
            badgeFase.textContent = `Tanda Inicial (${maxInicial} tiros)`;
            badgeFase.style.color = '#fb7185';
            badgeFase.style.borderColor = '#e11d48';
            badgeFase.style.background = 'rgba(225, 29, 72, 0.15)';
            if (tirosL.length === 0 && tirosV.length === 0) {
                badgeFase.style.cursor = 'pointer';
                badgeFase.title = `Clic para alternar entre 3 o 5 tiros reglamentarios (Actual: ${maxInicial})`;
                badgeFase.onclick = () => {
                    if (estadoTandaPenales.tirosLocal.length === 0 && estadoTandaPenales.tirosVisitante.length === 0) {
                        estadoTandaPenales.maxTirosInicial = (estadoTandaPenales.maxTirosInicial === 3 ? 5 : 3);
                        renderizarTableroPenales();
                        mostrarToast(`Tanda de penales configurada a ${estadoTandaPenales.maxTirosInicial} tiros reglamentarios.`, 'info');
                    }
                };
            } else {
                badgeFase.style.cursor = 'default';
                badgeFase.onclick = null;
            }
        }
    }

    const maxRondas = Math.max(maxInicial, tirosL.length, tirosV.length) + (esMuerteSubita && tirosL.length === tirosV.length ? 1 : 0);
    const esTurnoLocal = (tirosL.length === tirosV.length);
    const rondaActual = esTurnoLocal ? (tirosL.length + 1) : (tirosV.length + 1);

    const txtTurno = document.getElementById('penales-turno-texto');
    if (txtTurno && !estadoTandaPenales.ganador) {
        if (esTurnoLocal) {
            txtTurno.innerHTML = `<span style="color:#38bdf8;">Turno: 🔵 ${estadoTandaPenales.nomLocal}</span> <span style="color:#94a3b8;">— Tiro ${rondaActual}${rondaActual <= maxInicial ? ` de ${maxInicial}` : ' (Muerte Súbita)'}</span>`;
        } else {
            txtTurno.innerHTML = `<span style="color:#f43f5e;">Turno: 🔴 ${estadoTandaPenales.nomVisit}</span> <span style="color:#94a3b8;">— Tiro ${rondaActual}${rondaActual <= maxInicial ? ` de ${maxInicial}` : ' (Muerte Súbita)'}</span>`;
        }
    }

    // Dots Local
    const contDotsLoc = document.getElementById('penales-dots-local');
    if (contDotsLoc) {
        contDotsLoc.innerHTML = '';
        for (let i = 0; i < maxRondas; i++) {
            const dot = document.createElement('div');
            dot.style.width = '28px';
            dot.style.height = '28px';
            dot.style.borderRadius = '50%';
            dot.style.display = 'inline-flex';
            dot.style.alignItems = 'center';
            dot.style.justifyContent = 'center';
            dot.style.fontSize = '12px';
            dot.style.fontWeight = '800';
            dot.style.transition = 'all 0.2s';

            if (i < tirosL.length) {
                if (tirosL[i] === 'GOL') {
                    dot.style.background = '#10b981';
                    dot.style.color = '#fff';
                    dot.style.border = '2px solid #059669';
                    dot.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.4)';
                    dot.textContent = '⚽';
                    dot.title = `Tiro ${i + 1}: GOL`;
                } else {
                    dot.style.background = '#ef4444';
                    dot.style.color = '#fff';
                    dot.style.border = '2px solid #dc2626';
                    dot.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.4)';
                    dot.textContent = '✕';
                    dot.title = `Tiro ${i + 1}: FALLADO`;
                }
            } else if (i === tirosL.length && esTurnoLocal && !estadoTandaPenales.ganador) {
                dot.style.background = '#1e293b';
                dot.style.color = '#38bdf8';
                dot.style.border = '2px solid #38bdf8';
                dot.style.boxShadow = '0 0 10px rgba(56, 189, 248, 0.5)';
                dot.textContent = `${i + 1}`;
                dot.title = `Tiro ${i + 1}: PATEANDO AHORA`;
            } else {
                dot.style.background = '#181922';
                dot.style.color = '#64748b';
                dot.style.border = '1px dashed #334155';
                dot.textContent = `${i + 1}`;
                dot.title = `Tiro ${i + 1}: Pendiente`;
            }
            contDotsLoc.appendChild(dot);
        }
    }

    // Dots Visitante
    const contDotsVis = document.getElementById('penales-dots-visit');
    if (contDotsVis) {
        contDotsVis.innerHTML = '';
        for (let i = 0; i < maxRondas; i++) {
            const dot = document.createElement('div');
            dot.style.width = '28px';
            dot.style.height = '28px';
            dot.style.borderRadius = '50%';
            dot.style.display = 'inline-flex';
            dot.style.alignItems = 'center';
            dot.style.justifyContent = 'center';
            dot.style.fontSize = '12px';
            dot.style.fontWeight = '800';
            dot.style.transition = 'all 0.2s';

            if (i < tirosV.length) {
                if (tirosV[i] === 'GOL') {
                    dot.style.background = '#10b981';
                    dot.style.color = '#fff';
                    dot.style.border = '2px solid #059669';
                    dot.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.4)';
                    dot.textContent = '⚽';
                    dot.title = `Tiro ${i + 1}: GOL`;
                } else {
                    dot.style.background = '#ef4444';
                    dot.style.color = '#fff';
                    dot.style.border = '2px solid #dc2626';
                    dot.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.4)';
                    dot.textContent = '✕';
                    dot.title = `Tiro ${i + 1}: FALLADO`;
                }
            } else if (i === tirosV.length && !esTurnoLocal && !estadoTandaPenales.ganador) {
                dot.style.background = '#1e293b';
                dot.style.color = '#f43f5e';
                dot.style.border = '2px solid #f43f5e';
                dot.style.boxShadow = '0 0 10px rgba(244, 63, 94, 0.5)';
                dot.textContent = `${i + 1}`;
                dot.title = `Tiro ${i + 1}: PATEANDO AHORA`;
            } else {
                dot.style.background = '#181922';
                dot.style.color = '#64748b';
                dot.style.border = '1px dashed #334155';
                dot.textContent = `${i + 1}`;
                dot.title = `Tiro ${i + 1}: Pendiente`;
            }
            contDotsVis.appendChild(dot);
        }
    }

    const btnDeshacer = document.getElementById('btn-penal-deshacer');
    if (btnDeshacer) {
        btnDeshacer.disabled = (estadoTandaPenales.historialTiros.length === 0);
        btnDeshacer.style.opacity = (estadoTandaPenales.historialTiros.length === 0) ? '0.4' : '1';
    }
}

function verificarGanadorPenales() {
    const maxInicial = estadoTandaPenales.maxTirosInicial || 5;
    const tirosL = estadoTandaPenales.tirosLocal.length;
    const tirosV = estadoTandaPenales.tirosVisitante.length;
    const golesL = estadoTandaPenales.tirosLocal.filter(t => t === 'GOL').length;
    const golesV = estadoTandaPenales.tirosVisitante.filter(t => t === 'GOL').length;

    // FASE INICIAL: Primeros maxInicial tiros (ej. 3 o 5 tiros)
    if (tirosL <= maxInicial && tirosV <= maxInicial) {
        const restantesL = maxInicial - tirosL;
        const restantesV = maxInicial - tirosV;

        // ¿Puede Visitante alcanzar a Local?
        if (golesV + restantesV < golesL) {
            return { terminado: true, ganador: 'LOCAL', golesL, golesV };
        }
        // ¿Puede Local alcanzar a Visitante?
        if (golesL + restantesL < golesV) {
            return { terminado: true, ganador: 'VISITANTE', golesL, golesV };
        }

        // Si ambos completaron sus maxInicial tiros
        if (tirosL === maxInicial && tirosV === maxInicial) {
            if (golesL > golesV) {
                return { terminado: true, ganador: 'LOCAL', golesL, golesV };
            }
            if (golesV > golesL) {
                return { terminado: true, ganador: 'VISITANTE', golesL, golesV };
            }
            // Empate a maxInicial tiros: Pasa a Muerte Súbita
            return { terminado: false, muerteSubita: true, golesL, golesV };
        }

        return { terminado: false, muerteSubita: false, golesL, golesV };
    }

    // FASE DE MUERTE SÚBITA (más de maxInicial tiros)
    // Solo se evalúa ganador cuando ambos equipos han pateado el mismo número de tiros en la ronda
    if (tirosL === tirosV && tirosL > maxInicial) {
        if (golesL > golesV) {
            return { terminado: true, ganador: 'LOCAL', golesL, golesV };
        }
        if (golesV > golesL) {
            return { terminado: true, ganador: 'VISITANTE', golesL, golesV };
        }
    }

    return { terminado: false, muerteSubita: true, golesL, golesV };
}

async function registrarTiroPenal(resultado) {
    if (estadoTandaPenales.ganador) return;

    const esTurnoLocal = (estadoTandaPenales.tirosLocal.length === estadoTandaPenales.tirosVisitante.length);
    const equipo = esTurnoLocal ? 'LOCAL' : 'VISITANTE';

    if (esTurnoLocal) {
        estadoTandaPenales.tirosLocal.push(resultado);
    } else {
        estadoTandaPenales.tirosVisitante.push(resultado);
    }

    estadoTandaPenales.historialTiros.push({ equipo, resultado });
    renderizarTableroPenales();

    // Evaluar si matemáticamente ya hay ganador
    const evaluacion = verificarGanadorPenales();
    if (evaluacion.terminado) {
        estadoTandaPenales.ganador = evaluacion.ganador;
        const nombreGanador = evaluacion.ganador === 'LOCAL' ? estadoTandaPenales.nomLocal : estadoTandaPenales.nomVisit;

        const btnGol = document.getElementById('btn-penal-gol');
        const btnFallo = document.getElementById('btn-penal-fallo');
        if (btnGol) btnGol.disabled = true;
        if (btnFallo) btnFallo.disabled = true;

        const pFin = document.getElementById('penales-panel-finalizado');
        const txtGan = document.getElementById('penales-texto-ganador');
        const subGan = document.getElementById('penales-subtexto-ganador');
        if (pFin) pFin.classList.remove('hidden');
        if (txtGan) txtGan.textContent = `🏆 ¡Ganador definido por Penales! ${nombreGanador} (${evaluacion.golesL} - ${evaluacion.golesV})`;
        if (subGan) subGan.textContent = 'Guardando resultado oficial y finalizando partido...';

        renderizarTableroPenales();

        setTimeout(async () => {
            await finalizarPenalesOficial(evaluacion.golesL, evaluacion.golesV, evaluacion.ganador);
        }, 1200);
    }
}

function deshacerUltimoTiroPenal() {
    if (estadoTandaPenales.historialTiros.length === 0) return;

    const ultimo = estadoTandaPenales.historialTiros.pop();
    if (ultimo.equipo === 'LOCAL') {
        estadoTandaPenales.tirosLocal.pop();
    } else {
        estadoTandaPenales.tirosVisitante.pop();
    }

    estadoTandaPenales.ganador = null;

    const btnGol = document.getElementById('btn-penal-gol');
    const btnFallo = document.getElementById('btn-penal-fallo');
    if (btnGol) btnGol.disabled = false;
    if (btnFallo) btnFallo.disabled = false;

    document.getElementById('penales-panel-finalizado')?.classList.add('hidden');
    renderizarTableroPenales();
    mostrarToast('↩ Último penal deshecho.', 'info');
}

window.activarModuloPenalesMesa = activarModuloPenalesMesa;
window.renderizarTableroPenales = renderizarTableroPenales;
window.registrarTiroPenal = registrarTiroPenal;
window.deshacerUltimoTiroPenal = deshacerUltimoTiroPenal;

function iniciarCronometroFutbol(resetSegundos = false) {
    const partido = state.partidoActivoMesa;
    if (!partido) return;
    const depNorm = obtenerDeporteDePartido(partido);
    if (depNorm !== 'FUTBOL') return;

    const pId = partido.id || partido.Id;
    if (!pId) return;

    const inputGen = document.getElementById('mesa-estado-general');
    const estadoGen = (state.partidoActivoMesa && inputGen ? inputGen.value : (partido.estado || '')).toUpperCase();
    const selDet = document.getElementById('mesa-estado-detalle');
    const estadoDet = (state.partidoActivoMesa && selDet ? selDet.value : (partido.estadoDetalle || '')).toUpperCase();

    // No correr si no está EN_JUEGO o si está en descanso, suspendido o finalizado
    const estaPausado = (estadoDet === 'DESCANSO' || estadoDet === 'ENTRETIEMPO' || estadoDet === 'PENALES' ||
                         estadoDet === 'FINALIZADO' || estadoDet === 'SUSPENDIDO' || 
                         estadoGen === 'SUSPENDIDO' || estadoGen === 'FINALIZADO' ||
                         estadoGen === 'PROGRAMADO' || estadoGen === 'RETRASADO');
    if (estadoGen !== 'EN_JUEGO' || estaPausado) {
        detenerCronometroFutbol(false);
        return;
    }

    let timerData = obtenerEstadoTimerFutbol(pId);
    const inputMin = document.getElementById('mesa-minuto-actual');
    const minActual = (state.partidoActivoMesa && inputMin) ? (parseInt(inputMin.value) || 0) : (partido.minutoActual || 0);

    if (resetSegundos || !timerData) {
        const baseSeconds = (estadoDet === '2T') ? 2700 : (minActual >= 45 ? 2700 : 0);
        segundosFutbolNeto = baseSeconds;
        timerData = {
            running: true,
            startTimestamp: Date.now(),
            segundosNetos: baseSeconds,
            accumulatedSeconds: baseSeconds,
            minutoActual: Math.floor(baseSeconds / 60),
            periodo: estadoDet
        };
    } else {
        const segsBase = timerData.segundosNetos !== undefined ? timerData.segundosNetos : (timerData.accumulatedSeconds || 0);
        segundosFutbolNeto = segsBase;
        timerData.running = true;
        timerData.startTimestamp = Date.now();
        timerData.segundosNetos = segsBase;
        timerData.accumulatedSeconds = segsBase;
        timerData.minutoActual = Math.floor(segsBase / 60);
        timerData.periodo = estadoDet;
    }

    guardarEstadoTimerFutbol(pId, timerData);

    if (cronometroFutbolInterval) {
        clearInterval(cronometroFutbolInterval);
        cronometroFutbolInterval = null;
    }

    cronometroFutbolInterval = setInterval(async () => {
        await tickCronometroFutbol();
    }, 1000);

    // Sincronización visual inmediata
    tickCronometroFutbol();
}

function detenerCronometroFutbol(limpiarCompletamente = false) {
    if (cronometroFutbolInterval) {
        clearInterval(cronometroFutbolInterval);
        cronometroFutbolInterval = null;
    }
    const partido = state.partidoActivoMesa;
    if (!partido) return;
    const pId = partido.id || partido.Id;
    if (!pId) return;

    if (limpiarCompletamente) {
        limpiarEstadoTimerFutbol(pId);
        return;
    }

    const timerData = obtenerEstadoTimerFutbol(pId);
    if (timerData) {
        if (timerData.running && timerData.startTimestamp) {
            const transcurrido = Math.floor((Date.now() - timerData.startTimestamp) / 1000);
            const baseSegs = timerData.segundosNetos !== undefined ? timerData.segundosNetos : (timerData.accumulatedSeconds || 0);
            const nuevoSegs = baseSegs + Math.max(0, transcurrido);
            timerData.segundosNetos = nuevoSegs;
            timerData.accumulatedSeconds = nuevoSegs;
            segundosFutbolNeto = nuevoSegs;
        }
        timerData.running = false;
        timerData.startTimestamp = null;
        guardarEstadoTimerFutbol(pId, timerData);
    }
}

async function tickCronometroFutbol(partidoParam = null) {
    const partido = partidoParam || state.partidoActivoMesa;
    if (!partido) {
        if (!partidoParam) detenerCronometroFutbol(false);
        return;
    }

    const depNorm = obtenerDeporteDePartido(partido);
    if (depNorm !== 'FUTBOL') {
        if (!partidoParam) detenerCronometroFutbol(false);
        return;
    }

    const pId = partido.id || partido.Id;
    if (!pId) return;

    const estaEnMesa = !!(state.partidoActivoMesa && String(state.partidoActivoMesa.id || state.partidoActivoMesa.Id) === String(pId));
    const selGen = document.getElementById('mesa-estado-general');
    const estadoGen = (estaEnMesa && selGen ? selGen.value : (partido.estado || partido.Estado || '')).toUpperCase();
    const selDet = document.getElementById('mesa-estado-detalle');
    const curPeriodo = (estaEnMesa && selDet ? selDet.value : (partido.estadoDetalle || partido.EstadoDetalle || '1T')).toUpperCase().trim();

    const estaPausado = (curPeriodo === 'DESCANSO' || curPeriodo === 'ENTRETIEMPO' || curPeriodo === 'PENALES' ||
                         curPeriodo === 'FINALIZADO' || curPeriodo === 'SUSPENDIDO' || 
                         estadoGen === 'SUSPENDIDO' || estadoGen === 'FINALIZADO' ||
                         estadoGen === 'PROGRAMADO' || estadoGen === 'RETRASADO');
    if (estadoGen !== 'EN_JUEGO' || estaPausado) {
        if (estaEnMesa) {
            detenerCronometroFutbol(false);
        }
        // Si un partido se pausa (tiempo muerto, descanso, penal o suspendido), el gestor no incrementa su tiempo y envía el minuto congelado correspondiente.
        const minCongelado = partido.minutoActual !== undefined ? partido.minutoActual : (curPeriodo === 'DESCANSO' ? 45 : (curPeriodo === 'PENALES' ? 90 : 0));
        await sincronizarMinutoFutbolAPI(partido, minCongelado, estadoGen, curPeriodo);
        return;
    }

    let timerData = obtenerEstadoTimerFutbol(pId);
    if (!timerData) {
        if (estaEnMesa) {
            iniciarCronometroFutbol(false);
            timerData = obtenerEstadoTimerFutbol(pId);
        }
        if (!timerData) return;
    }

    const ahora = Date.now();
    const transcurrido = (timerData.running && timerData.startTimestamp)
        ? Math.floor((ahora - timerData.startTimestamp) / 1000)
        : 0;
    const segsBase = timerData.segundosNetos !== undefined ? timerData.segundosNetos : (timerData.accumulatedSeconds || 0);
    const totalSegundos = segsBase + transcurrido;
    if (estaEnMesa) segundosFutbolNeto = totalSegundos;

    const inputMin = document.getElementById('mesa-minuto-actual');
    const infoLabel = document.getElementById('mesa-operativo-info');

    // =========================================================================
    // 1. PRIMER TIEMPO: De 0' : 00s hasta 45' : 00s exactos (2700 segundos)
    // =========================================================================
    if (curPeriodo === '1T' || (!curPeriodo.includes('2T') && totalSegundos < 2700)) {
        if (totalSegundos >= 2700) {
            // En el segundo exacto que alcance 45' : 00s (2700s), DETÉN el cronómetro inmediatamente en 45' : 00s y asigna estado_detalle = 'DESCANSO'
            if (estaEnMesa) {
                segundosFutbolNeto = 2700;
                detenerCronometroFutbol(false);
                if (inputMin) inputMin.value = 45;
            }

            timerData.running = false;
            timerData.startTimestamp = null;
            timerData.segundosNetos = 2700;
            timerData.accumulatedSeconds = 2700;
            timerData.minutoActual = 45;
            timerData.minuto_actual = 45;
            timerData.periodo = 'DESCANSO';
            guardarEstadoTimerFutbol(pId, timerData);

            partido.minutoActual = 45;
            partido.MinutoActual = 45;

            const nuevoDetalle = 'DESCANSO';
            if (estaEnMesa && selDet) {
                if (!Array.from(selDet.options).some(o => o.value === 'DESCANSO')) {
                    const opt = document.createElement('option');
                    opt.value = 'DESCANSO';
                    opt.textContent = '⏸ DESCANSO (Entretiempo)';
                    selDet.appendChild(opt);
                }
                selDet.value = 'DESCANSO';
            }

            partido.estadoDetalle = nuevoDetalle;
            if (state.partidoActivoMesa && estaEnMesa) {
                state.partidoActivoMesa.estadoDetalle = nuevoDetalle;
                state.partidoActivoMesa.minutoActual = 45;
            }

            if (estaEnMesa && infoLabel) {
                infoLabel.innerHTML = `<span style="color:#f59e0b; font-weight:800;">⏸ DESCANSO &bull; Minuto 45' : 00s (Reloj detenido)</span>`;
            }

            if (estaEnMesa) {
                await guardarMarcadorMesa();
                actualizarControlesOperativosMesa();
                mostrarToast('⏸ ¡Fin del 1er Tiempo (45:00)! Cronómetro detenido en Descanso.', 'info');
            } else {
                await sincronizarMinutoFutbolAPI(partido, 45, estadoGen, nuevoDetalle);
            }
            return;
        }

        // 1T en marcha activa
        const minDisplay = Math.min(44, Math.floor(totalSegundos / 60));
        const segDisplay = totalSegundos % 60;
        const segStr = (segDisplay < 10 ? '0' : '') + segDisplay;

        if (estaEnMesa && infoLabel) {
            infoLabel.innerHTML = `<span style="color:#2ed573; font-weight:800;">🔴 En Juego: 1T &bull; Minuto ${minDisplay}' : ${segStr}s (Reloj en marcha)</span>`;
        }

        const minutoCalculado = minDisplay;
        const minutoCambio = (estaEnMesa && inputMin && inputMin.value != minutoCalculado);
        if (minutoCambio && inputMin) {
            inputMin.value = minutoCalculado;
        }
        partido.minutoActual = minutoCalculado;
        partido.MinutoActual = minutoCalculado;

        // Auto-sync cada 10 segundos o cuando cambia de minuto
        const ahoraSync = Date.now();
        if (ahoraSync - ultimoSyncFutbolTimestamp >= 10000 || minutoCambio || !estaEnMesa) {
            if (estaEnMesa) ultimoSyncFutbolTimestamp = ahoraSync;
            timerData.minutoActual = minutoCalculado;
            timerData.minuto_actual = minutoCalculado;
            guardarEstadoTimerFutbol(pId, timerData);
            if (estaEnMesa && minutoCambio) {
                await guardarMarcadorMesa();
            } else {
                await sincronizarMinutoFutbolAPI(partido, minutoCalculado, estadoGen, curPeriodo);
            }
        }
        return;
    }

    // =========================================================================
    // 2. SEGUNDO TIEMPO: De 45' : 00s hasta 90' : 00s exactos (5400 segundos)
    // =========================================================================
    if (curPeriodo === '2T' || totalSegundos >= 2700) {
        if (totalSegundos >= 5400) {
            // En el segundo exacto que alcance 90' : 00s, DETÉN el cronómetro inmediatamente en 90' : 00s.
            if (estaEnMesa) {
                segundosFutbolNeto = 5400;
                detenerCronometroFutbol(false);
                if (inputMin) inputMin.value = 90;
            }

            timerData.running = false;
            timerData.startTimestamp = null;
            timerData.segundosNetos = 5400;
            timerData.accumulatedSeconds = 5400;
            timerData.minutoActual = 90;
            timerData.minuto_actual = 90;

            partido.minutoActual = 90;
            partido.MinutoActual = 90;

            // En partidos con tipo_fase = 'GRUPOS' o 'TODOS_CONTRA_TODOS':
            // Al alcanzar 90' : 00s, el partido se marca automáticamente como FINALIZADO (se reparten 3 pts ganador, 0 perdedor, o 1 pt en empate)
            const esGruposOTodos = esFaseGruposOTodosFutbol(partido);

            if (esGruposOTodos) {
                const nuevoEstado = 'FINALIZADO';
                const nuevoDetalle = 'FINALIZADO';

                timerData.periodo = 'FINALIZADO';
                guardarEstadoTimerFutbol(pId, timerData);
                gestorPartidosEnJuego.delete(String(pId));

                if (estaEnMesa && selGen) selGen.value = nuevoEstado;
                if (estaEnMesa && selDet) selDet.value = nuevoDetalle;

                partido.estado = nuevoEstado;
                partido.estadoDetalle = nuevoDetalle;
                if (state.partidoActivoMesa && estaEnMesa) {
                    state.partidoActivoMesa.estado = nuevoEstado;
                    state.partidoActivoMesa.estadoDetalle = nuevoDetalle;
                    state.partidoActivoMesa.minutoActual = 90;
                }

                if (estaEnMesa && infoLabel) {
                    infoLabel.innerHTML = `<span style="color:#2ed573; font-weight:800;">🏁 FINALIZADO &bull; Minuto 90' : 00s (Partido Concluido)</span>`;
                }

                const pLoc = estaEnMesa ? (state.marcadorLocalTemp || 0) : ((partido.puntosLocal !== undefined ? partido.puntosLocal : partido.PuntosLocal) || 0);
                const pVis = estaEnMesa ? (state.marcadorVisitTemp || 0) : ((partido.puntosVisitante !== undefined ? partido.puntosVisitante : partido.PuntosVisitante) || 0);
                const nomLoc = partido.equipoLocalNombre || partido.EquipoLocalNombre || 'Local';
                const nomVis = partido.equipoVisitanteNombre || partido.EquipoVisitanteNombre || 'Visitante';

                let toastMsg = '';
                if (pLoc > pVis) {
                    toastMsg = `🏁 ¡Fin del partido oficial (90:00)! Ganador: ${nomLoc} (${pLoc}-${pVis}). 3 pts para ${nomLoc}, 0 pts para ${nomVis}.`;
                } else if (pVis > pLoc) {
                    toastMsg = `🏁 ¡Fin del partido oficial (90:00)! Ganador: ${nomVis} (${pLoc}-${pVis}). 3 pts para ${nomVis}, 0 pts para ${nomLoc}.`;
                } else {
                    toastMsg = `🏁 ¡Fin del partido oficial (90:00) en EMPATE (${pLoc}-${pVis})! 1 punto repartido a cada equipo.`;
                }

                if (estaEnMesa) {
                    actualizarBadgeVivo(nuevoEstado);
                    await guardarMarcadorMesa();
                    actualizarControlesOperativosMesa();
                    mostrarToast(toastMsg, 'exito');
                } else {
                    await sincronizarMinutoFutbolAPI(partido, 90, nuevoEstado, nuevoDetalle);
                }
                return;
            } else {
                // Partido de Playoffs / Eliminación directa que alcanza 90:00
                const ptsLoc = estaEnMesa ? (state.marcadorLocalTemp || 0) : Number(partido.puntosLocal || partido.PuntosLocal || 0);
                const ptsVis = estaEnMesa ? (state.marcadorVisitTemp || 0) : Number(partido.puntosVisitante || partido.PuntosVisitante || 0);
                const nomLoc = partido.equipoLocalNombre || partido.EquipoLocalNombre || 'Local';
                const nomVis = partido.equipoVisitanteNombre || partido.EquipoVisitanteNombre || 'Visitante';

                const hayEmpateEliminatoria = await verificarEmpateEliminatoriaFutbol(partido, ptsLoc, ptsVis);

                if (hayEmpateEliminatoria) {
                    timerData.periodo = 'PENALES';
                    guardarEstadoTimerFutbol(pId, timerData);

                    const nuevoEstadoGen = 'EN_JUEGO';
                    const nuevoDetalle = 'PENALES';

                    if (estaEnMesa && selGen) selGen.value = nuevoEstadoGen;
                    if (estaEnMesa && selDet) {
                        if (!Array.from(selDet.options).some(o => o.value === 'PENALES')) {
                            const opt = document.createElement('option');
                            opt.value = 'PENALES';
                            opt.textContent = '🥅 PENALES';
                            selDet.appendChild(opt);
                        }
                        selDet.value = 'PENALES';
                    }

                    partido.estado = nuevoEstadoGen;
                    partido.estadoDetalle = nuevoDetalle;
                    if (state.partidoActivoMesa && estaEnMesa) {
                        state.partidoActivoMesa.estado = nuevoEstadoGen;
                        state.partidoActivoMesa.estadoDetalle = nuevoDetalle;
                        state.partidoActivoMesa.minutoActual = 90;
                    }

                    if (estaEnMesa && infoLabel) {
                        infoLabel.innerHTML = `<span style="color:#e11d48; font-weight:800;">🥅 TANDA DE PENALES &bull; Minuto 90' : 00s (Empate en Eliminatoria)</span>`;
                    }

                    if (estaEnMesa) {
                        actualizarBadgeVivo('PENALES');
                        await guardarMarcadorMesa();
                        actualizarControlesOperativosMesa();
                        activarModuloPenalesMesa(nomLoc, nomVis);
                        mostrarToast('🥅 ¡Empate en eliminatoria al minuto 90! Registra la tanda de penales.', 'info');
                    } else {
                        await sincronizarMinutoFutbolAPI(partido, 90, nuevoEstadoGen, nuevoDetalle);
                    }
                    return;
                } else {
                    // Ganador definido a los 90 minutos (sin necesidad de penales)
                    timerData.periodo = 'FINALIZADO';
                    guardarEstadoTimerFutbol(pId, timerData);
                    gestorPartidosEnJuego.delete(String(pId));

                    const nuevoEstado = 'FINALIZADO';
                    const nuevoDetalle = 'FINALIZADO';

                    if (estaEnMesa && selGen) selGen.value = nuevoEstado;
                    if (estaEnMesa && selDet) selDet.value = nuevoDetalle;

                    partido.estado = nuevoEstado;
                    partido.estadoDetalle = nuevoDetalle;
                    if (state.partidoActivoMesa && estaEnMesa) {
                        state.partidoActivoMesa.estado = nuevoEstado;
                        state.partidoActivoMesa.estadoDetalle = nuevoDetalle;
                        state.partidoActivoMesa.minutoActual = 90;
                    }

                    if (estaEnMesa && infoLabel) {
                        infoLabel.innerHTML = `<span style="color:#2ed573; font-weight:800;">🏁 FINALIZADO &bull; Minuto 90' : 00s (Partido Concluido)</span>`;
                    }

                    if (estaEnMesa) {
                        actualizarBadgeVivo(nuevoEstado);
                        await guardarMarcadorMesa();
                        actualizarControlesOperativosMesa();
                        mostrarToast('🏁 ¡Partido de eliminación concluido oficialmente a los 90 minutos!', 'exito');
                    } else {
                        await sincronizarMinutoFutbolAPI(partido, 90, nuevoEstado, nuevoDetalle);
                    }
                    return;
                }
            }
        }

        // 2T en marcha activa
        const minDisplay = Math.min(89, Math.max(45, Math.floor(totalSegundos / 60)));
        const segDisplay = totalSegundos % 60;
        const segStr = (segDisplay < 10 ? '0' : '') + segDisplay;

        if (estaEnMesa && infoLabel) {
            infoLabel.innerHTML = `<span style="color:#2ed573; font-weight:800;">🔴 En Juego: 2T &bull; Minuto ${minDisplay}' : ${segStr}s (Reloj en marcha)</span>`;
        }

        const minutoCalculado = minDisplay;
        const minutoCambio = (estaEnMesa && inputMin && inputMin.value != minutoCalculado);
        if (minutoCambio && inputMin) {
            inputMin.value = minutoCalculado;
        }
        partido.minutoActual = minutoCalculado;
        partido.MinutoActual = minutoCalculado;

        // Auto-sync cada 10 segundos o cuando cambia de minuto
        const ahoraSync = Date.now();
        if (ahoraSync - ultimoSyncFutbolTimestamp >= 10000 || minutoCambio || !estaEnMesa) {
            if (estaEnMesa) ultimoSyncFutbolTimestamp = ahoraSync;
            timerData.minutoActual = minutoCalculado;
            timerData.minuto_actual = minutoCalculado;
            guardarEstadoTimerFutbol(pId, timerData);
            if (estaEnMesa && minutoCambio) {
                await guardarMarcadorMesa();
            } else {
                await sincronizarMinutoFutbolAPI(partido, minutoCalculado, estadoGen, curPeriodo);
            }
        }
        return;
    }
}

// ============================================================================
// CRONÓMETRO AUTÓNOMO Y REGLAMENTARIO DE MICROFÚTBOL (20' + 20' = 40' NETOS)
// ============================================================================

async function sincronizarMinutoMicrofutbolAPI(partido, minuto, estado, estadoDetalle) {
    if (!partido) return;
    const pId = partido.id || partido.Id;
    if (!pId) return;

    const estGen = estado || partido.estado || partido.Estado || 'EN_JUEGO';
    const estDet = estadoDetalle || partido.estadoDetalle || partido.EstadoDetalle || '1T';
    const ptsL = (partido.puntosLocal !== undefined ? partido.puntosLocal : partido.PuntosLocal) ?? (state.marcadorLocalTemp || 0);
    const ptsV = (partido.puntosVisitante !== undefined ? partido.puntosVisitante : partido.PuntosVisitante) ?? (state.marcadorVisitTemp || 0);

    let estadoDb = estGen;
    let estadoDetalleDb = estDet;
    if (estGen === 'SUSPENDIDO') {
        estadoDb = 'EN_JUEGO';
        estadoDetalleDb = 'SUSPENDIDO';
    } else if (estGen === 'RETRASADO') {
        estadoDb = 'PROGRAMADO';
        estadoDetalleDb = 'RETRASADO';
    } else if (estGen === 'APLAZADO') {
        estadoDb = 'PROGRAMADO';
        estadoDetalleDb = 'APLAZADO';
    }

    const payload = {
        puntosLocal: Number(ptsL),
        puntosVisitante: Number(ptsV),
        estado: estadoDb,
        estadoDetalle: estadoDetalleDb,
        minutoActual: Number(minuto)
    };

    try {
        await fetch(`${API_URL}/partidos/${pId}/marcador`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.warn('Error en auto-sync microfútbol (PATCH /api/partidos/{id}/marcador):', e);
    }
}

function iniciarCronometroMicrofutbol(resetSegundos = false) {
    const partido = state.partidoActivoMesa;
    if (!partido) return;
    const depNorm = obtenerDeporteDePartido(partido);
    if (depNorm !== 'MICROFUTBOL') return;

    const pId = partido.id || partido.Id;
    if (!pId) return;

    const inputGen = document.getElementById('mesa-estado-general');
    const estadoGen = (state.partidoActivoMesa && inputGen ? inputGen.value : (partido.estado || '')).toUpperCase();
    const selDet = document.getElementById('mesa-estado-detalle');
    const estadoDet = (state.partidoActivoMesa && selDet ? selDet.value : (partido.estadoDetalle || '')).toUpperCase();

    const estaPausado = (estadoDet === 'DESCANSO' || estadoDet === 'ENTRETIEMPO' || estadoDet === 'PENALES' ||
                         estadoDet === 'FINALIZADO' || estadoDet === 'SUSPENDIDO' || 
                         estadoGen === 'SUSPENDIDO' || estadoGen === 'FINALIZADO' ||
                         estadoGen === 'PROGRAMADO' || estadoGen === 'RETRASADO');
    if (estadoGen !== 'EN_JUEGO' || estaPausado) {
        detenerCronometroMicrofutbol(false);
        return;
    }

    let timerData = obtenerEstadoTimerMicrofutbol(pId);
    const inputMin = document.getElementById('mesa-minuto-actual');
    const minActual = (state.partidoActivoMesa && inputMin) ? (parseInt(inputMin.value) || 0) : (partido.minutoActual || 0);

    if (resetSegundos || !timerData) {
        const baseSeconds = (estadoDet === '2T') ? 1200 : (minActual >= 20 ? 1200 : 0);
        segundosMicrofutbolNeto = baseSeconds;
        timerData = {
            running: true,
            startTimestamp: Date.now(),
            segundosNetos: baseSeconds,
            accumulatedSeconds: baseSeconds,
            minutoActual: Math.floor(baseSeconds / 60),
            periodo: estadoDet
        };
    } else {
        const segsBase = timerData.segundosNetos !== undefined ? timerData.segundosNetos : (timerData.accumulatedSeconds || 0);
        segundosMicrofutbolNeto = segsBase;
        timerData.running = true;
        timerData.startTimestamp = Date.now();
        timerData.segundosNetos = segsBase;
        timerData.accumulatedSeconds = segsBase;
        timerData.minutoActual = Math.floor(segsBase / 60);
        timerData.periodo = estadoDet;
    }

    guardarEstadoTimerMicrofutbol(pId, timerData);

    if (cronometroMicrofutbolInterval) {
        clearInterval(cronometroMicrofutbolInterval);
        cronometroMicrofutbolInterval = null;
    }

    cronometroMicrofutbolInterval = setInterval(async () => {
        await tickCronometroMicrofutbol();
    }, 1000);

    tickCronometroMicrofutbol();
}

function detenerCronometroMicrofutbol(limpiarCompletamente = false) {
    if (cronometroMicrofutbolInterval) {
        clearInterval(cronometroMicrofutbolInterval);
        cronometroMicrofutbolInterval = null;
    }
    const partido = state.partidoActivoMesa;
    if (!partido) return;
    const pId = partido.id || partido.Id;
    if (!pId) return;

    if (limpiarCompletamente) {
        limpiarEstadoTimerMicrofutbol(pId);
        return;
    }

    const timerData = obtenerEstadoTimerMicrofutbol(pId);
    if (timerData) {
        if (timerData.running && timerData.startTimestamp) {
            const transcurrido = Math.floor((Date.now() - timerData.startTimestamp) / 1000);
            const baseSegs = timerData.segundosNetos !== undefined ? timerData.segundosNetos : (timerData.accumulatedSeconds || 0);
            const nuevoSegs = baseSegs + Math.max(0, transcurrido);
            timerData.segundosNetos = nuevoSegs;
            timerData.accumulatedSeconds = nuevoSegs;
            segundosMicrofutbolNeto = nuevoSegs;
        }
        timerData.running = false;
        timerData.startTimestamp = null;
        guardarEstadoTimerMicrofutbol(pId, timerData);
    }
}

async function tickCronometroMicrofutbol(partidoParam = null) {
    const partido = partidoParam || state.partidoActivoMesa;
    if (!partido) {
        if (!partidoParam) detenerCronometroMicrofutbol(false);
        return;
    }

    const depNorm = obtenerDeporteDePartido(partido);
    if (depNorm !== 'MICROFUTBOL') {
        if (!partidoParam) detenerCronometroMicrofutbol(false);
        return;
    }

    const pId = partido.id || partido.Id;
    if (!pId) return;

    const estaEnMesa = !!(state.partidoActivoMesa && String(state.partidoActivoMesa.id || state.partidoActivoMesa.Id) === String(pId));
    const selGen = document.getElementById('mesa-estado-general');
    const estadoGen = (estaEnMesa && selGen ? selGen.value : (partido.estado || partido.Estado || '')).toUpperCase();
    const selDet = document.getElementById('mesa-estado-detalle');
    const curPeriodo = (estaEnMesa && selDet ? selDet.value : (partido.estadoDetalle || partido.EstadoDetalle || '1T')).toUpperCase().trim();

    const estaPausado = (curPeriodo === 'DESCANSO' || curPeriodo === 'ENTRETIEMPO' || curPeriodo === 'PENALES' ||
                         curPeriodo === 'FINALIZADO' || curPeriodo === 'SUSPENDIDO' || 
                         estadoGen === 'SUSPENDIDO' || estadoGen === 'FINALIZADO' ||
                         estadoGen === 'PROGRAMADO' || estadoGen === 'RETRASADO');
    if (estadoGen !== 'EN_JUEGO' || estaPausado) {
        if (estaEnMesa) {
            detenerCronometroMicrofutbol(false);
        }
        const minCongelado = partido.minutoActual !== undefined ? partido.minutoActual : (curPeriodo === 'DESCANSO' ? 20 : (curPeriodo === 'PENALES' ? 40 : 0));
        await sincronizarMinutoMicrofutbolAPI(partido, minCongelado, estadoGen, curPeriodo);
        return;
    }

    let timerData = obtenerEstadoTimerMicrofutbol(pId);
    if (!timerData) {
        if (estaEnMesa) {
            iniciarCronometroMicrofutbol(false);
            timerData = obtenerEstadoTimerMicrofutbol(pId);
        }
        if (!timerData) return;
    }

    const ahora = Date.now();
    const transcurrido = (timerData.running && timerData.startTimestamp)
        ? Math.floor((ahora - timerData.startTimestamp) / 1000)
        : 0;
    const segsBase = timerData.segundosNetos !== undefined ? timerData.segundosNetos : (timerData.accumulatedSeconds || 0);
    const totalSegundos = segsBase + transcurrido;
    if (estaEnMesa) segundosMicrofutbolNeto = totalSegundos;

    const inputMin = document.getElementById('mesa-minuto-actual');
    const infoLabel = document.getElementById('mesa-operativo-info');

    // 1T: 0 a 20 min (1200 seg)
    if (curPeriodo === '1T' || (!curPeriodo.includes('2T') && totalSegundos < 1200)) {
        if (totalSegundos >= 1200) {
            if (estaEnMesa) {
                segundosMicrofutbolNeto = 1200;
                detenerCronometroMicrofutbol(false);
                if (inputMin) inputMin.value = 20;
            }

            timerData.running = false;
            timerData.startTimestamp = null;
            timerData.segundosNetos = 1200;
            timerData.accumulatedSeconds = 1200;
            timerData.minutoActual = 20;
            timerData.minuto_actual = 20;
            timerData.periodo = 'DESCANSO';
            guardarEstadoTimerMicrofutbol(pId, timerData);

            partido.minutoActual = 20;
            partido.MinutoActual = 20;

            const nuevoDetalle = 'DESCANSO';
            if (estaEnMesa && selDet) {
                if (!Array.from(selDet.options).some(o => o.value === 'DESCANSO')) {
                    const opt = document.createElement('option');
                    opt.value = 'DESCANSO';
                    opt.textContent = '⏸ DESCANSO (Entretiempo)';
                    selDet.appendChild(opt);
                }
                selDet.value = 'DESCANSO';
            }

            partido.estadoDetalle = nuevoDetalle;
            if (state.partidoActivoMesa && estaEnMesa) {
                state.partidoActivoMesa.estadoDetalle = nuevoDetalle;
                state.partidoActivoMesa.minutoActual = 20;
            }

            if (estaEnMesa && infoLabel) {
                infoLabel.innerHTML = `<span style="color:#f59e0b; font-weight:800;">⏸ DESCANSO &bull; Minuto 20' : 00s (Reloj detenido)</span>`;
            }

            if (estaEnMesa) {
                await guardarMarcadorMesa();
                actualizarControlesOperativosMesa();
                mostrarToast('⏸ ¡Fin del 1er Tiempo (20:00)! Cronómetro detenido en Descanso.', 'info');
            } else {
                await sincronizarMinutoMicrofutbolAPI(partido, 20, estadoGen, nuevoDetalle);
            }
            return;
        }

        const minDisplay = Math.min(19, Math.floor(totalSegundos / 60));
        const segDisplay = totalSegundos % 60;
        const segStr = (segDisplay < 10 ? '0' : '') + segDisplay;

        if (estaEnMesa && infoLabel) {
            infoLabel.innerHTML = `<span style="color:#2ed573; font-weight:800;">🔴 En Juego: 1T &bull; Minuto ${minDisplay}' : ${segStr}s (Reloj en marcha)</span>`;
        }

        const minutoCalculado = minDisplay;
        const minutoCambio = (estaEnMesa && inputMin && inputMin.value != minutoCalculado);
        if (minutoCambio && inputMin) {
            inputMin.value = minutoCalculado;
        }
        partido.minutoActual = minutoCalculado;
        partido.MinutoActual = minutoCalculado;

        const ahoraSync = Date.now();
        if (ahoraSync - ultimoSyncMicrofutbolTimestamp >= 10000 || minutoCambio || !estaEnMesa) {
            if (estaEnMesa) ultimoSyncMicrofutbolTimestamp = ahoraSync;
            timerData.minutoActual = minutoCalculado;
            timerData.minuto_actual = minutoCalculado;
            guardarEstadoTimerMicrofutbol(pId, timerData);
            if (estaEnMesa && minutoCambio) {
                await guardarMarcadorMesa();
            } else {
                await sincronizarMinutoMicrofutbolAPI(partido, minutoCalculado, estadoGen, curPeriodo);
            }
        }
        return;
    }

    // 2T: 20 a 40 min (2400 seg)
    if (curPeriodo === '2T' || totalSegundos >= 1200) {
        if (totalSegundos >= 2400) {
            if (estaEnMesa) {
                segundosMicrofutbolNeto = 2400;
                detenerCronometroMicrofutbol(false);
                if (inputMin) inputMin.value = 40;
            }

            timerData.running = false;
            timerData.startTimestamp = null;
            timerData.segundosNetos = 2400;
            timerData.accumulatedSeconds = 2400;
            timerData.minutoActual = 40;
            timerData.minuto_actual = 40;

            partido.minutoActual = 40;
            partido.MinutoActual = 40;

            const esGruposOTodos = esFaseGruposOTodosFutbol(partido);

            if (esGruposOTodos) {
                const nuevoEstado = 'FINALIZADO';
                const nuevoDetalle = 'FINALIZADO';

                timerData.periodo = 'FINALIZADO';
                guardarEstadoTimerMicrofutbol(pId, timerData);
                gestorPartidosEnJuego.delete(String(pId));

                if (estaEnMesa && selGen) selGen.value = nuevoEstado;
                if (estaEnMesa && selDet) selDet.value = nuevoDetalle;

                partido.estado = nuevoEstado;
                partido.estadoDetalle = nuevoDetalle;
                if (state.partidoActivoMesa && estaEnMesa) {
                    state.partidoActivoMesa.estado = nuevoEstado;
                    state.partidoActivoMesa.estadoDetalle = nuevoDetalle;
                    state.partidoActivoMesa.minutoActual = 40;
                }

                if (estaEnMesa && infoLabel) {
                    infoLabel.innerHTML = `<span style="color:#2ed573; font-weight:800;">🏁 FINALIZADO &bull; Minuto 40' : 00s (Partido Concluido)</span>`;
                }

                if (estaEnMesa) {
                    actualizarBadgeVivo(nuevoEstado);
                    await guardarMarcadorMesa();
                    actualizarControlesOperativosMesa();
                    mostrarToast('🏁 ¡Fin del partido oficial de Microfútbol (40:00)!', 'exito');
                } else {
                    await sincronizarMinutoMicrofutbolAPI(partido, 40, nuevoEstado, nuevoDetalle);
                }
                return;
            } else {
                // Eliminación directa
                const ptsLoc = estaEnMesa ? (state.marcadorLocalTemp || 0) : Number(partido.puntosLocal || partido.PuntosLocal || 0);
                const ptsVis = estaEnMesa ? (state.marcadorVisitTemp || 0) : Number(partido.puntosVisitante || partido.PuntosVisitante || 0);
                const hayEmpate = await verificarEmpateEliminatoriaFutbol(partido, ptsLoc, ptsVis);

                if (hayEmpate) {
                    timerData.periodo = 'PENALES';
                    guardarEstadoTimerMicrofutbol(pId, timerData);

                    const nuevoEstadoGen = 'EN_JUEGO';
                    const nuevoDetalle = 'PENALES';

                    if (estaEnMesa && selGen) selGen.value = nuevoEstadoGen;
                    if (estaEnMesa && selDet) {
                        if (!Array.from(selDet.options).some(o => o.value === 'PENALES')) {
                            const opt = document.createElement('option');
                            opt.value = 'PENALES';
                            opt.textContent = '🥅 PENALES';
                            selDet.appendChild(opt);
                        }
                        selDet.value = 'PENALES';
                    }

                    partido.estado = nuevoEstadoGen;
                    partido.estadoDetalle = nuevoDetalle;
                    if (state.partidoActivoMesa && estaEnMesa) {
                        state.partidoActivoMesa.estado = nuevoEstadoGen;
                        state.partidoActivoMesa.estadoDetalle = nuevoDetalle;
                        state.partidoActivoMesa.minutoActual = 40;
                    }

                    if (estaEnMesa && infoLabel) {
                        infoLabel.innerHTML = `<span style="color:#e11d48; font-weight:800;">🥅 TANDA DE PENALES &bull; Minuto 40' : 00s (Empate en Eliminatoria)</span>`;
                    }

                    if (estaEnMesa) {
                        actualizarBadgeVivo('PENALES');
                        await guardarMarcadorMesa();
                        actualizarControlesOperativosMesa();
                        const nomLoc = partido.equipoLocalNombre || partido.EquipoLocalNombre || 'Local';
                        const nomVis = partido.equipoVisitanteNombre || partido.EquipoVisitanteNombre || 'Visitante';
                        activarModuloPenalesMesa(nomLoc, nomVis);
                        mostrarToast('🥅 ¡Empate en eliminatoria al minuto 40! Registra la tanda de penales.', 'info');
                    } else {
                        await sincronizarMinutoMicrofutbolAPI(partido, 40, nuevoEstadoGen, nuevoDetalle);
                    }
                    return;
                } else {
                    timerData.periodo = 'FINALIZADO';
                    guardarEstadoTimerMicrofutbol(pId, timerData);
                    gestorPartidosEnJuego.delete(String(pId));

                    const nuevoEstado = 'FINALIZADO';
                    const nuevoDetalle = 'FINALIZADO';

                    if (estaEnMesa && selGen) selGen.value = nuevoEstado;
                    if (estaEnMesa && selDet) selDet.value = nuevoDetalle;

                    partido.estado = nuevoEstado;
                    partido.estadoDetalle = nuevoDetalle;
                    if (state.partidoActivoMesa && estaEnMesa) {
                        state.partidoActivoMesa.estado = nuevoEstado;
                        state.partidoActivoMesa.estadoDetalle = nuevoDetalle;
                        state.partidoActivoMesa.minutoActual = 40;
                    }

                    if (estaEnMesa && infoLabel) {
                        infoLabel.innerHTML = `<span style="color:#2ed573; font-weight:800;">🏁 FINALIZADO &bull; Minuto 40' : 00s (Partido Concluido)</span>`;
                    }

                    if (estaEnMesa) {
                        actualizarBadgeVivo(nuevoEstado);
                        await guardarMarcadorMesa();
                        actualizarControlesOperativosMesa();
                        mostrarToast('🏁 ¡Partido de Microfútbol concluido a los 40 minutos!', 'exito');
                    } else {
                        await sincronizarMinutoMicrofutbolAPI(partido, 40, nuevoEstado, nuevoDetalle);
                    }
                    return;
                }
            }
        }

        const minDisplay = Math.min(39, Math.max(20, Math.floor(totalSegundos / 60)));
        const segDisplay = totalSegundos % 60;
        const segStr = (segDisplay < 10 ? '0' : '') + segDisplay;

        if (estaEnMesa && infoLabel) {
            infoLabel.innerHTML = `<span style="color:#2ed573; font-weight:800;">🔴 En Juego: 2T &bull; Minuto ${minDisplay}' : ${segStr}s (Reloj en marcha)</span>`;
        }

        const minutoCalculado = minDisplay;
        const minutoCambio = (estaEnMesa && inputMin && inputMin.value != minutoCalculado);
        if (minutoCambio && inputMin) {
            inputMin.value = minutoCalculado;
        }
        partido.minutoActual = minutoCalculado;
        partido.MinutoActual = minutoCalculado;

        const ahoraSync = Date.now();
        if (ahoraSync - ultimoSyncMicrofutbolTimestamp >= 10000 || minutoCambio || !estaEnMesa) {
            if (estaEnMesa) ultimoSyncMicrofutbolTimestamp = ahoraSync;
            timerData.minutoActual = minutoCalculado;
            timerData.minuto_actual = minutoCalculado;
            guardarEstadoTimerMicrofutbol(pId, timerData);
            if (estaEnMesa && minutoCambio) {
                await guardarMarcadorMesa();
            } else {
                await sincronizarMinutoMicrofutbolAPI(partido, minutoCalculado, estadoGen, curPeriodo);
            }
        }
    }
}

// ============================================================================
// GESTOR CENTRALIZADO DE SINCRONIZACIÓN EN SEGUNDO PLANO (MULTIDEPORTE)
// ============================================================================

async function gestorSincronizarTodosPartidosEnJuego() {
    if (gestorPartidosEnJuego.size === 0) return;

    for (const [pId, partido] of gestorPartidosEnJuego.entries()) {
        if (!partido) continue;
        const depNorm = obtenerDeporteDePartido(partido);

        try {
            if (depNorm === 'BALONCESTO') {
                await tickCronometroBaloncesto(partido);
            } else if (depNorm === 'FUTBOL') {
                await tickCronometroFutbol(partido);
            } else if (depNorm === 'MICROFUTBOL') {
                await tickCronometroMicrofutbol(partido);
            }
        } catch (e) {
            console.warn(`Error al sincronizar cronómetro partido #${pId}:`, e);
        }
    }

    // Si el operador está viendo la lista de la mesa técnica, refrescar las tarjetas suavemente
    const vistaLista = document.getElementById('mesa-vista-lista');
    if (vistaLista && !vistaLista.classList.contains('hidden') && typeof cargarTarjetasMesaEnVivo === 'function') {
        cargarTarjetasMesaEnVivo(false);
    }
}

function iniciarGestorGlobalCronometros() {
    if (gestorSyncInterval) {
        clearInterval(gestorSyncInterval);
        gestorSyncInterval = null;
    }
    // Intervalo centralizado de sincronización cada 10 segundos
    gestorSyncInterval = setInterval(async () => {
        await gestorSincronizarTodosPartidosEnJuego();
    }, 10000);
}

// Inmunidad a pestañas en segundo plano: sincronización reactiva al volver a enfocar la ventana
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        gestorSincronizarTodosPartidosEnJuego();
    }
});

window.iniciarPartidoMesa = async function() {
    if (!state.partidoActivoMesa) return;
    const depNorm = obtenerDeporteDePartido(state.partidoActivoMesa);

    document.getElementById('mesa-estado-general').value = 'EN_JUEGO';
    
    // Asignar periodo inicial si no está definido o es genérico
    const selDet = document.getElementById('mesa-estado-detalle');
    const curDet = selDet ? selDet.value : '';
    if (!curDet || curDet === 'PROGRAMADO' || curDet === 'RETRASADO' || curDet === 'SUSPENDIDO') {
        let inicial = '1T';
        if (depNorm === 'BALONCESTO') inicial = 'Q1';
        else if (depNorm === 'VOLEIBOL') inicial = 'SET 1';
        else if (depNorm === 'BEISBOL' || depNorm === 'SOFTBOL') inicial = '▲ Alta 1ª';
        if (selDet) selDet.value = inicial;
    }

    const inputMinuto = document.getElementById('mesa-minuto-actual');
    if (inputMinuto && (!inputMinuto.value || inputMinuto.value === '0')) {
        const tieneReloj = (depNorm === 'FUTBOL' || depNorm === 'MICROFUTBOL' || depNorm === 'BALONCESTO');
        if (tieneReloj) {
            inputMinuto.value = (depNorm === 'FUTBOL' || depNorm === 'MICROFUTBOL') ? 0 : 1;
        }
    }

    await guardarMarcadorMesa();
    actualizarControlesOperativosMesa();

    if (depNorm === 'BALONCESTO') {
        segundosBaloncestoNeto = 0;
        iniciarCronometroBaloncesto(true);
    } else if (depNorm === 'FUTBOL') {
        segundosFutbolNeto = 0;
        iniciarCronometroFutbol(true);
    } else if (depNorm === 'MICROFUTBOL') {
        segundosMicrofutbolNeto = 0;
        iniciarCronometroMicrofutbol(true);
    }

    gestorPartidosEnJuego.set(String(state.partidoActivoMesa.id || state.partidoActivoMesa.Id), state.partidoActivoMesa);

    mostrarToast('▶ ¡Partido iniciado oficialmente en vivo!', 'exito');
};

window.suspenderPartidoMesa = async function() {
    if (!state.partidoActivoMesa) return;
    const ok = await mostrarConfirmacionModal(
        '¿Deseas suspender temporalmente este encuentro? El cronómetro quedará congelado en el minuto y periodo exactos.',
        '⏸ Suspender Partido',
        'Sí, Suspender',
        'Cancelar'
    );
    if (!ok) return;

    detenerCronometroBaloncesto(false);
    detenerCronometroFutbol(false);
    detenerCronometroMicrofutbol(false);

    const selDet = document.getElementById('mesa-estado-detalle');
    if (selDet && selDet.value !== 'SUSPENDIDO') {
        ultimoPeriodoAntesPausa = selDet.value;
    }

    document.getElementById('mesa-estado-general').value = 'SUSPENDIDO';
    if (selDet) {
        if (!Array.from(selDet.options).some(o => o.value === 'SUSPENDIDO')) {
            const opt = document.createElement('option');
            opt.value = 'SUSPENDIDO';
            opt.textContent = '⚠️ SUSPENDIDO';
            selDet.appendChild(opt);
        }
        selDet.value = 'SUSPENDIDO';
    }

    actualizarBadgeVivo('SUSPENDIDO');
    actualizarControlesOperativosMesa();
    await guardarMarcadorMesa();
    mostrarToast('⚠️ Partido marcado como SUSPENDIDO.', 'info');
};

window.reanudarPartidoMesa = async function() {
    if (!state.partidoActivoMesa) return;
    const depNorm = obtenerDeporteDePartido(state.partidoActivoMesa);

    document.getElementById('mesa-estado-general').value = 'EN_JUEGO';
    const selDet = document.getElementById('mesa-estado-detalle');
    if (selDet && (selDet.value === 'SUSPENDIDO' || !selDet.value)) {
        selDet.value = ultimoPeriodoAntesPausa || (depNorm === 'BALONCESTO' ? 'Q1' : '1T');
    }

    actualizarBadgeVivo('EN_JUEGO');
    actualizarControlesOperativosMesa();
    await guardarMarcadorMesa();

    if (depNorm === 'BALONCESTO') {
        iniciarCronometroBaloncesto(false);
    } else if (depNorm === 'FUTBOL') {
        iniciarCronometroFutbol(false);
    } else if (depNorm === 'MICROFUTBOL') {
        iniciarCronometroMicrofutbol(false);
    }

    gestorPartidosEnJuego.set(String(state.partidoActivoMesa.id || state.partidoActivoMesa.Id), state.partidoActivoMesa);

    mostrarToast('▶ Partido reanudado en vivo.', 'exito');
};

window.aplazarPartidoMesa = async function() {
    if (!state.partidoActivoMesa) return;
    const ok = await mostrarConfirmacionModal(
        '¿Deseas aplazar este partido para ser reprogramado?',
        '📅 Aplazar Partido',
        'Sí, Aplazar',
        'Cancelar'
    );
    if (!ok) return;

    const aplId = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
    detenerCronometroBaloncesto(true);
    detenerCronometroFutbol(true);
    detenerCronometroMicrofutbol(true);
    limpiarEstadoTimerMicrofutbol(aplId);
    gestorPartidosEnJuego.delete(String(aplId));
    document.getElementById('mesa-estado-general').value = 'APLAZADO';
    await guardarMarcadorMesa();
    mostrarToast('📅 Partido marcado como APLAZADO.', 'info');
};

window.finalizarPeriodoMesa = async function() {
    if (!state.partidoActivoMesa) return;
    const depNorm = obtenerDeporteDePartido(state.partidoActivoMesa);
    const selDet = document.getElementById('mesa-estado-detalle');
    const inputMin = document.getElementById('mesa-minuto-actual');
    const curDet = selDet ? selDet.value.toUpperCase() : '';

    if (depNorm === 'FUTBOL') {
        detenerCronometroFutbol(false);
        if (curDet === '1T') {
            segundosFutbolNeto = 2700;
            if (inputMin) inputMin.value = 45;
            if (selDet) {
                if (!Array.from(selDet.options).some(o => o.value === 'DESCANSO')) {
                    const opt = document.createElement('option');
                    opt.value = 'DESCANSO';
                    opt.textContent = '⏸ DESCANSO (Entretiempo)';
                    selDet.appendChild(opt);
                }
                selDet.value = 'DESCANSO';
            }
            if (state.partidoActivoMesa) {
                state.partidoActivoMesa.estadoDetalle = 'DESCANSO';
                state.partidoActivoMesa.minutoActual = 45;
            }
            const pId = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
            guardarEstadoTimerFutbol(pId, {
                running: false,
                startTimestamp: null,
                segundosNetos: 2700,
                accumulatedSeconds: 2700,
                minutoActual: 45,
                periodo: 'DESCANSO'
            });
            await guardarMarcadorMesa();
            actualizarControlesOperativosMesa();
            mostrarToast('⏸ 1T Finalizado (45 min). El reloj queda congelado en Descanso.', 'info');
            return;
        } else if (curDet === '2T') {
            segundosFutbolNeto = 5400;
            if (inputMin) inputMin.value = 90;
            if (state.partidoActivoMesa) {
                state.partidoActivoMesa.minutoActual = 90;
            }
            await finalizarPartidoOficial();
            return;
        }
    } else if (depNorm === 'MICROFUTBOL') {
        detenerCronometroMicrofutbol(false);
        if (curDet === '1T') {
            segundosMicrofutbolNeto = 1200;
            if (inputMin) inputMin.value = 20;
            if (selDet) {
                if (!Array.from(selDet.options).some(o => o.value === 'DESCANSO')) {
                    const opt = document.createElement('option');
                    opt.value = 'DESCANSO';
                    opt.textContent = '⏸ DESCANSO (Entretiempo)';
                    selDet.appendChild(opt);
                }
                selDet.value = 'DESCANSO';
            }
            if (state.partidoActivoMesa) {
                state.partidoActivoMesa.estadoDetalle = 'DESCANSO';
                state.partidoActivoMesa.minutoActual = 20;
            }
            const pId = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
            guardarEstadoTimerMicrofutbol(pId, {
                running: false,
                startTimestamp: null,
                segundosNetos: 1200,
                accumulatedSeconds: 1200,
                minutoActual: 20,
                periodo: 'DESCANSO'
            });
            await guardarMarcadorMesa();
            actualizarControlesOperativosMesa();
            mostrarToast('⏸ 1T Finalizado (20 min). El reloj queda congelado en Descanso.', 'info');
            return;
        } else if (curDet === '2T') {
            segundosMicrofutbolNeto = 2400;
            if (inputMin) inputMin.value = 40;
            if (state.partidoActivoMesa) {
                state.partidoActivoMesa.minutoActual = 40;
            }
            await finalizarPartidoOficial();
            return;
        }
    } else if (depNorm === 'BALONCESTO') {
        detenerCronometroBaloncesto(true);
        if (curDet === 'Q1') {
            if (inputMin) inputMin.value = 10;
            if (selDet) selDet.value = 'PAUSA Q1';
            await guardarMarcadorMesa();
            mostrarToast('⏸ Q1 Finalizado (10 min). Pausa reglamentaria de 2 minutos.', 'info');
            return;
        } else if (curDet === 'Q2') {
            if (inputMin) inputMin.value = 20;
            if (selDet) selDet.value = 'DESCANSO';
            await guardarMarcadorMesa();
            mostrarToast('⏸ Q2 Finalizado (20 min). Medio tiempo reglamentario de 10 minutos.', 'info');
            return;
        } else if (curDet === 'Q3') {
            if (inputMin) inputMin.value = 30;
            if (selDet) selDet.value = 'PAUSA Q3';
            await guardarMarcadorMesa();
            mostrarToast('⏸ Q3 Finalizado (30 min). Pausa reglamentaria de 2 minutos.', 'info');
            return;
        } else if (curDet === 'Q4' || curDet.includes('OVERTIME') || curDet.includes('OT') || curDet.includes('PRORROGA') || curDet === 'PAUSA EXTRA TIEMPO') {
            if (state.marcadorLocalTemp === state.marcadorVisitTemp) {
                mostrarToast('⚖️ ¡Empate reglamentario en Baloncesto! Se prohíbe finalizar en empate: activa Tiempo Extra (OT).', 'error');
                if (selDet) {
                    if (!Array.from(selDet.options).some(o => o.value === 'PAUSA EXTRA TIEMPO')) {
                        const opt = document.createElement('option');
                        opt.value = 'PAUSA EXTRA TIEMPO';
                        opt.textContent = '⏸ PAUSA EXTRA TIEMPO';
                        selDet.appendChild(opt);
                    }
                    selDet.value = 'PAUSA EXTRA TIEMPO';
                }
                await guardarMarcadorMesa();
                verificarBotonFinalizarBaloncesto();
                actualizarControlesOperativosMesa();
                return;
            } else {
                await finalizarPartidoOficial();
                return;
            }
        }
    }

    await guardarMarcadorMesa();
};

window.iniciarSiguientePeriodoMesa = async function() {
    if (!state.partidoActivoMesa) return;
    const depNorm = obtenerDeporteDePartido(state.partidoActivoMesa);
    const selDet = document.getElementById('mesa-estado-detalle');
    const inputMin = document.getElementById('mesa-minuto-actual');
    const curDet = selDet ? selDet.value.toUpperCase() : '';

    if (depNorm === 'FUTBOL') {
        if (curDet === 'ENTRETIEMPO' || curDet === 'DESCANSO') {
            if (selDet) selDet.value = '2T';
            if (inputMin) inputMin.value = 45;
            segundosFutbolNeto = 2700;
            if (state.partidoActivoMesa) {
                state.partidoActivoMesa.minutoActual = 45;
                state.partidoActivoMesa.minuto_actual = 45;
                state.partidoActivoMesa.estado = 'EN_JUEGO';
                state.partidoActivoMesa.estadoDetalle = '2T';
            }
            const pId = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
            guardarEstadoTimerFutbol(pId, {
                running: true,
                startTimestamp: Date.now(),
                segundosNetos: 2700,
                accumulatedSeconds: 2700,
                minutoActual: 45,
                periodo: '2T'
            });
            document.getElementById('mesa-estado-general').value = 'EN_JUEGO';
            await guardarMarcadorMesa();
            iniciarCronometroFutbol(true);
            actualizarControlesOperativosMesa();
            mostrarToast('▶ ¡Inicia el Segundo Tiempo (2T) de Fútbol!', 'exito');
            return;
        }
    } else if (depNorm === 'MICROFUTBOL') {
        if (curDet === 'DESCANSO' || curDet === 'ENTRETIEMPO') {
            if (selDet) selDet.value = '2T';
            if (inputMin) inputMin.value = 20;
            segundosMicrofutbolNeto = 1200;
            if (state.partidoActivoMesa) {
                state.partidoActivoMesa.minutoActual = 20;
                state.partidoActivoMesa.minuto_actual = 20;
                state.partidoActivoMesa.estado = 'EN_JUEGO';
                state.partidoActivoMesa.estadoDetalle = '2T';
            }
            const pId = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
            guardarEstadoTimerMicrofutbol(pId, {
                running: true,
                startTimestamp: Date.now(),
                segundosNetos: 1200,
                accumulatedSeconds: 1200,
                minutoActual: 20,
                periodo: '2T'
            });
            document.getElementById('mesa-estado-general').value = 'EN_JUEGO';
            await guardarMarcadorMesa();
            iniciarCronometroMicrofutbol(true);
            actualizarControlesOperativosMesa();
            mostrarToast('▶ ¡Inicia el Segundo Tiempo (2T) de Microfútbol!', 'exito');
            return;
        }
    } else if (depNorm === 'BALONCESTO') {
        if (curDet === 'PAUSA EXTRA TIEMPO') {
            await iniciarOTBaloncestoMesa();
            return;
        } else if (curDet === 'PAUSA Q1') {
            if (selDet) selDet.value = 'Q2';
            if (inputMin) inputMin.value = 10;
            segundosBaloncestoNeto = 600;
            if (state.partidoActivoMesa) {
                state.partidoActivoMesa.minutoActual = 10;
                state.partidoActivoMesa.minuto_actual = 10;
            }
            await guardarMarcadorMesa();
            iniciarCronometroBaloncesto(true);
            mostrarToast('▶ ¡Inicia el 2° Cuarto (Q2) de Baloncesto!', 'exito');
            return;
        } else if (curDet === 'DESCANSO') {
            if (selDet) selDet.value = 'Q3';
            if (inputMin) inputMin.value = 20;
            segundosBaloncestoNeto = 1200;
            if (state.partidoActivoMesa) {
                state.partidoActivoMesa.minutoActual = 20;
                state.partidoActivoMesa.minuto_actual = 20;
            }
            await guardarMarcadorMesa();
            iniciarCronometroBaloncesto(true);
            mostrarToast('▶ ¡Inicia el 3° Cuarto (Q3) de Baloncesto!', 'exito');
            return;
        } else if (curDet === 'PAUSA Q3') {
            if (selDet) selDet.value = 'Q4';
            if (inputMin) inputMin.value = 30;
            segundosBaloncestoNeto = 1800;
            if (state.partidoActivoMesa) {
                state.partidoActivoMesa.minutoActual = 30;
                state.partidoActivoMesa.minuto_actual = 30;
            }
            await guardarMarcadorMesa();
            iniciarCronometroBaloncesto(true);
            mostrarToast('▶ ¡Inicia el 4° Cuarto (Q4) de Baloncesto!', 'exito');
            return;
        }
    }
};

let ultimoPeriodoAntesPausa = '1T';

window.pausarRelojMesa = async function() {
    if (!state.partidoActivoMesa) return;
    const depNorm = obtenerDeporteDePartido(state.partidoActivoMesa);
    if (depNorm === 'BALONCESTO') {
        detenerCronometroBaloncesto(false);
    } else if (depNorm === 'FUTBOL') {
        detenerCronometroFutbol(false);
    } else if (depNorm === 'MICROFUTBOL') {
        detenerCronometroMicrofutbol(false);
    }
    const inputMin = document.getElementById('mesa-minuto-actual');
    const minutoExacto = (inputMin && inputMin.value !== '') ? parseInt(inputMin.value) : (state.partidoActivoMesa.minutoActual ?? 0);
    const selDet = document.getElementById('mesa-estado-detalle');
    if (selDet) {
        if (selDet.value !== 'PAUSA' && selDet.value !== 'TIEMPO MUERTO' && selDet.value !== 'T. MUERTO') {
            ultimoPeriodoAntesPausa = selDet.value;
        }
        if (!Array.from(selDet.options).some(o => o.value === 'PAUSA')) {
            const opt = document.createElement('option');
            opt.value = 'PAUSA';
            opt.textContent = '⏸ PAUSA';
            selDet.appendChild(opt);
        }
        selDet.value = 'PAUSA';
    }
    if (inputMin) inputMin.value = minutoExacto;
    actualizarControlesOperativosMesa();
    await guardarMarcadorMesa();
    mostrarToast('⏸ Reloj de juego en PAUSA (Balón fuera).', 'info');
};

window.tiempoMuertoMesa = async function() {
    if (!state.partidoActivoMesa) return;
    const depNorm = obtenerDeporteDePartido(state.partidoActivoMesa);
    if (depNorm === 'BALONCESTO') {
        detenerCronometroBaloncesto(false);
    } else if (depNorm === 'FUTBOL') {
        detenerCronometroFutbol(false);
    } else if (depNorm === 'MICROFUTBOL') {
        detenerCronometroMicrofutbol(false);
    }
    const inputMin = document.getElementById('mesa-minuto-actual');
    const minutoExacto = (inputMin && inputMin.value !== '') ? parseInt(inputMin.value) : (state.partidoActivoMesa.minutoActual ?? 0);
    const selDet = document.getElementById('mesa-estado-detalle');
    if (selDet) {
        if (selDet.value !== 'PAUSA' && selDet.value !== 'TIEMPO MUERTO' && selDet.value !== 'T. MUERTO') {
            ultimoPeriodoAntesPausa = selDet.value;
        }
        if (!Array.from(selDet.options).some(o => o.value === 'TIEMPO MUERTO')) {
            const opt = document.createElement('option');
            opt.value = 'TIEMPO MUERTO';
            opt.textContent = '⏸ TIEMPO MUERTO';
            selDet.appendChild(opt);
        }
        selDet.value = 'TIEMPO MUERTO';
    }
    if (inputMin) inputMin.value = minutoExacto;
    actualizarControlesOperativosMesa();
    await guardarMarcadorMesa();
    mostrarToast('⏸ Tiempo Muerto en curso (Minuto congelado).', 'info');
};

window.reanudarRelojMesa = async function() {
    if (!state.partidoActivoMesa) return;
    const depNorm = obtenerDeporteDePartido(state.partidoActivoMesa);
    const selDet = document.getElementById('mesa-estado-detalle');
    if (selDet && ultimoPeriodoAntesPausa) {
        selDet.value = ultimoPeriodoAntesPausa;
    }
    const inputMin = document.getElementById('mesa-minuto-actual');
    const minutoExacto = (inputMin && inputMin.value !== '') ? parseInt(inputMin.value) : (state.partidoActivoMesa.minutoActual ?? 0);
    if (inputMin) inputMin.value = minutoExacto;
    actualizarControlesOperativosMesa();
    await guardarMarcadorMesa();

    if (depNorm === 'BALONCESTO') {
        iniciarCronometroBaloncesto(false);
    } else if (depNorm === 'FUTBOL') {
        iniciarCronometroFutbol(false);
    } else if (depNorm === 'MICROFUTBOL') {
        iniciarCronometroMicrofutbol(false);
    }

    mostrarToast('▶ Reloj reanudado.', 'exito');
};

window.iniciarOTBaloncestoMesa = async function() {
    if (!state.partidoActivoMesa) return;
    const selDet = document.getElementById('mesa-estado-detalle');
    const inputMin = document.getElementById('mesa-minuto-actual');
    
    const curDet = selDet ? selDet.value.toUpperCase().trim() : '';
    const minActual = inputMin ? (parseInt(inputMin.value) || 40) : 40;

    let nuevoDetalle = 'OVERTIME';
    let minBase = 40;
    let segBase = 2400;

    if (curDet === '2OT' || curDet === 'OT2' || minActual >= 50) {
        nuevoDetalle = '3OT';
        minBase = 50;
        segBase = 3000;
    } else if (curDet === '3OT' || curDet === 'OT3' || minActual >= 55) {
        nuevoDetalle = '4OT';
        minBase = 55;
        segBase = 3300;
    } else if (curDet.includes('OVERTIME') || curDet === 'OT' || curDet === 'OT1' || curDet === '1OT' || minActual >= 45) {
        nuevoDetalle = '2OT';
        minBase = 45;
        segBase = 2700;
    } else {
        nuevoDetalle = 'OVERTIME';
        minBase = 40;
        segBase = 2400;
    }

    if (selDet) {
        if (!Array.from(selDet.options).some(o => o.value === nuevoDetalle)) {
            const opt = document.createElement('option');
            opt.value = nuevoDetalle;
            opt.textContent = `${nuevoDetalle} (Tiempo Extra)`;
            selDet.appendChild(opt);
        }
        selDet.value = nuevoDetalle;
    }

    if (inputMin) inputMin.value = minBase;
    segundosBaloncestoNeto = segBase;
    if (state.partidoActivoMesa) {
        state.partidoActivoMesa.minutoActual = minBase;
        state.partidoActivoMesa.minuto_actual = minBase;
    }
    document.getElementById('mesa-estado-general').value = 'EN_JUEGO';

    await guardarMarcadorMesa();
    iniciarCronometroBaloncesto(true);
    actualizarControlesOperativosMesa();
    mostrarToast(`⚡ ¡${nuevoDetalle} iniciado! 5 minutos netos de juego adicionales (Hasta min ${minBase + 5}').`, 'exito');
};

window.ajustarMinutoMesa = async function(delta) {
    if (!state.partidoActivoMesa) return;
    const inputMinuto = document.getElementById('mesa-minuto-actual');
    if (!inputMinuto) return;
    const actual = parseInt(inputMinuto.value) || 0;
    const nuevo = Math.max(0, actual + delta);
    inputMinuto.value = nuevo;

    const depNorm = obtenerDeporteDePartido(state.partidoActivoMesa);
    if (depNorm === 'BALONCESTO') {
        const pId = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
        const timerData = obtenerEstadoTimerBaloncesto(pId) || { running: false };
        const segsNuevos = Math.max(0, (nuevo - 1) * 60);
        timerData.segundosNetos = segsNuevos;
        timerData.accumulatedSeconds = segsNuevos;
        timerData.minutoActual = nuevo;
        timerData.startTimestamp = Date.now();
        segundosBaloncestoNeto = segsNuevos;
        guardarEstadoTimerBaloncesto(pId, timerData);
    } else if (depNorm === 'FUTBOL') {
        const pId = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
        const timerData = obtenerEstadoTimerFutbol(pId) || { running: false };
        const minClamped = Math.min(90, nuevo);
        const segsNuevos = minClamped * 60;
        timerData.segundosNetos = segsNuevos;
        timerData.accumulatedSeconds = segsNuevos;
        timerData.minutoActual = minClamped;
        timerData.startTimestamp = Date.now();
        segundosFutbolNeto = segsNuevos;
        guardarEstadoTimerFutbol(pId, timerData);
    } else if (depNorm === 'MICROFUTBOL') {
        const pId = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
        const timerData = obtenerEstadoTimerMicrofutbol(pId) || { running: false };
        const minClamped = Math.min(40, nuevo);
        const segsNuevos = minClamped * 60;
        timerData.segundosNetos = segsNuevos;
        timerData.accumulatedSeconds = segsNuevos;
        timerData.minutoActual = minClamped;
        if (timerData.running) {
            timerData.startTimestamp = Date.now();
        }
        segundosMicrofutbolNeto = segsNuevos;
        guardarEstadoTimerMicrofutbol(pId, timerData);
    }
    await guardarMarcadorMesa();
};

async function finalizarPenalesOficial(valLoc, valVis, ganador) {
    if (!state.partidoActivoMesa) return;
    const partido = state.partidoActivoMesa;
    const pId = partido.id || partido.Id;
    const fId = Number(partido.faseId || partido.FaseId || 0);
    const jNum = Number(partido.jornada || partido.Jornada || 1);
    const torneoId = partido.torneoId || partido.TorneoId;
    const eqLocId = partido.equipoLocalId || partido.EquipoLocalId;
    const eqVisId = partido.equipoVisitanteId || partido.EquipoVisitanteId;
    const nomLoc = partido.equipoLocalNombre || partido.EquipoLocalNombre || (typeof obtenerNombreEquipo === 'function' ? obtenerNombreEquipo(eqLocId) : 'Local');
    const nomVis = partido.equipoVisitanteNombre || partido.EquipoVisitanteNombre || (typeof obtenerNombreEquipo === 'function' ? obtenerNombreEquipo(eqVisId) : 'Visitante');

    const ganadorEsLocal = (ganador === 'LOCAL') || (valLoc > valVis);
    const ganadorId = ganadorEsLocal ? eqLocId : eqVisId;
    const nombreGanador = ganadorEsLocal ? nomLoc : nomVis;

    const depNorm = obtenerDeporteDePartido(partido);
    const minReglamentario = (depNorm === 'MICROFUTBOL') ? 40 : 90;

    // Guarda penales_local y penales_visitante en el partido
    partido.penales_local = valLoc;
    partido.penales_visitante = valVis;
    partido.penalesLocal = valLoc;
    partido.penalesVisitante = valVis;
    partido.ganadorId = ganadorId;
    partido.nombreGanador = nombreGanador;
    partido.estado = 'FINALIZADO';
    partido.estadoDetalle = `FINALIZADO (PEN. ${valLoc}-${valVis})`;
    partido.minutoActual = minReglamentario;

    state.partidoActivoMesa.penales_local = valLoc;
    state.partidoActivoMesa.penales_visitante = valVis;
    state.partidoActivoMesa.penalesLocal = valLoc;
    state.partidoActivoMesa.penalesVisitante = valVis;
    state.partidoActivoMesa.ganadorId = ganadorId;
    state.partidoActivoMesa.nombreGanador = nombreGanador;
    state.partidoActivoMesa.estado = 'FINALIZADO';
    state.partidoActivoMesa.estadoDetalle = `FINALIZADO (PEN. ${valLoc}-${valVis})`;
    state.partidoActivoMesa.minutoActual = minReglamentario;

    // Persistir en localStorage para brackets y tiebreaks
    try {
        localStorage.setItem(`playoff_tiebreak_${torneoId}_${fId}_${jNum}`, JSON.stringify({
            id: ganadorId,
            nombre: nombreGanador,
            penales: `${valLoc}-${valVis}`,
            penales_local: valLoc,
            penales_visitante: valVis
        }));
        localStorage.setItem(`partido_penales_${pId}`, JSON.stringify({
            penales_local: valLoc,
            penales_visitante: valVis,
            ganadorId: ganadorId,
            nombreGanador: nombreGanador
        }));
    } catch (e) {}

    // Finaliza el encuentro enviando el PUT a la API
    const ptsL = (partido.puntosLocal !== undefined ? partido.puntosLocal : partido.PuntosLocal) ?? (state.marcadorLocalTemp || 0);
    const ptsV = (partido.puntosVisitante !== undefined ? partido.puntosVisitante : partido.PuntosVisitante) ?? (state.marcadorVisitTemp || 0);

    const payloadPut = {
        id: pId,
        torneoId: torneoId,
        jornada: jNum,
        faseId: fId || null,
        grupoId: partido.grupoId || partido.GrupoId || null,
        canchaId: partido.canchaId || partido.CanchaId,
        equipoLocalId: eqLocId,
        equipoVisitanteId: eqVisId,
        puntosLocal: Number(ptsL),
        puntosVisitante: Number(ptsV),
        penales_local: valLoc,
        penales_visitante: valVis,
        penalesLocal: valLoc,
        penalesVisitante: valVis,
        estado: 'FINALIZADO',
        estadoDetalle: `FINALIZADO (PEN. ${valLoc}-${valVis})`,
        minutoActual: minReglamentario,
        fechaHora: partido.fechaHora || partido.FechaHora || new Date().toISOString()
    };

    try {
        await fetch(`${API_URL}/partidos/${pId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadPut)
        });
    } catch (errPut) {
        console.warn('Advertencia al enviar PUT /partidos:', errPut);
    }

    // Actualizar formulario y estado en la UI
    document.getElementById('mesa-modulo-penales')?.classList.add('hidden');
    document.getElementById('contenedor-penales')?.classList.add('hidden');
    document.getElementById('mesa-estado-general').value = 'FINALIZADO';
    const selDet = document.getElementById('mesa-estado-detalle');
    if (selDet) {
        const detFin = `FINALIZADO (PEN. ${valLoc}-${valVis})`;
        if (!Array.from(selDet.options).some(o => o.value === detFin)) {
            const opt = document.createElement('option');
            opt.value = detFin;
            opt.textContent = detFin;
            selDet.appendChild(opt);
        }
        selDet.value = detFin;
    }

    // Detener cronómetro de fútbol / microfútbol
    detenerCronometroFutbol(true);
    detenerCronometroMicrofutbol(true);
    limpiarEstadoTimerFutbol(pId);
    limpiarEstadoTimerMicrofutbol(pId);
    gestorPartidosEnJuego.delete(String(pId));

    // Guardar marcador oficial sincronizado y actualizar vista
    await guardarMarcadorMesa();
    actualizarBadgeVivo('FINALIZADO');
    actualizarControlesOperativosMesa();

    mostrarToast(`🏆 ¡Clasificado definido por Penales! Ganador: ${nombreGanador} (${valLoc} - ${valVis}). Partido FINALIZADO.`, 'exito');

    // Procesar avance automático en cuadro de playoffs
    if (typeof procesarAvancePlayoff === 'function') {
        await procesarAvancePlayoff(state.partidoActivoMesa, ptsL, ptsV);
    }
}
window.finalizarPenalesOficial = finalizarPenalesOficial;

window.guardarPenalesMesa = async function() {
    if (!state.partidoActivoMesa) return;

    let valLoc = estadoTandaPenales.tirosLocal.filter(t => t === 'GOL').length;
    let valVis = estadoTandaPenales.tirosVisitante.filter(t => t === 'GOL').length;

    // Respaldo por si hay valores en inputs ocultos
    const inpL = document.getElementById('mesa-penales-val-local');
    const inpV = document.getElementById('mesa-penales-val-visit');
    if (inpL && inpL.value !== '' && !isNaN(parseInt(inpL.value, 10)) && estadoTandaPenales.historialTiros.length === 0) {
        valLoc = parseInt(inpL.value, 10);
    }
    if (inpV && inpV.value !== '' && !isNaN(parseInt(inpV.value, 10)) && estadoTandaPenales.historialTiros.length === 0) {
        valVis = parseInt(inpV.value, 10);
    }

    // Valida datos numéricos válidos
    if (isNaN(valLoc) || isNaN(valVis) || valLoc < 0 || valVis < 0) {
        mostrarToast('Ingresa los goles acertados para ambos equipos en los penales.', 'error');
        return;
    }

    // Valida que no haya empate en penales
    if (valLoc === valVis) {
        mostrarToast('En la tanda de penales no puede haber empate. Debe haber un ganador definido.', 'error');
        return;
    }

    const ganador = valLoc > valVis ? 'LOCAL' : 'VISITANTE';
    await finalizarPenalesOficial(valLoc, valVis, ganador);
};

window.cancelarPenalesMesa = function() {
    document.getElementById('mesa-modulo-penales')?.classList.add('hidden');
    document.getElementById('contenedor-penales')?.classList.add('hidden');
};

async function guardarMarcadorMesa() {
    if (!state.partidoActivoMesa) return;
    const id = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
    const deporteNorm = obtenerDeporteDePartido(state.partidoActivoMesa);

    let estadoGeneral = document.getElementById('mesa-estado-general').value;
    let estadoDetalle = document.getElementById('mesa-estado-detalle').value;
    const minutoVal = document.getElementById('mesa-minuto-actual').value;

    // Validación oficial en Voleibol: ningún equipo puede superar 3 sets y al llegar a 3 se bloquea
    if (deporteNorm === 'VOLEIBOL') {
        state.marcadorLocalTemp = Math.min(3, Math.max(0, state.marcadorLocalTemp || 0));
        state.marcadorVisitTemp = Math.min(3, Math.max(0, state.marcadorVisitTemp || 0));
        if (state.marcadorLocalTemp === 3 && state.marcadorVisitTemp === 3) {
            state.marcadorVisitTemp = 2;
        }
        if (state.marcadorLocalTemp >= 3 || state.marcadorVisitTemp >= 3) {
            estadoGeneral = 'FINALIZADO';
            estadoDetalle = 'FINALIZADO';
            document.getElementById('mesa-estado-general').value = 'FINALIZADO';
            const selDet = document.getElementById('mesa-estado-detalle');
            if (selDet) selDet.value = 'FINALIZADO';
            bloquearControlesVoleibolFinalizado();
        }
    }

    // Validación oficial en Baloncesto si intentan guardar como FINALIZADO empatado
    if (deporteNorm === 'BALONCESTO' && (estadoGeneral === 'FINALIZADO' || estadoDetalle === 'FINALIZADO') && state.marcadorLocalTemp === state.marcadorVisitTemp) {
        mostrarToast('⚠️ En Baloncesto no existen empates: juega periodo "OT" (Prórroga) antes de finalizar.', 'error');
        const selectDetalle = document.getElementById('mesa-estado-detalle');
        if (selectDetalle) {
            if (!Array.from(selectDetalle.options).some(o => o.value === 'PAUSA EXTRA TIEMPO')) {
                const opt = document.createElement('option');
                opt.value = 'PAUSA EXTRA TIEMPO';
                opt.textContent = '⏸ PAUSA EXTRA TIEMPO';
                selectDetalle.appendChild(opt);
            }
            selectDetalle.value = 'PAUSA EXTRA TIEMPO';
        }
        document.getElementById('mesa-estado-general').value = 'EN_JUEGO';
        verificarBotonFinalizarBaloncesto();
        actualizarControlesOperativosMesa();
        return;
    }
    
    // Si el deporte no se rige por cronómetro (Sóftbol, Béisbol, Voleibol)
    const tieneReloj = (deporteNorm === 'FUTBOL' || deporteNorm === 'MICROFUTBOL' || deporteNorm === 'BALONCESTO');
    let minutoActual = null;
    if (tieneReloj) {
        minutoActual = (minutoVal !== '' && minutoVal !== null && !isNaN(minutoVal)) ? parseInt(minutoVal) : null;
        if (deporteNorm === 'BALONCESTO' && minutoActual !== null) {
            minutoActual = Math.min(70, Math.max(0, minutoActual));
        } else if (deporteNorm === 'FUTBOL' && minutoActual !== null) {
            minutoActual = Math.min(90, Math.max(0, minutoActual));
        }
    } else if (deporteNorm === 'BEISBOL' || deporteNorm === 'SOFTBOL') {
        minutoActual = outsActuales;
    }

    // Normalización de estados seguros para base de datos MySQL (evitar error 1265 por ENUM estricto)
    let estadoDb = estadoGeneral;
    let estadoDetalleDb = estadoDetalle;
    if (estadoGeneral === 'SUSPENDIDO') {
        estadoDb = 'EN_JUEGO';
        estadoDetalleDb = 'SUSPENDIDO';
    } else if (estadoGeneral === 'RETRASADO') {
        estadoDb = 'PROGRAMADO';
        estadoDetalleDb = 'RETRASADO';
    } else if (estadoGeneral === 'APLAZADO') {
        estadoDb = 'PROGRAMADO';
        estadoDetalleDb = 'APLAZADO';
    }

    const payload = {
        puntosLocal: state.marcadorLocalTemp,
        puntosVisitante: state.marcadorVisitTemp,
        estado: estadoDb,
        estadoDetalle: estadoDetalleDb,
        minutoActual: minutoActual
    };

    try {
        const res = await fetch(`${API_URL}/partidos/${id}/marcador`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('Error al actualizar el marcador en la API');
        if (state.partidoActivoMesa) {
            state.partidoActivoMesa.puntosLocal = state.marcadorLocalTemp;
            state.partidoActivoMesa.puntosVisitante = state.marcadorVisitTemp;
            state.partidoActivoMesa.estado = estadoDb;
            state.partidoActivoMesa.estadoDetalle = estadoDetalleDb;
            state.partidoActivoMesa.minutoActual = minutoActual;
        }
        mostrarToast('¡Marcador y sub-estado aplicados correctamente!', 'exito');

        // Para Béisbol y Sóftbol, persistir conteo de outs en caché local y registrar maxInning
        if (deporteNorm === 'BEISBOL' || deporteNorm === 'SOFTBOL') {
            try {
                localStorage.setItem(`baseball_outs_${id}`, outsActuales);
                const mNum = estadoDetalle.match(/(\d+)/);
                let bInn = JSON.parse(localStorage.getItem(`baseball_innings_${id}`) || '{"vis":{},"loc":{}}');
                if (mNum) {
                    bInn.maxInning = Math.max(bInn.maxInning || 0, parseInt(mNum[1]));
                }
                if (estadoDetalle.includes('EE') || estadoDetalle.includes('EXTRA')) {
                    bInn.esEE = true;
                }
                localStorage.setItem(`baseball_innings_${id}`, JSON.stringify(bInn));
            } catch (e) {}
        }

        // Si es baloncesto, actualizar snapshot de parciales por cuartos
        if (deporteNorm === 'BALONCESTO') {
            try {
                let bq = JSON.parse(localStorage.getItem(`basket_quarters_${id}`) || '{}');
                const pLoc = state.marcadorLocalTemp || 0;
                const pVis = state.marcadorVisitTemp || 0;
                const minAct = (minutoActual !== null && minutoActual !== undefined) ? parseInt(minutoActual) : 0;

                if (estadoDetalle === 'Q1') {
                    bq.q1 = { loc: pLoc, vis: pVis };
                } else if (estadoDetalle === 'Q2') {
                    const prevL = bq.q1?.loc || 0;
                    const prevV = bq.q1?.vis || 0;
                    bq.q2 = { loc: Math.max(0, pLoc - prevL), vis: Math.max(0, pVis - prevV) };
                } else if (estadoDetalle === 'Q3') {
                    const prevL = (bq.q1?.loc || 0) + (bq.q2?.loc || 0);
                    const prevV = (bq.q1?.vis || 0) + (bq.q2?.vis || 0);
                    bq.q3 = { loc: Math.max(0, pLoc - prevL), vis: Math.max(0, pVis - prevV) };
                } else if (estadoDetalle === 'Q4') {
                    const prevL = (bq.q1?.loc || 0) + (bq.q2?.loc || 0) + (bq.q3?.loc || 0);
                    const prevV = (bq.q1?.vis || 0) + (bq.q2?.vis || 0) + (bq.q3?.vis || 0);
                    bq.q4 = { loc: Math.max(0, pLoc - prevL), vis: Math.max(0, pVis - prevV) };
                } else if (estadoDetalle === 'PAUSA EXTRA TIEMPO') {
                    const prevL = (bq.q1?.loc || 0) + (bq.q2?.loc || 0) + (bq.q3?.loc || 0);
                    const prevV = (bq.q1?.vis || 0) + (bq.q2?.vis || 0) + (bq.q3?.vis || 0);
                    if (minAct <= 40 || !bq.q4) {
                        bq.q4 = { loc: Math.max(0, pLoc - prevL), vis: Math.max(0, pVis - prevV) };
                    } else if (minAct <= 45 || !bq.ot1) {
                        const prevOT1L = prevL + (bq.q4?.loc || 0);
                        const prevOT1V = prevV + (bq.q4?.vis || 0);
                        bq.ot1 = { loc: Math.max(0, pLoc - prevOT1L), vis: Math.max(0, pVis - prevOT1V) };
                        bq.ot = bq.ot1;
                    }
                } else if (estadoDetalle === 'OVERTIME' || estadoDetalle === 'OT' || estadoDetalle === 'OT1' || estadoDetalle === '1OT') {
                    const prevL = (bq.q1?.loc || 0) + (bq.q2?.loc || 0) + (bq.q3?.loc || 0) + (bq.q4?.loc || 0);
                    const prevV = (bq.q1?.vis || 0) + (bq.q2?.vis || 0) + (bq.q3?.vis || 0) + (bq.q4?.vis || 0);
                    bq.ot1 = { loc: Math.max(0, pLoc - prevL), vis: Math.max(0, pVis - prevV) };
                    bq.ot = bq.ot1;
                } else if (estadoDetalle === '2OT' || estadoDetalle === 'OT2') {
                    const prevL = (bq.q1?.loc || 0) + (bq.q2?.loc || 0) + (bq.q3?.loc || 0) + (bq.q4?.loc || 0) + (bq.ot1?.loc || 0);
                    const prevV = (bq.q1?.vis || 0) + (bq.q2?.vis || 0) + (bq.q3?.vis || 0) + (bq.q4?.vis || 0) + (bq.ot1?.vis || 0);
                    bq.ot2 = { loc: Math.max(0, pLoc - prevL), vis: Math.max(0, pVis - prevV) };
                } else if (estadoDetalle === '3OT' || estadoDetalle === 'OT3') {
                    const prevL = (bq.q1?.loc || 0) + (bq.q2?.loc || 0) + (bq.q3?.loc || 0) + (bq.q4?.loc || 0) + (bq.ot1?.loc || 0) + (bq.ot2?.loc || 0);
                    const prevV = (bq.q1?.vis || 0) + (bq.q2?.vis || 0) + (bq.q3?.vis || 0) + (bq.q4?.vis || 0) + (bq.ot1?.vis || 0) + (bq.ot2?.vis || 0);
                    bq.ot3 = { loc: Math.max(0, pLoc - prevL), vis: Math.max(0, pVis - prevV) };
                } else if (estadoGeneral === 'FINALIZADO') {
                    const prevRegL = (bq.q1?.loc || 0) + (bq.q2?.loc || 0) + (bq.q3?.loc || 0) + (bq.q4?.loc || 0);
                    const prevRegV = (bq.q1?.vis || 0) + (bq.q2?.vis || 0) + (bq.q3?.vis || 0) + (bq.q4?.vis || 0);
                    if (minAct > 45 || ultimoPeriodoAntesPausa === '2OT' || ultimoPeriodoAntesPausa === 'OT2') {
                        const prevL = prevRegL + (bq.ot1?.loc || 0);
                        const prevV = prevRegV + (bq.ot1?.vis || 0);
                        bq.ot2 = { loc: Math.max(0, pLoc - prevL), vis: Math.max(0, pVis - prevV) };
                    } else if (minAct > 40 || ultimoPeriodoAntesPausa.includes('OT') || ultimoPeriodoAntesPausa.includes('OVERTIME')) {
                        bq.ot1 = { loc: Math.max(0, pLoc - prevRegL), vis: Math.max(0, pVis - prevRegV) };
                        bq.ot = bq.ot1;
                    }
                }
                localStorage.setItem(`basket_quarters_${id}`, JSON.stringify(bq));
            } catch (e) {}
        }

        // Si es Voleibol, persistir sets en caché local
        if (deporteNorm === 'VOLEIBOL') {
            try {
                const vSets = obtenerSetsVoleibol(id);
                guardarSetsVoleibol(id, vSets);
            } catch (e) {}
        }

        // Sincronizar de inmediato
        delete document.getElementById('mesa-estado-detalle')?.dataset.userModified;
        delete document.getElementById('mesa-estado-general')?.dataset.userModified;
        await sincronizarPartidoMesaEnVivo(id);
        actualizarControlesOperativosMesa();

        if (estadoGeneral === 'FINALIZADO' && state.partidoActivoMesa) {
            const fId = Number(state.partidoActivoMesa.faseId || state.partidoActivoMesa.FaseId || 0);
            if (fId === 16 || fId === 8 || fId === 4 || fId === 2) {
                await procesarAvancePlayoff(state.partidoActivoMesa, state.marcadorLocalTemp, state.marcadorVisitTemp);
            }
        }
    } catch (err) {
        console.error('Error actualizando marcador:', err);
        mostrarToast(err.message, 'error');
    }
}

async function finalizarPartidoOficial() {
    if (!state.partidoActivoMesa) return;
    const id = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
    const deporteNorm = obtenerDeporteDePartido(state.partidoActivoMesa);
    const fId = Number(state.partidoActivoMesa.faseId || state.partidoActivoMesa.FaseId || 0);
    const jNum = Number(state.partidoActivoMesa.jornada || state.partidoActivoMesa.Jornada || 1);
    const torneoId = state.partidoActivoMesa.torneoId || state.partidoActivoMesa.TorneoId;
    const eqLocId = state.partidoActivoMesa.equipoLocalId || state.partidoActivoMesa.EquipoLocalId;
    const eqVisId = state.partidoActivoMesa.equipoVisitanteId || state.partidoActivoMesa.EquipoVisitanteId;
    const nomLoc = state.partidoActivoMesa.equipoLocalNombre || state.partidoActivoMesa.EquipoLocalNombre || obtenerNombreEquipo(eqLocId);
    const nomVis = state.partidoActivoMesa.equipoVisitanteNombre || state.partidoActivoMesa.EquipoVisitanteNombre || obtenerNombreEquipo(eqVisId);

    // 1. Validación oficial en Baloncesto: NO existen empates
    if (deporteNorm === 'BALONCESTO' && state.marcadorLocalTemp === state.marcadorVisitTemp) {
        mostrarToast('⚠️ En Baloncesto no existen empates: juega periodo "OT" (Prórroga) hasta definir ganador.', 'error');
        const selectDetalle = document.getElementById('mesa-estado-detalle');
        if (selectDetalle) selectDetalle.value = 'OVERTIME';
        verificarBotonFinalizarBaloncesto();
        actualizarControlesOperativosMesa();
        return;
    }

    // 2. Fútbol / Microfútbol en Playoffs: Desempate por Penales
    const esFaseEliminatoria = (fId === 16 || fId === 8 || fId === 4 || fId === 2 || esPartidoPlayoff(state.partidoActivoMesa));
    if ((deporteNorm === 'FUTBOL' || deporteNorm === 'MICROFUTBOL') && esFaseEliminatoria) {
        let partidosLlave = [];
        try {
            const resL = await fetch(`${API_URL}/partidos/torneo/${torneoId}`);
            if (resL.ok) {
                const allP = await resL.json();
                partidosLlave = allP.filter(p => Number(p.faseId || p.FaseId || 0) === fId && Number(p.jornada || p.Jornada || 1) === jNum);
            }
        } catch (e) {}

        const esIdaVuelta = (partidosLlave.length === 2);
        let requierePenales = false;

        if (esIdaVuelta) {
            const otros = partidosLlave.filter(p => (p.id || p.Id) !== id);
            if (otros.length === 1 && (otros[0].estado || otros[0].Estado) === 'FINALIZADO') {
                const oLocId = otros[0].equipoLocalId || otros[0].EquipoLocalId;
                const oPtsL = Number(otros[0].puntosLocal || otros[0].PuntosLocal || 0);
                const oPtsV = Number(otros[0].puntosVisitante || otros[0].PuntosVisitante || 0);

                const globLoc = (eqLocId === oLocId ? oPtsL : oPtsV) + state.marcadorLocalTemp;
                const globVis = (eqVisId === oLocId ? oPtsL : oPtsV) + state.marcadorVisitTemp;
                if (globLoc === globVis) {
                    requierePenales = true;
                }
            }
        } else if (partidosLlave.length <= 1) {
            if (state.marcadorLocalTemp === state.marcadorVisitTemp) {
                requierePenales = true;
            }
        }

        if (requierePenales) {
            activarModuloPenalesMesa(nomLoc, nomVis);
            const selDet = document.getElementById('mesa-estado-detalle');
            if (selDet) {
                if (!Array.from(selDet.options).some(o => o.value === 'PENALES')) {
                    const opt = document.createElement('option');
                    opt.value = 'PENALES';
                    opt.textContent = '🥅 PENALES';
                    selDet.appendChild(opt);
                }
                selDet.value = 'PENALES';
            }
            if (state.partidoActivoMesa) {
                state.partidoActivoMesa.estadoDetalle = 'PENALES';
            }
            actualizarBadgeVivo('PENALES');
            actualizarControlesOperativosMesa();
            mostrarToast('🥅 ¡Empate en partido de eliminación! Registra los resultados de la tanda de penales.', 'info');
            return;
        }
    }

    // 3. Validación oficial en Voleibol: NO existen empates en sets ni marcadores superiores a 3 sets ganados
    if (deporteNorm === 'VOLEIBOL') {
        state.marcadorLocalTemp = Math.min(3, Math.max(0, state.marcadorLocalTemp || 0));
        state.marcadorVisitTemp = Math.min(3, Math.max(0, state.marcadorVisitTemp || 0));
        if (state.marcadorLocalTemp === state.marcadorVisitTemp && state.marcadorLocalTemp > 0) {
            mostrarToast(`⚠️ En Voleibol no existen empates en sets (${state.marcadorLocalTemp} - ${state.marcadorVisitTemp}). Debe haber ganador con 3 sets ganados.`, 'error');
            return;
        }
        bloquearControlesVoleibolFinalizado();
    }

    const okFin = await mostrarConfirmacionModal(
        `¿Declarar oficialmente FINALIZADO el partido #${id} con marcador ${state.marcadorLocalTemp} - ${state.marcadorVisitTemp}?`,
        '⏱️ Finalizar Partido'
    );
    if (!okFin) {
        return;
    }

    const koId = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
    detenerCronometroBaloncesto(true);
    detenerCronometroFutbol(true);
    detenerCronometroMicrofutbol(true);
    limpiarEstadoTimerMicrofutbol(koId);
    gestorPartidosEnJuego.delete(String(koId));
    document.getElementById('mesa-estado-general').value = 'FINALIZADO';
    document.getElementById('mesa-estado-detalle').value = 'FINALIZADO';

    await guardarMarcadorMesa();
    mostrarToast('Partido marcado como FINALIZADO oficialmente.', 'exito');

    // Avance automático en Playoffs si el partido pertenece a una fase de eliminación directa
    if (state.partidoActivoMesa) {
        if (fId === 16 || fId === 8 || fId === 4 || fId === 2) {
            await procesarAvancePlayoff(state.partidoActivoMesa, state.marcadorLocalTemp, state.marcadorVisitTemp);
        }
    }
}

// ============================================================================
// INCIDENCIAS / EVENTOS EN VIVO (MESA TÉCNICA - EXCLUSIVO FÚTBOL / MICROFÚTBOL)
// ============================================================================

function extraerEquipoIdJugador(j) {
    if (!j) return null;
    return j.equipoId ?? j.idEquipo ?? j.equipo_id ?? j.id_equipo ?? j.EquipoId ?? j.IdEquipo ?? 
           (j.equipo && (j.equipo.id || j.equipo.Id || j.equipo.equipoId || j.equipo.EquipoId)) ?? null;
}
window.extraerEquipoIdJugador = extraerEquipoIdJugador;

window.poblarSelectoresJugadores = async function(partido) {
    if (!partido) return;
    const localId = partido.equipoLocalId ?? partido.equipo_local_id ?? partido.idEquipoLocal ?? partido.id_equipo_local ?? partido.EquipoLocalId ?? (partido.equipoLocal ? (partido.equipoLocal.id || partido.equipoLocal.Id) : null);
    const visitId = partido.equipoVisitanteId ?? partido.equipo_visitante_id ?? partido.idEquipoVisitante ?? partido.id_equipo_visitante ?? partido.EquipoVisitanteId ?? (partido.equipoVisitante ? (partido.equipoVisitante.id || partido.equipoVisitante.Id) : null);
    const localNom = partido.equipoLocalNombre || partido.EquipoLocalNombre || (partido.equipoLocal ? partido.equipoLocal.nombre : (typeof obtenerNombreEquipo === 'function' ? obtenerNombreEquipo(localId) : 'Local'));
    const visitNom = partido.equipoVisitanteNombre || partido.EquipoVisitanteNombre || (partido.equipoVisitante ? partido.equipoVisitante.nombre : (typeof obtenerNombreEquipo === 'function' ? obtenerNombreEquipo(visitId) : 'Visitante'));
    await cargarJugadoresParaEventos(localId, visitId, localNom, visitNom);
};

function generarJugadoresDiferenciadosEquipo(equipoId, nombreEquipo, esLocal) {
    const prefijo = (nombreEquipo || (esLocal ? 'Local' : 'Visitante')).trim();
    const baseId = esLocal ? 10000 : 20000;
    const baseEq = Number(equipoId) || (esLocal ? 1 : 2);

    return Array.from({ length: 11 }, (_, i) => {
        const dorsal = i + 1;
        const fakeId = baseId + (baseEq * 100) + dorsal;
        const nom = `${prefijo} - Jugador #${dorsal}`;
        return {
            id: fakeId,
            Id: fakeId,
            equipoId: equipoId,
            numeroCamiseta: dorsal,
            NumeroCamiseta: dorsal,
            nombre: nom,
            Nombre: nom
        };
    });
}

async function cargarJugadoresParaEventos(localId, visitId, nomLocal, nomVisit) {
    const select = document.getElementById('evento-jugador');
    if (!select) return;

    select.innerHTML = '<option value="">-- Sin jugador específico / Anónimo --</option>';
    state.jugadoresMesaMap = {};

    if (!localId && !visitId) return;

    try {
        let jugLocal = [];
        let jugVisit = [];

        if (localId) {
            try {
                const resL = await fetch(`${API_URL}/jugadores/equipo/${localId}`);
                if (resL.ok) {
                    const dataL = await resL.json();
                    if (Array.isArray(dataL)) jugLocal = dataL;
                }
            } catch (e) {}
        }

        if (visitId) {
            try {
                const resV = await fetch(`${API_URL}/jugadores/equipo/${visitId}`);
                if (resV.ok) {
                    const dataV = await resV.json();
                    if (Array.isArray(dataV)) jugVisit = dataV;
                }
            } catch (e) {}
        }

        // Fallback defensivo a la lista general
        let todosJugadores = null;
        if (jugLocal.length === 0 || jugVisit.length === 0) {
            try {
                const resTodos = await fetch(`${API_URL}/jugadores`);
                if (resTodos.ok) {
                    todosJugadores = await resTodos.json();
                }
            } catch (e) {}
        }

        if (Array.isArray(todosJugadores) && todosJugadores.length > 0) {
            if (jugLocal.length === 0 && localId) {
                jugLocal = todosJugadores.filter(j => {
                    const eqId = extraerEquipoIdJugador(j);
                    return eqId !== null && eqId !== undefined && String(eqId) === String(localId);
                });
            }
            if (jugVisit.length === 0 && visitId) {
                jugVisit = todosJugadores.filter(j => {
                    const eqId = extraerEquipoIdJugador(j);
                    return eqId !== null && eqId !== undefined && String(eqId) === String(visitId);
                });
            }
        }

        let optHtml = '<option value="">-- Sin jugador específico / Anónimo --</option>';

        // FILTRADO ESTRICTO - GRUPO LOCAL:
        // ÚNICAMENTE jugadores donde extraerEquipoIdJugador(j) coincida con el ID local.
        let filtradosLocal = [];
        if (localId && Array.isArray(jugLocal)) {
            filtradosLocal = jugLocal.filter(j => {
                const jEqId = extraerEquipoIdJugador(j);
                return jEqId !== null && jEqId !== undefined && String(jEqId) === String(localId);
            });
        }

        // Si la API no retorna jugadores para el equipo local, NO asignar lista global compartida.
        // Generar mock diferenciado por equipo con el nombre del club local.
        if (localId && filtradosLocal.length === 0) {
            filtradosLocal = generarJugadoresDiferenciadosEquipo(localId, nomLocal || 'Local', true);
        }

        if (filtradosLocal.length > 0) {
            optHtml += `<optgroup label="🔵 ${nomLocal || 'Local'}">`;
            filtradosLocal.forEach(j => {
                const jId = j.id || j.Id;
                const dorsal = j.numeroCamiseta ?? j.NumeroCamiseta ?? j.dorsal ?? '';
                const nom = j.nombre || j.Nombre || 'Jugador';
                state.jugadoresMesaMap[jId] = { nombre: nom, equipoId: localId };
                optHtml += `<option value="${jId}" data-equipo="${localId}">#${dorsal ? dorsal + ' ' : ''}${nom}</option>`;
            });
            optHtml += `</optgroup>`;
        }

        // FILTRADO ESTRICTO - GRUPO VISITANTE:
        // ÚNICAMENTE jugadores donde extraerEquipoIdJugador(j) coincida con el ID visitante.
        let filtradosVisit = [];
        if (visitId && Array.isArray(jugVisit)) {
            filtradosVisit = jugVisit.filter(j => {
                const jEqId = extraerEquipoIdJugador(j);
                return jEqId !== null && jEqId !== undefined && String(jEqId) === String(visitId);
            });
        }

        // Si la API no retorna jugadores para el equipo visitante, NO asignar lista global compartida.
        // Generar mock diferenciado por equipo con el nombre del club visitante.
        if (visitId && filtradosVisit.length === 0) {
            filtradosVisit = generarJugadoresDiferenciadosEquipo(visitId, nomVisit || 'Visitante', false);
        }

        if (filtradosVisit.length > 0) {
            optHtml += `<optgroup label="🔴 ${nomVisit || 'Visitante'}">`;
            filtradosVisit.forEach(j => {
                const jId = j.id || j.Id;
                const dorsal = j.numeroCamiseta ?? j.NumeroCamiseta ?? j.dorsal ?? '';
                const nom = j.nombre || j.Nombre || 'Jugador';
                state.jugadoresMesaMap[jId] = { nombre: nom, equipoId: visitId };
                optHtml += `<option value="${jId}" data-equipo="${visitId}">#${dorsal ? dorsal + ' ' : ''}${nom}</option>`;
            });
            optHtml += `</optgroup>`;
        }

        select.innerHTML = optHtml;
    } catch (err) {
        console.error('Error cargando jugadores para incidencias:', err);
    }
}

async function cargarEventosPartidoMesa(partidoId) {
    const tbody = document.getElementById('tabla-eventos-body');
    if (!tbody) return;

    try {
        const res = await fetch(`${API_URL}/eventospartido/partido/${partidoId}`);
        if (!res.ok) throw new Error('Error al obtener eventos');
        const eventos = await res.json();
        renderizarTablaEventos(eventos);
    } catch (err) {
        console.error('Error cargando eventos:', err);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#ff4444; padding:15px;">Error al cargar incidencias.</td></tr>`;
    }
}

function renderizarTablaEventos(eventos) {
    const tbody = document.getElementById('tabla-eventos-body');
    if (!tbody) return;

    if (!eventos || eventos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#888; padding:15px;">Sin incidencias registradas en este partido.</td></tr>`;
        return;
    }

    tbody.innerHTML = eventos.map(ev => {
        const evId = ev.id || ev.Id;
        const minuto = ev.minutoOPeriodo || ev.MinutoOPeriodo || ev.minuto || ev.Minuto || '-';
        const tipo = (ev.tipoEvento || ev.TipoEvento || 'INCIDENCIA').toUpperCase();
        const jugador = ev.jugadorNombre || ev.JugadorNombre || (ev.jugador ? ev.jugador.nombre : '-');
        const comentario = ev.comentario || ev.Comentario || '';

        let icono = '📌';
        let tipoDisplay = tipo;
        if (tipo.includes('GOL') || tipo.includes('ANOTACION')) {
            icono = '⚽';
            if (tipo === 'AUTOGOL') tipoDisplay = 'Autogol';
            else if (tipo === 'GOL') tipoDisplay = 'Gol';
        } else if (tipo.includes('AMARILLA')) {
            icono = '🟨';
            tipoDisplay = 'Tarjeta Amarilla';
        } else if (tipo.includes('AZUL')) {
            icono = '🟦';
            tipoDisplay = 'Tarjeta Azul';
        } else if (tipo.includes('ROJA')) {
            icono = '🟥';
            tipoDisplay = 'Tarjeta Roja';
        } else if (tipo.includes('PUNTO') || tipo.includes('TRIPLE')) {
            icono = '🏀';
            tipoDisplay = 'Punto';
        } else if (tipo.includes('CARRERA')) {
            icono = '⚾';
            tipoDisplay = 'Carrera';
        } else if (tipo.includes('SUSTITUCION') || tipo.includes('CAMBIO')) {
            icono = '🔄';
            tipoDisplay = 'Sustitución';
        }

        return `
            <tr>
                <td><strong>${minuto}'</strong></td>
                <td><span style="font-weight:700;">${icono} ${tipoDisplay}</span></td>
                <td><strong style="color:#fff;">${jugador}</strong></td>
                <td><span style="color:#aaa;">${comentario || '-'}</span></td>
                <td style="text-align:center;">
                    <button class="btn-action-del" onclick="eliminarEventoMesa(${evId})" title="Eliminar Incidencia">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function registrarEventoMesa(e) {
    e.preventDefault();

    if (!state.partidoActivoMesa) {
        mostrarToast('Selecciona un partido primero.', 'error');
        return;
    }

    const partidoId = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
    const tipoEvento = document.getElementById('evento-tipo').value;
    const elMinuto = document.getElementById('evento-minuto') || document.getElementById('incidencia_minuto');
    const minutoInt = elMinuto ? (parseInt(elMinuto.value, 10) || 0) : 0;
    const selJugador = document.getElementById('evento-jugador');
    const jugadorIdVal = selJugador.value;
    const comentario = document.getElementById('evento-comentario').value.trim();

    const jugadorId = jugadorIdVal ? parseInt(jugadorIdVal) : null;
    let equipoId = null;
    if (jugadorId && state.jugadoresMesaMap[jugadorId]) {
        equipoId = state.jugadoresMesaMap[jugadorId].equipoId;
    }

    const payload = {
        partidoId: partidoId,
        equipoId: equipoId,
        jugadorId: jugadorId,
        tipoEvento: tipoEvento,
        minutoOPeriodo: minutoInt.toString(),
        valorPuntos: (tipoEvento === 'GOL' || tipoEvento === 'AUTOGOL' || tipoEvento === 'PUNTO') ? 1 : null,
        comentario: comentario || null
    };

    try {
        const res = await fetch(`${API_URL}/eventospartido`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('Error al registrar incidencia en la API');
        mostrarToast('Incidencia registrada con éxito.', 'exito');

        // Limpiar inputs de evento
        document.getElementById('evento-comentario').value = '';
        await cargarEventosPartidoMesa(partidoId);
    } catch (err) {
        console.error('Error registrando evento:', err);
        mostrarToast(err.message, 'error');
    }
}

window.eliminarEventoMesa = async function(eventoId) {
    const ok = await mostrarConfirmacionModal(`¿Eliminar incidencia #${eventoId}?`, '🗑️ Eliminar Incidencia');
    if (!ok) return;

    try {
        const res = await fetch(`${API_URL}/eventospartido/${eventoId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar incidencia');
        mostrarToast('Incidencia eliminada.', 'exito');

        if (state.partidoActivoMesa) {
            const partidoId = state.partidoActivoMesa.id || state.partidoActivoMesa.Id;
            await cargarEventosPartidoMesa(partidoId);
        }
    } catch (err) {
        console.error('Error eliminando incidencia:', err);
        mostrarToast(err.message, 'error');
    }
};

// ============================================================================
// MÓDULO ADMINISTRATIVO DE FASES FINALES / PLAYOFFS (CUADRO)
// ============================================================================

async function actualizarEstadoPlayoffsAdmin(torneoId, partidosCargados = null) {
    const badgeFaseRegular = document.getElementById('badge-estado-fase-regular');
    const btnConfigPlayoffs = document.getElementById('btn-configurar-playoffs');
    const panelConfig = document.getElementById('panel-config-playoffs');
    const resumenPlayoffs = document.getElementById('resumen-playoffs-registrados');
    const tablaPlayoffsBody = document.getElementById('tabla-playoffs-body');
    const contadorPlayoffs = document.getElementById('contador-partidos-playoffs');

    if (!badgeFaseRegular || !btnConfigPlayoffs) return;

    let partidos = partidosCargados;
    if (!partidos) {
        try {
            const res = await fetch(`${API_URL}/partidos/torneo/${torneoId}`);
            if (res.ok) partidos = await res.json();
            else partidos = [];
        } catch (e) {
            partidos = [];
        }
    }

    const partidosRegulares = (partidos || []).filter(p => !esPartidoPlayoff(p));

    let partidosPlayoffs = (partidos || []).filter(p => esPartidoPlayoff(p));

    // AUTOMATIZACIÓN REACTIVA UNIVERSAL (Fútbol, Micro, Baloncesto, Béisbol, Voleibol):
    // Inspecciona si ambas llaves de una fase concluyeron y el partido siguiente aún no se ha guardado en BD.
    // Si falta crearlo, lo inserta en MySQL mediante POST /api/partidos y lo agrega al array para que se muestre de inmediato.
    if (torneoId && partidosPlayoffs.length > 0) {
        const fasesAvanzar = [16, 8, 4];
        let defaultCanchaId = 1;
        const torneoObj = (state.torneos || []).find(t => (t.id || t.Id) == torneoId);
        if (torneoObj && (torneoObj.canchaSedeId || torneoObj.cancha_sede_id)) {
            defaultCanchaId = torneoObj.canchaSedeId || torneoObj.cancha_sede_id;
        }

        for (const fId of fasesAvanzar) {
            const partidosFase = partidosPlayoffs.filter(p => Number(p.faseId || p.FaseId || 0) === fId);
            if (partidosFase.length === 0) continue;

            const nextFaseId = (fId === 16) ? 8 : (fId === 8 ? 4 : 2);
            const numLlavesNext = (fId === 16) ? 4 : (fId === 8 ? 2 : 1);

            for (let j = 1; j <= numLlavesNext; j++) {
                const jLoc = (j * 2) - 1;
                const jVis = j * 2;

                const matchesLoc = partidosFase.filter(p => Number(p.jornada || p.Jornada || 1) === jLoc);
                const matchesVis = partidosFase.filter(p => Number(p.jornada || p.Jornada || 1) === jVis);

                const ganadorLoc = obtenerGanadorDeLlave(matchesLoc, torneoId, fId, jLoc);
                const ganadorVis = obtenerGanadorDeLlave(matchesVis, torneoId, fId, jVis);

                if (ganadorLoc && ganadorLoc.id && ganadorVis && ganadorVis.id) {
                    const matchSiguiente = partidosPlayoffs.find(p => 
                        Number(p.faseId || p.FaseId || 0) === nextFaseId &&
                        Number(p.jornada || p.Jornada || 1) === j
                    );

                    if (!matchSiguiente) {
                        try {
                            const payloadCrear = {
                                torneoId: Number(torneoId),
                                jornada: j,
                                faseId: nextFaseId,
                                canchaId: defaultCanchaId || matchesLoc[0]?.canchaId || matchesLoc[0]?.CanchaId || 1,
                                equipoLocalId: ganadorLoc.id,
                                equipoVisitanteId: ganadorVis.id,
                                puntosLocal: 0,
                                puntosVisitante: 0,
                                estado: 'PROGRAMADO',
                                estadoDetalle: 'PROGRAMADO',
                                fechaHora: '2099-12-31T00:00:00'
                            };

                            const resPost = await fetch(`${API_URL}/partidos`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payloadCrear)
                            });

                            if (resPost.ok) {
                                const nuevoPartido = await resPost.json();
                                nuevoPartido.equipoLocalNombre = ganadorLoc.nombre;
                                nuevoPartido.equipoVisitanteNombre = ganadorVis.nombre;
                                nuevoPartido.canchaNombre = obtenerNombreCancha(nuevoPartido.canchaId || defaultCanchaId);
                                partidosPlayoffs.push(nuevoPartido);
                                (partidos || []).push(nuevoPartido);

                                const slotKeyLoc = `playoff_slot_${torneoId}_${nextFaseId}_${j}_loc`;
                                const slotKeyVis = `playoff_slot_${torneoId}_${nextFaseId}_${j}_vis`;
                                localStorage.removeItem(slotKeyLoc);
                                localStorage.removeItem(slotKeyVis);
                                
                                const nomFaseSig = (nextFaseId === 2) ? '🏆 Gran Final' : (nextFaseId === 4 ? 'Semifinal' : 'Cuartos');
                                mostrarToast(`🏆 ¡${nomFaseSig} registrada automáticamente: ${ganadorLoc.nombre} vs ${ganadorVis.nombre}!`, 'exito');
                            }
                        } catch (errAuto) {
                            console.error('Error auto-persistiendo siguiente fase:', errAuto);
                        }
                    }
                }
            }
        }
    }

    // Orden jerárquico y cronológico estricto:
    // 1º Octavos de Final (faseId 16)
    // 2º Cuartos de Final (faseId 8)
    // 3º Semifinales (faseId 4 - Llave 1, Llave 2...)
    // 4º Gran Final (faseId 2 - SIEMPRE al final de la tabla)
    function obtenerJerarquiaPlayoff(p) {
        const fId = Number(p.faseId || p.FaseId || 0);
        if (fId === 16) return 1;
        if (fId === 8) return 2;
        if (fId === 4) return 3;
        if (fId === 2) return 4;

        const txt = `${p.fase || ''} ${p.faseNombre || ''} ${p.estadoDetalle || ''}`.toLowerCase();
        if (txt.includes('octavo')) return 1;
        if (txt.includes('cuarto')) return 2;
        if (txt.includes('semifinal')) return 3;
        if (txt.includes('final')) return 4;
        return 5;
    }

    partidosPlayoffs.sort((a, b) => {
        const jerA = obtenerJerarquiaPlayoff(a);
        const jerB = obtenerJerarquiaPlayoff(b);
        if (jerA !== jerB) return jerA - jerB;

        const jA = Number(a.jornada || a.Jornada || 1);
        const jB = Number(b.jornada || b.Jornada || 1);
        if (jA !== jB) return jA - jB;

        const idA = Number(a.id || a.Id || 0);
        const idB = Number(b.id || b.Id || 0);
        return idA - idB;
    });

    const totalReg = partidosRegulares.length;
    const pendientesReg = partidosRegulares.filter(p => {
        const est = (p.estado || p.Estado || '').toUpperCase();
        return est !== 'FINALIZADO' && est !== 'TERMINADO';
    }).length;

    if (totalReg === 0) {
        badgeFaseRegular.textContent = '⚠️ Sin fixture regular generado';
        badgeFaseRegular.style.color = '#888';
        badgeFaseRegular.style.borderColor = '#444';
        badgeFaseRegular.style.background = '#222';
        btnConfigPlayoffs.disabled = true;
        btnConfigPlayoffs.style.opacity = '0.5';
        btnConfigPlayoffs.style.cursor = 'not-allowed';
    } else if (pendientesReg > 0) {
        badgeFaseRegular.textContent = `⏳ Fase Regular en disputa (${pendientesReg} pendientes)`;
        badgeFaseRegular.style.color = '#f59e0b';
        badgeFaseRegular.style.borderColor = '#d97706';
        badgeFaseRegular.style.background = '#2a2024';
        btnConfigPlayoffs.disabled = true;
        btnConfigPlayoffs.style.opacity = '0.5';
        btnConfigPlayoffs.style.cursor = 'not-allowed';
        if (panelConfig) panelConfig.classList.add('hidden');
    } else {
        badgeFaseRegular.textContent = `✅ Fase Regular Finalizada (${totalReg} partidos)`;
        badgeFaseRegular.style.color = '#10b981';
        badgeFaseRegular.style.borderColor = '#059669';
        badgeFaseRegular.style.background = '#132c21';
        btnConfigPlayoffs.disabled = false;
        btnConfigPlayoffs.style.opacity = '1';
        btnConfigPlayoffs.style.cursor = 'pointer';
    }

    if (partidosPlayoffs.length > 0 && resumenPlayoffs && tablaPlayoffsBody) {
        resumenPlayoffs.classList.remove('hidden');
        if (contadorPlayoffs) contadorPlayoffs.textContent = `${partidosPlayoffs.length} partidos`;

        tablaPlayoffsBody.innerHTML = partidosPlayoffs.map(p => {
            const id = p.id || p.Id;
            const fId = Number(p.faseId || p.FaseId || 0);
            const jNum = p.jornada || p.Jornada || 1;
            let faseNombre = 'Playoffs';
            if (fId === 16) faseNombre = `Octavos (Llave ${jNum})`;
            else if (fId === 8) faseNombre = `Cuartos (Llave ${jNum})`;
            else if (fId === 4) faseNombre = `Semifinal (Llave ${jNum})`;
            else if (fId === 2) faseNombre = `🏆 GRAN FINAL`;

            const estDetalle = (p.estadoDetalle || p.EstadoDetalle || '').trim().toUpperCase();
            if (estDetalle && estDetalle !== 'PROGRAMADO' && (estDetalle.includes('IDA') || estDetalle.includes('VUELTA') || estDetalle.includes('JUEGO'))) {
                faseNombre += ` (${estDetalle})`;
            }

            const local = p.equipoLocalNombre || p.EquipoLocalNombre || obtenerNombreEquipo(p.equipoLocalId || p.EquipoLocalId);
            const visit = p.equipoVisitanteNombre || p.EquipoVisitanteNombre || obtenerNombreEquipo(p.equipoVisitanteId || p.EquipoVisitanteId);
            const cancha = p.canchaNombre || p.CanchaNombre || obtenerNombreCancha(p.canchaId || p.CanchaId);
            const fh = p.fechaHora || p.FechaHora;
            const fechaHoraStr = esFechaPorDefinir(fh)
                ? `<span style="background: #2a2024; color: #f59e0b; border: 1px solid #d97706; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; gap: 4px;">⏳ POR DEFINIR</span>`
                : formatearFechaHora(fh);
            const puntosLocal = p.puntosLocal ?? p.PuntosLocal ?? 0;
            const puntosVisit = p.puntosVisitante ?? p.PuntosVisitante ?? 0;
            const estado = p.estado || p.Estado || 'PROGRAMADO';

            const esFhDef = fh && !fh.startsWith('2099');
            const dtLocal = parsearFechaHoraLocal(fh);
            const yaPasoHora = esFhDef && dtLocal && (dtLocal.getTime() <= (Date.now() - 60000));
            const esNoIniciado = (estado === 'PROGRAMADO' || estado === 'PENDIENTE' || !estado);
            const estaRetrasado = (estado !== 'FINALIZADO' && estado !== 'EN_JUEGO') &&
                (esFhDef ? (yaPasoHora && (estado === 'RETRASADO' || estDetalle === 'RETRASADO' || esNoIniciado)) : (estado === 'RETRASADO' || estDetalle === 'RETRASADO'));
            const estaSuspendido = (estado === 'SUSPENDIDO') || (estDetalle === 'SUSPENDIDO');

            // Comprobar si la llave a la que pertenece este partido ya concluyó anticipadamente
            const matchesDeEstaLlave = partidosPlayoffs.filter(x => Number(x.faseId || x.FaseId || 0) === fId && Number(x.jornada || x.Jornada || 1) === jNum);
            const ganadorEstaLlave = (matchesDeEstaLlave.length > 1) ? obtenerGanadorDeLlave(matchesDeEstaLlave, torneoId, fId, jNum) : null;
            const esJuegoOmitidoPorCierre = ganadorEstaLlave && estado === 'PROGRAMADO';

            let badgeHtml = `<span class="badge-${estado.toLowerCase()}">${estado}</span>`;
            if (esJuegoOmitidoPorCierre) {
                badgeHtml = `<span style="background: #1e293b; color: #94a3b8; border: 1px solid #475569; padding: 2px 7px; border-radius: 4px; font-size: 10.5px; font-weight: 700;">No Requerido (Serie Concluida)</span>`;
            } else if (estaSuspendido) {
                badgeHtml = `<span class="badge-status badge-suspendido">⚠️ SUSPENDIDO</span>`;
            } else if (estaRetrasado) {
                badgeHtml = `<span class="badge-status badge-retrasado">⏳ RETRASADO</span>`;
            }

            return `
                <tr>
                    <td><strong>#${id}</strong></td>
                    <td><span style="font-weight:700; color:#ff0044;">${faseNombre}</span></td>
                    <td>${fechaHoraStr}</td>
                    <td>${cancha}</td>
                    <td><strong>${local}</strong> vs <strong>${visit}</strong></td>
                    <td style="font-family:monospace; font-weight:800; text-align:center;">
                        ${estado === 'PROGRAMADO' ? '-' : `${puntosLocal} - ${puntosVisit}`}
                    </td>
                    <td>${badgeHtml}</td>
                    <td style="text-align:center;">
                        <div style="display:flex; justify-content:center; align-items:center; gap:6px;">
                            <button class="btn-sm btn-info btn-editar-partido" onclick="abrirModalEditarPartido(${id})" data-id="${id}" title="Editar Fecha, Hora y Sede">✏ Editar</button>
                            <button class="btn-danger" style="padding: 4px 8px; font-size: 11px;" onclick="eliminarPartido(${id})" title="Eliminar Partido">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } else if (resumenPlayoffs) {
        resumenPlayoffs.classList.add('hidden');
    }
}

// ----------------------------------------------------------------------------
// MODAL DE EDICIÓN Y GESTIÓN DE SERIES DE PLAYOFFS (FECHA, HORA, SEDE Y FORMATO)
// ----------------------------------------------------------------------------
let partidoEditandoPlayoff = null;
let partidoEditandoContext = null;

function asegurarModalEditarPartido() {
    let modal = document.getElementById('modal-editar-partido');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-editar-partido';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 560px; background: #16161c; border: 1px solid #3a1c28; border-radius: 8px; box-shadow: 0 10px 35px rgba(0,0,0,0.85); overflow: hidden;">
                <div class="modal-header" style="background: #1b1419; border-bottom: 1px solid #2d1e25; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center;">
                    <h3 id="modal-editar-partido-title" style="margin: 0; color: #ff0044; font-size: 15px; font-weight: 800;">
                        ✏️ Configuración y Programación de Llave / Serie
                    </h3>
                    <button type="button" class="btn-cerrar" onclick="cerrarModal('modal-editar-partido')">&times;</button>
                </div>
                <div class="modal-body" style="padding: 18px; max-height: 80vh; overflow-y: auto;">
                    <div id="modal-editar-partido-info" style="background: #1f1a24; border: 1px solid #33202e; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px;">
                        <div id="modal-editar-partido-fase" style="font-weight: 800; color: #ff0044; font-size: 12px; margin-bottom: 4px;">Fase</div>
                        <div id="modal-editar-partido-encuentro" style="font-weight: 700; color: #ffffff; font-size: 14px;">Local vs Visitante</div>
                    </div>
                    <form id="form-editar-partido-playoff">
                        <input type="hidden" id="edit-playoff-partido-id">

                        <div class="form-group" id="contenedor-formato-serie-modal" style="margin-bottom: 14px;">
                            <label for="modal-select-formato-serie" style="font-size: 12px; color: #ff0044; margin-bottom: 5px; display: block; font-weight: 700;">
                                ⚙️ Formato de Serie / Llave:
                            </label>
                            <select id="modal-select-formato-serie" class="form-control" style="width: 100%; font-size: 13px; font-weight: 600;">
                                <option value="1">Partido Único</option>
                                <option value="2">Ida y Vuelta (Global)</option>
                                <option value="3">Al mejor de 3 (Gana 2)</option>
                                <option value="5">Al mejor de 5 (Gana 3)</option>
                                <option value="7">Al mejor de 7 (Gana 4)</option>
                            </select>
                        </div>

                        <div id="contenedor-juegos-serie-modal" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px;"></div>

                        <div style="font-size: 11px; color: #888; margin-bottom: 16px; margin-top: 6px;">
                            💡 Deja Fecha u Hora en blanco si el juego posterior aún está <strong>Por Definir</strong>.
                        </div>
                        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
                            <button type="button" class="btn-secondary" onclick="cerrarModal('modal-editar-partido')">Cancelar</button>
                            <button type="submit" class="btn-primary" style="background: #ff0044; border-color: #ff0044;">💾 Guardar Cambios</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const form = document.getElementById('form-editar-partido-playoff');
    if (form && !form.dataset.listenerAttached) {
        form.dataset.listenerAttached = 'true';
        form.addEventListener('submit', guardarEdicionPartidoPlayoff);
    }
}

function renderizarSubmodulosModalEditar(formato, ctx) {
    const container = document.getElementById('contenedor-juegos-serie-modal');
    if (!container || !ctx) return;

    let canchas = state.canchas || [];
    const defaultCanchaId = ctx.matchesDeLlave[0]?.canchaId || ctx.matchesDeLlave[0]?.CanchaId || 1;
    const canchaInvertidaId = (canchas.length > 1)
        ? (canchas.find(c => (c.id || c.Id) != defaultCanchaId)?.id || canchas[1]?.id || defaultCanchaId)
        : defaultCanchaId;

    const optCanchas = (canchaSel) => canchas.map(c => {
        const cId = c.id || c.Id;
        const cNom = c.nombre || c.Nombre;
        return `<option value="${cId}" ${cId == canchaSel ? 'selected' : ''}>${cNom}</option>`;
    }).join('');

    const hoy = new Date();
    const yHoy = hoy.getFullYear();
    const mHoy = String(hoy.getMonth() + 1).padStart(2, '0');
    const dHoy = String(hoy.getDate()).padStart(2, '0');
    const fechaActualSistema = `${yHoy}-${mHoy}-${dHoy}`;

    const numJuegos = parseInt(formato) || 1;

    let configs = [];
    if (numJuegos === 1) {
        configs = [
            { num: 1, label: '⚡ Partido Único', tag: 'PROGRAMADO', isLocal: true }
        ];
    } else if (numJuegos === 2) {
        configs = [
            { num: 1, label: '📌 JUEGO 1 (IDA)', tag: 'IDA', isLocal: true },
            { num: 2, label: '🔄 JUEGO 2 (VUELTA)', tag: 'VUELTA', isLocal: false }
        ];
    } else if (numJuegos === 3) {
        configs = [
            { num: 1, label: '📌 JUEGO 1', tag: 'JUEGO 1', isLocal: true },
            { num: 2, label: '🔄 JUEGO 2', tag: 'JUEGO 2', isLocal: false },
            { num: 3, label: '⚡ JUEGO 3 (Si es necesario)', tag: 'JUEGO 3', isLocal: true }
        ];
    } else if (numJuegos === 5) {
        configs = [
            { num: 1, label: '📌 JUEGO 1', tag: 'JUEGO 1', isLocal: true },
            { num: 2, label: '🔄 JUEGO 2', tag: 'JUEGO 2', isLocal: false },
            { num: 3, label: '📌 JUEGO 3', tag: 'JUEGO 3', isLocal: true },
            { num: 4, label: '🔄 JUEGO 4 (Si es necesario)', tag: 'JUEGO 4', isLocal: false },
            { num: 5, label: '⚡ JUEGO 5 (Si es necesario)', tag: 'JUEGO 5', isLocal: true }
        ];
    } else if (numJuegos === 7) {
        configs = [
            { num: 1, label: '📌 JUEGO 1', tag: 'JUEGO 1', isLocal: true },
            { num: 2, label: '🔄 JUEGO 2', tag: 'JUEGO 2', isLocal: false },
            { num: 3, label: '📌 JUEGO 3', tag: 'JUEGO 3', isLocal: true },
            { num: 4, label: '🔄 JUEGO 4 (Si es necesario)', tag: 'JUEGO 4', isLocal: false },
            { num: 5, label: '⚡ JUEGO 5 (Si es necesario)', tag: 'JUEGO 5', isLocal: true },
            { num: 6, label: '🔄 JUEGO 6 (Si es necesario)', tag: 'JUEGO 6', isLocal: false },
            { num: 7, label: '⚡ JUEGO 7 (Si es necesario)', tag: 'JUEGO 7', isLocal: true }
        ];
    }

    container.innerHTML = configs.map(cfg => {
        const matchExistente = ctx.matchesDeLlave[cfg.num - 1];
        const matchId = matchExistente ? (matchExistente.id || matchExistente.Id) : 0;
        const canchaSugerida = cfg.isLocal ? defaultCanchaId : canchaInvertidaId;
        const canchaSel = matchExistente ? (matchExistente.canchaId || matchExistente.CanchaId || canchaSugerida) : canchaSugerida;

        let fechaVal = '';
        let horaVal = '';

        if (matchExistente) {
            const fh = matchExistente.fechaHora || matchExistente.FechaHora;
            if (fh && !esFechaPorDefinir(fh)) {
                if (typeof fh === 'string') {
                    const delimiter = fh.includes('T') ? 'T' : ' ';
                    const parts = fh.split(delimiter);
                    fechaVal = parts[0] || '';
                    if (parts[1]) horaVal = parts[1].slice(0, 5);
                } else {
                    const d = new Date(fh);
                    if (!isNaN(d.getTime())) {
                        fechaVal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        horaVal = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                    }
                }
            } else if (cfg.num === 1) {
                fechaVal = fechaActualSistema;
            }
        }

        const locNom = cfg.isLocal ? ctx.teamA.nombre : ctx.teamB.nombre;
        const visNom = cfg.isLocal ? ctx.teamB.nombre : ctx.teamA.nombre;

        return `
            <div class="modal-juego-submodulo" data-juego="${cfg.num}" data-match-id="${matchId}" data-tag="${cfg.tag}" data-is-local="${cfg.isLocal}" style="background: #111216; border: 1px solid ${cfg.isLocal ? '#3a2028' : '#1c2838'}; padding: 12px; border-radius: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 12px; font-weight: 800; color: ${cfg.isLocal ? '#ff0044' : '#38bdf8'};">
                        ${cfg.label}
                    </span>
                    <span style="font-size: 10.5px; color: ${cfg.isLocal ? '#aaa' : '#7dd3fc'}; background: #1c1d24; padding: 2px 7px; border-radius: 3px; font-weight: 600;">
                        ${cfg.isLocal ? `🏠 Local: ${locNom}` : `🔄 Localía Invertida: ${locNom}`}
                    </span>
                </div>
                <div class="form-group" style="margin-bottom: 8px;">
                    <label style="font-size: 11px; color: #ccc; margin-bottom: 3px; display: block; font-weight: 600;">🏟️ Cancha / Sede *</label>
                    <select class="form-control modal-juego-cancha" style="width: 100%; font-size: 12px; padding: 5px 8px;">
                        ${optCanchas(canchaSel)}
                    </select>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                        <label style="font-size: 11px; color: #ccc; margin-bottom: 3px; display: block; font-weight: 600;">
                            📅 Fecha <span style="font-size: 9.5px; color: #f59e0b;">(opcional)</span>
                        </label>
                        <input type="date" class="form-control modal-juego-fecha" value="${fechaVal}" style="width: 100%; font-size: 12px; color-scheme: dark; cursor: pointer;">
                    </div>
                    <div>
                        <label style="font-size: 11px; color: #ccc; margin-bottom: 3px; display: block; font-weight: 600;">
                            ⏰ Hora <span style="font-size: 9.5px; color: #f59e0b;">(opcional)</span>
                        </label>
                        <input type="time" class="form-control modal-juego-hora" value="${horaVal}" style="width: 100%; font-size: 12px; color-scheme: dark; cursor: pointer;">
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Adjuntar showPicker nativo y remover atributos restrictivos
    container.querySelectorAll('.modal-juego-fecha').forEach(inp => {
        inp.removeAttribute('min');
        inp.removeAttribute('max');
        inp.removeAttribute('pattern');
        inp.addEventListener('click', () => {
            try { if (typeof inp.showPicker === 'function') inp.showPicker(); } catch (e) {}
        });
    });

    container.querySelectorAll('.modal-juego-hora').forEach(inpH => {
        inpH.removeAttribute('min');
        inpH.removeAttribute('max');
        inpH.addEventListener('click', () => {
            try { if (typeof inpH.showPicker === 'function') inpH.showPicker(); } catch (e) {}
        });
    });
}

async function guardarEdicionPartidoPlayoff(e) {
    e.preventDefault();
    if (!partidoEditandoContext) {
        mostrarToast('No hay llave o serie en edición.', 'error');
        return;
    }

    const ctx = partidoEditandoContext;
    const submodulos = document.querySelectorAll('.modal-juego-submodulo');
    if (submodulos.length === 0) {
        mostrarToast('No hay juegos configurados.', 'error');
        return;
    }

    try {
        mostrarToast('💾 Guardando configuración de la serie...', 'info');

        const partidosGuardados = [];
        for (const sub of submodulos) {
            const juegoNum = parseInt(sub.dataset.juego) || 1;
            const subMatchId = parseInt(sub.dataset.matchId) || 0;
            const tag = sub.dataset.tag || 'PROGRAMADO';
            const isLocal = sub.dataset.isLocal === 'true';
            const canchaId = parseInt(sub.querySelector('.modal-juego-cancha')?.value) || 1;
            const fechaVal = sub.querySelector('.modal-juego-fecha')?.value?.trim();
            const horaVal = sub.querySelector('.modal-juego-hora')?.value?.trim();

            let fechaHoraDirecta;
            if (!fechaVal || !horaVal || fechaVal.includes('2099')) {
                fechaHoraDirecta = '2099-12-31T00:00:00';
            } else {
                const hora24 = normalizarHora24(horaVal);
                fechaHoraDirecta = `${fechaVal}T${hora24}`;
            }

            const locId = isLocal ? ctx.teamA.id : ctx.teamB.id;
            const visId = isLocal ? ctx.teamB.id : ctx.teamA.id;

            if (subMatchId > 0) {
                // Actualizar partido existente
                const matchOriginal = ctx.matchesDeLlave.find(p => (p.id || p.Id) === subMatchId);
                const payloadPut = {
                    id: subMatchId,
                    torneoId: ctx.torneoId,
                    jornada: ctx.jornada,
                    faseId: ctx.faseId,
                    grupoId: matchOriginal?.grupoId || matchOriginal?.GrupoId || null,
                    canchaId: canchaId,
                    equipoLocalId: locId,
                    equipoVisitanteId: visId,
                    puntosLocal: matchOriginal?.puntosLocal ?? matchOriginal?.PuntosLocal ?? 0,
                    puntosVisitante: matchOriginal?.puntosVisitante ?? matchOriginal?.PuntosVisitante ?? 0,
                    estado: matchOriginal?.estado || matchOriginal?.Estado || 'PROGRAMADO',
                    estadoDetalle: tag,
                    minutoActual: matchOriginal?.minutoActual ?? matchOriginal?.MinutoActual ?? null,
                    fechaHora: fechaHoraDirecta
                };

                const resPut = await fetch(`${API_URL}/partidos/${subMatchId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payloadPut)
                });
                if (!resPut.ok) {
                    const errD = await resPut.json().catch(() => ({}));
                    throw new Error(errD.mensaje || `Error al actualizar Juego ${juegoNum}`);
                }
                partidosGuardados.push(payloadPut);
            } else {
                // Crear nuevo partido de la serie
                const payloadPost = {
                    torneoId: ctx.torneoId,
                    jornada: ctx.jornada,
                    faseId: ctx.faseId,
                    canchaId: canchaId,
                    equipoLocalId: locId,
                    equipoVisitanteId: visId,
                    puntosLocal: 0,
                    puntosVisitante: 0,
                    estado: 'PROGRAMADO',
                    estadoDetalle: tag,
                    minutoActual: null,
                    fechaHora: fechaHoraDirecta
                };

                const resPost = await fetch(`${API_URL}/partidos`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payloadPost)
                });
                if (!resPost.ok) {
                    const errD = await resPost.json().catch(() => ({}));
                    throw new Error(errD.mensaje || `Error al crear Juego ${juegoNum}`);
                }
                const creado = await resPost.json();
                partidosGuardados.push(creado);
            }
        }

        // Si el formato se redujo (ej. de 3 a 1 o 2 juegos), eliminar partidos excedentes
        const cantConfigurada = submodulos.length;
        if (ctx.matchesDeLlave.length > cantConfigurada) {
            for (let k = cantConfigurada; k < ctx.matchesDeLlave.length; k++) {
                const extraId = ctx.matchesDeLlave[k].id || ctx.matchesDeLlave[k].Id;
                if (extraId) {
                    try {
                        await fetch(`${API_URL}/partidos/${extraId}`, { method: 'DELETE' });
                    } catch (eDel) {
                        console.warn('No se pudo eliminar partido excedente:', extraId, eDel);
                    }
                }
            }
        }

        mostrarToast('✅ Serie de playoffs actualizada y guardada correctamente.', 'exito');
        cerrarModal('modal-editar-partido');

        // Recargar fixture y tabla de playoffs en panel admin
        await cargarPartidosFixture(ctx.torneoId);
        await actualizarEstadoPlayoffsAdmin(ctx.torneoId);
    } catch (err) {
        console.error('Error guardando serie de playoff:', err);
        mostrarToast(err.message, 'error');
    }
}

async function abrirModalEditarPartido(id) {
    try {
        asegurarModalEditarPartido();

        mostrarToast('Cargando información de la llave...', 'info');
        const res = await fetch(`${API_URL}/partidos/${id}`);
        if (!res.ok) throw new Error('No se pudo cargar la información del partido');
        const partido = await res.json();
        partidoEditandoPlayoff = partido;

        const fId = Number(partido.faseId || partido.FaseId || 0);
        const jNum = Number(partido.jornada || partido.Jornada || 1);
        const torneoId = partido.torneoId || partido.TorneoId;

        // Consultar todos los partidos de este torneo para obtener todos los juegos de la misma llave
        let matchesDeLlave = [];
        try {
            const resTorneo = await fetch(`${API_URL}/partidos/torneo/${torneoId}`);
            if (resTorneo.ok) {
                const todos = await resTorneo.json();
                matchesDeLlave = todos.filter(p => 
                    Number(p.faseId || p.FaseId || 0) === fId &&
                    Number(p.jornada || p.Jornada || 1) === jNum
                ).sort((a, b) => Number(a.id || a.Id) - Number(b.id || b.Id));
            }
        } catch (e) {}

        if (matchesDeLlave.length === 0) {
            matchesDeLlave = [partido];
        }

        // Determinar Equipo A (local principal) y Equipo B (visitante principal)
        const primerMatch = matchesDeLlave[0];
        const det0 = (primerMatch.estadoDetalle || primerMatch.EstadoDetalle || '').toUpperCase();
        let teamAId, teamBId;

        if (det0.includes('VUELTA') || det0 === 'JUEGO 2' || det0 === 'JUEGO 4' || det0 === 'JUEGO 6') {
            teamAId = primerMatch.equipoVisitanteId || primerMatch.EquipoVisitanteId;
            teamBId = primerMatch.equipoLocalId || primerMatch.EquipoLocalId;
        } else {
            teamAId = primerMatch.equipoLocalId || primerMatch.EquipoLocalId;
            teamBId = primerMatch.equipoVisitanteId || primerMatch.EquipoVisitanteId;
        }

        const teamANombre = primerMatch.equipoLocalNombre || primerMatch.EquipoLocalNombre || obtenerNombreEquipo(teamAId);
        const teamBNombre = primerMatch.equipoVisitanteNombre || primerMatch.EquipoVisitanteNombre || obtenerNombreEquipo(teamBId);

        const teamA = { id: teamAId, nombre: teamANombre };
        const teamB = { id: teamBId, nombre: teamBNombre };

        // Determinar formato actual de la serie según partidos registrados
        let formatoActual = "1";
        if (matchesDeLlave.length === 2) {
            formatoActual = "2";
        } else if (matchesDeLlave.length === 3) {
            formatoActual = "3";
        } else if (matchesDeLlave.length === 5) {
            formatoActual = "5";
        } else if (matchesDeLlave.length === 7) {
            formatoActual = "7";
        } else if (matchesDeLlave.length === 1) {
            const det = (primerMatch.estadoDetalle || primerMatch.EstadoDetalle || '').toUpperCase();
            if (det.includes('IDA') || det.includes('VUELTA')) formatoActual = "2";
            else if (det.includes('JUEGO')) formatoActual = "3";
            else formatoActual = "1";
        }

        let faseNombre = 'Playoffs';
        if (fId === 16) faseNombre = `Octavos (Llave ${jNum})`;
        else if (fId === 8) faseNombre = `Cuartos (Llave ${jNum})`;
        else if (fId === 4) faseNombre = `Semifinal (Llave ${jNum})`;
        else if (fId === 2) faseNombre = `🏆 GRAN FINAL`;

        const lblFase = document.getElementById('modal-editar-partido-fase');
        const lblEncuentro = document.getElementById('modal-editar-partido-encuentro');
        const titleEl = document.getElementById('modal-editar-partido-title');
        if (titleEl) titleEl.textContent = `✏️ Configuración de Llave: ${faseNombre}`;
        if (lblFase) lblFase.textContent = `⚡ ${faseNombre}`;
        if (lblEncuentro) lblEncuentro.textContent = `${teamA.nombre} vs ${teamB.nombre}`;

        // Contexto global de edición
        partidoEditandoContext = {
            torneoId,
            faseId: fId,
            jornada: jNum,
            teamA,
            teamB,
            matchesDeLlave
        };

        const selectFormato = document.getElementById('modal-select-formato-serie');
        if (selectFormato) {
            selectFormato.value = formatoActual;
            selectFormato.onchange = () => {
                renderizarSubmodulosModalEditar(selectFormato.value, partidoEditandoContext);
            };
        }

        // Renderizar submódulos según formato
        renderizarSubmodulosModalEditar(formatoActual, partidoEditandoContext);

        const hiddenId = document.getElementById('edit-playoff-partido-id');
        if (hiddenId) hiddenId.value = id;

        abrirModal('modal-editar-partido');
    } catch (err) {
        console.error('Error abriendo modal de edición de playoff:', err);
        mostrarToast(err.message, 'error');
    }
}

window.abrirModalEditarPartido = abrirModalEditarPartido;

async function generarFormularioLlavesPlayoffs() {
    const container = document.getElementById('playoff-llaves-container');
    const selectRonda = document.getElementById('playoff-ronda-inicial');
    const selectTorneo = document.getElementById('fixture-torneo-select');
    if (!container || !selectRonda || !selectTorneo) return;

    const torneoId = parseInt(selectTorneo.value);
    if (!torneoId) return;

    const rondaSize = parseInt(selectRonda.value) || 8;
    const numPartidos = rondaSize / 2;

    const formatoSelect = document.getElementById('playoff-formato-serie');
    const formatoSerie = formatoSelect ? formatoSelect.value : 'unico';

    let equipos = [];
    try {
        const res = await fetch(`${API_URL}/TorneoEquipos/torneo/${torneoId}`);
        if (res.ok) equipos = await res.json();
    } catch (e) {}

    if (equipos.length === 0) {
        equipos = state.equipos;
    }

    const torneo = state.torneos.find(t => (t.id || t.Id) == torneoId);
    const canchaSedeId = (torneo && !torneo.es_multicancha && !torneo.esMulticancha && (torneo.cancha_sede_id || torneo.canchaSedeId))
        ? (torneo.cancha_sede_id || torneo.canchaSedeId)
        : (state.canchas[0]?.id || 1);

    // Sugerencia de cancha para juegos de vuelta / invertidos: si hay más de 1 cancha, sugerir la otra
    const canchaInvertidaId = (state.canchas && state.canchas.length > 1)
        ? (state.canchas.find(c => (c.id || c.Id) != canchaSedeId)?.id || state.canchas[1]?.id || canchaSedeId)
        : canchaSedeId;

    const optEquiposHtml = '<option value="">-- Selecciona un equipo --</option>' +
        equipos.map(e => `<option value="${e.id || e.Id}">${e.nombre || e.Nombre}</option>`).join('');

    const hoy = new Date();
    const anioHoy = hoy.getFullYear();
    const mesHoy = String(hoy.getMonth() + 1).padStart(2, '0');
    const diaHoy = String(hoy.getDate()).padStart(2, '0');
    const fechaDefault = `${anioHoy}-${mesHoy}-${diaHoy}`;
    const horaDefault = '15:00';

    // Helper para sumar días a una fecha local (YYYY-MM-DD)
    const sumarDiasFechaLocal = (fStr, dias) => {
        const [y, m, d] = fStr.split('-').map(Number);
        const dt = new Date(y, m - 1, d + dias);
        const yyyy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    // Configuración de submódulos de juegos según el formato de serie
    let juegosConfig = [];
    let labelFormato = 'Partido Único';
    if (formatoSerie === 'unico') {
        labelFormato = 'Partido Único';
        juegosConfig = [
            { num: 1, label: '⚡ Partido Único', tag: 'PROGRAMADO', isLocal: true, defaultFecha: fechaDefault, defaultHora: horaDefault, obligatoria: true }
        ];
    } else if (formatoSerie === 'ida_vuelta') {
        labelFormato = 'Ida y Vuelta (Global)';
        juegosConfig = [
            { num: 1, label: '📌 JUEGO 1 (IDA)', tag: 'IDA', isLocal: true, defaultFecha: fechaDefault, defaultHora: horaDefault, obligatoria: true },
            { num: 2, label: '🔄 JUEGO 2 (VUELTA)', tag: 'VUELTA', isLocal: false, defaultFecha: sumarDiasFechaLocal(fechaDefault, 7), defaultHora: horaDefault, obligatoria: false }
        ];
    } else if (formatoSerie === 'best_of_3') {
        labelFormato = 'Al mejor de 3 (Gana 2)';
        juegosConfig = [
            { num: 1, label: '📌 JUEGO 1', tag: 'JUEGO 1', isLocal: true, defaultFecha: fechaDefault, defaultHora: horaDefault, obligatoria: true },
            { num: 2, label: '🔄 JUEGO 2', tag: 'JUEGO 2', isLocal: false, defaultFecha: sumarDiasFechaLocal(fechaDefault, 2), defaultHora: horaDefault, obligatoria: false },
            { num: 3, label: '⚡ JUEGO 3 (Si es necesario)', tag: 'JUEGO 3', isLocal: true, defaultFecha: sumarDiasFechaLocal(fechaDefault, 4), defaultHora: horaDefault, obligatoria: false }
        ];
    } else if (formatoSerie === 'best_of_5') {
        labelFormato = 'Al mejor de 5 (Gana 3)';
        juegosConfig = [
            { num: 1, label: '📌 JUEGO 1', tag: 'JUEGO 1', isLocal: true, defaultFecha: fechaDefault, defaultHora: horaDefault, obligatoria: true },
            { num: 2, label: '📌 JUEGO 2', tag: 'JUEGO 2', isLocal: true, defaultFecha: sumarDiasFechaLocal(fechaDefault, 1), defaultHora: horaDefault, obligatoria: false },
            { num: 3, label: '🔄 JUEGO 3', tag: 'JUEGO 3', isLocal: false, defaultFecha: sumarDiasFechaLocal(fechaDefault, 3), defaultHora: horaDefault, obligatoria: false },
            { num: 4, label: '🔄 JUEGO 4 (Si es necesario)', tag: 'JUEGO 4', isLocal: false, defaultFecha: sumarDiasFechaLocal(fechaDefault, 4), defaultHora: horaDefault, obligatoria: false },
            { num: 5, label: '⚡ JUEGO 5 (Si es necesario)', tag: 'JUEGO 5', isLocal: true, defaultFecha: sumarDiasFechaLocal(fechaDefault, 6), defaultHora: horaDefault, obligatoria: false }
        ];
    } else if (formatoSerie === 'best_of_7') {
        labelFormato = 'Al mejor de 7 (Gana 4)';
        juegosConfig = [
            { num: 1, label: '📌 JUEGO 1', tag: 'JUEGO 1', isLocal: true, defaultFecha: fechaDefault, defaultHora: horaDefault, obligatoria: true },
            { num: 2, label: '🔄 JUEGO 2', tag: 'JUEGO 2', isLocal: false, defaultFecha: sumarDiasFechaLocal(fechaDefault, 1), defaultHora: horaDefault, obligatoria: false },
            { num: 3, label: '📌 JUEGO 3', tag: 'JUEGO 3', isLocal: true, defaultFecha: sumarDiasFechaLocal(fechaDefault, 3), defaultHora: horaDefault, obligatoria: false },
            { num: 4, label: '🔄 JUEGO 4 (Si es necesario)', tag: 'JUEGO 4', isLocal: false, defaultFecha: sumarDiasFechaLocal(fechaDefault, 4), defaultHora: horaDefault, obligatoria: false },
            { num: 5, label: '⚡ JUEGO 5 (Si es necesario)', tag: 'JUEGO 5', isLocal: true, defaultFecha: sumarDiasFechaLocal(fechaDefault, 6), defaultHora: horaDefault, obligatoria: false },
            { num: 6, label: '🔄 JUEGO 6 (Si es necesario)', tag: 'JUEGO 6', isLocal: false, defaultFecha: sumarDiasFechaLocal(fechaDefault, 7), defaultHora: horaDefault, obligatoria: false },
            { num: 7, label: '⚡ JUEGO 7 (Si es necesario)', tag: 'JUEGO 7', isLocal: true, defaultFecha: sumarDiasFechaLocal(fechaDefault, 9), defaultHora: horaDefault, obligatoria: false }
        ];
    }

    let cardsHtml = '';
    for (let i = 1; i <= numPartidos; i++) {
        let labelLlave = `Llave ${i}`;
        if (rondaSize === 2) labelLlave = '🏆 Gran Final';
        else if (rondaSize === 4) labelLlave = `Semifinal ${i}`;
        else if (rondaSize === 8) labelLlave = `Cuartos - Llave ${i}`;
        else if (rondaSize === 16) labelLlave = `Octavos - Llave ${i}`;

        const submodulosHtml = juegosConfig.map(cfg => {
            const canchaSugerida = cfg.isLocal ? canchaSedeId : canchaInvertidaId;
            const optCanchasSub = state.canchas.map(c => 
                `<option value="${c.id || c.Id}" ${(c.id || c.Id) == canchaSugerida ? 'selected' : ''}>${c.nombre || c.Nombre}</option>`
            ).join('');

            return `
                <div class="playoff-juego-submodulo" data-juego="${cfg.num}" data-tag="${cfg.tag}" data-is-local="${cfg.isLocal}" style="background: #111216; border: 1px solid ${cfg.isLocal ? '#3a2028' : '#1c2838'}; padding: 10px 12px; border-radius: 6px; margin-top: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-size: 11.5px; font-weight: 800; color: ${cfg.isLocal ? '#ff0044' : '#38bdf8'};">
                            ${cfg.label}
                        </span>
                        <span style="font-size: 10px; color: ${cfg.isLocal ? '#aaa' : '#7dd3fc'}; background: #1c1d24; padding: 2px 6px; border-radius: 3px; font-weight: 600;">
                            ${cfg.isLocal ? '🏠 Local: Equipo A' : '🔄 Localía Invertida (Equipo B)'}
                        </span>
                    </div>
                    <div style="margin-bottom: 6px;">
                        <label style="font-size: 10.5px; color: #888; display: block; margin-bottom: 2px;">🏟️ Cancha / Sede sugerida:</label>
                        <select class="form-control select-playoff-cancha" style="width: 100%; font-size: 12px; padding: 4px 8px;">
                            ${optCanchasSub}
                        </select>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <div>
                            <label style="font-size: 10.5px; color: #888; display: block; margin-bottom: 2px;">
                                📅 Fecha ${cfg.obligatoria ? '<span style="color:#ff0044;">*</span>' : '<span style="color:#f59e0b; font-size:9.5px;">(opcional)</span>'}:
                            </label>
                            <input type="date" class="form-control input-playoff-fecha" value="${cfg.defaultFecha}" autocomplete="off" style="width: 100%; font-size: 12px; padding: 6px 8px; color-scheme: dark; background-color: #121214; color: #ffffff; border: 1px solid #323238; border-radius: 4px; cursor: pointer; pointer-events: auto;">
                        </div>
                        <div>
                            <label style="font-size: 10.5px; color: #888; display: block; margin-bottom: 2px;">
                                ⏰ Hora ${cfg.obligatoria ? '<span style="color:#ff0044;">*</span>' : '<span style="color:#f59e0b; font-size:9.5px;">(opcional)</span>'}:
                            </label>
                            <input type="time" class="form-control input-playoff-hora" value="${cfg.defaultHora}" autocomplete="off" style="width: 100%; font-size: 12px; padding: 6px 8px; color-scheme: dark; background-color: #121214; color: #ffffff; border: 1px solid #323238; border-radius: 4px; cursor: pointer; pointer-events: auto;">
                        </div>
                    </div>
                    ${!cfg.obligatoria ? '<div style="font-size: 9.5px; color: #777; margin-top: 4px; text-align: right;">💡 Dejar vacío si la fecha/hora está <strong>Por Definir</strong></div>' : ''}
                </div>
            `;
        }).join('');

        cardsHtml += `
            <div class="admin-card playoff-llave-card" data-llave="${i}" style="background: #18191e; border: 1px solid #2a2b34; padding: 14px; border-radius: 8px;">
                <div style="font-weight: 800; font-size: 13px; color: #ff0044; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #23242c; padding-bottom: 8px;">
                    <span>⚡ ${labelLlave}</span>
                    <span style="font-size: 11px; color: #aaa; background: #222; padding: 2px 6px; border-radius: 4px;">Serie: ${labelFormato}</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px;">
                    <div>
                        <label style="font-size: 11px; color: #aaa; margin-bottom: 3px; display: block; font-weight: 600;">🏠 Equipo A (Local Principal):</label>
                        <select class="form-control select-playoff-local" required>
                            ${optEquiposHtml}
                        </select>
                    </div>
                    <div style="text-align: center; font-weight: 800; font-size: 12px; color: #ff0044; margin: 2px 0;">
                        VS
                    </div>
                    <div>
                        <label style="font-size: 11px; color: #aaa; margin-bottom: 3px; display: block; font-weight: 600;">✈️ Equipo B (Visitante Principal):</label>
                        <select class="form-control select-playoff-visit" required>
                            ${optEquiposHtml}
                        </select>
                    </div>
                </div>

                <!-- Submódulos independientes por cada juego de la serie -->
                <div class="playoff-submodulos-lista">
                    ${submodulosHtml}
                </div>
            </div>
        `;
    }

    container.innerHTML = cardsHtml;

    // Asegurar interactividad completa (sin readonly ni disabled, pointer-events activo y showPicker nativo)
    container.querySelectorAll('.input-playoff-fecha, .input-playoff-hora').forEach(inp => {
        inp.removeAttribute('readonly');
        inp.removeAttribute('disabled');
        inp.readOnly = false;
        inp.disabled = false;
        inp.style.pointerEvents = 'auto';
        inp.style.cursor = 'pointer';
        inp.addEventListener('click', () => {
            try {
                if (typeof inp.showPicker === 'function') inp.showPicker();
            } catch (e) {}
        });
    });
}

async function sembrarPlayoffsSegunPosiciones() {
    const selectTorneo = document.getElementById('fixture-torneo-select');
    const selectRonda = document.getElementById('playoff-ronda-inicial');
    if (!selectTorneo || !selectRonda) return;

    const torneoId = parseInt(selectTorneo.value);
    const rondaSize = parseInt(selectRonda.value) || 8;
    if (!torneoId) return;

    mostrarToast('Consultando tabla de posiciones para sembrado...', 'info');

    let ranking = [];
    try {
        const res = await fetch(`${API_URL}/tablaposiciones/torneo/${torneoId}`);
        if (res.ok) {
            ranking = await res.json();
        }
    } catch (e) {}

    if (!ranking || ranking.length < rondaSize) {
        try {
            const resEq = await fetch(`${API_URL}/TorneoEquipos/torneo/${torneoId}`);
            if (resEq.ok) {
                const equiposInscritos = await resEq.json();
                if (equiposInscritos.length > 0) {
                    ranking = equiposInscritos.map((e, idx) => ({
                        equipoId: e.id || e.Id,
                        nombreEquipo: e.nombre || e.Nombre,
                        puntosTotales: 100 - idx
                    }));
                }
            }
        } catch (e) {}
    }

    if (!ranking || ranking.length === 0) {
        mostrarToast('No se encontraron equipos para sembrar en este torneo.', 'error');
        return;
    }

    ranking.sort((a, b) => (b.puntosTotales ?? 0) - (a.puntosTotales ?? 0));

    let crucesIndices = [];
    if (rondaSize === 2) {
        crucesIndices = [[0, 1]];
    } else if (rondaSize === 4) {
        crucesIndices = [[0, 3], [1, 2]];
    } else if (rondaSize === 8) {
        crucesIndices = [[0, 7], [3, 4], [1, 6], [2, 5]];
    } else if (rondaSize === 16) {
        crucesIndices = [
            [0, 15], [7, 8], [3, 12], [4, 11],
            [1, 14], [6, 9], [2, 13], [5, 10]
        ];
    }

    const cards = document.querySelectorAll('.playoff-llave-card');
    crucesIndices.forEach((cruce, idx) => {
        if (idx >= cards.length) return;
        const card = cards[idx];
        const selLoc = card.querySelector('.select-playoff-local');
        const selVis = card.querySelector('.select-playoff-visit');

        const locTeam = ranking[cruce[0]];
        const visTeam = ranking[cruce[1]];

        if (selLoc && locTeam) selLoc.value = locTeam.equipoId;
        if (selVis && visTeam) selVis.value = visTeam.equipoId;
    });

    mostrarToast(`🏆 Se sembraron ${crucesIndices.length} llaves reglamentariamente según la tabla de posiciones.`, 'exito');
}

async function publicarPlayoffsHabilitarCuadro() {
    const selectTorneo = document.getElementById('fixture-torneo-select');
    const selectRonda = document.getElementById('playoff-ronda-inicial');
    if (!selectTorneo || !selectRonda) return;

    const torneoId = parseInt(selectTorneo.value);
    const rondaSize = parseInt(selectRonda.value) || 8;
    if (!torneoId) {
        mostrarToast('Selecciona un torneo primero.', 'error');
        return;
    }

    const cards = document.querySelectorAll('.playoff-llave-card');
    if (cards.length === 0) {
        mostrarToast('No hay llaves para publicar.', 'error');
        return;
    }

    const formatoSelect = document.getElementById('playoff-formato-serie');
    const formatoSerie = formatoSelect ? formatoSelect.value : 'unico';

    let labelFormato = 'Partido Único';
    if (formatoSerie === 'ida_vuelta') labelFormato = 'Ida y Vuelta (Global)';
    else if (formatoSerie === 'best_of_3') labelFormato = 'Al mejor de 3 (Gana 2)';
    else if (formatoSerie === 'best_of_5') labelFormato = 'Al mejor de 5 (Gana 3)';
    else if (formatoSerie === 'best_of_7') labelFormato = 'Al mejor de 7 (Gana 4)';

    const partidosACrear = [];
    let hayErrores = false;

    // Helper para sumar días a una fecha local (YYYY-MM-DD) preservando la hora local sin UTC
    const sumarDiasFechaLocal = (fStr, dias) => {
        const [y, m, d] = fStr.split('-').map(Number);
        const dt = new Date(y, m - 1, d + dias);
        const yyyy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    cards.forEach((card, idx) => {
        const jNum = idx + 1;
        const locId = parseInt(card.querySelector('.select-playoff-local')?.value);
        const visId = parseInt(card.querySelector('.select-playoff-visit')?.value);

        if (!locId || !visId) {
            mostrarToast(`Por favor asigna ambos equipos para la Llave ${jNum}.`, 'error');
            hayErrores = true;
            return;
        }

        if (locId === visId) {
            mostrarToast(`El equipo local y visitante no pueden ser el mismo en la Llave ${jNum}.`, 'error');
            hayErrores = true;
            return;
        }

        const submodulos = card.querySelectorAll('.playoff-juego-submodulo');
        if (submodulos.length > 0) {
            submodulos.forEach(sub => {
                const tag = sub.dataset.tag || 'PROGRAMADO';
                const isLocal = sub.dataset.isLocal === 'true';
                const canchaSubId = parseInt(sub.querySelector('.select-playoff-cancha')?.value) || 1;
                const fechaVal = sub.querySelector('.input-playoff-fecha')?.value?.trim();
                const horaVal = sub.querySelector('.input-playoff-hora')?.value?.trim();

                let fechaHoraFinal;
                if (!fechaVal || !horaVal) {
                    fechaHoraFinal = '2099-12-31T00:00:00'; // Por Definir
                } else {
                    const horaNorm = horaVal.length === 5 ? `${horaVal}:00` : horaVal;
                    fechaHoraFinal = `${fechaVal}T${horaNorm}`;
                }

                const eqLoc = isLocal ? locId : visId;
                const eqVis = isLocal ? visId : locId;

                partidosACrear.push({
                    torneoId: torneoId,
                    jornada: jNum,
                    faseId: rondaSize,
                    canchaId: canchaSubId,
                    equipoLocalId: eqLoc,
                    equipoVisitanteId: eqVis,
                    puntosLocal: 0,
                    puntosVisitante: 0,
                    estado: 'PROGRAMADO',
                    estadoDetalle: tag,
                    fechaHora: fechaHoraFinal
                });
            });
        } else {
            const canchaId = parseInt(card.querySelector('.select-playoff-cancha')?.value) || 1;
            const fechaVal = card.querySelector('.input-playoff-fecha')?.value?.trim();
            const horaVal = card.querySelector('.input-playoff-hora')?.value?.trim();
            let fechaHoraFinal;
            if (!fechaVal || !horaVal) {
                fechaHoraFinal = '2099-12-31T00:00:00';
            } else {
                const horaNorm = horaVal.length === 5 ? `${horaVal}:00` : horaVal;
                fechaHoraFinal = `${fechaVal}T${horaNorm}`;
            }

            partidosACrear.push({
                torneoId: torneoId,
                jornada: jNum,
                faseId: rondaSize,
                canchaId: canchaId,
                equipoLocalId: locId,
                equipoVisitanteId: visId,
                puntosLocal: 0,
                puntosVisitante: 0,
                estado: 'PROGRAMADO',
                estadoDetalle: 'PROGRAMADO',
                fechaHora: fechaHoraFinal
            });
        }
    });

    if (hayErrores) return;

    let nombreRonda = 'Playoffs';
    if (rondaSize === 16) nombreRonda = 'Octavos de Final';
    else if (rondaSize === 8) nombreRonda = 'Cuartos de Final';
    else if (rondaSize === 4) nombreRonda = 'Semifinales';
    else if (rondaSize === 2) nombreRonda = 'Gran Final';

    const ok = await mostrarConfirmacionModal(
        `¿Publicar ${partidosACrear.length} partidos de ${nombreRonda} (${labelFormato}) en la base de datos y habilitar la pestaña Cuadro?`,
        '⚡ Publicar Llaves de Play-offs'
    );
    if (!ok) return;

    try {
        mostrarToast(`Registrando llaves de ${nombreRonda}...`, 'info');
        for (const p of partidosACrear) {
            const res = await fetch(`${API_URL}/partidos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(p)
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.mensaje || 'Error al guardar partido de playoff');
            }
        }

        mostrarToast(`🏆 ¡${partidosACrear.length} partidos de ${nombreRonda} publicados con éxito! Pestaña Cuadro habilitada.`, 'exito');
        document.getElementById('panel-config-playoffs')?.classList.add('hidden');
        await cargarPartidosFixture(torneoId);
    } catch (err) {
        console.error('Error publicando llaves de playoffs:', err);
        mostrarToast(err.message, 'error');
    }
}

// ============================================================================
// EVALUACIÓN DE GANADORES, AVANCE ASÍNCRONO Y PERSISTENCIA DE PLAYOFFS
// ============================================================================

function obtenerGanadorDeLlave(partidosLlave, torneoId, faseId, jornada) {
    if (!partidosLlave || partidosLlave.length === 0) return null;

    if (partidosLlave.length === 1) {
        const p = partidosLlave[0];
        const est = (p.estado || p.Estado || '').toUpperCase();
        if (est !== 'FINALIZADO' && est !== 'TERMINADO') return null;

        const locId = p.equipoLocalId || p.EquipoLocalId;
        const visId = p.equipoVisitanteId || p.EquipoVisitanteId;
        const locNom = p.equipoLocalNombre || p.EquipoLocalNombre || obtenerNombreEquipo(locId);
        const visNom = p.equipoVisitanteNombre || p.EquipoVisitanteNombre || obtenerNombreEquipo(visId);
        const ptsL = Number(p.puntosLocal ?? p.PuntosLocal ?? 0);
        const ptsV = Number(p.puntosVisitante ?? p.PuntosVisitante ?? 0);

        if (ptsL > ptsV) return { id: locId, nombre: locNom };
        if (ptsV > ptsL) return { id: visId, nombre: visNom };

        // Si hay empate, verificar si hay desempate guardado en localStorage
        const tiebreakKey = `playoff_tiebreak_${torneoId}_${faseId}_${jornada}`;
        const savedWinner = localStorage.getItem(tiebreakKey);
        if (savedWinner) {
            try {
                const parsed = JSON.parse(savedWinner);
                if (parsed && parsed.id) return parsed;
            } catch (e) {}
        }
        return null;
    }

    // Serie múltiple (Ida/Vuelta, Best of 3, Best of 5)
    const eqAId = partidosLlave[0].equipoLocalId || partidosLlave[0].EquipoLocalId;
    const eqBId = partidosLlave[0].equipoVisitanteId || partidosLlave[0].EquipoVisitanteId;
    const nomA = partidosLlave[0].equipoLocalNombre || partidosLlave[0].EquipoLocalNombre || obtenerNombreEquipo(eqAId);
    const nomB = partidosLlave[0].equipoVisitanteNombre || partidosLlave[0].EquipoVisitanteNombre || obtenerNombreEquipo(eqBId);

    let victoriasA = 0;
    let victoriasB = 0;
    let globalA = 0;
    let globalB = 0;
    let finalizadosCount = 0;

    partidosLlave.forEach(p => {
        const est = (p.estado || p.Estado || '').toUpperCase();
        if (est === 'FINALIZADO' || est === 'TERMINADO') {
            finalizadosCount++;
            const pLocId = p.equipoLocalId || p.EquipoLocalId;
            const ptsL = Number(p.puntosLocal ?? p.PuntosLocal ?? 0);
            const ptsV = Number(p.puntosVisitante ?? p.PuntosVisitante ?? 0);

            if (pLocId === eqAId) {
                globalA += ptsL;
                globalB += ptsV;
                if (ptsL > ptsV) victoriasA++;
                else if (ptsV > ptsL) victoriasB++;
            } else {
                globalB += ptsL;
                globalA += ptsV;
                if (ptsL > ptsV) victoriasB++;
                else if (ptsV > ptsL) victoriasA++;
            }
        }
    });

    const totalPartidos = partidosLlave.length;

    // Cierre Anticipado Universal:
    // Si la serie es al mejor de 3 (o tiene 3 juegos configurados) y un equipo llega a 2 victorias:
    const esIdaVuelta = (totalPartidos === 2) && partidosLlave.some(p => {
        const tag = (p.estadoDetalle || p.EstadoDetalle || '').toUpperCase();
        return tag.includes('IDA') || tag.includes('VUELTA');
    });

    if (!esIdaVuelta) {
        // Al mejor de 3 (Gana 2 victorias)
        if (totalPartidos <= 3 && (victoriasA >= 2 || victoriasB >= 2)) {
            return (victoriasA >= 2) ? { id: eqAId, nombre: nomA } : { id: eqBId, nombre: nomB };
        }
        // Al mejor de 5 (Gana 3 victorias)
        if (totalPartidos === 5 && (victoriasA >= 3 || victoriasB >= 3)) {
            return (victoriasA >= 3) ? { id: eqAId, nombre: nomA } : { id: eqBId, nombre: nomB };
        }
        // Al mejor de 7 (Gana 4 victorias)
        if (totalPartidos === 7 && (victoriasA >= 4 || victoriasB >= 4)) {
            return (victoriasA >= 4) ? { id: eqAId, nombre: nomA } : { id: eqBId, nombre: nomB };
        }
    }

    if (totalPartidos === 2 && esIdaVuelta) {
        // Ida y Vuelta
        if (finalizadosCount < 2) return null;
        if (globalA > globalB) return { id: eqAId, nombre: nomA };
        if (globalB > globalA) return { id: eqBId, nombre: nomB };

        const tiebreakKey = `playoff_tiebreak_${torneoId}_${faseId}_${jornada}`;
        const savedWinner = localStorage.getItem(tiebreakKey);
        if (savedWinner) {
            try {
                const parsed = JSON.parse(savedWinner);
                if (parsed && parsed.id) return parsed;
            } catch (e) {}
        }
        return null;
    } else if (totalPartidos === 3) {
        if (victoriasA >= 2) return { id: eqAId, nombre: nomA };
        if (victoriasB >= 2) return { id: eqBId, nombre: nomB };
        if (finalizadosCount === 3) {
            if (victoriasA > victoriasB) return { id: eqAId, nombre: nomA };
            if (victoriasB > victoriasA) return { id: eqBId, nombre: nomB };
        }
        return null;
    } else if (totalPartidos === 5) {
        if (victoriasA >= 3) return { id: eqAId, nombre: nomA };
        if (victoriasB >= 3) return { id: eqBId, nombre: nomB };
        if (finalizadosCount === 5) {
            if (victoriasA > victoriasB) return { id: eqAId, nombre: nomA };
            if (victoriasB > victoriasA) return { id: eqBId, nombre: nomB };
        }
        return null;
    } else if (totalPartidos === 7) {
        if (victoriasA >= 4) return { id: eqAId, nombre: nomA };
        if (victoriasB >= 4) return { id: eqBId, nombre: nomB };
        if (finalizadosCount === 7) {
            if (victoriasA > victoriasB) return { id: eqAId, nombre: nomA };
            if (victoriasB > victoriasA) return { id: eqBId, nombre: nomB };
        }
        return null;
    } else {
        if (victoriasA > victoriasB) return { id: eqAId, nombre: nomA };
        if (victoriasB > victoriasA) return { id: eqBId, nombre: nomB };
        return null;
    }
}

async function cargarPartidosPlayoff(torneoId) {
    if (!torneoId) {
        torneoId = obtenerTorneoSeleccionadoId();
    }
    if (!torneoId) return;
    await actualizarEstadoPlayoffsAdmin(torneoId);
}
window.cargarPartidosPlayoff = cargarPartidosPlayoff;

async function sincronizarFasesSiguientesTorneo(torneoId) {
    if (!torneoId) {
        torneoId = obtenerTorneoSeleccionadoId();
    }

    if (!torneoId) {
        mostrarToast('Por favor selecciona un torneo para sincronizar.', 'error');
        return;
    }

    try {
        mostrarToast('🔄 Evaluando llaves y sincronizando siguientes fases...', 'info');

        const res = await fetch(`${API_URL}/partidos/torneo/${torneoId}`);
        if (!res.ok) throw new Error('No se pudieron obtener los partidos del torneo');
        const partidos = await res.json();

        // Obtener cancha sede por defecto del torneo
        let defaultCanchaId = 1;
        const torneoObj = (state.torneos || []).find(t => (t.id || t.Id) == torneoId);
        if (torneoObj && (torneoObj.canchaSedeId || torneoObj.cancha_sede_id)) {
            defaultCanchaId = torneoObj.canchaSedeId || torneoObj.cancha_sede_id;
        }

        const playoffs = (partidos || []).filter(p => esPartidoPlayoff(p));

        if (playoffs.length === 0) {
            mostrarToast('Este torneo aún no tiene partidos de playoffs registrados.', 'info');
            return;
        }

        let creadosCount = 0;
        let actualizadosCount = 0;

        // Fases en orden cronológico: 16 (Octavos), 8 (Cuartos), 4 (Semifinales)
        const fasesAvanzables = [16, 8, 4];

        for (const fId of fasesAvanzables) {
            const partidosFase = playoffs.filter(p => Number(p.faseId || p.FaseId || 0) === fId);
            if (partidosFase.length === 0) continue;

            const nextFaseId = (fId === 16) ? 8 : (fId === 8 ? 4 : 2);
            const numLlavesNext = (fId === 16) ? 4 : (fId === 8 ? 2 : 1);
            const nombreFaseSig = (nextFaseId === 8) ? 'Cuartos de Final' : (nextFaseId === 4 ? 'Semifinales' : 'Gran Final');

            for (let j = 1; j <= numLlavesNext; j++) {
                const jLoc = (j * 2) - 1;
                const jVis = j * 2;

                const matchesLoc = partidosFase.filter(p => Number(p.jornada || p.Jornada || 1) === jLoc);
                const matchesVis = partidosFase.filter(p => Number(p.jornada || p.Jornada || 1) === jVis);

                const ganadorLoc = obtenerGanadorDeLlave(matchesLoc, torneoId, fId, jLoc);
                const ganadorVis = obtenerGanadorDeLlave(matchesVis, torneoId, fId, jVis);

                const slotKeyLoc = `playoff_slot_${torneoId}_${nextFaseId}_${j}_loc`;
                const slotKeyVis = `playoff_slot_${torneoId}_${nextFaseId}_${j}_vis`;

                // Si un ganador ya está listo, guardarlo para renderizado inmediato en el Cuadro
                if (ganadorLoc && ganadorLoc.id) {
                    localStorage.setItem(slotKeyLoc, JSON.stringify({ id: ganadorLoc.id, nombre: ganadorLoc.nombre }));
                }
                if (ganadorVis && ganadorVis.id) {
                    localStorage.setItem(slotKeyVis, JSON.stringify({ id: ganadorVis.id, nombre: ganadorVis.nombre }));
                }

                // Si AMBOS ganadores están definidos, persistir partido real en la BD
                if (ganadorLoc && ganadorLoc.id && ganadorVis && ganadorVis.id) {
                    const matchSiguiente = playoffs.find(p => 
                        Number(p.faseId || p.FaseId || 0) === nextFaseId &&
                        Number(p.jornada || p.Jornada || 1) === j
                    );

                    if (!matchSiguiente) {
                        // CREAR EN BD CON FECHA POR DEFINIR
                        const payloadCrear = {
                            torneoId: Number(torneoId),
                            jornada: j,
                            faseId: nextFaseId,
                            canchaId: defaultCanchaId || matchesLoc[0]?.canchaId || matchesLoc[0]?.CanchaId || 1,
                            equipoLocalId: ganadorLoc.id,
                            equipoVisitanteId: ganadorVis.id,
                            puntosLocal: 0,
                            puntosVisitante: 0,
                            estado: 'PROGRAMADO',
                            estadoDetalle: 'PROGRAMADO',
                            fechaHora: '2099-12-31T00:00:00'
                        };

                        const resPost = await fetch(`${API_URL}/partidos`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payloadCrear)
                        });

                        if (resPost.ok) {
                            creadosCount++;
                            localStorage.removeItem(slotKeyLoc);
                            localStorage.removeItem(slotKeyVis);
                        }
                    } else {
                        // YA EXISTE EN BD: Verificar si los equipos coinciden
                        const curLocId = matchSiguiente.equipoLocalId || matchSiguiente.EquipoLocalId;
                        const curVisId = matchSiguiente.equipoVisitanteId || matchSiguiente.EquipoVisitanteId;

                        if (curLocId !== ganadorLoc.id || curVisId !== ganadorVis.id) {
                            const payloadActualizar = {
                                id: matchSiguiente.id || matchSiguiente.Id,
                                torneoId: Number(torneoId),
                                jornada: j,
                                faseId: nextFaseId,
                                canchaId: matchSiguiente.canchaId || matchSiguiente.CanchaId || defaultCanchaId,
                                equipoLocalId: ganadorLoc.id,
                                equipoVisitanteId: ganadorVis.id,
                                puntosLocal: matchSiguiente.puntosLocal ?? matchSiguiente.PuntosLocal ?? 0,
                                puntosVisitante: matchSiguiente.puntosVisitante ?? matchSiguiente.PuntosVisitante ?? 0,
                                estado: matchSiguiente.estado || matchSiguiente.Estado || 'PROGRAMADO',
                                estadoDetalle: matchSiguiente.estadoDetalle || matchSiguiente.EstadoDetalle || 'PROGRAMADO',
                                fechaHora: matchSiguiente.fechaHora || matchSiguiente.FechaHora || '2099-12-31T00:00:00'
                            };

                            const resPut = await fetch(`${API_URL}/partidos/${payloadActualizar.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payloadActualizar)
                            });

                            if (resPut.ok) {
                                actualizadosCount++;
                                localStorage.removeItem(slotKeyLoc);
                                localStorage.removeItem(slotKeyVis);
                            }
                        }
                    }
                }
            }
        }

        // Refrescar fixture y tabla de playoffs en admin
        await cargarPartidosFixture(torneoId);

        if (creadosCount > 0 || actualizadosCount > 0) {
            mostrarToast(`✅ Sincronización exitosa: ${creadosCount} partido(s) nuevo(s) de siguiente fase y ${actualizadosCount} actualizado(s).`, 'exito');
        } else {
            mostrarToast('ℹ️ Todas las fases de playoffs están sincronizadas al día.', 'info');
        }
    } catch (err) {
        console.error('Error sincronizando fases de playoffs:', err);
        mostrarToast('Error al sincronizar fases: ' + err.message, 'error');
    }
}
window.sincronizarFasesSiguientesTorneo = sincronizarFasesSiguientesTorneo;

async function procesarAvancePlayoff(partido, ptsLoc, ptsVis) {
    if (!partido) return;
    const fId = Number(partido.faseId || partido.FaseId || 0);
    if (fId !== 16 && fId !== 8 && fId !== 4 && fId !== 2) return;

    const torneoId = partido.torneoId || partido.TorneoId;
    const eqLocId = partido.equipoLocalId || partido.EquipoLocalId;
    const eqVisId = partido.equipoVisitanteId || partido.EquipoVisitanteId;
    const nomLoc = partido.equipoLocalNombre || partido.EquipoLocalNombre || obtenerNombreEquipo(eqLocId);
    const nomVis = partido.equipoVisitanteNombre || partido.EquipoVisitanteNombre || obtenerNombreEquipo(eqVisId);
    const jNum = Number(partido.jornada || partido.Jornada || 1);

    // Consultamos si esta llave tiene serie de múltiples partidos (Ida/Vuelta o Best of N)
    let partidosLlave = [];
    try {
        const res = await fetch(`${API_URL}/partidos/torneo/${torneoId}`);
        if (res.ok) {
            const allPartidos = await res.json();
            partidosLlave = allPartidos.filter(p => 
                Number(p.faseId || p.FaseId || 0) === fId &&
                Number(p.jornada || p.Jornada || 1) === jNum
            );
        }
    } catch (e) {}

    let ganadorId = null;
    let nombreGanador = '';

    if (partidosLlave.length > 1) {
        // SERIE DE MÚLTIPLES PARTIDOS
        const equipoAId = eqLocId;
        const equipoBId = eqVisId;

        let victoriasA = 0;
        let victoriasB = 0;
        let puntosGlobalA = 0;
        let puntosGlobalB = 0;
        let partidosFinalizadosTotal = 0;

        partidosLlave.forEach(p => {
            const pId = p.id || p.Id;
            const isCurrent = (pId === (partido.id || partido.Id));
            const est = (p.estado || p.Estado || '').toUpperCase();
            if (est === 'FINALIZADO' || est === 'TERMINADO' || isCurrent) {
                partidosFinalizadosTotal++;
                const pLocId = p.equipoLocalId || p.EquipoLocalId;
                const pPtsL = isCurrent ? ptsLoc : Number(p.puntosLocal || p.PuntosLocal || 0);
                const pPtsV = isCurrent ? ptsVis : Number(p.puntosVisitante || p.PuntosVisitante || 0);

                if (pLocId === equipoAId) {
                    puntosGlobalA += pPtsL;
                    puntosGlobalB += pPtsV;
                    if (pPtsL > pPtsV) victoriasA++;
                    else if (pPtsV > pPtsL) victoriasB++;
                } else {
                    puntosGlobalB += pPtsL;
                    puntosGlobalA += pPtsV;
                    if (pPtsL > pPtsV) victoriasB++;
                    else if (pPtsV > pPtsL) victoriasA++;
                }
            }
        });

        const esIdaVuelta = partidosLlave.length === 2;
        const esMejorDe3 = partidosLlave.length === 3;
        const esMejorDe5 = partidosLlave.length === 5;

        if (esMejorDe3) {
            if (victoriasA >= 2) {
                ganadorId = equipoAId;
                nombreGanador = nomLoc;
            } else if (victoriasB >= 2) {
                ganadorId = equipoBId;
                nombreGanador = nomVis;
            } else {
                mostrarToast(`Juego de la serie finalizado. Serie: ${nomLoc} (${victoriasA}) vs ${nomVis} (${victoriasB}).`, 'info');
                return;
            }
        } else if (esMejorDe5) {
            if (victoriasA >= 3) {
                ganadorId = equipoAId;
                nombreGanador = nomLoc;
            } else if (victoriasB >= 3) {
                ganadorId = equipoBId;
                nombreGanador = nomVis;
            } else {
                mostrarToast(`Juego de la serie finalizado. Serie: ${nomLoc} (${victoriasA}) vs ${nomVis} (${victoriasB}).`, 'info');
                return;
            }
        } else if (esIdaVuelta) {
            if (partidosFinalizadosTotal < 2) {
                mostrarToast('Partido de Ida finalizado. La serie se definirá en el partido de Vuelta.', 'info');
                return;
            }
            if (puntosGlobalA > puntosGlobalB) {
                ganadorId = equipoAId;
                nombreGanador = nomLoc;
            } else if (puntosGlobalB > puntosGlobalA) {
                ganadorId = equipoBId;
                nombreGanador = nomVis;
            } else {
                if (partido.ganadorId) {
                    ganadorId = partido.ganadorId;
                    nombreGanador = partido.nombreGanador || (String(ganadorId) === String(equipoAId) ? nomLoc : nomVis);
                } else {
                    const rawTb = localStorage.getItem(`playoff_tiebreak_${torneoId}_${fId}_${jNum}`);
                    if (rawTb) {
                        try {
                            const parsedTb = JSON.parse(rawTb);
                            if (parsedTb && parsedTb.id) {
                                ganadorId = parsedTb.id;
                                nombreGanador = parsedTb.nombre || (String(ganadorId) === String(equipoAId) ? nomLoc : nomVis);
                            }
                        } catch (e) {}
                    }
                }
                if (!ganadorId) {
                    const esLocal = await mostrarConfirmacionModal(
                        `La serie de Ida y Vuelta finalizó empatada en el marcador global (${puntosGlobalA} - ${puntosGlobalB}).\n\n¿Quién clasificó en penales o desempate?`,
                        '🏆 Desempate de Serie Global',
                        nomLoc,
                        nomVis
                    );
                    ganadorId = esLocal ? equipoAId : equipoBId;
                    nombreGanador = esLocal ? nomLoc : nomVis;
                    localStorage.setItem(`playoff_tiebreak_${torneoId}_${fId}_${jNum}`, JSON.stringify({ id: ganadorId, nombre: nombreGanador }));
                }
            }
        } else {
            if (ptsLoc > ptsVis) {
                ganadorId = eqLocId;
                nombreGanador = nomLoc;
            } else if (ptsVis > ptsLoc) {
                ganadorId = eqVisId;
                nombreGanador = nomVis;
            }
        }
    } else {
        // PARTIDO ÚNICO
        if (ptsLoc > ptsVis) {
            ganadorId = eqLocId;
            nombreGanador = nomLoc;
        } else if (ptsVis > ptsLoc) {
            ganadorId = eqVisId;
            nombreGanador = nomVis;
        } else {
            if (partido.ganadorId) {
                ganadorId = partido.ganadorId;
                nombreGanador = partido.nombreGanador || (String(ganadorId) === String(eqLocId) ? nomLoc : nomVis);
            } else {
                const rawTb = localStorage.getItem(`playoff_tiebreak_${torneoId}_${fId}_${jNum}`);
                if (rawTb) {
                    try {
                        const parsedTb = JSON.parse(rawTb);
                        if (parsedTb && parsedTb.id) {
                            ganadorId = parsedTb.id;
                            nombreGanador = parsedTb.nombre || (String(ganadorId) === String(eqLocId) ? nomLoc : nomVis);
                        }
                    } catch (e) {}
                }
            }
            if (!ganadorId) {
                const esLocal = await mostrarConfirmacionModal(
                    `El partido de eliminación directa finalizó en empate (${ptsLoc} - ${ptsVis}).\n\n¿El ganador definido por serie de penales o desempate fue ${nomLoc}?`,
                    '🏆 Definir Ganador de Llave',
                    nomLoc,
                    nomVis
                );
                ganadorId = esLocal ? eqLocId : eqVisId;
                nombreGanador = esLocal ? nomLoc : nomVis;
                localStorage.setItem(`playoff_tiebreak_${torneoId}_${fId}_${jNum}`, JSON.stringify({ id: ganadorId, nombre: nombreGanador }));
            }
        }
    }

    if (!ganadorId) return;

    if (fId === 2) {
        mostrarToast(`🏆 ¡${nombreGanador} SE CORONA CAMPEÓN DEL TORNEO!`, 'exito');
        await mostrarConfirmacionModal(
            `🏆 ¡CAMPEÓN DEFINIDO!\n\n${nombreGanador} ha ganado la Gran Final y se corona como el flamante Campeón del Torneo.`,
            '🏆 ¡CAMPEÓN DEL TORNEO!',
            '¡Excelente!',
            ''
        );
        return;
    }

    const nextFaseId = (fId === 16) ? 8 : (fId === 8 ? 4 : (fId === 4 ? 2 : 0));
    const nextJornada = (fId === 4) ? 1 : Math.ceil(jNum / 2);
    const isLocal = (fId === 4) ? (jNum === 1) : (jNum % 2 !== 0);
    const nombreFaseSig = (nextFaseId === 8) ? 'Cuartos de Final' : (nextFaseId === 4 ? 'Semifinales' : 'Gran Final');

    if (!nextFaseId) return;

    try {
        const res = await fetch(`${API_URL}/partidos/torneo/${torneoId}`);
        if (!res.ok) return;
        const partidosTorneo = await res.json();

        const matchSiguiente = partidosTorneo.find(p => 
            Number(p.faseId || p.FaseId || 0) === nextFaseId &&
            Number(p.jornada || p.Jornada || 1) === nextJornada
        );

        if (matchSiguiente) {
            const payload = {
                id: matchSiguiente.id || matchSiguiente.Id,
                torneoId: Number(torneoId),
                jornada: nextJornada,
                faseId: nextFaseId,
                canchaId: matchSiguiente.canchaId || matchSiguiente.CanchaId || 1,
                equipoLocalId: isLocal ? ganadorId : (matchSiguiente.equipoLocalId || matchSiguiente.EquipoLocalId),
                equipoVisitanteId: !isLocal ? ganadorId : (matchSiguiente.equipoVisitanteId || matchSiguiente.EquipoVisitanteId),
                puntosLocal: 0,
                puntosVisitante: 0,
                estado: 'PROGRAMADO',
                estadoDetalle: 'PROGRAMADO',
                fechaHora: matchSiguiente.fechaHora || matchSiguiente.FechaHora || '2099-12-31T00:00:00'
            };

            const resPut = await fetch(`${API_URL}/partidos/${payload.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (resPut.ok) {
                mostrarToast(`⚡ ¡${nombreGanador} avanzó a ${nombreFaseSig} (Llave ${nextJornada})!`, 'exito');
                await cargarPartidosPlayoff(torneoId);
            }
        } else {
            const slotKey = `playoff_slot_${torneoId}_${nextFaseId}_${nextJornada}_${isLocal ? 'loc' : 'vis'}`;
            const rivalKey = `playoff_slot_${torneoId}_${nextFaseId}_${nextJornada}_${isLocal ? 'vis' : 'loc'}`;
            localStorage.setItem(slotKey, JSON.stringify({ id: ganadorId, nombre: nombreGanador }));

            // 1. Verificar si el rival ya avanzó previamente en localStorage
            let rival = null;
            const rivalRaw = localStorage.getItem(rivalKey);
            if (rivalRaw) {
                try { rival = JSON.parse(rivalRaw); } catch (e) {}
            }

            // 2. Si no estaba en localStorage, verificar si el partido del rival en BD ya finalizó
            if (!rival) {
                const rivalJornada = isLocal ? (jNum + 1) : (jNum - 1);
                const partidosRivalLlave = partidosTorneo.filter(p => 
                    Number(p.faseId || p.FaseId || 0) === fId &&
                    Number(p.jornada || p.Jornada || 1) === rivalJornada
                );
                const ganadorRival = obtenerGanadorDeLlave(partidosRivalLlave, torneoId, fId, rivalJornada);
                if (ganadorRival && ganadorRival.id) {
                    rival = ganadorRival;
                }
            }

            if (rival && rival.id) {
                const payloadCrear = {
                    torneoId: Number(torneoId),
                    jornada: nextJornada,
                    faseId: nextFaseId,
                    canchaId: partido.canchaId || partido.CanchaId || 1,
                    equipoLocalId: isLocal ? ganadorId : rival.id,
                    equipoVisitanteId: isLocal ? rival.id : ganadorId,
                    puntosLocal: 0,
                    puntosVisitante: 0,
                    estado: 'PROGRAMADO',
                    estadoDetalle: 'PROGRAMADO',
                    fechaHora: '2099-12-31T00:00:00'
                };

                const resPost = await fetch(`${API_URL}/partidos`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payloadCrear)
                });

                if (resPost.ok) {
                    mostrarToast(`🏆 ¡Llave de ${nombreFaseSig} definida e insertada en BD: ${isLocal ? nombreGanador : rival.nombre} vs ${isLocal ? rival.nombre : nombreGanador}!`, 'exito');
                    localStorage.removeItem(slotKey);
                    localStorage.removeItem(rivalKey);
                    await cargarPartidosPlayoff(torneoId);
                }
            } else {
                mostrarToast(`⚡ ¡${nombreGanador} avanzó a ${nombreFaseSig}! (Posicionado en el Cuadro, esperando rival de la otra llave)`, 'info');
            }
        }
    } catch (e) {
        console.error('Error procesando avance en playoff:', e);
    }
}

// ============================================================================
// MÓDULO 6: GESTIÓN DE USUARIOS Y PLANILLEROS (SUPERADMIN)
// ============================================================================

let listaUsuariosAdmin = [];

async function cargarUsuariosAdmin() {
    const tbody = document.getElementById('tabla-usuarios-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #888; padding: 20px;">⏳ Cargando lista de usuarios y planilleros...</td></tr>`;

    try {
        const res = await fetch(`${API_URL}/auth/usuarios`);
        if (!res.ok) {
            throw new Error(`Error ${res.status}: No se pudo obtener la lista de usuarios.`);
        }
        listaUsuariosAdmin = await res.json();
        renderizarTablaUsuariosAdmin(listaUsuariosAdmin);
    } catch (err) {
        console.error('Error cargando usuarios:', err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #ff0044; padding: 20px;">⚠️ Error cargando usuarios: ${err.message}</td></tr>`;
        mostrarToast('Error al cargar lista de usuarios.', 'error');
    }
}

function renderizarTablaUsuariosAdmin(usuarios) {
    const tbody = document.getElementById('tabla-usuarios-body');
    if (!tbody) return;

    if (!usuarios || usuarios.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #888; padding: 20px;">No hay usuarios registrados.</td></tr>`;
        return;
    }

    tbody.innerHTML = usuarios.map((u, index) => {
        const uId = u.id || u.Id;
        const username = u.username || u.Username || '';
        const nombre = u.nombreCompleto || u.NombreCompleto || '';
        const rol = (u.rol || u.Rol || 'PLANILLERO').toUpperCase();
        const tId = u.torneoId ?? u.TorneoId;
        const tNombre = u.torneoNombre || u.TorneoNombre;
        const activo = (u.activo ?? u.Activo) !== false && (u.activo ?? u.Activo) !== 0 && (u.activo ?? u.Activo) !== '0';

        const rolBadge = (rol === 'SUPERADMIN')
            ? `<span class="rol-usuario-sesion rol-superadmin" style="font-size: 10px; font-weight: 800;">⚡ SUPERADMIN</span>`
            : `<span class="rol-usuario-sesion rol-planillero" style="font-size: 10px; font-weight: 800;">⏱️ PLANILLERO</span>`;

        let torneoTexto = '<span style="color: #64748b; font-style: italic;">No aplica (Global)</span>';
        if (rol === 'PLANILLERO') {
            if (tNombre) {
                torneoTexto = `<strong style="color: #38bdf8;">${tNombre}</strong> <span style="font-size: 10px; color: #64748b;">(#${tId})</span>`;
            } else if (tId) {
                const torEncontrado = (state.torneos || []).find(t => (t.id || t.Id) == tId);
                const nombreTor = torEncontrado ? (torEncontrado.nombre || torEncontrado.Nombre) : `Torneo #${tId}`;
                torneoTexto = `<strong style="color: #38bdf8;">${nombreTor}</strong>`;
            } else {
                torneoTexto = '<span style="color: #f59e0b;">⚠️ Sin Asignar</span>';
            }
        }

        const estadoBadge = activo
            ? `<span class="badge-status badge-finalizado" style="font-size: 10.5px; padding: 2px 7px;">Activo</span>`
            : `<span class="badge-status badge-suspendido" style="font-size: 10.5px; padding: 2px 7px;">Inactivo</span>`;

        const esAdminPrincipal = (uId === 1 || username.toLowerCase() === 'admin');

        return `
            <tr>
                <td style="color: #888; font-weight: bold;">${index + 1}</td>
                <td><strong style="color: #fff;">${username}</strong></td>
                <td>${nombre}</td>
                <td>${rolBadge}</td>
                <td>${torneoTexto}</td>
                <td>${estadoBadge}</td>
                <td style="text-align: center; white-space: nowrap;">
                    <button class="btn-action-edit" onclick="editarUsuarioAdmin(${uId})" title="Editar usuario y rol" style="margin-right: 4px;">
                        ✏️ Editar
                    </button>
                    <button class="btn-secondary" onclick="cambiarPasswordUsuarioRapido(${uId}, '${username}')" title="Actualizar contraseña" style="font-size: 11px; padding: 4px 8px; margin-right: 4px;">
                        🔑 Clave
                    </button>
                    <button class="btn-secondary" onclick="alternarEstadoUsuarioAdmin(${uId}, ${activo ? 'false' : 'true'})" title="${activo ? 'Desactivar usuario' : 'Activar usuario'}" style="font-size: 11px; padding: 4px 8px; margin-right: 4px; color: ${activo ? '#f59e0b' : '#10b981'};">
                        ${activo ? '⏸️ Bloquear' : '▶️ Activar'}
                    </button>
                    ${esAdminPrincipal ? '' : `
                        <button class="btn-action-delete" onclick="eliminarUsuarioAdmin(${uId}, '${username}')" title="Eliminar usuario">
                            🗑️
                        </button>
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

function limpiarFormUsuario() {
    const inputId = document.getElementById('usuario-id');
    if (inputId) inputId.value = '';

    const inputUser = document.getElementById('usuario-username');
    if (inputUser) {
        inputUser.value = '';
        inputUser.disabled = false;
    }

    const inputNom = document.getElementById('usuario-nombre-completo');
    if (inputNom) inputNom.value = '';

    const inputPass = document.getElementById('usuario-password');
    if (inputPass) {
        inputPass.value = '';
        inputPass.required = true;
    }

    const selRol = document.getElementById('usuario-rol');
    if (selRol) selRol.value = 'PLANILLERO';

    const selTor = document.getElementById('usuario-torneo-asignar');
    if (selTor) selTor.value = '';

    const selActivo = document.getElementById('usuario-activo');
    if (selActivo) selActivo.value = '1';

    const labelHelp = document.getElementById('label-password-help');
    if (labelHelp) labelHelp.textContent = '';

    const btnSubmit = document.getElementById('btn-guardar-usuario');
    if (btnSubmit) btnSubmit.innerHTML = '💾 Guardar Usuario';

    const titulo = document.getElementById('titulo-form-usuario');
    if (titulo) titulo.innerHTML = '👤 Registrar Nuevo Usuario / Planillero';
}

function editarUsuarioAdmin(id) {
    const usuario = listaUsuariosAdmin.find(u => (u.id || u.Id) == id);
    if (!usuario) return;

    document.getElementById('usuario-id').value = id;
    document.getElementById('usuario-username').value = usuario.username || usuario.Username || '';
    document.getElementById('usuario-nombre-completo').value = usuario.nombreCompleto || usuario.NombreCompleto || '';
    
    const inputPass = document.getElementById('usuario-password');
    inputPass.value = '';
    inputPass.required = false;
    
    const labelHelp = document.getElementById('label-password-help');
    if (labelHelp) labelHelp.textContent = '(Opcional: déjala vacía para conservar la actual)';

    const rol = (usuario.rol || usuario.Rol || 'PLANILLERO').toUpperCase();
    document.getElementById('usuario-rol').value = rol;

    const selTor = document.getElementById('usuario-torneo-asignar');
    const tId = usuario.torneoId ?? usuario.TorneoId ?? '';
    if (selTor) selTor.value = tId;

    const activo = (usuario.activo ?? usuario.Activo) !== false && (usuario.activo ?? usuario.Activo) !== 0 && (usuario.activo ?? usuario.Activo) !== '0';
    document.getElementById('usuario-activo').value = activo ? '1' : '0';

    const btnSubmit = document.getElementById('btn-guardar-usuario');
    if (btnSubmit) btnSubmit.innerHTML = `💾 Actualizar Usuario #${id}`;

    const titulo = document.getElementById('titulo-form-usuario');
    if (titulo) titulo.innerHTML = `✏️ Editando Usuario: ${usuario.username || usuario.Username}`;

    document.getElementById('form-usuario-admin')?.scrollIntoView({ behavior: 'smooth' });
}

async function alternarEstadoUsuarioAdmin(id, nuevoEstado) {
    try {
        const payload = { activo: Boolean(nuevoEstado) };
        const res = await fetch(`${API_URL}/auth/usuarios/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.mensaje || 'Error al cambiar estado');
        }

        mostrarToast(`Usuario #${id} ${nuevoEstado ? 'activado' : 'bloqueado'} con éxito.`, 'exito');
        await cargarUsuariosAdmin();
    } catch (e) {
        console.error('Error al cambiar estado:', e);
        mostrarToast(e.message, 'error');
    }
}

async function cambiarPasswordUsuarioRapido(id, username) {
    const nuevaClave = prompt(`Ingresa la nueva contraseña para el usuario '${username}':`);
    if (nuevaClave === null) return;
    if (!nuevaClave.trim()) {
        mostrarToast('La contraseña no puede estar vacía.', 'error');
        return;
    }

    try {
        const payload = { password: nuevaClave.trim() };
        const res = await fetch(`${API_URL}/auth/usuarios/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.mensaje || 'Error al actualizar contraseña');
        }

        mostrarToast(`🔐 Contraseña de '${username}' actualizada exitosamente.`, 'exito');
    } catch (e) {
        console.error('Error actualizando contraseña:', e);
        mostrarToast(e.message, 'error');
    }
}

async function eliminarUsuarioAdmin(id, username) {
    const ok = await mostrarConfirmacionModal(
        `¿Estás seguro de eliminar permanentemente al usuario '${username}'?\nEsta acción no se puede deshacer.`,
        '🗑️ Eliminar Usuario'
    );
    if (!ok) return;

    try {
        const res = await fetch(`${API_URL}/auth/usuarios/${id}`, {
            method: 'DELETE'
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.mensaje || 'No se pudo eliminar el usuario');
        }

        mostrarToast(`Usuario '${username}' eliminado correctamente.`, 'exito');
        limpiarFormUsuario();
        await cargarUsuariosAdmin();
    } catch (e) {
        console.error('Error eliminando usuario:', e);
        mostrarToast(e.message, 'error');
    }
}

// Envío del Formulario de Usuario (Crear o Actualizar)
document.getElementById('form-usuario-admin')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('usuario-id').value;
    const username = document.getElementById('usuario-username').value.trim();
    const nombreCompleto = document.getElementById('usuario-nombre-completo').value.trim();
    const password = document.getElementById('usuario-password').value;
    const rol = document.getElementById('usuario-rol').value;
    const torneoIdVal = document.getElementById('usuario-torneo-asignar').value;
    const activoVal = document.getElementById('usuario-activo').value === '1';

    if (!username || !nombreCompleto) {
        mostrarToast('Por favor completa el usuario y nombre completo.', 'error');
        return;
    }

    if (!id && !password) {
        mostrarToast('La contraseña es obligatoria para nuevos usuarios.', 'error');
        return;
    }

    const torneoId = (rol === 'PLANILLERO' && torneoIdVal) ? parseInt(torneoIdVal) : null;

    try {
        let res;
        if (id) {
            const payloadPut = {
                username: username,
                nombreCompleto: nombreCompleto,
                rol: rol,
                torneoId: torneoId,
                activo: activoVal
            };
            if (password && password.trim()) {
                payloadPut.password = password.trim();
            }

            res = await fetch(`${API_URL}/auth/usuarios/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadPut)
            });
        } else {
            const payloadPost = {
                username: username,
                password: password.trim(),
                nombreCompleto: nombreCompleto,
                rol: rol,
                torneoId: torneoId,
                activo: activoVal
            };

            res = await fetch(`${API_URL}/auth/usuarios`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadPost)
            });
        }

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.mensaje || 'Error al procesar usuario.');
        }

        mostrarToast(id ? `Usuario '${username}' actualizado exitosamente.` : `Usuario '${username}' creado con éxito.`, 'exito');
        limpiarFormUsuario();
        await cargarUsuariosAdmin();
    } catch (err) {
        console.error('Error guardando usuario:', err);
        mostrarToast(err.message, 'error');
    }
});

// Evento para deshabilitar selector de torneo si el rol es SUPERADMIN
document.getElementById('usuario-rol')?.addEventListener('change', (e) => {
    const rol = e.target.value;
    const grupoTorneo = document.getElementById('grupo-torneo-asignado');
    const selTorneo = document.getElementById('usuario-torneo-asignar');
    if (rol === 'SUPERADMIN') {
        if (selTorneo) selTorneo.value = '';
        if (grupoTorneo) grupoTorneo.style.opacity = '0.4';
    } else {
        if (grupoTorneo) grupoTorneo.style.opacity = '1';
    }
});

window.cargarUsuariosAdmin = cargarUsuariosAdmin;
window.limpiarFormUsuario = limpiarFormUsuario;
window.editarUsuarioAdmin = editarUsuarioAdmin;
window.alternarEstadoUsuarioAdmin = alternarEstadoUsuarioAdmin;
window.cambiarPasswordUsuarioRapido = cambiarPasswordUsuarioRapido;
window.eliminarUsuarioAdmin = eliminarUsuarioAdmin;

