# Etapa 1: Compilación (Build)
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copiar archivo de proyecto y restaurar dependencias
COPY ["ApiSincelejoScore.csproj", "./"]
RUN dotnet restore "ApiSincelejoScore.csproj"

# Copiar el código fuente completo y compilar en modo Release
COPY . .
RUN dotnet publish "ApiSincelejoScore.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Etapa 2: Imagen final de ejecución (Runtime optimizado)
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app

# Configuración del puerto para Railway (Puerto 8080)
ENV ASPNETCORE_HTTP_PORTS=8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080

# Copiar los binarios publicados desde la etapa de compilación
COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "ApiSincelejoScore.dll"]
