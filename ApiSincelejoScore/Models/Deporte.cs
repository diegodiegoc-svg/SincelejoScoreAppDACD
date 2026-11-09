namespace ApiSincelejoScore.Models
{
    public class Deporte
    {
        public int Id { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string TipoPeriodo { get; set; } = string.Empty;
        public int CantidadPeriodosBase { get; set; }
        public int DuracionPeriodoMinutos { get; set; }
        public int DescansoMinutos { get; set; }
        public int DuracionTotalEstimadaMinutos { get; set; }
        public bool PermiteEmpate { get; set; }
        public bool TieneReloj { get; set; } = true;
        public string UnidadMarcador { get; set; } = string.Empty;
    }
}
