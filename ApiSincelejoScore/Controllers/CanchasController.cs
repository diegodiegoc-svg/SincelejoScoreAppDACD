using ApiSincelejoScore.Models;
using ApiSincelejoScore.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ApiSincelejoScore.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CanchasController : ControllerBase
    {
        private readonly ICanchaRepository _canchaRepository;

        public CanchasController(ICanchaRepository canchaRepository)
        {
            _canchaRepository = canchaRepository;
        }

        [HttpGet]
        public async Task<IActionResult> ObtenerTodas()
        {
            var canchas = await _canchaRepository.ObtenerTodasAsync();
            return Ok(canchas);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> ObtenerPorId(int id)
        {
            var cancha = await _canchaRepository.ObtenerPorIdAsync(id);
            if (cancha == null) return NotFound(new { mensaje = "Cancha no encontrada" });
            return Ok(cancha);
        }

        [HttpPost]
        public async Task<IActionResult> Crear([FromBody] Cancha cancha)
        {
            var id = await _canchaRepository.CrearAsync(cancha);
            cancha.Id = id;
            return CreatedAtAction(nameof(ObtenerPorId), new { id = cancha.Id }, cancha);
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Actualizar(int id, [FromBody] Cancha cancha)
        {
            cancha.Id = id;
            var actualizado = await _canchaRepository.ActualizarAsync(cancha);
            if (!actualizado) return NotFound(new { mensaje = "Cancha no encontrada" });
            return NoContent();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Eliminar(int id)
        {
            var eliminado = await _canchaRepository.EliminarAsync(id);
            if (!eliminado) return NotFound(new { mensaje = "Cancha no encontrada" });
            return NoContent();
        }
    }
}