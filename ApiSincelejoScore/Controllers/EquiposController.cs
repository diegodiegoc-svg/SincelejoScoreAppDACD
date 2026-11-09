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
    public class EquiposController : ControllerBase
    {
        private readonly IEquipoRepository _equipoRepository;
        private readonly ITorneoRepository _torneoRepository;
        private readonly string _connectionString;

        public EquiposController(
            IEquipoRepository equipoRepository, 
            ITorneoRepository torneoRepository,
            IConfiguration configuration)
        {
            _equipoRepository = equipoRepository;
            _torneoRepository = torneoRepository;
            _connectionString = configuration.GetConnectionString("DefaultConnection")!;
        }

        [HttpGet]
        public async Task<IActionResult> ObtenerTodos()
        {
            var equipos = await _equipoRepository.ObtenerTodosAsync();
            return Ok(equipos);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> ObtenerPorId(int id)
        {
            var equipo = await _equipoRepository.ObtenerPorIdAsync(id);
            if (equipo == null)
                return NotFound(new { mensaje = "Equipo no encontrado" });

            return Ok(equipo);
        }

        // DTO para la creación manual individual que incluye el torneo
        public class CrearEquipoDto
        {
            public string Nombre { get; set; } = null!;
            public string Delegacion { get; set; } = null!;
            public int TorneoId { get; set; }
        }

        [HttpPost]
        public async Task<IActionResult> Crear([FromBody] CrearEquipoDto dto)
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            using IDbConnection connection = new MySqlConnection(_connectionString);
            
            // 1. Validar que el torneo exista
            var sqlTorneo = "SELECT COUNT(1) FROM torneos WHERE id = @TorneoId";
            var existeTorneo = await connection.ExecuteScalarAsync<bool>(sqlTorneo, new { dto.TorneoId });
            if (!existeTorneo)
                return BadRequest(new { mensaje = $"El torneo con ID {dto.TorneoId} no existe." });

            // 2. Validar si ya existe un equipo con ese mismo nombre e inscrito en ese mismo torneo
            var sqlExisteInscripcion = @"
                SELECT COUNT(1) 
                FROM torneo_equipos te
                INNER JOIN equipos e ON te.equipo_id = e.id
                WHERE LOWER(e.nombre) = LOWER(@Nombre) AND te.torneo_id = @TorneoId;";

            var yaInscrito = await connection.ExecuteScalarAsync<bool>(sqlExisteInscripcion, new { dto.Nombre, dto.TorneoId });
            if (yaInscrito)
            {
                return BadRequest(new { mensaje = $"El equipo '{dto.Nombre}' ya se encuentra inscrito en este torneo." });
            }

            // 3. Crear el equipo
            var nuevoEquipo = new Equipo { Nombre = dto.Nombre, Delegacion = dto.Delegacion };
            var equipoId = await _equipoRepository.CrearAsync(nuevoEquipo);

            // 4. Vincular a torneo_equipos
            var sqlInsertRelacion = "INSERT INTO torneo_equipos (torneo_id, equipo_id) VALUES (@TorneoId, @EquipoId);";
            await connection.ExecuteAsync(sqlInsertRelacion, new { dto.TorneoId, EquipoId = equipoId });

            nuevoEquipo.Id = equipoId;
            return CreatedAtAction(nameof(ObtenerPorId), new { id = nuevoEquipo.Id }, nuevoEquipo);
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Actualizar(int id, [FromBody] Equipo equipo)
        {
            if (id != equipo.Id)
                return BadRequest(new { mensaje = "El ID del parámetro no coincide con el objeto" });

            var actualizado = await _equipoRepository.ActualizarAsync(equipo);
            if (!actualizado)
                return NotFound(new { mensaje = "Equipo no encontrado para actualizar" });

            return NoContent();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Eliminar(int id)
        {
            var eliminado = await _equipoRepository.EliminarAsync(id);
            if (!eliminado)
                return NotFound(new { mensaje = "Equipo no encontrado para eliminar" });

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

            var listaAInsertar = new List<(Equipo equipo, int torneoId)>();
            var errores = new List<string>();
            var omitidosCount = 0;

            using (IDbConnection connection = new MySqlConnection(_connectionString))
            {
                connection.Open();

                // Cargar todas las relaciones torneo-equipo existentes en memoria para evitar consultas repetitivas
                var sqlExistentes = @"
                    SELECT CONCAT(UPPER(e.nombre), '_', te.torneo_id)
                    FROM torneo_equipos te
                    INNER JOIN equipos e ON te.equipo_id = e.id;";
                
                var relacionesExistentes = (await connection.QueryAsync<string>(sqlExistentes)).ToHashSet();

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
                            string delegacion = worksheet.Cells[row, 2].Value?.ToString()?.Trim()!;
                            string torneo = worksheet.Cells[row, 3].Value?.ToString()?.Trim()!;
                            string deporte = worksheet.Cells[row, 4].Value?.ToString()?.Trim()!;

                            if (string.IsNullOrEmpty(nombre) || string.IsNullOrEmpty(torneo) || string.IsNullOrEmpty(deporte))
                                continue;

                            string claveTorneo = $"{torneo.ToUpper()}_{deporte.ToUpper()}";

                            if (diccionarioTorneos.TryGetValue(claveTorneo, out int torneoId))
                            {
                                string claveValidacionExistente = $"{nombre.ToUpper()}_{torneoId}";

                                // Validación Anti-Duplicado: Si ya existe la combinación NombreEquipo + TorneoId, se omite
                                if (relacionesExistentes.Contains(claveValidacionExistente))
                                {
                                    omitidosCount++;
                                    continue;
                                }

                                var nuevoEquipo = new Equipo
                                {
                                    Nombre = nombre,
                                    Delegacion = string.IsNullOrEmpty(delegacion) ? "Sin Delegación" : delegacion
                                };

                                listaAInsertar.Add((nuevoEquipo, torneoId));
                                // Se agrega al conjunto local para evitar duplicados que vengan repetidos dentro del mismo Excel
                                relacionesExistentes.Add(claveValidacionExistente);
                            }
                            else
                            {
                                errores.Add($"Fila {row}: No se encontró el torneo '{torneo}' para el deporte '{deporte}'.");
                            }
                        }
                    }
                }

                if (listaAInsertar.Count == 0)
                {
                    return Ok(new 
                    { 
                        mensaje = $"No se insertaron nuevos equipos. Se omitieron {omitidosCount} registros porque ya estaban inscritos.", 
                        errores 
                    });
                }

                int insertadosCount = 0;
                var sqlTorneoEquipo = @"INSERT INTO torneo_equipos (torneo_id, equipo_id) VALUES (@TorneoId, @EquipoId);";

                foreach (var item in listaAInsertar)
                {
                    int equipoId = await _equipoRepository.CrearAsync(item.equipo);
                    await connection.ExecuteAsync(sqlTorneoEquipo, new { TorneoId = item.torneoId, EquipoId = equipoId });
                    insertadosCount++;
                }

                return Ok(new
                {
                    mensaje = $"Carga finalizada: Se insertaron {insertadosCount} equipos nuevos y se omitieron {omitidosCount} por ya estar registrados en el mismo torneo.",
                    errores
                });
            }
        }
    }
}