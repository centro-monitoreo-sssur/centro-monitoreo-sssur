<?php
/**
 * ============================================================================
 * Verificación de tokens de Supabase · biblioteca compartida
 * Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE
 *
 * Supabase migró el proyecto a JWT Signing Keys: los tokens se firman con
 * ES256 (ECDSA sobre la curva P-256), no con HS256. La verificación anterior
 * —HMAC contra el «JWT Secret»— ya no vale, y no es cuestión de cambiar una
 * constante: HS256 es simétrica y ES256 asimétrica.
 *
 * El cambio MEJORA la seguridad del cPanel. Con HS256, el servidor tenía que
 * guardar el mismo secreto con el que se FIRMAN los tokens: quien accediera a
 * ese archivo podía fabricar un token de superadministrador. Con ES256 el
 * servidor solo guarda la clave PÚBLICA. Sirve para comprobar firmas y no
 * sirve para producirlas.
 *
 * Está en un archivo aparte porque los dos endpoints la necesitan. Duplicarla
 * garantizaría que algún día divergieran, y una verificación de identidad
 * divergente es la peor clase de divergencia.
 *
 * ----------------------------------------------------------------------------
 * CÓMO FUNCIONA
 *
 *   1. Lee `alg` y `kid` de la cabecera del token.
 *   2. ES256/RS256 → busca la clave pública en el JWKS del proyecto
 *      (https://<ref>.supabase.co/auth/v1/.well-known/jwks.json), lo cachea en
 *      disco, y verifica con openssl.
 *      HS256 → solo si hay un secreto legacy configurado.
 *   3. Comprueba caducidad y presencia de `sub`.
 *
 * Se rechaza explícitamente cualquier otro algoritmo. Aceptar el que declare
 * el token es la vulnerabilidad clásica de «alg: none».
 *
 * REQUISITOS: PHP 7.4+, extensión `openssl`.
 * ============================================================================
 */

if (!defined('MONITOREO_ENDPOINT')) {
    http_response_code(404);
    exit;
}

// ─── Lectura del token de la petición ───────────────────────────────────────

/**
 * Devuelve el JWT de la petición, o null si no viene ninguno.
 *
 * ⚠ POR QUÉ SE MIRA EN TANTOS SITIOS
 *
 *   Apache NO entrega la cabecera `Authorization` a los scripts cuando PHP
 *   corre como CGI o FastCGI, que es la configuración habitual en cPanel. La
 *   descarta antes de llamar al script.
 *
 *   Comprobado en ESTE servidor: con la cabecera enviada correctamente, PHP
 *   veía `$_SERVER['HTTP_AUTHORIZATION']` vacío y el endpoint respondía «Falta
 *   el token de sesión» ante sesiones perfectamente válidas. Las reglas de
 *   reescritura de cpanel/api-monitoreo.htaccess tampoco bastaron.
 *
 *   La solución que no depende de la configuración del hosting es una cabecera
 *   PROPIA: Apache solo trata de forma especial a `Authorization`, y deja pasar
 *   `X-Monitoreo-Token` intacta. El cliente envía las dos; aquí se acepta la
 *   primera que llegue.
 *
 *   El orden de búsqueda es: cabecera propia → Authorization en sus cuatro
 *   escondites posibles (directa, o prefijada con REDIRECT_ una vez por cada
 *   salto de reescritura).
 *
 * La comparación de nombres es insensible a mayúsculas: `getallheaders()` no
 * normaliza, y unos servidores devuelven «Authorization» y otros «authorization».
 */
