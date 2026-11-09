using ApiSincelejoScore.Models;
using Dapper;
using MySqlConnector;

namespace ApiSincelejoScore.Repositories
{
    public class CanchaRepository : ICanchaRepository
    {
        private readonly string _connectionString;

        public CanchaRepository(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection")!;
        }

        private MySqlConnection CreateConnection() => new(_connectionString);

        public async Task<IEnumerable<Cancha>> ObtenerTodasAsync()
        {
            using var connection = CreateConnection();
            string sql = "SELECT id AS Id, nombre AS Nombre, direccion AS Direccion FROM canchas ORDER BY nombre ASC;";
            return await connection.QueryAsync<Cancha>(sql);
        }

        public async Task<Cancha?> ObtenerPorIdAsync(int id)
        {
            using var connection = CreateConnection();
            string sql = "SELECT id AS Id, nombre AS Nombre, direccion AS Direccion FROM canchas WHERE id = @Id;";
            return await connection.QueryFirstOrDefaultAsync<Cancha>(sql, new { Id = id });
        }

        public async Task<int> CrearAsync(Cancha cancha)
        {
            using var connection = CreateConnection();
            string sql = "INSERT INTO canchas (nombre, direccion) VALUES (@Nombre, @Direccion); SELECT LAST_INSERT_ID();";
            return await connection.ExecuteScalarAsync<int>(sql, cancha);
        }

        public async Task<bool> ActualizarAsync(Cancha cancha)
        {
            using var connection = CreateConnection();
            string sql = "UPDATE canchas SET nombre = @Nombre, direccion = @Direccion WHERE id = @Id;";
            var filasAfectadas = await connection.ExecuteAsync(sql, cancha);
            return filasAfectadas > 0;
        }

        public async Task<bool> EliminarAsync(int id)
        {
            using var connection = CreateConnection();
            string sql = "DELETE FROM canchas WHERE id = @Id;";
            var filasAfectadas = await connection.ExecuteAsync(sql, new { Id = id });
            return filasAfectadas > 0;
        }
    }
}