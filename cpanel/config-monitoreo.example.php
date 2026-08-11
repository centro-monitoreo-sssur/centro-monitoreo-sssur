<?php
/**
 * ============================================================================
 * Configuración compartida de los endpoints de cPanel
 * Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE ESTE ARCHIVO
 *
 * Separa la configuración del código para que reemplazar un endpoint no borre
 * los ajustes —ya pasó— y para que nada sensible entre en el repositorio.
 *
 * ----------------------------------------------------------------------------
 * INSTALACIÓN
 *
 *   1. Copia este archivo, EN EL SERVIDOR, como:
 *        public_html/monitoreo.sansalvadorsur.gob.sv/api-monitoreo/config-monitoreo.php
 *      (mismo nombre SIN «.example»)
 *
 *   2. Revisa las constantes de abajo. Con la configuración actual del
 *      proyecto NO hay que pegar ningún secreto: los tokens se firman con
 *      ES256 y se verifican con la clave pública que publica Supabase.
 *
 *   3. Permisos 0644.
 *
 *   4. `cpanel/config-monitoreo.php` está en .gitignore. No lo subas al
 *      repositorio aunque hoy no contenga secretos.
 *
 * ⚠ Si alguien pide este archivo por HTTP, PHP lo ejecuta y el cortafuegos de
 *   abajo devuelve 404 sin imprimir nada. Nunca revela su contenido.
 * ============================================================================
 */

// Cortafuegos: solo tiene sentido incluido desde un endpoint, nunca suelto.
if (!defined('MONITOREO_ENDPOINT')) {
    http_response_code(404);
    exit;
}

/**
 * URL del proyecto Supabase, sin barra final.
 * De aquí sale el JWKS con las claves públicas:
 *     <SUPABASE_URL>/auth/v1/.well-known/jwks.json
 * Es el mismo valor que hay en assets/js/core/supabase-config.js
 */
const SUPABASE_URL = 'https://qfxiusdmcrbfadelybox.supabase.co';

/**
 * Carpeta privada, FUERA de cualquier raíz web. Debe terminar en barra.
 *
 * Guarda la caché del JWKS y los contadores del límite por hora. Tres niveles
 * arriba desde api-monitoreo/ es /home/USUARIO/, porque public_html/ ES la raíz
 * del dominio principal y todo lo que cuelgue de ahí se sirve por HTTP.
 *
 * Compruébalo: pedir https://sansalvadorsur.gob.sv/monitoreo-privado/ debe
 * dar 404.
 */
const DIR_PRIVADO = __DIR__ . '/../../../monitoreo-privado/';

/**
 * Secreto legacy de Supabase, SOLO si el proyecto todavía emite tokens HS256.
 *
 * Este proyecto ya migró a JWT Signing Keys y firma con ES256, así que se deja
 * vacío. Con la cadena vacía, los tokens HS256 se RECHAZAN — que es lo
 * correcto: aceptar una firma que no se puede comprobar no es aceptar nada.
 *
 * Solo se rellena si algún día se vuelve a la firma simétrica. Si se rellena,
 * este archivo pasa a contener una llave maestra con la que se pueden fabricar
 * tokens de cualquier usuario, y hay que tratarlo como tal.
 */
const JWT_SECRET_LEGACY = '';

/**
 * Orígenes autorizados a llamar a los endpoints (CORS).
 *
 * En producción el frontend y los endpoints comparten origen, así que CORS ni
 * interviene. La lista existe para Live Server durante el desarrollo.
 */
const ORIGENES_PERMITIDOS = [
    'https://monitoreo.sansalvadorsur.gob.sv',
    'http://monitoreo.sansalvadorsur.gob.sv',   // mientras no haya certificado
    'http://127.0.0.1:5500',   // Live Server
    'http://localhost:5500',
];
