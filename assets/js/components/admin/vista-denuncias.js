// ============================================================
// COMPONENTE: Gestión de Denuncias
// Listado completo de incidencias en tabla con paginación, filtros
// y panel de detalles.
//
// Fase 3: la tabla, el modal y los campos de filtro pasan a las primitivas
// (`ui-tabla`, `ui-modal`, `ui-input`, `ui-select`). La vista se queda con lo
// que es suyo —filtrar, ordenar, paginar y exportar— y deja de repetir markup.
// ============================================================
import { ref, computed, watch, onMounted, onUnmounted } from '../../core/vue.js';
import { useDenuncias } from '../../stores/denuncias.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { useGestionCasos } from '../../stores/gestion-casos.js';
import { useCuadrillas } from '../../stores/cuadrillas.js';
import { usePermisos } from '../../stores/permisos.js';
// badge.js es la fuente única de estados. Esta vista tenía su propia copia y en
// ella faltaba `en_revision`, así que ese estado se pintaba como "Desconocido".
// `colorEstado` y no `badgeEstado`: la plantilla ya pone su propio tamaño.
import { colorEstado as badgeEstado, etiquetaEstado, estadosPosibles } from '../../utils/badge.js';

const COLUMNAS = [
  { clave: 'id',         titulo: 'ID',            ordenable: true, mono: true, ancho: '90px' },
  { clave: 'created_at', titulo: 'Fecha y hora',  ordenable: true, ancho: '170px' },
  { clave: 'tipo_id',    titulo: 'Categoría',     ordenable: true, ancho: '220px' },
  { clave: 'direccion',  titulo: 'Ubicación',     ordenable: true },
  { clave: 'estado',     titulo: 'Estado',        ordenable: true, ancho: '140px' },
  { clave: 'acciones',   titulo: 'Acciones',      alineacion: 'centro', ancho: '90px' },
];

