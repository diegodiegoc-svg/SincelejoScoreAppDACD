using ApiSincelejoScore.Models;
using Dapper;
using MySqlConnector;

namespace ApiSincelejoScore.Repositories
{
    public class PartidoRepository : IPartidoRepository
    {
        private readonly string _connectionString;

        public PartidoRepository(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection")!;
        }

        private MySqlConnection CreateConnection() => new(_connectionString);

        public async Task<IEnumerable<Partido>> ObtenerTodosAsync()
        {
            using var connection = CreateConnection();
            string sql = @"SELECT p.id AS Id, 
                                  p.torneo_id AS TorneoId, 
                                  p.jornada AS Jornada, 
                                  p.fase_id AS FaseId, 
                                  p.grupo_id AS GrupoId, 
                                  p.cancha_id AS CanchaId, 
                                  p.equipo_local_id AS EquipoLocalId, 
                                  p.equipo_visitante_id AS EquipoVisitanteId, 
                                  p.puntos_local AS PuntosLocal, 
                                  p.puntos_visitante AS PuntosVisitante, 
                                  p.estado AS Estado, 
                                  p.estado_detalle AS EstadoDetalle, 
                                  p.minuto_actual AS MinutoActual, 
                                  p.fecha_hora AS FechaHora,
                                  el.nombre AS EquipoLocalNombre,
                                  ev.nombre AS EquipoVisitanteNombre,
                                  c.nombre AS CanchaNombre,
                                  t.nombre AS TorneoNombre,
                                  d.nombre AS DeporteNombre,
                                  t.deporte_id AS DeporteId
                           FROM partidos p
                           LEFT JOIN equipos el ON p.equipo_local_id = el.id
                           LEFT JOIN equipos ev ON p.equipo_visitante_id = ev.id
                           LEFT JOIN canchas c ON p.cancha_id = c.id
                           LEFT JOIN torneos t ON p.torneo_id = t.id
                           LEFT JOIN deportes d ON t.deporte_id = d.id
                           ORDER BY p.fecha_hora ASC";
            return await connection.QueryAsync<Partido>(sql);
        }

        public async Task<Partido?> ObtenerPorIdAsync(int id)
        {
            using var connection = CreateConnection();
            string sql = @"SELECT p.id AS Id, 
                                  p.torneo_id AS TorneoId, 
                                  p.jornada AS Jornada, 
                                  p.fase_id AS FaseId, 
                                  p.grupo_id AS GrupoId, 
                                  p.cancha_id AS CanchaId, 
                                  p.equipo_local_id AS EquipoLocalId, 
                                  p.equipo_visitante_id AS EquipoVisitanteId, 
                                  p.puntos_local AS PuntosLocal, 
                                  p.puntos_visitante AS PuntosVisitante, 
                                  p.estado AS Estado, 
                                  p.estado_detalle AS EstadoDetalle, 
                                  p.minuto_actual AS MinutoActual, 
                                  p.fecha_hora AS FechaHora,
                                  el.nombre AS EquipoLocalNombre,
                                  ev.nombre AS EquipoVisitanteNombre,
                                  c.nombre AS CanchaNombre,
                                  t.nombre AS TorneoNombre,
                                  d.nombre AS DeporteNombre,
                                  t.deporte_id AS DeporteId
                           FROM partidos p
                           LEFT JOIN equipos el ON p.equipo_local_id = el.id
                           LEFT JOIN equipos ev ON p.equipo_visitante_id = ev.id
                           LEFT JOIN canchas c ON p.cancha_id = c.id
                           LEFT JOIN torneos t ON p.torneo_id = t.id
                           LEFT JOIN deportes d ON t.deporte_id = d.id
                           WHERE p.id = @Id";
            return await connection.QueryFirstOrDefaultAsync<Partido>(sql, new { Id = id });
        }

        public async Task<IEnumerable<Partido>> ObtenerPorTorneoAsync(int torneoId, string? estado = null)
        {
            using var connection = CreateConnection();
            
            string sql = @"SELECT p.id AS Id, 
                                  p.torneo_id AS TorneoId, 
                                  p.jornada AS Jornada, 
                                  p.fase_id AS FaseId, 
                                  p.grupo_id AS GrupoId, 
                                  p.cancha_id AS CanchaId, 
                                  p.equipo_local_id AS EquipoLocalId, 
                                  p.equipo_visitante_id AS EquipoVisitanteId, 
                                  p.puntos_local AS PuntosLocal, 
                                  p.puntos_visitante AS PuntosVisitante, 
                                  p.estado AS Estado, 
                                  p.estado_detalle AS EstadoDetalle, 
                                  p.minuto_actual AS MinutoActual, 
                                  p.fecha_hora AS FechaHora,
                                  el.nombre AS EquipoLocalNombre,
                                  ev.nombre AS EquipoVisitanteNombre,
                                  c.nombre AS CanchaNombre,
                                  t.nombre AS TorneoNombre,
                                  d.nombre AS DeporteNombre,
                                  t.deporte_id AS DeporteId
                           FROM partidos p
                           LEFT JOIN equipos el ON p.equipo_local_id = el.id
                           LEFT JOIN equipos ev ON p.equipo_visitante_id = ev.id
                           LEFT JOIN canchas c ON p.cancha_id = c.id
                           LEFT JOIN torneos t ON p.torneo_id = t.id
                           LEFT JOIN deportes d ON t.deporte_id = d.id
                           WHERE p.torneo_id = @TorneoId";

            if (!string.IsNullOrEmpty(estado))
            {
                sql += " AND p.estado = @Estado";
            }

            sql += " ORDER BY p.jornada ASC, p.fecha_hora ASC";

            return await connection.QueryAsync<Partido>(sql, new { TorneoId = torneoId, Estado = estado });
        }

        public async Task<int> CrearAsync(Partido partido)
        {
            using var connection = CreateConnection();
            string sql = @"INSERT INTO partidos (torneo_id, jornada, fase_id, grupo_id, cancha_id, equipo_local_id, equipo_visitante_id, puntos_local, puntos_visitante, estado, estado_detalle, minuto_actual, fecha_hora) 
                           VALUES (@TorneoId, @Jornada, @FaseId, @GrupoId, @CanchaId, @EquipoLocalId, @EquipoVisitanteId, @PuntosLocal, @PuntosVisitante, @Estado, @EstadoDetalle, @MinutoActual, @FechaHora);
                           SELECT LAST_INSERT_ID();";
            return await connection.ExecuteScalarAsync<int>(sql, partido);
        }

        public async Task<bool> ActualizarAsync(Partido partido)
        {
            using var connection = CreateConnection();
            string sql = @"UPDATE partidos 
                           SET torneo_id = @TorneoId, 
                               jornada = @Jornada, 
                               fase_id = @FaseId, 
                               grupo_id = @GrupoId, 
                               cancha_id = @CanchaId, 
                               equipo_local_id = @EquipoLocalId, 
                               equipo_visitante_id = @EquipoVisitanteId, 
                               puntos_local = @PuntosLocal, 
                               puntos_visitante = @PuntosVisitante, 
                               estado = @Estado, 
                               estado_detalle = @EstadoDetalle, 
                               minuto_actual = @MinutoActual, 
                               fecha_hora = @FechaHora 
                           WHERE id = @Id";
            int filas = await connection.ExecuteAsync(sql, partido);
            return filas > 0;
        }

        public async Task<bool> EliminarAsync(int id)
        {
            using var connection = CreateConnection();
            string sql = "DELETE FROM partidos WHERE id = @Id";
            int filas = await connection.ExecuteAsync(sql, new { Id = id });
            return filas > 0;
        }
    }
}
