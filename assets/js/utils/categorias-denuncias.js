// Categorías de Denuncias - Datos Reales de la Municipalidad
// Basado en database/categoria_denuncias.csv

const rawCategorias = [
  // UNIDAD DE ALUMBRADO PÚBLICO
  {
    id: 1,
    departamento: 'UNIDAD DE ALUMBRADO PÚBLICO',
    nombre: 'ALUMBRADO PÚBLICO DEFECTUOSO',
    descripcion: 'Reporta aquí si una lámpara de la calle no enciende, parpadea constantemente o permanece encendida durante el día.',
    icono: 'fa-lightbulb',
    color: 'yellow',
    estado: 'ACTIVA'
  },
  {
    id: 2,
    departamento: 'UNIDAD DE ALUMBRADO PÚBLICO',
    nombre: 'SOLICITUD DE NUEVO ALUMBRADO',
    descripcion: 'Utiliza esta opción si tu comunidad necesita la instalación de nuevas lámparas de alumbrado público en zonas oscuras o consideradas inseguras.',
    icono: 'fa-lightbulb',
    color: 'yellow',
    estado: 'ACTIVA'
  },
  
  // CUERPO DE AGENTES MUNICIPALES (CAM)
  {
    id: 3,
    departamento: 'CUERPO DE AGENTES MUNICIPALES (CAM)',
    nombre: 'OBSTRUCCIÓN VÍA PÚBLICA',
    descripcion: 'Utiliza esta opción para reportar talleres, ventas no autorizadas u otros objetos que estén bloqueando calles, aceras o cualquier otro espacio público, impidiendo el libre tránsito.',
    icono: 'fa-road-barrier',
    color: 'orange',
    estado: 'ACTIVA'
  },
  {
    id: 4,
    departamento: 'CUERPO DE AGENTES MUNICIPALES (CAM)',
    nombre: 'VEHÍCULO ABANDONADO',
    descripcion: 'Reporta vehículos que llevan mucho tiempo estacionados en la vía pública sin moverse y que parecen estar abandonados.',
    icono: 'fa-car',
    color: 'orange',
    estado: 'ACTIVA'
  },
  
  // GERENCIA DE OBRAS MUNICIPALES
  {
    id: 8,
    departamento: 'GERENCIA DE OBRAS MUNICIPALES',
    nombre: 'OBRAS EN LA VÍA PÚBLICA SIN SEÑALIZACIÓN',
    descripcion: 'Reporta obras de construcción o reparación en calles o aceras que no cuentan con la señalización adecuada, representando un peligro.',
    icono: 'fa-hard-hat',
    color: 'gray',
    estado: 'ACTIVA'
  },
  {
    id: 9,
    departamento: 'GERENCIA DE OBRAS MUNICIPALES',
    nombre: 'DETERIORO DE INFRAESTRUCTURA PÚBLICA',
    descripcion: 'Utiliza esta opción para reportar daños en puentes peatonales, gradas públicas, muros de contención u otra infraestructura municipal que necesite reparación.',
    icono: 'fa-bridge',
    color: 'gray',
    estado: 'ACTIVA'
  },
  
  // MANTENIMIENTO DE PARQUES Y JARDINES
  {
    id: 10,
    departamento: 'MANTENIMIENTO DE PARQUES Y JARDINES',
    nombre: 'JUEGOS INFANTILES DETERIORADOS',
    descripcion: 'Reporta si los juegos infantiles en parques municipales están rotos, inseguros o en mal estado general.',
    icono: 'fa-puzzle-piece',
    color: 'green',
    estado: 'ACTIVA'
  },
  
  // MEDIO AMBIENTE
  {
    id: 11,
    departamento: 'MEDIO AMBIENTE',
    nombre: 'EVALUACIÓN DE TALA DE ÁRBOL',
    descripcion: 'Utiliza esta opción si necesitas que la municipalidad evalúe un árbol que consideras peligroso (riesgo de caída) o que está causando problemas en tu propiedad o la vía pública.',
    icono: 'fa-tree',
    color: 'green',
    estado: 'ACTIVA'
  },
  {
    id: 12,
    departamento: 'MEDIO AMBIENTE',
    nombre: 'BASURA EN LUGARES PROHIBIDOS',
    descripcion: 'Utiliza esta opción si detectas lugares donde se está acumulando basura de forma ilegal o en sitios no autorizados.',
    icono: 'fa-trash',
    color: 'green',
    estado: 'ACTIVA'
  },
  {
    id: 13,
    departamento: 'MEDIO AMBIENTE',
    nombre: 'QUEMA DE DESECHOS',
    descripcion: 'Reporta si alguien está quemando basura o residuos al aire libre, generando humo y contaminación.',
    icono: 'fa-fire',
    color: 'red',
    estado: 'ACTIVA'
  },
  
  // PROTECCIÓN CIVIL
  {
    id: 14,
    departamento: 'PROTECCIÓN CIVIL',
    nombre: 'PELIGRO DE DERRUMBE',
    descripcion: 'Reporta si observas taludes, terrenos o construcciones con alto riesgo de derrumbe o deslizamiento, que puedan poner en peligro a personas o propiedades. También informa si ya ocurrió un deslizamiento.',
    icono: 'fa-house-crack',
    color: 'red',
    estado: 'ACTIVA'
  },
  {
    id: 15,
    departamento: 'PROTECCIÓN CIVIL',
    nombre: 'ÁRBOL O RAMA PELIGROSA',
    descripcion: 'Utiliza esta opción para solicitar la poda urgente de árboles o ramas que representan un riesgo inminente de caída.',
    icono: 'fa-tree',
    color: 'red',
    estado: 'ACTIVA'
  },
  {
    id: 16,
    departamento: 'PROTECCIÓN CIVIL',
    nombre: 'INESTABILIDAD DE TERRENO',
    descripcion: 'Reporta si observas bordos o terrenos que parecen inestables y con riesgo de derrumbarse, especialmente durante o después de lluvias.',
    icono: 'fa-mountain',
    color: 'red',
    estado: 'ACTIVA'
  },
  
  // UNIDAD DE CONTRAVENCIONAL
  {
    id: 19,
    departamento: 'UNIDAD DE CONTRAVENCIONAL',
    nombre: 'MOLESTIAS POR RUIDO',
    descripcion: 'Reporta ruidos excesivos provenientes de vecinos, negocios (como talleres) u otras fuentes que alteren la tranquilidad, especialmente fuera de los horarios permitidos. También puedes reportar olores desagradables asociados a estas actividades.',
    icono: 'fa-volume-high',
    color: 'purple',
    estado: 'ACTIVA'
  },
  {
    id: 20,
    departamento: 'UNIDAD DE CONTRAVENCIONAL',
    nombre: 'VERTIMIENTO DE AGUAS RESIDUALES',
    descripcion: 'Utiliza esta opción si un vecino o establecimiento está vertiendo aguas sucias (grises o negras) directamente a la calle, tu propiedad o un drenaje pluvial, causando contaminación u olores desagradables.',
    icono: 'fa-water',
    color: 'blue',
    estado: 'ACTIVA'
  },
  {
    id: 21,
    departamento: 'UNIDAD DE CONTRAVENCIONAL',
    nombre: 'INFRACCIONES MUNICIPALES',
    descripcion: 'Reporta aquí otras situaciones que consideras que incumplen las normas de la municipalidad, como disposición inadecuada de basura (no orgánica), obstrucción de tragantes con desechos, olores molestos generales (no de taller/comercio específico).',
    icono: 'fa-scale-unbalanced',
    color: 'purple',
    estado: 'ACTIVA'
  },
  {
    id: 22,
    departamento: 'UNIDAD DE CONTRAVENCIONAL',
    nombre: 'CONFLICTOS ENTRE VECINOS',
    descripcion: 'Reporta problemas o desacuerdos con vecinos que no se ajustan a otras categorías específicas, como obstrucción de paso, problemas con límites de propiedad (sin invasión), o situaciones que afectan la convivencia.',
    icono: 'fa-users',
    color: 'purple',
    estado: 'ACTIVA'
  },
  {
    id: 23,
    departamento: 'UNIDAD DE CONTRAVENCIONAL',
    nombre: 'VENTA ILEGAL DE ALCOHOL',
    descripcion: 'Reporta si tienes conocimiento de lugares o personas que venden bebidas alcohólicas sin los permisos correspondientes.',
    icono: 'fa-wine-bottle',
    color: 'purple',
    estado: 'ACTIVA'
  },
  {
    id: 24,
    departamento: 'UNIDAD DE CONTRAVENCIONAL',
    nombre: 'ESCOMBROS EN LA VÍA PÚBLICA',
    descripcion: 'Reporta la presencia de escombros, tierra o ripio acumulados en calles o lugares no permitidos.',
    icono: 'fa-dumpster',
    color: 'gray',
    estado: 'ACTIVA'
  },
  {
    id: 25,
    departamento: 'UNIDAD DE CONTRAVENCIONAL',
    nombre: 'SOLICITUD DE MEDIACIÓN VECINAL',
    descripcion: 'Utiliza esta opción si deseas solicitar la intervención del centro de mediación para resolver conflictos o desacuerdos con tus vecinos a través de un proceso pacífico. (Ejemplos: problemas de límites, ruidos leves, etc.)',
    icono: 'fa-handshake',
    color: 'purple',
    estado: 'ACTIVA'
  },
  {
    id: 26,
    departamento: 'UNIDAD DE CONTRAVENCIONAL',
    nombre: 'HUMO EXCESIVO DE PANADERÍA',
    descripcion: 'Utiliza esta opción si una panadería está emitiendo humo en exceso o con olores muy fuertes que afectan a los vecinos.',
    icono: 'fa-bread-slice',
    color: 'orange',
    estado: 'ACTIVA'
  },
  
  // UNIDAD DE PROTECCIÓN DE ANIMALES DE COMPAÑÍA
  {
    id: 27,
    departamento: 'UNIDAD DE PROTECCIÓN DE ANIMALES DE COMPAÑÍA',
    nombre: 'PROTECCIÓN ANIMAL',
    descripcion: 'Reporta cualquier situación de maltrato, abandono o crueldad hacia animales de compañía.',
    icono: 'fa-paw',
    color: 'pink',
    estado: 'ACTIVA'
  },
  {
    id: 28,
    departamento: 'UNIDAD DE PROTECCIÓN DE ANIMALES DE COMPAÑÍA',
    nombre: 'ANIMALES ABANDONADOS',
    descripcion: 'Reporta si encuentras animales de compañía (perros, gatos, etc.) abandonados en la vía pública.',
    icono: 'fa-dog',
    color: 'pink',
    estado: 'ACTIVA'
  },
  {
    id: 29,
    departamento: 'UNIDAD DE PROTECCIÓN DE ANIMALES DE COMPAÑÍA',
    nombre: 'TENENCIA IRRESPONSABLE DE ANIMALES',
    descripcion: 'Utiliza esta opción si presencias situaciones de tenencia irresponsable que pongan en riesgo la salud o el bienestar de los animales o de la comunidad (por ejemplo, animales sin supervisión en la calle, falta de higiene).',
    icono: 'fa-cat',
    color: 'pink',
    estado: 'ACTIVA'
  },
  
  // UNIDAD DE RECOLECCIÓN DE RESIDUOS SÓLIDOS
  {
    id: 30,
    departamento: 'UNIDAD DE RECOLECCIÓN DE RESIDUOS SÓLIDOS',
    nombre: 'ACUMULACIÓN INADECUADA DE BASURA',
    descripcion: 'Utiliza esta opción si observas montones de basura fuera de los contenedores o en horarios distintos a los de recolección.',
    icono: 'fa-trash-can',
    color: 'green',
    estado: 'ACTIVA'
  },
  
  // UNIDAD OPERATIVA DE OBRAS MUNICIPALES
  {
    id: 31,
    departamento: 'UNIDAD OPERATIVA DE OBRAS MUNICIPALES',
    nombre: 'DRENAJE PLUVIAL AFECTADO',
    descripcion: 'Reporta problemas con las alcantarillas o tragantes, como tapas rotas, hundimientos, obstrucciones que causan acumulación de agua o malos olores.',
    icono: 'fa-water',
    color: 'blue',
    estado: 'ACTIVA'
  },
  {
    id: 32,
    departamento: 'UNIDAD OPERATIVA DE OBRAS MUNICIPALES',
    nombre: 'DETERIORO DE CALLES',
    descripcion: 'Reporta baches, hundimientos, falta de pavimento u otros daños en las calles que dificultan el tránsito de vehículos o peatones.',
    icono: 'fa-road',
    color: 'gray',
    estado: 'ACTIVA'
  }
];

