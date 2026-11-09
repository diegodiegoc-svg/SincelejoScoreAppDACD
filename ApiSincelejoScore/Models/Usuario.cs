namespace ApiSincelejoScore.Models
{
    public class Usuario
    {
        public int Id { get; set; }
        public string Username { get; set; } = string.Empty;
        public string PasswordHash { get; set; } = string.Empty;
        public string NombreCompleto { get; set; } = string.Empty;
        public string Rol { get; set; } = string.Empty;
        public int? TorneoId { get; set; }
        public bool? Activo { get; set; } = true;
    }
}
