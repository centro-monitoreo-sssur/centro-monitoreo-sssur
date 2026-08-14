#!/usr/bin/env python3
"""
Servidor de desarrollo que reproduce las reescrituras del .htaccess.

POR QUÉ HACE FALTA

Las tres aplicaciones viven bajo su propia ruta —/panel/, /campo/ y
/ciudadano/— y esas rutas no son carpetas: las inventa Apache con las reglas
de reescritura del .htaccess de la raíz. Live Server y `python -m http.server`
sirven archivos y nada más, así que ahí /campo/ devuelve 404.

`core/app-contexto.js` lo compensa aceptando `?contexto=` en localhost, de modo
que se puede desarrollar sin este servidor. Lo que NO se puede sin él es probar
lo que depende de la ruta:

  · que las tres PWA se puedan instalar por separado (el `scope` de un
    manifiesto se compara por ruta; con las tres en `/` el navegador las trata
    como una sola aplicación ya instalada),
  · que el service worker precachee bien los tres puntos de arranque,
  · que la barra final redirija como debe.

Un fallo en cualquiera de esas tres cosas solo se ve en producción. Este
servidor lo adelanta a la máquina de desarrollo.

USO

    python herramientas/servidor-dev.py            # puerto 8080
    python herramientas/servidor-dev.py 3000

Después, abrir http://127.0.0.1:8080/ — redirige a /panel/.

OJO: el navegador considera «origen seguro» a localhost, así que el service
worker y la instalación de PWA funcionan sin HTTPS.

SUBIDA DE FOTOGRAFÍAS DESDE AQUÍ

Este servidor no ejecuta PHP, así que las subidas siguen yendo al dominio de
producción. Eso las convierte en peticiones de origen cruzado, y el endpoint
solo responde a los orígenes de `ORIGENES_PERMITIDOS` en la configuración de
cPanel. Si al enviar una denuncia aparece en consola

    No 'Access-Control-Allow-Origin' header is present on the requested resource

falta el origen de este servidor en esa lista. Con otro puerto, hay que
añadirlo. Ver cpanel/config-monitoreo.example.php.
"""

import http.server
import os
import re
import socketserver
import sys

RUTAS_APLICACION = ('panel', 'campo', 'ciudadano')
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Lo que es código y por tanto cambia con cada edición. Misma idea que la
# constante `ES_CODIGO` de sw.js, para que los dos criterios no se separen.
CODIGO = re.compile(r'\.(?:js|mjs|css|html|json)$', re.IGNORECASE)


class Manejador(http.server.SimpleHTTPRequestHandler):
    """Aplica, en el mismo orden que el .htaccess, las reglas de la sección 0."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=RAIZ, **kwargs)

    def _redirigir(self, destino):
        self.send_response(302)
        self.send_header('Location', destino)
        self.end_headers()

    def _reescribir(self):
        """Devuelve True si la petición ya quedó resuelta con una redirección."""
        camino = self.path.split('?', 1)[0]

        # RewriteRule ^$ /panel/ [R=302,L]
        if camino == '/':
            self._redirigir('/panel/')
            return True

        tramo = camino.strip('/')

        # RewriteRule ^(panel|campo|ciudadano)$ /$1/ [R=302,L]
        # La barra final no es opcional: sin ella el documento queda FUERA del
        # ámbito de su propio manifiesto y el navegador no ofrece instalar.
        if tramo in RUTAS_APLICACION and not camino.endswith('/'):
            self._redirigir(camino + '/')
            return True

        # RewriteRule ^(panel|campo|ciudadano)/$ /index.html [L]
        # Reescritura interna: la URL NO cambia, que es justo lo que hace válido
        # el ámbito y lo que permite a app-contexto.js saber qué aplicación es.
        if tramo in RUTAS_APLICACION:
            self.path = '/index.html'

        return False

    def do_GET(self):
        if self._reescribir():
            return
        super().do_GET()

    def do_HEAD(self):
        if self._reescribir():
            return
        super().do_HEAD()

    def end_headers(self):
        # Nada de código se cachea en desarrollo.
        #
        # Las PLANTILLAS ya llegaban frescas: `template-loader.js` las pide con
        # `cache: 'no-cache'`. Los MÓDULOS JS no, porque los carga el navegador
        # y aquí no se enviaba ninguna cabecera que se lo impidiera.
        #
        # Esa asimetría produce el peor fallo posible de depurar: una plantilla
        # nueva que invoca algo que el componente viejo todavía no expone, y un
        # «X is not a function» que no se parece en nada a un problema de caché.
        # Pasó de verdad con el botón de visibilidad del catálogo.
        #
        # El service worker no interviene en localhost —se desactiva solo—, así
        # que la única defensa es esta.
        if CODIGO.search(self.path.split('?', 1)[0]):
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()


def main():
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('127.0.0.1', puerto), Manejador) as servidor:
        print(f'Sirviendo {RAIZ}')
        print(f'  http://127.0.0.1:{puerto}/            -> /panel/  Centro de Monitoreo')
        print(f'  http://127.0.0.1:{puerto}/campo/      -> PWA Empleados')
        print(f'  http://127.0.0.1:{puerto}/ciudadano/  -> PWA Población')
        print('Ctrl+C para parar.')
        try:
            servidor.serve_forever()
        except KeyboardInterrupt:
            print('\nDetenido.')


if __name__ == '__main__':
    main()
