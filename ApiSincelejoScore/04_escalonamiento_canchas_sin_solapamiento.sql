-- =============================================================================
-- SCRIPT: Escalonamiento realista de canchas sin solapamientos
-- Base de Datos: marcadores_multideporte
-- =============================================================================

USE marcadores_multideporte;

-- 1. Cancha Almagrario (ID: 1): Solo UN partido en vivo en este momento (1T ~25')
UPDATE partidos 
SET fecha_hora = DATE_SUB(NOW(), INTERVAL 25 MINUTE),
    estado = 'EN_JUEGO',
    estado_detalle = '1T',
    minuto_actual = 25,
    puntos_local = 1,
    puntos_visitante = 0,
    cancha_id = 1
WHERE id = 13;

-- 2. El segundo partido de fútbol en vivo (DESCANSO) se asigna a otra sede (Cancha Bitar, ID: 3)
UPDATE partidos 
SET fecha_hora = DATE_SUB(NOW(), INTERVAL 50 MINUTE),
    estado = 'EN_JUEGO',
    estado_detalle = 'DESCANSO',
    minuto_actual = 45,
    puntos_local = 2,
    puntos_visitante = 2,
    cancha_id = 3
WHERE id = 14;

-- 3. Partidos posteriores en Cancha Almagrario (ID: 1): Escalonados post-finalización
-- El partido 13 dura ~110 min (termina en ~85 min). El partido 15 inicia en 2 horas (120 min)
UPDATE partidos 
SET fecha_hora = DATE_ADD(NOW(), INTERVAL 120 MINUTE),
    estado = 'PROGRAMADO',
    estado_detalle = 'PROGRAMADO',
    minuto_actual = NULL,
    puntos_local = 0,
    puntos_visitante = 0,
    cancha_id = 1
WHERE id = 15;

-- El partido 15 terminará en ~230 min. El partido 16 inicia en 4 horas (240 min)
UPDATE partidos 
SET fecha_hora = DATE_ADD(NOW(), INTERVAL 250 MINUTE),
    estado = 'PROGRAMADO',
    estado_detalle = 'PROGRAMADO',
    minuto_actual = NULL,
    puntos_local = 0,
    puntos_visitante = 0,
    cancha_id = 1
WHERE id = 16;

-- 4. Microfútbol en Cancha Barrio Bogotá (ID: 2)
-- Partido 19 en juego (inició hace 25 min, dura 55 min, termina en 30 min)
UPDATE partidos 
SET fecha_hora = DATE_SUB(NOW(), INTERVAL 25 MINUTE),
    estado = 'EN_JUEGO',
    estado_detalle = 'DESCANSO',
    minuto_actual = 20,
    puntos_local = 3,
    puntos_visitante = 1,
    cancha_id = 2
WHERE id = 19;

-- Partido 20 en Cancha Barrio Bogotá: inicia en 3 horas (180 min), sin solapamiento
UPDATE partidos 
SET fecha_hora = DATE_ADD(NOW(), INTERVAL 180 MINUTE),
    estado = 'PROGRAMADO',
    estado_detalle = 'PROGRAMADO',
    minuto_actual = NULL,
    puntos_local = 0,
    puntos_visitante = 0,
    cancha_id = 2
WHERE id = 20;

-- 5. Voleibol en Cancha Brisas de Confasucre (ID: 5)
-- Partido 31 en juego (SET 2, inició hace 30 min, dura 90 min, termina en 60 min)
UPDATE partidos 
SET fecha_hora = DATE_SUB(NOW(), INTERVAL 30 MINUTE),
    estado = 'EN_JUEGO',
    estado_detalle = 'SET 2',
    minuto_actual = 30,
    puntos_local = 1,
    puntos_visitante = 0,
    cancha_id = 5
WHERE id = 31;

-- Partido 32 en Cancha Brisas: inicia en 2 horas (120 min), después de finalizar el 31
UPDATE partidos 
SET fecha_hora = DATE_ADD(NOW(), INTERVAL 120 MINUTE),
    estado = 'PROGRAMADO',
    estado_detalle = 'PROGRAMADO',
    minuto_actual = NULL,
    puntos_local = 0,
    puntos_visitante = 0,
    cancha_id = 5
WHERE id = 32;

-- 6. Baloncesto en Coliseo Menor Mochila (ID: 28)
UPDATE partidos 
SET fecha_hora = DATE_ADD(NOW(), INTERVAL 75 MINUTE),
    estado = 'PROGRAMADO',
    estado_detalle = 'PROGRAMADO',
    minuto_actual = NULL,
    puntos_local = 0,
    puntos_visitante = 0,
    cancha_id = 28
WHERE id = 37;

-- 7. Béisbol en Estadio Ligas Menores El Cortijo (ID: 32)
UPDATE partidos 
SET fecha_hora = DATE_ADD(NOW(), INTERVAL 150 MINUTE),
    estado = 'PROGRAMADO',
    estado_detalle = 'PROGRAMADO',
    minuto_actual = NULL,
    puntos_local = 0,
    puntos_visitante = 0,
    cancha_id = 32
WHERE id = 7;

-- 8. Softbol en Estadio Softbol Eduardo Porras (ID: 35)
UPDATE partidos 
SET fecha_hora = DATE_ADD(NOW(), INTERVAL 90 MINUTE),
    estado = 'PROGRAMADO',
    estado_detalle = 'PROGRAMADO',
    minuto_actual = NULL,
    puntos_local = 0,
    puntos_visitante = 0,
    cancha_id = 35
WHERE id = 25;

-- Verificación de canchas y horarios de HOY
SELECT 
    c.id AS cancha_id,
    c.nombre AS cancha,
    p.id AS partido_id,
    d.nombre AS deporte,
    t.nombre AS torneo,
    CONCAT(el.nombre, ' vs ', ev.nombre) AS encuentro,
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
WHERE DATE(p.fecha_hora) = CURDATE()
ORDER BY c.nombre, p.fecha_hora ASC;
