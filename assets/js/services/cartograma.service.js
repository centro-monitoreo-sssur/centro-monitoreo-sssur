// ============================================================
// SERVICIO: Cartograma
// Conecta con la capa de datos para obtener las zonas de población.
// En producción, esto haría un fetch a Supabase tabla 'zonas_poblacion'.
// Para esta fase, retornamos un mock dinámico para el demo.
// ============================================================

export async function obtenerZonasPoblacion() {
  // Simulamos delay de red (200ms)
  await new Promise(resolve => setTimeout(resolve, 200));

  return [
    {
      id: 'z1',
      nombre: 'San Marcos',
      poblacion: 85000,
      color: '#3b82f6', // blue
      // Cuadrado aproximado
      geojson_real: {
        type: 'Polygon',
        coordinates: [[
          [-89.18, 13.67], [-89.15, 13.67], [-89.15, 13.65], [-89.18, 13.65], [-89.18, 13.67]
        ]]
      },
      // San Marcos es el más poblado, se expande en el cartograma
      geojson_cartograma: {
        type: 'Polygon',
        coordinates: [[
          [-89.19, 13.68], [-89.14, 13.68], [-89.14, 13.64], [-89.19, 13.64], [-89.19, 13.68]
        ]]
      }
    },
    {
      id: 'z2',
      nombre: 'Santo Tomás',
      poblacion: 35000,
      color: '#10b981', // emerald
      geojson_real: {
        type: 'Polygon',
        coordinates: [[
          [-89.15, 13.65], [-89.11, 13.65], [-89.11, 13.63], [-89.15, 13.63], [-89.15, 13.65]
        ]]
      },
      // Población media, se contrae un poco
      geojson_cartograma: {
        type: 'Polygon',
        coordinates: [[
          [-89.145, 13.648], [-89.115, 13.648], [-89.115, 13.632], [-89.145, 13.632], [-89.145, 13.648]
        ]]
      }
    },
    {
      id: 'z3',
      nombre: 'Santiago Texacuangos',
      poblacion: 18000,
      color: '#f59e0b', // amber
      geojson_real: {
        type: 'Polygon',
        coordinates: [[
          [-89.11, 13.64], [-89.07, 13.64], [-89.07, 13.61], [-89.11, 13.61], [-89.11, 13.64]
        ]]
      },
      // Poca población, se contrae mucho
      geojson_cartograma: {
        type: 'Polygon',
        coordinates: [[
          [-89.10, 13.635], [-89.08, 13.635], [-89.08, 13.615], [-89.10, 13.615], [-89.10, 13.635]
        ]]
      }
    }
  ];
}
