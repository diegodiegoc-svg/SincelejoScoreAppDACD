// Detección automática de entorno (Local vs Producción)
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5291/api'
    : 'https://apisincelejoscore-production.up.railway.app/api';

let listaDeportes = [];
let listaTorneos = [];
let listaPartidos = [];
let listaEquipos = [];
let listaCanchas = [];

let deporteSeleccionado = null;
let torneoSeleccionadoId = null;
let filtroEstadoActivo = 'TODOS';
let textoBusqueda = '';
let partidoAbiertoId = null;
let partidoAbiertoObj = null;
let pollingInterval = null;

// Control de fecha seleccionada (formato 'YYYY-MM-DD')
let fechaSeleccionadaStr = '';

document.addEventListener('DOMContentLoaded', () => {
    configurarEventosTabs();
    configurarEventosModalPartido();
    configurarFiltrosEstado();
    configurarBuscador();
    inicializarFechaYCarrusel();
    inicializar();
});

function obtenerFechaLocalISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function inicializarFechaYCarrusel() {
    const hoy = new Date();
    fechaSeleccionadaStr = obtenerFechaLocalISO(hoy);

    renderizarCarruselFechas(hoy);

    const btnPrev = document.getElementById('btn-carousel-prev');
    const btnNext = document.getElementById('btn-carousel-next');
    const container = document.getElementById('date-carousel-container');

    if (btnPrev && container) {
        btnPrev.onclick = () => container.scrollBy({ left: -180, behavior: 'smooth' });
    }
    if (btnNext && container) {
        btnNext.onclick = () => container.scrollBy({ left: 180, behavior: 'smooth' });
    }
}

function renderizarCarruselFechas(fechaReferencia) {
    const container = document.getElementById('date-carousel-container');
    if (!container) return;
    container.innerHTML = '';

    const hoyStr = obtenerFechaLocalISO(fechaReferencia);
    const nombresDias = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SÁ'];

    let elementoHoy = null;

    // Generar 15 días: de -7 hasta +7
    for (let offset = -7; offset <= 7; offset++) {
        const dia = new Date(fechaReferencia);
        dia.setDate(fechaReferencia.getDate() + offset);

        const fechaIso = obtenerFechaLocalISO(dia);
        const esHoy = fechaIso === hoyStr;

        const diaSemana = nombresDias[dia.getDay()];
        const diaNum = String(dia.getDate()).padStart(2, '0');
        const mesNum = String(dia.getMonth() + 1).padStart(2, '0');

        const item = document.createElement('div');
        item.className = 'date-item';
        if (esHoy) item.classList.add('is-today');
        if (fechaIso === fechaSeleccionadaStr) item.classList.add('active');
        item.setAttribute('data-fecha', fechaIso);

        item.innerHTML = `
            <span class="day-name">${esHoy ? 'HOY' : diaSemana}</span>
            <span class="day-num">${diaNum}.${mesNum}.</span>
        `;

        item.onclick = () => {
            document.querySelectorAll('.date-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            fechaSeleccionadaStr = fechaIso;
            actualizarTituloSeccion(esHoy, `${diaNum}.${mesNum}`);

            if (torneoSeleccionadoId) {
                cargarPartidosSubvista();
            } else if (deporteSeleccionado) {
                const depId = obtenerPropiedad(deporteSeleccionado, ['id', 'Id']);
                renderizarTorneos(depId);
            }
        };

        if (esHoy) elementoHoy = item;
        container.appendChild(item);
    }

    // Centrar suavemente en HOY
    if (elementoHoy) {
        setTimeout(() => {
            elementoHoy.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
        }, 100);
    }
}

function actualizarTituloSeccion(esHoy, fechaCorta) {
    const titulo = document.getElementById('titulo-seccion-torneos');
    if (!titulo) return;
    if (esHoy) {
        titulo.innerText = 'TORNEOS CON PARTIDOS HOY';
    } else {
        titulo.innerText = `TORNEOS CON PARTIDOS (${fechaCorta})`;
    }
}

// Determina si un partido tiene fecha/hora pendiente o placeholder (Por Definir)
function esFechaPorDefinir(partidoOFecha) {
    if (!partidoOFecha) return true;
    let raw = partidoOFecha;
    if (typeof partidoOFecha === 'object') {
        raw = obtenerPropiedad(partidoOFecha, ['fechaHora', 'FechaHora', 'fecha_hora', 'fecha', 'Fecha', 'fechaPartido']);
    }
    if (!raw) return true;
    const str = String(raw).trim();
    return str.startsWith('2099') || str.startsWith('1970') || str.startsWith('0001') || str.toUpperCase().includes('DEFINIR') || str.toUpperCase().includes('TBD');
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

// Extrae 'YYYY-MM-DD' de la propiedad fecha del partido (los partidos 'Por Definir' devuelven vacío para no aparecer en carruseles diarios)
function extraerFechaPartido(partido) {
    if (esFechaPorDefinir(partido)) return '';
    const rawFecha = obtenerPropiedad(partido, ['fechaHora', 'FechaHora', 'fecha_hora', 'fecha', 'Fecha', 'fechaPartido']);
    if (!rawFecha) return '';
    const str = String(rawFecha).trim();
    if (str.includes('T')) return str.split('T')[0];
    if (str.includes(' ')) return str.split(' ')[0];
    return str.substring(0, 10);
}

function obtenerNombreCancha(canchaId) {
    if (!canchaId) return 'Sede por definir';
    const c = listaCanchas.find(item => {
        const id = obtenerPropiedad(item, ['id', 'Id']);
        return String(id) === String(canchaId);
    });
    return c ? (obtenerPropiedad(c, ['nombre', 'Nombre']) || `Cancha #${canchaId}`) : `Cancha #${canchaId}`;
}

function extraerHoraPartido(partido) {
    if (esFechaPorDefinir(partido)) return '';
    const raw = obtenerPropiedad(partido, ['fechaHora', 'FechaHora', 'fecha_hora']);
    if (!raw) return '';
    const str = String(raw).trim();
    if (str.length >= 16) {
        if (str.includes('T')) {
            return str.substring(11, 16);
        } else if (str.includes(' ')) {
            const parts = str.split(' ');
            if (parts[1] && parts[1].length >= 5) {
                return parts[1].substring(0, 5);
            }
        }
    }
    return '';
}

async function inicializar() {
    const container = document.getElementById('torneos-container');
    try {
        const [resDep, resTor, resPart, resEq, resCan] = await Promise.all([
            fetch(`${API_URL}/deportes`),
            fetch(`${API_URL}/torneos`),
            fetch(`${API_URL}/partidos`),
            fetch(`${API_URL}/equipos`),
            fetch(`${API_URL}/canchas`)
        ]);

        listaDeportes = await resDep.json();
        listaTorneos = await resTor.json();
        listaPartidos = await resPart.json();
        listaEquipos = await resEq.json();
        listaCanchas = await resCan.json();

        if (listaDeportes.length === 0) {
            container.innerHTML = '<p class="loading">No hay deportes registrados en el sistema.</p>';
            return;
        }

        // Seleccionar Fútbol por defecto para mostrar de inmediato los partidos en vivo
        const deporteFutbol = listaDeportes.find(d => {
            const nom = (obtenerPropiedad(d, ['nombre', 'Nombre']) || '').toLowerCase();
            return nom.includes('fútbol') || nom.includes('futbol');
        });
        deporteSeleccionado = deporteFutbol || listaDeportes[0];
        renderizarBarraDeportes();
        
        const primerDeporteId = obtenerPropiedad(deporteSeleccionado, ['id', 'Id']);
        seleccionarDeporte(primerDeporteId);

        iniciarPollingSilencioso();

    } catch (error) {
        console.error('Error al inicializar app:', error);
        container.innerHTML = '<p class="loading" style="color: #ff4444;">Error conectando con el servidor. Verifica que el backend esté corriendo.</p>';
    }
}

function obtenerPropiedad(objeto, nombresPosibles) {
    if (!objeto || typeof objeto !== 'object') return null;
    for (let nombre of nombresPosibles) {
        if (objeto[nombre] !== undefined && objeto[nombre] !== null) {
            return objeto[nombre];
        }
    }
    const keys = Object.keys(objeto);
    for (let nombre of nombresPosibles) {
        const cleanName = String(nombre).replace(/_/g, '').toLowerCase();
        const foundKey = keys.find(k => k.replace(/_/g, '').toLowerCase() === cleanName);
        if (foundKey && objeto[foundKey] !== undefined && objeto[foundKey] !== null) {
            return objeto[foundKey];
        }
    }
    return null;
}

function obtenerNombreEquipo(equipoId) {
    const eq = listaEquipos.find(e => String(obtenerPropiedad(e, ['id', 'Id'])) === String(equipoId));
    return eq ? obtenerPropiedad(eq, ['nombre', 'Nombre']) : `Equipo ${equipoId}`;
}

const extraerEquipoIdJugador = (j) => {
    if (!j) return null;
    return j.equipoId ?? j.idEquipo ?? j.equipo_id ?? j.id_equipo ?? j.EquipoId ?? j.IdEquipo ?? (j.equipo && (j.equipo.id || j.equipo.Id || j.equipo.equipoId || j.equipo.EquipoId)) ?? null;
};
window.extraerEquipoIdJugador = extraerEquipoIdJugador;

async function refrescarPartidosSilencioso() {
    if (document.hidden) return;

    try {
        const res = await fetch(`${API_URL}/partidos`);
        if (!res.ok) return;
        const nuevosPartidos = await res.json();

        let huboCambios = (nuevosPartidos.length !== listaPartidos.length);
        const partidosModificadosIds = [];

        nuevosPartidos.forEach(nuevo => {
            const nId = obtenerPropiedad(nuevo, ['id', 'Id']);
            const viejo = listaPartidos.find(p => String(obtenerPropiedad(p, ['id', 'Id'])) === String(nId));

            if (viejo) {
                const ptsLocalViejo = obtenerPropiedad(viejo, ['puntos_Local', 'puntos_local', 'puntosLocal']);
                const ptsVisitViejo = obtenerPropiedad(viejo, ['puntos_Visitante', 'puntos_visitante', 'puntosVisitante']);
                const estViejo = (obtenerPropiedad(viejo, ['estado', 'Estado']) || '').toUpperCase();
                const detViejo = (obtenerPropiedad(viejo, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || '').toUpperCase();
                const minViejo = obtenerPropiedad(viejo, ['minutoActual', 'minuto_actual', 'MinutoActual']);

                const ptsLocalNuevo = obtenerPropiedad(nuevo, ['puntos_Local', 'puntos_local', 'puntosLocal']);
                const ptsVisitNuevo = obtenerPropiedad(nuevo, ['puntos_Visitante', 'puntos_visitante', 'puntosVisitante']);
                const estNuevo = (obtenerPropiedad(nuevo, ['estado', 'Estado']) || '').toUpperCase();
                const detNuevo = (obtenerPropiedad(nuevo, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || '').toUpperCase();
                const minNuevo = obtenerPropiedad(nuevo, ['minutoActual', 'minuto_actual', 'MinutoActual']);

                const cambioPuntos = (Number(ptsLocalViejo) !== Number(ptsLocalNuevo) || Number(ptsVisitViejo) !== Number(ptsVisitNuevo));
                const cambioEstado = (estViejo !== estNuevo || detViejo !== detNuevo);
                const cambioMinuto = (String(minViejo ?? '') !== String(minNuevo ?? ''));
                const estaEnJuego = (estNuevo === 'EN_JUEGO' || estNuevo === 'EN VIVO');

                if (cambioPuntos || cambioEstado || cambioMinuto || estaEnJuego) {
                    huboCambios = true;
                    partidosModificadosIds.push(nId);
                }
            } else {
                huboCambios = true;
                partidosModificadosIds.push(nId);
            }
        });

        if (huboCambios) {
            listaPartidos = nuevosPartidos;

            if (torneoSeleccionadoId) {
                const subvistaPartidos = document.getElementById('subvista-partidos');
                if (subvistaPartidos && !subvistaPartidos.classList.contains('hidden')) {
                    cargarPartidosSubvista(partidosModificadosIds);
                }
                const subvistaClasif = document.getElementById('subvista-clasificacion');
                if (subvistaClasif && !subvistaClasif.classList.contains('hidden')) {
                    cargarClasificacionSubvista();
                }
                const subvistaGoleadores = document.getElementById('subvista-goleadores');
                if (subvistaGoleadores && !subvistaGoleadores.classList.contains('hidden')) {
                    cargarGoleadoresSubvista();
                }
                const subvistaFixture = document.getElementById('subvista-fixture');
                if (subvistaFixture && !subvistaFixture.classList.contains('hidden')) {
                    cargarFixtureSubvista(partidosModificadosIds);
                }
                const subvistaCuadro = document.getElementById('subvista-cuadro');
                if (subvistaCuadro && !subvistaCuadro.classList.contains('hidden')) {
                    cargarCuadroSubvista();
                }
                verificarVisibilidadTabCuadro(torneoSeleccionadoId);
            } else if (deporteSeleccionado) {
                const depId = obtenerPropiedad(deporteSeleccionado, ['id', 'Id']);
                renderizarTorneos(depId);
            }

            if (partidoAbiertoId && partidosModificadosIds.includes(partidoAbiertoId)) {
                const pActualizado = listaPartidos.find(p => String(obtenerPropiedad(p, ['id', 'Id'])) === String(partidoAbiertoId));
                if (pActualizado) {
                    abrirDetallePartido(pActualizado);
                }
            }
        }
    } catch {
        // Silencioso
    }
}

function iniciarPollingSilencioso() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(refrescarPartidosSilencioso, 10000);

    if (!window._visibilityListenerAttached) {
        window._visibilityListenerAttached = true;
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                refrescarPartidosSilencioso();
            }
        });
    }
}

function configurarBuscador() {
    const input = document.getElementById('input-busqueda');
    const btnClear = document.getElementById('btn-limpiar-busqueda');

    if (!input || !btnClear) return;

    input.addEventListener('input', (e) => {
        textoBusqueda = e.target.value.trim().toLowerCase();
        btnClear.classList.toggle('hidden', textoBusqueda.length === 0);

        if (torneoSeleccionadoId) {
            cargarPartidosSubvista();
        } else if (deporteSeleccionado) {
            const depId = obtenerPropiedad(deporteSeleccionado, ['id', 'Id']);
            renderizarTorneos(depId);
        }
    });

    btnClear.onclick = () => {
        input.value = '';
        textoBusqueda = '';
        btnClear.classList.add('hidden');
        if (torneoSeleccionadoId) {
            cargarPartidosSubvista();
        } else if (deporteSeleccionado) {
            const depId = obtenerPropiedad(deporteSeleccionado, ['id', 'Id']);
            renderizarTorneos(depId);
        }
    };
}

function configurarEventosTabs() {
    document.getElementById('btn-volver').onclick = volverAListaTorneos;

    const tabPartidos = document.getElementById('tab-partidos');
    const tabClasificacion = document.getElementById('tab-clasificacion');
    const tabGoleadores = document.getElementById('tab-goleadores');
    const tabFixture = document.getElementById('tab-fixture');
    const tabCuadro = document.getElementById('tab-cuadro');

    if (tabPartidos) tabPartidos.onclick = () => cambiarSubTab('partidos');
    if (tabClasificacion) tabClasificacion.onclick = () => cambiarSubTab('clasificacion');
    if (tabGoleadores) tabGoleadores.onclick = () => cambiarSubTab('goleadores');
    if (tabFixture) tabFixture.onclick = () => cambiarSubTab('fixture');
    if (tabCuadro) tabCuadro.onclick = () => cambiarSubTab('cuadro');

    const btnCerrarNomina = document.getElementById('btn-cerrar-modal');
    if (btnCerrarNomina) {
        btnCerrarNomina.onclick = () => {
            document.getElementById('modal-equipo').classList.add('hidden');
        };
    }

    const btnCerrarJugador = document.getElementById('btn-cerrar-modal-jugador');
    if (btnCerrarJugador) {
        btnCerrarJugador.onclick = () => {
            document.getElementById('modal-jugador-ficha').classList.add('hidden');
        };
    }
}

function configurarEventosModalPartido() {
    const modalPartido = document.getElementById('modal-partido');
    const modalEquipo = document.getElementById('modal-equipo');
    const modalJugador = document.getElementById('modal-jugador-ficha');

    const btnCerrarPartido = document.getElementById('btn-cerrar-modal-partido');
    if (btnCerrarPartido) {
        btnCerrarPartido.onclick = () => {
            if (modalPartido) {
                modalPartido.classList.add('hidden');
                partidoAbiertoId = null;
            }
        };
    }

    // Cierre táctil y por clic en el fondo oscuro exterior (overlay backdrop) para todos los modales
    [modalPartido, modalEquipo, modalJugador].forEach(modal => {
        if (!modal) return;
        const cerrarAlTocarFondo = (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
                if (modal === modalPartido) partidoAbiertoId = null;
            }
        };
        modal.addEventListener('click', cerrarAlTocarFondo);
        modal.addEventListener('touchend', cerrarAlTocarFondo);
    });

    const btnEventos = document.getElementById('btn-tab-eventos');
    const btnAlineaciones = document.getElementById('btn-tab-alineaciones');

    if (btnEventos && btnAlineaciones) {
        btnEventos.onclick = () => {
            btnEventos.classList.add('active');
            btnAlineaciones.classList.remove('active');
            document.getElementById('match-content-eventos').classList.remove('hidden');
            document.getElementById('match-content-alineaciones').classList.add('hidden');
        };

        btnAlineaciones.onclick = () => {
            btnAlineaciones.classList.add('active');
            btnEventos.classList.remove('active');
            document.getElementById('match-content-alineaciones').classList.remove('hidden');
            document.getElementById('match-content-eventos').classList.add('hidden');
        };
    }
}

function configurarFiltrosEstado() {
    const botonesFiltro = document.querySelectorAll('.filter-status-btn');
    botonesFiltro.forEach(btn => {
        btn.onclick = (e) => {
            botonesFiltro.forEach(b => b.classList.remove('active'));
            const objetivo = e.currentTarget;
            objetivo.classList.add('active');
            filtroEstadoActivo = objetivo.getAttribute('data-filter');
            cargarPartidosSubvista();
        };
    });
}

function renderizarBarraDeportes() {
    const sportsBar = document.getElementById('sports-bar');
    if (!sportsBar) return;
    sportsBar.innerHTML = '';

    const depSeleccionadoId = deporteSeleccionado ? obtenerPropiedad(deporteSeleccionado, ['id', 'Id']) : null;

    listaDeportes.forEach((deporte) => {
        const idDeporte = obtenerPropiedad(deporte, ['id', 'Id']);
        const nombreDeporte = obtenerPropiedad(deporte, ['nombre', 'Nombre']);

        const btn = document.createElement('button');
        const esActivo = depSeleccionadoId ? String(idDeporte) === String(depSeleccionadoId) : false;
        btn.className = esActivo ? 'sport-btn active' : 'sport-btn';
        btn.setAttribute('data-id', idDeporte);
        btn.textContent = nombreDeporte;
        btn.onclick = () => {
            seleccionarDeporte(idDeporte);
        };
        sportsBar.appendChild(btn);
    });
}

function seleccionarDeporte(deporteId) {
    const dep = listaDeportes.find(d => String(obtenerPropiedad(d, ['id', 'Id'])) === String(deporteId));
    if (dep) deporteSeleccionado = dep;

    document.querySelectorAll('.sport-btn').forEach(b => {
        if (String(b.getAttribute('data-id')) === String(deporteId)) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });

    volverAListaTorneos();
    renderizarTorneos(deporteId);
}

