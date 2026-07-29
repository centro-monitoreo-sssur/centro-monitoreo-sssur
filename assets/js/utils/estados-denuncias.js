// Estados y flujos de trabajo por categoría de denuncia
// Cada categoría tiene sus propios estados según el proceso administrativo específico

export const estadosPorCategoria = {
  // Unidad de Alumbrado Público
  1: { // ALUMBRADO PÚBLICO DEFECTUOSO
    nombre: 'Alumbrado Público',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'revision', nombre: 'En Revisión', descripcion: 'Personal técnico revisando el reporte', icono: 'fa-magnifying-glass', color: 'yellow' },
      { id: 'programada', nombre: 'Reparación Programada', descripcion: 'Reparación agendada', icono: 'fa-calendar-check', color: 'blue' },
      { id: 'en_proceso', nombre: 'En Reparación', descripcion: 'Técnicos trabajando en el lugar', icono: 'fa-screwdriver-wrench', color: 'orange' },
      { id: 'completada', nombre: 'Completada', descripcion: 'Reparación finalizada', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  2: { // POSTE DE LUZ DAÑADO
    nombre: 'Poste de Luz',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'inspeccion', nombre: 'Inspección', descripcion: 'Inspección técnica en sitio', icono: 'fa-clipboard-check', color: 'yellow' },
      { id: 'programada', nombre: 'Reemplazo Programado', descripcion: 'Reemplazo de poste agendado', icono: 'fa-calendar-check', color: 'blue' },
      { id: 'en_proceso', nombre: 'En Proceso', descripcion: 'Trabajo de reemplazo en curso', icono: 'fa-screwdriver-wrench', color: 'orange' },
      { id: 'completada', nombre: 'Completada', descripcion: 'Poste reemplazado', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  
  // Cuerpo de Agentes Municipales (CAM)
  3: { // OBSTRUCCIÓN VÍA PÚBLICA
    nombre: 'Obstrucción Vía Pública',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'verificacion', nombre: 'Verificación', descripcion: 'Agentes verificando la situación', icono: 'fa-shield-halved', color: 'yellow' },
      { id: 'notificacion', nombre: 'Notificación', descripcion: 'Notificación al responsable', icono: 'fa-bell', color: 'blue' },
      { id: 'remocion', nombre: 'Remoción', descripcion: 'Remoción de obstrucción', icono: 'fa-truck-ramp-box', color: 'orange' },
      { id: 'resuelta', nombre: 'Resuelta', descripcion: 'Vía liberada', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  4: { // VENTA NO AUTORIZADA
    nombre: 'Venta No Autorizada',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'investigacion', nombre: 'Investigación', descripcion: 'Investigación en curso', icono: 'fa-magnifying-glass', color: 'yellow' },
      { id: 'accion', nombre: 'Acción Municipal', descripcion: 'Tomando medidas administrativas', icono: 'fa-gavel', color: 'blue' },
      { id: 'resuelta', nombre: 'Resuelta', descripcion: 'Situación regularizada', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  5: { // RUIDO EXCESIVO
    nombre: 'Ruido Excesivo',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'monitoreo', nombre: 'Monitoreo', descripcion: 'Monitoreo del nivel de ruido', icono: 'fa-volume-high', color: 'yellow' },
      { id: 'medidas', nombre: 'Medidas Aplicadas', descripcion: 'Aplicando medidas correctivas', icono: 'fa-gavel', color: 'blue' },
      { id: 'resuelta', nombre: 'Resuelta', descripcion: 'Ruido controlado', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  6: { // ACTIVIDAD SOSPECHOSA
    nombre: 'Actividad Sospechosa',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'patrullaje', nombre: 'Patrullaje', descripcion: 'Patrullaje aumentado en zona', icono: 'fa-car', color: 'yellow' },
      { id: 'investigacion', nombre: 'Investigación', descripcion: 'Investigación en curso', icono: 'fa-magnifying-glass', color: 'blue' },
      { id: 'resuelta', nombre: 'Resuelta', descripcion: 'Situación controlada', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  
  // Gerencia de Obras Municipales
  7: { // DETERIORO DE ACERAS
    nombre: 'Deterioro de Aceras',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'inspeccion', nombre: 'Inspección', descripcion: 'Inspección técnica en sitio', icono: 'fa-clipboard-check', color: 'yellow' },
      { id: 'presupuesto', nombre: 'Presupuesto', descripcion: 'Elaborando presupuesto', icono: 'fa-calculator', color: 'blue' },
      { id: 'reparacion', nombre: 'En Reparación', descripcion: 'Reparación en curso', icono: 'fa-screwdriver-wrench', color: 'orange' },
      { id: 'completada', nombre: 'Completada', descripcion: 'Reparación finalizada', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  8: { // DETERIORO DE CALLES
    nombre: 'Deterioro de Calles',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'inspeccion', nombre: 'Inspección', descripcion: 'Inspección técnica en sitio', icono: 'fa-clipboard-check', color: 'yellow' },
      { id: 'programada', nombre: 'Reparación Programada', descripcion: 'Reparación agendada', icono: 'fa-calendar-check', color: 'blue' },
      { id: 'reparacion', nombre: 'En Reparación', descripcion: 'Reparación en curso', icono: 'fa-screwdriver-wrench', color: 'orange' },
      { id: 'completada', nombre: 'Completada', descripcion: 'Reparación finalizada', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  9: { // DETERIORO DE PARQUES
    nombre: 'Deterioro de Parques',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'evaluacion', nombre: 'Evaluación', descripcion: 'Evaluación del daño', icono: 'fa-clipboard-check', color: 'yellow' },
      { id: 'mantenimiento', nombre: 'Mantenimiento', descripcion: 'Mantenimiento programado', icono: 'fa-calendar-check', color: 'blue' },
      { id: 'en_proceso', nombre: 'En Proceso', descripcion: 'Trabajos en curso', icono: 'fa-screwdriver-wrench', color: 'orange' },
      { id: 'completada', nombre: 'Completada', descripcion: 'Parque restaurado', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  
  // Mantenimiento de Parques y Jardines
  10: { // JUEGOS INFANTILES DETERIORADOS
    nombre: 'Juegos Infantiles',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'inspeccion', nombre: 'Inspección', descripcion: 'Inspección de seguridad', icono: 'fa-shield-halved', color: 'yellow' },
      { id: 'reparacion', nombre: 'Reparación', descripcion: 'Reparación en curso', icono: 'fa-screwdriver-wrench', color: 'orange' },
      { id: 'completada', nombre: 'Completada', descripcion: 'Juego reparado', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  11: { // ÁRBOLES EN MAL ESTADO
    nombre: 'Árboles en Mal Estado',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'evaluacion', nombre: 'Evaluación', descripcion: 'Evaluación por especialista', icono: 'fa-tree', color: 'yellow' },
      { id: 'poda', nombre: 'Poda/Remoción', descripcion: 'Poda o remoción programada', icono: 'fa-scissors', color: 'blue' },
      { id: 'en_proceso', nombre: 'En Proceso', descripcion: 'Trabajo en curso', icono: 'fa-screwdriver-wrench', color: 'orange' },
      { id: 'completada', nombre: 'Completada', descripcion: 'Trabajo finalizado', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  
  // Medio Ambiente
  12: { // BASURA EN LUGARES PROHIBIDOS
    nombre: 'Basura en Lugares Prohibidos',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'verificacion', nombre: 'Verificación', descripcion: 'Verificación en sitio', icono: 'fa-magnifying-glass', color: 'yellow' },
      { id: 'recoleccion', nombre: 'Recolección', descripcion: 'Recolección programada', icono: 'fa-truck', color: 'blue' },
      { id: 'completada', nombre: 'Completada', descripcion: 'Limpieza finalizada', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  13: { // QUEMA DE BASURA
    nombre: 'Quema de Basura',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'inspeccion', nombre: 'Inspección', descripcion: 'Inspección en sitio', icono: 'fa-magnifying-glass', color: 'yellow' },
      { id: 'accion', nombre: 'Acción Tomada', descripcion: 'Medidas aplicadas', icono: 'fa-gavel', color: 'blue' },
      { id: 'resuelta', nombre: 'Resuelta', descripcion: 'Situación controlada', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  14: { // PELIGRO DE DERRUMBE
    nombre: 'Peligro de Derrumbe',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'emergencia', nombre: 'Evaluación de Riesgo', descripcion: 'Evaluación de riesgo inmediato', icono: 'fa-triangle-exclamation', color: 'red' },
      { id: 'contencion', nombre: 'Contención', descripcion: 'Medidas de contención aplicadas', icono: 'fa-shield-halved', color: 'orange' },
      { id: 'reparacion', nombre: 'Reparación', descripcion: 'Reparación estructural', icono: 'fa-screwdriver-wrench', color: 'blue' },
      { id: 'completada', nombre: 'Completada', descripcion: 'Riesgo eliminado', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  15: { // CONTAMINACIÓN DE AGUA
    nombre: 'Contaminación de Agua',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'analisis', nombre: 'Análisis', descripcion: 'Análisis de calidad de agua', icono: 'fa-flask', color: 'yellow' },
      { id: 'accion', nombre: 'Acción Correctiva', descripcion: 'Acciones correctivas en curso', icono: 'fa-gavel', color: 'red' },
      { id: 'monitoreo', nombre: 'Monitoreo', descripcion: 'Monitoreo continuo', icono: 'fa-eye', color: 'blue' },
      { id: 'resuelta', nombre: 'Resuelta', descripcion: 'Calidad restaurada', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  
  // Protección Civil
  16: { // INCENDIO
    nombre: 'Incendio',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'emergencia', nombre: 'Emergencia Activa', descripcion: 'Bomberos en camino', icono: 'fa-fire-extinguisher', color: 'red' },
      { id: 'control', nombre: 'Controlado', descripcion: 'Incendio controlado', icono: 'fa-check-circle', color: 'orange' },
      { id: 'investigacion', nombre: 'Investigación', descripcion: 'Investigación de causas', icono: 'fa-magnifying-glass', color: 'yellow' },
      { id: 'resuelta', nombre: 'Resuelta', descripcion: 'Incidente cerrado', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  17: { // INUNDACIÓN
    nombre: 'Inundación',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'emergencia', nombre: 'Emergencia Activa', descripcion: 'Equipos de rescate desplegados', icono: 'fa-life-ring', color: 'red' },
      { id: 'evacuacion', nombre: 'Evacuación', descripcion: 'Evacuación en curso', icono: 'fa-person-running', color: 'orange' },
      { id: 'limpieza', nombre: 'Limpieza', descripcion: 'Limpieza y desinfección', icono: 'fa-broom', color: 'blue' },
      { id: 'resuelta', nombre: 'Resuelta', descripcion: 'Área recuperada', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  18: { // DESLIZAMIENTO
    nombre: 'Deslizamiento',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'emergencia', nombre: 'Emergencia Activa', descripcion: 'Evaluación de riesgo', icono: 'fa-triangle-exclamation', color: 'red' },
      { id: 'evacuacion', nombre: 'Evacuación', descripcion: 'Evacuación si es necesario', icono: 'fa-person-running', color: 'orange' },
      { id: 'estabilizacion', nombre: 'Estabilización', descripcion: 'Estabilización del terreno', icono: 'fa-mountain', color: 'blue' },
      { id: 'resuelta', nombre: 'Resuelta', descripcion: 'Área segura', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  
  // Unidad de Contravencional
  19: { // MOLESTIAS POR RUIDO
    nombre: 'Molestias por Ruido',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'verificacion', nombre: 'Verificación', descripcion: 'Verificación en sitio', icono: 'fa-magnifying-glass', color: 'yellow' },
      { id: 'medidas', nombre: 'Medidas Aplicadas', descripcion: 'Medidas correctivas', icono: 'fa-gavel', color: 'blue' },
      { id: 'resuelta', nombre: 'Resuelta', descripcion: 'Situación controlada', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  20: { // VENTA DE ALCOHOL SIN LICENCIA
    nombre: 'Venta de Alcohol sin Licencia',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'investigacion', nombre: 'Investigación', descripcion: 'Investigación en curso', icono: 'fa-magnifying-glass', color: 'yellow' },
      { id: 'sancion', nombre: 'Sanción', descripcion: 'Proceso de sanción', icono: 'fa-gavel', color: 'blue' },
      { id: 'resuelta', nombre: 'Resuelta', descripcion: 'Situación regularizada', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  
  // Unidad de Protección de Animales de Compañía
  21: { // MALTRATO ANIMAL
    nombre: 'Maltrato Animal',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'investigacion', nombre: 'Investigación', descripcion: 'Investigación en curso', icono: 'fa-magnifying-glass', color: 'yellow' },
      { id: 'rescate', nombre: 'Rescate', descripcion: 'Rescate del animal', icono: 'fa-hand-holding-heart', color: 'red' },
      { id: 'recuperacion', nombre: 'Recuperación', descripcion: 'Animal en recuperación', icono: 'fa-heart-pulse', color: 'blue' },
      { id: 'resuelta', nombre: 'Resuelta', descripcion: 'Caso cerrado', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  22: { // ANIMAL ABANDONADO
    nombre: 'Animal Abandonado',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'busqueda', nombre: 'Búsqueda', descripcion: 'Búsqueda del animal', icono: 'fa-magnifying-glass', color: 'yellow' },
      { id: 'rescate', nombre: 'Rescate', descripcion: 'Rescate exitoso', icono: 'fa-hand-holding-heart', color: 'blue' },
      { id: 'adopcion', nombre: 'En Adopción', descripcion: 'Proceso de adopción', icono: 'fa-house-chimney-heart', color: 'orange' },
      { id: 'adoptado', nombre: 'Adoptado', descripcion: 'Animal adoptado', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  23: { // ANIMAL PELIGROSO
    nombre: 'Animal Peligroso',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'emergencia', nombre: 'Emergencia', descripcion: 'Control de animal en curso', icono: 'fa-triangle-exclamation', color: 'red' },
      { id: 'captura', nombre: 'Captura', descripcion: 'Captura del animal', icono: 'fa-hand-holding-hand', color: 'orange' },
      { id: 'evaluacion', nombre: 'Evaluación', descripcion: 'Evaluación veterinaria', icono: 'fa-user-doctor', color: 'blue' },
      { id: 'resuelta', nombre: 'Resuelta', descripcion: 'Situación controlada', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  
  // Unidad de Recolección de Residuos Sólidos
  24: { // FALTA DE RECOLECCIÓN
    nombre: 'Falta de Recolección',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'verificacion', nombre: 'Verificación', descripcion: 'Verificación de ruta', icono: 'fa-magnifying-glass', color: 'yellow' },
      { id: 'programada', nombre: 'Recolección Programada', descripcion: 'Recolección agendada', icono: 'fa-calendar-check', color: 'blue' },
      { id: 'completada', nombre: 'Completada', descripcion: 'Recolección realizada', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  25: { // CONTENEDOR LLENO
    nombre: 'Contenedor Lleno',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'verificacion', nombre: 'Verificación', descripcion: 'Verificación en sitio', icono: 'fa-magnifying-glass', color: 'yellow' },
      { id: 'vaciado', nombre: 'Vaciado', descripcion: 'Contenedor vaciado', icono: 'fa-trash-can', color: 'blue' },
      { id: 'completada', nombre: 'Completada', descripcion: 'Situación resuelta', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  
  // Unidad Operativa de Obras Municipales
  26: { // DRENAJE PLUVIAL AFECTADO
    nombre: 'Drenaje Pluvial',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'inspeccion', nombre: 'Inspección', descripcion: 'Inspección del drenaje', icono: 'fa-magnifying-glass', color: 'yellow' },
      { id: 'limpieza', nombre: 'Limpieza', descripcion: 'Limpieza programada', icono: 'fa-broom', color: 'blue' },
      { id: 'reparacion', nombre: 'Reparación', descripcion: 'Reparación si es necesaria', icono: 'fa-screwdriver-wrench', color: 'orange' },
      { id: 'completada', nombre: 'Completada', descripcion: 'Drenaje funcionando', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  27: { // TAPA DE ALCANTARILLA ROTA
    nombre: 'Tapa de Alcantarilla',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'emergencia', nombre: 'Prioridad Alta', descripcion: 'Reemplazo prioritario', icono: 'fa-triangle-exclamation', color: 'red' },
      { id: 'reemplazo', nombre: 'Reemplazo', descripcion: 'Reemplazo en curso', icono: 'fa-screwdriver-wrench', color: 'orange' },
      { id: 'completada', nombre: 'Completada', descripcion: 'Tapa reemplazada', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  28: { // FUGA DE AGUA
    nombre: 'Fuga de Agua',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'inspeccion', nombre: 'Inspección', descripcion: 'Inspección de la fuga', icono: 'fa-magnifying-glass', color: 'yellow' },
      { id: 'reparacion', nombre: 'Reparación', descripcion: 'Reparación en curso', icono: 'fa-screwdriver-wrench', color: 'orange' },
      { id: 'completada', nombre: 'Completada', descripcion: 'Fuga reparada', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  29: { // TUBERÍA ROTA
    nombre: 'Tubería Rota',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'emergencia', nombre: 'Emergencia', descripcion: 'Corte de servicio temporal', icono: 'fa-triangle-exclamation', color: 'red' },
      { id: 'excavacion', nombre: 'Excavación', descripcion: 'Excavación para acceso', icono: 'fa-trowel', color: 'orange' },
      { id: 'reparacion', nombre: 'Reparación', descripcion: 'Reparación de tubería', icono: 'fa-screwdriver-wrench', color: 'blue' },
      { id: 'completada', nombre: 'Completada', descripcion: 'Servicio restaurado', icono: 'fa-circle-check', color: 'green' }
    ]
  },
  30: { // ACUMULACIÓN INADECUADA DE BASURA
    nombre: 'Acumulación de Basura',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida y registrada', icono: 'fa-inbox', color: 'gray' },
      { id: 'verificacion', nombre: 'Verificación', descripcion: 'Verificación en sitio', icono: 'fa-magnifying-glass', color: 'yellow' },
      { id: 'recoleccion', nombre: 'Recolección', descripcion: 'Recolección programada', icono: 'fa-truck', color: 'blue' },
      { id: 'completada', nombre: 'Completada', descripcion: 'Limpieza finalizada', icono: 'fa-circle-check', color: 'green' }
    ]
  }
};

// Función para obtener los estados de una categoría específica
export const getEstadosPorCategoria = (categoriaId) => {
  return estadosPorCategoria[categoriaId] || {
    nombre: 'General',
    estados: [
      { id: 'recibida', nombre: 'Recibida', descripcion: 'Denuncia recibida', icono: 'fa-inbox', color: 'gray' },
      { id: 'en_proceso', nombre: 'En Proceso', descripcion: 'En proceso de atención', icono: 'fa-spinner', color: 'blue' },
      { id: 'resuelta', nombre: 'Resuelta', descripcion: 'Denuncia resuelta', icono: 'fa-circle-check', color: 'green' }
    ]
  };
};

// Función para obtener un estado específico
export const getEstadoPorId = (categoriaId, estadoId) => {
  const categoria = getEstadosPorCategoria(categoriaId);
  return categoria.estados.find(e => e.id === estadoId) || null;
};

// Mapeo de colores a clases de Tailwind
export const getColorClassEstado = (color) => {
  const colorMap = {
    gray: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300', icon: 'bg-gray-500' },
    yellow: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300', icon: 'bg-yellow-500' },
    blue: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', icon: 'bg-blue-500' },
    orange: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', icon: 'bg-orange-500' },
    red: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', icon: 'bg-red-500' },
    green: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', icon: 'bg-green-500' }
  };
  return colorMap[color] || colorMap.gray;
};
