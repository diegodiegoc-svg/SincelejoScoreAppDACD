using ApiSincelejoScore.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ApiSincelejoScore.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TablaPosicionesController : ControllerBase
    {
        private readonly ITablaPosicionesRepository _tablaRepository;

        public TablaPosicionesController(ITablaPosicionesRepository tablaRepository)
        {
            _tablaRepository = tablaRepository;
        }

        [HttpGet("torneo/{torneoId}")]
        public async Task<IActionResult> ObtenerTabla(int torneoId)
        {
            var tabla = await _tablaRepository.ObtenerTablaPorTorneoAsync(torneoId);
            return Ok(tabla);
        }
    }
}