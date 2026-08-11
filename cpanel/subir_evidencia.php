<?php
/**
 * ============================================================================
 * Subida de evidencia fotográfica de casos a cPanel
 * Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE
 * Supabase Storage da 1 GB en el plan FREE (~2 000-3 000 fotos). La operación
 * de campo lo agotaría en meses. Mientras no se pague el plan Pro, las
 * fotografías de denuncia van al cPanel institucional, que ya se paga y no
 * tiene esa presión (docs/arquitectura/CONTEXTO_CRITICO.md §3).
 *
 * EN QUÉ SE DIFERENCIA DE subir_foto_perfil.php
 *   · Un usuario sube MUCHAS: hay límite por hora, que allí no hacía falta.
 *   · NO se borran las anteriores del mismo usuario. Allí la foto nueva
 *     sustituye a la vieja; aquí cada foto es evidencia de un caso distinto.
 *   · La imagen se REESCRIBE con GD en vez de moverse tal cual. Elimina EXIF
 *     y cualquier carga útil embebida, y garantiza que lo guardado es una
 *     imagen y nada más.
 *   · Se organiza en carpetas AAAA/MM, para que el respaldo y la purga puedan
 *     trabajar por periodos sin listar un directorio con decenas de miles de
 *     archivos.
 *
 * SEGURIDAD — este endpoint es público en Internet:
 *   1. Exige un JWT de Supabase válido y no caducado. Se verifica con ES256
 *      contra la clave pública del JWKS del proyecto (ver jwt-monitoreo.php).
 *      El servidor NO guarda ningún secreto de firma: puede comprobar tokens
 *      y no puede fabricarlos.
 *   2. El nombre del archivo lo decide el servidor a partir del `sub` del
 *      token. El cliente no elige ruta ni nombre: no hay path traversal.
 *   3. El tipo se valida por CONTENIDO con finfo, y después la imagen se
 *      reescribe. Un archivo que finja ser JPEG no sobrevive al reencodeado.
 *   4. Límite de subidas por usuario y hora: una cuenta comprometida no puede
 *      llenar el disco del servidor.
 *   5. El directorio de destino lleva un .htaccess que impide ejecutar nada.
 *
 * LO QUE ESTE ENDPOINT NO HACE
 *   No sabe a qué caso pertenece la foto, y es deliberado: la foto se sube
 *   ANTES de que exista el caso —`crear_caso_campo` recibe las URLs ya
 *   subidas—, así que no hay id de caso que registrar. El vínculo lo establece
 *   `casos_adjuntos` en la base de datos. Consecuencia: un formulario
 *   abandonado deja archivos huérfanos; ver LIMPIEZA al final.
 *
 * DÓNDE VA · el subdominio tiene su propia raíz
 *
 *   /home/USUARIO/
 *   ├── monitoreo-privado/                        ← FUERA de toda raíz web
 *   │   └── contadores/
 *   └── public_html/                              ← raíz del DOMINIO PRINCIPAL
 *       ├── api/                                    otro sistema · no tocar
 *       └── monitoreo.sansalvadorsur.gob.sv/      ← raíz del SUBDOMINIO
 *           ├── index.html, assets/…                el frontend
 *           ├── api-monitoreo/                      este archivo
 *           └── uploads-monitoreo/
 *               ├── evidencias/                     + .htaccess
 *               └── perfiles/                       + .htaccess
 *
 *   ⚠ `public_html/` ES la raíz del dominio principal. Todo lo que cuelgue de
 *     ahí se sirve por HTTP, incluido lo que esté fuera de la carpeta del
 *     subdominio. Por eso `monitoreo-privado/` va al nivel de public_html, no
 *     dentro: son TRES niveles por encima de este archivo, no dos.
 *
 *   Los nombres llevan sufijo `-monitoreo` a propósito: si algún día la raíz
 *   del subdominio se reconfigura y queda colgando del dominio principal, no
 *   pueden colisionar con las carpetas del otro sistema.
 *
 *   Frontend y endpoint quedan en el MISMO origen, así que en producción CORS
 *   no interviene. La lista de orígenes es para Live Server en desarrollo.
 *
 * INSTALACIÓN
 *   1. Sube a  public_html/monitoreo.sansalvadorsur.gob.sv/api-monitoreo/
 *      TRES archivos: este, jwt-monitoreo.php y config-monitoreo.php.
 *   2. Crea
 *        public_html/monitoreo.sansalvadorsur.gob.sv/uploads-monitoreo/evidencias/
 *      y copia allí el .htaccess adjunto (cpanel/uploads-evidencias.htaccess),
 *      renombrado a «.htaccess» exacto.
 *   3. Revisa config-monitoreo.php. Con la configuración actual del proyecto no
 *      hay ningún secreto que pegar: los tokens se firman con ES256 y se
 *      verifican con la clave pública que publica Supabase.
 *   4. Copia la URL pública del endpoint en ENDPOINT_EVIDENCIAS, dentro de
 *      assets/js/services/evidencias.js
 *   5. Comprueba que la carpeta privada NO se sirve por HTTP: pedir
 *        https://sansalvadorsur.gob.sv/monitoreo-privado/
 *      desde el navegador debe dar 404. Si devuelve un listado o un 403, la
 *      carpeta acabó dentro de la web y hay que corregir DIR_PRIVADO.
 *
 * REQUISITOS DEL SERVIDOR
 *   · PHP 7.4 o superior. El archivo está escrito deliberadamente sin `match`
 *     ni tipos unión, que son PHP 8.0+: el hosting de la municipalidad corre
 *     7.4 y allí serían un error de análisis — un 500 en blanco, sin mensaje.
 *   · Extensión `gd`  · OBLIGATORIA. Sin ella el endpoint responde 500 con
 *     explicación, porque no puede reescribir la imagen.
 *   · Extensión `exif` · RECOMENDADA. Sin ella no se puede leer la orientación
 *     de la cámara y toda foto tomada en vertical se guarda girada 90°. Se
 *     activa en cPanel → Select PHP Version → Extensions → exif.
 * ============================================================================
 */

