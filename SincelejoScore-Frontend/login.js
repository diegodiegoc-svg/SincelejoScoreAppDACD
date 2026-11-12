/**
 * SincelejoScore - Lógica de Inicio de Sesión (login.js)
 * Conexión con endpoint POST /api/auth/login
 */

// Detección automática de entorno (Local vs Producción)
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5291/api'
    : 'https://apisincelejoscore-production.up.railway.app/api';

document.addEventListener('DOMContentLoaded', () => {
    const formLogin = document.getElementById('form-login');
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const btnLogin = document.getElementById('btn-login');
    const errorBox = document.getElementById('login-error-msg');
    const errorText = document.getElementById('login-error-text');

    // Función para mostrar mensajes de error
    function mostrarError(mensaje) {
        if (!errorBox) return;
        if (errorText) {
            errorText.textContent = mensaje || 'Usuario o contraseña incorrectos.';
        } else {
            errorBox.textContent = mensaje || 'Usuario o contraseña incorrectos.';
        }
        errorBox.classList.remove('hidden');
        errorBox.style.display = 'flex';
    }

    // Función para ocultar mensajes de error
    function ocultarError() {
        if (!errorBox) return;
        errorBox.classList.add('hidden');
        errorBox.style.display = 'none';
    }

    // Escuchar el evento submit del formulario
    formLogin?.addEventListener('submit', async (e) => {
        e.preventDefault();
        ocultarError();

        const username = usernameInput?.value.trim();
        const password = passwordInput?.value;

        if (!username || !password) {
            mostrarError('Por favor ingresa tu usuario y contraseña.');
            return;
        }

        // Estado visual de carga en el botón
        if (btnLogin) {
            btnLogin.disabled = true;
            btnLogin.dataset.originalText = btnLogin.innerHTML;
            btnLogin.innerHTML = '⏳ Verificando credenciales...';
        }

        const payload = {
            username: username,
            password: password
        };

        // Lista de URLs a intentar (local y producción como respaldo)
        const urlsAIntentar = [
            API_URL,
            'https://apisincelejoscore-production.up.railway.app/api',
            'http://localhost:5291/api',
            'http://localhost:5000/api'
        ];
        const urlsUnicas = [...new Set(urlsAIntentar)];

        let respuestaExitosa = false;
        let ultimoMensajeError = 'Usuario o contraseña incorrectos.';

        for (const baseUrl of urlsUnicas) {
            try {
                const res = await fetch(`${baseUrl}/auth/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    const data = await res.json();
                    
                    // 1. Guardar la información del usuario en localStorage
                    localStorage.setItem('usuario_sesion', JSON.stringify(data));

                    // 2. Redirigir a admin.html
                    respuestaExitosa = true;
                    window.location.href = 'admin.html';
                    return;
                } else {
                    // Si el servidor respondió con 401 o similar, leer el mensaje devuelto
                    let errorData = null;
                    try {
                        errorData = await res.json();
                    } catch (_) {
                        const txt = await res.text().catch(() => '');
                        errorData = { mensaje: txt };
                    }

                    ultimoMensajeError = errorData?.mensaje || 'Usuario o contraseña incorrectos.';
                    // Si el servidor respondió explícitamente (400, 401, 403), no es un fallo de red: no intentar otras URLs
                    break;
                }
            } catch (err) {
                // Fallo de red (ej. si localhost no está corriendo), continuar al siguiente endpoint
                console.warn(`Intento de conexión fallido a ${baseUrl}/auth/login:`, err.message);
                ultimoMensajeError = 'No se pudo conectar con el servidor de autenticación.';
            }
        }

        // Si llegó aquí es porque no pudo iniciar sesión
        if (!respuestaExitosa) {
            mostrarError(ultimoMensajeError);
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.focus();
            }
            if (btnLogin) {
                btnLogin.disabled = false;
                btnLogin.innerHTML = btnLogin.dataset.originalText || 'Iniciar Sesión';
            }
        }
    });
});
