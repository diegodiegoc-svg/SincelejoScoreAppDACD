using ApiSincelejoScore.Models;

namespace ApiSincelejoScore.Repositories
{
    public interface IPartidoRepository
    {
        Task<IEnumerable<Partido>> ObtenerTodosAsync();
        Task<Partido?> ObtenerPorIdAsync(int id);
        Task<IEnumerable<Partido>> ObtenerPorTorneoAsync(int torneoId, string? estado = null);
        Task<int> CrearAsync(Partido partido);
        Task<bool> ActualizarAsync(Partido partido);
        Task<bool> EliminarAsync(int id);
    }
}