// ─── CONFIGURACIÓN ──────────────────────────────────────────────────────────

/**
 * La configuración vive en config-monitoreo.php, NO aquí.
 *
 * Así este endpoint se puede reemplazar tantas veces como haga falta sin que se
 * pierda —ya ocurrió—, y nada sensible entra en el repositorio. Ver el
 * encabezado de config-monitoreo.example.php.
 *
 * La constante marca que la petición viene de un endpoint legítimo: el archivo
 * de configuración se niega a hacer nada si se le pide directamente por HTTP.
 */
define('MONITOREO_ENDPOINT', true);

$rutaConfig = __DIR__ . '/config-monitoreo.php';
if (!is_file($rutaConfig)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'error' => 'Falta config-monitoreo.php junto a este endpoint. ' .
                   'Copialo desde cpanel/config-monitoreo.example.php.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
require_once $rutaConfig;

/**
 * Ruta absoluta del directorio de subida. Debe terminar en barra.
 * Relativa a __DIR__ y no absoluta escrita a mano: así sigue siendo correcta
 * aunque cambie el nombre de la cuenta de cPanel o la raíz del subdominio.
 */
const DIR_DESTINO = __DIR__ . '/../uploads-monitoreo/evidencias/';

/** URL pública que corresponde a DIR_DESTINO. Debe terminar en barra. */
const URL_PUBLICA = 'https://monitoreo.sansalvadorsur.gob.sv/uploads-monitoreo/evidencias/';

/**
 * Directorio para los contadores del límite por hora.
 *
 * Cuelga de DIR_PRIVADO, que define config-monitoreo.php y está FUERA de la
 * raíz web. Los nombres de archivo llevan el UUID del empleado y la hora, así
 * que servirlos publicaría quién trabajó y cuándo. Como red de seguridad
 * adicional, el endpoint escribe un .htaccess de denegación al crear la
 * carpeta.
 */
const DIR_CONTADORES = DIR_PRIVADO . 'contadores/';

/** El cliente comprime a ~500 KB; el margen absorbe fotos mal comprimidas. */
const MAX_BYTES = 3145728;   // 3 MB

/** Tope por usuario y hora. Una jornada intensa no pasa de 20-30 fotos. */
const MAX_POR_HORA = 60;

/** Lado mayor de la imagen guardada. Por encima no aporta detalle útil. */
const LADO_MAXIMO = 1600;

/** Calidad del JPEG reescrito. */
const CALIDAD_JPEG = 78;

const TIPOS_PERMITIDOS = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'jpg',   // se reescribe todo a JPEG
    'image/webp' => 'jpg',
];

