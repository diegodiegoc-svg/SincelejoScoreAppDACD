using ApiSincelejoScore.Models;
using Dapper;
using MySqlConnector;

namespace ApiSincelejoScore.Repositories
{
    public class TorneoEquipoRepository : ITorneoEquipoRepository
    {
        private readonly string _connectionString;

        public TorneoEquipoRepository(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection")!;
        }

        private MySqlConnection CreateConnection() => new(_connectionString);

        public async Task<IEnumerable<Equipo>> ObtenerEquiposPorTorneoAsync(int torneoId)
        {
            using var connection = CreateConnection();
            
            // Consulta exacta mapeando las columnas reales: id, nombre, delegacion y created_at
            string sql = @"SELECT e.id AS Id, e.nombre AS Nombre, e.delegacion AS Delegacion, e.created_at AS CreatedAt 
                           FROM equipos e
                           INNER JOIN torneo_equipos te ON e.id = te.equipo_id
                           WHERE te.torneo_id = @TorneoId";

            return await connection.QueryAsync<Equipo>(sql, new { TorneoId = torneoId });
        }

        public async Task<int> AgregarEquipoATorneoAsync(TorneoEquipo torneoEquipo)
        {
            using var connection = CreateConnection();
            string sql = @"INSERT INTO torneo_equipos (torneo_id, equipo_id) 
                           VALUES (@TorneoId, @EquipoId); 
                           SELECT LAST_INSERT_ID();";
            return await connection.ExecuteScalarAsync<int>(sql, torneoEquipo);
        }

        public async Task<bool> EliminarEquipoDeTorneoAsync(int torneoId, int equipoId)
        {
            using var connection = CreateConnection();
            string sql = "DELETE FROM torneo_equipos WHERE torneo_id = @TorneoId AND equipo_id = @EquipoId";
            var filasAfectadas = await connection.ExecuteAsync(sql, new { TorneoId = torneoId, EquipoId = equipoId });
            return filasAfectadas > 0;
        }
    }
}