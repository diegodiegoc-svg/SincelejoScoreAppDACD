using Dapper;
using MySqlConnector;

namespace ApiSincelejoScore.Services
{
    public class MatchAutomationService : BackgroundService
    {
        private readonly string _connectionString;
        private readonly ILogger<MatchAutomationService> _logger;

        public MatchAutomationService(IConfiguration configuration, ILogger<MatchAutomationService> logger)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection")!;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var connection = new MySqlConnection(_connectionString);
                    await connection.OpenAsync(stoppingToken);

                    // MODELO HÍBRIDO OPERATIVO Y REGLAMENTARIO:
                    // Desvinculación total del reloj de pared:
                    // Ningún partido de ningún deporte pasa a 'EN_JUEGO' ni a 'FINALIZADO' solo por la hora del servidor.
                    
                    // 1. Si la hora programada ya pasó por 1 minuto o más y la Mesa Técnica NO ha dado inicio manual:
                    // El sub-estado del partido cambia automáticamente a 'RETRASADO' (reloj de juego permanece en 0').
                    string sqlRetrasar = @"
                        UPDATE partidos p
                        SET p.estado_detalle = 'RETRASADO',
                            p.minuto_actual = 0
                        WHERE p.estado = 'PROGRAMADO' 
                          AND (p.estado_detalle IS NULL OR p.estado_detalle != 'RETRASADO')
                          AND p.fecha_hora <= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
                          AND p.fecha_hora < '2099-01-01';";
                    
                    int retrasados = await connection.ExecuteAsync(sqlRetrasar);
                    if (retrasados > 0)
                    {
                        _logger.LogInformation($"[Automatización] {retrasados} partido(s) pasaron a RETRASADO (reloj en 0').");
                    }

                    // 2. Si un partido retrasado fue reprogramado a una hora futura, limpiar estado_detalle
                    string sqlReprogramarFuturo = @"
                        UPDATE partidos p
                        SET p.estado_detalle = NULL,
                            p.minuto_actual = NULL
                        WHERE p.estado_detalle = 'RETRASADO'
                          AND p.estado = 'PROGRAMADO'
                          AND p.fecha_hora > NOW();";
                    await connection.ExecuteAsync(sqlReprogramarFuturo);
                }
                catch (Exception ex)
                {
                    _logger.LogError($"Error en servicio de automatización: {ex.Message}");
                }

                // Esperar 30 segundos antes de la siguiente verificación
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
        }
    }
}
