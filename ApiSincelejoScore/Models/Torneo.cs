namespace ApiSincelejoScore.Models
{
    public class Torneo
    {
        public int Id { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public int DeporteId { get; set; }
        public int? CanchaSedeId { get; set; }
        public bool EsMulticancha { get; set; } = false;
        public string? Temporada { get; set; } = "2026";
    }
}
