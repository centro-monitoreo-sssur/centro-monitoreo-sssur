<?php
/**
 * ============================================================================
 * Subida de fotos de perfil a cPanel
 * Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE
 * Las fotos de perfil son permanentes y pequeñas; las fotos de denuncia son
 * numerosas y se purgan a los 7-15 días. Mezclarlas en el 1 GB de Supabase
 * Storage haría que los perfiles compitiesen por la cuota que necesita la
 * operación de campo. cPanel no tiene esa presión.
 *
 * SEGURIDAD — este endpoint es público en Internet, así que:
 *   1. Exige un JWT de Supabase válido y NO caducado (firma HS256 verificada
 *      contra el JWT Secret del proyecto). Sin esto cualquiera podría subir
 *      archivos al servidor de la alcaldía.
 *   2. El nombre del archivo lo decide el servidor, nunca el cliente: se deriva
 *      del `sub` del token. Así un usuario no puede sobrescribir la foto de
 *      otro ni escribir fuera del directorio (path traversal).
 *   3. El tipo se valida por CONTENIDO con finfo, no por extensión ni por el
 *      Content-Type que envía el navegador — ambos son manipulables.
 *   4. El directorio de destino lleva un .htaccess que impide ejecutar PHP.
 *      Es la defensa que convierte "subieron un .php disfrazado" en un archivo
 *      inerte en vez de en ejecución remota.
 *
 * DÓNDE VA
 *   Bajo la raíz del subdominio del Centro de Monitoreo, junto al endpoint de
 *   evidencias. NO en public_html/api/, que pertenece al dominio principal y a
 *   otro sistema. Ver el encabezado de subir_evidencia.php para el árbol
 *   completo y el porqué.
 *
 * INSTALACIÓN
 *   1. Sube este archivo a
 *        public_html/monitoreo.sansalvadorsur.gob.sv/api-monitoreo/
 *   2. Crea
 *        public_html/monitoreo.sansalvadorsur.gob.sv/uploads-monitoreo/perfiles/
 *      y copia allí el .htaccess adjunto (cpanel/uploads-perfiles.htaccess).
 *   3. Rellena las constantes de CONFIGURACIÓN.
 *   4. El JWT Secret está en Supabase → Project Settings → API → JWT Secret.
 *      NO es la anon key ni la service_role.
 *   5. Copia la URL pública del endpoint en ENDPOINT_FOTOS, dentro de
 *      assets/js/services/fotos-perfil.js
 * ============================================================================
 */

// ─── CONFIGURACIÓN ──────────────────────────────────────────────────────────

/** JWT Secret del proyecto Supabase. Settings → API → JWT Secret. */
const JWT_SECRET = 'PEGA_AQUI_EL_JWT_SECRET_DE_SUPABASE';

/** Ruta absoluta del directorio de subida. Debe terminar en barra. */
const DIR_DESTINO = __DIR__ . '/../uploads-monitoreo/perfiles/';

/** URL pública que corresponde a DIR_DESTINO. Debe terminar en barra. */
const URL_PUBLICA = 'https://monitoreo.sansalvadorsur.gob.sv/uploads-monitoreo/perfiles/';

/** Orígenes autorizados a llamar a este endpoint (CORS). */
const ORIGENES_PERMITIDOS = [
    'https://monitoreo.sansalvadorsur.gob.sv',
    'http://monitoreo.sansalvadorsur.gob.sv',   // mientras no haya certificado
    'http://127.0.0.1:5500',   // Live Server en desarrollo
    'http://localhost:5500',
];

const MAX_BYTES = 2097152; // 2 MB — el cliente ya comprime a ~200 KB

const TIPOS_PERMITIDOS = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
];

// ─── CORS ───────────────────────────────────────────────────────────────────

