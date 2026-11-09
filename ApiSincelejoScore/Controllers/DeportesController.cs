using ApiSincelejoScore.Models;
using ApiSincelejoScore.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ApiSincelejoScore.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class DeportesController : ControllerBase
    {
        private readonly IDeporteRepository _deporteRepository;

        public DeportesController(IDeporteRepository deporteRepository)
        {
            _deporteRepository = deporteRepository;
        }

        [HttpGet]
        public async Task<IActionResult> ObtenerTodos()
        {
            var deportes = await _deporteRepository.ObtenerTodosAsync();
            return Ok(deportes);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> ObtenerPorId(int id)
        {
            var deporte = await _deporteRepository.ObtenerPorIdAsync(id);
            if (deporte == null) return NotFound();
            return Ok(deporte);
        }

        [HttpPost]
        public async Task<IActionResult> Crear([FromBody] Deporte deporte)
        {
            var id = await _deporteRepository.CrearAsync(deporte);
            deporte.Id = id;
            return CreatedAtAction(nameof(ObtenerPorId), new { id = id }, deporte);
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Actualizar(int id, [FromBody] Deporte deporte)
        {
            deporte.Id = id;
            var actualizado = await _deporteRepository.ActualizarAsync(deporte);
            if (!actualizado) return NotFound();
            return NoContent();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Eliminar(int id)
        {
            var eliminado = await _deporteRepository.EliminarAsync(id);
            if (!eliminado) return NotFound();
            return NoContent();
        }
    }
}