// ─── CORS ───────────────────────────────────────────────────────────────────

$origen = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origen, ORIGENES_PERMITIDOS, true)) {
    header('Access-Control-Allow-Origin: ' . $origen);
    header('Vary: Origin');
}
// `X-Monitoreo-Token` es la vía que sobrevive a Apache en CGI/FastCGI, que
// descarta `Authorization`. Ver leerTokenPortador() en jwt-monitoreo.php.
header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Monitoreo-Token');
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
//
// La verificación vive en jwt-monitoreo.php porque los dos endpoints la
// necesitan. Duplicarla garantizaría que algún día divergieran, y una
// comprobación de identidad divergente es la peor clase de divergencia.
//
// El proyecto firma con ES256 desde que Supabase migró a JWT Signing Keys, así
// que se verifica contra la clave pública del JWKS. El servidor ya no guarda
// ningún secreto de firma: puede comprobar tokens y no puede fabricarlos.

require_once __DIR__ . '/jwt-monitoreo.php';

// `leerTokenPortador` mira en los cuatro sitios donde puede acabar la cabecera
// Authorization según cómo Apache entregue la petición. Ver su comentario.
$token = leerTokenPortador();
if ($token === null) {
    responder(401, ['error' => 'Falta el token de sesión.']);
}

$carga = verificarJwtSupabase(
    $token,
    SUPABASE_URL,
    DIR_PRIVADO . 'cache/',
    JWT_SECRET_LEGACY
);
if ($carga === null) {
    responder(401, ['error' => 'Sesión inválida o caducada. Vuelve a iniciar sesión.']);
}

// ─── LÍMITE POR USUARIO Y HORA ──────────────────────────────────────────────

/**
 * Cuenta las subidas del usuario en la hora en curso y decide si admite una más.
 *
 * Se usa un contador en archivo en vez de listar el directorio: `glob` sobre
 * decenas de miles de fotos sería O(n) en cada subida. Aquí es O(1).
 *
 * `flock` es imprescindible: dos subidas simultáneas del mismo empleado —el
 * formulario admite dos fotos— leerían el mismo valor y escribirían el mismo
 * incremento, y el contador avanzaría de uno en uno contando de dos en dos.
 */
function admiteOtraSubida(string $idUsuario, int $maximo): bool
{
    if (!is_dir(DIR_CONTADORES)) {
        if (!mkdir(DIR_CONTADORES, 0700, true) && !is_dir(DIR_CONTADORES)) {
            // Sin contadores no se bloquea la operación: es una defensa contra
            // abuso, no un requisito funcional. Se prefiere dejar subir la
            // evidencia de un caso real a caerse por un directorio no escribible.
            return true;
        }
        // Red de seguridad por si el directorio acabó dentro de la raíz web
        // pese a la configuración: los contadores llevan el UUID del empleado
        // en el nombre y delatarían su actividad por hora.
        @file_put_contents(
            DIR_CONTADORES . '.htaccess',
            "Require all denied\n<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\n"
        );
    }

    $ruta = DIR_CONTADORES . $idUsuario . '_' . gmdate('YmdH') . '.cnt';
    $manejador = @fopen($ruta, 'c+');
    if ($manejador === false) {
        return true;   // mismo criterio: no bloquear por un fallo de disco
    }

    $admite = true;
    if (flock($manejador, LOCK_EX)) {
        $actual = (int) trim((string) stream_get_contents($manejador));
        if ($actual >= $maximo) {
            $admite = false;
        } else {
            ftruncate($manejador, 0);
            rewind($manejador);
            fwrite($manejador, (string) ($actual + 1));
            fflush($manejador);
        }
        flock($manejador, LOCK_UN);
    }
    fclose($manejador);

    // Barrido perezoso de contadores de horas pasadas: sin esto el directorio
    // acumula un archivo por usuario y hora para siempre. Se hace de vez en
    // cuando y no en cada petición, que sería una lectura de directorio inútil
    // el 99 % de las veces.
    if (random_int(1, 50) === 1) {
        $limite = time() - 7200;
        foreach (glob(DIR_CONTADORES . '*.cnt') ?: [] as $viejo) {
            if (@filemtime($viejo) < $limite) {
                @unlink($viejo);
            }
        }
    }

    return $admite;
}

