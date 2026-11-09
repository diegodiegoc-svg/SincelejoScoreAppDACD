using ApiSincelejoScore.Models;

namespace ApiSincelejoScore.Repositories
{
    public interface ITorneoEquipoRepository
    {
        Task<IEnumerable<Equipo>> ObtenerEquiposPorTorneoAsync(int torneoId);
        Task<int> AgregarEquipoATorneoAsync(TorneoEquipo torneoEquipo);
        Task<bool> EliminarEquipoDeTorneoAsync(int torneoId, int equipoId);
    }
}