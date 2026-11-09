using ApiSincelejoScore.Models;

namespace ApiSincelejoScore.Repositories
{
    public interface IFixtureService
    {
        Task<int> GenerarFixtureRoundRobinAsync(int torneoId, int numeroDeVueltas = 1);
    }
}