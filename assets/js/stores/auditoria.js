import { ref } from '../core/vue.js';
import { db } from '../core/supabase.js';

const logs = ref([]);
const cargando = ref(false);

export function useAuditoria() {
  async function cargarLogs() {
    cargando.value = true;
    try {
      if (db) {
        const { data, error } = await db
          .from('bitacora_auditoria')
          .select(`
            id,
            accion,
            tabla_afectada,
            registro_id,
            valores_anteriores,
            valores_nuevos,
            ip_cliente,
            created_at,
            usuarios!bitacora_auditoria_usuario_id_fkey ( email_institucional, nombres, apellidos )
          `)
          .order('created_at', { ascending: false })
          .limit(100);
          
        if (error) throw error;
        logs.value = (data || []).map(l => ({
          id: l.id,
          fecha: l.created_at,
          usuario: l.usuarios ? `${l.usuarios.nombres || ''} ${l.usuarios.apellidos || ''}`.trim() || l.usuarios.email_institucional : 'Sistema',
          accion: l.accion,
          modulo: l.tabla_afectada,
          detalle: `Registro ${l.registro_id} modificado`,
          ip: l.ip_cliente || 'N/A'
        }));
      }
    } catch (e) {
      console.warn('Usando logs demo (sin conexión real a bitacora_auditoria):', e.message);
    } finally {
      cargando.value = false;
    }
  }

  return {
    logs,
    cargando,
    cargarLogs
  };
}
