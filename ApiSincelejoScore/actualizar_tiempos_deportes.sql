-- =============================================================================
-- SCRIPT DE MIGRACIÓN: Parametrización de Tiempos y Duración por Deporte
-- Base de Datos: marcadores_multideporte
-- Proyecto: ApiSincelejoScore
-- =============================================================================

USE marcadores_multideporte;

-- 1. Agregar las columnas de duración y descansos a la tabla 'deportes'
ALTER TABLE deportes 
    ADD COLUMN duracion_periodo_minutos INT NOT NULL DEFAULT 0 AFTER cantidad_periodos_base,
    ADD COLUMN descanso_minutos INT NOT NULL DEFAULT 0 AFTER duracion_periodo_minutos,
    ADD COLUMN duracion_total_estimada_minutos INT NOT NULL DEFAULT 0 AFTER descanso_minutos;

-- 2. Parametrizar valores oficiales y estimados por deporte

-- Baloncesto (4 cuartos de 10 min FIBA, 15 min descanso medio tiempo, ~75 min total)
UPDATE deportes 
SET duracion_periodo_minutos = 10,
    descanso_minutos = 15,
    duracion_total_estimada_minutos = 75
WHERE id = 1 OR LOWER(nombre) LIKE '%baloncesto%' OR LOWER(nombre) LIKE '%basket%';

-- Béisbol (9 innings, sin entretiempo fijo, ~160 min total)
UPDATE deportes 
SET duracion_periodo_minutos = 18,
    descanso_minutos = 0,
    duracion_total_estimada_minutos = 160
WHERE id = 2 OR LOWER(nombre) LIKE '%beisbol%' OR LOWER(nombre) LIKE '%béisbol%';

-- Fútbol (2 tiempos de 45 min, 15 min entretiempo, ~110 min total con reposición)
UPDATE deportes 
SET duracion_periodo_minutos = 45,
    descanso_minutos = 15,
    duracion_total_estimada_minutos = 110
WHERE id = 3 OR (LOWER(nombre) LIKE '%f%tbol%' AND LOWER(nombre) NOT LIKE '%micro%');

-- Microfútbol / Futsal (2 tiempos de 20 min, 10 min descanso, ~55 min total)
UPDATE deportes 
SET duracion_periodo_minutos = 20,
    descanso_minutos = 10,
    duracion_total_estimada_minutos = 55
WHERE id = 4 OR LOWER(nombre) LIKE '%micro%' OR LOWER(nombre) LIKE '%futsal%' OR LOWER(nombre) LIKE '%sal%n%';

-- Softbol (7 innings, sin entretiempo fijo, ~110 min total)
UPDATE deportes 
SET duracion_periodo_minutos = 15,
    descanso_minutos = 0,
    duracion_total_estimada_minutos = 110
WHERE id = 5 OR LOWER(nombre) LIKE '%softbol%' OR LOWER(nombre) LIKE '%sóftbol%';

-- Voleibol (Al mejor de 5 sets, promedio 22 min/set, 3 min descanso entre sets, ~90 min total)
UPDATE deportes 
SET duracion_periodo_minutos = 22,
    descanso_minutos = 3,
    duracion_total_estimada_minutos = 90
WHERE id = 6 OR LOWER(nombre) LIKE '%voleibol%' OR LOWER(nombre) LIKE '%voley%';

-- 3. Verificación final de los datos actualizados
SELECT 
    id, 
    nombre, 
    tipo_periodo, 
    cantidad_periodos_base, 
    duracion_periodo_minutos, 
    descanso_minutos, 
    duracion_total_estimada_minutos, 
    permite_empate, 
    unidad_marcador 
FROM deportes;
