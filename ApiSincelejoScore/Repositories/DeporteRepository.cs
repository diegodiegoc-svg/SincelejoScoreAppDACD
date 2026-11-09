using ApiSincelejoScore.Models;
using Dapper;
using MySqlConnector;

namespace ApiSincelejoScore.Repositories
{
    public class DeporteRepository : IDeporteRepository
    {
        private readonly string _connectionString;

        public DeporteRepository(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection")!;
        }

        private MySqlConnection CreateConnection() => new(_connectionString);

        public async Task<IEnumerable<Deporte>> ObtenerTodosAsync()
        {
            using var connection = CreateConnection();
            string sql = @"SELECT id AS Id, nombre AS Nombre, tipo_periodo AS TipoPeriodo, 
                                  cantidad_periodos_base AS CantidadPeriodosBase, 
                                  duracion_periodo_minutos AS DuracionPeriodoMinutos,
                                  descanso_minutos AS DescansoMinutos,
                                  duracion_total_estimada_minutos AS DuracionTotalEstimadaMinutos,
                                  permite_empate AS PermiteEmpate, 
                                  tiene_reloj AS TieneReloj, 
                                  unidad_marcador AS UnidadMarcador 
                           FROM deportes";
            return await connection.QueryAsync<Deporte>(sql);
        }

        public async Task<Deporte?> ObtenerPorIdAsync(int id)
        {
            using var connection = CreateConnection();
            string sql = @"SELECT id AS Id, nombre AS Nombre, tipo_periodo AS TipoPeriodo, 
                                  cantidad_periodos_base AS CantidadPeriodosBase, 
                                  duracion_periodo_minutos AS DuracionPeriodoMinutos,
                                  descanso_minutos AS DescansoMinutos,
                                  duracion_total_estimada_minutos AS DuracionTotalEstimadaMinutos,
                                  permite_empate AS PermiteEmpate, 
                                  tiene_reloj AS TieneReloj, 
                                  unidad_marcador AS UnidadMarcador 
                           FROM deportes WHERE id = @Id";
            return await connection.QueryFirstOrDefaultAsync<Deporte>(sql, new { Id = id });
        }

        public async Task<int> CrearAsync(Deporte deporte)
        {
            using var connection = CreateConnection();
            string sql = @"INSERT INTO deportes (nombre, tipo_periodo, cantidad_periodos_base, duracion_periodo_minutos, descanso_minutos, duracion_total_estimada_minutos, permite_empate, tiene_reloj, unidad_marcador) 
                           VALUES (@Nombre, @TipoPeriodo, @CantidadPeriodosBase, @DuracionPeriodoMinutos, @DescansoMinutos, @DuracionTotalEstimadaMinutos, @PermiteEmpate, @TieneReloj, @UnidadMarcador); 
                           SELECT LAST_INSERT_ID();";
            return await connection.ExecuteScalarAsync<int>(sql, deporte);
        }

        public async Task<bool> ActualizarAsync(Deporte deporte)
        {
            using var connection = CreateConnection();
            string sql = @"UPDATE deportes 
                           SET nombre = @Nombre, tipo_periodo = @TipoPeriodo, 
                               cantidad_periodos_base = @CantidadPeriodosBase, 
                               duracion_periodo_minutos = @DuracionPeriodoMinutos,
                               descanso_minutos = @DescansoMinutos,
                               duracion_total_estimada_minutos = @DuracionTotalEstimadaMinutos,
                               permite_empate = @PermiteEmpate, 
                               tiene_reloj = @TieneReloj, 
                               unidad_marcador = @UnidadMarcador 
                           WHERE id = @Id";
            var filasAfectadas = await connection.ExecuteAsync(sql, deporte);
            return filasAfectadas > 0;
        }

        public async Task<bool> EliminarAsync(int id)
        {
            using var connection = CreateConnection();
            string sql = "DELETE FROM deportes WHERE id = @Id";
            var filasAfectadas = await connection.ExecuteAsync(sql, new { Id = id });
            return filasAfectadas > 0;
        }
    }
}
