// Vista Registro Población: alta de ciudadanos contra Supabase Auth.
//
// Hasta la v32 esto era una simulación: esperaba latencia fingida y escribía
// un objeto en `localStorage`. La cuenta la crea ahora `stores/ciudadano.js`, y
// la ficha en `ciudadanos` la crea el trigger de la base en la misma
// transacción, para que no queden cuentas sin perfil.
import { ref, reactive, computed, onMounted } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';
import { useCatalogos } from '../../stores/catalogos.js';
import { useCiudadano } from '../../stores/ciudadano.js';
import { CONTEXTOS, urlDeContexto } from '../../core/app-contexto.js';

export default {
  setup() {
    const { irA } = useNavegacion();
    const { distritos, cargarDistritos } = useCatalogos();
    const { registrar: registrarCiudadano } = useCiudadano();

    // Los cinco distritos venían escritos a mano en la plantilla, con el
    // NOMBRE como valor, mientras la tabla espera `distrito_id`. Se leen del
    // catálogo real, que es además la regla del proyecto: ninguna vista con
    // datos inventados.
    onMounted(() => {
      if (!distritos.value.length) cargarDistritos();
    });

    const distritosOpciones = computed(() => distritos.value || []);

    // Estado del formulario
    const formulario = reactive({
      nombres: '',
      apellidos: '',
      dui: '',
      dia: '',
      mes: '',
      anio: '',
      genero: '',
      // Guarda el ID del distrito, no su nombre: la tabla `ciudadanos` tiene
      // `distrito_id smallint` con clave foránea. Antes eran cinco opciones
      // escritas a mano con el nombre como valor.
      distrito: '',
      direccion: '',
      telefono: '',
      correo: '',
      // El formulario no pedía contraseña porque no creaba cuenta de verdad.
      clave: '',
      claveRepetida: '',
    });

    // Estado UI
    const cargando = ref(false);
    const errorGeneral = ref('');
    const logoError = ref(false);
    const edadCalculada = ref('');
    const mostrarClave = ref(false);
    // Cuando Supabase exige confirmar el correo, la cuenta queda creada pero
    // sin sesión. El formulario cede el sitio a un aviso en lugar de intentar
    // entrar y fallar.
    const registroCompletado = ref(false);
    
    // Estado del wizard
    const pasoActual = ref(1);
    const totalPasos = ref(3);
    
    // Navegación del wizard
    const siguientePaso = () => {
      if (!validarPasoActual()) return;
      
      if (pasoActual.value < totalPasos.value) {
        pasoActual.value++;
      }
    };
    
    const pasoAnterior = () => {
      if (pasoActual.value > 1) {
        pasoActual.value--;
      }
    };
    
    const cancelarRegistro = () => {
      if (confirm('¿Estás seguro de cancelar el registro? Perderás los datos ingresados.')) {
        // Al login manteniendo el contexto de población. Es una RUTA, no un
        // parámetro: ver RUTAS_CONTEXTO en core/app-contexto.js.
        window.location.href = urlDeContexto(CONTEXTOS.POBLACION);
      }
    };
    
    // Validar paso actual
    const validarPasoActual = () => {
      if (pasoActual.value === 1) {
        // Paso 1: Ubicación
        if (!formulario.distrito) {
          errores.distrito = 'El distrito es requerido';
          return false;
        }
        if (!formulario.direccion.trim()) {
          errores.direccion = 'La dirección es requerida';
          return false;
        }
        return true;
      } else if (pasoActual.value === 2) {
        // Paso 2: Datos personales
        if (!formulario.nombres.trim()) {
          errores.nombres = 'Los nombres son requeridos';
          return false;
        }
        if (!formulario.apellidos.trim()) {
          errores.apellidos = 'Los apellidos son requeridos';
          return false;
        }
        if (!formulario.dui.trim() || !validarFormatoDUI(formulario.dui)) {
          errores.dui = 'DUI inválido (formato: 00000000-0)';
          return false;
        }
        if (!formulario.dia || !formulario.mes || !formulario.anio) {
          errores.fechaNacimiento = 'La fecha de nacimiento es requerida';
          return false;
        } else if (!validarEdad()) {
          errores.fechaNacimiento = 'Debes ser mayor de 18 años';
          return false;
        }
        if (!formulario.genero) {
          errores.genero = 'El género es requerido';
          return false;
        }
        return true;
      } else if (pasoActual.value === 3) {
        // Paso 3: Contacto y acceso
        if (!formulario.telefono.trim() || !validarFormatoTelefono(formulario.telefono)) {
          errores.telefono = 'Teléfono inválido (formato: 0000-0000)';
          return false;
        }
        if (!formulario.correo.trim() || !validarCorreo(formulario.correo)) {
          errores.correo = 'Correo inválido o dominio no permitido';
          return false;
        }
        // Ocho es el mínimo que se exige también al personal, en
        // `stores/usuarios.js`. Supabase admite seis por defecto.
        if (formulario.clave.length < 8) {
          errores.clave = 'La contraseña debe tener al menos 8 caracteres';
          return false;
        }
        if (formulario.clave !== formulario.claveRepetida) {
          errores.claveRepetida = 'Las contraseñas no coinciden';
          return false;
        }
        return true;
      }
      return true;
    };

    // Datos para selectores de fecha
    const dias = Array.from({ length: 31 }, (_, i) => i + 1);
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const anioActual = new Date().getFullYear();
    const anios = Array.from({ length: anioActual - 1920 + 1 }, (_, i) => anioActual - i);
    const errores = reactive({
      nombres: '',
      apellidos: '',
      dui: '',
      fechaNacimiento: '',
      genero: '',
      distrito: '',
      direccion: '',
      telefono: '',
      correo: '',
      clave: '',
      claveRepetida: '',
    });

    // Dominios de correo permitidos
    const dominiosPermitidos =
    [
      'gmail.com',
      'outlook.com',
      'hotmail.com',
      'live.com',
      'yahoo.com',
      'yahoo.es',
      'sansalvadorsur.gob.sv'
    ];

    // Validar formulario
    const validarFormulario = () => {
      let valido = true;

      // Validar nombres
      if (!formulario.nombres.trim()) {
        errores.nombres = 'Los nombres son requeridos';
        valido = false;
      }

      // Validar apellidos
      if (!formulario.apellidos.trim()) {
        errores.apellidos = 'Los apellidos son requeridos';
        valido = false;
      }

      // Validar DUI
      if (!formulario.dui.trim() || !validarFormatoDUI(formulario.dui)) {
        errores.dui = 'DUI inválido (formato: 00000000-0)';
        valido = false;
      }

      // Validar fecha de nacimiento
      if (!formulario.dia || !formulario.mes || !formulario.anio) {
        errores.fechaNacimiento = 'La fecha de nacimiento es requerida';
        valido = false;
      } else if (!validarEdad()) {
        errores.fechaNacimiento = 'Debes ser mayor de 18 años';
        valido = false;
      }

      // Validar género
      if (!formulario.genero) {
        errores.genero = 'El género es requerido';
        valido = false;
      }

      // Validar distrito
      if (!formulario.distrito) {
        errores.distrito = 'El distrito es requerido';
        valido = false;
      }

      // Validar dirección
      if (!formulario.direccion.trim()) {
        errores.direccion = 'La dirección es requerida';
        valido = false;
      }

      // Validar teléfono
      if (!formulario.telefono.trim() || !validarFormatoTelefono(formulario.telefono)) {
        errores.telefono = 'Teléfono inválido (formato: 0000-0000)';
        valido = false;
      }

      // Validar correo
      if (!formulario.correo.trim() || !validarCorreo(formulario.correo)) {
        errores.correo = 'Correo inválido o dominio no permitido';
        valido = false;
      }

      // Validar contraseña. Ocho es el mínimo que se pide también al personal.
      if (formulario.clave.length < 8) {
        errores.clave = 'La contraseña debe tener al menos 8 caracteres';
        valido = false;
      }
      if (formulario.clave !== formulario.claveRepetida) {
        errores.claveRepetida = 'Las contraseñas no coinciden';
        valido = false;
      }

      return valido;
    };

    // Formatear DUI (00000000-0)
    const formatearDUI = (e) => {
      let valor = e.target.value.replace(/\D/g, '');
      if (valor.length > 9) valor = valor.slice(0, 9);
      
      if (valor.length >= 1) {
        valor = valor.slice(0, 8) + '-' + valor.slice(8);
      }
      
      formulario.dui = valor;
      limpiarError('dui');
    };

    // Validar formato DUI
    const validarFormatoDUI = (dui) => {
      const regex = /^\d{8}-\d{1}$/;
      return regex.test(dui);
    };

    // Validar DUI con dígito verificador (algoritmo simplificado)
    const validarDUI = () => {
      if (!formulario.dui) return;
      
      if (!validarFormatoDUI(formulario.dui)) {
        errores.dui = 'DUI inválido (formato: 00000000-0)';
        return;
      }

      // Algoritmo de dígito verificador (simplificado para demo)
      const numeros = formulario.dui.replace('-', '').split('').map(Number);
      const digitoVerificador = numeros.pop();
      
      let suma = 0;
      for (let i = 0; i < 8; i++) {
        suma += numeros[i] * (9 - i);
      }
      
      const resultado = (10 - (suma % 10)) % 10;
      
      if (resultado !== digitoVerificador) {
        errores.dui = 'DUI inválido (dígito verificador incorrecto)';
      }
    };

    // Validar edad (+18 años) con cálculo exacto en años, meses y días
    const validarEdad = () => {
      if (!formulario.dia || !formulario.mes || !formulario.anio) {
        errores.fechaNacimiento = '';
        return false;
      }
      
      const fechaNacimiento = new Date(formulario.anio, formulario.mes - 1, formulario.dia);
      const hoy = new Date();
      
      // Calcular edad exacta
      let años = hoy.getFullYear() - fechaNacimiento.getFullYear();
      let meses = hoy.getMonth() - fechaNacimiento.getMonth();
      let días = hoy.getDate() - fechaNacimiento.getDate();
      
      // Ajustar si los días son negativos
      if (días < 0) {
        meses--;
        const ultimoDiaMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0).getDate();
        días += ultimoDiaMesAnterior;
      }
      
      // Ajustar si los meses son negativos
      if (meses < 0) {
        años--;
        meses += 12;
      }
      
      // Guardar edad calculada para mostrar
      edadCalculada.value = `${años} años, ${meses} meses, ${días} días`;
      
      // Validar si es mayor de 18 años
      const esMayorDeEdad = años >= 18;
      
      if (!esMayorDeEdad) {
        errores.fechaNacimiento = `Debes ser mayor de 18 años para registrarte. Tu edad actual: ${edadCalculada.value}`;
      } else {
        errores.fechaNacimiento = '';
      }
      
      return esMayorDeEdad;
    };

    // Formatear teléfono (0000-0000)
    const formatearTelefono = (e) => {
      let valor = e.target.value.replace(/\D/g, '');
      if (valor.length > 8) valor = valor.slice(0, 8);
      
      if (valor.length >= 4) {
        valor = valor.slice(0, 4) + '-' + valor.slice(4);
      }
      
      formulario.telefono = valor;
      limpiarError('telefono');
    };

    // Validar formato teléfono
    const validarFormatoTelefono = (telefono) => {
      const regex = /^\d{4}-\d{4}$/;
      return regex.test(telefono);
    };

    // Validar correo electrónico
    const validarCorreo = (correo) => {
      const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!regex.test(correo)) return false;
      
      const dominio = correo.split('@')[1].toLowerCase();
      return dominiosPermitidos.includes(dominio);
    };

    // Limpiar error específico
    const limpiarError = (campo) => {
      errores[campo] = '';
      errorGeneral.value = '';
    };

    /**
     * Alta real contra Supabase Auth.
     *
     * Antes esto esperaba 1,5 s de latencia fingida y escribía un objeto en
     * `localStorage`. La denuncia de ese vecino nunca llegaba al Centro de
     * Monitoreo y desaparecía al borrar los datos del navegador.
     *
     * La ficha en `ciudadanos` NO se inserta desde aquí: la crea el trigger de
     * la v32 dentro de la misma transacción que la cuenta. Ver el encabezado de
     * `stores/ciudadano.js`.
     */
    const registrar = async () => {
      errorGeneral.value = '';
      Object.keys(errores).forEach(key => errores[key] = '');

      if (!validarFormulario()) return;

      cargando.value = true;
      try {
        const resultado = await registrarCiudadano({
          correo:    formulario.correo,
          clave:     formulario.clave,
          nombres:   formulario.nombres,
          apellidos: formulario.apellidos,
          dui:       formulario.dui,
          telefono:  formulario.telefono,
          direccion: formulario.direccion,
          genero:    formulario.genero,
          // El selector guardaba el NOMBRE del distrito y la base espera su id.
          distritoId: formulario.distrito || null,
          // La base quiere una fecha ISO; el formulario la pide en tres
          // selectores. `padStart` porque '2026-8-5' no es una fecha válida.
          fechaNacimiento: fechaNacimientoISO(),
        });

        if (!resultado.ok) {
          errorGeneral.value = resultado.error;
          return;
        }

        // Con la confirmación por correo activada, `signUp` crea la cuenta pero
        // no devuelve sesión. Intentar entrar aquí fallaría; hay que decirlo.
        if (resultado.requiereConfirmacion) {
          registroCompletado.value = true;
          return;
        }

        // Con sesión ya abierta, `onAuthStateChange` de navegacion.js resuelve
        // el rol leyendo la ficha recién creada y enruta al portal. No se
        // llama a `setAutenticado` a mano: sería decidir dos veces lo mismo.
        irA('pwa-poblacion');
      } catch (error) {
        errorGeneral.value = 'No se pudo completar el registro. Intenta de nuevo.';
        console.error('[registro] Error inesperado:', error);
      } finally {
        cargando.value = false;
      }
    };

    /** Une los tres selectores en la fecha ISO que espera PostgreSQL. */
    const fechaNacimientoISO = () => {
      if (!formulario.anio || !formulario.mes || !formulario.dia) return '';
      const mes = String(formulario.mes).padStart(2, '0');
      const dia = String(formulario.dia).padStart(2, '0');
      return `${formulario.anio}-${mes}-${dia}`;
    };

    return {
      formulario,
      cargando,
      errorGeneral,
      logoError,
      edadCalculada,
      pasoActual,
      totalPasos,
      siguientePaso,
      pasoAnterior,
      cancelarRegistro,
      errores,
      dias,
      meses,
      anios,
      formatearDUI,
      validarDUI,
      validarEdad,
      formatearTelefono,
      validarCorreo,
      limpiarError,
      registrar,
      // Alta real
      distritosOpciones,
      mostrarClave,
      registroCompletado,
      irAlLogin: () => { window.location.href = urlDeContexto(CONTEXTOS.POBLACION); },
    };
  }
};
