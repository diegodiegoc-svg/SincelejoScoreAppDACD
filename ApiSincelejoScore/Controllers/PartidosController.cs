using ApiSincelejoScore.Models;
using ApiSincelejoScore.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ApiSincelejoScore.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PartidosController : ControllerBase
    {
        private readonly IPartidoRepository _partidoRepository;
        private readonly IFixtureService _fixtureService;

        public PartidosController(IPartidoRepository partidoRepository, IFixtureService fixtureService)
        {
            _partidoRepository = partidoRepository;
            _fixtureService = fixtureService;
        }

        [HttpGet]
        public async Task<IActionResult> ObtenerTodos()
        {
            var partidos = await _partidoRepository.ObtenerTodosAsync();
            return Ok(partidos);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> ObtenerPorId(int id)
        {
            var partido = await _partidoRepository.ObtenerPorIdAsync(id);
            if (partido == null)
            {
                return NotFound(new { mensaje = "Partido no encontrado." });
            }
            return Ok(partido);
        }

        [HttpGet("torneo/{torneoId}")]
        public async Task<IActionResult> ObtenerPorTorneo(int torneoId, [FromQuery] string? estado = null)
        {
            var partidos = await _partidoRepository.ObtenerPorTorneoAsync(torneoId, estado);
            return Ok(partidos);
        }

        [HttpPost]
        public async Task<IActionResult> Crear([FromBody] Partido partido)
        {
            if (partido == null)
            {
                return BadRequest();
            }

            var idCreado = await _partidoRepository.CrearAsync(partido);
            partido.Id = idCreado;

            return CreatedAtAction(nameof(ObtenerPorId), new { id = partido.Id }, partido);
        }

        [HttpPost("generar-fixture/{torneoId}")]
        public async Task<IActionResult> GenerarFixture(int torneoId, [FromQuery] int numeroDeVueltas = 1)
        {
            try
            {
                var cantidadCreados = await _fixtureService.GenerarFixtureRoundRobinAsync(torneoId, numeroDeVueltas);
                return Ok(new 
                { 
                    mensaje = $"Fixture generado exitosamente ({numeroDeVueltas} vuelta(s)). Se crearon {cantidadCreados} partidos.",
                    partidosCreados = cantidadCreados 
                });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { mensaje = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { mensaje = "Ocurrió un error al generar el fixture.", detalle = ex.Message });
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Actualizar(int id, [FromBody] Partido partido)
        {
            if (partido == null)
            {
                return BadRequest(new { mensaje = "Los datos del partido son inválidos." });
            }
            partido.Id = id;

            var existe = await _partidoRepository.ObtenerPorIdAsync(id);
            if (existe == null)
            {
                return NotFound(new { mensaje = "El partido a actualizar no existe." });
            }

            var actualizado = await _partidoRepository.ActualizarAsync(partido);
            if (actualizado)
            {
                return Ok(new { mensaje = "Partido actualizado correctamente." });
            }

            return StatusCode(500, new { mensaje = "No se pudo actualizar el partido." });
        }

        public class ActualizarMarcadorDto
        {
            public int PuntosLocal { get; set; }
            public int PuntosVisitante { get; set; }
            public string? Estado { get; set; }
            public string? EstadoDetalle { get; set; }
            public int? MinutoActual { get; set; }
        }

        [HttpPatch("{id}/marcador")]
        public async Task<IActionResult> ActualizarMarcador(int id, [FromBody] ActualizarMarcadorDto dto)
        {
            var partido = await _partidoRepository.ObtenerPorIdAsync(id);
            if (partido == null)
            {
                return NotFound(new { mensaje = "El partido no existe." });
            }

            partido.PuntosLocal = dto.PuntosLocal;
            partido.PuntosVisitante = dto.PuntosVisitante;
            if (!string.IsNullOrEmpty(dto.Estado)) partido.Estado = dto.Estado;
            if (dto.EstadoDetalle != null) partido.EstadoDetalle = dto.EstadoDetalle;
            if (dto.MinutoActual.HasValue) partido.MinutoActual = dto.MinutoActual;

            var actualizado = await _partidoRepository.ActualizarAsync(partido);
            if (actualizado)
            {
                return Ok(partido);
            }
            return StatusCode(500, new { mensaje = "No se pudo actualizar el marcador." });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Eliminar(int id)
        {
            var existe = await _partidoRepository.ObtenerPorIdAsync(id);
            if (existe == null)
            {
                return NotFound(new { mensaje = "El partido a eliminar no existe." });
            }

            var eliminado = await _partidoRepository.EliminarAsync(id);
            if (eliminado)
            {
                return Ok(new { mensaje = "Partido eliminado correctamente." });
            }

            return StatusCode(500, new { mensaje = "No se pudo eliminar el partido." });
        }
    }
}
