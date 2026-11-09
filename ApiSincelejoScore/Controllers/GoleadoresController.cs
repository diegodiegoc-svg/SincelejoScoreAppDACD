using ApiSincelejoScore.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ApiSincelejoScore.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class GoleadoresController : ControllerBase
    {
        private readonly IGoleadorRepository _goleadorRepo;

        public GoleadoresController(IGoleadorRepository goleadorRepo)
        {
            _goleadorRepo = goleadorRepo;
        }

        [HttpGet("torneo/{torneoId}")]
        public async Task<IActionResult> ObtenerGoleadoresPorTorneo(int torneoId)
        {
            var goleadores = await _goleadorRepo.ObtenerGoleadoresPorTorneoAsync(torneoId);
            return Ok(goleadores);
        }
    }
}