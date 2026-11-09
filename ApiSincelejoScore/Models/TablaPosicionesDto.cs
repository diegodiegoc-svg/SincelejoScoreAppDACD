namespace ApiSincelejoScore.Models
{
    public class TablaPosicionesDto
    {
        public int EquipoId { get; set; }
        public string NombreEquipo { get; set; } = string.Empty;
        public int PartidosJugados { get; set; }
        public int PartidosGanados { get; set; }
        public int PartidosEmpatados { get; set; }
        public int PartidosPerdidos { get; set; }
        public int PuntosFavor { get; set; }
        public int PuntosContra { get; set; }
        public int DiferenciaPuntos => PuntosFavor - PuntosContra;
        public int PuntosTotales { get; set; }
    }
}