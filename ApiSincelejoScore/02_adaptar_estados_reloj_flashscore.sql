-- =============================================================================
-- SCRIPT DE MIGRACIÓN: Adaptación a estados y reloj estilo Flashscore
-- Base de Datos: marcadores_multideporte
-- =============================================================================

USE marcadores_multideporte;

-- 1. Agregar columna tiene_reloj a deportes
ALTER TABLE deportes 
    ADD COLUMN IF NOT EXISTS tiene_reloj TINYINT(1) NOT NULL DEFAULT 1 AFTER permite_empate;

-- 2. Configurar tiene_reloj por deporte
UPDATE deportes SET tiene_reloj = 1 WHERE LOWER(nombre) IN ('fútbol', 'futbol', 'microfútbol', 'microfutbol', 'baloncesto', 'basket');
UPDATE deportes SET tiene_reloj = 0 WHERE LOWER(nombre) IN ('voleibol', 'voley', 'béisbol', 'beisbol', 'softbol', 'sóftbol');

-- 3. Agregar estado_detalle y minuto_actual a partidos
ALTER TABLE partidos 
    ADD COLUMN IF NOT EXISTS estado_detalle VARCHAR(20) NULL DEFAULT NULL AFTER estado,
    ADD COLUMN IF NOT EXISTS minuto_actual INT NULL DEFAULT NULL AFTER estado_detalle;