// Muestra SOLO los torneos que tienen partidos en la fecha seleccionada
function renderizarTorneos(deporteId) {
    const container = document.getElementById('torneos-container');
    container.innerHTML = '';

    // 1. Torneos que pertenecen a este deporte
    let torneosDelDeporte = listaTorneos.filter(torneo => {
        const depId = obtenerPropiedad(torneo, ['deporte_Id', 'deporte_id', 'Deporte_Id', 'deporteId', 'DeporteId']);
        return String(depId) === String(deporteId);
    });

    // 2. Filtro por búsqueda de texto
    if (textoBusqueda) {
        torneosDelDeporte = torneosDelDeporte.filter(torneo => {
            const nom = (obtenerPropiedad(torneo, ['nombre', 'Nombre']) || '').toLowerCase();
            return nom.includes(textoBusqueda);
        });
    }

    // 3. Filtro por fecha seleccionada
    torneosDelDeporte = torneosDelDeporte.filter(torneo => {
        const tId = obtenerPropiedad(torneo, ['id', 'Id', 'torneoId', 'TorneoId']);
        
        return listaPartidos.some(p => {
            const pTorneoId = obtenerPropiedad(p, ['torneoId', 'TorneoId', 'torneo_id', 'torneo_Id', 'Torneo_Id']);
            const fechaP = extraerFechaPartido(p);
            
            return String(pTorneoId) === String(tId) && fechaP === fechaSeleccionadaStr;
        });
    });

    if (torneosDelDeporte.length === 0) {
        container.innerHTML = `<p class="loading">No hay partidos programados en esta fecha para este deporte.</p>`;
        return;
    }

    torneosDelDeporte.forEach(torneo => {
        const torneoId = obtenerPropiedad(torneo, ['id', 'Id', 'torneoId', 'TorneoId']);
        const nombreTorneo = obtenerPropiedad(torneo, ['nombre', 'Nombre']);

        const partidosTorneoHoy = listaPartidos.filter(p => {
            const pTorneoId = obtenerPropiedad(p, ['torneoId', 'TorneoId', 'torneo_id', 'torneo_Id', 'Torneo_Id']);
            const fechaP = extraerFechaPartido(p);
            return String(pTorneoId) === String(torneoId) && fechaP === fechaSeleccionadaStr;
        });

        const tieneEnVivo = partidosTorneoHoy.some(p => {
            const st = (obtenerPropiedad(p, ['estado', 'Estado']) || '').toUpperCase();
            return st === 'EN_JUEGO' || st === 'EN VIVO' || st === 'JUGANDO';
        });

        const liveBadgeTorneo = tieneEnVivo 
            ? `<span style="background: #e11d48; color: #fff; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">🔴 EN VIVO</span>` 
            : '';

        const bloqueTorneo = document.createElement('div');
        bloqueTorneo.style.marginBottom = '20px';

        const torneoCard = document.createElement('div');
        torneoCard.className = 'torneo-header-clickable';
        torneoCard.onclick = () => verDetalleTorneo(torneoId, nombreTorneo);
        torneoCard.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-weight: bold; color: #ff0044;">🏆 ${nombreTorneo}</span>
                ${liveBadgeTorneo}
            </div>
            <span style="font-size: 12px; color: #8d8d99;">Ver tabla / clasificación →</span>
        `;
        bloqueTorneo.appendChild(torneoCard);

        // Contenedor con los partidos del torneo para verlos de inmediato (estilo Flashscore)
        const partidosContainer = document.createElement('div');
        partidosTorneoHoy.forEach(p => {
            const card = crearMatchCard(p);
            partidosContainer.appendChild(card);
        });
        bloqueTorneo.appendChild(partidosContainer);

        container.appendChild(bloqueTorneo);
    });
}

// Helper público para extraer datos de tanda de penales en Fútbol
function extraerPenalesPartido(partido) {
    if (!partido) return null;
    const pId = obtenerPropiedad(partido, ['id', 'Id']);

    // 1. Propiedades directas del objeto partido
    const penLoc = obtenerPropiedad(partido, ['penales_local', 'penalesLocal', 'penales_Local']);
    const penVis = obtenerPropiedad(partido, ['penales_visitante', 'penalesVisitante', 'penales_Visitante']);
    if (penLoc !== null && penLoc !== undefined && penVis !== null && penVis !== undefined && !isNaN(penLoc) && !isNaN(penVis)) {
        return { local: Number(penLoc), visitante: Number(penVis) };
    }

    // 2. Persistencia en localStorage por ID de partido
    if (pId) {
        try {
            const raw = localStorage.getItem(`partido_penales_${pId}`);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.penales_local !== undefined && parsed.penales_visitante !== undefined && !isNaN(parsed.penales_local) && !isNaN(parsed.penales_visitante)) {
                    return { local: Number(parsed.penales_local), visitante: Number(parsed.penales_visitante) };
                }
            }
        } catch (e) {}
    }

    // 3. Extracción desde estadoDetalle (ej. "FINALIZADO (PEN. 4-3)")
    const estDet = (obtenerPropiedad(partido, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || '').toUpperCase();
    const m = estDet.match(/PEN\.?\s*(\d+)\s*[-:]\s*(\d+)/i);
    if (m) {
        return { local: Number(m[1]), visitante: Number(m[2]) };
    }

    // 4. Persistencia por llave de playoff tiebreak
    const tId = obtenerPropiedad(partido, ['torneo_Id', 'torneo_id', 'Torneo_Id', 'torneoId']) || torneoSeleccionadoId;
    const fId = Number(obtenerPropiedad(partido, ['faseId', 'fase_id', 'FaseId']) || 0);
    const jNum = Number(obtenerPropiedad(partido, ['jornada', 'Jornada']) || 1);
    if (tId && fId) {
        try {
            const rawTb = localStorage.getItem(`playoff_tiebreak_${tId}_${fId}_${jNum}`);
            if (rawTb) {
                const parsedTb = JSON.parse(rawTb);
                if (parsedTb && parsedTb.penales_local !== undefined && parsedTb.penales_visitante !== undefined && !isNaN(parsedTb.penales_local) && !isNaN(parsedTb.penales_visitante)) {
                    return { local: Number(parsedTb.penales_local), visitante: Number(parsedTb.penales_visitante) };
                }
                if (parsedTb && parsedTb.penales) {
                    const parts = String(parsedTb.penales).split('-');
                    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                        return { local: Number(parts[0]), visitante: Number(parts[1]) };
                    }
                }
            }
        } catch (e) {}
    }

    return null;
}

function crearMatchCard(p, partidosModificados = []) {
    const pId = obtenerPropiedad(p, ['id', 'Id']);
    const eqLocalId = obtenerPropiedad(p, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
    const eqVisitanteId = obtenerPropiedad(p, ['equipo_Visitante_Id', 'equipo_visitante_id', 'equipoVisitanteId']);
    
    const nomLocal = obtenerNombreEquipo(eqLocalId);
    const nomVisitante = obtenerNombreEquipo(eqVisitanteId);

    let ptsLocal = obtenerPropiedad(p, ['puntos_Local', 'puntos_local', 'puntosLocal']) ?? 0;
    let ptsVisitante = obtenerPropiedad(p, ['puntos_Visitante', 'puntos_visitante', 'puntosVisitante']) ?? 0;
    const horaStr = extraerHoraPartido(p) || 'Hora por def.';
    const cId = obtenerPropiedad(p, ['canchaId', 'cancha_id', 'CanchaId']);
    const nombreCancha = obtenerNombreCancha(cId);
    const estadoRaw = (obtenerPropiedad(p, ['estado', 'Estado']) || 'PROGRAMADO').toUpperCase();
    const fechaStr = extraerFechaPartido(p) || '';
    const diaMes = fechaStr ? `${fechaStr.substring(8, 10)}.${fechaStr.substring(5, 7)}` : '';

    const fechaHoraVal = obtenerPropiedad(p, ['fechaHora', 'fecha_hora', 'FechaHora']);
    const esFechaDefinida = fechaHoraVal && !fechaHoraVal.startsWith('2099');
    const dtLocal = parsearFechaHoraLocal(fechaHoraVal);
    const yaPasoHora = esFechaDefinida && dtLocal && (dtLocal.getTime() <= (Date.now() - 60000));
    const esNoIniciado = (estadoRaw === 'PROGRAMADO' || estadoRaw === 'PENDIENTE' || !estadoRaw);
    const estadoDetalleCard = (obtenerPropiedad(p, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || '').toUpperCase();
    const esFinalizadoPrevio = (estadoRaw === 'FINALIZADO' || estadoRaw === 'TERMINADO' || estadoDetalleCard === 'FINALIZADO');
    const estaRetrasado = (!esFinalizadoPrevio && estadoRaw !== 'EN_JUEGO' && estadoRaw !== 'EN VIVO' && estadoRaw !== 'JUGANDO') &&
        (esFechaDefinida ? (yaPasoHora && (estadoRaw === 'RETRASADO' || estadoDetalleCard === 'RETRASADO' || esNoIniciado)) : (estadoRaw === 'RETRASADO' || estadoDetalleCard === 'RETRASADO'));
    const estaSuspendido = (estadoRaw === 'SUSPENDIDO') || (estadoDetalleCard === 'SUSPENDIDO');

    const depActual = (obtenerPropiedad(deporteSeleccionado, ['nombre', 'Nombre']) || '');
    const depNombreCard = obtenerNombreDeportePartido(p);
    const esBeisbolOSoftbol = depNombreCard.includes('BEISBOL') || depNombreCard.includes('BÉISBOL') || depNombreCard.includes('SOFTBOL');
    const esVoleibol = depNombreCard.includes('VOLEIBOL') || depNombreCard.includes('VOLLEY');
    const tiempoVivo = calcularTiempoEnVivo(p, depActual || depNombreCard);

    // Normalización estricta para Voleibol: máximo 3 sets por equipo y no empate 3-3
    if (esVoleibol) {
        ptsLocal = Math.min(3, Math.max(0, Number(ptsLocal)));
        ptsVisitante = Math.min(3, Math.max(0, Number(ptsVisitante)));
        if (ptsLocal === 3 && ptsVisitante === 3) ptsVisitante = 2;
    }

    let textoEnVivo = tiempoVivo || 'EN VIVO';
    if (esVoleibol && (estadoRaw === 'EN_JUEGO' || estadoRaw === 'EN VIVO' || estadoRaw === 'JUGANDO')) {
        let vSets = null;
        try {
            const raw = localStorage.getItem(`volley_sets_${pId}`);
            if (raw) vSets = JSON.parse(raw);
        } catch (e) {}

        const estadoDet = (obtenerPropiedad(p, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || 'SET 1').toUpperCase();
        let setK = '1';
        const m = estadoDet.match(/(\d+)/);
        if (m) setK = m[1];

        const ptsL = (vSets && vSets[setK]) ? vSets[setK].loc : 0;
        const ptsV = (vSets && vSets[setK]) ? vSets[setK].vis : 0;
        textoEnVivo = `Set ${setK}: ${ptsL} - ${ptsV}`;
    }

    let badgeBatLocal = '';
    let badgeBatVisit = '';
    const outs = (esBeisbolOSoftbol && (estadoRaw === 'EN_JUEGO' || estadoRaw === 'EN VIVO' || estadoRaw === 'JUGANDO') && p.minutoActual !== null && p.minutoActual !== undefined) ? Math.min(2, Math.max(0, Number(p.minutoActual))) : 0;

    if (esBeisbolOSoftbol && (estadoRaw === 'EN_JUEGO' || estadoRaw === 'EN VIVO' || estadoRaw === 'JUGANDO')) {
        const estadoDet = (obtenerPropiedad(p, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || '').toUpperCase();
        const esBaja = estadoDet.includes('BAJA') || estadoDet.includes('▼');
        if (esBaja) {
            badgeBatLocal = ' <span title="Al Bate" style="font-size: 11px;">🏏</span>';
            badgeBatVisit = ' <span title="Lanzando" style="font-size: 11px;">⚾</span>';
        } else {
            badgeBatLocal = ' <span title="Lanzando" style="font-size: 11px;">⚾</span>';
            badgeBatVisit = ' <span title="Al Bate" style="font-size: 11px;">🏏</span>';
        }
    }

    const esFinalizado = (estadoRaw === 'FINALIZADO' || estadoRaw === 'TERMINADO' || estadoDetalleCard === 'FINALIZADO');
    const esMicroCard = depNombreCard.includes('MICRO') || depNombreCard.includes('SALÓN') || depNombreCard.includes('SALON');
    const esFutbolCard = !esMicroCard && !esBeisbolOSoftbol && !esVoleibol && !depNombreCard.includes('BALONCESTO') && !depNombreCard.includes('BASKET');
    const esFutbolOMicroCard = esFutbolCard || esMicroCard;
    const datosPenalesCard = (esFutbolOMicroCard && esFinalizado) ? extraerPenalesPartido(p) : null;
    const tienePenalesCard = datosPenalesCard !== null && datosPenalesCard.local !== null && datosPenalesCard.visitante !== null && !isNaN(datosPenalesCard.local) && !isNaN(datosPenalesCard.visitante);

    let badgeDerecha = '';
    if (esFinalizado) {
        let detalleFinal = 'FINALIZADO';
        const minAct = Number(obtenerPropiedad(p, ['minutoActual', 'minuto_actual', 'MinutoActual']) || 0);
        if (estadoDetalleCard.includes('PENAL') || tienePenalesCard) {
            detalleFinal = 'FINAL (PEN.)';
        } else if (estadoDetalleCard.includes('OT') || estadoDetalleCard.includes('OVERTIME') || (minAct > 40 && depNombreCard.includes('BALONCESTO'))) {
            detalleFinal = 'FINAL (OT)';
        }
        badgeDerecha = `
            <div style="text-align: right;">
                <span class="badge-status badge-finalizado" style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #10b981; font-weight: 800; font-size: 9px; padding: 2px 5px; border-radius: 4px; display: inline-block;">
                    ${detalleFinal}
                </span>
            </div>`;
    } else if (estaSuspendido) {
        const minVal = obtenerPropiedad(p, ['minutoActual', 'minuto_actual', 'MinutoActual']);
        const minStr = (minVal !== null && minVal !== undefined && minVal !== '') ? ` (${minVal}')` : '';
        badgeDerecha = `
            <div style="text-align: right;">
                <span class="badge-status badge-suspendido" style="background: rgba(217, 119, 6, 0.2); border: 1px solid #d97706; color: #fbbf24; font-weight: 800; font-size: 9px; padding: 2px 5px; border-radius: 4px; display: inline-block;">
                    ⚠️ SUSPENDIDO${minStr}
                </span>
            </div>`;
    } else if (estadoRaw === 'EN_JUEGO' || estadoRaw === 'EN VIVO' || estadoRaw === 'JUGANDO') {
        let badgeBg = '#e11d48';
        if (textoEnVivo.includes('PAUSA EXTRA TIEMPO') || estadoDetalleCard === 'PAUSA EXTRA TIEMPO') {
            badgeBg = '#7c3aed';
        } else if (textoEnVivo.includes('ENTRETIEMPO') || textoEnVivo.includes('DESCANSO') || textoEnVivo.includes('PAUSA') || textoEnVivo.includes('T. MUERTO')) {
            badgeBg = '#d97706';
        } else if (textoEnVivo.includes('OT') || textoEnVivo.includes('PRÓRROGA') || textoEnVivo.includes('PRORROGA')) {
            badgeBg = '#7c3aed';
        } else if (textoEnVivo.includes('PENAL')) {
            badgeBg = '#db2777';
        }

        const textoDisplay = (estadoDetalleCard === 'PAUSA EXTRA TIEMPO' || textoEnVivo.includes('PAUSA EXTRA TIEMPO'))
            ? '⏸ PAUSA EXTRA TIEMPO'
            : `🔴 ${textoEnVivo}`;

        badgeDerecha = `
            <div style="text-align: right;">
                <span style="background: ${badgeBg}; color: #fff; padding: 2px 5px; border-radius: 4px; font-size: 9px; font-weight: 800; display: inline-block;">
                    ${textoDisplay}
                </span>
                ${esBeisbolOSoftbol ? `
                <div style="display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 4px;">
                    <span style="font-size: 10px; font-weight: 800; color: #a1a1aa;">OUTS:</span>
                    <span class="out-dot ${outs >= 1 ? 'active' : ''}" style="width: 8px; height: 8px;"></span>
                    <span class="out-dot ${outs >= 2 ? 'active' : ''}" style="width: 8px; height: 8px;"></span>
                    <span class="out-dot ${outs >= 3 ? 'active' : ''}" style="width: 8px; height: 8px;"></span>
                    <span style="font-size: 10px; font-weight: 800; color: #ffeb3b; font-family: monospace;">[ ${outs} / 3 ]</span>
                </div>
                ` : ''}
            </div>`;
    } else if (estaRetrasado) {
        badgeDerecha = `
            <div style="text-align: right;">
                <span class="badge-status badge-retrasado" style="background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #f59e0b; font-weight: 800; font-size: 9px; padding: 2px 5px; border-radius: 4px; display: inline-block;">
                    ⏳ RETRASADO
                </span>
            </div>`;
    } else if (estadoRaw === 'FINALIZADO') {
        badgeDerecha = `
            <div style="text-align: right;">
                <span style="font-weight: 700; font-size: 12px; color: #888;">FINAL</span>
            </div>`;
    } else {
        badgeDerecha = `
            <div style="text-align: right;">
                <span style="font-weight: 700; font-size: 14px; color: #00e676;">⏰ ${horaStr}</span>
            </div>`;
    }

    const matchCard = document.createElement('div');
    const fueModificado = partidosModificados.includes(pId);
    matchCard.className = fueModificado ? 'match-card goal-highlight' : 'match-card';
    matchCard.onclick = () => abrirDetallePartido(p);

    const fIdMatch = Number(obtenerPropiedad(p, ['faseId', 'fase_id', 'FaseId']) || 0);
    const esFasePlayoff = (fIdMatch === 16 || fIdMatch === 8 || fIdMatch === 4 || fIdMatch === 2);
    const tIdMatch = obtenerPropiedad(p, ['torneo_Id', 'torneo_id', 'Torneo_Id', 'torneoId']) || torneoSeleccionadoId;
    const depIdMatch = obtenerPropiedad(p, ['deporte_Id', 'deporte_id', 'Deporte_Id', 'deporteId']) 
        ?? (p.deporte ? (p.deporte.id ?? p.deporte.Id) : null);

    const btnCuadroHtml = esFasePlayoff ? `
        <div style="display: flex; justify-content: flex-end; margin-top: 6px; padding-top: 4px; border-top: 1px dashed #24252c;">
            <button class="btn-ir-cuadro" onclick="event.stopPropagation(); irACuadroFase(${tIdMatch}, ${fIdMatch}, ${depIdMatch || 'null'});" title="Ver posición de este partido en el Cuadro de Eliminación Directa">
                [ 🔀 Cuadro &gt; ]
            </button>
        </div>
    ` : '';

    const ganadorEsLocal = esFinalizado && (tienePenalesCard ? (datosPenalesCard.local > datosPenalesCard.visitante) : (ptsLocal > ptsVisitante));
    const ganadorEsVisit = esFinalizado && (tienePenalesCard ? (datosPenalesCard.visitante > datosPenalesCard.local) : (ptsVisitante > ptsLocal));

    const scoreLocalRender = tienePenalesCard ? `${ptsLocal}<sup style="font-size: 11px; margin-left: 2px; font-weight: 700; color: ${ganadorEsLocal ? '#10b981' : '#a1a1aa'};">(${datosPenalesCard.local})</sup>` : ptsLocal;
    const scoreVisitRender = tienePenalesCard ? `${ptsVisitante}<sup style="font-size: 11px; margin-left: 2px; font-weight: 700; color: ${ganadorEsVisit ? '#10b981' : '#a1a1aa'};">(${datosPenalesCard.visitante})</sup>` : ptsVisitante;

    const indAvanceLocal = (ganadorEsLocal && (tienePenalesCard || esFasePlayoff)) ? ' <span style="color: #10b981; font-weight: 900; font-size: 10px; margin-left: 3px;" title="Avanza / Ganador">▶</span>' : '';
    const indAvanceVisit = (ganadorEsVisit && (tienePenalesCard || esFasePlayoff)) ? ' <span style="color: #10b981; font-weight: 900; font-size: 10px; margin-left: 3px;" title="Avanza / Ganador">▶</span>' : '';

    const labelTrasPenHtml = tienePenalesCard ? `
        <div style="display: flex; justify-content: flex-end; margin-bottom: 2px;">
            <span style="font-size: 9.5px; font-weight: 800; color: #ec4899; background: rgba(236, 72, 153, 0.12); border: 1px solid rgba(236, 72, 153, 0.3); padding: 1px 6px; border-radius: 3px; letter-spacing: 0.3px;">Tras pen.</span>
        </div>
    ` : '';

    matchCard.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
            <div style="display: flex; align-items: center; gap: 15px; flex: 1;">
                <span style="font-size: 12px; font-weight: 700; color: #8d8d99; min-width: 42px;">
                    ${diaMes}
                </span>
                <div class="match-info" style="flex: 1; margin: 0;">
                    ${labelTrasPenHtml}
                    <div class="team" style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span style="${ganadorEsLocal ? 'font-weight: 800; color: #fff;' : (ganadorEsVisit ? 'color: #888;' : '')}">${nomLocal}${badgeBatLocal}${indAvanceLocal}</span>
                        <span class="score" style="font-weight: 800; color: ${ganadorEsLocal ? '#10b981' : (ganadorEsVisit ? '#888' : '#ff0044')};">${scoreLocalRender}</span>
                    </div>
                    <div class="team" style="display: flex; justify-content: space-between;">
                        <span style="${ganadorEsVisit ? 'font-weight: 800; color: #fff;' : (ganadorEsLocal ? 'color: #888;' : '')}">${nomVisitante}${badgeBatVisit}${indAvanceVisit}</span>
                        <span class="score" style="font-weight: 800; color: ${ganadorEsVisit ? '#10b981' : (ganadorEsLocal ? '#888' : '#ff0044')};">${scoreVisitRender}</span>
                    </div>
                </div>
            </div>
            <div style="min-width: 85px; margin-left: 6px; text-align: right; flex-shrink: 0;">
                ${badgeDerecha}
            </div>
        </div>
    `;
    return matchCard;
}

function verDetalleTorneo(torneoId, nombreTorneo) {
    torneoSeleccionadoId = torneoId;

    document.getElementById('vista-lista-torneos').classList.add('hidden');
    document.getElementById('vista-detalle-torneo').classList.remove('hidden');

    document.getElementById('header-torneo-detalle').innerHTML = `🏆 ${nombreTorneo}`;

    // Determinar con certeza el deporte del torneo para condicionar pestañas
    let nomDeporteTorneo = '';
    const torneoObj = listaTorneos.find(t => String(obtenerPropiedad(t, ['id', 'Id'])) === String(torneoId));
    if (torneoObj) {
        if (torneoObj.deporte && (torneoObj.deporte.nombre || torneoObj.deporte.Nombre)) {
            nomDeporteTorneo = (torneoObj.deporte.nombre || torneoObj.deporte.Nombre).toLowerCase();
        } else {
            const depId = obtenerPropiedad(torneoObj, ['deporte_id', 'deporteId', 'DeporteId']);
            const depObj = listaDeportes.find(d => String(obtenerPropiedad(d, ['id', 'Id'])) === String(depId));
            if (depObj) nomDeporteTorneo = (obtenerPropiedad(depObj, ['nombre', 'Nombre']) || '').toLowerCase();
        }
    }
    if (!nomDeporteTorneo && deporteSeleccionado) {
        nomDeporteTorneo = (obtenerPropiedad(deporteSeleccionado, ['nombre', 'Nombre']) || '').toLowerCase();
    }

    const tabGoleadores = document.getElementById('tab-goleadores');
    const esFutbolOMicro = nomDeporteTorneo.includes('fútbol') || 
                           nomDeporteTorneo.includes('futbol') || 
                           nomDeporteTorneo.includes('micro');

    // La pestaña Goleadores SOLO se muestra en Fútbol y Microfútbol
    if (esFutbolOMicro) {
        tabGoleadores.classList.remove('hidden');
    } else {
        tabGoleadores.classList.add('hidden');
    }

    // Visibilidad Condicional de la pestaña CUADRO: SOLO si existen partidos de playoff en este torneo
    verificarVisibilidadTabCuadro(torneoId);

    filtroEstadoActivo = 'TODOS';
    document.querySelectorAll('.filter-status-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-filter') === 'TODOS');
    });

    cambiarSubTab('partidos');
}

function cambiarSubTab(tabNombre) {
    document.querySelectorAll('.sub-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.sub-vista-content').forEach(vista => vista.classList.add('hidden'));

    const tabBtn = document.getElementById(`tab-${tabNombre}`) || 
                   document.getElementById(`btnSubvista${tabNombre.charAt(0).toUpperCase() + tabNombre.slice(1)}`) ||
                   document.querySelector(`[data-tab="${tabNombre}"]`);
    const subVista = document.getElementById(`subvista-${tabNombre}`);
    if (tabBtn) {
        tabBtn.classList.remove('hidden');
        tabBtn.classList.add('active');
    }
    if (subVista) subVista.classList.remove('hidden');

    if (tabNombre === 'partidos') cargarPartidosSubvista();
    if (tabNombre === 'clasificacion') cargarClasificacionSubvista();
    if (tabNombre === 'goleadores') cargarGoleadoresSubvista();
    if (tabNombre === 'fixture') cargarFixtureSubvista();
    if (tabNombre === 'cuadro') cargarCuadroSubvista(torneoSeleccionadoId);
}

function cargarPartidosSubvista(partidosModificados = []) {
    const container = document.getElementById('lista-partidos-container');
    if (!container) return;
    container.innerHTML = '';

    // 1. Partidos del torneo
    let partidos = listaPartidos.filter(p => {
        const tId = obtenerPropiedad(p, ['torneo_Id', 'torneo_id', 'Torneo_Id', 'torneoId']);
        return String(tId) === String(torneoSeleccionadoId);
    });

    // 2. Filtro por la fecha seleccionada en el carrusel
    partidos = partidos.filter(p => {
        const fechaP = extraerFechaPartido(p);
        return fechaP === fechaSeleccionadaStr;
    });

    // 3. Filtro por Estado
    if (filtroEstadoActivo === 'EN_VIVO') {
        partidos = partidos.filter(p => {
            const st = (obtenerPropiedad(p, ['estado', 'Estado']) || '').toUpperCase();
            const det = (obtenerPropiedad(p, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || '').toUpperCase();
            if (st === 'FINALIZADO' || st === 'TERMINADO' || det === 'FINALIZADO') return false;
            return st === 'EN_JUEGO' || st === 'EN VIVO' || st === 'JUGANDO' || st === 'SUSPENDIDO' || det === 'SUSPENDIDO';
        });
    } else if (filtroEstadoActivo === 'FINALIZADO') {
        partidos = partidos.filter(p => {
            const st = (obtenerPropiedad(p, ['estado', 'Estado']) || '').toUpperCase();
            const det = (obtenerPropiedad(p, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || '').toUpperCase();
            return st === 'FINALIZADO' || st === 'TERMINADO' || det === 'FINALIZADO';
        });
    } else if (filtroEstadoActivo === 'PROGRAMADO') {
        partidos = partidos.filter(p => {
            const st = (obtenerPropiedad(p, ['estado', 'Estado']) || '').toUpperCase();
            return st === 'PROGRAMADO' || st === 'PENDIENTE' || st === 'RETRASADO';
        });
    }

    // 4. Filtro por buscador (nombres de equipos)
    if (textoBusqueda) {
        partidos = partidos.filter(p => {
            const eqLocalId = obtenerPropiedad(p, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
            const eqVisitanteId = obtenerPropiedad(p, ['equipo_Visitante_Id', 'equipo_visitante_id', 'equipoVisitanteId']);
            const nomLocal = obtenerNombreEquipo(eqLocalId).toLowerCase();
            const nomVisitante = obtenerNombreEquipo(eqVisitanteId).toLowerCase();
            return nomLocal.includes(textoBusqueda) || nomVisitante.includes(textoBusqueda);
        });
    }

    if (partidos.length === 0) {
        container.innerHTML = `<p class="loading" style="margin: 20px 0; color: #888;">No hay partidos para esta fecha con el filtro seleccionado.</p>`;
        return;
    }

    partidos.forEach(p => {
        const matchCard = crearMatchCard(p, partidosModificados);
        container.appendChild(matchCard);
    });
}

async function cargarClasificacionSubvista() {
    const tbody = document.getElementById('tabla-clasificacion-body');
    const thead = document.getElementById('tabla-clasificacion-head');
    if (!tbody) return;

    // Detectar si el deporte del torneo es Baloncesto
    const torneoObj = listaTorneos.find(t => String(obtenerPropiedad(t, ['id', 'Id'])) === String(torneoSeleccionadoId));
    let nomDeporteTorneo = '';
    if (torneoObj) {
        const dId = obtenerPropiedad(torneoObj, ['deporte_Id', 'deporte_id', 'Deporte_Id', 'deporteId', 'DeporteId']);
        const dObj = listaDeportes.find(d => String(obtenerPropiedad(d, ['id', 'Id'])) === String(dId));
        if (dObj) nomDeporteTorneo = (obtenerPropiedad(dObj, ['nombre', 'Nombre']) || '').toLowerCase();
    }
    if (!nomDeporteTorneo && deporteSeleccionado) {
        nomDeporteTorneo = (obtenerPropiedad(deporteSeleccionado, ['nombre', 'Nombre']) || '').toLowerCase();
    }
    const esBaloncesto = nomDeporteTorneo.includes('baloncesto') || nomDeporteTorneo.includes('basket');
    const esBeisbol = nomDeporteTorneo.includes('beisbol') || nomDeporteTorneo.includes('béisbol') || nomDeporteTorneo.includes('baseball');
    const esSoftbol = nomDeporteTorneo.includes('softbol') || nomDeporteTorneo.includes('soft');
    const esBeisbolOSoftbol = esBeisbol || esSoftbol;
    const esVoleibol = nomDeporteTorneo.includes('voleibol') || nomDeporteTorneo.includes('voley') || nomDeporteTorneo.includes('volley');

    // Adaptar cabecera según el deporte
    if (thead) {
        if (esVoleibol) {
            thead.innerHTML = `
                <tr>
                    <th style="width: 32px;">#</th>
                    <th style="text-align: left;">Equipo</th>
                    <th>PJ</th>
                    <th>Sets (G:P)</th>
                    <th>PTS</th>
                </tr>
            `;
        } else if (esBeisbolOSoftbol) {
            thead.innerHTML = `
                <tr>
                    <th style="width: 32px;">#</th>
                    <th style="text-align: left;">Equipo</th>
                    <th>PJ</th>
                    <th>G</th>
                    <th>P</th>
                    <th>%PG</th>
                </tr>
            `;
        } else if (esBaloncesto) {
            thead.innerHTML = `
                <tr>
                    <th style="width: 32px;">#</th>
                    <th style="text-align: left;">Equipo</th>
                    <th>PJ</th>
                    <th>G</th>
                    <th>P</th>
                    <th>PTS</th>
                    <th>Dif</th>
                </tr>
            `;
        } else {
            thead.innerHTML = `
                <tr>
                    <th style="width: 32px;">#</th>
                    <th style="text-align: left;">Equipo</th>
                    <th>PJ</th>
                    <th>PG</th>
                    <th>PE</th>
                    <th>PP</th>
                    <th>GF</th>
                    <th>GC</th>
                    <th>+/-</th>
                    <th>PTS</th>
                    <th>Forma</th>
                </tr>
            `;
        }
    }

    const colSpanTotal = esVoleibol ? 5 : (esBeisbolOSoftbol ? 6 : (esBaloncesto ? 7 : 11));
    tbody.innerHTML = `<tr><td colspan="${colSpanTotal}" class="loading" style="text-align:center; padding: 20px;">Cargando tabla de posiciones...</td></tr>`;

    try {
        const res = await fetch(`${API_URL}/tablaposiciones/torneo/${torneoSeleccionadoId}`);
        if (!res.ok) throw new Error('Error al consultar tabla de posiciones');
        let posiciones = await res.json();

        if (esVoleibol || esBeisbolOSoftbol || !posiciones || posiciones.length === 0) {
            posiciones = calcularPosicionesLocales(torneoSeleccionadoId);
        }

        if (!posiciones || posiciones.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${colSpanTotal}" style="text-align:center; padding: 20px; color:#888;">No hay datos de clasificación disponibles aún para este torneo.</td></tr>`;
            return;
        }

        renderizarFilasPosiciones(tbody, posiciones, esBaloncesto, esBeisbolOSoftbol, esVoleibol);
    } catch (err) {
        console.error('Error al cargar clasificación:', err);
        const fallbackPos = calcularPosicionesLocales(torneoSeleccionadoId);
        if (fallbackPos && fallbackPos.length > 0) {
            renderizarFilasPosiciones(tbody, fallbackPos, esBaloncesto, esBeisbolOSoftbol, esVoleibol);
        } else {
            tbody.innerHTML = `<tr><td colspan="${colSpanTotal}" style="text-align:center; padding: 20px; color:#ff4444;">No fue posible obtener la tabla de clasificación.</td></tr>`;
        }
    }
}

