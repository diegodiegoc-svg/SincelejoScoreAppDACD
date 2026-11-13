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
                TorneoId = usuario.TorneoId,
                Activo = usuario.Activo
            };

            return Ok(respuesta);
        }

        // =====================================================================
        // CRUD DE USUARIOS Y PLANILLEROS (GET, POST, PUT, DELETE)
        // =====================================================================

        [HttpGet("usuarios")]
        public async Task<IActionResult> ObtenerUsuarios()
        {
            var usuarios = await _usuarioRepository.ObtenerTodosAsync();
            return Ok(usuarios);
        }

        [HttpGet("usuarios/{id}")]
        public async Task<IActionResult> ObtenerUsuarioPorId(int id)
        {
            var usuario = await _usuarioRepository.ObtenerPorIdAsync(id);
            if (usuario == null)
            {
                return NotFound(new { mensaje = "Usuario no encontrado." });
            }

            return Ok(new UsuarioRespuestaDto
            {
                Id = usuario.Id,
                Username = usuario.Username,
                NombreCompleto = usuario.NombreCompleto,
                Rol = usuario.Rol,
                TorneoId = usuario.TorneoId,
                Activo = usuario.Activo
            });
        }

        [HttpPost("usuarios")]
        public async Task<IActionResult> CrearUsuario([FromBody] UsuarioCrearDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.Username) || string.IsNullOrWhiteSpace(dto.Password))
            {
                return BadRequest(new { mensaje = "El usuario y la contraseña son campos obligatorios." });
            }

            var usernameNormalizado = dto.Username.Trim();
            if (await _usuarioRepository.ExisteUsernameAsync(usernameNormalizado))
            {
                return BadRequest(new { mensaje = $"El nombre de usuario '{usernameNormalizado}' ya se encuentra registrado." });
            }

            var rolNormalizado = (dto.Rol?.Trim().ToUpper() == "SUPERADMIN") ? "SUPERADMIN" : "PLANILLERO";
            var usuario = new Usuario
            {
                Username = usernameNormalizado,
                PasswordHash = HashearSha256(dto.Password),
                NombreCompleto = string.IsNullOrWhiteSpace(dto.NombreCompleto) ? usernameNormalizado : dto.NombreCompleto.Trim(),
                Rol = rolNormalizado,
                TorneoId = (rolNormalizado == "PLANILLERO") ? dto.TorneoId : null,
                Activo = dto.Activo ?? true
            };

            var idGenerado = await _usuarioRepository.CrearAsync(usuario);
            usuario.Id = idGenerado;

            return CreatedAtAction(nameof(ObtenerUsuarioPorId), new { id = usuario.Id }, new UsuarioRespuestaDto
            {
                Id = usuario.Id,
                Username = usuario.Username,
                NombreCompleto = usuario.NombreCompleto,
                Rol = usuario.Rol,
                TorneoId = usuario.TorneoId,
                Activo = usuario.Activo
            });
        }

        [HttpPut("usuarios/{id}")]
        public async Task<IActionResult> ActualizarUsuario(int id, [FromBody] UsuarioActualizarDto dto)
        {
            if (dto == null)
            {
                return BadRequest(new { mensaje = "Datos del usuario inválidos." });
            }

            var usuarioExistente = await _usuarioRepository.ObtenerPorIdAsync(id);
            if (usuarioExistente == null)
            {
                return NotFound(new { mensaje = "Usuario no encontrado." });
            }

            if (!string.IsNullOrWhiteSpace(dto.Username))
            {
                var usernameLimpio = dto.Username.Trim();
                var yaExiste = await _usuarioRepository.ExisteUsernameAsync(usernameLimpio, id);
                if (yaExiste)
                {
                    return BadRequest(new { mensaje = $"El nombre de usuario '{usernameLimpio}' ya pertenece a otra cuenta." });
                }
                usuarioExistente.Username = usernameLimpio;
            }

            // Si se envió una nueva contraseña, encriptarla con SHA-256; si no, conservar la existente
            if (!string.IsNullOrWhiteSpace(dto.Password))
            {
                usuarioExistente.PasswordHash = HashearSha256(dto.Password);
            }

            if (!string.IsNullOrWhiteSpace(dto.NombreCompleto))
            {
                usuarioExistente.NombreCompleto = dto.NombreCompleto.Trim();
            }

            if (!string.IsNullOrWhiteSpace(dto.Rol))
            {
                var rolLimpio = (dto.Rol.Trim().ToUpper() == "SUPERADMIN") ? "SUPERADMIN" : "PLANILLERO";
                usuarioExistente.Rol = rolLimpio;
                if (rolLimpio == "SUPERADMIN")
                {
                    usuarioExistente.TorneoId = null;
                }
                else if (dto.TorneoId.HasValue)
                {
                    usuarioExistente.TorneoId = dto.TorneoId.Value;
                }
            }
            else if (dto.TorneoId.HasValue)
            {
                usuarioExistente.TorneoId = (dto.TorneoId.Value > 0) ? dto.TorneoId.Value : null;
            }

            if (dto.Activo.HasValue)
            {
                usuarioExistente.Activo = dto.Activo.Value;
            }

            var exito = await _usuarioRepository.ActualizarAsync(usuarioExistente);
            if (exito)
            {
                return Ok(new { mensaje = "Usuario actualizado correctamente." });
            }

            return StatusCode(500, new { mensaje = "No se pudo actualizar el usuario." });
        }

        [HttpDelete("usuarios/{id}")]
        public async Task<IActionResult> EliminarUsuario(int id)
        {
            var usuario = await _usuarioRepository.ObtenerPorIdAsync(id);
            if (usuario == null)
            {
                return NotFound(new { mensaje = "Usuario no encontrado." });
            }

            // Proteger la cuenta admin principal
            if (usuario.Id == 1 || string.Equals(usuario.Username, "admin", StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { mensaje = "No se permite eliminar la cuenta de Super Administrador principal." });
            }

            var exito = await _usuarioRepository.EliminarAsync(id);
            if (exito)
            {
                return Ok(new { mensaje = "Usuario eliminado exitosamente." });
            }

            return StatusCode(500, new { mensaje = "No se pudo eliminar el usuario." });
        }

        public static string HashearSha256(string password)
        {
            using var sha256 = SHA256.Create();
            var bytes = Encoding.UTF8.GetBytes(password.Trim());
            var hashBytes = sha256.ComputeHash(bytes);
            return Convert.ToHexString(hashBytes).ToLowerInvariant();
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