if (!admiteOtraSubida($idUsuario, MAX_POR_HORA)) {
    responder(429, [
        'error' => 'Has subido demasiadas fotografías en la última hora. ' .
                   'Espera unos minutos e inténtalo de nuevo.',
    ]);
}

// ─── VALIDACIÓN DEL ARCHIVO ─────────────────────────────────────────────────

if (!isset($_FILES['foto']) || $_FILES['foto']['error'] !== UPLOAD_ERR_OK) {
    responder(400, ['error' => 'No se recibió ningún archivo válido.']);
}

$archivo = $_FILES['foto'];

if ($archivo['size'] <= 0 || $archivo['size'] > MAX_BYTES) {
    responder(413, ['error' => 'La imagen supera el tamaño máximo de 3 MB.']);
}

// El tipo real, leído del contenido. Ni la extensión ni el Content-Type del
// navegador sirven: los controla quien envía la petición.
$finfo = new finfo(FILEINFO_MIME_TYPE);
$tipoReal = $finfo->file($archivo['tmp_name']);

if (!isset(TIPOS_PERMITIDOS[$tipoReal])) {
    responder(415, ['error' => 'Formato no admitido. Usa JPG, PNG o WebP.']);
}

$dimensiones = @getimagesize($archivo['tmp_name']);
if ($dimensiones === false) {
    responder(415, ['error' => 'El archivo no es una imagen legible.']);
}

if (!extension_loaded('gd')) {
    responder(500, ['error' => 'El servidor no tiene la extensión GD instalada.']);
}

// ─── REESCRITURA DE LA IMAGEN ───────────────────────────────────────────────

/**
 * Decodifica la imagen con GD según su tipo real.
 * Devuelve null si GD no puede interpretarla, que a estas alturas significa
 * que el archivo está corrupto o disfrazado.
 *
 * `switch` y no `match`: `match` es PHP 8.0+ y aquí corre 7.4.
 *
 * Tampoco se declara el tipo de retorno. GD devuelve un `resource` en PHP 7.4
 * y un objeto `GdImage` en 8.0+, así que ningún tipo declarado sirve para las
 * dos versiones. Por lo mismo se comprueba `=== false` en vez de
 * `instanceof \GdImage`: la comparación con false funciona en ambas.
 */
function decodificar(string $ruta, string $mime)
{
    switch ($mime) {
        case 'image/jpeg':
            $imagen = @imagecreatefromjpeg($ruta);
            break;
        case 'image/png':
            $imagen = @imagecreatefrompng($ruta);
            break;
        case 'image/webp':
            $imagen = function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($ruta) : false;
            break;
        default:
            $imagen = false;
    }
    return $imagen === false ? null : $imagen;
}

/**
 * Aplica la orientación EXIF.
 *
 * Hay que hacerlo ANTES de reescribir. Al reencodear se pierde el EXIF entero
 * —que es justo lo que se busca por seguridad—, y con él la etiqueta de
 * orientación: una foto tomada en vertical con el teléfono se guardaría
 * girada 90°. Es un fallo visible en cada foto de campo, no un detalle.
 *
 * ⚠ Si la extensión `exif` no está activa, esto no puede hacer nada y las
 *   fotos verticales se guardarán giradas. Se activa en
 *   cPanel → Select PHP Version → Extensions → exif.
 */
