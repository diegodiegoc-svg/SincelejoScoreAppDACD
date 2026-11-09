using ApiSincelejoScore.Models;

namespace ApiSincelejoScore.Repositories
{
    public interface IDeporteRepository
    {
        Task<IEnumerable<Deporte>> ObtenerTodosAsync();
        Task<Deporte?> ObtenerPorIdAsync(int id);
        Task<int> CrearAsync(Deporte deporte);
        Task<bool> ActualizarAsync(Deporte deporte);
        Task<bool> EliminarAsync(int id);
    }
}