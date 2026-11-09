using ApiSincelejoScore.Models;
using Dapper;
using MySql.Data.MySqlClient;
using System.Data;

namespace ApiSincelejoScore.Repositories
{
    public class EquipoRepository : IEquipoRepository
    {
        private readonly string _connectionString;

        public EquipoRepository(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection")!;
        }

        private IDbConnection CreateConnection() => new MySqlConnection(_connectionString);

        public async Task<IEnumerable<Equipo>> ObtenerTodosAsync()
        {
            using var connection = CreateConnection();
            var sql = "SELECT id AS Id, nombre AS Nombre, delegacion AS Delegacion FROM equipos";
            return await connection.QueryAsync<Equipo>(sql);
        }

        public async Task<Equipo?> ObtenerPorIdAsync(int id)
        {
            using var connection = CreateConnection();
            var sql = "SELECT id AS Id, nombre AS Nombre, delegacion AS Delegacion FROM equipos WHERE id = @Id";
            return await connection.QueryFirstOrDefaultAsync<Equipo>(sql, new { Id = id });
        }

        public async Task<int> CrearAsync(Equipo equipo)
        {
            using var connection = CreateConnection();
            var sql = @"INSERT INTO equipos (nombre, delegacion) 
                        VALUES (@Nombre, @Delegacion);
                        SELECT LAST_INSERT_ID();";
            return await connection.ExecuteScalarAsync<int>(sql, equipo);
        }

        public async Task<bool> ActualizarAsync(Equipo equipo)
        {
            using var connection = CreateConnection();
            var sql = @"UPDATE equipos 
                        SET nombre = @Nombre, delegacion = @Delegacion 
                        WHERE id = @Id";
            var result = await connection.ExecuteAsync(sql, equipo);
            return result > 0;
        }

        public async Task<bool> EliminarAsync(int id)
        {
            using var connection = CreateConnection();
            var sql = "DELETE FROM equipos WHERE id = @Id";
            var result = await connection.ExecuteAsync(sql, new { Id = id });
            return result > 0;
        }
    }
}