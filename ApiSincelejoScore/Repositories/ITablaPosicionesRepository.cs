using ApiSincelejoScore.Models;

namespace ApiSincelejoScore.Repositories
{
    public interface ITablaPosicionesRepository
    {
        Task<IEnumerable<TablaPosicionesDto>> ObtenerTablaPorTorneoAsync(int torneoId);
    }
}