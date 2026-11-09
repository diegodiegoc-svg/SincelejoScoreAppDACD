using ApiSincelejoScore.Models;

namespace ApiSincelejoScore.Repositories
{
    public interface IEquipoRepository
    {
        Task<IEnumerable<Equipo>> ObtenerTodosAsync();
        Task<Equipo?> ObtenerPorIdAsync(int id);
        Task<int> CrearAsync(Equipo equipo);
        Task<bool> ActualizarAsync(Equipo equipo);
        Task<bool> EliminarAsync(int id);
    }
}