function leerTokenPortador(): ?string
{
    $cabeceras = function_exists('getallheaders') ? getallheaders() : [];

    // 1 · Cabecera propia. Es la que sobrevive en este hosting.
    foreach ($cabeceras as $nombre => $valor) {
        if (strcasecmp((string) $nombre, 'X-Monitoreo-Token') === 0) {
            $token = jwtLimpiarPortador((string) $valor);
            if ($token !== null) {
                return $token;
            }
        }
    }
    if (!empty($_SERVER['HTTP_X_MONITOREO_TOKEN'])) {
        $token = jwtLimpiarPortador((string) $_SERVER['HTTP_X_MONITOREO_TOKEN']);
        if ($token !== null) {
            return $token;
        }
    }

    // 2 · Authorization estándar, por si el servidor sí la entrega.
    $candidatos = [];
    foreach ($cabeceras as $nombre => $valor) {
        if (strcasecmp((string) $nombre, 'Authorization') === 0) {
            $candidatos[] = (string) $valor;
        }
    }
    foreach ([
        'HTTP_AUTHORIZATION',
        'REDIRECT_HTTP_AUTHORIZATION',
        'REDIRECT_REDIRECT_HTTP_AUTHORIZATION',
    ] as $clave) {
        if (!empty($_SERVER[$clave])) {
            $candidatos[] = (string) $_SERVER[$clave];
        }
    }
    foreach ($candidatos as $valor) {
        $token = jwtLimpiarPortador($valor);
        if ($token !== null) {
            return $token;
        }
    }

    return null;
}

/**
 * Normaliza el valor de una cabecera a un JWT, o null si no lo parece.
 * Acepta con y sin el prefijo «Bearer», porque la cabecera propia no tiene por
 * qué llevarlo y la estándar sí.
 */
function jwtLimpiarPortador(string $valor): ?string
{
    $valor = trim($valor);
    if ($valor === '') {
        return null;
    }
    if (preg_match('/^Bearer\s+(.+)$/i', $valor, $coincidencia)) {
        $valor = trim($coincidencia[1]);
    }
    // Tres segmentos separados por punto: la forma mínima de un JWT. Filtrarlo
    // aquí evita pasar a la verificación cualquier cadena suelta.
    return substr_count($valor, '.') === 2 ? $valor : null;
}

// ─── Utilidades base64url ───────────────────────────────────────────────────

/** Base64 URL-safe → binario. Devuelve string, o false si no es válido. */
function jwtBase64UrlDecode(string $dato)
{
    $relleno = strlen($dato) % 4;
    if ($relleno) {
        $dato .= str_repeat('=', 4 - $relleno);
    }
    return base64_decode(strtr($dato, '-_', '+/'), true);
}

// ─── Codificación DER ───────────────────────────────────────────────────────
//
// openssl_verify espera claves en PEM y firmas ECDSA en DER. El JWKS entrega
// las claves como números en base64url y la firma viene como r‖s en crudo, así
// que hay que armar las estructuras ASN.1 a mano. Son pocas y bien definidas.

/** Longitud DER: corta (<128) o larga con prefijo de bytes. */
function derLongitud(int $n): string
{
    if ($n < 128) {
        return chr($n);
    }
    $bytes = '';
    while ($n > 0) {
        $bytes = chr($n & 0xFF) . $bytes;
        $n >>= 8;
    }
    return chr(0x80 | strlen($bytes)) . $bytes;
}

/**
 * INTEGER de DER a partir de un entero sin signo en binario.
 * Se quitan los ceros a la izquierda y se antepone 0x00 si el bit más alto
 * está encendido: sin eso, DER lo interpretaría como un número negativo.
 */
function derEntero(string $bin): string
{
    $bin = ltrim($bin, "\x00");
    if ($bin === '') {
        $bin = "\x00";
    }
    if (ord($bin[0]) & 0x80) {
        $bin = "\x00" . $bin;
    }
    return "\x02" . derLongitud(strlen($bin)) . $bin;
}

/** SEQUENCE de DER. */
function derSecuencia(string $contenido): string
{
    return "\x30" . derLongitud(strlen($contenido)) . $contenido;
}

/** Envuelve un DER en PEM de clave pública. */
function derAPem(string $der): string
{
    return "-----BEGIN PUBLIC KEY-----\n"
         . chunk_split(base64_encode($der), 64, "\n")
         . "-----END PUBLIC KEY-----\n";
}

// ─── JWK → PEM ──────────────────────────────────────────────────────────────

/**
 * Clave EC P-256 en formato JWK → PEM.
 *
 * La cabecera SubjectPublicKeyInfo de una P-256 es siempre la misma secuencia
 * de bytes (los OID de ecPublicKey y prime256v1, más la cabecera del BIT
 * STRING y el 0x04 de «punto sin comprimir»), así que se escribe como
 * constante y solo se le añaden las coordenadas X e Y de 32 bytes cada una.
 */