function renderizarFilasPosiciones(tbody, posiciones, esBaloncesto = false, esBeisbolOSoftbol = false, esVoleibol = false) {
    tbody.innerHTML = '';
    posiciones.forEach((pos, idx) => {
        const lugar = idx + 1;
        const eqId = obtenerPropiedad(pos, ['equipoId', 'EquipoId', 'id', 'Id']);
        let nomEq = (obtenerNombreEquipo(eqId) || obtenerPropiedad(pos, ['nombreEquipo', 'NombreEquipo', 'nombre', 'Nombre']) || 'Equipo').replace(/\s*#\d+$/, '');

        const pj = Number(obtenerPropiedad(pos, ['partidosJugados', 'PartidosJugados']) ?? 0);
        const pg = Number(obtenerPropiedad(pos, ['partidosGanados', 'PartidosGanados']) ?? 0);
        const pe = Number(obtenerPropiedad(pos, ['partidosEmpatados', 'PartidosEmpatados']) ?? 0);
        const pp = Number(obtenerPropiedad(pos, ['partidosPerdidos', 'PartidosPerdidos']) ?? 0);
        const gf = Number(obtenerPropiedad(pos, ['puntosFavor', 'PuntosFavor']) ?? 0);
        const gc = Number(obtenerPropiedad(pos, ['puntosContra', 'PuntosContra']) ?? 0);
        const dif = Number(obtenerPropiedad(pos, ['diferenciaPuntos', 'DiferenciaPuntos']) ?? (gf - gc));
        const difStr = dif > 0 ? `+${dif}` : `${dif}`;

        // Regla oficial Baloncesto: Victoria suma 2 Puntos, Derrota suma 1 Punto (partido jugado)
        let pts = Number(obtenerPropiedad(pos, ['puntosTotales', 'PuntosTotales']) ?? 0);
        if (esBaloncesto && pts === 0 && pj > 0) {
            pts = (pg * 2) + (pp * 1);
        }

        const tr = document.createElement('tr');

        if (esVoleibol) {
            // Regla oficial FIVB Voleibol: # | Equipo | PJ | Sets (G:P) | PTS
            const setsG = Number(pos.setsFavor ?? pos.puntosFavor ?? 0);
            const setsP = Number(pos.setsContra ?? pos.puntosContra ?? 0);
            const ptsVol = Number(pos.puntosTotales ?? 0);
            tr.innerHTML = `
                <td style="font-weight: 700; color: ${lugar <= 2 ? '#ff0044' : '#8d8d99'}; text-align: center;">${lugar}</td>
                <td style="text-align: left; font-weight: 600;">
                    <span class="jugador-click" style="color: #f1f1f5;" onclick="verPlantillaEquipo(${eqId}, '${nomEq.replace(/'/g, "\\'")}')">
                        ${nomEq}
                    </span>
                </td>
                <td style="text-align: center;">${pj}</td>
                <td style="text-align: center; font-weight: 700; color: #f1f1f5; font-family: monospace;">${setsG}:${setsP}</td>
                <td style="text-align: center; font-weight: 800; color: #ff0044; font-size: 14px;">${ptsVol}</td>
            `;
        } else if (esBeisbolOSoftbol) {
            // Regla oficial Béisbol y Sóftbol Flashscore: # | Equipo | PJ | G | P | %PG
            const pctPg = pj > 0 ? (pg / pj).toFixed(3) : '.000';
            tr.innerHTML = `
                <td style="font-weight: 700; color: ${lugar <= 2 ? '#ff0044' : '#8d8d99'}; text-align: center;">${lugar}</td>
                <td style="text-align: left; font-weight: 600;">
                    <span class="jugador-click" style="color: #f1f1f5;" onclick="verPlantillaEquipo(${eqId}, '${nomEq.replace(/'/g, "\\'")}')">
                        ${nomEq}
                    </span>
                </td>
                <td style="text-align: center;">${pj}</td>
                <td style="text-align: center; color: #2ed573; font-weight: 600;">${pg}</td>
                <td style="text-align: center; color: #ff4757; font-weight: 600;">${pp}</td>
                <td style="text-align: center; font-weight: 800; color: #ff0044; font-size: 14px; font-family: monospace;">${pctPg}</td>
            `;
        } else if (esBaloncesto) {
            // Regla oficial Baloncesto Flashscore: # | Equipo | PJ | G | P | PTS | Dif
            tr.innerHTML = `
                <td style="font-weight: 700; color: ${lugar <= 2 ? '#ff0044' : '#8d8d99'}; text-align: center;">${lugar}</td>
                <td style="text-align: left; font-weight: 600;">
                    <span class="jugador-click" style="color: #f1f1f5;" onclick="verPlantillaEquipo(${eqId}, '${nomEq.replace(/'/g, "\\'")}')">
                        ${nomEq}
                    </span>
                </td>
                <td style="text-align: center;">${pj}</td>
                <td style="text-align: center; color: #2ed573; font-weight: 600;">${pg}</td>
                <td style="text-align: center; color: #ff4757; font-weight: 600;">${pp}</td>
                <td style="text-align: center; font-weight: 800; color: #ff0044; font-size: 14px;">${pts}</td>
                <td style="text-align: center; font-weight: 600; color: ${dif > 0 ? '#2ed573' : (dif < 0 ? '#ff4757' : '#888')};">${difStr}</td>
            `;
        } else {
            // Regla general Fútbol / Microfútbol / otros
            const formaHtml = calcularRachaForma(eqId, torneoSeleccionadoId);
            tr.innerHTML = `
                <td style="font-weight: 700; color: ${lugar <= 2 ? '#ff0044' : '#8d8d99'}; text-align: center;">${lugar}</td>
                <td style="text-align: left; font-weight: 600;">
                    <span class="jugador-click" style="color: #f1f1f5;" onclick="verPlantillaEquipo(${eqId}, '${nomEq.replace(/'/g, "\\'")}')">
                        ${nomEq}
                    </span>
                </td>
                <td style="text-align: center;">${pj}</td>
                <td style="text-align: center; color: #2ed573;">${pg}</td>
                <td style="text-align: center; color: #ffa502;">${pe}</td>
                <td style="text-align: center; color: #ff4757;">${pp}</td>
                <td style="text-align: center;">${gf}</td>
                <td style="text-align: center;">${gc}</td>
                <td style="text-align: center; font-weight: 600; color: ${dif > 0 ? '#2ed573' : (dif < 0 ? '#ff4757' : '#888')};">${difStr}</td>
                <td style="text-align: center; font-weight: 800; color: #ff0044; font-size: 14px;">${pts}</td>
                <td style="text-align: center;">${formaHtml}</td>
            `;
        }

        tbody.appendChild(tr);
    });
}

function calcularPosicionesLocales(torneoId) {
    const partidosTorneo = listaPartidos.filter(p => {
        const tId = obtenerPropiedad(p, ['torneo_Id', 'torneo_id', 'Torneo_Id', 'torneoId']);
        const st = (obtenerPropiedad(p, ['estado', 'Estado']) || '').toUpperCase();
        return String(tId) === String(torneoId) && 
               (st === 'FINALIZADO' || st === 'TERMINADO' || st === 'EN_JUEGO' || st === 'EN VIVO' || st === 'JUGANDO');
    });

    const equiposMap = {};

    listaPartidos.forEach(p => {
        const tId = obtenerPropiedad(p, ['torneo_Id', 'torneo_id', 'Torneo_Id', 'torneoId']);
        if (String(tId) === String(torneoId)) {
            const locId = obtenerPropiedad(p, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
            const visId = obtenerPropiedad(p, ['equipo_Visitante_Id', 'equipo_visitante_id', 'equipoVisitanteId']);
            if (locId && !equiposMap[locId]) {
                equiposMap[locId] = {
                    equipoId: locId,
                    nombreEquipo: obtenerNombreEquipo(locId),
                    partidosJugados: 0,
                    partidosGanados: 0,
                    partidosEmpatados: 0,
                    partidosPerdidos: 0,
                    puntosFavor: 0,
                    puntosContra: 0,
                    setsFavor: 0,
                    setsContra: 0,
                    puntosTotales: 0
                };
            }
            if (visId && !equiposMap[visId]) {
                equiposMap[visId] = {
                    equipoId: visId,
                    nombreEquipo: obtenerNombreEquipo(visId),
                    partidosJugados: 0,
                    partidosGanados: 0,
                    partidosEmpatados: 0,
                    partidosPerdidos: 0,
                    puntosFavor: 0,
                    puntosContra: 0,
                    setsFavor: 0,
                    setsContra: 0,
                    puntosTotales: 0
                };
            }
        }
    });

    let esBaloncesto = false;
    let esBeisbolOSoftbol = false;
    let esVoleibol = false;
    const tObj = listaTorneos.find(t => String(obtenerPropiedad(t, ['id', 'Id'])) === String(torneoId));
    if (tObj) {
        const depId = obtenerPropiedad(tObj, ['deporte_Id', 'deporte_id', 'Deporte_Id', 'deporteId', 'DeporteId']);
        const depObj = listaDeportes.find(d => String(obtenerPropiedad(d, ['id', 'Id'])) === String(depId));
        if (depObj) {
            const nomDep = (obtenerPropiedad(depObj, ['nombre', 'Nombre']) || '').toLowerCase();
            if (nomDep.includes('baloncesto') || nomDep.includes('basket')) esBaloncesto = true;
            if (nomDep.includes('beisbol') || nomDep.includes('béisbol') || nomDep.includes('softbol')) esBeisbolOSoftbol = true;
            if (nomDep.includes('voleibol') || nomDep.includes('voley') || nomDep.includes('volley')) esVoleibol = true;
        }
    }

    partidosTorneo.forEach(p => {
        const locId = obtenerPropiedad(p, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
        const visId = obtenerPropiedad(p, ['equipo_Visitante_Id', 'equipo_visitante_id', 'equipoVisitanteId']);
        const ptsL = Number(obtenerPropiedad(p, ['puntos_Local', 'puntos_local', 'puntosLocal']) ?? 0);
        const ptsV = Number(obtenerPropiedad(p, ['puntos_Visitante', 'puntos_visitante', 'puntosVisitante']) ?? 0);

        if (!equiposMap[locId] || !equiposMap[visId]) return;

        if (esVoleibol) {
            let ptsLNorm = Math.min(3, Math.max(0, ptsL));
            let ptsVNorm = Math.min(3, Math.max(0, ptsV));
            if (ptsLNorm === 3 && ptsVNorm === 3) ptsVNorm = 2;

            equiposMap[locId].partidosJugados++;
            equiposMap[visId].partidosJugados++;
            equiposMap[locId].setsFavor += ptsLNorm;
            equiposMap[locId].setsContra += ptsVNorm;
            equiposMap[visId].setsFavor += ptsVNorm;
            equiposMap[visId].setsContra += ptsLNorm;
            equiposMap[locId].puntosFavor += ptsLNorm;
            equiposMap[locId].puntosContra += ptsVNorm;
            equiposMap[visId].puntosFavor += ptsVNorm;
            equiposMap[visId].puntosContra += ptsLNorm;

            if (ptsLNorm > ptsVNorm) {
                equiposMap[locId].partidosGanados++;
                equiposMap[visId].partidosPerdidos++;
                if (ptsLNorm === 3 && (ptsVNorm === 0 || ptsVNorm === 1)) {
                    equiposMap[locId].puntosTotales += 3;
                } else if (ptsLNorm === 3 && ptsVNorm === 2) {
                    equiposMap[locId].puntosTotales += 2;
                    equiposMap[visId].puntosTotales += 1;
                } else {
                    equiposMap[locId].puntosTotales += 3;
                }
            } else if (ptsVNorm > ptsLNorm) {
                equiposMap[visId].partidosGanados++;
                equiposMap[locId].partidosPerdidos++;
                if (ptsVNorm === 3 && (ptsLNorm === 0 || ptsLNorm === 1)) {
                    equiposMap[visId].puntosTotales += 3;
                } else if (ptsVNorm === 3 && ptsLNorm === 2) {
                    equiposMap[visId].puntosTotales += 2;
                    equiposMap[locId].puntosTotales += 1;
                } else {
                    equiposMap[visId].puntosTotales += 3;
                }
            }
            return;
        }

        equiposMap[locId].partidosJugados++;
        equiposMap[visId].partidosJugados++;
        equiposMap[locId].puntosFavor += ptsL;
        equiposMap[locId].puntosContra += ptsV;
        equiposMap[visId].puntosFavor += ptsV;
        equiposMap[visId].puntosContra += ptsL;

        if (ptsL > ptsV) {
            equiposMap[locId].partidosGanados++;
            equiposMap[visId].partidosPerdidos++;
            equiposMap[locId].puntosTotales += esBaloncesto ? 2 : 3;
            if (esBaloncesto) equiposMap[visId].puntosTotales += 1;
        } else if (ptsL < ptsV) {
            equiposMap[visId].partidosGanados++;
            equiposMap[locId].partidosPerdidos++;
            equiposMap[visId].puntosTotales += esBaloncesto ? 2 : 3;
            if (esBaloncesto) equiposMap[locId].puntosTotales += 1;
        } else {
            equiposMap[locId].partidosEmpatados++;
            equiposMap[visId].partidosEmpatados++;
            equiposMap[locId].puntosTotales += 1;
            equiposMap[visId].puntosTotales += 1;
        }
    });

    const resultado = Object.values(equiposMap);
    resultado.sort((a, b) => {
        if (esVoleibol) {
            if (b.puntosTotales !== a.puntosTotales) return b.puntosTotales - a.puntosTotales;
            const difSetsA = (a.setsFavor || 0) - (a.setsContra || 0);
            const difSetsB = (b.setsFavor || 0) - (b.setsContra || 0);
            if (difSetsB !== difSetsA) return difSetsB - difSetsA;
            return (b.setsFavor || 0) - (a.setsFavor || 0);
        }
        if (esBeisbolOSoftbol) {
            const pctA = a.partidosJugados > 0 ? (a.partidosGanados / a.partidosJugados) : 0;
            const pctB = b.partidosJugados > 0 ? (b.partidosGanados / b.partidosJugados) : 0;
            if (pctB !== pctA) return pctB - pctA;
            const difA = a.puntosFavor - a.puntosContra;
            const difB = b.puntosFavor - b.puntosContra;
            if (difB !== difA) return difB - difA;
            return b.puntosFavor - a.puntosFavor;
        }
        if (b.puntosTotales !== a.puntosTotales) return b.puntosTotales - a.puntosTotales;
        const difA = a.puntosFavor - a.puntosContra;
        const difB = b.puntosFavor - b.puntosContra;
        if (difB !== difA) return difB - difA;
        return b.puntosFavor - a.puntosFavor;
    });

    return resultado;
}

async function cargarGoleadoresSubvista() {
    const tbody = document.getElementById('tabla-goleadores-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="loading" style="text-align:center; padding: 20px;">Cargando tabla de goleadores...</td></tr>';

    try {
        const res = await fetch(`${API_URL}/goleadores/torneo/${torneoSeleccionadoId}`);
        if (!res.ok) throw new Error('Error al consultar goleadores');
        const goleadores = await res.json();

        if (!goleadores || goleadores.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 25px; color:#888;">No hay goles registrados en este torneo aún.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        goleadores.forEach((g, idx) => {
            const pos = idx + 1;
            const jId = obtenerPropiedad(g, ['jugadorId', 'JugadorId', 'id', 'Id']);
            const jNombre = obtenerPropiedad(g, ['nombreJugador', 'NombreJugador', 'jugador', 'Jugador']) || 'Jugador';
            let eqNombre = (obtenerPropiedad(g, ['nombreEquipo', 'NombreEquipo', 'equipo', 'Equipo']) || '').replace(/\s*#\d+$/, '');
            const goles = Number(obtenerPropiedad(g, ['goles', 'Goles']) ?? 0);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 700; color: ${pos <= 3 ? '#ff0044' : '#8d8d99'}; text-align: center;">${pos}</td>
                <td style="text-align: left; font-weight: 600;">
                    <span class="jugador-click" style="color: #f1f1f5;" onclick="abrirFichaJugador(${jId}, '${jNombre.replace(/'/g, "\\'")}', '${eqNombre.replace(/'/g, "\\'")}')">
                        ⚽ ${jNombre}
                    </span>
                </td>
                <td style="text-align: left; color: #a1a1aa;">${eqNombre}</td>
                <td style="text-align: center; font-weight: 800; color: #ff0044; font-size: 14px;">${goles}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Error al cargar goleadores:', err);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color:#ff4444;">No fue posible obtener la tabla de goleadores.</td></tr>';
    }
}

function cargarFixtureSubvista(partidosModificados = []) {
    const container = document.getElementById('fixture-container');
    if (!container) return;
    container.innerHTML = '';

    const partidosTorneo = listaPartidos.filter(p => {
        const tId = obtenerPropiedad(p, ['torneo_Id', 'torneo_id', 'Torneo_Id', 'torneoId']);
        const fId = Number(obtenerPropiedad(p, ['faseId', 'fase_id', 'FaseId']) || 0);
        return String(tId) === String(torneoSeleccionadoId) && (fId === 0 || fId === 1 || !fId);
    });

    if (partidosTorneo.length === 0) {
        container.innerHTML = '<p class="loading" style="margin: 20px 0; color: #888; text-align: center;">No hay partidos programados en el fixture de este torneo.</p>';
        return;
    }

    // Agrupar por jornada
    const jornadasMap = {};
    partidosTorneo.forEach(p => {
        const jNum = obtenerPropiedad(p, ['jornada', 'Jornada']) || 1;
        if (!jornadasMap[jNum]) jornadasMap[jNum] = [];
        jornadasMap[jNum].push(p);
    });

    const keysJornadas = Object.keys(jornadasMap).sort((a, b) => Number(a) - Number(b));

    keysJornadas.forEach(jNum => {
        const partidosJornada = jornadasMap[jNum];
        // Ordenar cronológicamente dentro de la jornada
        partidosJornada.sort((a, b) => {
            const fa = new Date(obtenerPropiedad(a, ['fechaHora', 'fecha_hora', 'FechaHora']) || 0);
            const fb = new Date(obtenerPropiedad(b, ['fechaHora', 'fecha_hora', 'FechaHora']) || 0);
            return fa - fb;
        });

        const bloqueJornada = document.createElement('div');
        bloqueJornada.style.marginBottom = '22px';

        const headerJornada = document.createElement('div');
        headerJornada.style.cssText = 'background: #18191e; border: 1px solid #2a2b32; border-left: 4px solid #ff0044; border-radius: 6px; padding: 9px 14px; font-weight: 800; font-size: 13px; color: #fff; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';
        headerJornada.innerHTML = `
            <span>📅 FECHA ${jNum} (JORNADA ${jNum})</span>
            <span style="font-size: 11px; color: #8d8d99; font-weight: 600;">${partidosJornada.length} ${partidosJornada.length === 1 ? 'partido' : 'partidos'}</span>
        `;
        bloqueJornada.appendChild(headerJornada);

        const partidosWrapper = document.createElement('div');
        partidosJornada.forEach(p => {
            const card = crearMatchCard(p, partidosModificados);
            partidosWrapper.appendChild(card);
        });
        bloqueJornada.appendChild(partidosWrapper);

        container.appendChild(bloqueJornada);
    });
}

// ============================================================================
// MÓDULO PÚBLICO DE CUADRO / PLAYOFFS (ELIMINACIÓN DIRECTA ESTILO FLASHSCORE)
// ============================================================================

let faseActivaCuadro = 0;

function obtenerFasesDisponiblesCuadro(torneoId) {
    const tId = torneoId || torneoSeleccionadoId;
    if (!tId) return [];

    const partidosPlayoff = listaPartidos.filter(p => {
        const ptId = obtenerPropiedad(p, ['torneo_Id', 'torneo_id', 'Torneo_Id', 'torneoId']);
        const fId = Number(obtenerPropiedad(p, ['faseId', 'fase_id', 'FaseId']) || 0);
        return String(ptId) === String(tId) && (fId === 16 || fId === 8 || fId === 4 || fId === 2);
    });

    if (partidosPlayoff.length === 0) return [];

    const maxFase = Math.max(...partidosPlayoff.map(p => Number(obtenerPropiedad(p, ['faseId', 'fase_id', 'FaseId']) || 0)));
    const todasLasFases = [16, 8, 4, 2];
    // Al generarse los playoffs, TODAS las fases subsiguientes (ej. Semifinales y Final) son navegables de inmediato
    return todasLasFases.filter(fId => fId <= maxFase);
}

function verificarVisibilidadTabCuadro(torneoId) {
    const tabCuadro = document.getElementById('tab-cuadro');
    if (!tabCuadro) return false;
    const tId = torneoId || torneoSeleccionadoId;
    if (!tId) {
        tabCuadro.classList.add('hidden');
        return false;
    }
    const hayPlayoffs = listaPartidos.some(p => {
        const ptId = obtenerPropiedad(p, ['torneo_Id', 'torneo_id', 'Torneo_Id', 'torneoId']);
        const fId = Number(obtenerPropiedad(p, ['faseId', 'fase_id', 'FaseId']) || 0);
        return String(ptId) === String(tId) && (fId === 16 || fId === 8 || fId === 4 || fId === 2);
    });

    if (hayPlayoffs) {
        tabCuadro.classList.remove('hidden');
    } else {
        tabCuadro.classList.add('hidden');
        const subvistaCuadro = document.getElementById('subvista-cuadro');
        if (subvistaCuadro && !subvistaCuadro.classList.contains('hidden')) {
            cambiarSubTab('partidos');
        }
    }
    return hayPlayoffs;
}

// Resuelve si una llave previa ya definió ganador (partido único o serie) en los 5 deportes
function resolverGanadorLlavePlayoff(torneoId, fId, jNum) {
    const tId = torneoId || torneoSeleccionadoId;
    if (!tId) return null;

    const partidosLlave = listaPartidos.filter(p => {
        const ptId = obtenerPropiedad(p, ['torneo_Id', 'torneo_id', 'Torneo_Id', 'torneoId']);
        const f = Number(obtenerPropiedad(p, ['faseId', 'fase_id', 'FaseId']) || 0);
        const j = Number(obtenerPropiedad(p, ['jornada', 'Jornada']) || 1);
        return String(ptId) === String(tId) && f === fId && j === jNum;
    });

    if (partidosLlave.length === 0) return null;

    // A) Serie de múltiples partidos (Ida y Vuelta, Best of 3, Best of 5)
    if (partidosLlave.length > 1) {
        const eqAId = obtenerPropiedad(partidosLlave[0], ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
        const eqBId = obtenerPropiedad(partidosLlave[0], ['equipo_Visitante_Id', 'equipo_visitante_id', 'equipoVisitanteId']);
        let vicA = 0;
        let vicB = 0;
        let globalA = 0;
        let globalB = 0;
        let finalizados = 0;

        partidosLlave.forEach(p => {
            const est = (obtenerPropiedad(p, ['estado', 'Estado']) || '').toUpperCase();
            if (est === 'FINALIZADO' || est === 'TERMINADO') {
                finalizados++;
                const pLocId = obtenerPropiedad(p, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
                const pPtsL = Number(obtenerPropiedad(p, ['puntos_Local', 'puntos_local', 'puntosLocal']) || 0);
                const pPtsV = Number(obtenerPropiedad(p, ['puntos_Visitante', 'puntos_visitante', 'puntosVisitante']) || 0);

                if (pLocId === eqAId) {
                    globalA += pPtsL;
                    globalB += pPtsV;
                    if (pPtsL > pPtsV) vicA++;
                    else if (pPtsV > pPtsL) vicB++;
                } else {
                    globalB += pPtsL;
                    globalA += pPtsV;
                    if (pPtsL > pPtsV) vicB++;
                    else if (pPtsV > pPtsL) vicA++;
                }
            }
        });

        const esIdaVuelta = (partidosLlave.length === 2) && partidosLlave.some(p => {
            const tag = (obtenerPropiedad(p, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || '').toUpperCase();
            return tag.includes('IDA') || tag.includes('VUELTA');
        });

        // Cierre Anticipado Universal:
        // Si cualquier equipo alcanza las victorias requeridas reglamentarias:
        // 2 victorias (al mejor de 3), 3 victorias (al mejor de 5) o 4 victorias (al mejor de 7)
        if (!esIdaVuelta) {
            if (partidosLlave.length <= 3 && (vicA >= 2 || vicB >= 2)) {
                return (vicA >= 2) ? { id: eqAId, nombre: obtenerNombreEquipo(eqAId) } : { id: eqBId, nombre: obtenerNombreEquipo(eqBId) };
            }
            if (partidosLlave.length === 5 && (vicA >= 3 || vicB >= 3)) {
                return (vicA >= 3) ? { id: eqAId, nombre: obtenerNombreEquipo(eqAId) } : { id: eqBId, nombre: obtenerNombreEquipo(eqBId) };
            }
            if (partidosLlave.length === 7 && (vicA >= 4 || vicB >= 4)) {
                return (vicA >= 4) ? { id: eqAId, nombre: obtenerNombreEquipo(eqAId) } : { id: eqBId, nombre: obtenerNombreEquipo(eqBId) };
            }
        }

        if (partidosLlave.length === 3) {
            if (vicA >= 2) return { id: eqAId, nombre: obtenerNombreEquipo(eqAId) };
            if (vicB >= 2) return { id: eqBId, nombre: obtenerNombreEquipo(eqBId) };
            if (finalizados === 3) {
                if (vicA > vicB) return { id: eqAId, nombre: obtenerNombreEquipo(eqAId) };
                if (vicB > vicA) return { id: eqBId, nombre: obtenerNombreEquipo(eqBId) };
            }
            return null;
        }
        if (partidosLlave.length === 5) {
            if (vicA >= 3) return { id: eqAId, nombre: obtenerNombreEquipo(eqAId) };
            if (vicB >= 3) return { id: eqBId, nombre: obtenerNombreEquipo(eqBId) };
            if (finalizados === 5) {
                if (vicA > vicB) return { id: eqAId, nombre: obtenerNombreEquipo(eqAId) };
                if (vicB > vicA) return { id: eqBId, nombre: obtenerNombreEquipo(eqBId) };
            }
            return null;
        }
        if (partidosLlave.length === 7) {
            if (vicA >= 4) return { id: eqAId, nombre: obtenerNombreEquipo(eqAId) };
            if (vicB >= 4) return { id: eqBId, nombre: obtenerNombreEquipo(eqBId) };
            if (finalizados === 7) {
                if (vicA > vicB) return { id: eqAId, nombre: obtenerNombreEquipo(eqAId) };
                if (vicB > vicA) return { id: eqBId, nombre: obtenerNombreEquipo(eqBId) };
            }
            return null;
        }
        if (partidosLlave.length === 2 && esIdaVuelta) {
            if (finalizados < 2) return null;
            if (globalA > globalB) return { id: eqAId, nombre: obtenerNombreEquipo(eqAId) };
            if (globalB > globalA) return { id: eqBId, nombre: obtenerNombreEquipo(eqBId) };

            const tiebreakKey = `playoff_tiebreak_${tId}_${fId}_${jNum}`;
            const savedWinner = localStorage.getItem(tiebreakKey);
            if (savedWinner) {
                try {
                    const parsed = JSON.parse(savedWinner);
                    if (parsed && parsed.id) return parsed;
                } catch (e) {}
            }

            // Fútbol / Microfútbol: desempate por tanda de penales en el partido decisivo (vuelta)
            const depLlave = obtenerNombreDeportePartido(partidosLlave[0]);
            const esMicroLlave = depLlave.includes('MICRO') || depLlave.includes('SALÓN') || depLlave.includes('SALON');
            const esFutbolLlave = !esMicroLlave && !depLlave.includes('BEISBOL') && !depLlave.includes('BÉISBOL') && !depLlave.includes('SOFTBOL') && !depLlave.includes('VOLEIBOL') && !depLlave.includes('VOLLEY') && !depLlave.includes('BALONCESTO') && !depLlave.includes('BASKET');
            const esFutbolOMicroLlave = esFutbolLlave || esMicroLlave;
            if (esFutbolOMicroLlave) {
                const pVuelta = partidosLlave[1] || partidosLlave[0];
                const pen = extraerPenalesPartido(pVuelta) || extraerPenalesPartido(partidosLlave[0]);
                if (pen && pen.local !== null && pen.visitante !== null && pen.local !== pen.visitante) {
                    const pLocId = obtenerPropiedad(pVuelta, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
                    if (String(pLocId) === String(eqAId)) {
                        if (pen.local > pen.visitante) return { id: eqAId, nombre: obtenerNombreEquipo(eqAId) };
                        if (pen.visitante > pen.local) return { id: eqBId, nombre: obtenerNombreEquipo(eqBId) };
                    } else {
                        if (pen.local > pen.visitante) return { id: eqBId, nombre: obtenerNombreEquipo(eqBId) };
                        if (pen.visitante > pen.local) return { id: eqAId, nombre: obtenerNombreEquipo(eqAId) };
                    }
                }
            }

            const nextF = (fId === 16) ? 8 : (fId === 8 ? 4 : 2);
            const nextJ = (fId === 4) ? 1 : Math.ceil(jNum / 2);
            const isL = (fId === 4) ? (jNum === 1) : (jNum % 2 !== 0);
            try {
                const raw = localStorage.getItem(`playoff_slot_${tId}_${nextF}_${nextJ}_${isL ? 'loc' : 'vis'}`);
                if (raw) return JSON.parse(raw);
            } catch (e) {}
            return null;
        }
    }

    // B) Partido Único
    const p = partidosLlave[0];
    const est = (obtenerPropiedad(p, ['estado', 'Estado']) || '').toUpperCase();
    if (est !== 'FINALIZADO' && est !== 'TERMINADO') return null;

    const eqLocId = obtenerPropiedad(p, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
    const eqVisId = obtenerPropiedad(p, ['equipo_Visitante_Id', 'equipo_visitante_id', 'equipoVisitanteId']);
    const ptsL = Number(obtenerPropiedad(p, ['puntos_Local', 'puntos_local', 'puntosLocal']) || 0);
    const ptsV = Number(obtenerPropiedad(p, ['puntos_Visitante', 'puntos_visitante', 'puntosVisitante']) || 0);

    if (ptsL > ptsV) return { id: eqLocId, nombre: obtenerNombreEquipo(eqLocId) };
    if (ptsV > ptsL) return { id: eqVisId, nombre: obtenerNombreEquipo(eqVisId) };

    // Si hubo empate (ptsL === ptsV): desempate por penales en Fútbol
    const tiebreakKey = `playoff_tiebreak_${tId}_${fId}_${jNum}`;
    const savedWinner = localStorage.getItem(tiebreakKey);
    if (savedWinner) {
        try {
            const parsed = JSON.parse(savedWinner);
            if (parsed && parsed.id) return parsed;
        } catch (e) {}
    }

    const depP = obtenerNombreDeportePartido(p);
    const esMicroP = depP.includes('MICRO') || depP.includes('SALÓN') || depP.includes('SALON');
    const esFutbolP = !esMicroP && !depP.includes('BEISBOL') && !depP.includes('BÉISBOL') && !depP.includes('SOFTBOL') && !depP.includes('VOLEIBOL') && !depP.includes('VOLLEY') && !depP.includes('BALONCESTO') && !depP.includes('BASKET');
    const esFutbolOMicroP = esFutbolP || esMicroP;
    if (esFutbolOMicroP) {
        const pen = extraerPenalesPartido(p);
        if (pen && pen.local !== null && pen.visitante !== null && pen.local !== pen.visitante) {
            if (pen.local > pen.visitante) return { id: eqLocId, nombre: obtenerNombreEquipo(eqLocId) };
            if (pen.visitante > pen.local) return { id: eqVisId, nombre: obtenerNombreEquipo(eqVisId) };
        }
    }

    const nextF = (fId === 16) ? 8 : (fId === 8 ? 4 : 2);
    const nextJ = (fId === 4) ? 1 : Math.ceil(jNum / 2);
    const isL = (fId === 4) ? (jNum === 1) : (jNum % 2 !== 0);
    try {
        const raw = localStorage.getItem(`playoff_slot_${tId}_${nextF}_${nextJ}_${isL ? 'loc' : 'vis'}`);
        if (raw) return JSON.parse(raw);
    } catch (e) {}

    return null;
}

// Resuelve asíncronamente el equipo posicionado en una ranura (local o visitante) de cualquier ronda
function resolverRanuraCuadro(torneoId, fId, jNum, esLocal, matchEnBD = null) {
    const tId = torneoId || torneoSeleccionadoId;

    // 1. Si el partido existe en BD y tiene equipo real asignado
    if (matchEnBD) {
        const eqId = esLocal
            ? obtenerPropiedad(matchEnBD, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId'])
            : obtenerPropiedad(matchEnBD, ['equipo_Visitante_Id', 'equipo_visitante_id', 'equipoVisitanteId']);
        if (eqId && Number(eqId) > 0) {
            const nom = esLocal
                ? (matchEnBD.equipoLocalNombre || matchEnBD.EquipoLocalNombre || obtenerNombreEquipo(eqId))
                : (matchEnBD.equipoVisitanteNombre || matchEnBD.EquipoVisitanteNombre || obtenerNombreEquipo(eqId));
            if (nom && nom !== 'Equipo Desconocido' && nom !== '-') {
                return { id: eqId, nombre: nom, definido: true };
            }
        }
    }

    // 2. Si hay un avance asíncrono individual guardado en slot
    try {
        const slotKey = `playoff_slot_${tId}_${fId}_${jNum}_${esLocal ? 'loc' : 'vis'}`;
        const raw = localStorage.getItem(slotKey);
        if (raw) {
            const data = JSON.parse(raw);
            if (data && data.nombre) {
                return { id: data.id, nombre: data.nombre, definido: true };
            }
        }
    } catch (e) {}

    // 3. Si la llave previa de la que proviene esta ranura ya finalizó
    const prevFase = fId * 2;
    const fasesTorneo = obtenerFasesDisponiblesCuadro(tId);
    if (prevFase <= 16 && Array.isArray(fasesTorneo) && fasesTorneo.includes(prevFase)) {
        const prevJ = esLocal ? ((jNum * 2) - 1) : (jNum * 2);
        const ganador = resolverGanadorLlavePlayoff(tId, prevFase, prevJ);
        if (ganador && ganador.nombre) {
            return { id: ganador.id, nombre: ganador.nombre, definido: true };
        }

        let nomFaseCorta = 'Ronda Previa';
        if (prevFase === 16) nomFaseCorta = 'Octavos';
        else if (prevFase === 8) nomFaseCorta = 'Cuartos';
        else if (prevFase === 4) nomFaseCorta = 'Semifinal';

        return { id: null, nombre: `Ganador ${nomFaseCorta} ${prevJ}`, definido: false };
    }

    return { id: null, nombre: 'Por definir', definido: false };
}

function cargarCuadroSubvista(torneoIdParam = null) {
    if (torneoIdParam) {
        torneoSeleccionadoId = torneoIdParam;
    }
    const tId = torneoIdParam || torneoSeleccionadoId;
    const container = document.getElementById('cuadro-container');
    if (!container) return;

    if (!tId) {
        container.innerHTML = '<p style="text-align:center; color:#888; padding:30px;">Selecciona un torneo primero.</p>';
        return;
    }

    try {
        const partidosCuadro = listaPartidos.filter(p => {
            const ptId = obtenerPropiedad(p, ['torneo_Id', 'torneo_id', 'Torneo_Id', 'torneoId']);
            const fId = Number(obtenerPropiedad(p, ['faseId', 'fase_id', 'FaseId']) || 0);
            return String(ptId) === String(tId) && (fId === 16 || fId === 8 || fId === 4 || fId === 2);
        });

    if (partidosCuadro.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #888;">
                <div style="font-size: 32px; margin-bottom: 10px;">🏆</div>
                <h3 style="color: #bbb; margin-bottom: 6px;">Cuadro no disponible aún</h3>
                <p style="font-size: 13px; max-width: 420px; margin: 0 auto;">Este torneo se encuentra en disputa de fase regular. El cuadro de eliminación directa se activará cuando finalice la fase de todos contra todos.</p>
            </div>
        `;
        return;
    }

    const fasesMap = {
        16: { id: 16, titulo: '1/8 DE FINAL', corto: 'Octavos', orden: 1 },
        8:  { id: 8,  titulo: 'CUARTOS DE FINAL', corto: 'Cuartos', orden: 2 },
        4:  { id: 4,  titulo: 'SEMIFINALES', corto: 'Semis', orden: 3 },
        2:  { id: 2,  titulo: 'FINAL', corto: 'Final', orden: 4 }
    };

    // Navegación Total: Todas las rondas subsiguientes están creadas y son navegables de inmediato
    let fasesDisponibles = obtenerFasesDisponiblesCuadro(torneoSeleccionadoId);
    if (!fasesDisponibles || fasesDisponibles.length === 0) {
        const fasesSet = new Set(partidosCuadro.map(p => Number(obtenerPropiedad(p, ['faseId', 'fase_id', 'FaseId']) || 0)).filter(f => f > 0));
        const maxFase = Math.max(...Array.from(fasesSet));
        fasesDisponibles = [16, 8, 4, 2].filter(fId => fId <= maxFase);
    }
    if (!fasesDisponibles || fasesDisponibles.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #888;">
                <div style="font-size: 32px; margin-bottom: 10px;">🏆</div>
                <h3 style="color: #bbb; margin-bottom: 6px;">Cuadro no disponible aún</h3>
                <p style="font-size: 13px; max-width: 420px; margin: 0 auto;">No hay fases de eliminación directa disponibles para este torneo.</p>
            </div>
        `;
        return;
    }

    if (!faseActivaCuadro || (faseActivaCuadro !== 'TODAS' && !fasesDisponibles.includes(Number(faseActivaCuadro)))) {
        const rondaEnJuego = fasesDisponibles.find(fId => 
            partidosCuadro.some(p => Number(obtenerPropiedad(p, ['faseId', 'fase_id', 'FaseId'])) === fId && (obtenerPropiedad(p, ['estado', 'Estado']) || '').toUpperCase() === 'EN_JUEGO')
        );
        faseActivaCuadro = rondaEnJuego || fasesDisponibles[0];
    }

    let pillsHtml = '';
    const isTodasActive = (faseActivaCuadro === 'TODAS');
    pillsHtml += `
        <button class="cuadro-ronda-tab ${isTodasActive ? 'active' : ''}" onclick="seleccionarRondaCuadro('TODAS')">
            🌳 ÁRBOL COMPLETO
        </button>
    `;

    fasesDisponibles.forEach(fId => {
        const info = fasesMap[fId];
        const isActive = (String(fId) === String(faseActivaCuadro));
        pillsHtml += `
            <button class="cuadro-ronda-tab ${isActive ? 'active' : ''}" onclick="seleccionarRondaCuadro(${fId})">
                ${info.titulo}
            </button>
        `;
    });

    const todasLasOpciones = ['TODAS', ...fasesDisponibles];
    const currIdx = todasLasOpciones.indexOf(faseActivaCuadro);
    const hasPrev = currIdx > 0;
    const hasNext = currIdx < todasLasOpciones.length - 1;

    let columnasHtml = '';
    const llavesPorFaseMap = {};

    fasesDisponibles.forEach(fId => {
        const info = fasesMap[fId];
        const numLlaves = fId / 2;
        let llavesHtml = '';

        for (let jNum = 1; jNum <= numLlaves; jNum++) {
            const partidosLlave = partidosCuadro
                .filter(p => Number(obtenerPropiedad(p, ['faseId', 'fase_id', 'FaseId'])) === fId && Number(obtenerPropiedad(p, ['jornada', 'Jornada']) || 1) === jNum)
                .sort((a, b) => Number(obtenerPropiedad(a, ['id', 'Id'])) - Number(obtenerPropiedad(b, ['id', 'Id'])));

            let tituloLlave = `LLAVE ${jNum}`;
            if (fId === 2) tituloLlave = '🏆 GRAN FINAL';
            else if (fId === 4) tituloLlave = `SEMIFINAL ${jNum}`;
            else if (fId === 8) tituloLlave = `CUARTOS ${jNum}`;
            else if (fId === 16) tituloLlave = `OCTAVOS ${jNum}`;

            if (partidosLlave.length > 0) {
                // Hay partidos registrados en BD para esta llave
                const ranuraLoc = resolverRanuraCuadro(torneoSeleccionadoId, fId, jNum, true, partidosLlave[0]) || { id: null, nombre: 'Por definir', definido: false };
                const ranuraVis = resolverRanuraCuadro(torneoSeleccionadoId, fId, jNum, false, partidosLlave[0]) || { id: null, nombre: 'Por definir', definido: false };
                const nomLoc = ranuraLoc.nombre || 'Por definir';
                const nomVis = ranuraVis.nombre || 'Por definir';
                const eqAId = ranuraLoc.id || obtenerPropiedad(partidosLlave[0], ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
                const eqBId = ranuraVis.id || obtenerPropiedad(partidosLlave[0], ['equipo_Visitante_Id', 'equipo_visitante_id', 'equipoVisitanteId']);

                let vicA = 0, vicB = 0, globA = 0, globB = 0;
                let finalizados = 0, enJuego = 0, suspendidos = 0, retrasados = 0;
                let proxPartido = null;

                partidosLlave.forEach(pl => {
                    const est = (obtenerPropiedad(pl, ['estado', 'Estado']) || '').toUpperCase();
                    const estDet = (obtenerPropiedad(pl, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || '').trim().toUpperCase();
                    const pLId = obtenerPropiedad(pl, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
                    const pL = Number(obtenerPropiedad(pl, ['puntos_Local', 'puntos_local', 'puntosLocal']) ?? 0);
                    const pV = Number(obtenerPropiedad(pl, ['puntos_Visitante', 'puntos_visitante', 'puntosVisitante']) ?? 0);

                    const fhVal = obtenerPropiedad(pl, ['fechaHora', 'fecha_hora', 'FechaHora']);
                    const esFhDef = fhVal && !fhVal.startsWith('2099');
                    const dtLocal = parsearFechaHoraLocal(fhVal);
                    const yaPasoHora = esFhDef && dtLocal && (dtLocal.getTime() <= (Date.now() - 60000));
                    const esNoIniciado = (est === 'PROGRAMADO' || est === 'PENDIENTE' || !est);
                    const estaRetrasado = (est !== 'FINALIZADO' && est !== 'TERMINADO' && estDet !== 'FINALIZADO' && est !== 'EN_JUEGO' && est !== 'EN VIVO') &&
                        (esFhDef ? (yaPasoHora && (est === 'RETRASADO' || estDet === 'RETRASADO' || esNoIniciado)) : (est === 'RETRASADO' || estDet === 'RETRASADO'));

                    if (est === 'FINALIZADO' || est === 'TERMINADO' || estDet === 'FINALIZADO') {
                        finalizados++;
                        if (String(pLId) === String(eqAId)) {
                            globA += pL; globB += pV;
                            if (pL > pV) vicA++; else if (pV > pL) vicB++;
                        } else {
                            globB += pL; globA += pV;
                            if (pV > pL) vicA++; else if (pL > pV) vicB++;
                        }
                    } else if (est === 'EN_JUEGO' || est === 'EN VIVO') {
                        enJuego++;
                    } else if (est === 'SUSPENDIDO' || estDet === 'SUSPENDIDO') {
                        suspendidos++;
                    } else if (estaRetrasado) {
                        retrasados++;
                    } else {
                        if (!proxPartido) proxPartido = pl;
                    }
                });

                const totalPartidos = partidosLlave.length;
                let targetWins = 1;
                let esIdaVuelta = false;
                let subTagHtml = '';

                if (totalPartidos === 2) {
                    const tieneTags = partidosLlave.some(p => {
                        const tag = (obtenerPropiedad(p, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || '').toUpperCase();
                        return tag.includes('IDA') || tag.includes('VUELTA');
                    });
                    if (tieneTags) {
                        esIdaVuelta = true;
                        subTagHtml = `<span style="font-size: 9.5px; color: #38bdf8; background: #0c2030; border: 1px solid #0284c7; padding: 1px 5px; border-radius: 3px; font-weight: 700; margin-left: 6px;">Ida/Vuelta</span>`;
                    } else {
                        targetWins = 2;
                        subTagHtml = `<span style="font-size: 9.5px; color: #38bdf8; background: #0c2030; border: 1px solid #0284c7; padding: 1px 5px; border-radius: 3px; font-weight: 700; margin-left: 6px;">Gana 2</span>`;
                    }
                } else if (totalPartidos === 3) {
                    targetWins = 2;
                    subTagHtml = `<span style="font-size: 9.5px; color: #38bdf8; background: #0c2030; border: 1px solid #0284c7; padding: 1px 5px; border-radius: 3px; font-weight: 700; margin-left: 6px;">Gana 2</span>`;
                } else if (totalPartidos === 5) {
                    targetWins = 3;
                    subTagHtml = `<span style="font-size: 9.5px; color: #38bdf8; background: #0c2030; border: 1px solid #0284c7; padding: 1px 5px; border-radius: 3px; font-weight: 700; margin-left: 6px;">Gana 3</span>`;
                } else if (totalPartidos === 7) {
                    targetWins = 4;
                    subTagHtml = `<span style="font-size: 9.5px; color: #38bdf8; background: #0c2030; border: 1px solid #0284c7; padding: 1px 5px; border-radius: 3px; font-weight: 700; margin-left: 6px;">Gana 4</span>`;
                }

                // Cierre anticipado reglamentario
                let serieConcluida = false;
                let serieGanadorA = false;
                let serieGanadorB = false;

                const depLlaveCuadro = obtenerNombreDeportePartido(partidosLlave[0]);
                const esMicroLlaveCuadro = depLlaveCuadro.includes('MICRO') || depLlaveCuadro.includes('SALÓN') || depLlaveCuadro.includes('SALON');
                const esFutbolOMicroLlaveCuadro = esMicroLlaveCuadro || (!depLlaveCuadro.includes('BEISBOL') && !depLlaveCuadro.includes('BÉISBOL') && !depLlaveCuadro.includes('SOFTBOL') && !depLlaveCuadro.includes('VOLEIBOL') && !depLlaveCuadro.includes('VOLLEY') && !depLlaveCuadro.includes('BALONCESTO') && !depLlaveCuadro.includes('BASKET'));
                const esFutbolLlaveCuadro = esFutbolOMicroLlaveCuadro;

                if (totalPartidos === 1) {
                    if (finalizados === 1) {
                        serieConcluida = true;
                        const p0 = partidosLlave[0];
                        const ptsL = Number(obtenerPropiedad(p0, ['puntos_Local', 'puntos_local', 'puntosLocal']) ?? 0);
                        const ptsV = Number(obtenerPropiedad(p0, ['puntos_Visitante', 'puntos_visitante', 'puntosVisitante']) ?? 0);
                        const p0LocId = obtenerPropiedad(p0, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
                        const pen0 = esFutbolLlaveCuadro ? extraerPenalesPartido(p0) : null;
                        if (pen0 && pen0.local !== null && pen0.visitante !== null && pen0.local !== pen0.visitante) {
                            if (String(p0LocId) === String(eqAId)) {
                                serieGanadorA = pen0.local > pen0.visitante;
                                serieGanadorB = pen0.visitante > pen0.local;
                            } else {
                                serieGanadorA = pen0.visitante > pen0.local;
                                serieGanadorB = pen0.local > pen0.visitante;
                            }
                        } else {
                            if (String(p0LocId) === String(eqAId)) {
                                serieGanadorA = ptsL > ptsV;
                                serieGanadorB = ptsV > ptsL;
                            } else {
                                serieGanadorA = ptsV > ptsL;
                                serieGanadorB = ptsL > ptsV;
                            }
                        }
                    }
                } else if (esIdaVuelta) {
                    if (finalizados >= 2) {
                        serieConcluida = true;
                        if (globA > globB) serieGanadorA = true;
                        else if (globB > globA) serieGanadorB = true;
                        else {
                            const tiebreakKey = `playoff_tiebreak_${torneoSeleccionadoId}_${fId}_${jNum}`;
                            const savedWinner = localStorage.getItem(tiebreakKey);
                            let winnerFound = false;
                            if (savedWinner) {
                                try {
                                    const parsed = JSON.parse(savedWinner);
                                    if (parsed && String(parsed.id) === String(eqAId)) { serieGanadorA = true; winnerFound = true; }
                                    else if (parsed && String(parsed.id) === String(eqBId)) { serieGanadorB = true; winnerFound = true; }
                                } catch (e) {}
                            }
                            if (!winnerFound && esFutbolLlaveCuadro) {
                                const pDecisivo = partidosLlave[1] || partidosLlave[0];
                                const penDecisivo = extraerPenalesPartido(pDecisivo) || extraerPenalesPartido(partidosLlave[0]);
                                if (penDecisivo && penDecisivo.local !== null && penDecisivo.visitante !== null && penDecisivo.local !== penDecisivo.visitante) {
                                    const pDecLocId = obtenerPropiedad(pDecisivo, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
                                    if (String(pDecLocId) === String(eqAId)) {
                                        serieGanadorA = penDecisivo.local > penDecisivo.visitante;
                                        serieGanadorB = penDecisivo.visitante > penDecisivo.local;
                                    } else {
                                        serieGanadorA = penDecisivo.visitante > penDecisivo.local;
                                        serieGanadorB = penDecisivo.local > penDecisivo.visitante;
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // Cierre anticipado: Si un equipo alcanza las victorias objetivo
                    if (vicA >= targetWins) {
                        serieConcluida = true;
                        serieGanadorA = true;
                    } else if (vicB >= targetWins) {
                        serieConcluida = true;
                        serieGanadorB = true;
                    } else if (finalizados === totalPartidos) {
                        serieConcluida = true;
                        serieGanadorA = vicA > vicB;
                        serieGanadorB = vicB > vicA;
                    }
                }

                // Resaltar equipo con ventaja o clasificado
                const localDestacado = serieGanadorA || (!serieConcluida && vicA > vicB);
                const visitDestacado = serieGanadorB || (!serieConcluida && vicB > vicA);

                // Marcador principal (victorias de la serie exactamente como Flashscore)
                let scoreA = '-';
                let scoreB = '-';
                let serieDefinidaPorPenales = false;

                if (esFutbolLlaveCuadro) {
                    partidosLlave.forEach(pl => {
                        const pen = extraerPenalesPartido(pl);
                        if (pen && pen.local !== null && pen.visitante !== null) {
                            serieDefinidaPorPenales = true;
                        }
                        const det = (obtenerPropiedad(pl, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || '').toUpperCase();
                        if (det.includes('PEN')) {
                            serieDefinidaPorPenales = true;
                        }
                        const pL = obtenerPropiedad(pl, ['penales_local', 'penalesLocal', 'penales_Local', 'penaleslocal']);
                        const pV = obtenerPropiedad(pl, ['penales_visitante', 'penalesVisitante', 'penales_Visitante', 'penalesvisitante']);
                        if (pL !== null && pL !== undefined && pV !== null && pV !== undefined && !isNaN(pL) && !isNaN(pV)) {
                            serieDefinidaPorPenales = true;
                        }
                    });

                    if (!serieDefinidaPorPenales) {
                        try {
                            const rawTb = localStorage.getItem(`playoff_tiebreak_${torneoSeleccionadoId}_${fId}_${jNum}`);
                            if (rawTb) {
                                const parsedTb = JSON.parse(rawTb);
                                if (parsedTb && (parsedTb.penales || (parsedTb.penales_local !== undefined && parsedTb.penales_visitante !== undefined) || (parsedTb.penalesLocal !== undefined && parsedTb.penalesVisitante !== undefined))) {
                                    serieDefinidaPorPenales = true;
                                }
                            }
                        } catch (e) {}
                    }
                }

                if (totalPartidos === 1) {
                    if (finalizados === 1 || enJuego > 0) {
                        const p0 = partidosLlave[0];
                        const ptsL = Number(obtenerPropiedad(p0, ['puntos_Local', 'puntos_local', 'puntosLocal']) ?? 0);
                        const ptsV = Number(obtenerPropiedad(p0, ['puntos_Visitante', 'puntos_visitante', 'puntosVisitante']) ?? 0);
                        const p0LocId = obtenerPropiedad(p0, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
                        let pen0 = (esFutbolLlaveCuadro && finalizados === 1) ? extraerPenalesPartido(p0) : null;
                        if (!pen0 && esFutbolLlaveCuadro && finalizados === 1) {
                            try {
                                const rawTb = localStorage.getItem(`playoff_tiebreak_${torneoSeleccionadoId}_${fId}_${jNum}`);
                                if (rawTb) {
                                    const parsedTb = JSON.parse(rawTb);
                                    if (parsedTb && parsedTb.penales_local !== undefined && parsedTb.penales_visitante !== undefined && !isNaN(parsedTb.penales_local) && !isNaN(parsedTb.penales_visitante)) {
                                        pen0 = { local: Number(parsedTb.penales_local), visitante: Number(parsedTb.penales_visitante) };
                                    } else if (parsedTb && parsedTb.penales) {
                                        const parts = String(parsedTb.penales).split('-');
                                        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                                            pen0 = { local: Number(parts[0]), visitante: Number(parts[1]) };
                                        }
                                    }
                                }
                            } catch (e) {}
                        }
                        if (pen0 && pen0.local !== null && pen0.visitante !== null) {
                            serieDefinidaPorPenales = true;
                            if (String(p0LocId) === String(eqAId)) {
                                scoreA = `${ptsL}<sup style="font-size:10px; font-weight:800; color:${serieGanadorA ? '#10b981' : '#94a3b8'};">(${pen0.local})</sup>`;
                                scoreB = `${ptsV}<sup style="font-size:10px; font-weight:800; color:${serieGanadorB ? '#10b981' : '#94a3b8'};">(${pen0.visitante})</sup>`;
                            } else {
                                scoreA = `${ptsV}<sup style="font-size:10px; font-weight:800; color:${serieGanadorA ? '#10b981' : '#94a3b8'};">(${pen0.visitante})</sup>`;
                                scoreB = `${ptsL}<sup style="font-size:10px; font-weight:800; color:${serieGanadorB ? '#10b981' : '#94a3b8'};">(${pen0.local})</sup>`;
                            }
                        } else {
                            scoreA = String(p0LocId) === String(eqAId) ? ptsL : ptsV;
                            scoreB = String(p0LocId) === String(eqAId) ? ptsV : ptsL;
                        }
                    }
                } else if (esIdaVuelta) {
                    if (finalizados > 0 || enJuego > 0) {
                        const pVuelta = partidosLlave[1] || partidosLlave[0];
                        let penVuelta = (finalizados >= 2 && esFutbolLlaveCuadro) ? (extraerPenalesPartido(pVuelta) || extraerPenalesPartido(partidosLlave[0])) : null;
                        if (!penVuelta && finalizados >= 2 && esFutbolLlaveCuadro) {
                            try {
                                const rawTb = localStorage.getItem(`playoff_tiebreak_${torneoSeleccionadoId}_${fId}_${jNum}`);
                                if (rawTb) {
                                    const parsedTb = JSON.parse(rawTb);
                                    if (parsedTb && parsedTb.penales_local !== undefined && parsedTb.penales_visitante !== undefined && !isNaN(parsedTb.penales_local) && !isNaN(parsedTb.penales_visitante)) {
                                        penVuelta = { local: Number(parsedTb.penales_local), visitante: Number(parsedTb.penales_visitante) };
                                    } else if (parsedTb && parsedTb.penales) {
                                        const parts = String(parsedTb.penales).split('-');
                                        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                                            penVuelta = { local: Number(parts[0]), visitante: Number(parts[1]) };
                                        }
                                    }
                                }
                            } catch (e) {}
                        }
                        if (penVuelta && penVuelta.local !== null && penVuelta.visitante !== null) {
                            serieDefinidaPorPenales = true;
                            const pVueltaLocId = obtenerPropiedad(pVuelta, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
                            if (String(pVueltaLocId) === String(eqAId)) {
                                scoreA = `${globA}<sup style="font-size:10px; font-weight:800; color:${serieGanadorA ? '#10b981' : '#94a3b8'};">(${penVuelta.local})</sup>`;
                                scoreB = `${globB}<sup style="font-size:10px; font-weight:800; color:${serieGanadorB ? '#10b981' : '#94a3b8'};">(${penVuelta.visitante})</sup>`;
                            } else {
                                scoreA = `${globA}<sup style="font-size:10px; font-weight:800; color:${serieGanadorA ? '#10b981' : '#94a3b8'};">(${penVuelta.visitante})</sup>`;
                                scoreB = `${globB}<sup style="font-size:10px; font-weight:800; color:${serieGanadorB ? '#10b981' : '#94a3b8'};">(${penVuelta.local})</sup>`;
                            }
                        } else {
                            scoreA = globA;
                            scoreB = globB;
                        }
                    }
                } else {
                    if (finalizados > 0 || enJuego > 0) {
                        scoreA = vicA;
                        scoreB = vicB;
                    }
                }

                let idaVueltaDesgloseHtml = '';
                if (esIdaVuelta && partidosLlave.length >= 2 && (finalizados > 0 || enJuego > 0)) {
                    const p1 = partidosLlave[0];
                    const p2 = partidosLlave[1];
                    const p1L = obtenerPropiedad(p1, ['puntos_Local', 'puntos_local', 'puntosLocal']) ?? '-';
                    const p1V = obtenerPropiedad(p1, ['puntos_Visitante', 'puntos_visitante', 'puntosVisitante']) ?? '-';
                    const p2L = obtenerPropiedad(p2, ['puntos_Local', 'puntos_local', 'puntosLocal']) ?? '-';
                    const p2V = obtenerPropiedad(p2, ['puntos_Visitante', 'puntos_visitante', 'puntosVisitante']) ?? '-';
                    idaVueltaDesgloseHtml = `
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 9.5px; color: #94a3b8; background: #0c0d12; padding: 2px 8px; border-top: 1px dashed #242531; margin-top: 4px; border-radius: 4px;">
                            <span>Ida: <strong style="color:#cbd5e1;">${p1L}-${p1V}</strong> | Vta: <strong style="color:#cbd5e1;">${p2L}-${p2V}</strong></span>
                            <span style="color:#38bdf8; font-weight:700;">Global: ${globA}-${globB}</span>
                        </div>
                    `;
                }

                // Badge de estado de la llave
                let badgeHtml = '';
                if (serieConcluida) {
                    if (serieDefinidaPorPenales) {
                        badgeHtml = '<span style="color: #10b981; font-weight: 700; font-size: 10px;">FINAL</span> <span style="font-size: 9.5px; font-weight: 800; color: #ec4899; background: rgba(236, 72, 153, 0.12); border: 1px solid rgba(236, 72, 153, 0.3); padding: 1px 5px; border-radius: 3px; letter-spacing: 0.3px; margin-left: 3px;" title="Definido por tanda de penales">Tras pen.</span>';
                    } else {
                        badgeHtml = '<span style="color: #10b981; font-weight: 700; font-size: 10px;">FINAL</span>';
                    }
                } else if (enJuego > 0) {
                    badgeHtml = '<span style="background: #e11d48; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 800;">EN VIVO</span>';
                } else if (suspendidos > 0) {
                    badgeHtml = '<span style="color: #fbbf24; background: rgba(217, 119, 6, 0.15); border: 1px solid #d97706; padding: 1px 5px; border-radius: 3px; font-weight: 700; font-size: 9.5px;">⚠️ SUSPENDIDO</span>';
                } else if (retrasados > 0) {
                    badgeHtml = '<span style="color: #f59e0b; background: rgba(245, 158, 11, 0.15); border: 1px solid #d97706; padding: 1px 5px; border-radius: 3px; font-weight: 700; font-size: 9.5px;">⏳ RETRASADO</span>';
                } else if (proxPartido && esFechaPorDefinir(proxPartido)) {
                    badgeHtml = '<span style="color: #f59e0b; background: #2a2024; border: 1px solid #d97706; padding: 1px 5px; border-radius: 3px; font-weight: 700; font-size: 9.5px; letter-spacing: 0.3px;">POR DEFINIR</span>';
                } else if (proxPartido) {
                    const horaStr = extraerHoraPartido(proxPartido) || 'PROG.';
                    badgeHtml = `<span style="color: #6366f1; font-weight: 700; font-size: 10px;">${horaStr}</span>`;
                } else {
                    badgeHtml = '<span style="color: #8d8d99; font-weight: 700; font-size: 10px;">PROG.</span>';
                }

                llavesHtml += `
                    <div class="cuadro-match-card" onclick="abrirDetalleSeriePlayoff(${tId}, ${fId}, ${jNum})">
                        <div class="cuadro-match-header">
                            <span style="letter-spacing: 0.5px; display: inline-flex; align-items: center;">${tituloLlave}${subTagHtml}</span>
                            <span style="display: inline-flex; align-items: center; gap: 4px;">${badgeHtml}</span>
                        </div>
                        <div class="cuadro-team-row ${localDestacado ? 'winner' : ''}">
                            <div class="cuadro-team-name ${ranuraLoc.definido ? '' : 'placeholder'}" title="${nomLoc}">
                                <span style="font-size: 12px;">${ranuraLoc.definido ? '🏠' : '⏳'}</span>
                                <span>${nomLoc}</span>
                                ${localDestacado && serieConcluida ? '<span style="color:#10b981; font-weight:900; font-size:9.5px; margin-left:4px;" title="Avanza">▶</span>' : ''}
                            </div>
                            <div class="cuadro-team-score">${scoreA}</div>
                        </div>
                        <div class="cuadro-team-row ${visitDestacado ? 'winner' : ''}">
                            <div class="cuadro-team-name ${ranuraVis.definido ? '' : 'placeholder'}" title="${nomVis}">
                                <span style="font-size: 12px;">✈️</span>
                                <span>${nomVis}</span>
                                ${visitDestacado && serieConcluida ? '<span style="color:#10b981; font-weight:900; font-size:9.5px; margin-left:4px;" title="Avanza">▶</span>' : ''}
                            </div>
                            <div class="cuadro-team-score">${scoreB}</div>
                        </div>
                        ${idaVueltaDesgloseHtml}
                    </div>
                `;

                if (fId === 2 && serieConcluida) {
                    const campeon = serieGanadorA ? { id: eqAId, nombre: nomLoc } : (serieGanadorB ? { id: eqBId, nombre: nomVis } : resolverGanadorLlavePlayoff(tId, 2, 1));
                    if (campeon && campeon.nombre) {
                        llavesHtml += `
                            <div style="text-align: center; margin-top: 10px; padding: 8px 12px; background: rgba(255, 215, 0, 0.12); border: 1px solid #ffd700; border-radius: 6px; box-shadow: 0 0 12px rgba(255, 215, 0, 0.25);">
                                <div style="font-size: 10px; font-weight: 800; color: #ffd700; letter-spacing: 1px; text-transform: uppercase;">👑 ¡CAMPEÓN DEL TORNEO!</div>
                                <div style="font-size: 14px; font-weight: 800; color: #ffffff; margin-top: 2px;">🏆 ${campeon.nombre}</div>
                            </div>
                        `;
                    }
                }
            } else {
                // Cajas pre-renderizadas estructurales enlazadas por líneas (Estilo Flashscore)
                const ranuraLoc = resolverRanuraCuadro(tId, fId, jNum, true, null) || { id: null, nombre: 'Por definir', definido: false };
                const ranuraVis = resolverRanuraCuadro(tId, fId, jNum, false, null) || { id: null, nombre: 'Por definir', definido: false };
                const nomLoc = ranuraLoc.nombre || 'Por definir';
                const nomVis = ranuraVis.nombre || 'Por definir';

                llavesHtml += `
                    <div class="cuadro-match-card structural-card" onclick="mostrarInfoLlavePendiente('${tituloLlave}', '${nomLoc}', '${nomVis}')">
                        <div class="cuadro-match-header">
                            <span style="letter-spacing: 0.5px;">${tituloLlave}</span>
                            <span><span style="color: #f59e0b; background: #2a2024; border: 1px solid #d97706; padding: 1px 5px; border-radius: 3px; font-weight: 700; font-size: 9.5px; letter-spacing: 0.3px;">POR DEFINIR</span></span>
                        </div>
                        <div class="cuadro-team-row">
                            <div class="cuadro-team-name ${ranuraLoc.definido ? '' : 'placeholder'}" title="${nomLoc}">
                                <span style="font-size: 12px;">${ranuraLoc.definido ? '🏠' : '⏳'}</span>
                                <span style="${ranuraLoc.definido ? 'font-weight: 700; color: #fff;' : 'color: #8d8d99; font-style: italic;'}">${nomLoc}</span>
                            </div>
                            <div class="cuadro-team-score">-</div>
                        </div>
                        <div class="cuadro-team-row">
                            <div class="cuadro-team-name ${ranuraVis.definido ? '' : 'placeholder'}" title="${nomVis}">
                                <span style="font-size: 12px;">✈️</span>
                                <span style="${ranuraVis.definido ? 'font-weight: 700; color: #fff;' : 'color: #8d8d99; font-style: italic;'}">${nomVis}</span>
                            </div>
                            <div class="cuadro-team-score">-</div>
                        </div>
                    </div>
                `;
            }
        }

        llavesPorFaseMap[fId] = llavesHtml;

        columnasHtml += `
            <div class="cuadro-round-col" id="col-fase-${fId}" data-fase="${fId}">
                <div class="cuadro-round-header">
                    <span>${info.titulo}</span>
                    <span style="font-size: 10px; color: #8d8d99; font-weight: 600;">${numLlaves} ${numLlaves === 1 ? 'partido' : 'partidos'}</span>
                </div>
                <div class="cuadro-llaves-wrapper">
                    ${llavesHtml}
                </div>
            </div>
        `;
    });

    let contenidoCuadroHtml = '';
    if (faseActivaCuadro === 'TODAS') {
        contenidoCuadroHtml = `
            <div class="cuadro-tree-container" id="cuadro-tree-scroll">
                ${columnasHtml}
            </div>
        `;
    } else {
        const infoActiva = fasesMap[faseActivaCuadro] || { titulo: 'RONDA DE PLAYOFF' };
        const llavesDeFaseActiva = llavesPorFaseMap[faseActivaCuadro] || '';
        const numLlavesActiva = Number(faseActivaCuadro) / 2;
        contenidoCuadroHtml = `
            <div class="cuadro-fase-centrada">
                <div class="cuadro-fase-header">
                    <div>
                        <h3>${infoActiva.titulo}</h3>
                        <span>${numLlavesActiva} ${numLlavesActiva === 1 ? 'enfrentamiento' : 'enfrentamientos'}</span>
                    </div>
                </div>
                <div class="cuadro-llaves-grid">
                    ${llavesDeFaseActiva}
                </div>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="cuadro-wrapper">
            <div class="cuadro-nav-bar">
                <button class="cuadro-nav-arrow" onclick="navegarRondaCuadro(-1)" ${!hasPrev ? 'disabled' : ''} title="Ronda anterior">
                    &lt;
                </button>
                <div class="cuadro-rondas-pills">
                    ${pillsHtml}
                </div>
                <button class="cuadro-nav-arrow" onclick="navegarRondaCuadro(1)" ${!hasNext ? 'disabled' : ''} title="Siguiente ronda">
                    &gt;
                </button>
            </div>
            ${contenidoCuadroHtml}
        </div>
    `;

    setTimeout(() => {
        if (faseActivaCuadro === 'TODAS') {
            const col = document.getElementById('col-fase-4') || document.getElementById('col-fase-2');
            if (col && window.innerWidth <= 768) {
                col.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        }
    }, 50);
    } catch (errCuadro) {
        console.error('Error al renderizar el cuadro de playoffs:', errCuadro);
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #ef4444;">
                <div style="font-size: 32px; margin-bottom: 10px;">⚠️</div>
                <h4 style="margin-bottom: 6px; color: #f87171;">Error al cargar el cuadro</h4>
                <p style="font-size: 13px; color: #9ca3af;">Ocurrió un error inesperado al procesar las llaves del torneo.</p>
            </div>
        `;
    }
}

window.seleccionarRondaCuadro = function(fId) {
    faseActivaCuadro = fId;
    cargarCuadroSubvista();
};

window.navegarRondaCuadro = function(delta) {
    const fasesDisponibles = obtenerFasesDisponiblesCuadro(torneoSeleccionadoId);
    const todasLasOpciones = ['TODAS', ...fasesDisponibles];
    const currIdx = todasLasOpciones.indexOf(faseActivaCuadro);
    if (currIdx === -1) return;
    const newIdx = currIdx + delta;
    if (newIdx >= 0 && newIdx < todasLasOpciones.length) {
        faseActivaCuadro = todasLasOpciones[newIdx];
        cargarCuadroSubvista();
    }
};

window.irACuadroFase = function(tId, fId, depId = null) {
    const targetTorneoId = tId || torneoSeleccionadoId;
    if (!targetTorneoId) return;

    torneoSeleccionadoId = targetTorneoId;

    // 1. Obtener torneo y deporte asociado
    let torObj = listaTorneos.find(t => String(obtenerPropiedad(t, ['id', 'Id'])) === String(targetTorneoId));
    let targetDepId = depId;
    if (!targetDepId && torObj) {
        targetDepId = obtenerPropiedad(torObj, ['deporte_id', 'deporteId', 'DeporteId']) 
            ?? (torObj.deporte ? (torObj.deporte.id ?? torObj.deporte.Id) : null);
    }

    if (targetDepId) {
        const depObj = listaDeportes.find(d => String(obtenerPropiedad(d, ['id', 'Id'])) === String(targetDepId));
        if (depObj) {
            deporteSeleccionado = depObj;
            document.querySelectorAll('.sport-btn').forEach(b => {
                const bId = b.getAttribute('data-id') || b.dataset.id;
                b.classList.toggle('active', String(bId) === String(targetDepId));
            });
        }
    }

    const nomTor = torObj ? (obtenerPropiedad(torObj, ['nombre', 'Nombre']) || `#${targetTorneoId}`) : `#${targetTorneoId}`;

    // 2. Navegar directamente al torneo activo en vista de detalle
    const vistaListaTorneos = document.getElementById('vista-lista-torneos');
    const vistaDetalleTorneo = document.getElementById('vista-detalle-torneo');
    if (vistaListaTorneos) vistaListaTorneos.classList.add('hidden');
    if (vistaDetalleTorneo) vistaDetalleTorneo.classList.remove('hidden');

    const headerTorneo = document.getElementById('header-torneo-detalle');
    if (headerTorneo) headerTorneo.innerHTML = `🏆 ${nomTor}`;

    // 3. Activar pestaña y subvista Cuadro (#subvista-cuadro / tab-cuadro / btnSubvistaCuadro)
    const tabCuadro = document.getElementById('tab-cuadro') || document.getElementById('btnSubvistaCuadro');
    if (tabCuadro) {
        tabCuadro.classList.remove('hidden');
        tabCuadro.classList.add('active');
    }

    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        if (btn !== tabCuadro) btn.classList.remove('active');
    });
    document.querySelectorAll('.sub-vista-content').forEach(vista => {
        vista.classList.add('hidden');
    });

    const subvistaCuadro = document.getElementById('subvista-cuadro');
    if (subvistaCuadro) {
        subvistaCuadro.classList.remove('hidden');
    }

    // 4. Configurar fase activa
    faseActivaCuadro = fId || 'TODAS';

    // 5. Ejecutar inmediatamente el renderizado del cuadro de playoffs
    cargarCuadroSubvista(targetTorneoId);
};

window.cargarCuadroSubvista = cargarCuadroSubvista;
window.renderizarCuadroPlayoff = cargarCuadroSubvista;

window.mostrarInfoLlavePendiente = function(titulo, loc, vis) {
    mostrarToast(`ℹ️ ${titulo}: ${loc} vs ${vis}. Esta llave se disputará cuando finalicen las rondas previas.`, 'info');
};

window.abrirDetallePartidoPorId = function(pId) {
    const p = listaPartidos.find(x => String(obtenerPropiedad(x, ['id', 'Id'])) === String(pId));
    if (p) abrirDetallePartido(p);
};

// ============================================================================
// MODAL DE DETALLE DE SERIE DE PLAYOFF TIPO FLASHSCORE
// ============================================================================

function asegurarModalSeriePlayoff() {
    let modal = document.getElementById('modal-serie-playoff');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-serie-playoff';
        modal.className = 'modal hidden';
        modal.style.zIndex = '10006';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 540px; background: #14151a; border: 1px solid #2e2f3b; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.85);">
                <div class="modal-header" style="border-bottom: 1px solid #23242c; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center;">
                    <span id="modal-serie-titulo" style="font-size: 13px; font-weight: 800; color: #ff0044; text-transform: uppercase; letter-spacing: 0.5px;">Detalle de la Serie</span>
                    <button class="btn-cerrar" onclick="cerrarModalSeriePlayoff()" style="font-size: 22px; cursor: pointer; color: #aaa; background: none; border: none; padding: 0 4px;">&times;</button>
                </div>
                <div class="modal-body" id="modal-serie-body" style="padding: 16px 18px;">
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) cerrarModalSeriePlayoff();
        });
    }
}

window.cerrarModalSeriePlayoff = function() {
    const modal = document.getElementById('modal-serie-playoff');
    if (modal) modal.classList.add('hidden');
};

window.abrirDetalleSeriePlayoff = function(torneoId, fId, jNum) {
    const tId = torneoId || torneoSeleccionadoId;
    const partidosLlave = listaPartidos
        .filter(p => Number(obtenerPropiedad(p, ['torneo_Id', 'torneo_id', 'Torneo_Id', 'torneoId'])) === Number(tId) &&
                     Number(obtenerPropiedad(p, ['faseId', 'fase_id', 'FaseId'])) === Number(fId) &&
                     Number(obtenerPropiedad(p, ['jornada', 'Jornada']) || 1) === Number(jNum))
        .sort((a, b) => Number(obtenerPropiedad(a, ['id', 'Id'])) - Number(obtenerPropiedad(b, ['id', 'Id'])));

    if (partidosLlave.length === 0) {
        mostrarToast('Esta llave aún no tiene partidos registrados.', 'info');
        return;
    }

    asegurarModalSeriePlayoff();

    const ranuraLoc = resolverRanuraCuadro(tId, fId, jNum, true, partidosLlave[0]) || { id: null, nombre: 'Equipo Local', definido: false };
    const ranuraVis = resolverRanuraCuadro(tId, fId, jNum, false, partidosLlave[0]) || { id: null, nombre: 'Equipo Visitante', definido: false };
    const nomA = ranuraLoc.nombre || 'Equipo Local';
    const nomB = ranuraVis.nombre || 'Equipo Visitante';
    const eqAId = ranuraLoc.id || obtenerPropiedad(partidosLlave[0], ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
    const eqBId = ranuraVis.id || obtenerPropiedad(partidosLlave[0], ['equipo_Visitante_Id', 'equipo_visitante_id', 'equipoVisitanteId']);

    let vicA = 0, vicB = 0, globA = 0, globB = 0, finalizados = 0, enJuego = 0;
    partidosLlave.forEach(pl => {
        const est = (obtenerPropiedad(pl, ['estado', 'Estado']) || '').toUpperCase();
        const estDet = (obtenerPropiedad(pl, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || '').trim().toUpperCase();
        const pLId = obtenerPropiedad(pl, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
        const pL = Number(obtenerPropiedad(pl, ['puntos_Local', 'puntos_local', 'puntosLocal']) ?? 0);
        const pV = Number(obtenerPropiedad(pl, ['puntos_Visitante', 'puntos_visitante', 'puntosVisitante']) ?? 0);

        if (est === 'FINALIZADO' || est === 'TERMINADO' || estDet === 'FINALIZADO') {
            finalizados++;
            if (String(pLId) === String(eqAId)) {
                globA += pL; globB += pV;
                if (pL > pV) vicA++; else if (pV > pL) vicB++;
            } else {
                globB += pL; globA += pV;
                if (pV > pL) vicA++; else if (pL > pV) vicB++;
            }
        } else if (est === 'EN_JUEGO' || est === 'EN VIVO') {
            enJuego++;
        }
    });

    const totalPartidos = partidosLlave.length;
    let targetWins = 1;
    let esIdaVuelta = false;
    let formatoNombre = 'Partido Único';

    if (totalPartidos === 2) {
        const tieneTags = partidosLlave.some(p => {
            const tag = (obtenerPropiedad(p, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || '').toUpperCase();
            return tag.includes('IDA') || tag.includes('VUELTA');
        });
        if (tieneTags) {
            esIdaVuelta = true;
            formatoNombre = 'Ida y Vuelta (Global)';
        } else {
            targetWins = 2;
            formatoNombre = 'Al mejor de 3 (Gana 2)';
        }
    } else if (totalPartidos === 3) {
        targetWins = 2;
        formatoNombre = 'Al mejor de 3 (Gana 2)';
    } else if (totalPartidos === 5) {
        targetWins = 3;
        formatoNombre = 'Al mejor de 5 (Gana 3)';
    } else if (totalPartidos === 7) {
        targetWins = 4;
        formatoNombre = 'Al mejor de 7 (Gana 4)';
    }

    // Serie concluida (Cierre anticipado universal)
    const serieConcluida = (totalPartidos === 1 && finalizados === 1) ||
        (esIdaVuelta && finalizados >= 2) ||
        (!esIdaVuelta && totalPartidos > 1 && (vicA >= targetWins || vicB >= targetWins || finalizados === totalPartidos));

    // Leyenda Institucional Requerida
    let leyendaInstitucional = '';
    let colorLeyenda = '#38bdf8';

    const depSerie = obtenerNombreDeportePartido(partidosLlave[0]);
    const esMicroSerie = depSerie.includes('MICRO') || depSerie.includes('SALÓN') || depSerie.includes('SALON');
    const esFutbolOMicroSerie = esMicroSerie || (!depSerie.includes('BEISBOL') && !depSerie.includes('BÉISBOL') && !depSerie.includes('SOFTBOL') && !depSerie.includes('VOLEIBOL') && !depSerie.includes('VOLLEY') && !depSerie.includes('BALONCESTO') && !depSerie.includes('BASKET'));
    const esFutbolSerie = esFutbolOMicroSerie;

    if (totalPartidos === 1) {
        if (finalizados === 1) {
            const pen0 = esFutbolSerie ? extraerPenalesPartido(partidosLlave[0]) : null;
            if (pen0 && pen0.local !== null && pen0.visitante !== null && pen0.local !== pen0.visitante) {
                const ganLoc = pen0.local > pen0.visitante;
                const nomGan = ganLoc ? nomA : nomB;
                leyendaInstitucional = `🏆 ${nomGan} gana el partido en penales (${globA} - ${globB}, pen. ${pen0.local}-${pen0.visitante})`;
                colorLeyenda = '#2ed573';
            } else if (vicA > vicB) {
                leyendaInstitucional = `🏆 ${nomA} gana el partido (${globA} - ${globB})`;
                colorLeyenda = '#2ed573';
            } else if (vicB > vicA) {
                leyendaInstitucional = `🏆 ${nomB} gana el partido (${globB} - ${globA})`;
                colorLeyenda = '#2ed573';
            } else {
                leyendaInstitucional = `🤝 Partido empatado (${globA} - ${globB})`;
                colorLeyenda = '#fbbf24';
            }
        } else {
            leyendaInstitucional = `⏳ Partido programado por disputar`;
            colorLeyenda = '#94a3b8';
        }
    } else if (esIdaVuelta) {
        if (finalizados >= 2) {
            const pVuelta = partidosLlave[1] || partidosLlave[0];
            const penVuelta = esFutbolSerie ? (extraerPenalesPartido(pVuelta) || extraerPenalesPartido(partidosLlave[0])) : null;
            if (globA > globB) {
                leyendaInstitucional = `🏆 ${nomA} gana la serie en el global ${globA}-${globB}`;
                colorLeyenda = '#2ed573';
            } else if (globB > globA) {
                leyendaInstitucional = `🏆 ${nomB} gana la serie en el global ${globB}-${globA}`;
                colorLeyenda = '#2ed573';
            } else if (penVuelta && penVuelta.local !== null && penVuelta.visitante !== null && penVuelta.local !== penVuelta.visitante) {
                const pVueltaLocId = obtenerPropiedad(pVuelta, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
                const ganA = (String(pVueltaLocId) === String(eqAId)) ? (penVuelta.local > penVuelta.visitante) : (penVuelta.visitante > penVuelta.local);
                const nomGan = ganA ? nomA : nomB;
                leyendaInstitucional = `🏆 ${nomGan} gana la serie en penales (Global ${globA}-${globB}, pen. ${penVuelta.local}-${penVuelta.visitante})`;
                colorLeyenda = '#2ed573';
            } else {
                leyendaInstitucional = `🤝 Marcador global empatado ${globA}-${globB}`;
                colorLeyenda = '#fbbf24';
            }
        } else if (finalizados === 1) {
            if (globA > globB) leyendaInstitucional = `🔥 ${nomA} tiene ventaja en la serie ${globA}-${globB}`;
            else if (globB > globA) leyendaInstitucional = `🔥 ${nomB} tiene ventaja en la serie ${globB}-${globA}`;
            else leyendaInstitucional = `🤝 Serie empatada en la ida ${globA}-${globB}`;
        } else {
            leyendaInstitucional = `⏳ Serie de Ida y Vuelta programada`;
            colorLeyenda = '#94a3b8';
        }
    } else {
        // Al mejor de 3, 5, 7
        if (serieConcluida) {
            if (vicA > vicB) {
                leyendaInstitucional = `🏆 ${nomA} gana la serie ${vicA}-${vicB}`;
                colorLeyenda = '#2ed573';
            } else if (vicB > vicA) {
                leyendaInstitucional = `🏆 ${nomB} gana la serie ${vicB}-${vicA}`;
                colorLeyenda = '#2ed573';
            } else {
                leyendaInstitucional = `🤝 Serie finalizada en empate ${vicA}-${vicB}`;
                colorLeyenda = '#fbbf24';
            }
        } else {
            if (finalizados === 0 && enJuego === 0) {
                leyendaInstitucional = `⏳ Serie programada por disputar`;
                colorLeyenda = '#94a3b8';
            } else if (vicA > vicB) {
                leyendaInstitucional = `🔥 ${nomA} domina la serie ${vicA}-${vicB}`;
                colorLeyenda = '#38bdf8';
            } else if (vicB > vicA) {
                leyendaInstitucional = `🔥 ${nomB} domina la serie ${vicB}-${vicA}`;
                colorLeyenda = '#38bdf8';
            } else {
                leyendaInstitucional = `🤝 Serie empatada ${vicA}-${vicB}`;
                colorLeyenda = '#fbbf24';
            }
        }
    }

    // Lista de juegos disputados o programados
    let listaJuegosHtml = '';
    partidosLlave.forEach((p, idx) => {
        const pId = obtenerPropiedad(p, ['id', 'Id']);
        const pLocId = obtenerPropiedad(p, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
        const pVisId = obtenerPropiedad(p, ['equipo_Visitante_Id', 'equipo_visitante_id', 'equipoVisitanteId']);
        const locNom = obtenerPropiedad(p, ['equipoLocalNombre', 'EquipoLocalNombre']) || obtenerNombreEquipo(pLocId);
        const visNom = obtenerPropiedad(p, ['equipoVisitanteNombre', 'EquipoVisitanteNombre']) || obtenerNombreEquipo(pVisId);
        const ptsL = Number(obtenerPropiedad(p, ['puntos_Local', 'puntos_local', 'puntosLocal']) ?? 0);
        const ptsV = Number(obtenerPropiedad(p, ['puntos_Visitante', 'puntos_visitante', 'puntosVisitante']) ?? 0);
        const estadoRaw = (obtenerPropiedad(p, ['estado', 'Estado']) || 'PROGRAMADO').toUpperCase();
        const estDetalle = (obtenerPropiedad(p, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || '').trim().toUpperCase();
        const esFin = (estadoRaw === 'FINALIZADO' || estadoRaw === 'TERMINADO' || estDetalle === 'FINALIZADO');
        const esVivo = (estadoRaw === 'EN_JUEGO' || estadoRaw === 'EN VIVO');

        // Si la serie ya concluyó anticipadamente y este juego nunca se inició:
        const esJuegoOmitido = serieConcluida && !esFin && !esVivo && (idx >= finalizados);

        const penJuego = esFutbolSerie ? extraerPenalesPartido(p) : null;
        const tienePenJuego = penJuego && penJuego.local !== null && penJuego.visitante !== null;
        const ganJuegoLoc = tienePenJuego ? (penJuego.local > penJuego.visitante) : (ptsL > ptsV);
        const ganJuegoVis = tienePenJuego ? (penJuego.visitante > penJuego.local) : (ptsV > ptsL);
        const scoreJuegoL = (estadoRaw === 'PROGRAMADO' || esJuegoOmitido) ? '-' : (tienePenJuego ? `${ptsL}<sup>(${penJuego.local})</sup>` : ptsL);
        const scoreJuegoV = (estadoRaw === 'PROGRAMADO' || esJuegoOmitido) ? '-' : (tienePenJuego ? `${ptsV}<sup>(${penJuego.visitante})</sup>` : ptsV);

        let tagJuego = estDetalle || `Juego ${idx + 1}`;
        if (!tagJuego || tagJuego === 'PROGRAMADO') tagJuego = `Juego ${idx + 1}`;
        if (tienePenJuego && !tagJuego.includes('PEN.')) tagJuego += ' (Tras Pen.)';

        let statusBadge = '';
        if (esJuegoOmitido) {
            statusBadge = `<span style="font-size: 10px; color: #94a3b8; background: #1e293b; padding: 2px 6px; border-radius: 4px; font-weight: 700;">No necesario (Serie concluida)</span>`;
        } else if (esFin) {
            statusBadge = `<span style="font-size: 10px; color: #2ed573; background: rgba(46, 213, 115, 0.1); border: 1px solid #2ed573; padding: 1px 5px; border-radius: 3px; font-weight: 800;">${tienePenJuego ? 'FINAL (PEN.)' : 'FINAL'}</span>`;
        } else if (esVivo) {
            statusBadge = `<span style="font-size: 10px; color: #fff; background: #e11d48; padding: 2px 6px; border-radius: 4px; font-weight: 800;">EN VIVO</span>`;
        } else if (estadoRaw === 'SUSPENDIDO') {
            statusBadge = `<span style="font-size: 10px; color: #fbbf24; background: rgba(217, 119, 6, 0.15); border: 1px solid #d97706; padding: 1px 5px; border-radius: 3px; font-weight: 700;">⚠️ SUSPENDIDO</span>`;
        } else if (estadoRaw === 'RETRASADO') {
            statusBadge = `<span style="font-size: 10px; color: #f59e0b; background: rgba(245, 158, 11, 0.15); border: 1px solid #d97706; padding: 1px 5px; border-radius: 3px; font-weight: 700;">⏳ RETRASADO</span>`;
        } else if (esFechaPorDefinir(p)) {
            statusBadge = `<span style="font-size: 10px; color: #f59e0b; background: #2a2024; border: 1px solid #d97706; padding: 1px 5px; border-radius: 3px; font-weight: 700;">POR DEFINIR</span>`;
        } else {
            const h = extraerHoraPartido(p) || 'PROG.';
            statusBadge = `<span style="font-size: 10px; color: #6366f1; font-weight: 700;">${h}</span>`;
        }

        const fhStr = esFechaPorDefinir(p) ? 'Fecha por definir' : `${extraerFechaPartido(p)} • ${extraerHoraPartido(p)}`;
        const canchaNom = obtenerNombreCancha(obtenerPropiedad(p, ['canchaId', 'cancha_id', 'CanchaId']));

        listaJuegosHtml += `
            <div style="background: #181920; border: 1px solid ${esJuegoOmitido ? '#282934' : '#2e303d'}; border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; opacity: ${esJuegoOmitido ? '0.65' : '1'};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid #23242e; padding-bottom: 6px;">
                    <span style="font-size: 11px; font-weight: 800; color: #ff0044; text-transform: uppercase;">
                        📌 ${tagJuego}
                    </span>
                    <span>${statusBadge}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="flex: 1;">
                        <div style="font-size: 13px; font-weight: ${esFin && ganJuegoLoc ? '800' : '600'}; color: ${esFin && ganJuegoLoc ? '#2ed573' : '#fff'}; display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                            <span>🏠</span>
                            <span>${locNom}</span>
                            ${esFin && ganJuegoLoc && tienePenJuego ? '<span style="color:#10b981; font-size:10px; font-weight:800;">▶</span>' : ''}
                        </div>
                        <div style="font-size: 13px; font-weight: ${esFin && ganJuegoVis ? '800' : '600'}; color: ${esFin && ganJuegoVis ? '#2ed573' : '#fff'}; display: flex; align-items: center; gap: 6px;">
                            <span>✈️</span>
                            <span>${visNom}</span>
                            ${esFin && ganJuegoVis && tienePenJuego ? '<span style="color:#10b981; font-size:10px; font-weight:800;">▶</span>' : ''}
                        </div>
                    </div>
                    <div style="text-align: right; font-family: monospace; font-size: 16px; font-weight: 800; min-width: 50px;">
                        <div style="color: ${esFin && ganJuegoLoc ? '#2ed573' : '#fff'};">${scoreJuegoL}</div>
                        <div style="color: ${esFin && ganJuegoVis ? '#2ed573' : '#fff'}; margin-top: 4px;">${scoreJuegoV}</div>
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; color: #8d8d99; border-top: 1px solid #1f202a; padding-top: 6px;">
                    <span>📅 ${fhStr} | 🏟️ ${canchaNom}</span>
                    ${!esJuegoOmitido ? `<button onclick="abrirDetallePartidoPorId(${pId})" style="background: transparent; border: 1px solid #3b3d4d; color: #38bdf8; font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 4px; cursor: pointer;">Ver Ficha</button>` : ''}
                </div>
            </div>
        `;
    });

    const modalBody = document.getElementById('modal-serie-body');
    const modalTitulo = document.getElementById('modal-serie-titulo');
    let tituloFase = `Llave ${jNum}`;
    if (fId === 2) tituloFase = '🏆 Gran Final';
    else if (fId === 4) tituloFase = `Semifinal ${jNum}`;
    else if (fId === 8) tituloFase = `Cuartos - Llave ${jNum}`;
    else if (fId === 16) tituloFase = `Octavos - Llave ${jNum}`;

    if (modalTitulo) {
        modalTitulo.innerHTML = `DETALLE DE LA SERIE: ${tituloFase}`;
    }

    if (modalBody) {
        modalBody.innerHTML = `
            <div style="text-align: center; margin-bottom: 16px; padding: 12px; background: #181920; border: 1px solid #2e303d; border-radius: 8px;">
                <div style="font-size: 11px; color: #aaa; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Formato: ${formatoNombre}</div>
                <div style="font-size: 16px; font-weight: 900; color: #fff; margin: 6px 0;">
                    ${nomA} <span style="color: #ff0044;">vs</span> ${nomB}
                </div>
                <div style="display: inline-block; font-size: 13px; font-weight: 800; color: ${colorLeyenda}; background: rgba(56, 189, 248, 0.08); border: 1px solid ${colorLeyenda}; padding: 4px 12px; border-radius: 20px; margin-top: 4px;">
                    ${leyendaInstitucional}
                </div>
            </div>

            <div style="font-size: 11.5px; font-weight: 800; color: #ff0044; text-transform: uppercase; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
                <span>📋 Juegos de la Serie (${partidosLlave.length})</span>
                <span style="font-size: 10.5px; color: #888;">${finalizados} finalizados</span>
            </div>

            <div style="max-height: 380px; overflow-y: auto; padding-right: 4px;">
                ${listaJuegosHtml}
            </div>
        `;
    }

    const modal = document.getElementById('modal-serie-playoff');
    if (modal) modal.classList.remove('hidden');
};

function calcularRachaForma(equipoId, torneoId) {
    const partidosJugados = listaPartidos.filter(p => {
        const tId = obtenerPropiedad(p, ['torneo_Id', 'torneo_id', 'Torneo_Id', 'torneoId']);
        const estado = (obtenerPropiedad(p, ['estado', 'Estado']) || '').toUpperCase();
        const esDelTorneo = String(tId) === String(torneoId);
        const yaJugo = estado === 'FINALIZADO' || estado === 'TERMINADO';

        if (!esDelTorneo || !yaJugo) return false;

        const eqLocalId = obtenerPropiedad(p, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
        const eqVisitanteId = obtenerPropiedad(p, ['equipo_Visitante_Id', 'equipo_visitante_id', 'equipoVisitanteId']);

        return String(eqLocalId) === String(equipoId) || String(eqVisitanteId) === String(equipoId);
    });

    if (partidosJugados.length === 0) {
        return '<span class="form-empty">-</span>';
    }

    const ultimos5 = partidosJugados.slice(-5);
    let badgesHtml = '<div class="form-container">';

    ultimos5.forEach(p => {
        const eqLocalId = obtenerPropiedad(p, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
        const ptsLocal = Number(obtenerPropiedad(p, ['puntos_Local', 'puntos_local', 'puntosLocal']) ?? 0);
        const ptsVisitante = Number(obtenerPropiedad(p, ['puntos_Visitante', 'puntos_visitante', 'puntosVisitante']) ?? 0);

        const esLocal = String(eqLocalId) === String(equipoId);
        const misPuntos = esLocal ? ptsLocal : ptsVisitante;
        const puntosRival = esLocal ? ptsVisitante : ptsLocal;

        if (misPuntos > puntosRival) {
            badgesHtml += '<span class="form-badge form-win" title="Ganado">G</span>';
        } else if (misPuntos === puntosRival) {
            badgesHtml += '<span class="form-badge form-draw" title="Empatado">E</span>';
        } else {
            badgesHtml += '<span class="form-badge form-loss" title="Perdido">P</span>';
        }
    });

    badgesHtml += '</div>';
    return badgesHtml;
}

function calcularTiempoEnVivo(partido, deporteNombre = '') {
    const estado = (obtenerPropiedad(partido, ['estado', 'Estado']) || '').toUpperCase();
    const estadoDetalle = (obtenerPropiedad(partido, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || '').trim().toUpperCase();
    if (estado === 'FINALIZADO' || estado === 'TERMINADO' || estadoDetalle === 'FINALIZADO') return null;
    if (estado === 'SUSPENDIDO' || estadoDetalle === 'SUSPENDIDO') return null;
    if (estado !== 'EN_JUEGO' && estado !== 'EN VIVO' && estado !== 'JUGANDO') return null;

    let dep = (deporteNombre || '').toUpperCase();
    if (!dep) {
        dep = obtenerNombreDeportePartido(partido);
    }
    if (!dep) {
        const tituloTorneo = document.querySelector('h2, .tournament-title, .torneo-header')?.innerText?.toUpperCase() || '';
        const botonActivo = document.querySelector('.nav-pill.active, .btn-deporte.active, [data-deporte].active')?.innerText?.toUpperCase() || '';
        dep = `${tituloTorneo} ${botonActivo}`;
    }

    const esBaloncesto = dep.includes('BALONCESTO') || dep.includes('BASKET');
    const esMicro = dep.includes('MICRO') || dep.includes('SALÓN') || dep.includes('SALON');
    const esFutbol = !esMicro && (dep.includes('FUTBOL') || dep.includes('FÚTBOL'));
    const esBeisbolOSoftbol = dep.includes('BEISBOL') || dep.includes('BÉISBOL') || dep.includes('SOFTBOL');
    const esVoleibol = dep.includes('VOLEIBOL') || dep.includes('VOLEY');

    const minutoActual = obtenerPropiedad(partido, ['minutoActual', 'minuto_actual', 'MinutoActual']);
    const tieneMinuto = (minutoActual !== null && minutoActual !== undefined && minutoActual !== '' && !isNaN(minutoActual) && Number(minutoActual) >= 0);

    // Voleibol ("SET 1", "SET 2", etc.)
    if (esVoleibol || estadoDetalle.startsWith('SET')) {
        return estadoDetalle || 'SET 1';
    }

    // Béisbol y Softbol ("▲ Alta 1ª", "INNING 1", etc.)
    if (esBeisbolOSoftbol || estadoDetalle.startsWith('INNING') || estadoDetalle.includes('ALTA') || estadoDetalle.includes('BAJA') || estadoDetalle.includes('▲') || estadoDetalle.includes('▼')) {
        return estadoDetalle || 'INNING 1';
    }

    // Overtime / Penales / Tiempo Extra / Pausas reglamentarias
    if (estadoDetalle.includes('PENAL')) return 'PENALES';
    if (estadoDetalle.includes('OVERTIME') || estadoDetalle === 'OT' || estadoDetalle.includes('PRORROGA') || estadoDetalle.includes('PRÓRROGA')) {
        return tieneMinuto ? `OT ${minutoActual}'` : 'PRÓRROGA (OT)';
    }
    if (estadoDetalle.includes('EXTRA')) return tieneMinuto ? `EXTRA ${minutoActual}'` : 'TIEMPO EXTRA';
    if (estadoDetalle === 'PAUSA' || estadoDetalle === 'PAUSA Q1' || estadoDetalle === 'PAUSA Q3') return estadoDetalle;
    if (estadoDetalle === 'T. MUERTO' || estadoDetalle === 'TIEMPO MUERTO') return 'T. MUERTO';

    // Minutos reales transcurridos desde fechaHora
    const fechaHoraStr = obtenerPropiedad(partido, ['fechaHora', 'fecha_hora', 'FechaHora']);
    let minutosReales = 0;
    if (fechaHoraStr && !fechaHoraStr.startsWith('2099')) {
        const diffMs = Date.now() - new Date(fechaHoraStr).getTime();
        minutosReales = Math.max(0, Math.floor(diffMs / 60000));
    }

    // A) FÚTBOL (2 tiempos de 45 min netos de juego)
    if (esFutbol) {
        if (estadoDetalle === 'ENTRETIEMPO' || estadoDetalle === 'DESCANSO') return 'ENTRETIEMPO';
        if (estadoDetalle === '1T') {
            const m = tieneMinuto ? Math.min(45, Math.max(1, Number(minutoActual))) : Math.min(45, Math.max(1, minutosReales));
            return `1T ${m}'`;
        }
        if (estadoDetalle === '2T') {
            const m = tieneMinuto ? Math.min(90, Math.max(45, Number(minutoActual))) : Math.min(90, Math.max(45, minutosReales - 15));
            return `2T ${m}'`;
        }
        // Fallback reglamentario
        if (minutosReales < 45) return `1T ${Math.max(1, minutosReales)}'`;
        if (minutosReales < 60) return 'ENTRETIEMPO';
        if (minutosReales < 105) return `2T ${Math.min(90, Math.max(45, minutosReales - 15))}'`;
        return "2T 90'";
    }

    // B) MICROFÚTBOL / FUTSAL (2 tiempos de 20 min netos de juego)
    if (esMicro) {
        if (estadoDetalle === 'DESCANSO' || estadoDetalle === 'ENTRETIEMPO') return 'DESCANSO';
        if (estadoDetalle === '1T') {
            const m = tieneMinuto ? Math.min(20, Math.max(1, Number(minutoActual))) : Math.min(20, Math.max(1, minutosReales));
            return `1T ${m}'`;
        }
        if (estadoDetalle === '2T') {
            const m = tieneMinuto ? Math.min(40, Math.max(20, Number(minutoActual))) : Math.min(40, Math.max(20, minutosReales - 10));
            return `2T ${m}'`;
        }
        // Fallback reglamentario
        if (minutosReales < 20) return `1T ${Math.max(1, minutosReales)}'`;
        if (minutosReales < 30) return 'DESCANSO';
        if (minutosReales < 50) return `2T ${Math.min(40, Math.max(20, minutosReales - 10))}'`;
        return "2T 40'";
    }

    // C) BALONCESTO (4 cuartos de 10 min netos de juego)
    if (esBaloncesto) {
        if (estadoDetalle === 'PAUSA EXTRA TIEMPO') {
            return 'PAUSA EXTRA TIEMPO';
        }
        if (estadoDetalle === 'TIEMPO MUERTO' || estadoDetalle === 'T. MUERTO') {
            return tieneMinuto ? `T. MUERTO (${minutoActual}')` : 'TIEMPO MUERTO';
        }
        if (estadoDetalle === 'PAUSA') {
            return tieneMinuto ? `PAUSA (${minutoActual}')` : 'PAUSA';
        }
        if (estadoDetalle === 'PAUSA Q1') return 'PAUSA Q1';
        if (estadoDetalle === 'DESCANSO' || estadoDetalle === 'MT') return 'DESCANSO';
        if (estadoDetalle === 'PAUSA Q3') return 'PAUSA Q3';
        if (estadoDetalle === '2OT' || estadoDetalle === 'OT2') {
            return tieneMinuto ? `2OT ${minutoActual}'` : '2° TIEMPO EXTRA';
        }
        if (estadoDetalle === '3OT' || estadoDetalle === 'OT3') {
            return tieneMinuto ? `3OT ${minutoActual}'` : '3° TIEMPO EXTRA';
        }
        if (estadoDetalle.includes('OVERTIME') || estadoDetalle === 'OT' || estadoDetalle === 'OT1' || estadoDetalle.includes('PRORROGA') || estadoDetalle.includes('PRÓRROGA')) {
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

function obtenerNombreDeportePartido(p) {
    if (!p) return '';
    let depNom = (obtenerPropiedad(p, ['deporteNombre', 'DeporteNombre', 'deporte_nombre']) || '').toUpperCase();
    if (!depNom) {
        const tId = obtenerPropiedad(p, ['torneo_Id', 'torneo_id', 'Torneo_Id', 'torneoId']) || torneoSeleccionadoId;
        const torneoObj = listaTorneos.find(t => String(obtenerPropiedad(t, ['id', 'Id'])) === String(tId));
        if (torneoObj) {
            const dId = obtenerPropiedad(torneoObj, ['deporte_Id', 'deporte_id', 'Deporte_Id', 'deporteId', 'DeporteId']);
            const dObj = listaDeportes.find(d => String(obtenerPropiedad(d, ['id', 'Id'])) === String(dId));
            if (dObj) depNom = (obtenerPropiedad(dObj, ['nombre', 'Nombre']) || '').toUpperCase();
        }
    }
    if (!depNom && deporteSeleccionado) {
        depNom = (obtenerPropiedad(deporteSeleccionado, ['nombre', 'Nombre']) || '').toUpperCase();
    }
    return depNom;
}

function renderizarResumenBaloncesto(partido, eventos, container) {
    if (!container) return;

    const estadoRaw = (obtenerPropiedad(partido, ['estado', 'Estado']) || 'PROGRAMADO').toUpperCase();
    const detalleRaw = (obtenerPropiedad(partido, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || '').toUpperCase();
    const esProgramado = estadoRaw === 'PROGRAMADO' || estadoRaw === 'PENDIENTE';

    const eqLocalId = obtenerPropiedad(partido, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
    const eqVisitanteId = obtenerPropiedad(partido, ['equipo_Visitante_Id', 'equipo_visitante_id', 'equipoVisitanteId']);
    const nomLocal = eqLocalId ? obtenerNombreEquipo(eqLocalId).replace(/\s*#\d+$/, '') : 'Local';
    const nomVisitante = eqVisitanteId ? obtenerNombreEquipo(eqVisitanteId).replace(/\s*#\d+$/, '') : 'Visitante';

    const ptsLocalTotal = Number(obtenerPropiedad(partido, ['puntos_Local', 'puntos_local', 'puntosLocal']) ?? 0);
    const ptsVisitTotal = Number(obtenerPropiedad(partido, ['puntos_Visitante', 'puntos_visitante', 'puntosVisitante']) ?? 0);

    let q1L = '-', q2L = '-', q3L = '-', q4L = '-';
    let q1V = '-', q2V = '-', q3V = '-', q4V = '-';
    const minAct = Number(obtenerPropiedad(partido, ['minutoActual', 'minuto_actual', 'MinutoActual']) || 0);
    let aplicaOT = detalleRaw.includes('OT') || detalleRaw.includes('OVERTIME') || detalleRaw.includes('PRORROGA') || minAct > 40;
    let otCols = [];

    if (!esProgramado) {
        const pId = obtenerPropiedad(partido, ['id', 'Id']);
        let cache = null;
        try {
            cache = JSON.parse(localStorage.getItem(`basket_quarters_${pId}`) || 'null');
        } catch (e) {}

        let hayEventos = false;
        let evQ1L = 0, evQ1V = 0, evQ2L = 0, evQ2V = 0, evQ3L = 0, evQ3V = 0, evQ4L = 0, evQ4V = 0;
        let evOt1L = 0, evOt1V = 0, evOt2L = 0, evOt2V = 0, evOt3L = 0, evOt3V = 0;

        if (eventos && eventos.length > 0) {
            eventos.forEach(ev => {
                const per = String(obtenerPropiedad(ev, ['minutoOPeriodo', 'MinutoOPeriodo', 'minuto']) || '').toUpperCase();
                const eqId = obtenerPropiedad(ev, ['equipoId', 'EquipoId']);
                const pts = Number(obtenerPropiedad(ev, ['valorPuntos', 'ValorPuntos']) || 1);
                const esLoc = String(eqId) === String(eqLocalId);

                if (per.includes('Q1') || per === '1' || per === '1Q') {
                    hayEventos = true;
                    if (esLoc) evQ1L += pts; else evQ1V += pts;
                } else if (per.includes('Q2') || per === '2' || per === '2Q') {
                    hayEventos = true;
                    if (esLoc) evQ2L += pts; else evQ2V += pts;
                } else if (per.includes('Q3') || per === '3' || per === '3Q') {
                    hayEventos = true;
                    if (esLoc) evQ3L += pts; else evQ3V += pts;
                } else if (per.includes('Q4') || per === '4' || per === '4Q') {
                    hayEventos = true;
                    if (esLoc) evQ4L += pts; else evQ4V += pts;
                } else if (per.includes('3OT') || per.includes('OT3')) {
                    hayEventos = true;
                    aplicaOT = true;
                    if (esLoc) evOt3L += pts; else evOt3V += pts;
                } else if (per.includes('2OT') || per.includes('OT2')) {
                    hayEventos = true;
                    aplicaOT = true;
                    if (esLoc) evOt2L += pts; else evOt2V += pts;
                } else if (per.includes('OT') || per.includes('OVERTIME') || per.includes('EXTRA')) {
                    hayEventos = true;
                    aplicaOT = true;
                    if (esLoc) evOt1L += pts; else evOt1V += pts;
                }
            });

            if (hayEventos) {
                q1L = evQ1L; q1V = evQ1V;
                q2L = evQ2L; q2V = evQ2V;
                q3L = evQ3L; q3V = evQ3V;
                q4L = evQ4L; q4V = evQ4V;
                if (evOt1L > 0 || evOt1V > 0 || evOt2L > 0 || evOt2V > 0) {
                    otCols.push({ id: 'ot1', label: (evOt2L > 0 || evOt2V > 0) ? 'OT1' : 'OT', loc: evOt1L, vis: evOt1V });
                }
                if (evOt2L > 0 || evOt2V > 0) {
                    otCols.push({ id: 'ot2', label: 'OT2', loc: evOt2L, vis: evOt2V });
                }
                if (evOt3L > 0 || evOt3V > 0) {
                    otCols.push({ id: 'ot3', label: 'OT3', loc: evOt3L, vis: evOt3V });
                }
            }
        }

        if (!hayEventos && cache) {
            if (cache.q1) { q1L = cache.q1.loc ?? 0; q1V = cache.q1.vis ?? 0; }
            if (cache.q2) { q2L = cache.q2.loc ?? 0; q2V = cache.q2.vis ?? 0; }
            if (cache.q3) { q3L = cache.q3.loc ?? 0; q3V = cache.q3.vis ?? 0; }
            if (cache.q4) { q4L = cache.q4.loc ?? 0; q4V = cache.q4.vis ?? 0; }

            const tieneOt1 = (cache.ot1 !== undefined || cache.ot !== undefined);
            const tieneOt2 = (cache.ot2 !== undefined);
            const tieneOt3 = (cache.ot3 !== undefined);

            if (tieneOt1) {
                const label1 = (tieneOt2 || tieneOt3) ? 'OT1' : 'OT';
                otCols.push({ id: 'ot1', label: label1, loc: (cache.ot1?.loc ?? cache.ot?.loc ?? 0), vis: (cache.ot1?.vis ?? cache.ot?.vis ?? 0) });
                aplicaOT = true;
            }
            if (tieneOt2) {
                otCols.push({ id: 'ot2', label: 'OT2', loc: cache.ot2.loc ?? 0, vis: cache.ot2.vis ?? 0 });
                aplicaOT = true;
            }
            if (tieneOt3) {
                otCols.push({ id: 'ot3', label: 'OT3', loc: cache.ot3.loc ?? 0, vis: cache.ot3.vis ?? 0 });
                aplicaOT = true;
            }
        }

        if (!hayEventos && (!cache || otCols.length === 0)) {
            if (ptsLocalTotal === 0 && ptsVisitTotal === 0 && estadoRaw !== 'FINALIZADO') {
                q1L = 0; q1V = 0;
                q2L = '-'; q2V = '-';
                q3L = '-'; q3V = '-';
                q4L = '-'; q4V = '-';
            } else if (detalleRaw.includes('Q1')) {
                q1L = ptsLocalTotal; q1V = ptsVisitTotal;
                q2L = '-'; q2V = '-';
                q3L = '-'; q3V = '-';
                q4L = '-'; q4V = '-';
            } else if (detalleRaw.includes('Q2') || detalleRaw.includes('DESCANSO')) {
                q1L = Math.round(ptsLocalTotal * 0.5);
                q2L = ptsLocalTotal - q1L;
                q1V = Math.round(ptsVisitTotal * 0.5);
                q2V = ptsVisitTotal - q1V;
                q3L = '-'; q3V = '-';
                q4L = '-'; q4V = '-';
            } else if (detalleRaw.includes('Q3')) {
                q1L = Math.round(ptsLocalTotal * 0.35);
                q2L = Math.round(ptsLocalTotal * 0.33);
                q3L = ptsLocalTotal - q1L - q2L;
                q1V = Math.round(ptsVisitTotal * 0.35);
                q2V = Math.round(ptsVisitTotal * 0.33);
                q3V = ptsVisitTotal - q1V - q2V;
                q4L = '-'; q4V = '-';
            } else {
                if (aplicaOT) {
                    const es2OT = detalleRaw.includes('2OT') || minAct > 45;
                    const baseL = Math.round(ptsLocalTotal * (es2OT ? 0.78 : 0.88));
                    const baseV = Math.round(ptsVisitTotal * (es2OT ? 0.78 : 0.88));
                    q1L = Math.round(baseL * 0.25);
                    q2L = Math.round(baseL * 0.25);
                    q3L = Math.round(baseL * 0.25);
                    q4L = baseL - q1L - q2L - q3L;

                    q1V = Math.round(baseV * 0.25);
                    q2V = Math.round(baseV * 0.25);
                    q3V = Math.round(baseV * 0.25);
                    q4V = baseV - q1V - q2V - q3V;

                    const extraL = Math.max(0, ptsLocalTotal - baseL);
                    const extraV = Math.max(0, ptsVisitTotal - baseV);

                    if (es2OT) {
                        const ot1Pts = Math.round(Math.min(extraL, extraV) * 0.45);
                        otCols.push({ id: 'ot1', label: 'OT1', loc: ot1Pts, vis: ot1Pts });
                        otCols.push({ id: 'ot2', label: 'OT2', loc: extraL - ot1Pts, vis: extraV - ot1Pts });
                    } else {
                        otCols.push({ id: 'ot1', label: 'OT', loc: extraL, vis: extraV });
                    }
                } else {
                    q1L = Math.round(ptsLocalTotal * 0.26);
                    q2L = Math.round(ptsLocalTotal * 0.24);
                    q3L = Math.round(ptsLocalTotal * 0.26);
                    q4L = ptsLocalTotal - q1L - q2L - q3L;

                    q1V = Math.round(ptsVisitTotal * 0.25);
                    q2V = Math.round(ptsVisitTotal * 0.26);
                    q3V = Math.round(ptsVisitTotal * 0.24);
                    q4V = ptsVisitTotal - q1V - q2V - q3V;
                }
            }
        }
    }

    const html = `
        <div class="flashscore-basket-container" style="padding: 10px 0;">
            <div style="background: #18191e; border: 1px solid #2a2b32; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.35);">
                <div style="background: #121316; padding: 10px 16px; border-bottom: 1px solid #2a2b32; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 11px; font-weight: 800; color: #a1a1aa; letter-spacing: 1px; text-transform: uppercase;">
                        🏀 PUNTUACIÓN POR CUARTOS
                    </span>
                    <span style="font-size: 11px; color: #ff0044; font-weight: 700;">
                        FLASHSCORE
                    </span>
                </div>
                <div style="overflow-x: auto;">
                    <table class="tabla-score" style="margin: 0; background: transparent; border-radius: 0; width: 100%;">
                        <thead>
                            <tr style="background: #141518; border-bottom: 1px solid #26272d;">
                                <th style="text-align: left; padding: 10px 14px; color: #8d8d99; font-size: 11px; text-transform: uppercase;">Equipo</th>
                                <th style="text-align: center; width: 65px; font-weight: 800; color: #ff0044; font-size: 12px;">M (Total)</th>
                                <th style="text-align: center; width: 50px; font-size: 11px; color: #8d8d99;">1 (Q1)</th>
                                <th style="text-align: center; width: 50px; font-size: 11px; color: #8d8d99;">2 (Q2)</th>
                                <th style="text-align: center; width: 50px; font-size: 11px; color: #8d8d99;">3 (Q3)</th>
                                <th style="text-align: center; width: 50px; font-size: 11px; color: #8d8d99;">4 (Q4)</th>
                                ${otCols.map(c => `<th style="text-align: center; width: 50px; font-size: 11px; color: #ff0044; font-weight: 800;">${c.label}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom: 1px solid #202126;">
                                <td style="text-align: left; padding: 12px 14px; font-weight: 700; color: #fff;">
                                    🏠 ${nomLocal}
                                </td>
                                <td style="text-align: center; font-weight: 800; font-size: 16px; color: ${ptsLocalTotal > ptsVisitTotal ? '#2ed573' : '#fff'}; font-family: monospace;">
                                    ${esProgramado ? '-' : ptsLocalTotal}
                                </td>
                                <td style="text-align: center; color: #eee; font-family: monospace; font-size: 13px;">${q1L}</td>
                                <td style="text-align: center; color: #eee; font-family: monospace; font-size: 13px;">${q2L}</td>
                                <td style="text-align: center; color: #eee; font-family: monospace; font-size: 13px;">${q3L}</td>
                                <td style="text-align: center; color: #eee; font-family: monospace; font-size: 13px;">${q4L}</td>
                                ${otCols.map(c => `<td style="text-align: center; color: #ff0044; font-family: monospace; font-weight: 700; font-size: 13px;">${c.loc}</td>`).join('')}
                            </tr>
                            <tr>
                                <td style="text-align: left; padding: 12px 14px; font-weight: 700; color: #fff;">
                                    ✈️ ${nomVisitante}
                                </td>
                                <td style="text-align: center; font-weight: 800; font-size: 16px; color: ${ptsVisitTotal > ptsLocalTotal ? '#2ed573' : '#fff'}; font-family: monospace;">
                                    ${esProgramado ? '-' : ptsVisitTotal}
                                </td>
                                <td style="text-align: center; color: #eee; font-family: monospace; font-size: 13px;">${q1V}</td>
                                <td style="text-align: center; color: #eee; font-family: monospace; font-size: 13px;">${q2V}</td>
                                <td style="text-align: center; color: #eee; font-family: monospace; font-size: 13px;">${q3V}</td>
                                <td style="text-align: center; color: #eee; font-family: monospace; font-size: 13px;">${q4V}</td>
                                ${otCols.map(c => `<td style="text-align: center; color: #ff0044; font-family: monospace; font-weight: 700; font-size: 13px;">${c.vis}</td>`).join('')}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

function renderizarResumenBeisbolSoftbol(partido, eventos, container, esSoftbol = false) {
    if (!container) return;

    const maxInnings = esSoftbol ? 7 : 9;
    const estadoRaw = (obtenerPropiedad(partido, ['estado', 'Estado']) || 'PROGRAMADO').toUpperCase();
    const detalleRaw = (obtenerPropiedad(partido, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || '').toUpperCase();
    const esProgramado = estadoRaw === 'PROGRAMADO' || estadoRaw === 'PENDIENTE';
    const esFinalizado = estadoRaw === 'FINALIZADO' || estadoRaw === 'TERMINADO';

    const eqLocalId = obtenerPropiedad(partido, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
    const eqVisitanteId = obtenerPropiedad(partido, ['equipo_Visitante_Id', 'equipo_visitante_id', 'equipoVisitanteId']);
    const nomLocal = eqLocalId ? obtenerNombreEquipo(eqLocalId).replace(/\s*#\d+$/, '') : 'Local';
    const nomVisitante = eqVisitanteId ? obtenerNombreEquipo(eqVisitanteId).replace(/\s*#\d+$/, '') : 'Visitante';

    const ptsLocalTotal = Number(obtenerPropiedad(partido, ['puntos_Local', 'puntos_local', 'puntosLocal']) ?? 0);
    const ptsVisitTotal = Number(obtenerPropiedad(partido, ['puntos_Visitante', 'puntos_visitante', 'puntosVisitante']) ?? 0);

    const esAlta = detalleRaw.includes('ALTA') || detalleRaw.includes('▲');
    const esBaja = detalleRaw.includes('BAJA') || detalleRaw.includes('▼');
    const esEE = detalleRaw.includes('EE') || detalleRaw.includes('EXTRA');

    const mNum = detalleRaw.match(/(\d+)/);
    let inningActual = mNum ? parseInt(mNum[1]) : (esFinalizado ? maxInnings : 1);
    if (esEE) {
        inningActual = maxInnings + 1;
    }

    const pId = obtenerPropiedad(partido, ['id', 'Id']);
    const runsVis = {};
    const runsLoc = {};
    const inningsDisputados = new Set();
    let llegoAEE = false;

    // 1. Extraer carreras registradas desde eventos de la BD
    if (eventos && eventos.length > 0) {
        eventos.forEach(ev => {
            const tipo = (obtenerPropiedad(ev, ['tipoEvento', 'TipoEvento', 'tipo']) || '').toUpperCase();
            if (tipo.includes('CARRERA') || tipo.includes('ANOTACION') || tipo.includes('PUNTO') || tipo.includes('GOL')) {
                const eqId = String(obtenerPropiedad(ev, ['equipoId', 'EquipoId']));
                const perStr = String(obtenerPropiedad(ev, ['minutoOPeriodo', 'MinutoOPeriodo', 'minuto']) || '1').toUpperCase();
                const val = Number(obtenerPropiedad(ev, ['valorPuntos', 'ValorPuntos']) || 1);

                let innKey = '1';
                if (perStr.includes('EE') || perStr.includes('EXTRA')) {
                    innKey = 'EE';
                    llegoAEE = true;
                } else {
                    const m = perStr.match(/(\d+)/);
                    innKey = m ? m[1] : '1';
                    const n = parseInt(innKey);
                    if (n > 0) inningsDisputados.add(n);
                }

                if (eqId === String(eqLocalId)) {
                    runsLoc[innKey] = (runsLoc[innKey] || 0) + val;
                } else {
                    runsVis[innKey] = (runsVis[innKey] || 0) + val;
                }
            }
        });
    }

    // 2. Combinar con localStorage para actualización reactiva inmediata en mesa/cliente
    let cachedInnings = null;
    try {
        const cachedRaw = localStorage.getItem(`baseball_innings_${pId}`);
        if (cachedRaw) {
            cachedInnings = JSON.parse(cachedRaw);
            if (cachedInnings.vis) {
                Object.keys(cachedInnings.vis).forEach(k => {
                    if (runsVis[k] === undefined) runsVis[k] = cachedInnings.vis[k];
                    if (k === 'EE') {
                        llegoAEE = true;
                    } else {
                        const n = parseInt(k);
                        if (n > 0) inningsDisputados.add(n);
                    }
                });
            }
            if (cachedInnings.loc) {
                Object.keys(cachedInnings.loc).forEach(k => {
                    if (runsLoc[k] === undefined) runsLoc[k] = cachedInnings.loc[k];
                    if (k === 'EE') {
                        llegoAEE = true;
                    } else {
                        const n = parseInt(k);
                        if (n > 0) inningsDisputados.add(n);
                    }
                });
            }
            if (cachedInnings.maxInning) {
                const n = parseInt(cachedInnings.maxInning);
                if (n > 0) inningsDisputados.add(n);
            }
            if (cachedInnings.esEE) {
                llegoAEE = true;
            }
        }
    } catch (e) {}

    // Evaluar si detalleRaw indica número de inning o Extra Inning
    if (detalleRaw.includes('EE') || detalleRaw.includes('EXTRA')) {
        llegoAEE = true;
    }
    if (mNum) {
        const n = parseInt(mNum[1]);
        if (n > 0) inningsDisputados.add(n);
    }

    let maxInningDisputado = inningsDisputados.size > 0 ? Math.max(...inningsDisputados) : 0;

    // Si el partido está finalizado y no hubo registro explícito de innings disputados en eventos/cache
    if (esFinalizado && maxInningDisputado === 0 && !llegoAEE) {
        const diff = Math.abs(ptsLocalTotal - ptsVisitTotal);
        if (esSoftbol) {
            if (diff >= 15) maxInningDisputado = 3;
            else if (diff >= 10) maxInningDisputado = 4;
            else if (diff >= 7) maxInningDisputado = 5;
            else maxInningDisputado = 7;
        } else {
            if (diff >= 15) maxInningDisputado = 5;
            else if (diff >= 10) maxInningDisputado = 7;
            else maxInningDisputado = 9;
        }
    }

    // 3. Construir arreglos de casillas para Visita y Local según el criterio estricto:
    // - Una entrada SOLO muestra '0' o carreras si FUE DISPUTADA.
    // - Cualquier entrada posterior no jugada debe mostrar obligatoriamente un guion '-'.
    // - Columna EE solo muestra carreras si llegó a Extra-Innings, de lo contrario '-'.
    const arrVisit = [];
    const arrLocal = [];
    let eeVisit = '-';
    let eeLocal = '-';
    let aplicaEE = false;

    if (esProgramado) {
        for (let i = 1; i <= maxInnings; i++) {
            arrVisit.push('-');
            arrLocal.push('-');
        }
        eeVisit = '-';
        eeLocal = '-';
    } else if (esFinalizado) {
        // En partido FINALIZADO:
        // Solo las entradas hasta maxInningDisputado (o maxInnings si hubo EE) fueron disputadas
        const topeInning = llegoAEE ? maxInnings : Math.min(maxInnings, maxInningDisputado);

        for (let i = 1; i <= maxInnings; i++) {
            const key = String(i);
            if (i <= topeInning) {
                arrVisit.push(runsVis[key] ?? 0);
                arrLocal.push(runsLoc[key] ?? 0);
            } else {
                arrVisit.push('-');
                arrLocal.push('-');
            }
        }

        if (llegoAEE) {
            aplicaEE = true;
            eeVisit = runsVis['EE'] ?? 0;
            eeLocal = runsLoc['EE'] ?? 0;
        } else {
            eeVisit = '-';
            eeLocal = '-';
        }
    } else {
        // EN_JUEGO
        const esEnJuegoEE = detalleRaw.includes('EE') || detalleRaw.includes('EXTRA');
        const inningActual = mNum ? parseInt(mNum[1]) : (maxInningDisputado > 0 ? maxInningDisputado : 1);

        if (esEnJuegoEE) {
            aplicaEE = true;
            for (let i = 1; i <= maxInnings; i++) {
                const key = String(i);
                arrVisit.push(runsVis[key] ?? 0);
                arrLocal.push(runsLoc[key] ?? 0);
            }
            eeVisit = runsVis['EE'] ?? 0;
            eeLocal = esAlta ? '-' : (runsLoc['EE'] ?? 0);
        } else {
            for (let i = 1; i <= maxInnings; i++) {
                const key = String(i);
                if (i < inningActual) {
                    // Entrada terminada (disputada)
                    arrVisit.push(runsVis[key] ?? 0);
                    arrLocal.push(runsLoc[key] ?? 0);
                } else if (i === inningActual) {
                    // Entrada actual en juego
                    arrVisit.push(runsVis[key] ?? 0);
                    if (esAlta) {
                        // Visita al bate en Parte Alta; Local aún no batea en esta entrada
                        arrLocal.push('-');
                    } else {
                        // Local al bate en Parte Baja
                        arrLocal.push(runsLoc[key] ?? 0);
                    }
                } else {
                    // Entrada posterior no jugada
                    arrVisit.push('-');
                    arrLocal.push('-');
                }
            }
            eeVisit = '-';
            eeLocal = '-';
        }
    }

    let visitBadge = '';
    let localBadge = '';
    if (estadoRaw === 'EN_JUEGO') {
        if (esBaja) {
            visitBadge = '<span style="font-size: 10px; font-weight: 800; background: rgba(0, 210, 255, 0.2); color: #00d2ff; border: 1px solid #00d2ff; padding: 1px 6px; border-radius: 4px; margin-left: 6px;">⚾ LANZANDO</span>';
            localBadge = '<span style="font-size: 10px; font-weight: 800; background: rgba(46, 213, 115, 0.2); color: #2ed573; border: 1px solid #2ed573; padding: 1px 6px; border-radius: 4px; margin-left: 6px;">🏏 AL BATE</span>';
        } else {
            visitBadge = '<span style="font-size: 10px; font-weight: 800; background: rgba(46, 213, 115, 0.2); color: #2ed573; border: 1px solid #2ed573; padding: 1px 6px; border-radius: 4px; margin-left: 6px;">🏏 AL BATE</span>';
            localBadge = '<span style="font-size: 10px; font-weight: 800; background: rgba(0, 210, 255, 0.2); color: #00d2ff; border: 1px solid #00d2ff; padding: 1px 6px; border-radius: 4px; margin-left: 6px;">⚾ LANZANDO</span>';
        }
    }

    let thCols = '';
    for (let i = 1; i <= maxInnings; i++) {
        thCols += `<th style="text-align: center; width: 38px; font-size: 11px; color: #8d8d99;">${i}</th>`;
    }

    let tdColsVisit = '';
    let tdColsLocal = '';
    for (let i = 0; i < maxInnings; i++) {
        tdColsVisit += `<td style="text-align: center; color: #eee; font-family: monospace; font-size: 13px;">${arrVisit[i]}</td>`;
        tdColsLocal += `<td style="text-align: center; color: #eee; font-family: monospace; font-size: 13px;">${arrLocal[i]}</td>`;
    }

    const html = `
        <div class="flashscore-baseball-container" style="padding: 10px 0;">
            <div style="background: #18191e; border: 1px solid #2a2b32; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.35);">
                <div style="background: #121316; padding: 10px 16px; border-bottom: 1px solid #2a2b32; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 11px; font-weight: 800; color: #a1a1aa; letter-spacing: 1px; text-transform: uppercase;">
                        ${esSoftbol ? '🥎' : '⚾'} ENTRADAS / INNINGS (${esSoftbol ? 'SÓFTBOL - 7 INNINGS' : 'BÉISBOL - 9 INNINGS'})
                    </span>
                    <span style="font-size: 11px; color: #ff0044; font-weight: 700;">
                        FLASHSCORE
                    </span>
                </div>
                <div style="overflow-x: auto;">
                    <table class="tabla-score" style="margin: 0; background: transparent; border-radius: 0; width: 100%;">
                        <thead>
                            <tr style="background: #141518; border-bottom: 1px solid #26272d;">
                                <th style="text-align: left; padding: 10px 14px; color: #8d8d99; font-size: 11px; text-transform: uppercase;">Equipo</th>
                                <th style="text-align: center; width: 65px; font-weight: 800; color: #ff0044; font-size: 12px;">R (Total)</th>
                                ${thCols}
                                <th style="text-align: center; width: 38px; font-size: 11px; color: #8d8d99;">EE</th>
                            </tr>
                        </thead>
                        <tbody>
                            <!-- Fila 1: VISITANTE ARRIBA (Estándar oficial Flashscore) -->
                            <tr style="border-bottom: 1px solid #202126;">
                                <td style="text-align: left; padding: 12px 14px; font-weight: 700; color: #fff;">
                                    ✈️ ${nomVisitante} ${visitBadge}
                                </td>
                                <td style="text-align: center; font-weight: 800; font-size: 16px; color: ${ptsVisitTotal > ptsLocalTotal ? '#2ed573' : '#fff'}; font-family: monospace;">
                                    ${esProgramado ? '-' : ptsVisitTotal}
                                </td>
                                ${tdColsVisit}
                                <td style="text-align: center; color: ${aplicaEE ? '#ff0044' : '#888'}; font-family: monospace; font-size: 13px;">${eeVisit}</td>
                            </tr>
                            <!-- Fila 2: LOCAL ABAJO (Estándar oficial Flashscore) -->
                            <tr>
                                <td style="text-align: left; padding: 12px 14px; font-weight: 700; color: #fff;">
                                    🏠 ${nomLocal} ${localBadge}
                                </td>
                                <td style="text-align: center; font-weight: 800; font-size: 16px; color: ${ptsLocalTotal > ptsVisitTotal ? '#2ed573' : '#fff'}; font-family: monospace;">
                                    ${esProgramado ? '-' : ptsLocalTotal}
                                </td>
                                ${tdColsLocal}
                                <td style="text-align: center; color: ${aplicaEE ? '#ff0044' : '#888'}; font-family: monospace; font-size: 13px;">${eeLocal}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

function renderizarResumenVoleibol(partido, eventos, container) {
    if (!container) return;

    const eqLocalId = obtenerPropiedad(partido, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']);
    const eqVisitanteId = obtenerPropiedad(partido, ['equipo_Visitante_Id', 'equipo_visitante_id', 'equipoVisitanteId']);
    const nomLocal = eqLocalId ? obtenerNombreEquipo(eqLocalId) : 'Local';
    const nomVisitante = eqVisitanteId ? obtenerNombreEquipo(eqVisitanteId) : 'Visitante';

    const pId = partido ? obtenerPropiedad(partido, ['id', 'Id']) : null;
    const estadoRaw = partido ? (obtenerPropiedad(partido, ['estado', 'Estado']) || 'PROGRAMADO').toUpperCase() : 'PROGRAMADO';
    const detalleRaw = partido ? (obtenerPropiedad(partido, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || 'SET 1').toUpperCase() : 'SET 1';
    const esProgramado = estadoRaw === 'PROGRAMADO' || estadoRaw === 'PENDIENTE';
    const ptsLocalTotal = Math.min(3, Math.max(0, Number(partido ? (obtenerPropiedad(partido, ['puntos_Local', 'puntos_local', 'puntosLocal']) ?? 0) : 0)));
    let ptsVisitTotal = Math.min(3, Math.max(0, Number(partido ? (obtenerPropiedad(partido, ['puntos_Visitante', 'puntos_visitante', 'puntosVisitante']) ?? 0) : 0)));
    if (ptsLocalTotal === 3 && ptsVisitTotal === 3) ptsVisitTotal = 2;
    const esFinalizado = estadoRaw === 'FINALIZADO' || estadoRaw === 'TERMINADO' || ptsLocalTotal >= 3 || ptsVisitTotal >= 3;

    // Obtener sets registrados desde localStorage o eventos
    let vSets = { "1": { loc: 0, vis: 0 }, "2": { loc: 0, vis: 0 }, "3": { loc: 0, vis: 0 }, "4": { loc: 0, vis: 0 }, "5": { loc: 0, vis: 0 } };
    let haySetsRegistrados = false;

    if (pId) {
        try {
            const raw = localStorage.getItem(`volley_sets_${pId}`);
            if (raw) {
                const parsed = JSON.parse(raw);
                vSets = { ...vSets, ...parsed };
                haySetsRegistrados = Object.values(parsed).some(s => s && (s.loc > 0 || s.vis > 0));
            }
        } catch (e) {}
    }

    if (!haySetsRegistrados && eventos && eventos.length > 0) {
        eventos.forEach(ev => {
            const tipo = (obtenerPropiedad(ev, ['tipoEvento', 'TipoEvento', 'tipo']) || '').toUpperCase();
            if (tipo === 'PUNTO' || tipo === 'SET') {
                const eqId = obtenerPropiedad(ev, ['equipoId', 'EquipoId']);
                const perStr = String(obtenerPropiedad(ev, ['minutoOPeriodo', 'MinutoOPeriodo', 'minuto']) || '1');
                const m = perStr.match(/(\d+)/);
                const sKey = m ? m[1] : '1';
                if (!vSets[sKey]) vSets[sKey] = { loc: 0, vis: 0 };
                const isLoc = String(eqId) === String(eqLocalId);
                const val = Number(obtenerPropiedad(ev, ['valorPuntos', 'ValorPuntos']) || 1);
                if (isLoc) vSets[sKey].loc += val;
                else vSets[sKey].vis += val;
                haySetsRegistrados = true;
            }
        });
    }

    // Si el partido está finalizado y no había parciales guardados en caché, generar sets oficiales consistentes
    if (!haySetsRegistrados && esFinalizado && (ptsLocalTotal > 0 || ptsVisitTotal > 0)) {
        const totalSets = ptsLocalTotal + ptsVisitTotal;
        const localGano = ptsLocalTotal > ptsVisitTotal;
        if (totalSets === 3) {
            // 3 - 0
            if (localGano) {
                vSets["1"] = { loc: 25, vis: 19 };
                vSets["2"] = { loc: 25, vis: 21 };
                vSets["3"] = { loc: 25, vis: 20 };
            } else {
                vSets["1"] = { loc: 19, vis: 25 };
                vSets["2"] = { loc: 21, vis: 25 };
                vSets["3"] = { loc: 20, vis: 25 };
            }
        } else if (totalSets === 4) {
            // 3 - 1
            if (localGano) {
                vSets["1"] = { loc: 25, vis: 20 };
                vSets["2"] = { loc: 22, vis: 25 };
                vSets["3"] = { loc: 25, vis: 18 };
                vSets["4"] = { loc: 25, vis: 21 };
            } else {
                vSets["1"] = { loc: 20, vis: 25 };
                vSets["2"] = { loc: 25, vis: 22 };
                vSets["3"] = { loc: 18, vis: 25 };
                vSets["4"] = { loc: 21, vis: 25 };
            }
        } else if (totalSets >= 5) {
            // 3 - 2
            if (localGano) {
                vSets["1"] = { loc: 25, vis: 22 };
                vSets["2"] = { loc: 20, vis: 25 };
                vSets["3"] = { loc: 25, vis: 23 };
                vSets["4"] = { loc: 21, vis: 25 };
                vSets["5"] = { loc: 15, vis: 12 };
            } else {
                vSets["1"] = { loc: 22, vis: 25 };
                vSets["2"] = { loc: 25, vis: 20 };
                vSets["3"] = { loc: 23, vis: 25 };
                vSets["4"] = { loc: 25, vis: 21 };
                vSets["5"] = { loc: 12, vis: 15 };
            }
        }
    }

    // Determinar dinámicamente los sets que efectivamente se jugaron
    let maxSetRegistrado = 0;
    for (let s = 1; s <= 5; s++) {
        if (vSets[String(s)] && (vSets[String(s)].loc > 0 || vSets[String(s)].vis > 0)) {
            maxSetRegistrado = s;
        }
    }

    let numSetsVisibles = 3;
    if (esFinalizado) {
        // En finalizado muestra exactamente los sets disputados (3, 4 o 5)
        numSetsVisibles = Math.min(5, Math.max(3, ptsLocalTotal + ptsVisitTotal, maxSetRegistrado));
    } else if (!esProgramado) {
        const m = detalleRaw.match(/(\d+)/);
        const setEnJuego = m ? parseInt(m[1]) : 1;
        numSetsVisibles = Math.min(5, Math.max(1, setEnJuego, ptsLocalTotal + ptsVisitTotal + 1, maxSetRegistrado));
    } else {
        numSetsVisibles = 3;
    }

    // Generar dinámicamente solo las cabeceras de los sets jugados
    let thSetsHtml = '';
    for (let s = 1; s <= numSetsVisibles; s++) {
        thSetsHtml += `<th style="text-align: center; width: 45px; font-size: 11px; color: #8d8d99;">${s}</th>`;
    }

    // Armar celdas únicamente de los sets jugados (sin dibujar columnas vacías)
    let celdasLocal = '';
    let celdasVisit = '';

    for (let s = 1; s <= numSetsVisibles; s++) {
        const sKey = String(s);
        const sData = vSets[sKey] || { loc: 0, vis: 0 };
        const locScore = sData.loc;
        const visScore = sData.vis;
        const hayPuntos = (locScore > 0 || visScore > 0);
        const locBold = locScore > visScore;
        const visBold = visScore > locScore;
        if (hayPuntos || (!esProgramado && s <= (ptsLocalTotal + ptsVisitTotal))) {
            celdasLocal += `<td style="text-align: center; color: ${locBold ? '#2ed573' : '#aaa'}; font-weight: ${locBold ? '800' : '500'}; font-family: monospace; font-size: 13px;">${locScore}</td>`;
            celdasVisit += `<td style="text-align: center; color: ${visBold ? '#2ed573' : '#aaa'}; font-weight: ${visBold ? '800' : '500'}; font-family: monospace; font-size: 13px;">${visScore}</td>`;
        } else {
            celdasLocal += `<td style="text-align: center; color: #555; font-family: monospace; font-size: 13px;">-</td>`;
            celdasVisit += `<td style="text-align: center; color: #555; font-family: monospace; font-size: 13px;">-</td>`;
        }
    }

    const html = `
        <div class="flashscore-volley-container">
            <div style="background: #18191e; border: 1px solid #2a2b32; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.35);">
                <div style="background: #121316; padding: 10px 16px; border-bottom: 1px solid #2a2b32; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 11px; font-weight: 800; color: #a1a1aa; letter-spacing: 1px; text-transform: uppercase;">
                        🏐 PUNTUACIÓN POR SETS (VOLEIBOL)
                    </span>
                    <span style="font-size: 11px; color: #00d2ff; font-weight: 700;">
                        FLASHSCORE
                    </span>
                </div>
                <div style="overflow-x: auto;">
                    <table class="tabla-score" style="margin: 0; background: transparent; border-radius: 0; width: 100%;">
                        <thead>
                            <tr style="background: #141518; border-bottom: 1px solid #26272d;">
                                <th style="text-align: left; padding: 10px 14px; color: #8d8d99; font-size: 11px; text-transform: uppercase;">Equipo</th>
                                <th style="text-align: center; width: 75px; font-weight: 800; color: #00d2ff; font-size: 12px;">M (Sets)</th>
                                ${thSetsHtml}
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom: 1px solid #202126;">
                                <td style="text-align: left; padding: 12px 14px; font-weight: 700; color: #fff;">
                                    🏠 ${nomLocal}
                                </td>
                                <td style="text-align: center; font-weight: 800; font-size: 16px; color: ${ptsLocalTotal > ptsVisitTotal ? '#2ed573' : (ptsVisitTotal > ptsLocalTotal ? '#aaa' : '#fff')}; font-family: monospace;">
                                    ${esProgramado ? '-' : ptsLocalTotal}
                                </td>
                                ${celdasLocal}
                            </tr>
                            <tr>
                                <td style="text-align: left; padding: 12px 14px; font-weight: 700; color: #fff;">
                                    ✈️ ${nomVisitante}
                                </td>
                                <td style="text-align: center; font-weight: 800; font-size: 16px; color: ${ptsVisitTotal > ptsLocalTotal ? '#2ed573' : (ptsLocalTotal > ptsVisitTotal ? '#aaa' : '#fff')}; font-family: monospace;">
                                    ${esProgramado ? '-' : ptsVisitTotal}
                                </td>
                                ${celdasVisit}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

async function abrirDetallePartido(partido) {
    const modal = document.getElementById('modal-partido');
    if (!modal) return;

    const partidoId = obtenerPropiedad(partido, ['id', 'Id']);
    partidoAbiertoId = partidoId;
    partidoAbiertoObj = partido;

    const tId = obtenerPropiedad(partido, ['torneo_Id', 'torneo_id', 'Torneo_Id', 'torneoId']) || torneoSeleccionadoId;
    const eqLocalId = obtenerPropiedad(partido, ['equipoLocalId', 'equipo_local_id', 'idEquipoLocal', 'id_equipo_local', 'EquipoLocalId', 'equipo_Local_Id']) 
        ?? (partido.equipoLocalId ?? partido.equipo_local_id ?? partido.idEquipoLocal ?? partido.equipo_local?.id ?? partido.equipoLocal?.id);
    const eqVisitanteId = obtenerPropiedad(partido, ['equipoVisitanteId', 'equipo_visitante_id', 'idEquipoVisitante', 'id_equipo_visitante', 'EquipoVisitanteId', 'equipo_Visitante_Id']) 
        ?? (partido.equipoVisitanteId ?? partido.equipo_visitante_id ?? partido.idEquipoVisitante ?? partido.equipo_visitante?.id ?? partido.equipoVisitante?.id);

    const nomLocal = obtenerNombreEquipo(eqLocalId);
    const nomVisitante = obtenerNombreEquipo(eqVisitanteId);
    let ptsLocal = obtenerPropiedad(partido, ['puntos_Local', 'puntos_local', 'puntosLocal']) ?? 0;
    let ptsVisitante = obtenerPropiedad(partido, ['puntos_Visitante', 'puntos_visitante', 'puntosVisitante']) ?? 0;
    const estadoRaw = (obtenerPropiedad(partido, ['estado', 'Estado']) || 'PROGRAMADO').toUpperCase();
    const estadoDetalleRaw = (obtenerPropiedad(partido, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || '').toUpperCase();
    const minutoActual = obtenerPropiedad(partido, ['minutoActual', 'minuto_actual', 'MinutoActual']);

    const horaStr = extraerHoraPartido(partido) || 'Hora por def.';
    const fechaStr = extraerFechaPartido(partido) || '';
    const fechaFormateada = fechaStr ? `${fechaStr.substring(8, 10)}.${fechaStr.substring(5, 7)}.${fechaStr.substring(0, 4)}` : '';
    const cId = obtenerPropiedad(partido, ['canchaId', 'cancha_id', 'CanchaId']);
    const nombreCancha = obtenerNombreCancha(cId);

    const esProgramado = estadoRaw === 'PROGRAMADO' || estadoRaw === 'PENDIENTE';
    const fhDetalle = obtenerPropiedad(partido, ['fechaHora', 'fecha_hora', 'FechaHora']);
    const esFhDefinida = fhDetalle && !fhDetalle.startsWith('2099');
    const dtLocal = parsearFechaHoraLocal(fhDetalle);
    const yaPasoHora = esFhDefinida && dtLocal && (dtLocal.getTime() <= (Date.now() - 60000));
    const esNoIniciado = (estadoRaw === 'PROGRAMADO' || estadoRaw === 'PENDIENTE' || !estadoRaw);
    const estadoDetalleCard = (obtenerPropiedad(partido, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || '').toUpperCase();
    const esFinalizadoDet = (estadoRaw === 'FINALIZADO' || estadoRaw === 'TERMINADO' || estadoDetalleCard === 'FINALIZADO');
    const estaRetrasado = (!esFinalizadoDet && estadoRaw !== 'EN_JUEGO' && estadoRaw !== 'EN VIVO' && estadoRaw !== 'JUGANDO') &&
        (esFhDefinida ? (yaPasoHora && (estadoRaw === 'RETRASADO' || estadoDetalleCard === 'RETRASADO' || esNoIniciado)) : (estadoRaw === 'RETRASADO' || estadoDetalleCard === 'RETRASADO'));

    const depNombre = obtenerNombreDeportePartido(partido);
    const esBaloncesto = depNombre.includes('BALONCESTO') || depNombre.includes('BASKET');
    const esBeisbol = depNombre.includes('BEISBOL') || depNombre.includes('BÉISBOL');
    const esSoftbol = depNombre.includes('SOFTBOL');
    const esBeisbolOSoftbol = esBeisbol || esSoftbol;
    const esVoleibol = depNombre.includes('VOLEIBOL') || depNombre.includes('VOLLEY');
    const esMicro = depNombre.includes('MICRO') || depNombre.includes('SALÓN') || depNombre.includes('SALON');
    const esFutbol = !esMicro && !esBaloncesto && !esBeisbolOSoftbol && !esVoleibol;

    const datosPenales = (esFutbol || esMicro) ? extraerPenalesPartido(partido) : null;
    const tienePenales = datosPenales !== null && datosPenales.local !== null && datosPenales.visitante !== null && !isNaN(datosPenales.local) && !isNaN(datosPenales.visitante);

    if (esVoleibol) {
        ptsLocal = Math.min(3, Math.max(0, Number(ptsLocal)));
        ptsVisitante = Math.min(3, Math.max(0, Number(ptsVisitante)));
        if (ptsLocal === 3 && ptsVisitante === 3) ptsVisitante = 2;
    }

    // Determinar sub-estado exacto estilo Flashscore
    let textoSubEstado = '';
    let badgeBg = '#e11d48';

    const esFinalizadoModal = (estadoRaw === 'FINALIZADO' || estadoRaw === 'TERMINADO' || estadoDetalleRaw === 'FINALIZADO');
    const estaSuspendidoModal = (estadoRaw === 'SUSPENDIDO') || (estadoDetalleRaw === 'SUSPENDIDO');

    if (esFinalizadoModal) {
        if (tienePenales || estadoDetalleRaw.includes('PENAL')) {
            textoSubEstado = 'FINAL (PEN.)';
            badgeBg = '#10b981';
        } else {
            textoSubEstado = (minutoActual && minutoActual > 40 && esBaloncesto) ? 'FINALIZADO (OT)' : 'FINALIZADO';
            badgeBg = '#10b981';
        }
    } else if (estaSuspendidoModal) {
        textoSubEstado = '⚠️ SUSPENDIDO';
        badgeBg = '#d97706';
    } else if (estadoRaw === 'EN_JUEGO') {
        const tiempoVivo = calcularTiempoEnVivo(partido, depNombre);
        if (esBaloncesto) {
            if (tiempoVivo === 'PAUSA Q1' || tiempoVivo === 'DESCANSO' || tiempoVivo === 'PAUSA Q3' || tiempoVivo === 'TIEMPO MUERTO' || tiempoVivo === 'T. MUERTO' || (tiempoVivo && tiempoVivo.includes('T. MUERTO')) || tiempoVivo === 'PAUSA' || (tiempoVivo && tiempoVivo.includes('PAUSA'))) {
                textoSubEstado = tiempoVivo;
                badgeBg = '#d97706';
            } else if (estadoDetalleRaw === '2OT' || estadoDetalleRaw === 'OT2') {
                textoSubEstado = minutoActual ? `2OT ${minutoActual}'` : '2° TIEMPO EXTRA';
            } else if (estadoDetalleRaw === '3OT' || estadoDetalleRaw === 'OT3') {
                textoSubEstado = minutoActual ? `3OT ${minutoActual}'` : '3° TIEMPO EXTRA';
            } else if (estadoDetalleRaw.includes('OVERTIME') || estadoDetalleRaw === 'OT' || estadoDetalleRaw === 'OT1') {
                textoSubEstado = minutoActual ? `OT ${minutoActual}'` : 'OVERTIME';
            } else if (tiempoVivo) {
                textoSubEstado = tiempoVivo;
            } else {
                textoSubEstado = 'EN VIVO';
            }
        } else if (esBeisbolOSoftbol) {
            if (estadoDetalleRaw === 'FINALIZADO') {
                textoSubEstado = 'FINALIZADO';
                badgeBg = '#10b981';
            } else if (estadoDetalleRaw.includes('ALTA') || estadoDetalleRaw.includes('▲')) {
                textoSubEstado = estadoDetalleRaw;
                badgeBg = '#e11d48';
            } else if (estadoDetalleRaw.includes('BAJA') || estadoDetalleRaw.includes('▼')) {
                textoSubEstado = estadoDetalleRaw;
                badgeBg = '#e11d48';
            } else if (estadoDetalleRaw.startsWith('INNING')) {
                textoSubEstado = `▲ Alta ${estadoDetalleRaw.replace(/INNING/i, '').trim()}ª`;
                badgeBg = '#e11d48';
            } else {
                textoSubEstado = estadoDetalleRaw || '▲ Alta 1ª';
                badgeBg = '#e11d48';
            }
        } else if (esVoleibol) {
            if (estadoDetalleRaw === 'FINALIZADO' || ptsLocal >= 3 || ptsVisitante >= 3) {
                textoSubEstado = 'FINALIZADO';
                badgeBg = '#10b981';
            } else if (estadoDetalleRaw.startsWith('SET')) {
                textoSubEstado = estadoDetalleRaw;
                badgeBg = '#e11d48';
            } else {
                textoSubEstado = estadoDetalleRaw || 'SET 1';
                badgeBg = '#e11d48';
            }
        } else {
            // Fútbol o Microfútbol
            if (tiempoVivo === 'ENTRETIEMPO' || tiempoVivo === 'DESCANSO') {
                textoSubEstado = tiempoVivo;
                badgeBg = '#d97706';
            } else if (estadoDetalleRaw.includes('EXTRA') || estadoDetalleRaw.includes('OVERTIME')) {
                textoSubEstado = minutoActual ? `Tiempo Extra - ${minutoActual}'` : 'Tiempo Extra';
            } else if (estadoDetalleRaw.includes('PENAL')) {
                textoSubEstado = 'PENALES';
            } else if (tiempoVivo) {
                textoSubEstado = tiempoVivo;
            } else {
                textoSubEstado = 'EN VIVO';
            }
        }
    } else if (estaRetrasado) {
        textoSubEstado = '⏳ RETRASADO';
        badgeBg = '#d97706';
    } else if (estadoRaw === 'FINALIZADO' || estadoRaw === 'TERMINADO') {
        textoSubEstado = (tienePenales || estadoDetalleRaw.includes('PENAL')) ? 'FINAL (PEN.)' : 'FINALIZADO';
        badgeBg = '#10b981';
    } else if (estadoRaw === 'RETRASADO') {
        textoSubEstado = '⏳ RETRASADO';
        badgeBg = '#d97706';
    } else if (estadoRaw === 'SUSPENDIDO') {
        textoSubEstado = '⚠️ SUSPENDIDO';
        badgeBg = '#d97706';
    } else if (estadoRaw === 'CANCELADO' || estadoRaw === 'APLAZADO') {
        textoSubEstado = estadoRaw;
        badgeBg = '#6b7280';
    } else {
        textoSubEstado = 'PROGRAMADO';
        badgeBg = '#6366f1';
    }

    // Cabecera: Nombres de ambos equipos y asignación de Bateador 🏏 y Lanzador ⚾ si es Béisbol/Sóftbol en vivo
    if (esBeisbolOSoftbol && estadoRaw === 'EN_JUEGO') {
        const esBaja = estadoDetalleRaw.includes('BAJA') || estadoDetalleRaw.includes('▼');
        const roleLocal = esBaja
            ? `<div style="font-size: 11px; font-weight: 800; color: #2ed573; margin-top: 4px;">🏏 AL BATE</div>`
            : `<div style="font-size: 11px; font-weight: 800; color: #00d2ff; margin-top: 4px;">⚾ LANZANDO</div>`;
        const roleVisit = esBaja
            ? `<div style="font-size: 11px; font-weight: 800; color: #00d2ff; margin-top: 4px;">⚾ LANZANDO</div>`
            : `<div style="font-size: 11px; font-weight: 800; color: #2ed573; margin-top: 4px;">🏏 AL BATE</div>`;

        document.getElementById('match-name-local').innerHTML = `<span>${nomLocal}</span>${roleLocal}`;
        document.getElementById('match-name-visit').innerHTML = `<span>${nomVisitante}</span>${roleVisit}`;
    } else if (tienePenales) {
        const ganPenLoc = datosPenales.local > datosPenales.visitante;
        const ganPenVis = datosPenales.visitante > datosPenales.local;
        document.getElementById('match-name-local').innerHTML = `
            <span style="${ganPenLoc ? 'font-weight: 800; color: #fff;' : 'color: #94a3b8;'}">${nomLocal}</span>
            ${ganPenLoc ? '<div style="font-size: 11px; font-weight: 800; color: #10b981; margin-top: 4px;">▶ GANADOR PENALES</div>' : ''}
        `;
        document.getElementById('match-name-visit').innerHTML = `
            <span style="${ganPenVis ? 'font-weight: 800; color: #fff;' : 'color: #94a3b8;'}">${nomVisitante}</span>
            ${ganPenVis ? '<div style="font-size: 11px; font-weight: 800; color: #10b981; margin-top: 4px;">▶ GANADOR PENALES</div>' : ''}
        `;
    } else {
        document.getElementById('match-name-local').innerText = nomLocal;
        document.getElementById('match-name-visit').innerText = nomVisitante;
    }

    // Marcador grande central y sub-estado exacto debajo con widget de OUTS para Béisbol y Sóftbol
    const scoreElement = document.getElementById('match-score-display');
    const badgeElement = document.getElementById('match-status-badge');
    const outs = (esBeisbolOSoftbol && estadoRaw === 'EN_JUEGO' && partido.minutoActual !== null && partido.minutoActual !== undefined) ? Math.min(2, Math.max(0, Number(partido.minutoActual))) : 0;

    if (scoreElement) {
        let scorePenalesHtml = '';
        let scoreDisplayCentral = esProgramado ? '- : -' : `${ptsLocal} - ${ptsVisitante}`;
        if (tienePenales) {
            scoreDisplayCentral = `${ptsLocal}<sup>(${datosPenales.local})</sup> - ${ptsVisitante}<sup>(${datosPenales.visitante})</sup>`;
            scorePenalesHtml = `
                <div style="margin-top: 10px; padding: 6px 16px; background: rgba(236, 72, 153, 0.12); border: 1px solid rgba(236, 72, 153, 0.35); border-radius: 6px; display: inline-flex; flex-direction: column; align-items: center; gap: 3px;">
                    <div style="font-size: 10.5px; font-weight: 800; color: #f43f5e; text-transform: uppercase; letter-spacing: 0.5px;">
                        ⚡ Definición por Penales
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px; font-size: 12px;">
                        <span style="color: #cbd5e1;">Tiempo reglamentario: <strong style="color: #fff; font-family: monospace;">${ptsLocal} - ${ptsVisitante}</strong></span>
                        <span style="color: #64748b;">|</span>
                        <span style="color: #f472b6;">Tanda de penales: <strong style="color: #10b981; font-family: monospace; font-size: 13.5px;">${datosPenales.local} - ${datosPenales.visitante}</strong></span>
                    </div>
                </div>
            `;
        }

        scoreElement.innerHTML = `
            <div style="text-align: center; margin-bottom: 4px;">
                <div style="font-size: 12px; font-weight: 600; color: #a1a1aa; letter-spacing: 0.5px;">
                    📅 ${fechaFormateada} &nbsp;|&nbsp; ⏰ ${horaStr}
                </div>
                <div style="font-size: 11px; color: #71717a; margin-top: 2px;">
                    🏟️ ${nombreCancha}
                </div>
                ${esBeisbolOSoftbol ? `<div style="font-size: 10px; font-weight: 800; color: #ff0044; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;">⚾ CARRERAS (R)</div>` : ''}
                ${esVoleibol ? `<div style="font-size: 10px; font-weight: 800; color: #00d2ff; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;">🏐 SETS GANADOS</div>` : ''}
            </div>
            <div style="font-size: 36px; font-weight: 800; text-align: center; color: #fff; letter-spacing: 3px; font-family: monospace, sans-serif;">
                ${scoreDisplayCentral}
            </div>
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                <span style="background: ${badgeBg}; color: #fff; padding: 4px 14px; border-radius: 4px; font-size: 12px; font-weight: 800; letter-spacing: 0.5px; display: inline-block;">
                    ${textoSubEstado}
                </span>
                ${(esBeisbolOSoftbol && estadoRaw === 'EN_JUEGO') ? `
                <span class="outs-badge-public" style="background: #18191e; border: 1px solid #3a3b45; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 800; color: #fff; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">
                    <span style="color: #a1a1aa; font-weight: 700; letter-spacing: 0.5px;">OUTS:</span>
                    <span class="out-dot ${outs >= 1 ? 'active' : ''}" style="width: 10px; height: 10px;"></span>
                    <span class="out-dot ${outs >= 2 ? 'active' : ''}" style="width: 10px; height: 10px;"></span>
                    <span class="out-dot ${outs >= 3 ? 'active' : ''}" style="width: 10px; height: 10px;"></span>
                    <span style="color: #ffeb3b; font-family: monospace; font-size: 12px; font-weight: 800;">[ ${outs} / 3 ]</span>
                </span>
                ` : ''}
            </div>
            ${scorePenalesHtml}
        `;
    }

    if (badgeElement) {
        badgeElement.innerHTML = '';
        badgeElement.style.display = 'none';
    }

    const formLocalContainer = document.getElementById('match-form-local');
    const formVisitContainer = document.getElementById('match-form-visit');
    if (formLocalContainer) formLocalContainer.innerHTML = calcularRachaForma(eqLocalId, tId);
    if (formVisitContainer) formVisitContainer.innerHTML = calcularRachaForma(eqVisitanteId, tId);

    document.getElementById('lineup-title-local').innerText = nomLocal;
    document.getElementById('lineup-title-visit').innerText = nomVisitante;

    const btnTabEv = document.getElementById('btn-tab-eventos');
    if (btnTabEv) btnTabEv.click();
    modal.classList.remove('hidden');

    cargarEventosPartido(partidoId);
    cargarAlineacionEquipo(eqLocalId, 'lineup-list-local', nomLocal);
    cargarAlineacionEquipo(eqVisitanteId, 'lineup-list-visit', nomVisitante);
}

async function cargarEventosPartido(partidoId) {
    const eventsContainer = document.getElementById('match-events-list');
    if (!eventsContainer) return;

    try {
        let eventos = [];
        try {
            const resEventos = await fetch(`${API_URL}/eventospartido/partido/${partidoId}`);
            if (resEventos.ok) eventos = await resEventos.json();
        } catch (e) {
            console.warn('No fue posible obtener eventos remotos:', e);
        }

        const partido = partidoAbiertoObj;
        const depNombre = obtenerNombreDeportePartido(partido);
        const esBaloncesto = depNombre.includes('BALONCESTO') || depNombre.includes('BASKET');
        const esBeisbol = depNombre.includes('BEISBOL') || depNombre.includes('BÉISBOL');
        const esSoftbol = depNombre.includes('SOFTBOL');
        const esVoleibol = depNombre.includes('VOLEIBOL') || depNombre.includes('VOLLEY');

        // Si es BALONCESTO: renderizar tabla Flashscore de cuartos y salir
        if (esBaloncesto) {
            renderizarResumenBaloncesto(partido, eventos, eventsContainer);
            return;
        }

        // Si es BÉISBOL o SÓFTBOL: renderizar tabla Flashscore de Innings y salir
        if (esBeisbol || esSoftbol) {
            renderizarResumenBeisbolSoftbol(partido, eventos, eventsContainer, esSoftbol);
            return;
        }

        // Si es VOLEIBOL: renderizar tabla Flashscore de Sets y salir
        if (esVoleibol) {
            renderizarResumenVoleibol(partido, eventos, eventsContainer);
            return;
        }

        // --- A PARTIR DE AQUÍ: FÚTBOL Y MICROFÚTBOL (LÍNEA DE TIEMPO 1T / 2T PRESERVADA INTACTA) ---
        const eqLocalId = partido ? obtenerPropiedad(partido, ['equipo_Local_Id', 'equipo_local_id', 'equipoLocalId']) : null;
        const eqVisitanteId = partido ? obtenerPropiedad(partido, ['equipo_Visitante_Id', 'equipo_visitante_id', 'equipoVisitanteId']) : null;
        const nomLocal = eqLocalId ? obtenerNombreEquipo(eqLocalId) : 'Local';
        const nomVisitante = eqVisitanteId ? obtenerNombreEquipo(eqVisitanteId) : 'Visitante';
        const ptsL = Number(obtenerPropiedad(partido, ['puntos_Local', 'puntos_local', 'puntosLocal']) ?? 0);
        const ptsV = Number(obtenerPropiedad(partido, ['puntos_Visitante', 'puntos_visitante', 'puntosVisitante']) ?? 0);

        const esMicro = depNombre.includes('MICRO') || depNombre.includes('SALÓN') || depNombre.includes('SALON');
        const esFutbol = !esMicro && !esBaloncesto && !esBeisbol && !esSoftbol && !esVoleibol;
        const datosPen = (esFutbol || esMicro) ? extraerPenalesPartido(partido) : null;
        const tienePen = datosPen !== null && datosPen.local !== null && datosPen.visitante !== null && !isNaN(datosPen.local) && !isNaN(datosPen.visitante);

        if (eventos.length === 0) {
            if (tienePen) {
                const ganLoc = datosPen.local > datosPen.visitante;
                const nomGan = ganLoc ? nomLocal : nomVisitante;
                eventsContainer.innerHTML = `
                    <div class="flashscore-timeline">
                        <div class="timeline-period-header">
                            <span>TIEMPO REGULAR</span>
                            <span class="timeline-period-score">(${ptsL} - ${ptsV})</span>
                        </div>
                        <p style="color:#555; font-size:11px; text-align:center; margin: 8px 0;">Empate en tiempo reglamentario</p>
                        <div class="timeline-period-header" style="background: rgba(236, 72, 153, 0.15); border-left: 3px solid #ec4899; margin-top: 12px;">
                            <span style="color: #f472b6; font-weight: 800;">TANDA DE PENALES</span>
                            <span class="timeline-period-score" style="color: #fff; font-weight: 800;">(${datosPen.local} - ${datosPen.visitante})</span>
                        </div>
                        <div style="padding: 14px 16px; text-align: center; font-size: 12px; color: #cbd5e1; background: #16171f; border-bottom: 1px solid #23242c; border-radius: 0 0 6px 6px;">
                            <div style="display: flex; justify-content: space-around; align-items: center; max-width: 320px; margin: 0 auto; font-size: 13px;">
                                <span style="font-weight: ${ganLoc ? '800' : '600'}; color: ${ganLoc ? '#10b981' : '#94a3b8'};">${nomLocal}: <strong>${datosPen.local}</strong></span>
                                <span style="color: #555;">vs</span>
                                <span style="font-weight: ${!ganLoc ? '800' : '600'}; color: ${!ganLoc ? '#10b981' : '#94a3b8'};">${nomVisitante}: <strong>${datosPen.visitante}</strong></span>
                            </div>
                            <div style="font-size: 11.5px; color: #10b981; font-weight: 800; margin-top: 8px;">
                                🏆 Ganador definido por penales: <strong>${nomGan}</strong> (${datosPen.local} - ${datosPen.visitante})
                            </div>
                        </div>
                    </div>
                `;
                return;
            }
            eventsContainer.innerHTML = '<p style="color:#777; font-size:12px; text-align:center; padding:25px;">No hay eventos registrados en este encuentro aún.</p>';
            return;
        }

        // Separar eventos en 1ER TIEMPO y 2DO TIEMPO
        const eventos1T = [];
        const eventos2T = [];
        let golesLocal1T = 0;
        let golesVisit1T = 0;

        eventos.forEach(ev => {
            const minStr = String(obtenerPropiedad(ev, ['minuto', 'Minuto', 'minutoOPeriodo', 'MinutoOPeriodo']) ?? '0');
            const minNum = parseInt(minStr) || 0;
            const periodoStr = String(obtenerPropiedad(ev, ['minutoOPeriodo', 'MinutoOPeriodo']) || '').toUpperCase();
            const tipo = (obtenerPropiedad(ev, ['tipoEvento', 'TipoEvento', 'tipo']) || 'INCIDENCIA').toUpperCase();
            const eqId = obtenerPropiedad(ev, ['equipoId', 'EquipoId']);

            const esPrimerTiempo = periodoStr.includes('1T') || (minNum <= 45 && !periodoStr.includes('2T'));

            if (esPrimerTiempo) {
                eventos1T.push(ev);
                if (tipo.includes('GOL') || tipo.includes('ANOTACION')) {
                    if (String(eqId) === String(eqLocalId)) golesLocal1T++;
                    else if (String(eqId) === String(eqVisitanteId)) golesVisit1T++;
                }
            } else {
                eventos2T.push(ev);
            }
        });

        function renderizarFilaEvento(ev) {
            const minStr = obtenerPropiedad(ev, ['minuto', 'Minuto', 'minutoOPeriodo', 'MinutoOPeriodo']) ?? '-';
            const tipo = (obtenerPropiedad(ev, ['tipoEvento', 'TipoEvento', 'tipo']) || 'INCIDENCIA').toUpperCase();
            const jugador = obtenerPropiedad(ev, ['jugadorNombre', 'JugadorNombre']) || (ev.jugador ? ev.jugador.nombre : '') || '';
            const comentario = obtenerPropiedad(ev, ['comentario', 'Comentario', 'descripcion', 'Descripcion']) || '';
            const eqId = obtenerPropiedad(ev, ['equipoId', 'EquipoId']);
            const jugadorId = obtenerPropiedad(ev, ['jugadorId', 'JugadorId']);

            let icono = '📌';
            if (tipo.includes('GOL') || tipo.includes('ANOTACION')) icono = '⚽';
            else if (tipo.includes('AMARILLA')) icono = '🟨';
            else if (tipo.includes('ROJA')) icono = '🟥';
            else if (tipo.includes('CAMBIO') || tipo.includes('SUSTITUCION')) icono = '🔄';
            else if (tipo.includes('TRIPLE') || tipo.includes('CANASTA')) icono = '🏀';

            const esLocal = eqLocalId && String(eqId) === String(eqLocalId);
            const esVisit = eqVisitanteId && String(eqId) === String(eqVisitanteId);
            const eqNombre = esLocal ? nomLocal : (esVisit ? nomVisitante : '');
            const clickFicha = jugadorId ? `onclick="abrirFichaJugador(${jugadorId}, '${(jugador || tipo).replace(/'/g, "\\'")}', '${eqNombre.replace(/'/g, "\\'")}')" style="cursor: pointer;"` : '';

            if (esLocal) {
                return `
                    <div class="timeline-row">
                        <div class="timeline-cell-local">
                            <span class="timeline-badge-min">${minStr}'</span>
                            <span class="timeline-event-icon">${icono}</span>
                            <strong class="timeline-player-name" ${clickFicha}>${jugador || tipo}</strong>
                            ${comentario ? `<span class="timeline-comment">(${comentario})</span>` : ''}
                        </div>
                        <div class="timeline-center-divider">&bull;</div>
                        <div class="timeline-cell-visit"></div>
                    </div>
                `;
            } else if (esVisit) {
                return `
                    <div class="timeline-row">
                        <div class="timeline-cell-local"></div>
                        <div class="timeline-center-divider">&bull;</div>
                        <div class="timeline-cell-visit">
                            ${comentario ? `<span class="timeline-comment">(${comentario})</span>` : ''}
                            <strong class="timeline-player-name" ${clickFicha}>${jugador || tipo}</strong>
                            <span class="timeline-event-icon">${icono}</span>
                            <span class="timeline-badge-min">${minStr}'</span>
                        </div>
                    </div>
                `;
            } else {
                return `
                    <div class="timeline-row" style="grid-template-columns: 1fr;">
                        <div style="text-align: center; color: #a1a1aa; font-size: 11px;">
                            <span class="timeline-badge-min">${minStr}'</span>
                            <span class="timeline-event-icon">${icono}</span>
                            <strong ${clickFicha}>${jugador || tipo}</strong> ${comentario ? ` - ${comentario}` : ''}
                        </div>
                    </div>
                `;
            }
        }

        let timelineHtml = '<div class="flashscore-timeline">';

        // Bloque 1ER TIEMPO con marcador parcial
        timelineHtml += `
            <div class="timeline-period-header">
                <span>1ER TIEMPO</span>
                <span class="timeline-period-score">(${golesLocal1T} - ${golesVisit1T})</span>
            </div>
        `;
        if (eventos1T.length > 0) {
            timelineHtml += eventos1T.map(ev => renderizarFilaEvento(ev)).join('');
        } else {
            timelineHtml += '<p style="color:#555; font-size:11px; text-align:center; margin: 4px 0;">Sin incidencias</p>';
        }

        // Bloque 2DO TIEMPO
        const estadoRaw = partido ? (obtenerPropiedad(partido, ['estado', 'Estado']) || '').toUpperCase() : '';
        const detalleRaw = partido ? (obtenerPropiedad(partido, ['estadoDetalle', 'estado_detalle', 'EstadoDetalle']) || '').toUpperCase() : '';
        const yaJugo2T = eventos2T.length > 0 || estadoRaw === 'FINALIZADO' || detalleRaw === '2T' || detalleRaw === 'DESCANSO';

        if (yaJugo2T) {
            timelineHtml += `
                <div class="timeline-period-header">
                    <span>2DO TIEMPO</span>
                </div>
            `;
            if (eventos2T.length > 0) {
                timelineHtml += eventos2T.map(ev => renderizarFilaEvento(ev)).join('');
            } else {
                timelineHtml += '<p style="color:#555; font-size:11px; text-align:center; margin: 4px 0;">Sin incidencias</p>';
            }
        }

        if (tienePen) {
            const ganLoc = datosPen.local > datosPen.visitante;
            const nomGan = ganLoc ? nomLocal : nomVisitante;
            timelineHtml += `
                <div class="timeline-period-header" style="background: rgba(236, 72, 153, 0.15); border-left: 3px solid #ec4899; margin-top: 14px;">
                    <span style="color: #f472b6; font-weight: 800;">TANDA DE PENALES</span>
                    <span class="timeline-period-score" style="color: #fff; font-weight: 800;">(${datosPen.local} - ${datosPen.visitante})</span>
                </div>
                <div style="padding: 14px 16px; text-align: center; font-size: 12px; color: #cbd5e1; background: #16171f; border-bottom: 1px solid #23242c; border-radius: 0 0 6px 6px;">
                    <div style="display: flex; justify-content: space-around; align-items: center; max-width: 320px; margin: 0 auto; font-size: 13px;">
                        <span style="font-weight: ${ganLoc ? '800' : '600'}; color: ${ganLoc ? '#10b981' : '#94a3b8'};">${nomLocal}: <strong>${datosPen.local}</strong></span>
                        <span style="color: #555;">vs</span>
                        <span style="font-weight: ${!ganLoc ? '800' : '600'}; color: ${!ganLoc ? '#10b981' : '#94a3b8'};">${nomVisitante}: <strong>${datosPen.visitante}</strong></span>
                    </div>
                    <div style="font-size: 11.5px; color: #10b981; font-weight: 800; margin-top: 8px;">
                        🏆 Ganador definido por penales: <strong>${nomGan}</strong> (${datosPen.local} - ${datosPen.visitante})
                    </div>
                </div>
            `;
        }

        timelineHtml += '</div>';
        eventsContainer.innerHTML = timelineHtml;

    } catch (err) {
        console.error('Error cargando eventos:', err);
        eventsContainer.innerHTML = '<p style="color:#777; font-size:12px; text-align:center;">No fue posible cargar los eventos del partido.</p>';
    }
}

async function cargarAlineacionEquipo(equipoId, listElementId, nombreEquipo) {
    const ul = document.getElementById(listElementId);
    if (!ul) return;
    ul.innerHTML = '<li style="justify-content:center; color:#777;">Cargando jugadores...</li>';

    if (!equipoId) {
        ul.innerHTML = '<li style="justify-content:center; color:#777;">Sin nómina inscrita</li>';
        return;
    }

    try {
        let jugadores = [];
        try {
            const res = await fetch(`${API_URL}/jugadores/equipo/${equipoId}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) jugadores = data;
            }
        } catch (e) {
            console.warn('Error al cargar nómina por equipo:', e);
        }

        // Fallback defensivo a la lista general si la consulta por ID de equipo retornó vacía
        if (jugadores.length === 0) {
            try {
                const resTodos = await fetch(`${API_URL}/jugadores`);
                if (resTodos.ok) {
                    const todos = await resTodos.json();
                    if (Array.isArray(todos)) jugadores = todos;
                }
            } catch (e) {}
        }

        // FILTRADO ESTRICTO: Únicamente jugadores asignados inequívocamente a este equipo
        const jugadoresDelEquipo = jugadores.filter(j => {
            const jEqId = extraerEquipoIdJugador(j);
            return jEqId !== null && jEqId !== undefined && String(jEqId) === String(equipoId);
        });

        ul.innerHTML = '';
        if (jugadoresDelEquipo.length === 0) {
            ul.innerHTML = '<li style="justify-content:center; color:#777;">Sin nómina inscrita</li>';
            return;
        }

        jugadoresDelEquipo.forEach((j, idx) => {
            const jId = obtenerPropiedad(j, ['id', 'Id']);
            const dorsal = obtenerPropiedad(j, ['numeroCamiseta', 'NumeroCamiseta', 'numeroDorsal', 'dorsal', 'numero']) ?? (idx + 1);
            const nombre = obtenerPropiedad(j, ['nombre', 'Nombre', 'nombreCompleto']) || 'Jugador';
            const pos = obtenerPropiedad(j, ['posicion', 'Posicion']) || '';
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.padding = '8px 10px';
            li.style.borderBottom = '1px solid #1f2026';
            li.innerHTML = `
                <span style="display: flex; align-items: center; gap: 8px;">
                    <span style="background: #202026; color: #ff0044; font-weight: 800; font-size: 11px; padding: 2px 6px; border-radius: 4px; min-width: 20px; text-align: center;">${dorsal}</span> 
                    <span class="jugador-click" style="font-weight: 600; color: #f1f1f5;" onclick="abrirFichaJugador(${jId}, '${nombre.replace(/'/g, "\\'")}', '${nombreEquipo.replace(/'/g, "\\'")}')">${nombre}</span>
                </span>
                ${pos ? `<span style="font-size: 11px; color: #888;">${pos}</span>` : ''}
            `;
            ul.appendChild(li);
        });
    } catch {
        ul.innerHTML = '<li style="justify-content:center; color:#777;">No disponible</li>';
    }
}

async function verPlantillaEquipo(equipoId, nombreEquipo) {
    const modal = document.getElementById('modal-equipo');
    const modalTitulo = document.getElementById('modal-equipo-nombre');
    const tbody = document.getElementById('tabla-jugadores-body');

    modalTitulo.innerText = `Nómina: ${nombreEquipo}`;
    tbody.innerHTML = '<tr><td colspan="3" class="loading">Cargando jugadores...</td></tr>';
    modal.classList.remove('hidden');

    if (!equipoId) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 15px; color:#888;">No hay jugadores registrados en este equipo aún.</td></tr>';
        return;
    }

    try {
        let jugadores = [];
        try {
            const res = await fetch(`${API_URL}/jugadores/equipo/${equipoId}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) jugadores = data;
            }
        } catch (e) {}

        if (jugadores.length === 0) {
            try {
                const resTodos = await fetch(`${API_URL}/jugadores`);
                if (resTodos.ok) {
                    const todos = await resTodos.json();
                    if (Array.isArray(todos)) jugadores = todos;
                }
            } catch (e) {}
        }

        const jugadoresDelEquipo = jugadores.filter(j => {
            const jEqId = extraerEquipoIdJugador(j);
            return jEqId !== null && jEqId !== undefined && String(jEqId) === String(equipoId);
        });

        if (jugadoresDelEquipo.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 15px; color:#888;">No hay jugadores registrados en este equipo aún.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        jugadoresDelEquipo.forEach((j, idx) => {
            const jId = obtenerPropiedad(j, ['id', 'Id']);
            const dorsal = obtenerPropiedad(j, ['numeroCamiseta', 'NumeroCamiseta', 'numeroDorsal', 'dorsal', 'numero']) ?? (idx + 1);
            const nombre = obtenerPropiedad(j, ['nombre', 'Nombre', 'nombreCompleto']) || 'Sin nombre';
            const posicion = obtenerPropiedad(j, ['posicion', 'Posicion']) || '-';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: bold; color: #ff0044;">${dorsal}</td>
                <td style="text-align: left;">
                    <span class="jugador-click" onclick="abrirFichaJugador(${jId}, '${nombre.replace(/'/g, "\\'")}', '${nombreEquipo.replace(/'/g, "\\'")}')">
                        ${nombre}
                    </span>
                </td>
                <td style="text-align: left; color: #aaa;">${posicion}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="3" style="color: #ff4444; text-align:center;">Error al consultar la plantilla.</td></tr>';
    }
}

async function abrirFichaJugador(jugadorId, nombrePorDefecto, nombreEquipo) {
    const modal = document.getElementById('modal-jugador-ficha');
    document.getElementById('player-card-nombre').innerText = nombrePorDefecto;
    document.getElementById('player-card-equipo').innerText = nombreEquipo;
    document.getElementById('player-card-posicion').innerText = '-';
    document.getElementById('player-card-edad').innerText = '-';
    document.getElementById('player-card-estatura').innerText = '-';
    document.getElementById('player-card-dorsal').innerText = '#';

    const img = document.getElementById('player-card-img');
    const avatar = document.getElementById('player-card-avatar');
    img.classList.add('hidden');
    avatar.classList.remove('hidden');

    modal.classList.remove('hidden');

    try {
        const res = await fetch(`${API_URL}/jugadores/${jugadorId}`);
        if (!res.ok) return;
        const j = await res.json();

        const dorsal = obtenerPropiedad(j, ['numeroCamiseta', 'NumeroCamiseta', 'numeroDorsal', 'dorsal']) ?? '-';
        const posicion = obtenerPropiedad(j, ['posicion', 'Posicion']) || 'No definida';
        const edad = obtenerPropiedad(j, ['edad', 'Edad']);
        const estatura = obtenerPropiedad(j, ['estatura', 'Estatura']);
        const foto = obtenerPropiedad(j, ['fotoUrl', 'FotoUrl', 'foto_url']);

        document.getElementById('player-card-dorsal').innerText = dorsal;
        document.getElementById('player-card-posicion').innerText = posicion;
        document.getElementById('player-card-edad').innerText = edad ? `${edad} años` : 'N/D';
        document.getElementById('player-card-estatura').innerText = estatura ? `${estatura} m` : 'N/D';

        if (foto) {
            img.src = foto;
            img.classList.remove('hidden');
            avatar.classList.add('hidden');
        }
    } catch (e) {
        console.error('Error al obtener datos del jugador:', e);
    }
}

function volverAListaTorneos() {
    document.getElementById('vista-detalle-torneo').classList.add('hidden');
    document.getElementById('vista-lista-torneos').classList.remove('hidden');
    torneoSeleccionadoId = null;
    partidoAbiertoId = null;
    
    if (deporteSeleccionado) {
        const depId = obtenerPropiedad(deporteSeleccionado, ['id', 'Id']);
        renderizarTorneos(depId);
    }
}