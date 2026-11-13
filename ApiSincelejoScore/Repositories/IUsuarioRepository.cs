using ApiSincelejoScore.Models;

namespace ApiSincelejoScore.Repositories
{
    public interface IUsuarioRepository
    {
        Task<Usuario?> ObtenerPorIdAsync(int id);
        Task<Usuario?> ObtenerPorUsernameAsync(string username);
        Task<IEnumerable<UsuarioRespuestaDto>> ObtenerTodosAsync();
        Task<int> CrearAsync(Usuario usuario);
        Task<bool> ActualizarAsync(Usuario usuario);
        Task<bool> EliminarAsync(int id);
        Task<bool> ExisteUsernameAsync(string username, int? ignorarId = null);
    }
}
