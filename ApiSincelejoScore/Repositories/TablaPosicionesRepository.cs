using ApiSincelejoScore.Models;
using Dapper;
using MySqlConnector;

namespace ApiSincelejoScore.Repositories
{
    public class TablaPosicionesRepository : ITablaPosicionesRepository
    {
        private readonly string _connectionString;

        public TablaPosicionesRepository(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection")!;
        }

        private MySqlConnection CreateConnection() => new(_connectionString);

        public async Task<IEnumerable<TablaPosicionesDto>> ObtenerTablaPorTorneoAsync(int torneoId)
        {
            using var connection = CreateConnection();

            string sql = @"
                SELECT 
                    e.id AS EquipoId,
                    e.nombre AS NombreEquipo,
                    COUNT(p.id) AS PartidosJugados,
                    SUM(CASE 
                        WHEN (p.equipo_local_id = e.id AND p.puntos_local > p.puntos_visitante) OR 
                             (p.equipo_visitante_id = e.id AND p.puntos_visitante > p.puntos_local) THEN 1 
                        ELSE 0 
                    END) AS PartidosGanados,
                    SUM(CASE 
                        WHEN p.puntos_local = p.puntos_visitante AND p.id IS NOT NULL THEN 1 
                        ELSE 0 
                    END) AS PartidosEmpatados,
                    SUM(CASE 
                        WHEN (p.equipo_local_id = e.id AND p.puntos_local < p.puntos_visitante) OR 
                             (p.equipo_visitante_id = e.id AND p.puntos_visitante < p.puntos_local) THEN 1 
                        ELSE 0 
                    END) AS PartidosPerdidos,
                    SUM(CASE 
                        WHEN p.equipo_local_id = e.id THEN p.puntos_local 
                        WHEN p.equipo_visitante_id = e.id THEN p.puntos_visitante 
                        ELSE 0 
                    END) AS PuntosFavor,
                    SUM(CASE 
                        WHEN p.equipo_local_id = e.id THEN p.puntos_visitante 
                        WHEN p.equipo_visitante_id = e.id THEN p.puntos_local 
                        ELSE 0 
                    END) AS PuntosContra,
                    
                    /* CÁLCULO DE PUNTOS SEGÚN EL DEPORTE DEL TORNEO */
                    SUM(
                        CASE 
                            /* 1. BALONCESTO (Ganador: 2 pts, Perdedor: 1 pt) */
                            WHEN d.nombre LIKE '%Baloncesto%' THEN 
                                CASE 
                                    WHEN (p.equipo_local_id = e.id AND p.puntos_local > p.puntos_visitante) OR 
                                         (p.equipo_visitante_id = e.id AND p.puntos_visitante > p.puntos_local) THEN 2
                                    WHEN p.id IS NOT NULL THEN 1
                                    ELSE 0 
                                END

                            /* 2. FÚTBOL, MICROFÚTBOL, BÉISBOL, SÓFTBOL (Ganador: 3 pts, Empate: 1 pt, Perdedor: 0 pts) */
                            ELSE 
                                CASE 
                                    WHEN (p.equipo_local_id = e.id AND p.puntos_local > p.puntos_visitante) OR 
                                         (p.equipo_visitante_id = e.id AND p.puntos_visitante > p.puntos_local) THEN 3
                                    WHEN p.puntos_local = p.puntos_visitante AND p.id IS NOT NULL THEN 1
                                    ELSE 0 
                                END
                        END
                    ) AS PuntosTotales

                FROM equipos e
                INNER JOIN torneo_equipos te ON e.id = te.equipo_id
                INNER JOIN torneos t ON te.torneo_id = t.id
                INNER JOIN deportes d ON t.deporte_id = d.id
                LEFT JOIN partidos p ON (e.id = p.equipo_local_id OR e.id = p.equipo_visitante_id) 
                                     AND p.torneo_id = @TorneoId 
                                     AND UPPER(p.estado) IN ('FINALIZADO', 'TERMINADO', 'EN_JUEGO', 'EN VIVO', 'JUGANDO')
                WHERE te.torneo_id = @TorneoId
                GROUP BY e.id, e.nombre, d.nombre
                ORDER BY PuntosTotales DESC, (PuntosFavor - PuntosContra) DESC;";

            return await connection.QueryAsync<TablaPosicionesDto>(sql, new { TorneoId = torneoId });
        }
    }
}