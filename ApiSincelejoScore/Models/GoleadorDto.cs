namespace ApiSincelejoScore.Models
{
    public class GoleadorDto
    {
        public int JugadorId { get; set; }
        public string NombreJugador { get; set; } = null!;
        public string NombreEquipo { get; set; } = null!;
        public int Goles { get; set; }
    }
}