function jwkEcAPem(array $jwk): ?string
{
    if (($jwk['crv'] ?? '') !== 'P-256') {
        return null;   // Supabase usa P-256; otra curva necesitaría otro OID
    }
    $x = jwtBase64UrlDecode($jwk['x'] ?? '');
    $y = jwtBase64UrlDecode($jwk['y'] ?? '');
    if ($x === false || $y === false || strlen($x) !== 32 || strlen($y) !== 32) {
        return null;
    }
    $cabecera = hex2bin('3059301306072a8648ce3d020106082a8648ce3d03010703420004');
    return derAPem($cabecera . $x . $y);
}

/** Clave RSA en formato JWK → PEM. */
function jwkRsaAPem(array $jwk): ?string
{
    $n = jwtBase64UrlDecode($jwk['n'] ?? '');
    $e = jwtBase64UrlDecode($jwk['e'] ?? '');
    if ($n === false || $e === false || $n === '' || $e === '') {
        return null;
    }
    // AlgorithmIdentifier: OID rsaEncryption + NULL
    $algoritmo = derSecuencia(hex2bin('06092a864886f70d010101') . "\x05\x00");
    $clave     = derSecuencia(derEntero($n) . derEntero($e));
    // BIT STRING con 0 bits sin usar, envolviendo la clave
    $bitString = "\x03" . derLongitud(strlen($clave) + 1) . "\x00" . $clave;
    return derAPem(derSecuencia($algoritmo . $bitString));
}

// ─── JWKS con caché en disco ────────────────────────────────────────────────

/**
 * Descarga el JWKS del proyecto.
 * Devuelve null si no se puede: quien llama decide si tira de caché vencida.
 */
function jwksDescargar(string $url): ?array
{
    $cuerpo = false;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 6,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);
        $cuerpo = curl_exec($ch);
        $codigo = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($codigo !== 200) {
            $cuerpo = false;
        }
    } else {
        $contexto = stream_context_create(['http' => ['timeout' => 6]]);
        $cuerpo = @file_get_contents($url, false, $contexto);
    }

    if ($cuerpo === false) {
        return null;
    }
    $datos = json_decode($cuerpo, true);
    return (is_array($datos) && !empty($datos['keys'])) ? $datos : null;
}

/**
 * Devuelve la clave del JWKS cuyo `kid` coincide.
 *
 * Estrategia de caché:
 *   · Se sirve del archivo si tiene menos de 6 horas.
 *   · Si el `kid` buscado no está —señal de que Supabase rotó la clave—, se
 *     fuerza una descarga, pero como mucho una por minuto. Sin ese freno, un
 *     token con `kid` inventado provocaría una descarga por petición, que es
 *     un amplificador de denegación de servicio de manual.
 *   · Si la descarga falla y hay caché vencida, se usa igualmente: una firma
 *     verificada con una clave de hace ocho horas es mucho mejor que dejar sin
 *     servicio a los empleados en territorio porque el JWKS no respondió.
 */
function jwksBuscarClave(string $kid, string $urlJwks, string $dirCache): ?array
{
    $archivo = rtrim($dirCache, '/\\') . '/jwks.json';
    $sello   = rtrim($dirCache, '/\\') . '/jwks.intento';

    $cache = null;
    if (is_file($archivo)) {
        $contenido = @file_get_contents($archivo);
        $decodificado = $contenido === false ? null : json_decode($contenido, true);
        if (is_array($decodificado) && !empty($decodificado['keys'])) {
            $cache = $decodificado;
        }
    }

    $buscar = function (?array $jwks) use ($kid): ?array {
        if (!$jwks) {
            return null;
        }
        foreach ($jwks['keys'] as $clave) {
            if (($clave['kid'] ?? null) === $kid) {
                return $clave;
            }
        }
        return null;
    };

    $encontrada = $buscar($cache);
    $edad = is_file($archivo) ? (time() - (int) @filemtime($archivo)) : PHP_INT_MAX;

    // Se descarga si no está la clave, o si la caché ya tiene sus horas.
    if ($encontrada === null || $edad > 21600) {
        $ultimoIntento = is_file($sello) ? (int) @filemtime($sello) : 0;
        if (time() - $ultimoIntento >= 60) {
            if (!is_dir($dirCache)) {
                @mkdir($dirCache, 0700, true);
                @file_put_contents(
                    rtrim($dirCache, '/\\') . '/.htaccess',
                    "Require all denied\n<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\n"
                );
            }
            @touch($sello);

            $fresco = jwksDescargar($urlJwks);
            if ($fresco !== null) {
                @file_put_contents($archivo, json_encode($fresco), LOCK_EX);
                $encontrada = $buscar($fresco);
            }
        }
    }

    return $encontrada;
}

