// Vista Registro Población: Onboarding de ciudadanos
// DEMO: Validaciones y registro simulado - reemplazar con API real
import { ref, reactive } from '../../core/vue.js';
import { useNavegacion } from '../../stores/navegacion.js';

export default {
  setup() {
    const { setAutenticado, irA } = useNavegacion();

    // Estado del formulario
    const formulario = reactive({
      nombres: '',
      apellidos: '',
      dui: '',
      dia: '',
      mes: '',
      anio: '',
      genero: '',
      distrito: '',
      direccion: '',
      telefono: '',
      correo: ''
    });

    // Estado UI
    const cargando = ref(false);
    const errorGeneral = ref('');
    const logoError = ref(false);
    const edadCalculada = ref('');
    
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
        // Redirigir al login manteniendo el contexto de población
        window.location.href = window.location.pathname + '?contexto=poblacion';
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
        // Paso 3: Contacto
        if (!formulario.telefono.trim() || !validarFormatoTelefono(formulario.telefono)) {
          errores.telefono = 'Teléfono inválido (formato: 0000-0000)';
          return false;
        }
        if (!formulario.correo.trim() || !validarCorreo(formulario.correo)) {
          errores.correo = 'Correo inválido o dominio no permitido';
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
      correo: ''
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

    // Registrar usuario
    const registrar = async () => {
      // Limpiar errores previos
      errorGeneral.value = '';
      Object.keys(errores).forEach(key => errores[key] = '');

      // Validar formulario
      if (!validarFormulario()) {
        return;
      }

      cargando.value = true;

      // Simular latencia de red (demo)
      // DEMO: Reemplazar con llamada a API real
      await new Promise(resolve => setTimeout(resolve, 1500));

      try {
        // Registro exitoso (demo)
        // DEMO: Guardar en localStorage y asignar rol poblacion
        const nombreCompleto = `${formulario.nombres} ${formulario.apellidos}`;
        
        setAutenticado(true, nombreCompleto, 'poblacion');
        
        // Guardar datos adicionales del ciudadano
        localStorage.setItem('ciudadano_datos', JSON.stringify({
          nombres: formulario.nombres,
          apellidos: formulario.apellidos,
          dui: formulario.dui,
          fechaNacimiento: formulario.fechaNacimiento,
          genero: formulario.genero,
          distrito: formulario.distrito,
          direccion: formulario.direccion,
          telefono: formulario.telefono,
          correo: formulario.correo
        }));

        // Redirigir al mapa del distrito (vista predeterminada para población)
        irA('mapa-distrito');
      } catch (error) {
        errorGeneral.value = 'Error al registrar. Intente nuevamente.';
      } finally {
        cargando.value = false;
      }
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
      registrar
    };
  }
};
