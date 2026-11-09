-- =============================================================================
-- SCRIPT: Regla Institucional de Sincelejo - Sede Fija por Torneo
-- Base de Datos: marcadores_multideporte
-- =============================================================================

USE marcadores_multideporte;

-- 1. Asignar cancha sede natural a los torneos principales y fijar es_multicancha = 0
UPDATE torneos SET cancha_sede_id = 1, es_multicancha = 0 WHERE id = 16 OR LOWER(nombre) LIKE '%almagrario%';
UPDATE torneos SET cancha_sede_id = 2, es_multicancha = 0 WHERE id = 44 OR LOWER(nombre) LIKE '%barrio bogot%';
UPDATE torneos SET cancha_sede_id = 5, es_multicancha = 0 WHERE id = 73 OR LOWER(nombre) LIKE '%brisas conf%';
UPDATE torneos SET cancha_sede_id = 28, es_multicancha = 0 WHERE id = 1 OR LOWER(nombre) LIKE '%libasu infantil femenino%';
UPDATE torneos SET cancha_sede_id = 32, es_multicancha = 0 WHERE id = 13 OR LOWER(nombre) LIKE '%ligas menores juveniles%';
UPDATE torneos SET cancha_sede_id = 35, es_multicancha = 0 WHERE id = 64 OR LOWER(nombre) LIKE '%eduardo porras amateur%';

-- 2. Única excepción: Torneos de Categorías Menores de Fútbol son MULTICANCHA
UPDATE torneos 
SET es_multicancha = 1 
WHERE deporte_id = 3 AND (nombre LIKE '%SUB%' OR nombre LIKE '%CATEGORIA%');

-- 3. Reubicar Partido 14 de vuelta a CANCHA ALMAGRARIO (cancha_id = 1)
-- Escalonamiento perfecto de ALMAGRARIO INACTIVOS (Torneo 16) en CANCHA ALMAGRARIO:
-- Partido 13: En juego (inició hace 25 min, duración 110 min, termina en 85 min)
UPDATE partidos 
SET fecha_hora = DATE_SUB(NOW(), INTERVAL 25 MINUTE),
    estado = 'EN_JUEGO',
    estado_detalle = '1T',
    minuto_actual = 25,
    puntos_local = 1,
    puntos_visitante = 0,
    cancha_id = 1
WHERE id = 13;

-- Partido 14: Vuelve a Cancha Almagrario y se programa para después de terminar el Partido 13
UPDATE partidos 
SET fecha_hora = DATE_ADD(NOW(), INTERVAL 95 MINUTE),
    estado = 'PROGRAMADO',
    estado_detalle = 'PROGRAMADO',
    minuto_actual = NULL,
    puntos_local = 0,
    puntos_visitante = 0,
    cancha_id = 1
WHERE id = 14;

-- Partido 15: Se programa para después de terminar el Partido 14
UPDATE partidos 
SET fecha_hora = DATE_ADD(NOW(), INTERVAL 215 MINUTE),
    estado = 'PROGRAMADO',
    estado_detalle = 'PROGRAMADO',
    minuto_actual = NULL,
    puntos_local = 0,
    puntos_visitante = 0,
    cancha_id = 1
WHERE id = 15;

-- Partido 16: Se programa para después de terminar el Partido 15
UPDATE partidos 
SET fecha_hora = DATE_ADD(NOW(), INTERVAL 335 MINUTE),
    estado = 'PROGRAMADO',
    estado_detalle = 'PROGRAMADO',
    minuto_actual = NULL,
    puntos_local = 0,
    puntos_visitante = 0,
    cancha_id = 1
WHERE id = 16;

-- 4. Asegurar que todos los partidos de torneos mono-sede usen estrictamente su cancha_sede_id
UPDATE partidos p
INNER JOIN torneos t ON p.torneo_id = t.id
SET p.cancha_id = t.cancha_sede_id
WHERE t.es_multicancha = 0 AND t.cancha_sede_id IS NOT NULL;

-- 5. Verificación de torneos y sus canchas sede
SELECT 
    t.id AS torneo_id, 
    t.nombre AS torneo, 
    d.nombre AS deporte, 
    c.nombre AS cancha_sede, 
    t.es_multicancha
FROM torneos t
INNER JOIN deportes d ON t.deporte_id = d.id
LEFT JOIN canchas c ON t.cancha_sede_id = c.id
WHERE t.id IN (1, 13, 16, 44, 64, 73);

-- 6. Verificación de partidos de ALMAGRARIO INACTIVOS en CANCHA ALMAGRARIO
SELECT 
    p.id, 
    t.nombre AS torneo, 
    c.nombre AS cancha, 
    el.nombre AS local, 
    ev.nombre AS visitante, 
    p.estado, 
    p.estado_detalle, 
    p.minuto_actual, 
    DATE_FORMAT(p.fecha_hora, '%H:%i') AS hora_inicio,
    DATE_FORMAT(DATE_ADD(p.fecha_hora, INTERVAL d.duracion_total_estimada_minutos MINUTE), '%H:%i') AS hora_fin_estimada
FROM partidos p
INNER JOIN torneos t ON p.torneo_id = t.id
INNER JOIN deportes d ON t.deporte_id = d.id
INNER JOIN canchas c ON p.cancha_id = c.id
INNER JOIN equipos el ON p.equipo_local_id = el.id
INNER JOIN equipos ev ON p.equipo_visitante_id = ev.id
WHERE p.torneo_id = 16 AND DATE(p.fecha_hora) = CURDATE()
ORDER BY p.fecha_hora ASC;
