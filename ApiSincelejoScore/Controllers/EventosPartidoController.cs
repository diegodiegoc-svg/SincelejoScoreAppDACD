using ApiSincelejoScore.Models;
using ApiSincelejoScore.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ApiSincelejoScore.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class EventosPartidoController : ControllerBase
    {
        private readonly IEventoPartidoRepository _eventoPartidoRepository;

        public EventosPartidoController(IEventoPartidoRepository eventoPartidoRepository)
        {
            _eventoPartidoRepository = eventoPartidoRepository;
        }

        [HttpGet("partido/{partidoId}")]
        public async Task<IActionResult> ObtenerEventosPorPartido(int partidoId)
        {
            var eventos = await _eventoPartidoRepository.ObtenerEventosPorPartidoAsync(partidoId);
            return Ok(eventos);
        }

        [HttpPost]
        public async Task<IActionResult> Crear([FromBody] EventoPartido evento)
        {
            var id = await _eventoPartidoRepository.CrearAsync(evento);
            evento.Id = id;
            return Ok(evento);
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Actualizar(int id, [FromBody] EventoPartido evento)
        {
            evento.Id = id;
            var actualizado = await _eventoPartidoRepository.ActualizarAsync(evento);
            if (!actualizado) return NotFound();
            return NoContent();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Eliminar(int id)
        {
            var eliminado = await _eventoPartidoRepository.EliminarAsync(id);
            if (!eliminado) return NotFound();
            return NoContent();
        }
    }
}