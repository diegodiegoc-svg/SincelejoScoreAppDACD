using ApiSincelejoScore.Models;

namespace ApiSincelejoScore.Repositories
{
    public interface ICanchaRepository
    {
        Task<IEnumerable<Cancha>> ObtenerTodasAsync();
        Task<Cancha?> ObtenerPorIdAsync(int id);
        Task<int> CrearAsync(Cancha cancha);
        Task<bool> ActualizarAsync(Cancha cancha);
        Task<bool> EliminarAsync(int id);
    }
}