using ApiSincelejoScore.Models;

namespace ApiSincelejoScore.Repositories
{
    public interface ITorneoRepository
    {
        Task<IEnumerable<Torneo>> ObtenerTodosAsync();
        Task<Torneo?> ObtenerPorIdAsync(int id);
        Task<IEnumerable<Torneo>> ObtenerPorDeporteAsync(int deporteId);
        Task<int> CrearAsync(Torneo torneo);
        Task<bool> ActualizarAsync(Torneo torneo);
        Task<bool> EliminarAsync(int id);
        Task<IEnumerable<dynamic>> ObtenerTorneosConDeporteAsync();
    }
}