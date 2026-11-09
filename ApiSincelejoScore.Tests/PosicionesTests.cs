using ApiSincelejoScore.Models;
using Xunit;

namespace ApiSincelejoScore.Tests
{
    public class PosicionesTests
    {
        #region Funciones de Cálculo Reglamentario

        /// <summary>
        /// Cálculo reglamentario oficial para Fútbol y Microfútbol (3-1-0)
        /// </summary>
        public static int CalcularPuntosFutbol(int partidosGanados, int partidosEmpatados, int partidosPerdidos)
        {
            return (partidosGanados * 3) + (partidosEmpatados * 1) + (partidosPerdidos * 0);
        }

        /// <summary>
        /// Cálculo reglamentario oficial FIBA para Baloncesto (2 pts ganado, 1 pt jugado/perdido, sin empates)
        /// </summary>
        public static int CalcularPuntosBaloncesto(int partidosGanados, int partidosPerdidos)
        {
            return (partidosGanados * 2) + (partidosPerdidos * 1);
        }

        /// <summary>
        /// Cálculo reglamentario oficial FIVB para Voleibol por resultado en sets:
        /// - Ganar 3-0 o 3-1: 3 pts al ganador, 0 al perdedor.
        /// - Ganar 3-2: 2 pts al ganador, 1 pt al perdedor.
        /// </summary>
        public static (int puntosLocal, int puntosVisitante) CalcularPuntosVoleibolSets(int setsLocal, int setsVisitante)
        {
            if (setsLocal == 3 && (setsVisitante == 0 || setsVisitante == 1))
            {
                return (3, 0);
            }
            if (setsLocal == 3 && setsVisitante == 2)
            {
                return (2, 1);
            }
            if (setsVisitante == 3 && (setsLocal == 0 || setsLocal == 1))
            {
                return (0, 3);
            }
            if (setsVisitante == 3 && setsLocal == 2)
            {
                return (1, 2);
            }

            throw new ArgumentException("Resultado de sets no válido según el reglamento oficial FIVB (un equipo debe ganar 3 sets).");
        }

        #endregion

        [Fact]
        public void Prueba1_ReglaFutbol_ValidaAsignacion3PtsVictoria1PtEmpate0PtsDerrota()
        {
            // Arrange: Tres equipos con diferente desempeño en fútbol
            // Equipo A: 3 PJ, 2 Ganados, 1 Empatado, 0 Perdidos -> (2*3) + (1*1) = 7 pts
            // Equipo B: 3 PJ, 1 Ganado, 1 Empatado, 1 Perdido  -> (1*3) + (1*1) = 4 pts
            // Equipo C: 3 PJ, 0 Ganados, 0 Empatados, 3 Perdidos -> 0 pts

            // Act
            int puntosEquipoA = CalcularPuntosFutbol(2, 1, 0);
            int puntosEquipoB = CalcularPuntosFutbol(1, 1, 1);
            int puntosEquipoC = CalcularPuntosFutbol(0, 0, 3);

            // Assert
            Assert.Equal(7, puntosEquipoA);
            Assert.Equal(4, puntosEquipoB);
            Assert.Equal(0, puntosEquipoC);

            // Validar modelo TablaPosicionesDto
            var tabla = new List<TablaPosicionesDto>
            {
                new TablaPosicionesDto { EquipoId = 1, NombreEquipo = "Equipo A", PartidosJugados = 3, PartidosGanados = 2, PartidosEmpatados = 1, PartidosPerdidos = 0, PuntosFavor = 6, PuntosContra = 2, PuntosTotales = puntosEquipoA },
                new TablaPosicionesDto { EquipoId = 2, NombreEquipo = "Equipo B", PartidosJugados = 3, PartidosGanados = 1, PartidosEmpatados = 1, PartidosPerdidos = 1, PuntosFavor = 4, PuntosContra = 4, PuntosTotales = puntosEquipoB },
                new TablaPosicionesDto { EquipoId = 3, NombreEquipo = "Equipo C", PartidosJugados = 3, PartidosGanados = 0, PartidosEmpatados = 0, PartidosPerdidos = 3, PuntosFavor = 1, PuntosContra = 5, PuntosTotales = puntosEquipoC }
            };

            // Ordenamiento reglamentario: Puntos Totales DESC, luego Diferencia de Gol DESC
            var ranking = tabla
                .OrderByDescending(t => t.PuntosTotales)
                .ThenByDescending(t => t.DiferenciaPuntos)
                .ToList();

            Assert.Equal("Equipo A", ranking[0].NombreEquipo);
            Assert.Equal(4, ranking[0].DiferenciaPuntos); // 6 - 2 = +4

            Assert.Equal("Equipo B", ranking[1].NombreEquipo);
            Assert.Equal(0, ranking[1].DiferenciaPuntos); // 4 - 4 = 0

            Assert.Equal("Equipo C", ranking[2].NombreEquipo);
            Assert.Equal(-4, ranking[2].DiferenciaPuntos); // 1 - 5 = -4
        }