// ─── Verificación del token ─────────────────────────────────────────────────

/**
 * Verifica un JWT de Supabase y devuelve su payload, o null si no es válido.
 *
 * @param string      $token       el JWT en crudo
 * @param string      $urlProyecto https://<ref>.supabase.co (sin barra final)
 * @param string      $dirCache    carpeta privada donde cachear el JWKS
 * @param string|null $secretoHs   secreto legacy, solo si aún se emiten HS256
 */
function verificarJwtSupabase(string $token, string $urlProyecto, string $dirCache, $secretoHs = null): ?array
{
    $partes = explode('.', $token);
    if (count($partes) !== 3) {
        return null;
    }
    list($cabecera64, $carga64, $firma64) = $partes;

    $cabecera = json_decode((string) jwtBase64UrlDecode($cabecera64), true);
    if (!is_array($cabecera)) {
        return null;
    }
    $alg = isset($cabecera['alg']) ? $cabecera['alg'] : '';
    $kid = isset($cabecera['kid']) ? $cabecera['kid'] : '';

    $firmado = $cabecera64 . '.' . $carga64;
    $firma   = jwtBase64UrlDecode($firma64);
    if ($firma === false) {
        return null;
    }

    if ($alg === 'HS256') {
        // Solo si el proyecto todavía emite tokens simétricos. Sin secreto
        // configurado se rechaza: aceptar HS256 «por si acaso» sería aceptar
        // una firma que no se puede comprobar.
        if (!is_string($secretoHs) || $secretoHs === '' ) {
            return null;
        }
        $esperada = hash_hmac('sha256', $firmado, $secretoHs, true);
        if (!hash_equals($esperada, $firma)) {
            return null;   // comparación en tiempo constante
        }
    } elseif ($alg === 'ES256' || $alg === 'RS256') {
        if ($kid === '' || !extension_loaded('openssl')) {
            return null;
        }
        $jwk = jwksBuscarClave($kid, rtrim($urlProyecto, '/') . '/auth/v1/.well-known/jwks.json', $dirCache);
        if ($jwk === null) {
            return null;
        }

        if ($alg === 'ES256') {
            $pem = jwkEcAPem($jwk);
            // La firma JWS de ES256 son r y s concatenadas, 32 bytes cada una;
            // openssl espera la codificación DER de esos dos enteros.
            if ($pem === null || strlen($firma) !== 64) {
                return null;
            }
            $firmaDer = derSecuencia(
                derEntero(substr($firma, 0, 32)) . derEntero(substr($firma, 32, 32))
            );
        } else {
            $pem = jwkRsaAPem($jwk);
            if ($pem === null) {
                return null;
            }
            $firmaDer = $firma;   // RS256 ya viene en el formato que espera openssl
        }

        $clave = openssl_pkey_get_public($pem);
        if ($clave === false) {
            return null;
        }
        $ok = openssl_verify($firmado, $firmaDer, $clave, OPENSSL_ALGO_SHA256);
        // openssl_free_key está obsoleta en PHP 8 y es innecesaria: el
        // recurso/objeto se libera solo al salir del ámbito.
        if ($ok !== 1) {
            return null;
        }
    } else {
        // Cualquier otro algoritmo, incluido «none», se rechaza sin mirar.
        return null;
    }

    $carga = json_decode((string) jwtBase64UrlDecode($carga64), true);
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
