namespace ApiSincelejoScore.Models
{
    public class Equipo
    {
        public int Id { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string Delegacion { get; set; } = string.Empty;
        public int TorneoId { get; set; }
    }
}