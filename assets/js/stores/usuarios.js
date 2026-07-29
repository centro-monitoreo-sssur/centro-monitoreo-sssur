import { ref } from '../core/vue.js';
import { db } from '../core/supabase.js';

const usuarios = ref([]);
const cargandoUsuarios = ref(false);

async function cargarUsuarios() {
  cargandoUsuarios.value = true;
  try {
    if (db) {
      const { data, error } = await db
        .from('usuarios')
        .select(`
          id,
          username,
          email_institucional,
          nombres,
          apellidos,
          puesto_cargo,
          activo,
          ultimo_acceso,
          created_at,
          roles (
            codigo,
            nombre
          ),
          departamentos (
            nombre
          )
        `);
      if (error) throw error;
      if (data) {
        usuarios.value = data.map(u => ({
          id: u.id,
          nombre: `${u.nombres} ${u.apellidos}`,
          email: u.email_institucional,
          rol: u.roles?.codigo || 'empleado',
          estado: u.activo ? 'activo' : 'inactivo',
          ultimoAcceso: u.ultimo_acceso || u.created_at,
          creadoEn: u.created_at,
          cargo: u.puesto_cargo,
          departamento: u.departamentos?.nombre || ''
        }));
      }
    }
  } catch (error) {
    console.error('Error cargando usuarios:', error.message);
  } finally {
    cargandoUsuarios.value = false;
  }
}

export function useUsuarios() {
  return {
    usuarios,
    cargandoUsuarios,
    cargarUsuarios,
  };
}
