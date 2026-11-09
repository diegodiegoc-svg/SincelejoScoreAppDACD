namespace ApiSincelejoScore.Models
{
    public class Jugador
    {
        public int Id { get; set; }
        public string? Cedula { get; set; }
        public int EquipoId { get; set; }
        public string Nombre { get; set; } = null!;
        public int? NumeroCamiseta { get; set; }
        public string? Posicion { get; set; }
        public int? Edad { get; set; }
        public decimal? Estatura { get; set; }
        public string? FotoUrl { get; set; }
    }
}