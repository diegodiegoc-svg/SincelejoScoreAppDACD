using ApiSincelejoScore.Models;

namespace ApiSincelejoScore.Repositories
{
    public interface IUsuarioRepository
    {
        Task<Usuario?> ObtenerPorUsernameAsync(string username);
    }
}
