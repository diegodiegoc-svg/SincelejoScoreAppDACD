using ApiSincelejoScore.Models;
using ApiSincelejoScore.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ApiSincelejoScore.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TorneoEquiposController : ControllerBase
    {
        private readonly ITorneoEquipoRepository _torneoEquipoRepository;

        public TorneoEquiposController(ITorneoEquipoRepository torneoEquipoRepository)
        {
            _torneoEquipoRepository = torneoEquipoRepository;
        }

        // Obtener todos los equipos pertenecientes a un torneo específico
        [HttpGet("torneo/{torneoId}")]
        public async Task<IActionResult> ObtenerEquiposPorTorneo(int torneoId)
        {
            var equipos = await _torneoEquipoRepository.ObtenerEquiposPorTorneoAsync(torneoId);
            return Ok(equipos);
        }

        // Asociar un equipo a un torneo
        [HttpPost]
        public async Task<IActionResult> AgregarEquipoATorneo([FromBody] TorneoEquipo torneoEquipo)
        {
            var id = await _torneoEquipoRepository.AgregarEquipoATorneoAsync(torneoEquipo);
            return Ok(new { id, mensaje = "Equipo asociado al torneo con éxito" });
        }

        // Desasociar un equipo de un torneo
        [HttpDelete("torneo/{torneoId}/equipo/{equipoId}")]
        public async Task<IActionResult> EliminarEquipoDeTorneo(int torneoId, int equipoId)
        {
            var resultado = await _torneoEquipoRepository.EliminarEquipoDeTorneoAsync(torneoId, equipoId);
            if (!resultado)
                return NotFound(new { mensaje = "No se encontró la relación para eliminar" });

            return Ok(new { mensaje = "Equipo eliminado del torneo con éxito" });
        }
    }
}