$origen = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origen, ORIGENES_PERMITIDOS, true)) {
    header('Access-Control-Allow-Origin: ' . $origen);
    header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/** Responde en JSON y termina. */
function responder(int $codigo, array $cuerpo): void
{
    http_response_code($codigo);
    echo json_encode($cuerpo, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    responder(405, ['error' => 'Método no permitido.']);
}

// ─── VERIFICACIÓN DEL JWT ───────────────────────────────────────────────────

/** Base64 URL-safe → binario. */
function base64UrlDecode(string $dato): string|false
{
    $relleno = strlen($dato) % 4;
    if ($relleno) {
        $dato .= str_repeat('=', 4 - $relleno);
    }
    return base64_decode(strtr($dato, '-_', '+/'), true);
}

/**
 * Verifica un JWT HS256 de Supabase y devuelve su payload.
 * Devuelve null si la firma no cuadra, el algoritmo no es el esperado o el
 * token ya caducó.
 */
function verificarJwt(string $token, string $secreto): ?array
{
    $partes = explode('.', $token);
    if (count($partes) !== 3) {
        return null;
    }
    [$cabecera64, $carga64, $firma64] = $partes;

    $cabecera = json_decode((string) base64UrlDecode($cabecera64), true);
    // Rechazar explícitamente cualquier algoritmo distinto: aceptar el que
    // declare el token es la vulnerabilidad clásica de "alg: none".
    if (!is_array($cabecera) || ($cabecera['alg'] ?? '') !== 'HS256') {
        return null;
    }

    $firmaEsperada = hash_hmac('sha256', $cabecera64 . '.' . $carga64, $secreto, true);
    $firmaRecibida = base64UrlDecode($firma64);
    if ($firmaRecibida === false || !hash_equals($firmaEsperada, $firmaRecibida)) {
        return null;   // hash_equals: comparación en tiempo constante
    }

    $carga = json_decode((string) base64UrlDecode($carga64), true);
    if (!is_array($carga)) {
        return null;
    }
    if (!isset($carga['exp']) || time() >= (int) $carga['exp']) {
        return null;   // token caducado
    }
    if (empty($carga['sub'])) {
        return null;   // sin identificador de usuario no hay nombre de archivo
    }
    return $carga;
}

if (JWT_SECRET === 'PEGA_AQUI_EL_JWT_SECRET_DE_SUPABASE') {
    responder(500, ['error' => 'El endpoint no ha sido configurado: falta JWT_SECRET.']);
}

$cabeceras = function_exists('getallheaders') ? getallheaders() : [];
$autorizacion = $cabeceras['Authorization'] ?? $cabeceras['authorization']
    ?? ($_SERVER['HTTP_AUTHORIZATION'] ?? '');

if (!preg_match('/^Bearer\s+(.+)$/i', trim($autorizacion), $coincidencia)) {
    responder(401, ['error' => 'Falta el token de sesión.']);
}

$carga = verificarJwt($coincidencia[1], JWT_SECRET);
if ($carga === null) {
    responder(401, ['error' => 'Sesión inválida o caducada. Vuelve a iniciar sesión.']);
}

// ─── VALIDACIÓN DEL ARCHIVO ─────────────────────────────────────────────────

if (!isset($_FILES['foto']) || $_FILES['foto']['error'] !== UPLOAD_ERR_OK) {
    responder(400, ['error' => 'No se recibió ningún archivo válido.']);
}

$archivo = $_FILES['foto'];

if ($archivo['size'] <= 0 || $archivo['size'] > MAX_BYTES) {
    responder(413, ['error' => 'La imagen supera el tamaño máximo de 2 MB.']);
}

// El tipo real, leído del contenido. Ni la extensión ni el Content-Type del
// navegador sirven: los controla quien envía la petición.
$finfo = new finfo(FILEINFO_MIME_TYPE);
$tipoReal = $finfo->file($archivo['tmp_name']);

if (!isset(TIPOS_PERMITIDOS[$tipoReal])) {
    responder(415, ['error' => 'Formato no admitido. Usa JPG, PNG o WebP.']);
}

// Segunda comprobación: que sea una imagen que GD pueda interpretar. Un archivo
// puede empezar con cabecera JPEG válida y contener basura después.
$dimensiones = @getimagesize($archivo['tmp_name']);
if ($dimensiones === false) {
    responder(415, ['error' => 'El archivo no es una imagen legible.']);
}

// ─── ESCRITURA ──────────────────────────────────────────────────────────────

if (!is_dir(DIR_DESTINO) && !mkdir(DIR_DESTINO, 0755, true) && !is_dir(DIR_DESTINO)) {
    responder(500, ['error' => 'No se pudo preparar el directorio de destino.']);
}

// El nombre lo decide el servidor a partir del `sub` del token, saneado. Un
// usuario no puede elegirlo, así que no puede sobrescribir la foto de otro ni
// escapar del directorio con "../".
$idUsuario = preg_replace('/[^a-zA-Z0-9\-]/', '', (string) $carga['sub']);
if ($idUsuario === '') {
    responder(400, ['error' => 'Identificador de usuario no válido.']);
}

$extension = TIPOS_PERMITIDOS[$tipoReal];
// El sufijo aleatorio fuerza a que cambie la URL en cada subida: sin él, la
// foto nueva quedaría oculta tras la anterior en la caché del navegador.
$nombre = $idUsuario . '_' . bin2hex(random_bytes(4)) . '.' . $extension;
$rutaFinal = DIR_DESTINO . $nombre;

if (!move_uploaded_file($archivo['tmp_name'], $rutaFinal)) {
    responder(500, ['error' => 'No se pudo guardar la imagen en el servidor.']);
}
chmod($rutaFinal, 0644);

// Borrar las versiones anteriores del mismo usuario para que el directorio no
// crezca sin control con cada cambio de foto.
foreach (glob(DIR_DESTINO . $idUsuario . '_*') ?: [] as $antigua) {
    if ($antigua !== $rutaFinal) {
        @unlink($antigua);
    }
}

responder(200, [
    'ok'     => true,
    'url'    => URL_PUBLICA . $nombre,
    'ancho'  => $dimensiones[0],
    'alto'   => $dimensiones[1],
]);
