using ApiSincelejoScore.Models;
using ApiSincelejoScore.Repositories;
using Microsoft.AspNetCore.Mvc;
using System.Security.Cryptography;
using System.Text;

namespace ApiSincelejoScore.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IUsuarioRepository _usuarioRepository;

        public AuthController(IUsuarioRepository usuarioRepository)
        {
            _usuarioRepository = usuarioRepository;
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginDto loginDto)
        {
            if (loginDto == null || string.IsNullOrWhiteSpace(loginDto.Username) || string.IsNullOrWhiteSpace(loginDto.Password))
            {
                return Unauthorized(new { mensaje = "Usuario o contraseña incorrectos" });
            }

            var usuario = await _usuarioRepository.ObtenerPorUsernameAsync(loginDto.Username.Trim());
            if (usuario == null || (usuario.Activo.HasValue && !usuario.Activo.Value))
            {
                return Unauthorized(new { mensaje = "Usuario o contraseña incorrectos" });
            }

            if (!VerificarPassword(loginDto.Password, usuario.PasswordHash))
            {
                return Unauthorized(new { mensaje = "Usuario o contraseña incorrectos" });
            }

            var respuesta = new UsuarioRespuestaDto
            {
                Id = usuario.Id,
                Username = usuario.Username,
                NombreCompleto = usuario.NombreCompleto,
                Rol = usuario.Rol,
                TorneoId = usuario.TorneoId
            };

            return Ok(respuesta);
        }

        private static bool VerificarPassword(string passwordIngresada, string passwordAlmacenada)
        {
            if (string.IsNullOrEmpty(passwordIngresada) || string.IsNullOrEmpty(passwordAlmacenada))
                return false;

            var passIngresada = passwordIngresada.Trim();
            var passAlmacenada = passwordAlmacenada.Trim();

            // 1. Comparación directa en texto plano (con y sin trim)
            if (passwordIngresada == passwordAlmacenada ||
                passIngresada == passAlmacenada ||
                string.Equals(passwordIngresada, passwordAlmacenada, StringComparison.Ordinal) ||
                string.Equals(passIngresada, passAlmacenada, StringComparison.Ordinal))
            {
                return true;
            }

            // 2. Validación contra BCrypt (si el hash almacenado inicia con $2)
            if (passAlmacenada.StartsWith("$2"))
            {
                try
                {
                    if (BCrypt.Net.BCrypt.Verify(passwordIngresada, passAlmacenada) ||
                        BCrypt.Net.BCrypt.Verify(passIngresada, passAlmacenada))
                    {
                        return true;
                    }
                }
                catch
                {
                    // Si no es un hash BCrypt válido, continuar con SHA256
                }
            }

            // 3. Validación contra hash SHA-256 hexadecimal (mayúsculas/minúsculas y con o sin guiones)
            try
            {
                using var sha256 = SHA256.Create();
                var bytes = Encoding.UTF8.GetBytes(passIngresada);
                var hashBytes = sha256.ComputeHash(bytes);
                var hashHex = Convert.ToHexString(hashBytes);

                var passLimpia = passAlmacenada.Replace("-", "");

                if (string.Equals(hashHex, passLimpia, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }

                if (passwordIngresada != passIngresada)
                {
                    var bytesExact = Encoding.UTF8.GetBytes(passwordIngresada);
                    var hashBytesExact = sha256.ComputeHash(bytesExact);
                    var hashHexExact = Convert.ToHexString(hashBytesExact);

                    if (string.Equals(hashHexExact, passLimpia, StringComparison.OrdinalIgnoreCase))
                    {
                        return true;
                    }
                }
            }
            catch
            {
                // Fallback
            }

            return false;
        }
    }
}