const toTitleCase = (str) => {
  if (!str) return '';
  const minWords = ['de', 'la', 'los', 'el', 'las', 'del', 'y', 'en', 'a', 'con', 'por', 'para', 'sin'];
  return str.toLowerCase().split(' ').map((word, index) => {
    if (index > 0 && minWords.includes(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
};

export const categoriasDenuncias = rawCategorias.map(c => ({
  ...c,
  nombre: toTitleCase(c.nombre),
  departamento: toTitleCase(c.departamento)
}));

// Obtener categorías divididas en grandes pestañas (UX Senior)
export const getCategoriasPorTab = () => {
  const tabs = {
    'Seguridad y Emergencias': [],
    'Ciudad y Servicios': []
  };
  
  categoriasDenuncias.forEach(cat => {
    const depto = cat.departamento.toUpperCase();
    if (depto.includes('PROTECCIÓN CIVIL') || 
        depto.includes('AGENTES MUNICIPALES') || 
        depto.includes('CONTRAVENCIONAL')) {
      tabs['Seguridad y Emergencias'].push(cat);
    } else {
      tabs['Ciudad y Servicios'].push(cat);
    }
  });

  // Ordenar Seguridad: Protección Civil primero, luego Contravencional, luego CAM
  tabs['Seguridad y Emergencias'].sort((a, b) => {
    const deptoA = a.departamento.toUpperCase();
    const deptoB = b.departamento.toUpperCase();
    
    if (deptoA.includes('PROTECCIÓN CIVIL') && !deptoB.includes('PROTECCIÓN CIVIL')) return -1;
    if (!deptoA.includes('PROTECCIÓN CIVIL') && deptoB.includes('PROTECCIÓN CIVIL')) return 1;
    
    if (deptoA.includes('CONTRAVENCIONAL') && !deptoB.includes('CONTRAVENCIONAL')) return -1;
    if (!deptoA.includes('CONTRAVENCIONAL') && deptoB.includes('CONTRAVENCIONAL')) return 1;
    
    return 0;
  });

  return tabs;
};

// Obtener categorías agrupadas por departamento
export const getCategoriasPorDepartamento = () => {
  const departamentos = {};
  
  categoriasDenuncias.forEach(cat => {
    if (!departamentos[cat.departamento]) {
      departamentos[cat.departamento] = [];
    }
    departamentos[cat.departamento].push(cat);
  });
  
  return departamentos;
};

// Obtener categoría por ID
export const getCategoriaPorId = (id) => {
  return categoriasDenuncias.find(cat => cat.id === id);
};

// Mapeo de colores a clases Tailwind
export const getColorClass = (color) => {
  const colorMap = {
    yellow: { bg: 'bg-yellow-100', border: 'border-yellow-500', icon: 'bg-yellow-500', text: 'text-yellow-700' },
    orange: { bg: 'bg-orange-100', border: 'border-orange-500', icon: 'bg-orange-500', text: 'text-orange-700' },
    gray: { bg: 'bg-gray-100', border: 'border-gray-500', icon: 'bg-gray-500', text: 'text-gray-700' },
    green: { bg: 'bg-green-100', border: 'border-green-500', icon: 'bg-green-500', text: 'text-green-700' },
    red: { bg: 'bg-red-100', border: 'border-red-500', icon: 'bg-red-500', text: 'text-red-700' },
    blue: { bg: 'bg-blue-100', border: 'border-blue-500', icon: 'bg-blue-500', text: 'text-blue-700' },
    purple: { bg: 'bg-purple-100', border: 'border-purple-500', icon: 'bg-purple-500', text: 'text-purple-700' },
    pink: { bg: 'bg-pink-100', border: 'border-pink-500', icon: 'bg-pink-500', text: 'text-pink-700' }
  };
  return colorMap[color] || colorMap.gray;
};