export default {
  name: 'vista-denuncias',
  setup() {
    const {
      denuncias, cargandoDenuncias, cargarDenuncias,
      // La tabla pagina en el cliente sobre lo ya descargado, así que hace
      // falta poder decir cuánto falta y poder traerlo.
      hayMasCasos, totalCasos, cargarMasCasos,
      obtenerCasoPorId, buscarCasosServidor, limpiarBusquedaServidor,
      resultadosBusqueda, buscandoServidor, totalCoincidencias, cargandoMas,
    } = useDenuncias();
    const { tiposDenuncia, flujoDeCategoria, departamentos } = useCatalogos();
    const {
      guardando, historial, cargandoHistorial,
      asignarCaso, cambiarEstadoCaso, cargarHistorial,
      derivarCaso, cargarDerivaciones, derivaciones,
    } = useGestionCasos();
    // Se reutiliza el store de cuadrillas en lugar de volver a consultar
    // personal y equipos: su estado es de módulo, así que la carga se comparte
    // con la pantalla de Cuadrillas y no se repite.
    const { cuadrillasAsignables, personal, cargarCuadrillas } = useCuadrillas();
    const { puedeEditar } = usePermisos();

    const puedeGestionar = computed(() => puedeEditar('casos'));

    // Filtros
    const busqueda = ref('');
    const filtroEstado = ref('todos');
    const filtroCategoria = ref('todas');

    // Orden. Vive aquí y no dentro de `ui-tabla` porque hay que ordenar el
    // conjunto filtrado ENTERO antes de cortar la página: si ordenara la tabla,
    // solo reordenaría las 10 filas que ya está mostrando.
    const ordenPor = ref('created_at');
    const ordenAsc = ref(false);

    const seleccion = ref([]);

    // El selector necesita {valor, texto}: `estadosPosibles` son códigos crudos
    // (`en_revision`) y mostrarlos tal cual obligaría al operador a traducir
    // mentalmente el vocabulario interno del sistema.
    const estadosOpciones = computed(() =>
      estadosPosibles.map((codigo) => ({ id: codigo, nombre: etiquetaEstado(codigo) }))
    );

    const denunciasFiltradas = computed(() => {
      /* Cuando la búsqueda del servidor está activa, ELLA es la lista: ya
         llegó filtrada contra la base entera, no contra la ventana cargada.
         Volver a filtrar aquí solo podría quitar resultados legítimos. */
      let lista;
      if (resultadosBusqueda.value !== null) {
        lista = resultadosBusqueda.value;
      } else {
        lista = denuncias.value || [];

        if (filtroEstado.value !== 'todos') {
          lista = lista.filter(d => d.estado === filtroEstado.value);
        }

        if (filtroCategoria.value !== 'todas') {
          lista = lista.filter(d => d.tipo_id === filtroCategoria.value);
        }

        if (busqueda.value.trim()) {
          const q = busqueda.value.toLowerCase();
          lista = lista.filter(d =>
            (d.direccion && d.direccion.toLowerCase().includes(q)) ||
            (d.descripcion && d.descripcion.toLowerCase().includes(q)) ||
            (d.id.toString().includes(q))
          );
        }
      }

      const clave = ordenPor.value;
      const signo = ordenAsc.value ? 1 : -1;
      // Copia antes de ordenar: `sort` muta el array, y el que llega aquí es el
      // del store — reordenarlo cambiaría también el orden del mapa y del
      // dashboard sin que nadie lo haya pedido.
      return [...lista].sort((a, b) => {
        if (clave === 'created_at') return (new Date(a.created_at) - new Date(b.created_at)) * signo;
        if (clave === 'tipo_id') {
          return getCategoria(a.tipo_id).nombre
            .localeCompare(getCategoria(b.tipo_id).nombre, 'es') * signo;
        }
        const x = a[clave], y = b[clave];
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * signo;
        return String(x ?? '').localeCompare(String(y ?? ''), 'es', { numeric: true }) * signo;
      });
    });

    // Paginación
    const paginaActual = ref(1);
    const itemsPorPagina = ref(parseInt(localStorage.getItem('tamano_pagina_denuncias_admin') || '10'));

    const paginasTotales = computed(() =>
      Math.max(1, Math.ceil(denunciasFiltradas.value.length / itemsPorPagina.value))
    );

    const paginaDenuncias = computed(() => {
      const inicio = (paginaActual.value - 1) * itemsPorPagina.value;
      return denunciasFiltradas.value.slice(inicio, inicio + itemsPorPagina.value);
    });

    // Al filtrar estando en una página alta, el resultado cabía en menos páginas
    // y la tabla se quedaba vacía sin explicación. Cualquier cambio de filtro
    // vuelve a la primera página.
    /* Si la base tiene más casos que la lista y hay filtros activos, filtrar
       localmente miente por omisión: la búsqueda pasa al servidor, espaciada
       para no disparar una consulta por tecla. Sin filtros —o con todo ya
       cargado— manda la lista viva de siempre. */
    let temporizadorBusqueda = null;
    watch([busqueda, filtroEstado, filtroCategoria], () => {
      paginaActual.value = 1;
      clearTimeout(temporizadorBusqueda);

      const hayFiltro = busqueda.value.trim() !== ''
        || filtroEstado.value !== 'todos'
        || filtroCategoria.value !== 'todas';

      if (!hayFiltro || !hayMasCasos.value) {
        limpiarBusquedaServidor();
        return;
      }

      temporizadorBusqueda = setTimeout(() => {
        buscarCasosServidor({
          texto: busqueda.value,
          estado: filtroEstado.value !== 'todos' ? filtroEstado.value : '',
          categoria: filtroCategoria.value !== 'todas' ? filtroCategoria.value : '',
        });
      }, 350);
    });
    onUnmounted(() => clearTimeout(temporizadorBusqueda));

    function cambiarPagina(p) {
      if (p >= 1 && p <= paginasTotales.value) {
        paginaActual.value = p;
      }
    }

    function cambiarTamanoPagina(nuevoTamano) {
      itemsPorPagina.value = nuevoTamano;
      localStorage.setItem('tamano_pagina_denuncias_admin', nuevoTamano);
      paginaActual.value = 1; // Resetear a primera página
    }

    function ordenar({ clave, asc }) {
      if (clave === 'acciones') return;
      ordenPor.value = clave;
      ordenAsc.value = asc;
    }

    // Helpers
    function getCategoria(tipo_id) {
      const cat = (tiposDenuncia.value || []).find(t => t.id === tipo_id);
      // '#gray-500' no es un color CSS válido: el `backgroundColor` inline se
      // descartaba y el icono quedaba sin fondo. Se usa el gris real.
      return cat || { nombre: 'Desconocido', color_hex: '#6b7280', icono: 'fa-question' };
    }

    /** Convierte una lista de denuncias en un CSV y lo descarga. */
    function descargarCSV(filas, sufijo) {
      // Cualquier campo puede traer comas, comillas o saltos de línea escritos
      // por un ciudadano: se entrecomilla siempre y se duplican las comillas.
      const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

      const cabeceras = ['ID', 'Correlativo', 'Fecha', 'Categoria', 'Estado', 'Distrito', 'Direccion', 'Descripcion'];
      const cuerpo = filas.map((d) => [
        d.id,
        d.correlativo || '',
        d.created_at ? new Date(d.created_at).toLocaleString('es-SV') : '',
        getCategoria(d.tipo_id).nombre,
        etiquetaEstado(d.estado),
        d.distrito || '',
        d.direccion || '',
        d.descripcion || '',
      ].map(csv).join(','));

      // El BOM es lo que hace que Excel en español abra el archivo en UTF-8;
      // sin él, las tildes de los nombres de distrito salen corruptas.
      const blob = new Blob(['﻿' + [cabeceras.map(csv).join(','), ...cuerpo].join('\r\n')],
                            { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `denuncias${sufijo}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      URL.revokeObjectURL(url);   // sin esto el blob queda retenido en memoria
    }

    // Exporta lo que el usuario está viendo: los filtros aplicados, no la tabla
    // completa. Es la expectativa del botón, y evita volcar casos que la RLS
    // recortó del listado.
    function exportarCSV() {
      const filas = denunciasFiltradas.value;
      if (!filas.length) {
        alert('No hay denuncias que exportar con los filtros actuales.');
        return;
      }
      descargarCSV(filas, '');
    }

    function exportarSeleccion() {
      const ids = new Set(seleccion.value);
      const filas = denunciasFiltradas.value.filter((d) => ids.has(d.id));
      if (!filas.length) return;
      descargarCSV(filas, '_seleccion');
    }

    function limpiarSeleccion() {
      seleccion.value = [];
    }

    function formatearFecha(isoStr) {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      return d.toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
             d.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
    }

    const formatearId = (id) => '#' + String(id).padStart(5, '0');

    // ── Modal de detalle y gestión ────────────────────────────────────────
    // Se guarda el ID y no el objeto. Tras cada operación el store recarga los
    // casos y REEMPLAZA las filas: una referencia al objeto viejo seguiría
    // mostrando el estado anterior al cambio que se acaba de hacer.
    const casoAbiertoId = ref(null);
    const denunciaSeleccionada = computed(() =>
      (denuncias.value || []).find((d) => d.id === casoAbiertoId.value) || null
    );

    // Borrador del formulario de gestión. Separado de la denuncia para que
    // cerrar el modal sin guardar no deje cambios a medias en el store.
    const gestion = ref({ usuarioId: '', cuadrillaId: '', estado: '', observacion: '', resolucion: '' });
    const errorGestion = ref('');
    const avisoGestion = ref('');

    function sincronizarBorrador() {
      const d = denunciaSeleccionada.value;
      gestion.value = {
        usuarioId: d?.responsable || '',
        cuadrillaId: d?.cuadrilla || '',
        estado: d?.estado || '',
        observacion: '',
        resolucion: '',
      };
    }

    function abrirDetalle(denuncia) {
      errorGestion.value = '';
      avisoGestion.value = '';
      casoAbiertoId.value = denuncia.id;
      sincronizarBorrador();
      cargarHistorial(denuncia.id);
      cargarDerivaciones(denuncia.id);
      derivacion.value = { departamentoId: '', motivo: '' };
      panelDerivar.value = false;

      const ruta = '#/denuncias/' + denuncia.id;
      if (location.hash !== ruta) location.hash = ruta;
    }

    function cerrarDetalle() {
      casoAbiertoId.value = null;
      historial.value = [];
      derivaciones.value = [];
    }

    /* ── Enlace profundo: #/denuncias/:id ─────────────────────────────────
       El detalle vivía solo en memoria: no se podía compartir «mira este
       caso», el botón Atrás del teléfono cerraba la aplicación en vez del
       modal, y un F5 perdía el contexto. El hash es la dirección del caso:
       abrir el detalle lo escribe, Atrás lo quita (y el cambio cierra el
       modal), y entrar con él pegado en la barra abre el caso directo. */
    const RE_HASH_CASO = /^#\/denuncias\/(\d+)$/;

    function pedirCierre() {
      if (RE_HASH_CASO.test(location.hash)) {
        // Atrás: dispara `hashchange`, que es quien limpia el estado. Así el
        // historial no acumula una entrada muerta por cada caso visto.
        history.back();
      } else {
        cerrarDetalle();
      }
    }

    async function procesarHash() {
      const m = location.hash.match(RE_HASH_CASO);
      if (!m) {
        if (casoAbiertoId.value !== null) cerrarDetalle();
        return;
      }
      const id = Number(m[1]);
      if (casoAbiertoId.value === id) return;
      const caso = await obtenerCasoPorId(id);
      if (caso) {
        abrirDetalle(caso);
      } else {
        // No existe o RLS no lo deja ver: se limpia la dirección para no
        // dejar un enlace que parece válido y no abre nada.
        avisoGestion.value = '';
        errorGestion.value = '';
        history.replaceState(null, '', location.pathname + location.search);
      }
    }

    onMounted(() => {
      window.addEventListener('hashchange', procesarHash);
      procesarHash();
    });
    onUnmounted(() => window.removeEventListener('hashchange', procesarHash));

    /** Estados que ofrece el flujo de la categoría del caso abierto. */
    const estadosDelCaso = computed(() => {
      const d = denunciaSeleccionada.value;
      if (!d) return [];
      const flujo = flujoDeCategoria(d.tipo_id);
      // Sin flujo cargado se cae al vocabulario por defecto de migration_v9, que
      // es el que tienen las 17 categorías base.
      return flujo.length
        ? flujo.map((e) => ({ id: e.id, nombre: e.nombre || etiquetaEstado(e.id), esFinal: e.es_final === true }))
        : estadosPosibles.map((c) => ({ id: c, nombre: etiquetaEstado(c), esFinal: c === 'resuelta' || c === 'rechazada' }));
    });

    /** El estado elegido cierra el caso: entonces la resolución es obligatoria. */
    const cierraElCaso = computed(() =>
      !!estadosDelCaso.value.find((e) => e.id === gestion.value.estado && e.esFinal)
    );

    const hayCambioDeAsignacion = computed(() => {
      const d = denunciaSeleccionada.value;
      if (!d) return false;
      return (gestion.value.usuarioId || null) !== (d.responsable || null)
          || String(gestion.value.cuadrillaId || '') !== String(d.cuadrilla || '');
    });

    const hayCambioDeEstado = computed(() => {
      const d = denunciaSeleccionada.value;
      return !!d && !!gestion.value.estado && gestion.value.estado !== d.estado;
    });

    /** Nombre presentable de quien figura como responsable. */
    const nombreDePersona = (id) => {
      if (!id) return '';
      const u = (personal.value || []).find((p) => p.id === id);
      return u ? u.nombreCompleto : 'Usuario no disponible';
    };

    const nombreDeCuadrilla = (id) => {
      if (!id) return '';
      const c = (cuadrillasAsignables.value || []).find((x) => String(x.id) === String(id));
      return c ? c.nombre : 'Cuadrilla no disponible';
    };

    /**
     * Tras una operación hay que releer: la RPC escribió en el servidor y el
     * store todavía tiene la fila anterior. Realtime también lo haría, pero
     * depender de él dejaría la pantalla desactualizada si el canal está caído,
     * y quien acaba de pulsar un botón espera ver el resultado.
     */
    async function refrescarTrasOperacion(mensaje) {
      await cargarDenuncias();
      await cargarHistorial(casoAbiertoId.value);
      sincronizarBorrador();
      avisoGestion.value = mensaje;
    }

    /* ── Derivar a otra unidad ────────────────────────────────────────────
       Va en un panel que hay que abrir, no a la vista. Mover un caso de
       departamento es poco frecuente y difícil de deshacer —queda en el
       historial para siempre—, así que no debe compartir espacio con los
       controles del día a día. */
    const panelDerivar = ref(false);
    const derivacion = ref({ departamentoId: '', motivo: '' });

    /* La unidad actual no se ofrece: derivar a donde ya está es el error que
       más veces se comete con un desplegable de departamentos. */
    const unidadesDestino = computed(() => {
      const actual = denunciaSeleccionada.value?.departamento_id ?? null;
      return (departamentos.value || [])
        .filter((d) => d.activo !== false && d.id !== actual)
        .map((d) => ({ id: d.id, nombre: d.nombre }));
    });

    const nombreUnidadActual = computed(() => {
      const actual = denunciaSeleccionada.value?.departamento_id ?? null;
      if (actual == null) return 'Sin unidad asignada';
      const d = (departamentos.value || []).find((x) => x.id === actual);
      return d?.nombre || ('Unidad ' + actual);
    });

    const puedeDerivar = computed(() =>
      Boolean(derivacion.value.departamentoId)
      && derivacion.value.motivo.trim().length >= 10
    );

    async function confirmarDerivacion() {
      if (guardando.value || !puedeDerivar.value) return;
      errorGestion.value = '';
      avisoGestion.value = '';

      const res = await derivarCaso({
        casoId: casoAbiertoId.value,
        departamentoDestinoId: derivacion.value.departamentoId,
        motivo: derivacion.value.motivo,
      });
      if (!res.ok) { errorGestion.value = res.error; return; }

      panelDerivar.value = false;
      derivacion.value = { departamentoId: '', motivo: '' };
      await cargarDerivaciones(casoAbiertoId.value);
      /* Se dice que la asignación se retiró. Es un efecto que el operador no
         pidió y que, callado, parece que el sistema perdió el dato. */
      await refrescarTrasOperacion(
        (res.mensaje || 'Caso derivado.')
        + (res.asignacion_retirada ? ' Se retiró la asignación anterior.' : '')
      );
    }

    async function guardarAsignacion() {
      if (guardando.value) return;
      errorGestion.value = '';
      avisoGestion.value = '';
      const res = await asignarCaso({
        casoId: casoAbiertoId.value,
        usuarioId: gestion.value.usuarioId || null,
        cuadrillaId: gestion.value.cuadrillaId || null,
        observacion: gestion.value.observacion,
      });
      if (!res.ok) { errorGestion.value = res.error; return; }
      await refrescarTrasOperacion(res.resultado?.mensaje || 'Asignación guardada.');
    }

    async function guardarEstado() {
      if (guardando.value) return;
      errorGestion.value = '';
      avisoGestion.value = '';
      // El servidor lo vuelve a comprobar; esto solo evita el viaje de ida y
      // vuelta para recibir el mismo mensaje.
      if (cierraElCaso.value && !gestion.value.resolucion.trim()
          && !denunciaSeleccionada.value?.resolucion) {
        errorGestion.value = 'Para cerrar el caso hay que registrar cómo se resolvió.';
        return;
      }
      const res = await cambiarEstadoCaso({
        casoId: casoAbiertoId.value,
        estado: gestion.value.estado,
        observacion: gestion.value.observacion,
        resolucion: gestion.value.resolucion,
      });
      if (!res.ok) { errorGestion.value = res.error; return; }
      await refrescarTrasOperacion(res.resultado?.mensaje || 'Estado actualizado.');
    }

    // Los selectores de personal y cuadrillas se alimentan del store de
    // cuadrillas; si esta pantalla se abre primero, hay que pedirlos aquí.
    onMounted(() => { cargarCuadrillas(); });

    return {
      COLUMNAS, cargandoDenuncias,
      denuncias, hayMasCasos, totalCasos, cargarMasCasos, cargandoMas,
      busqueda, filtroEstado, filtroCategoria,
      tiposDenuncia, denunciasFiltradas,
      paginaActual, paginasTotales, paginaDenuncias, cambiarPagina,
      itemsPorPagina, cambiarTamanoPagina, ordenar,
      seleccion, exportarSeleccion, limpiarSeleccion,
      getCategoria, badgeEstado, etiquetaEstado, formatearFecha, formatearId,
      denunciaSeleccionada, abrirDetalle, cerrarDetalle, pedirCierre, exportarCSV, estadosOpciones,
      buscandoServidor, totalCoincidencias, resultadosBusqueda,
      // Gestión del caso
      puedeGestionar, gestion, errorGestion, avisoGestion, guardando,
      estadosDelCaso, cierraElCaso, hayCambioDeAsignacion, hayCambioDeEstado,
      cuadrillasAsignables, personal, nombreDePersona, nombreDeCuadrilla,
      guardarAsignacion, guardarEstado,
      historial, cargandoHistorial,
      // Derivación entre unidades
      panelDerivar, derivacion, unidadesDestino, nombreUnidadActual,
      puedeDerivar, confirmarDerivacion, derivaciones,
    };
  }
};
