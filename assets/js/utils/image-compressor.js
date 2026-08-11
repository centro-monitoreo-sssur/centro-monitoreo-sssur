// ============================================================
// Compresión de imágenes en el navegador, antes de subirlas.
//
// Es obligatoria por cuota: docs/arquitectura/CONTEXTO_CRITICO.md §3 fija
// 1024×1024, JPEG 0.6 y ≤500 KB para las fotos de campo. Comprimir en el
// cliente además ahorra el ancho de banda de un empleado que trabaja con datos
// móviles en territorio.
//
// Dos salidas para dos usos distintos:
//   · `comprimirImagen`      → DataURL. Para la vista previa en pantalla.
//   · `comprimirImagenABlob` → Blob.    Para subir con FormData.
//
// ⚠ NO son intercambiables. `FormData.append(campo, valor, nombre)` ignora el
//   tercer argumento cuando `valor` es una cadena: un DataURL viaja como campo
//   de texto, no como archivo, y en el servidor `$_FILES` llega vacío. Es un
//   fallo silencioso —el navegador no protesta— y por eso las dos funciones
//   están separadas y documentadas aquí.
// ============================================================

/**
 * Dibuja la imagen redimensionada en un canvas y lo devuelve.
 * Núcleo común de las dos salidas: mantenerlo en un solo sitio evita que la
 * vista previa y el archivo subido acaben con dimensiones distintas.
 */
function dibujarRedimensionada(file, maxWidth, maxHeight) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = (error) => reject(error);
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo no es una imagen legible.'));
      img.onload = () => {
        let { width, height } = img;

        // Se escala por el lado mayor, conservando la relación de aspecto.
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round(height * (maxWidth / width));
            width = maxWidth;
          }
        } else if (height > maxHeight) {
          width = Math.round(width * (maxHeight / height));
          height = maxHeight;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        // Fondo blanco: un PNG con transparencia exportado a JPEG dejaría las
        // zonas transparentes en negro.
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Comprime a JPEG y devuelve un **DataURL** (cadena).
 * Úsalo para mostrar la imagen en pantalla, nunca para subirla.
 */
export const comprimirImagen = (file, maxWidth = 1920, maxHeight = 1920, quality = 0.8) =>
  dibujarRedimensionada(file, maxWidth, maxHeight)
    .then((canvas) => canvas.toDataURL('image/jpeg', quality));

/**
 * Comprime a JPEG y devuelve un **Blob**.
 * Es el que hay que pasar a `FormData` para que llegue como archivo.
 */
export const comprimirImagenABlob = (file, maxWidth = 1920, maxHeight = 1920, quality = 0.8) =>
  dibujarRedimensionada(file, maxWidth, maxHeight).then(
    (canvas) =>
      new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            // `toBlob` entrega null si el navegador no puede codificar el tipo
            // pedido. Sin esta comprobación se subiría `null` y el servidor
            // respondería un 400 que nadie sabría explicar.
            if (blob) resolve(blob);
            else reject(new Error('El navegador no pudo generar la imagen comprimida.'));
          },
          'image/jpeg',
          quality
        );
      })
  );

/**
 * Comprime y devuelve las dos formas de una vez.
 * Evita dibujar el canvas dos veces cuando hacen falta la vista previa y el
 * archivo, que es el caso de cualquier formulario con adjuntos.
 */
export const comprimirImagenDual = (file, maxWidth = 1920, maxHeight = 1920, quality = 0.8) =>
  dibujarRedimensionada(file, maxWidth, maxHeight).then(
    (canvas) =>
      new Promise((resolve, reject) => {
        const vistaPrevia = canvas.toDataURL('image/jpeg', quality);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve({ vistaPrevia, archivo: blob });
            else reject(new Error('El navegador no pudo generar la imagen comprimida.'));
          },
          'image/jpeg',
          quality
        );
      })
  );
