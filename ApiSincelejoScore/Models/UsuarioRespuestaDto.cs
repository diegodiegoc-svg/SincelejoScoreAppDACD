namespace ApiSincelejoScore.Models
{
    public class UsuarioRespuestaDto
    {
        public int Id { get; set; }
        public string Username { get; set; } = string.Empty;
        public string NombreCompleto { get; set; } = string.Empty;
        public string Rol { get; set; } = string.Empty;
        public int? TorneoId { get; set; }
        public string? TorneoNombre { get; set; }
        public bool? Activo { get; set; } = true;
    }
}
