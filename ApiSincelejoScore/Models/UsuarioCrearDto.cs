namespace ApiSincelejoScore.Models
{
    public class UsuarioCrearDto
    {
        public string Username { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string NombreCompleto { get; set; } = string.Empty;
        public string Rol { get; set; } = "PLANILLERO";
        public int? TorneoId { get; set; }
        public bool? Activo { get; set; } = true;
    }
}
