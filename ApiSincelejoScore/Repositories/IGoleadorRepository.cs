using ApiSincelejoScore.Models;

namespace ApiSincelejoScore.Repositories
{
    public interface IGoleadorRepository
    {
        Task<IEnumerable<GoleadorDto>> ObtenerGoleadoresPorTorneoAsync(int torneoId);
    }
}