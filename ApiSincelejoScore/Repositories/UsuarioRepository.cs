using ApiSincelejoScore.Models;
using Dapper;
using MySqlConnector;

namespace ApiSincelejoScore.Repositories
{
    public class UsuarioRepository : IUsuarioRepository
    {
        private readonly string _connectionString;

        public UsuarioRepository(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection")!;
        }

        private MySqlConnection CreateConnection() => new(_connectionString);

        public async Task<Usuario?> ObtenerPorUsernameAsync(string username)
        {
            if (string.IsNullOrWhiteSpace(username))
                return null;

            using var connection = CreateConnection();
            string sql = @"
                SELECT 
                    id AS Id,
                    username AS Username,
                    password_hash AS PasswordHash,
                    nombre_completo AS NombreCompleto,
                    rol AS Rol,
                    torneo_id AS TorneoId,
                    activo AS Activo
                FROM usuarios
                WHERE LOWER(TRIM(username)) = LOWER(TRIM(@Username))
                  AND (activo = 1 OR activo = TRUE OR activo = '1' OR activo = 'true' OR activo IS NULL)
                LIMIT 1;";

            return await connection.QueryFirstOrDefaultAsync<Usuario>(sql, new { Username = username.Trim() });
        }
    }
}
