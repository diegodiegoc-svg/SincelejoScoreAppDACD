using ApiSincelejoScore.Models;
using Xunit;

namespace ApiSincelejoScore.Tests
{
    public class FixtureServiceTests
    {
        /// <summary>
        /// Implementación del algoritmo Round-Robin idéntico al de FixtureService en producción
        /// para aislar la lógica algorítmica sin requerir conexión a base de datos.
        /// </summary>
        public static List<Partido> SimularGenerarFixture(List<int> equipoIdsOriginal, int numeroDeVueltas = 1, int torneoId = 1, int canchaId = 1)
        {
            if (numeroDeVueltas < 1)
                throw new InvalidOperationException("El número de vueltas debe ser al menos 1.");

            if (equipoIdsOriginal.Count < 2)
                throw new InvalidOperationException("Se necesitan al menos 2 equipos inscritos.");

            List<Partido> partidosAGenerar = new();
            int jornadaAcumulada = 1;

            for (int vuelta = 1; vuelta <= numeroDeVueltas; vuelta++)
            {
                var equipoIds = new List<int>(equipoIdsOriginal);

                // Comodín para equipos impares (fecha libre)
                if (equipoIds.Count % 2 != 0)
                {
                    equipoIds.Add(0);
                }

                int numEquipos = equipoIds.Count;
                int numJornadasPorVuelta = numEquipos - 1;
                int partidosPorJornada = numEquipos / 2;

                for (int j = 1; j <= numJornadasPorVuelta; j++)
                {
                    for (int i = 0; i < partidosPorJornada; i++)
                    {
                        int local = equipoIds[i];
                        int visitante = equipoIds[numEquipos - 1 - i];

                        if (local != 0 && visitante != 0)
                        {
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
                                CanchaId = canchaId,
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

            return partidosAGenerar;
        }

        [Fact]
        public void Prueba1_Fixture_ConEquiposPar_GeneraJornadasYPartidosExactosSinComodines()
        {
            // Arrange: 4 equipos pares, 1 sola vuelta
            var equipos = new List<int> { 101, 102, 103, 104 };
            int n = equipos.Count;
            int vueltas = 1;

            // Act
            var partidos = SimularGenerarFixture(equipos, vueltas);

            // Assert:
            // Con 4 equipos: (n - 1) = 3 jornadas
            // Partidos por jornada: n / 2 = 2
            // Total partidos: 3 * 2 = 6 partidos
            int jornadasEsperadas = n - 1;
            int partidosEsperados = (n * (n - 1)) / 2;

            Assert.Equal(partidosEsperados, partidos.Count);

            var jornadasDistintas = partidos.Select(p => p.Jornada).Distinct().ToList();
            Assert.Equal(jornadasEsperadas, jornadasDistintas.Count);

            // Ningún partido debe contener equipo comodín (0)
            Assert.DoesNotContain(partidos, p => p.EquipoLocalId == 0 || p.EquipoVisitanteId == 0);

            // Cada jornada debe tener exactamente 2 partidos sin que ningún equipo repita en la misma jornada
            foreach (var j in jornadasDistintas)
            {
                var partidosJornada = partidos.Where(p => p.Jornada == j).ToList();
                Assert.Equal(2, partidosJornada.Count);

                var equiposEnJornada = partidosJornada
                    .SelectMany(p => new[] { p.EquipoLocalId, p.EquipoVisitanteId })
                    .ToList();

                Assert.Equal(4, equiposEnJornada.Distinct().Count());
            }

            // Cada equipo debe jugar exactamente 3 partidos (uno contra cada rival)
            foreach (var eq in equipos)
            {
                int jugados = partidos.Count(p => p.EquipoLocalId == eq || p.EquipoVisitanteId == eq);
                Assert.Equal(3, jugados);
            }
        }

        [Fact]
        public void Prueba2_Fixture_ConEquiposImpar_ManejaFechaDescansoCorrectamente()
        {
            // Arrange: 5 equipos (número impar), 1 vuelta
            var equipos = new List<int> { 201, 202, 203, 204, 205 };
            int n = equipos.Count;
            int vueltas = 1;

            // Act
            var partidos = SimularGenerarFixture(equipos, vueltas);

            // Assert:
            // Para 5 equipos con comodín (total 6 en rotación):
            // 5 jornadas en total.
            // En cada jornada juegan 2 partidos (4 equipos activos) y 1 equipo descansa (fecha libre).
            // Total partidos: 5 jornadas * 2 partidos = 10 partidos.
            Assert.Equal(10, partidos.Count);

            var jornadasDistintas = partidos.Select(p => p.Jornada).Distinct().OrderBy(x => x).ToList();
            Assert.Equal(5, jornadasDistintas.Count);

            // Ningún partido generado debe tener el id 0
            Assert.DoesNotContain(partidos, p => p.EquipoLocalId == 0 || p.EquipoVisitanteId == 0);

            // Verificar que en cada jornada descanse un equipo diferente
            var equiposQueDescansaron = new List<int>();
            foreach (var j in jornadasDistintas)
            {
                var partidosJornada = partidos.Where(p => p.Jornada == j).ToList();
                Assert.Equal(2, partidosJornada.Count); // 2 partidos por jornada

                var equiposJugando = partidosJornada
                    .SelectMany(p => new[] { p.EquipoLocalId, p.EquipoVisitanteId })
                    .Distinct()
                    .ToList();

                Assert.Equal(4, equiposJugando.Count);

                var descansan = equipos.Except(equiposJugando).ToList();
                Assert.Single(descansan); // Exactamente 1 equipo descansa por jornada
                equiposQueDescansaron.Add(descansan.First());
            }

            // Todos los 5 equipos deben haber descansado exactamente una vez
            Assert.Equal(5, equiposQueDescansaron.Distinct().Count());

            // Cada equipo debe haber jugado exactamente 4 partidos
            foreach (var eq in equipos)
            {
                int jugados = partidos.Count(p => p.EquipoLocalId == eq || p.EquipoVisitanteId == eq);
                Assert.Equal(4, jugados);
            }
        }

        [Fact]
        public void Prueba3_Fixture_ConMultiplesVueltas_AlternaLocaliasIdaYVuelta()
        {
            // Arrange: 4 equipos, 2 vueltas (Ida y Vuelta)
            var equipos = new List<int> { 301, 302, 303, 304 };
            int vueltas = 2;

            // Act
            var partidos = SimularGenerarFixture(equipos, vueltas);

            // Assert:
            // 4 equipos * 3 jornadas * 2 vueltas = 6 jornadas, 12 partidos
            Assert.Equal(12, partidos.Count);

            var partidosVuelta1 = partidos.Where(p => p.Jornada <= 3).ToList();
            var partidosVuelta2 = partidos.Where(p => p.Jornada > 3).ToList();

            Assert.Equal(6, partidosVuelta1.Count);
            Assert.Equal(6, partidosVuelta2.Count);

            // Verificar que para cada partido de la Vuelta 1, existe el enfrentamiento invertido en la Vuelta 2
            foreach (var p1 in partidosVuelta1)
            {
                var enfrentamientoInvertido = partidosVuelta2.FirstOrDefault(p2 =>
                    p2.EquipoLocalId == p1.EquipoVisitanteId &&
                    p2.EquipoVisitanteId == p1.EquipoLocalId);

                Assert.NotNull(enfrentamientoInvertido);
                Assert.True(enfrentamientoInvertido.Jornada > 3);
            }

            // Cada equipo debe jugar 3 partidos de local y 3 partidos de visitante en total
            foreach (var eq in equipos)
            {
                int comoLocal = partidos.Count(p => p.EquipoLocalId == eq);
                int comoVisitante = partidos.Count(p => p.EquipoVisitanteId == eq);

                Assert.Equal(3, comoLocal);
                Assert.Equal(3, comoVisitante);
            }
        }
    }
}
