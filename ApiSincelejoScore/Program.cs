using System.Text;
using ApiSincelejoScore.Repositories;

var builder = WebApplication.CreateBuilder(args);

// Soporte automático para variables de entorno de producción (Railway MYSQL_URL / DATABASE_URL)
var mysqlUrl = Environment.GetEnvironmentVariable("MYSQL_URL") ?? Environment.GetEnvironmentVariable("DATABASE_URL");
if (!string.IsNullOrEmpty(mysqlUrl))
{
    try
    {
        var uri = new Uri(mysqlUrl);
        var userInfo = uri.UserInfo.Split(':');
        var user = userInfo[0];
        var password = userInfo.Length > 1 ? userInfo[1] : "";
        var host = uri.Host;
        var port = uri.Port > 0 ? uri.Port : 3306;
        var database = uri.AbsolutePath.TrimStart('/');
        builder.Configuration["ConnectionStrings:DefaultConnection"] = 
            $"Server={host};Port={port};Database={database};Uid={user};Pwd={password};";
    }
    catch
    {
        // Si no es una URL parseable, se mantiene la configuración existente
    }
}

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

// 1. Agregar servicios
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Configurar CORS
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

// Registrar repositorios
builder.Services.AddScoped<IDeporteRepository, DeporteRepository>();
builder.Services.AddScoped<IJugadorRepository, JugadorRepository>();
builder.Services.AddScoped<IEquipoRepository, EquipoRepository>();
builder.Services.AddScoped<IPartidoRepository, PartidoRepository>();
builder.Services.AddScoped<ITorneoRepository, TorneoRepository>();
builder.Services.AddScoped<ITorneoEquipoRepository, TorneoEquipoRepository>();
builder.Services.AddScoped<IEventoPartidoRepository, EventoPartidoRepository>();
builder.Services.AddScoped<IFixtureService, FixtureService>();
builder.Services.AddScoped<ITablaPosicionesRepository, TablaPosicionesRepository>();
builder.Services.AddScoped<IGoleadorRepository, GoleadorRepository>();
builder.Services.AddScoped<ICanchaRepository, CanchaRepository>();
builder.Services.AddScoped<IUsuarioRepository, UsuarioRepository>();
builder.Services.AddHostedService<ApiSincelejoScore.Services.MatchAutomationService>();

var app = builder.Build();

// 2. Habilitar Swagger en cualquier entorno
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "ApiSincelejoScore v1");
    c.RoutePrefix = "swagger";
});

app.UseCors();
app.UseAuthorization();
app.MapControllers();

app.Run();
