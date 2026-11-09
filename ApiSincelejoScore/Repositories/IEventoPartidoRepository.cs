using ApiSincelejoScore.Models;

namespace ApiSincelejoScore.Repositories
{
    public interface IEventoPartidoRepository
    {
        Task<IEnumerable<EventoPartido>> ObtenerEventosPorPartidoAsync(int partidoId);
        Task<int> CrearAsync(EventoPartido evento);
        Task<bool> ActualizarAsync(EventoPartido evento);
        Task<bool> EliminarAsync(int id);
    }
}