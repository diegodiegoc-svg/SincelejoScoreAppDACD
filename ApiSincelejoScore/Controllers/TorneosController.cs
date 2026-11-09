using ApiSincelejoScore.Models;
using ApiSincelejoScore.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ApiSincelejoScore.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class TorneosController : ControllerBase
    {
        private readonly ITorneoRepository _torneoRepository;

        public TorneosController(ITorneoRepository torneoRepository)
        {
            _torneoRepository = torneoRepository;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var torneos = await _torneoRepository.ObtenerTodosAsync();
            return Ok(torneos);
        }

        [HttpGet("deporte/{deporteId}")]
        public async Task<IActionResult> GetByDeporte(int deporteId)
        {
            var torneos = await _torneoRepository.ObtenerPorDeporteAsync(deporteId);
            return Ok(torneos);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var torneo = await _torneoRepository.ObtenerPorIdAsync(id);
            if (torneo == null) return NotFound("Torneo no encontrado.");
            return Ok(torneo);
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] Torneo torneo)
        {
            var id = await _torneoRepository.CrearAsync(torneo);
            torneo.Id = id;
            return CreatedAtAction(nameof(GetById), new { id = torneo.Id }, torneo);
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Update(int id, [FromBody] Torneo torneo)
        {
            if (torneo == null) return BadRequest("Datos inválidos.");
            torneo.Id = id;
            var actualizado = await _torneoRepository.ActualizarAsync(torneo);
            if (!actualizado) return NotFound("Torneo no encontrado.");
            return NoContent();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var eliminado = await _torneoRepository.EliminarAsync(id);
            if (!eliminado) return NotFound("Torneo no encontrado.");
            return NoContent();
        }
    }
}
