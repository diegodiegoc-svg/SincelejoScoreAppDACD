using ApiSincelejoScore.Models;
using Dapper;
using MySqlConnector;

namespace ApiSincelejoScore.Repositories
{
    public class GoleadorRepository : IGoleadorRepository
    {
        private readonly string _connectionString;

        public GoleadorRepository(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection")!;
        }

        private MySqlConnection CreateConnection() => new(_connectionString);

        public async Task<IEnumerable<GoleadorDto>> ObtenerGoleadoresPorTorneoAsync(int torneoId)
        {
            using var connection = CreateConnection();
            string sql = @"
                SELECT 
                    j.id AS JugadorId,
                    j.nombre AS NombreJugador,
                    eq.nombre AS NombreEquipo,
                    COUNT(ep.id) AS Goles
                FROM eventos_partido ep
                INNER JOIN jugadores j ON ep.jugador_id = j.id
                INNER JOIN equipos eq ON j.equipo_id = eq.id
                INNER JOIN partidos p ON ep.partido_id = p.id
                WHERE p.torneo_id = @TorneoId 
                  AND UPPER(ep.tipo_evento) = 'GOL'
                GROUP BY j.id, j.nombre, eq.nombre
                ORDER BY Goles DESC, j.nombre ASC;";

            return await connection.QueryAsync<GoleadorDto>(sql, new { TorneoId = torneoId });
        }
    }
}