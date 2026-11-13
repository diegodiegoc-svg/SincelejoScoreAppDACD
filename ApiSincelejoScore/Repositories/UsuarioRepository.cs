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

        public async Task<IEnumerable<UsuarioRespuestaDto>> ObtenerTodosAsync()
        {
            using var connection = CreateConnection();
            string sql = @"
                SELECT 
                    u.id AS Id,
                    u.username AS Username,
                    u.nombre_completo AS NombreCompleto,
                    u.rol AS Rol,
                    u.torneo_id AS TorneoId,
                    t.nombre AS TorneoNombre,
                    u.activo AS Activo
                FROM usuarios u
                LEFT JOIN torneos t ON u.torneo_id = t.id
                ORDER BY u.id ASC;";

            return await connection.QueryAsync<UsuarioRespuestaDto>(sql);
        }

        public async Task<Usuario?> ObtenerPorIdAsync(int id)
        {
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
                WHERE id = @Id
                LIMIT 1;";

            return await connection.QueryFirstOrDefaultAsync<Usuario>(sql, new { Id = id });
        }

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

        public async Task<bool> ExisteUsernameAsync(string username, int? ignorarId = null)
        {
            if (string.IsNullOrWhiteSpace(username))
                return false;

            using var connection = CreateConnection();
            string sql = @"
                SELECT COUNT(1)
                FROM usuarios
                WHERE LOWER(TRIM(username)) = LOWER(TRIM(@Username))
                  AND (@IgnorarId IS NULL OR id != @IgnorarId);";

            var count = await connection.ExecuteScalarAsync<int>(sql, new 
            { 
                Username = username.Trim(), 
                IgnorarId = ignorarId 
            });

            return count > 0;
        }

        public async Task<int> CrearAsync(Usuario usuario)
        {
            using var connection = CreateConnection();
            string sql = @"
                INSERT INTO usuarios (username, password_hash, nombre_completo, rol, torneo_id, activo)
                VALUES (@Username, @PasswordHash, @NombreCompleto, @Rol, @TorneoId, @Activo);
                SELECT LAST_INSERT_ID();";

            return await connection.ExecuteScalarAsync<int>(sql, usuario);
        }

        public async Task<bool> ActualizarAsync(Usuario usuario)
        {
            using var connection = CreateConnection();
            string sql = @"
                UPDATE usuarios
                SET username = @Username,
                    password_hash = @PasswordHash,
                    nombre_completo = @NombreCompleto,
                    rol = @Rol,
                    torneo_id = @TorneoId,
                    activo = @Activo
                WHERE id = @Id;";

            var filasAfectadas = await connection.ExecuteAsync(sql, usuario);
            return filasAfectadas > 0;
        }

        public async Task<bool> EliminarAsync(int id)
        {
            using var connection = CreateConnection();
            string sql = @"DELETE FROM usuarios WHERE id = @Id;";
            var filasAfectadas = await connection.ExecuteAsync(sql, new { Id = id });
            return filasAfectadas > 0;
        }
    }
}
