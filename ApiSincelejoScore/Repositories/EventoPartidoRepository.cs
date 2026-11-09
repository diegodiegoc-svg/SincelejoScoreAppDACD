using ApiSincelejoScore.Models;
using Dapper;
using MySqlConnector;

namespace ApiSincelejoScore.Repositories
{
    public class EventoPartidoRepository : IEventoPartidoRepository
    {
        private readonly string _connectionString;

        public EventoPartidoRepository(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection")!;
        }

        private MySqlConnection CreateConnection() => new(_connectionString);

        public async Task<IEnumerable<EventoPartido>> ObtenerEventosPorPartidoAsync(int partidoId)
        {
            using var connection = CreateConnection();
            string sql = @"SELECT ep.id AS Id,
                                  ep.partido_id AS PartidoId,
                                  COALESCE(ep.equipo_id, j.equipo_id) AS EquipoId,
                                  ep.jugador_id AS JugadorId,
                                  ep.jugador_asistente_id AS JugadorAsistenteId,
                                  ep.tipo_evento AS TipoEvento,
                                  ep.minuto_o_periodo AS MinutoOPeriodo,
                                  ep.valor_puntos AS ValorPuntos,
                                  ep.comentario AS Comentario,
                                  j.nombre AS JugadorNombre
                           FROM eventos_partido ep
                           LEFT JOIN jugadores j ON ep.jugador_id = j.id
                           WHERE ep.partido_id = @PartidoId
                           ORDER BY CAST(ep.minuto_o_periodo AS UNSIGNED) ASC, ep.id ASC;";
            return await connection.QueryAsync<EventoPartido>(sql, new { PartidoId = partidoId });
        }

        public async Task<int> CrearAsync(EventoPartido evento)
        {
            using var connection = CreateConnection();
            string sql = @"INSERT INTO eventos_partido (partido_id, equipo_id, jugador_id, tipo_evento, minuto_o_periodo, valor_puntos, comentario) 
                           VALUES (@PartidoId, @EquipoId, @JugadorId, @TipoEvento, @MinutoOPeriodo, @ValorPuntos, @Comentario); 
                           SELECT LAST_INSERT_ID();";
            return await connection.ExecuteScalarAsync<int>(sql, evento);
        }

        public async Task<bool> ActualizarAsync(EventoPartido evento)
        {
            using var connection = CreateConnection();
            string sql = @"UPDATE eventos_partido 
                           SET partido_id = @PartidoId, equipo_id = @EquipoId, jugador_id = @JugadorId, 
                               tipo_evento = @TipoEvento, minuto_o_periodo = @MinutoOPeriodo, 
                               valor_puntos = @ValorPuntos, comentario = @Comentario 
                           WHERE id = @Id";
            var filasAfectadas = await connection.ExecuteAsync(sql, evento);
            return filasAfectadas > 0;
        }

        public async Task<bool> EliminarAsync(int id)
        {
            using var connection = CreateConnection();
            string sql = "DELETE FROM eventos_partido WHERE id = @Id";
            var filasAfectadas = await connection.ExecuteAsync(sql, new { Id = id });
            return filasAfectadas > 0;
        }
    }
}