        [Fact]
        public void Prueba2_ReglaBaloncesto_Valida2PtsVictoria1PtDerrotaSinEmpates()
        {
            // Arrange: En Baloncesto (FIBA) no existen los empates
            // Victoria otorga 2 puntos
            // Derrota otorga 1 punto (por presentación/partido jugado)
            // Equipo 1: 4 PJ, 3 Ganados, 1 Perdido -> (3*2) + (1*1) = 7 pts
            // Equipo 2: 4 PJ, 2 Ganados, 2 Perdidos -> (2*2) + (2*1) = 6 pts
            // Equipo 3: 4 PJ, 0 Ganados, 4 Perdidos -> (0*2) + (4*1) = 4 pts

            // Act
            int puntosEq1 = CalcularPuntosBaloncesto(3, 1);
            int puntosEq2 = CalcularPuntosBaloncesto(2, 2);
            int puntosEq3 = CalcularPuntosBaloncesto(0, 4);

            // Assert
            Assert.Equal(7, puntosEq1);
            Assert.Equal(6, puntosEq2);
            Assert.Equal(4, puntosEq3);

            // El perdedor de un partido SIEMPRE suma 1 punto
            int puntosUnicoPartidoGanador = CalcularPuntosBaloncesto(1, 0);
            int puntosUnicoPartidoPerdedor = CalcularPuntosBaloncesto(0, 1);

            Assert.Equal(2, puntosUnicoPartidoGanador);
            Assert.Equal(1, puntosUnicoPartidoPerdedor);
        }

        [Theory]
        [InlineData(3, 0, 3, 0)] // Victoria contundente 3-0: 3 pts ganador, 0 perdedor
        [InlineData(3, 1, 3, 0)] // Victoria 3-1: 3 pts ganador, 0 perdedor
        [InlineData(3, 2, 2, 1)] // Victoria ajustada 3-2 (Tie-break): 2 pts ganador, 1 pt perdedor
        [InlineData(2, 3, 1, 2)] // Derrota en Tie-break 2-3: 1 pt perdedor, 2 pts ganador
        [InlineData(0, 3, 0, 3)] // Derrota 0-3: 0 pts perdedor, 3 pts ganador
        [InlineData(1, 3, 0, 3)] // Derrota 1-3: 0 pts perdedor, 3 pts ganador
        public void Prueba3_ReglaVoleibolFIVB_ValidaSistemaDePuntuacionPorSets(
            int setsLocal, int setsVisitante, int puntosEsperadosLocal, int puntosEsperadosVisitante)
        {
            // Act
            var (ptsL, ptsV) = CalcularPuntosVoleibolSets(setsLocal, setsVisitante);

            // Assert
            Assert.Equal(puntosEsperadosLocal, ptsL);
            Assert.Equal(puntosEsperadosVisitante, ptsV);

            // En cualquier partido de voleibol, la suma de puntos otorgados siempre es 3 (3+0 ó 2+1)
            Assert.Equal(3, ptsL + ptsV);
        }

        [Fact]
        public void Prueba3_ReglaVoleibolFIVB_SetsInvalidos_LanzaExcepcion()
        {
            // Assert: marcadores que no cumplen condición de victoria FIVB (3 sets ganados) deben ser rechazados
            Assert.Throws<ArgumentException>(() => CalcularPuntosVoleibolSets(2, 2));
            Assert.Throws<ArgumentException>(() => CalcularPuntosVoleibolSets(1, 1));
            Assert.Throws<ArgumentException>(() => CalcularPuntosVoleibolSets(0, 0));
        }
    }
}
