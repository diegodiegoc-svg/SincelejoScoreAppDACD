# 🏆 ApiSincelejoScore - Sistema de Gestión de Torneos Multideportivos

![.NET 8](https://img.shields.io/badge/.NET-8.0-512BD4?logo=dotnet&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8.0_InnoDB-4479A1?logo=mysql&logoColor=white)
![xUnit](https://img.shields.io/badge/Tests-xUnit_100%25-brightgreen?logo=xunit)
![Postman](https://img.shields.io/badge/Postman-v2.1_Collection-FF6C37?logo=postman&logoColor=white)
![Frontend](https://img.shields.io/badge/Frontend-HTML5_CSS3_JS-orange?logo=javascript&logoColor=white)
![Status](https://img.shields.io/badge/Estado-Completado_100%25-success)

Plataforma web integral para la administración, programación, control en vivo y visualización pública de torneos multideportivos en el departamento de Sucre (Fútbol, Baloncesto, Voleibol, Béisbol, Sóftbol y Microfútbol).

---

## 📌 Información Académica y del Proyecto

- **Institución:** Corporación Unificada Nacional de Educación Superior (CUN)
- **Programa:** Ingeniería de Sistemas / Desarrollo de Software
- **Asignatura:** Desarrollo Web - DIS26 (Ficha: **30611**)
- **Docente:** Nemis Eduardo Padilla Oliveros
- **Estudiantes / Desarrolladores:**
  - **Diego Armando Cumplido Díaz**
  - **Carlos Julio Alvis Hernández**

---

## 🚀 Características Funcionales Principales

La solución satisface al 100% los requerimientos de la Rúbrica de Evaluación Final:

1. **Gestión Completa de Entidades (CRUDs):**
   - Mantenimiento individual de **Deportes** (reglas de periodos, duración, empates y reloj).
   - Mantenimiento de **Torneos** con soporte de regla de **Sede Fija Institucional** y excepción multicancha.
   - Mantenimiento de **Equipos** e inscripción en torneos (`torneo_equipos`).
   - Mantenimiento de **Jugadores** con fichas individuales y asignación a nóminas.

2. **Carga Masiva desde Excel (.xlsx):**
   - Módulo de subida de archivos Excel mediante `multipart/form-data` utilizando `EPPlus`.
   - Detección y omisión de duplicados (por cédula en jugadores y combinación nombre/torneo en equipos).
   - Validación de topes máximos reglamentarios por deporte (ej. Fútbol máx. 30, Baloncesto máx. 16, Béisbol máx. 26).
   - Reporte visual en tiempo real de registros insertados, omitidos y lista detallada de errores por fila.

3. **Generador de Fixture Automático (Round-Robin):**
   - Algoritmo de rotación poligonal Todos contra Todos.
   - Soporte para **número impar de equipos**, asignando automáticamente comodín de fecha libre / descanso reglamentario.
   - Selección de **1 a 4 vueltas**, con alternancia estricta de localías (ida y vuelta).
   - Asignación automática de canchas sedes fijas institucionales.

4. **Mesa Técnica en Vivo y Transición de Estados:**
   - Flujo de estados reglamentario: `PROGRAMADO` $\rightarrow$ `EN_JUEGO` $\rightarrow$ `FINALIZADO`.
   - Consola digital para el planillero con cronómetro sincronizado por periodo (tiempos, cuartos, sets).
   - Actualización parcial de tanteadores (`PATCH /api/partidos/{id}/marcador`).

5. **Tablas de Posiciones según la Disciplina Deportiva:**
   - **Fútbol y Microfútbol:** 3 puntos por victoria, 1 punto por empate y 0 por derrota.
   - **Baloncesto (FIBA):** 2 puntos por victoria y 1 punto por derrota (sin empates).
   - **Voleibol (FIVB por Sets):** 3-0 y 3-1 otorgan 3 pts al ganador y 0 al perdedor; 3-2 otorga 2 pts al ganador y 1 al perdedor.
   - Desempate automático por Puntos Totales y Diferencia de Gol/Puntos.

6. **Registro de Incidencias / Eventos y Estadísticas Individuales:**
   - Registro minuto a minuto de goles, puntos, faltas y tarjetas asociadas a jugadores de nómina.
   - Consulta y ranking de **Goleadores** / Artilleros del torneo.
   - Desglose cronológico de incidencias en modal de partido.

7. **Autenticación y Control de Accesos por Roles (RBAC):**
   - Verificación de credenciales en MySQL (`POST /api/auth/login`) con tolerancia a texto plano, BCrypt y SHA-256.
   - **SUPERADMIN:** Acceso irrestricto a Torneos, Deportes, Carga Excel, Fixture y Configuración.
   - **PLANILLERO:** Acceso exclusivo a la Mesa Técnica en Vivo de su torneo asignado.
   - Guardián de sesión en frontend y cierre de sesión seguro.

8. **Vista Pública Responsive (Estilo FlashScore):**
   - Interfaz moderna en paleta oscura orientada al usuario y prensa deportiva.
   - Filtros dinámicos por deporte, torneo, jornada y estado del encuentro.
   - Visualización de cuadros y llaves de eliminación directa (Playoffs / Brackets).
   - Adaptabilidad 100% para dispositivos móviles y tablets con scroll táctil optimizado.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnologías |
|---|---|
| **Backend** | .NET 8.0 Web API, C# 12, Dapper 2.1, MySqlConnector 2.6, EPPlus 7.0, BCrypt.Net-Next 4.2, Swashbuckle (Swagger/OpenAPI) |
| **Pruebas** | xUnit 2.5, Microsoft.NET.Test.Sdk 17.8 |
| **Base de Datos** | MySQL 8.x Server (Motor InnoDB, Codificación UTF-8 / utf8mb4) |
| **Frontend** | HTML5 semántico, CSS3 moderno (Flexbox, CSS Grid, Media Queries móviles), JavaScript Vanilla modular (ES6+) |
| **Herramientas** | Git, Postman v2.1.0, Visual Studio / VS Code, dotnet CLI |

---

## 📋 Requisitos Previos del Sistema

Asegúrate de contar con los siguientes componentes instalados en tu equipo:

1. **.NET 8.0 SDK** (versión 8.0.x o superior):
   ```bash
   dotnet --version
   ```
2. **MySQL Server 8.x** (en ejecución local en el puerto `3306`):
   ```bash
   mysql --version
   ```
3. **Git** (para clonación y control de versiones):
   ```bash
   git --version
   ```

---

## ⚙️ Guía de Instalación y Puesta en Marcha

### 1. Clonar el Repositorio
```bash
git clone https://github.com/diegodiegoc-svg/SincelejoScoreAppDACD.git
cd SincelejoScoreAppDACD
```

### 2. Restaurar la Base de Datos en MySQL
Crea la base de datos e importa el archivo SQL incluido en el repositorio (contiene esquema, datos deportivos y usuarios de prueba):
```bash
# Iniciar sesión en MySQL y crear la base de datos
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS marcadores_multideporte CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"

# Restaurar el volcado oficial
mysql -u root -p marcadores_multideporte < ApiSincelejoScore/dump_sincelejoscore.sql
```

### 3. Configurar la Conexión en el Backend
Verifica o ajusta tus credenciales de MySQL en `ApiSincelejoScore/appsettings.json`:
```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost;Database=marcadores_multideporte;User=root;Password=TU_PASSWORD;"
  }
}
```

### 4. Ejecutar el Backend (.NET Web API)
```bash
cd ApiSincelejoScore
dotnet restore
dotnet run
```
La API iniciará en los puertos configurados:
- **HTTP:** `http://localhost:5291`
- **Swagger UI (Documentación interactiva):** [http://localhost:5291/swagger](http://localhost:5291/swagger)

---

## 🧪 Ejecución de Pruebas Unitarias (xUnit)

El proyecto cuenta con una suite automatizada de **12 pruebas unitarias** que validan la matemática de los algoritmos:
```bash
# Desde la raíz de la solución
dotnet test ApiSincelejoScore.Tests/ApiSincelejoScore.Tests.csproj
```

**Cobertura de pruebas:**
- `FixtureServiceTests.cs`:
  - `Prueba1_Fixture_ConEquiposPar_GeneraJornadasYPartidosExactosSinComodines`
  - `Prueba2_Fixture_ConEquiposImpar_ManejaFechaDescansoCorrectamente`
  - `Prueba3_Fixture_ConMultiplesVueltas_AlternaLocaliasIdaYVuelta`
- `PosicionesTests.cs`:
  - `Prueba1_ReglaFutbol_ValidaAsignacion3PtsVictoria1PtEmpate0PtsDerrota`
  - `Prueba2_ReglaBaloncesto_Valida2PtsVictoria1PtDerrotaSinEmpates`
  - `Prueba3_ReglaVoleibolFIVB_ValidaSistemaDePuntuacionPorSets` (6 casos reglamentarios de sets FIVB: 3-0, 3-1, 3-2, 2-3, 1-3, 0-3 y excepción ante marcador inválido).

---

## 🌐 Ejecución del Frontend

El frontend está construido en JavaScript puro sin dependencias de compilación. Puedes abrirlo directamente o servirlo con cualquier servidor estático:

- **Vista Pública de Marcadores y Fixture:**
  Abre el archivo `SincelejoScore-Frontend/index.html` en tu navegador.
- **Acceso Administrativo / Mesa Técnica:**
  Abre el archivo `SincelejoScore-Frontend/login.html` en tu navegador.

*(Opcional: Si tienes la extensión Live Server de VS Code, haz clic derecho en `index.html` y selecciona "Open with Live Server").*

---

## 🔑 Credenciales de Acceso para Pruebas

| Rol | Usuario | Contraseña | Permisos y Alcance |
|---|---|---|---|
| **SuperAdmin** | `admin` | `admin123` | Control total del sistema: Torneos, Deportes, Carga Masiva Excel, Fixture Round-Robin y Mesa Técnica. |
| **Planillero** | `planillero1` | `mesa123` | Acceso restringido exclusivamente a la Mesa Técnica en Vivo del Torneo 1 (`LIBASU INFANTIL FEMENINO`). |

---

## 📂 Recursos y Entregables Incluidos en el Repositorio

- **`plantilla_sincelejoscore.xlsx`:**
  Plantilla binaria oficial de Excel con formato de colores y validaciones. Contiene:
  - Hoja `Equipos`: 4 equipos de prueba para Baloncesto y Fútbol.
  - Hoja `Jugadores`: 5 jugadores válidos y **1 fila con error intencional** (nombre vacío y cédula duplicada) para sustentar en vivo las validaciones del backend.
- **`SincelejoScore.postman_collection.json`:**
  Colección Postman Schema v2.1.0 con **53 peticiones organizadas en 9 módulos**, con payloads JSON listos para pruebas de endpoints.
- **`dump_sincelejoscore.sql`:**
  Respaldo completo de la base de datos MySQL con esquema relacional, datos deportivos y usuarios creados.
- **`SincelejoScoreApp.sln`:**
  Archivo de solución que integra la API y el proyecto de pruebas unitarias.

---

## 📄 Licencia y Derechos de Autor

Proyecto desarrollado con fines académicos para la asignatura **Desarrollo Web (CUN - 2026)**.
Autoría compartida por **Diego Armando Cumplido Díaz** y **Carlos Julio Alvis Hernández**.
