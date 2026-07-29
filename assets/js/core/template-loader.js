// Cargador de plantillas HTML puras (una por componente) servidas como
// archivos estáticos en `assets/templates/`. Separa el marcado del resto
// de la lógica, manteniendo cada vista modular y legible.
//
// NOTA: las plantillas se obtienen con fetch(), por lo que el proyecto
// debe servirse por HTTP (no funciona abriéndolo como file://).

async function cargarPlantilla(nombre) {
  try {
    const res = await fetch(`assets/templates/${nombre}.html`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    console.error(`Error cargando la plantilla "${nombre}":`, e);
    return `<div class="p-6 text-sm text-red-600">No se pudo cargar la plantilla ` +
      `<code>${nombre}</code>. Asegúrate de servir el proyecto por HTTP (no file://).</div>`;
  }
}

// Recibe el registro de componentes y devuelve un mapa { plantilla: html }.
export async function cargarTodasLasPlantillas(registro) {
  const entradas = await Promise.all(
    Object.entries(registro).map(async ([nombre, info]) => [info.tpl, await cargarPlantilla(info.tpl)])
  );
  return Object.fromEntries(entradas);
}
