using ApiSincelejoScore.Models;
using Dapper;
using MySqlConnector;

namespace ApiSincelejoScore.Repositories
{
    public class FixtureService : IFixtureService
    {
        private readonly string _connectionString;

        public FixtureService(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection")!;
        }

        private MySqlConnection CreateConnection() => new(_connectionString);

        public async Task<int> GenerarFixtureRoundRobinAsync(int torneoId, int numeroDeVueltas = 1)
        {
            if (numeroDeVueltas < 1)
            {
                throw new InvalidOperationException("El número de vueltas debe ser al menos 1.");
            }

            using var connection = CreateConnection();

            // 1. Obtener información del torneo (sede fija vs multicancha)
            string sqlTorneo = @"SELECT id AS Id, nombre AS Nombre, deporte_id AS DeporteId, 
                                        cancha_sede_id AS CanchaSedeId, es_multicancha AS EsMulticancha 
                                 FROM torneos WHERE id = @TorneoId";
            var torneo = await connection.QueryFirstOrDefaultAsync<Torneo>(sqlTorneo, new { TorneoId = torneoId });

            int canchaIdAsignada = (torneo != null && !torneo.EsMulticancha && torneo.CanchaSedeId.HasValue)
                ? torneo.CanchaSedeId.Value
                : 1;

            // 2. Obtener los IDs de los equipos inscritos en el torneo
            string sqlEquipos = @"SELECT e.id 
                                  FROM equipos e
                                  INNER JOIN torneo_equipos te ON e.id = te.equipo_id
                                  WHERE te.torneo_id = @TorneoId";

            var equipoIdsOriginal = (await connection.QueryAsync<int>(sqlEquipos, new { TorneoId = torneoId })).ToList();

            if (equipoIdsOriginal.Count < 2)
            {
                throw new InvalidOperationException("Se necesitan al menos 2 equipos inscritos en torneo_equipos para generar un fixture.");
            }

            List<Partido> partidosAGenerar = new();
            int jornadaAcumulada = 1;

            // Bucle para soportar 1, 2, 3 o 4 vueltas de Todos contra Todos
            for (int vuelta = 1; vuelta <= numeroDeVueltas; vuelta++)
            {
                var equipoIds = new List<int>(equipoIdsOriginal);

                // Si el número de equipos es impar, agregamos un comodín (0) para la fecha libre
                if (equipoIds.Count % 2 != 0)
                {
                    equipoIds.Add(0);
                }

                int numEquipos = equipoIds.Count;
                int numJornadasPorVuelta = numEquipos - 1;
                int partidosPorJornada = numEquipos / 2;

                // Algoritmo Round-Robin por vuelta
                for (int j = 1; j <= numJornadasPorVuelta; j++)
                {
                    for (int i = 0; i < partidosPorJornada; i++)
                    {
                        int local = equipoIds[i];
                        int visitante = equipoIds[numEquipos - 1 - i];

                        if (local != 0 && visitante != 0)
                        {
                            // En vueltas pares invertimos las localías para ida y vuelta
                            bool esVueltaPar = (vuelta % 2 == 0);
                            bool esJornadaPar = (j % 2 == 0);

                            if ((!esVueltaPar && esJornadaPar) || (esVueltaPar && !esJornadaPar))
                            {
                                int temp = local;
                                local = visitante;
                                visitante = temp;
                            }

                            partidosAGenerar.Add(new Partido
                            {
                                TorneoId = torneoId,
                                Jornada = jornadaAcumulada,
                                CanchaId = canchaIdAsignada,
                                EquipoLocalId = local,
                                EquipoVisitanteId = visitante,
                                PuntosLocal = 0,
                                PuntosVisitante = 0,
                                Estado = "PROGRAMADO",
                                EstadoDetalle = "PROGRAMADO",
                                FechaHora = DateTime.Now
                            });
                        }
                    }

                    equipoIds.Insert(1, equipoIds.Last());
                    equipoIds.RemoveAt(equipoIds.Count - 1);
                    jornadaAcumulada++;
                }
            }

            // 3. Insertar los partidos en MySQL
            string sqlInsert = @"INSERT INTO partidos (torneo_id, jornada, cancha_id, equipo_local_id, equipo_visitante_id, puntos_local, puntos_visitante, estado, estado_detalle, fecha_hora) 
                                 VALUES (@TorneoId, @Jornada, @CanchaId, @EquipoLocalId, @EquipoVisitanteId, @PuntosLocal, @PuntosVisitante, @Estado, @EstadoDetalle, @FechaHora);";

            var filasAfectadas = await connection.ExecuteAsync(sqlInsert, partidosAGenerar);
            return filasAfectadas;
        }
    }
}
