using ApiSincelejoScore.Models;
using ApiSincelejoScore.Repositories;
using Dapper;
using Microsoft.AspNetCore.Mvc;
using MySql.Data.MySqlClient;
using OfficeOpenXml;
using System.Data;

namespace ApiSincelejoScore.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class JugadoresController : ControllerBase
    {
        private readonly ITorneoRepository _torneoRepository;
        private readonly IJugadorRepository _jugadorRepository;
        private readonly string _connectionString;

        // Limites máximos por deporte
        private readonly Dictionary<string, int> _limitesPorDeporte = new(StringComparer.OrdinalIgnoreCase)
        {
            { "BALONCESTO", 16 },
            { "BÉISBOL", 26 },
            { "BEISBOL", 26 },
            { "FÚTBOL", 30 },
            { "FUTBOL", 30 },
            { "MICROFÚTBOL", 16 },
            { "MICROFUTBOL", 16 },
            { "FÚTBOL DE SALÓN", 16 },
            { "SOFTBOL", 20 },
            { "VOLEIBOL", 16 }
        };

        public JugadoresController(
            ITorneoRepository torneoRepository,
            IJugadorRepository jugadorRepository,
            IConfiguration configuration)
        {
            _torneoRepository = torneoRepository;
            _jugadorRepository = jugadorRepository;
            _connectionString = configuration.GetConnectionString("DefaultConnection")!;
        }

        [HttpGet]
        public async Task<IActionResult> ObtenerTodos()
        {
            var jugadores = await _jugadorRepository.ObtenerTodosAsync();
            return Ok(jugadores);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> ObtenerPorId(int id)
        {
            var jugador = await _jugadorRepository.ObtenerPorIdAsync(id);
            if (jugador == null) return NotFound(new { mensaje = "Jugador no encontrado" });
            return Ok(jugador);
        }

        [HttpGet("equipo/{equipoId}")]
        public async Task<IActionResult> ObtenerPorEquipo(int equipoId)
        {
            var jugadores = await _jugadorRepository.ObtenerPorEquipoAsync(equipoId);
            return Ok(jugadores);
        }

        [HttpPost]
        public async Task<IActionResult> Crear([FromBody] Jugador jugador)
        {
            var id = await _jugadorRepository.CrearAsync(jugador);
            jugador.Id = id;
            return CreatedAtAction(nameof(ObtenerPorId), new { id = jugador.Id }, jugador);
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Actualizar(int id, [FromBody] Jugador jugador)
        {
            jugador.Id = id;
            var actualizado = await _jugadorRepository.ActualizarAsync(jugador);
            if (!actualizado) return NotFound(new { mensaje = "Jugador no encontrado" });
            return NoContent();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Eliminar(int id)
        {
            var eliminado = await _jugadorRepository.EliminarAsync(id);
            if (!eliminado) return NotFound(new { mensaje = "Jugador no encontrado" });
            return NoContent();
        }

        [HttpPost("cargar-excel")]
        public async Task<IActionResult> CargarExcel(IFormFile archivo)
        {
            if (archivo == null || archivo.Length == 0)
                return BadRequest("Por favor adjunta un archivo Excel válido.");

            ExcelPackage.LicenseContext = LicenseContext.NonCommercial;

            var torneosConDeporte = await _torneoRepository.ObtenerTorneosConDeporteAsync();
            var diccionarioTorneos = torneosConDeporte.ToDictionary(
                x => $"{((string)x.NombreTorneo).Trim().ToUpper()}_{((string)x.NombreDeporte).Trim().ToUpper()}",
                x => (int)x.TorneoId
            );

            using IDbConnection connection = new MySqlConnection(_connectionString);
            connection.Open();

            var sqlEquiposTorneo = @"
                SELECT UPPER(e.nombre) AS NombreEquipo, te.torneo_id AS TorneoId, e.id AS EquipoId
                FROM torneo_equipos te
                INNER JOIN equipos e ON te.equipo_id = e.id;";

            var equiposTorneoList = await connection.QueryAsync(sqlEquiposTorneo);
            var diccionarioEquiposTorneo = equiposTorneoList.ToDictionary(
                x => $"{((string)x.NombreEquipo).Trim().ToUpper()}_{(int)x.TorneoId}",
                x => (int)x.EquipoId
            );

            var sqlJugadoresExistentes = @"
                SELECT j.cedula AS Cedula, te.torneo_id AS TorneoId
                FROM jugadores j
                INNER JOIN torneo_equipos te ON j.equipo_id = te.equipo_id;";

            var jugadoresExistentesList = await connection.QueryAsync(sqlJugadoresExistentes);
            var setJugadoresEnTorneo = jugadoresExistentesList
                .Select(x => $"{((string)x.Cedula).Trim().ToUpper()}_{(int)x.TorneoId}")
                .ToHashSet();

            // Mapa para llevar la cuenta en vivo de cuántos jugadores van para cada EquipoId
            var sqlConteosIniciales = "SELECT equipo_id AS EquipoId, COUNT(1) AS Total FROM jugadores GROUP BY equipo_id;";
            var conteosIniciales = (await connection.QueryAsync(sqlConteosIniciales))
                .ToDictionary(x => (int)x.EquipoId, x => Convert.ToInt32(x.Total));

            var jugadoresAInsertar = new List<Jugador>();
            var errores = new List<string>();
            int omitidosCount = 0;

            using (var stream = new MemoryStream())
            {
                await archivo.CopyToAsync(stream);
                using (var package = new ExcelPackage(stream))
                {
                    var worksheet = package.Workbook.Worksheets[0];
                    int rowCount = worksheet.Dimension.Rows;

                    for (int row = 2; row <= rowCount; row++)
                    {
                        string nombre = worksheet.Cells[row, 1].Value?.ToString()?.Trim()!;
                        string cedula = worksheet.Cells[row, 2].Value?.ToString()?.Trim()!;
                        string numCamisetaStr = worksheet.Cells[row, 3].Value?.ToString()?.Trim()!;
                        string posicion = worksheet.Cells[row, 4].Value?.ToString()?.Trim()!;
                        string equipo = worksheet.Cells[row, 5].Value?.ToString()?.Trim()!;
                        string torneo = worksheet.Cells[row, 6].Value?.ToString()?.Trim()!;
                        string deporte = worksheet.Cells[row, 7].Value?.ToString()?.Trim()!;

                        if (string.IsNullOrEmpty(nombre) || string.IsNullOrEmpty(cedula) || string.IsNullOrEmpty(equipo) || string.IsNullOrEmpty(torneo) || string.IsNullOrEmpty(deporte))
                            continue;

                        string claveTorneo = $"{torneo.ToUpper()}_{deporte.ToUpper()}";
                        if (!diccionarioTorneos.TryGetValue(claveTorneo, out int torneoId))
                        {
                            errores.Add($"Fila {row}: No se encontró el torneo '{torneo}' para el deporte '{deporte}'.");
                            continue;
                        }

                        string claveEquipoTorneo = $"{equipo.ToUpper()}_{torneoId}";
                        if (!diccionarioEquiposTorneo.TryGetValue(claveEquipoTorneo, out int equipoId))
                        {
                            errores.Add($"Fila {row}: El equipo '{equipo}' no está inscrito en el torneo '{torneo}'.");
                            continue;
                        }

                        string claveJugadorTorneo = $"{cedula.ToUpper()}_{torneoId}";
                        if (setJugadoresEnTorneo.Contains(claveJugadorTorneo))
                        {
                            omitidosCount++;
                            continue;
                        }

                        // VALIDACIÓN DE LÍMITE MÁXIMO POR DEPORTE
                        int limiteMaximo = _limitesPorDeporte.TryGetValue(deporte.ToUpper(), out int max) ? max : 30;
                        int inscritosActuales = conteosIniciales.GetValueOrDefault(equipoId, 0);

                        if (inscritosActuales >= limiteMaximo)
                        {
                            errores.Add($"Fila {row}: El equipo '{equipo}' alcanzó el límite máximo de {limiteMaximo} jugadores para {deporte}.");
                            continue;
                        }

                        int? numeroCamiseta = int.TryParse(numCamisetaStr, out int parsedCamiseta) ? parsedCamiseta : null;

                        var nuevoJugador = new Jugador
                        {
                            Cedula = cedula,
                            Nombre = nombre,
                            EquipoId = equipoId,
                            NumeroCamiseta = numeroCamiseta,
                            Posicion = string.IsNullOrEmpty(posicion) ? "Sin Posición" : posicion
                        };

                        jugadoresAInsertar.Add(nuevoJugador);
                        setJugadoresEnTorneo.Add(claveJugadorTorneo);
                        
                        // Incrementar contador local del equipo
                        conteosIniciales[equipoId] = inscritosActuales + 1;
                    }
                }
            }

            if (jugadoresAInsertar.Count == 0)
            {
                return Ok(new
                {
                    mensaje = $"No se registraron nuevos jugadores. Se omitieron {omitidosCount} por duplicados o superación de límite.",
                    errores
                });
            }

            var sqlInsertJugador = @"
                INSERT INTO jugadores (cedula, equipo_id, nombre, numero_camiseta, posicion) 
                VALUES (@Cedula, @EquipoId, @Nombre, @NumeroCamiseta, @Posicion);";

            int insertadosCount = 0;
            foreach (var jugador in jugadoresAInsertar)
            {
                await connection.ExecuteAsync(sqlInsertJugador, jugador);
                insertadosCount++;
            }

            return Ok(new
            {
                mensaje = $"Carga exitosa: Se registraron {insertadosCount} jugadores y se omitieron {omitidosCount} duplicados.",
                errores
            });
        }
    }
}