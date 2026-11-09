using ApiSincelejoScore.Models;
using Dapper;
using MySql.Data.MySqlClient;
using System.Data;

namespace ApiSincelejoScore.Repositories
{
    public class TorneoRepository : ITorneoRepository
    {
        private readonly string _connectionString;

        public TorneoRepository(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection")!;
        }

        private IDbConnection CreateConnection() => new MySqlConnection(_connectionString);

        public async Task<IEnumerable<Torneo>> ObtenerTodosAsync()
        {
            using var connection = CreateConnection();
            var sql = @"SELECT 
                            id AS Id, 
                            nombre AS Nombre, 
                            deporte_id AS DeporteId, 
                            cancha_sede_id AS CanchaSedeId, 
                            es_multicancha AS EsMulticancha, 
                            temporada AS Temporada 
                        FROM torneos";
            return await connection.QueryAsync<Torneo>(sql);
        }

        public async Task<Torneo?> ObtenerPorIdAsync(int id)
        {
            using var connection = CreateConnection();
            var sql = @"SELECT 
                            id AS Id, 
                            nombre AS Nombre, 
                            deporte_id AS DeporteId, 
                            cancha_sede_id AS CanchaSedeId, 
                            es_multicancha AS EsMulticancha, 
                            temporada AS Temporada 
                        FROM torneos WHERE id = @Id";
            return await connection.QueryFirstOrDefaultAsync<Torneo>(sql, new { Id = id });
        }

        public async Task<IEnumerable<Torneo>> ObtenerPorDeporteAsync(int deporteId)
        {
            using var connection = CreateConnection();
            var sql = @"SELECT 
                            id AS Id, 
                            nombre AS Nombre, 
                            deporte_id AS DeporteId, 
                            cancha_sede_id AS CanchaSedeId, 
                            es_multicancha AS EsMulticancha, 
                            temporada AS Temporada 
                        FROM torneos WHERE deporte_id = @DeporteId";
            return await connection.QueryAsync<Torneo>(sql, new { DeporteId = deporteId });
        }

        public async Task<int> CrearAsync(Torneo torneo)
        {
            using var connection = CreateConnection();
            var sql = @"INSERT INTO torneos (nombre, deporte_id, cancha_sede_id, es_multicancha, temporada) 
                        VALUES (@Nombre, @DeporteId, @CanchaSedeId, @EsMulticancha, @Temporada);
                        SELECT LAST_INSERT_ID();";
            return await connection.ExecuteScalarAsync<int>(sql, torneo);
        }

        public async Task<bool> ActualizarAsync(Torneo torneo)
        {
            using var connection = CreateConnection();
            var sql = @"UPDATE torneos 
                        SET nombre = @Nombre, 
                            deporte_id = @DeporteId, 
                            cancha_sede_id = @CanchaSedeId, 
                            es_multicancha = @EsMulticancha, 
                            temporada = @Temporada 
                        WHERE id = @Id";
            var result = await connection.ExecuteAsync(sql, torneo);
            return result > 0;
        }

        public async Task<bool> EliminarAsync(int id)
        {
            using var connection = CreateConnection();
            var sql = "DELETE FROM torneos WHERE id = @Id";
            var result = await connection.ExecuteAsync(sql, new { Id = id });
            return result > 0;
        }

        public async Task<IEnumerable<dynamic>> ObtenerTorneosConDeporteAsync()
        {
            using var connection = CreateConnection();
            var sql = @"SELECT 
                            t.id AS TorneoId, 
                            t.nombre AS NombreTorneo, 
                            d.nombre AS NombreDeporte, 
                            t.cancha_sede_id AS CanchaSedeId, 
                            t.es_multicancha AS EsMulticancha 
                        FROM torneos t
                        INNER JOIN deportes d ON t.deporte_id = d.id";
            return await connection.QueryAsync(sql);
        }
    }
}
