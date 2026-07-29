// Validación de denuncias duplicadas
// DEMO: Funcionalidad simulada - reemplazar con API real cuando se conecte backend
import { calcularDistancia, formatearDistancia } from './geofencing.js';

/**
 * Configuración para detección de duplicados
 */
const CONFIG = {
  radioDuplicado: 50, // metros
  ventanaTemporal: 24, // horas
};

/**
 * Resultado de validación de duplicado
 * @typedef {Object} ResultadoDuplicado
 * @property {boolean} esDuplicado - True si se detectó duplicado
 * @property {Array} denunciasSimilares - Lista de denuncias similares encontradas
 * @property {string} mensaje - Mensaje descriptivo
 */

/**
 * Valida si una nueva denuncia es duplicada de existentes
 * @param {Object} nuevaDenuncia - Nueva denuncia a validar
 * @param {Array} denunciasExistentes - Lista de denuncias existentes
 * @param {Object} opciones - Opciones de configuración (opcional)
 * @returns {ResultadoDuplicado}
 */
export function validarDenunciaDuplicada(nuevaDenuncia, denunciasExistentes, opciones = {}) {
  const config = { ...CONFIG, ...opciones };
  
  if (!nuevaDenuncia || !nuevaDenuncia.lat || !nuevaDenuncia.lng) {
    return {
      esDuplicado: false,
      denunciasSimilares: [],
      mensaje: 'Coordenadas inválidas'
    };
  }

  if (!denunciasExistentes || denunciasExistentes.length === 0) {
    return {
      esDuplicado: false,
      denunciasSimilares: [],
      mensaje: 'No hay denuncias existentes para comparar'
    };
  }

  const ahora = new Date();
  const ventanaMs = config.ventanaTemporal * 60 * 60 * 1000;
  
  const denunciasSimilares = denunciasExistentes.filter(denuncia => {
    // Validar que tenga coordenadas
    if (!denuncia.lat || !denuncia.lng) return false;
    
    // Calcular distancia
    const distancia = calcularDistancia(
      nuevaDenuncia.lat,
      nuevaDenuncia.lng,
      denuncia.lat,
      denuncia.lng
    );
    
    // Verificar si está dentro del radio
    if (distancia > config.radioDuplicado) return false;
    
    // Verificar si está dentro de la ventana temporal
    const fechaDenuncia = new Date(denuncia.created_at || denuncia.fecha);
    const diffTiempo = ahora - fechaDenuncia;
    
    return diffTiempo <= ventanaMs;
  });

  if (denunciasSimilares.length === 0) {
    return {
      esDuplicado: false,
      denunciasSimilares: [],
      mensaje: 'No se encontraron denuncias similares'
    };
  }

  // Ordenar por distancia (más cercana primero)
  denunciasSimilares.sort((a, b) => {
    const distA = calcularDistancia(nuevaDenuncia.lat, nuevaDenuncia.lng, a.lat, a.lng);
    const distB = calcularDistancia(nuevaDenuncia.lat, nuevaDenuncia.lng, b.lat, b.lng);
    return distA - distB;
  });

  // Calcular distancia a la más cercana
  const distanciaCercana = calcularDistancia(
    nuevaDenuncia.lat,
    nuevaDenuncia.lng,
    denunciasSimilares[0].lat,
    denunciasSimilares[0].lng
  );

  return {
    esDuplicado: true,
    denunciasSimilares,
    mensaje: `Se encontraron ${denunciasSimilares.length} denuncia(s) similar(es) a ${formatearDistancia(distanciaCercana)} de distancia`
  };
}

/**
 * Valida si una denuncia es duplicada por tipo específico
 * @param {Object} nuevaDenuncia - Nueva denuncia a validar
 * @param {Array} denunciasExistentes - Lista de denuncias existentes
 * @param {string} tipoDenuncia - Tipo de denuncia a filtrar
 * @param {Object} opciones - Opciones de configuración (opcional)
 * @returns {ResultadoDuplicado}
 */
export function validarDenunciaDuplicadaPorTipo(nuevaDenuncia, denunciasExistentes, tipoDenuncia, opciones = {}) {
  // Filtrar por tipo
  const denunciasFiltradas = denunciasExistentes.filter(d => 
    d.tipo_id === tipoDenuncia || d.tipo === tipoDenuncia
  );
  
  return validarDenunciaDuplicada(nuevaDenuncia, denunciasFiltradas, opciones);
}

/**
 * Genera un resumen de denuncias similares para mostrar en UI
 * @param {Array} denunciasSimilares - Lista de denuncias similares
 * @returns {string} Resumen formateado
 */
export function generarResumenSimilares(denunciasSimilares) {
  if (!denunciasSimilares || denunciasSimilares.length === 0) {
    return '';
  }

  const tipos = {};
  denunciasSimilares.forEach(d => {
    const tipo = d.tipo_id || d.tipo || 'General';
    tipos[tipo] = (tipos[tipo] || 0) + 1;
  });

  const resumen = Object.entries(tipos)
    .map(([tipo, count]) => `${count} ${tipo}`)
    .join(', ');

  return resumen;
}

/**
 * Configura los parámetros de detección de duplicados
 * @param {Object} nuevaConfig - Nueva configuración
 */
export function configurarDeteccionDuplicados(nuevaConfig) {
  Object.assign(CONFIG, nuevaConfig);
}

/**
 * Obtiene la configuración actual
 * @returns {Object} Configuración actual
 */
export function obtenerConfiguracion() {
  return { ...CONFIG };
}