function aplicarOrientacion($imagen, string $ruta, string $mime)
{
    if ($mime !== 'image/jpeg' || !function_exists('exif_read_data')) {
        return $imagen;
    }
    $exif = @exif_read_data($ruta);
    $orientacion = (int) (isset($exif['Orientation']) ? $exif['Orientation'] : 0);

    switch ($orientacion) {
        case 3:  $girada = imagerotate($imagen, 180, 0); break;
        case 6:  $girada = imagerotate($imagen, -90, 0); break;
        case 8:  $girada = imagerotate($imagen, 90, 0);  break;
        default: $girada = false;
    }

    if ($girada !== false) {
        imagedestroy($imagen);
        return $girada;
    }
    return $imagen;
}

$original = decodificar($archivo['tmp_name'], $tipoReal);
if ($original === null) {
    responder(415, ['error' => 'El archivo no es una imagen legible.']);
}
$original = aplicarOrientacion($original, $archivo['tmp_name'], $tipoReal);

$anchoOrigen = imagesx($original);
$altoOrigen  = imagesy($original);
$escala = min(1.0, LADO_MAXIMO / max($anchoOrigen, $altoOrigen));
$ancho = max(1, (int) round($anchoOrigen * $escala));
$alto  = max(1, (int) round($altoOrigen * $escala));

$destino = imagecreatetruecolor($ancho, $alto);
// Fondo blanco: un PNG con transparencia quedaría con las zonas transparentes
// en negro al pasar a JPEG.
imagefill($destino, 0, 0, imagecolorallocate($destino, 255, 255, 255));
imagecopyresampled($destino, $original, 0, 0, 0, 0, $ancho, $alto, $anchoOrigen, $altoOrigen);
imagedestroy($original);

// ─── ESCRITURA ──────────────────────────────────────────────────────────────

// Carpetas AAAA/MM: permiten respaldar y purgar por periodo sin listar un
// directorio con decenas de miles de archivos.
$subcarpeta = gmdate('Y') . '/' . gmdate('m') . '/';
$dirFinal = DIR_DESTINO . $subcarpeta;

if (!is_dir($dirFinal) && !mkdir($dirFinal, 0755, true) && !is_dir($dirFinal)) {
    imagedestroy($destino);
    responder(500, ['error' => 'No se pudo preparar el directorio de destino.']);
}

// El nombre lo compone el servidor. El sufijo aleatorio evita colisiones entre
// dos fotos del mismo empleado en el mismo segundo.
$nombre = $idUsuario . '_' . gmdate('YmdHis') . '_' . bin2hex(random_bytes(4)) . '.jpg';
$rutaFinal = $dirFinal . $nombre;

$guardada = imagejpeg($destino, $rutaFinal, CALIDAD_JPEG);
imagedestroy($destino);

if (!$guardada) {
    responder(500, ['error' => 'No se pudo guardar la imagen en el servidor.']);
}
chmod($rutaFinal, 0644);

$tamano = (int) (@filesize($rutaFinal) ?: 0);

// La forma del objeto es la que espera `p_adjuntos` en las RPC
// `crear_caso_campo` y `cerrar_caso_campo`.
responder(200, [
    'ok'     => true,
    'url'    => URL_PUBLICA . $subcarpeta . $nombre,
    'nombre' => $nombre,
    'mime'   => 'image/jpeg',
    'tamano' => $tamano,
    'tipo'   => 'foto',
    'ancho'  => $ancho,
    'alto'   => $alto,
]);

/**
 * ============================================================================
 * LIMPIEZA DE HUÉRFANOS
 * ----------------------------------------------------------------------------
 * Una foto se sube antes de que el caso exista. Si el empleado abandona el
 * formulario, el archivo queda sin fila en `casos_adjuntos`.
 *
 * No se resuelve aquí porque este endpoint no tiene acceso a la base de datos
 * —y dárselo significaría poner credenciales de Postgres en el cPanel—. La
 * limpieza es un trabajo periódico: listar las URLs de `casos_adjuntos`,
 * compararlas con el contenido de uploads/evidencias/AAAA/MM y borrar lo que
 * lleve más de 48 h sin referencia.
 *
 * Con el volumen de la municipalidad, unos pocos huérfanos al mes no
 * justifican automatizarlo todavía. Conviene revisarlo al pasar a Pro.
 * ============================================================================
 */
