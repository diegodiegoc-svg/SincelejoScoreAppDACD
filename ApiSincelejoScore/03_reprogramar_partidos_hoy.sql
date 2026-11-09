-- =============================================================================
-- SCRIPT: Reprogramación estratégica de partidos existentes para HOY
-- Base de Datos: marcadores_multideporte
-- =============================================================================

USE marcadores_multideporte;

-- 1. Asignar canchas existentes a cualquier partido que las tenga en NULL o 0
UPDATE partidos 
SET cancha_id = CASE 
    WHEN torneo_id = 1 THEN 28  -- Coliseo Menor Mochila (Baloncesto)
    WHEN torneo_id = 13 THEN 32 -- Estadio Beisbol Ligas Menores El Cortijo
    WHEN torneo_id = 16 THEN 1  -- Cancha Almagrario (Fútbol)
    WHEN torneo_id = 44 THEN 2  -- Cancha Barrio Bogotá (Microfútbol)
    WHEN torneo_id = 64 THEN 35 -- Estadio Softbol Eduardo Porras
    WHEN torneo_id = 73 THEN 5  -- Cancha Brisas de Confasucre (Voleibol)
    ELSE 1
END
WHERE cancha_id IS NULL OR cancha_id = 0;

-- 2. Partido de Fútbol iniciado hace 25 minutos (EN_JUEGO, 1T, minuto ~25)
UPDATE partidos 
SET fecha_hora = DATE_SUB(NOW(), INTERVAL 25 MINUTE),
    estado = 'EN_JUEGO',
    estado_detalle = '1T',
    minuto_actual = 25,
    puntos_local = 1,
    puntos_visitante = 0,
    cancha_id = 1
WHERE id = 13;

-- 3. Partido de Fútbol iniciado hace 50 minutos (EN_JUEGO, DESCANSO)
UPDATE partidos 
SET fecha_hora = DATE_SUB(NOW(), INTERVAL 50 MINUTE),
    estado = 'EN_JUEGO',
    estado_detalle = 'DESCANSO',
    minuto_actual = 45,
    puntos_local = 2,
    puntos_visitante = 2,
    cancha_id = 1
WHERE id = 14;

-- 3b. Partido de Microfútbol en descanso iniciado hace 25 min (20 min 1T + 5 min descanso)
UPDATE partidos 
SET fecha_hora = DATE_SUB(NOW(), INTERVAL 25 MINUTE),
    estado = 'EN_JUEGO',
    estado_detalle = 'DESCANSO',
    minuto_actual = 20,
    puntos_local = 3,
    puntos_visitante = 1,
    cancha_id = 2
WHERE id = 19;

-- 4. Partido de Voleibol iniciado hace 30 minutos (EN_JUEGO, SET 2)
UPDATE partidos 
SET fecha_hora = DATE_SUB(NOW(), INTERVAL 30 MINUTE),
    estado = 'EN_JUEGO',
    estado_detalle = 'SET 2',
    minuto_actual = 30,
    puntos_local = 1,
    puntos_visitante = 0,
    cancha_id = 5
WHERE id = 31;

-- 5. Partidos PROGRAMADOS para hoy más tarde
-- Fútbol (Torneo 16 - id 15 en 2 horas, id 16 en 4 horas)
UPDATE partidos 
SET fecha_hora = DATE_ADD(NOW(), INTERVAL 2 HOUR),
    estado = 'PROGRAMADO',
    estado_detalle = 'PROGRAMADO',
    minuto_actual = NULL,
    puntos_local = 0,
    puntos_visitante = 0,
    cancha_id = 1
WHERE id = 15;

UPDATE partidos 
SET fecha_hora = DATE_ADD(NOW(), INTERVAL 4 HOUR),
    estado = 'PROGRAMADO',
    estado_detalle = 'PROGRAMADO',
    minuto_actual = NULL,
    puntos_local = 0,
    puntos_visitante = 0,
    cancha_id = 1
WHERE id = 16;

-- Microfútbol (Torneo 44 - id 20 en 3 horas)
UPDATE partidos 
SET fecha_hora = DATE_ADD(NOW(), INTERVAL 3 HOUR),
    estado = 'PROGRAMADO',
    estado_detalle = 'PROGRAMADO',
    minuto_actual = NULL,
    puntos_local = 0,
    puntos_visitante = 0,
    cancha_id = 2
WHERE id = 20;

-- Voleibol (Torneo 73 - id 32 en 2 horas)
UPDATE partidos 
SET fecha_hora = DATE_ADD(NOW(), INTERVAL 2 HOUR),
    estado = 'PROGRAMADO',
    estado_detalle = 'PROGRAMADO',
    minuto_actual = NULL,
    puntos_local = 0,
    puntos_visitante = 0,
    cancha_id = 5
WHERE id = 32;

-- Baloncesto (Torneo 1 - id 37 en 1 hora)
UPDATE partidos 
SET fecha_hora = DATE_ADD(NOW(), INTERVAL 1 HOUR),
    estado = 'PROGRAMADO',
    estado_detalle = 'PROGRAMADO',
    minuto_actual = NULL,
    puntos_local = 0,
    puntos_visitante = 0,
    cancha_id = 28
WHERE id = 37;

-- Béisbol (Torneo 13 - id 7 en 3 horas)
UPDATE partidos 
SET fecha_hora = DATE_ADD(NOW(), INTERVAL 3 HOUR),
    estado = 'PROGRAMADO',
    estado_detalle = 'PROGRAMADO',
    minuto_actual = NULL,
    puntos_local = 0,
    puntos_visitante = 0,
    cancha_id = 32
WHERE id = 7;

-- Softbol (Torneo 64 - id 25 en 2 horas)
UPDATE partidos 
SET fecha_hora = DATE_ADD(NOW(), INTERVAL 2 HOUR),
    estado = 'PROGRAMADO',
    estado_detalle = 'PROGRAMADO',
    minuto_actual = NULL,
    puntos_local = 0,
    puntos_visitante = 0,
    cancha_id = 35
WHERE id = 25;

-- 6. Consulta de verificación para los partidos de HOY
SELECT 
    p.id, 
    d.nombre AS deporte, 
    t.nombre AS torneo, 
    c.nombre AS cancha, 
    el.nombre AS local, 
    ev.nombre AS visitante, 
    CONCAT(p.puntos_local, ' - ', p.puntos_visitante) AS marcador, 
    p.estado, 
    p.estado_detalle, 
    p.minuto_actual, 
    DATE_FORMAT(p.fecha_hora, '%Y-%m-%d %H:%i') AS fecha_hora
FROM partidos p
INNER JOIN torneos t ON p.torneo_id = t.id
INNER JOIN deportes d ON t.deporte_id = d.id
LEFT JOIN canchas c ON p.cancha_id = c.id
INNER JOIN equipos el ON p.equipo_local_id = el.id
INNER JOIN equipos ev ON p.equipo_visitante_id = ev.id
WHERE DATE(p.fecha_hora) = CURDATE()
ORDER BY p.fecha_hora ASC;
