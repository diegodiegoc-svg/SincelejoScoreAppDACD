namespace ApiSincelejoScore.Models
{
    public class UsuarioActualizarDto
    {
        public string? Username { get; set; }
        public string? Password { get; set; }
        public string? NombreCompleto { get; set; }
        public string? Rol { get; set; }
        public int? TorneoId { get; set; }
        public bool? Activo { get; set; }
    }
}
