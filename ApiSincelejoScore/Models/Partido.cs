namespace ApiSincelejoScore.Models
{
    public class Partido
    {
        public int Id { get; set; }
        public int TorneoId { get; set; }
        public int Jornada { get; set; } = 1; // Representa: Fecha 1, Fecha 2, etc.
        public int? FaseId { get; set; }
        public int? GrupoId { get; set; }
        public int CanchaId { get; set; }
        public int EquipoLocalId { get; set; }
        public int EquipoVisitanteId { get; set; }
        public int PuntosLocal { get; set; } = 0;
        public int PuntosVisitante { get; set; } = 0;
        public string Estado { get; set; } = "PROGRAMADO"; // PROGRAMADO, EN_JUEGO, FINALIZADO, CANCELADO
        public string? EstadoDetalle { get; set; }
        public int? MinutoActual { get; set; }
        public DateTime FechaHora { get; set; }

        // Propiedades enriquecidas de visualización (mediante JOIN)
        public string? EquipoLocalNombre { get; set; }
        public string? EquipoVisitanteNombre { get; set; }
        public string? CanchaNombre { get; set; }
        public string? TorneoNombre { get; set; }
        public string? DeporteNombre { get; set; }
        public int? DeporteId { get; set; }
    }
}
