// ============================================================
// COMPONENTE: Notificaciones
// Panel de visualización de notificaciones del usuario/sistema.
// ============================================================
import { ref } from '../../core/vue.js';

export default {
  name: 'vista-notificaciones',
  setup() {
    const notificaciones = ref([
      { id: 1, tipo: 'sistema', titulo: 'Actualización del Sistema', mensaje: 'Se ha desplegado la versión 1.2.0 con mejoras en el mapa en vivo.', fecha: 'Hace 2 horas', leida: false },
      { id: 2, tipo: 'denuncia', titulo: 'Nueva denuncia asignada', mensaje: 'Se te ha asignado la denuncia #1024 en San Marcos.', fecha: 'Hace 4 horas', leida: true },
      { id: 3, tipo: 'alerta', titulo: 'Alerta meteorológica', mensaje: 'Lluvias intensas previstas para la zona sur esta tarde.', fecha: 'Ayer', leida: true }
    ]);

    const marcarTodas = () => {
      notificaciones.value.forEach(n => n.leida = true);
    };

    const marcarLeida = (id) => {
      const n = notificaciones.value.find(x => x.id === id);
      if (n) n.leida = true;
    };

    return { notificaciones, marcarTodas, marcarLeida };
  }
};
