using ApiSincelejoScore.Models;
using Dapper;
using MySqlConnector;

namespace ApiSincelejoScore.Repositories
{
    public class JugadorRepository : IJugadorRepository
    {
        private readonly string _connectionString;

        public JugadorRepository(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection")!;
        }

        private MySqlConnection CreateConnection() => new(_connectionString);

        public async Task<IEnumerable<Jugador>> ObtenerTodosAsync()
        {
            using var connection = CreateConnection();
            string sql = @"SELECT id, equipo_id AS EquipoId, nombre, 
                                  numero_camiseta AS NumeroCamiseta, posicion, 
                                  edad, estatura, foto_url AS FotoUrl 
                           FROM jugadores;";
            return await connection.QueryAsync<Jugador>(sql);
        }

        public async Task<IEnumerable<Jugador>> ObtenerPorEquipoAsync(int equipoId)
        {
            using var connection = CreateConnection();
            string sql = @"SELECT id, equipo_id AS EquipoId, nombre, 
                                  numero_camiseta AS NumeroCamiseta, posicion, 
                                  edad, estatura, foto_url AS FotoUrl 
                           FROM jugadores WHERE equipo_id = @EquipoId;";
            return await connection.QueryAsync<Jugador>(sql, new { EquipoId = equipoId });
        }

        public async Task<Jugador?> ObtenerPorIdAsync(int id)
        {
            using var connection = CreateConnection();
            string sql = @"SELECT id, equipo_id AS EquipoId, nombre, 
                                  numero_camiseta AS NumeroCamiseta, posicion, 
                                  edad, estatura, foto_url AS FotoUrl 
                           FROM jugadores WHERE id = @Id;";
            return await connection.QueryFirstOrDefaultAsync<Jugador>(sql, new { Id = id });
        }

        public async Task<int> CrearAsync(Jugador jugador)
        {
            using var connection = CreateConnection();
            string sql = @"INSERT INTO jugadores (equipo_id, nombre, numero_camiseta, posicion, edad, estatura, foto_url) 
                           VALUES (@EquipoId, @Nombre, @NumeroCamiseta, @Posicion, @Edad, @Estatura, @FotoUrl); 
                           SELECT LAST_INSERT_ID();";
            return await connection.ExecuteScalarAsync<int>(sql, jugador);
        }

        public async Task<bool> ActualizarAsync(Jugador jugador)
        {
            using var connection = CreateConnection();
            string sql = @"UPDATE jugadores 
                           SET equipo_id = @EquipoId, nombre = @Nombre, 
                               numero_camiseta = @NumeroCamiseta, posicion = @Posicion,
                               edad = @Edad, estatura = @Estatura, foto_url = @FotoUrl 
                           WHERE id = @Id;";
            int rows = await connection.ExecuteAsync(sql, jugador);
            return rows > 0;
        }

        public async Task<bool> EliminarAsync(int id)
        {
            using var connection = CreateConnection();
            int rows = await connection.ExecuteAsync("DELETE FROM jugadores WHERE id = @Id;", new { Id = id });
            return rows > 0;
        }

        public async Task InsertarMasivoAsync(IEnumerable<Jugador> jugadores)
        {
            using var connection = CreateConnection();
            string sql = @"INSERT INTO jugadores (equipo_id, nombre, numero_camiseta, posicion, edad, estatura, foto_url) 
                           VALUES (@EquipoId, @Nombre, @NumeroCamiseta, @Posicion, @Edad, @Estatura, @FotoUrl);";
            await connection.ExecuteAsync(sql, jugadores);
        }
    }
}