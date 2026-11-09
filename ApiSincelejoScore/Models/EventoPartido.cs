namespace ApiSincelejoScore.Models
{
    public class EventoPartido
    {
        public int Id { get; set; }
        public int PartidoId { get; set; }
        public int? EquipoId { get; set; }
        public int? JugadorId { get; set; }
        public int? JugadorAsistenteId { get; set; }
        public string TipoEvento { get; set; } = string.Empty;
        public string MinutoOPeriodo { get; set; } = string.Empty;
        public int? ValorPuntos { get; set; } = 1;
        public string? Comentario { get; set; }
        public string? JugadorNombre { get; set; }

        // Compatibilidad con frontend público
        public string Minuto => MinutoOPeriodo;
        public string Descripcion => !string.IsNullOrEmpty(Comentario) 
            ? (!string.IsNullOrEmpty(JugadorNombre) ? $"{JugadorNombre} - {Comentario}" : Comentario)
            : (JugadorNombre ?? "");
    }
}
