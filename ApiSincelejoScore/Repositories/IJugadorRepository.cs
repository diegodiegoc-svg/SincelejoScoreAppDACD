using ApiSincelejoScore.Models;

namespace ApiSincelejoScore.Repositories
{
    public interface IJugadorRepository
    {
        Task<IEnumerable<Jugador>> ObtenerTodosAsync();
        Task InsertarMasivoAsync(IEnumerable<Jugador> jugadores);
        Task<IEnumerable<Jugador>> ObtenerPorEquipoAsync(int equipoId);
        Task<Jugador?> ObtenerPorIdAsync(int id);
        Task<int> CrearAsync(Jugador jugador);
        Task<bool> ActualizarAsync(Jugador jugador);
        Task<bool> EliminarAsync(int id);
    }
}