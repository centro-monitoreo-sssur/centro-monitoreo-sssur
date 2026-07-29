CREATE TABLE "municipio" (
  "id" varchar PRIMARY KEY,
  "codigo" varchar UNIQUE,
  "nombre_municipio" varchar,
  "activo" bool DEFAULT true,
  "created_at" timestamp
);

CREATE TABLE "distritos" (
  "id" varchar PRIMARY KEY,
  "municipio_id" varchar,
  "codigo" varchar,
  "nombre_distrito" varchar,
  "activo" bool DEFAULT true,
  "created_at" timestamp
);

CREATE TABLE "dpto" (
  "id" varchar PRIMARY KEY,
  "codigo" varchar UNIQUE,
  "nombre_dpto" varchar,
  "jefe_dpto_id" varchar,
  "activo" bool DEFAULT true,
  "created_at" timestamp
);

CREATE TABLE "usuarios" (
  "id" varchar PRIMARY KEY,
  "distrito_id" varchar,
  "dpto_id" varchar,
  "puesto_cargo" varchar,
  "foto_perfil" varchar,
  "nombres" varchar,
  "apellidos" varchar,
  "dui" varchar UNIQUE,
  "telefono" varchar,
  "correo" varchar UNIQUE,
  "password_temporal" varchar,
  "password_permanente" varchar,
  "rol_id" varchar,
  "cuadrilla_id" varchar,
  "activo" bool DEFAULT true,
  "created_at" timestamp,
  "updated_at" timestamp
);

CREATE TABLE "roles" (
  "id" varchar PRIMARY KEY,
  "nombre_rol" varchar UNIQUE,
  "descripcion" varchar,
  "es_sistema" bool DEFAULT false,
  "activo" bool DEFAULT true,
  "created_at" timestamp
);

CREATE TABLE "permisos_modulos" (
  "id" varchar PRIMARY KEY,
  "codigo_modulo" varchar,
  "nombre_modulo" varchar,
  "descripcion" varchar,
  "activo" bool DEFAULT true
);

CREATE TABLE "roles_permisos" (
  "id" varchar PRIMARY KEY,
  "rol_id" varchar,
  "permiso_modulo_id" varchar,
  "ver" bool DEFAULT false,
  "agregar" bool DEFAULT false,
  "editar" bool DEFAULT false,
  "borrar" bool DEFAULT false,
  "exportar" bool DEFAULT false,
  "created_at" timestamp
);

CREATE TABLE "cuadrillas" (
  "id" varchar PRIMARY KEY,
  "dpto_id" varchar,
  "nombre_cuadrilla" varchar,
  "activo" bool DEFAULT true,
  "created_at" timestamp
);

CREATE TABLE "cuadrilla_integrantes" (
  "id" varchar PRIMARY KEY,
  "cuadrilla_id" varchar,
  "usuario_id" varchar,
  "es_lider" bool DEFAULT false,
  "created_at" timestamp
);

CREATE TABLE "sesion_impersonaciones" (
  "id" varchar PRIMARY KEY,
  "superadmin_id" varchar,
  "usuario_impersonado_id" varchar,
  "motivo_soporte" text,
  "fecha_inicio" timestamp,
  "fecha_fin" timestamp,
  "ip_origen" varchar,
  "token_sesion" text
);

CREATE TABLE "estados_casos" (
  "id" varchar PRIMARY KEY,
  "codigo" varchar UNIQUE,
  "nombre_estado" varchar,
  "orden_estado" int,
  "es_final" bool DEFAULT false,
  "activo" bool DEFAULT true
);

CREATE TABLE "prioridades" (
  "id" varchar PRIMARY KEY,
  "codigo" varchar UNIQUE,
  "nombre_prioridad" varchar,
  "nivel" int,
  "color" varchar,
  "tiempo_objetivo_horas" int
);

CREATE TABLE "canales_reporte" (
  "id" varchar PRIMARY KEY,
  "nombre_canal" varchar,
  "activo" bool DEFAULT true
);

CREATE TABLE "categorias_casos" (
  "id" varchar PRIMARY KEY,
  "codigo" varchar UNIQUE,
  "nombre_categoria" varchar,
  "descripcion" varchar,
  "icono" varchar,
  "color_hexadecimal" varchar,
  "dpto_id" varchar,
  "prioridad_id" varchar,
  "requiere_ubicacion" bool DEFAULT true,
  "activo" bool DEFAULT true,
  "created_at" timestamp
);

CREATE TABLE "casos" (
  "id" varchar PRIMARY KEY,
  "categoria_caso_id" varchar,
  "distrito_id" varchar,
  "dpto_id" varchar,
  "canal_reporte_id" varchar,
  "creado_por" varchar,
  "usuario_responsable" varchar,
  "cuadrilla_responsable" varchar,
  "estado_id" varchar,
  "prioridad_id" varchar,
  "correlativo" varchar UNIQUE,
  "titulo" varchar,
  "descripcion" longtext,
  "direccion_referencia" varchar,
  "ubicacion_gps" varchar,
  "fecha_hora_recibido" datetime,
  "fecha_hora_cierre" datetime,
  "observaciones_internas" text,
  "created_at" timestamp,
  "updated_at" timestamp,
  "deleted_at" timestamp
);

CREATE TABLE "casos_adjuntos" (
  "id" varchar PRIMARY KEY,
  "caso_id" varchar,
  "tipo_archivo" varchar,
  "es_evidencia" bool DEFAULT false,
  "foto_url_supabase" varchar,
  "foto_url_backup" varchar,
  "mime_type" varchar,
  "hash_sha256" text,
  "created_at" timestamp
);

CREATE TABLE "casos_derivaciones" (
  "id" varchar PRIMARY KEY,
  "caso_id" varchar,
  "dpto_origen_id" varchar,
  "dpto_destino_id" varchar,
  "derivado_por_usuario_id" varchar,
  "motivo_derivacion" text,
  "created_at" timestamp
);

CREATE TABLE "historial_estados_casos" (
  "id" varchar PRIMARY KEY,
  "caso_id" varchar,
  "estado_id" varchar,
  "cambiado_por_usuario_id" varchar,
  "observaciones" text,
  "created_at" timestamp
);

CREATE TABLE "plantillas_documento" (
  "id" varchar PRIMARY KEY,
  "codigo_plantilla" varchar UNIQUE,
  "nombre_plantilla" varchar,
  "tipo_formato" varchar,
  "tipo_uso" varchar,
  "dpto_id" varchar,
  "categoria_caso_id" varchar,
  "contenido_html_plantilla" longtext,
  "esquema_excel_json" longtext,
  "descripcion" text,
  "es_oficial" bool DEFAULT true,
  "activa" bool DEFAULT true,
  "created_at" timestamp,
  "updated_at" timestamp
);

CREATE TABLE "plantillas_versiones" (
  "id" varchar PRIMARY KEY,
  "plantilla_id" varchar,
  "version_numero" int,
  "es_vigente" bool DEFAULT false,
  "contenido_estructura" longtext,
  "creado_por_usuario_id" varchar,
  "created_at" timestamp
);

CREATE TABLE "documentos_emitidos" (
  "id" varchar PRIMARY KEY,
  "plantilla_id" varchar,
  "plantilla_version_id" varchar,
  "caso_id" varchar,
  "generado_por_usuario_id" varchar,
  "tipo_documento" varchar,
  "nombre_archivo" varchar,
  "url_archivo_supabase" varchar,
  "parametros_filtros_json" text,
  "hash_sha256" text,
  "created_at" timestamp
);

CREATE TABLE "bitacora_auditoria" (
  "id" varchar PRIMARY KEY,
  "usuario_id" varchar,
  "fue_impersonado" bool DEFAULT false,
  "superadmin_real_id" varchar,
  "accion" varchar,
  "tabla_afectada" varchar,
  "registro_id" varchar,
  "valores_anteriores_json" text,
  "valores_nuevos_json" text,
  "ip_cliente" varchar,
  "created_at" timestamp
);

CREATE UNIQUE INDEX ON "roles_permisos" ("rol_id", "permiso_modulo_id");

CREATE UNIQUE INDEX ON "cuadrilla_integrantes" ("cuadrilla_id", "usuario_id");

CREATE UNIQUE INDEX ON "plantillas_versiones" ("plantilla_id", "version_numero");

COMMENT ON COLUMN "dpto"."jefe_dpto_id" IS 'FK a usuarios.id si aplica';

COMMENT ON COLUMN "usuarios"."id" IS 'Sincronizado con Supabase Auth (auth.users.id)';

COMMENT ON COLUMN "roles"."nombre_rol" IS 'Ej: superadmin, admin, operador, jefe_cuadrilla';

COMMENT ON COLUMN "roles"."es_sistema" IS 'Si es true, no se puede eliminar';

COMMENT ON COLUMN "permisos_modulos"."codigo_modulo" IS 'Ej: casos, usuarios, reportes, plantillas, cuadrillas';

COMMENT ON COLUMN "sesion_impersonaciones"."superadmin_id" IS 'SuperAdmin que toma el control';

COMMENT ON COLUMN "sesion_impersonaciones"."usuario_impersonado_id" IS 'Usuario que está siendo suplantado para soporte';

COMMENT ON COLUMN "sesion_impersonaciones"."motivo_soporte" IS 'Justificación del soporte o resolución de falla';

COMMENT ON COLUMN "prioridades"."nivel" IS 'Nivel numérico del 1 al 5';

COMMENT ON COLUMN "canales_reporte"."nombre_canal" IS 'Ej: Call Center, App Móvil, Web, Presencial';

COMMENT ON COLUMN "categorias_casos"."dpto_id" IS 'Departamento responsable por defecto';

COMMENT ON COLUMN "casos"."dpto_id" IS 'Departamento que tiene actualmente asignado el caso';

COMMENT ON COLUMN "casos"."ubicacion_gps" IS 'Coordenadas Lat,Lng';

COMMENT ON COLUMN "casos_adjuntos"."tipo_archivo" IS 'foto, video, audio, documento';

COMMENT ON COLUMN "plantillas_documento"."tipo_formato" IS 'pdf, xlsx';

COMMENT ON COLUMN "plantillas_documento"."tipo_uso" IS 'comprobante_denuncia, reporte_general, informe_intervencion';

COMMENT ON COLUMN "plantillas_documento"."dpto_id" IS 'Null si aplica a todo el sistema';

COMMENT ON COLUMN "plantillas_documento"."categoria_caso_id" IS 'Null si es general para el departamento';

COMMENT ON COLUMN "plantillas_documento"."contenido_html_plantilla" IS 'Para renders en PDF vía motores HTML';

COMMENT ON COLUMN "plantillas_documento"."esquema_excel_json" IS 'Estructura/mapeo de celdas para exports XLSX';

COMMENT ON COLUMN "documentos_emitidos"."caso_id" IS 'Null si es un reporte general consolidado';

COMMENT ON COLUMN "documentos_emitidos"."tipo_documento" IS 'pdf, xlsx';

COMMENT ON COLUMN "documentos_emitidos"."parametros_filtros_json" IS 'Guarda rango de fechas, estados, etc., aplicados';

COMMENT ON COLUMN "bitacora_auditoria"."fue_impersonado" IS 'True si la acción la ejecutó un superadmin impersonando';

COMMENT ON COLUMN "bitacora_auditoria"."superadmin_real_id" IS 'ID real del superadmin si hubo impersonación';

COMMENT ON COLUMN "bitacora_auditoria"."accion" IS 'INSERT, UPDATE, DELETE, LOGIN, IMPERSONATE, EXPORT';

ALTER TABLE "distritos" ADD FOREIGN KEY ("municipio_id") REFERENCES "municipio" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "usuarios" ADD FOREIGN KEY ("distrito_id") REFERENCES "distritos" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "usuarios" ADD FOREIGN KEY ("dpto_id") REFERENCES "dpto" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "usuarios" ADD FOREIGN KEY ("rol_id") REFERENCES "roles" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "usuarios" ADD FOREIGN KEY ("cuadrilla_id") REFERENCES "cuadrillas" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "roles_permisos" ADD FOREIGN KEY ("rol_id") REFERENCES "roles" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "roles_permisos" ADD FOREIGN KEY ("permiso_modulo_id") REFERENCES "permisos_modulos" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "cuadrillas" ADD FOREIGN KEY ("dpto_id") REFERENCES "dpto" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "cuadrilla_integrantes" ADD FOREIGN KEY ("cuadrilla_id") REFERENCES "cuadrillas" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "cuadrilla_integrantes" ADD FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sesion_impersonaciones" ADD FOREIGN KEY ("superadmin_id") REFERENCES "usuarios" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sesion_impersonaciones" ADD FOREIGN KEY ("usuario_impersonado_id") REFERENCES "usuarios" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "categorias_casos" ADD FOREIGN KEY ("dpto_id") REFERENCES "dpto" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "categorias_casos" ADD FOREIGN KEY ("prioridad_id") REFERENCES "prioridades" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "casos" ADD FOREIGN KEY ("categoria_caso_id") REFERENCES "categorias_casos" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "casos" ADD FOREIGN KEY ("distrito_id") REFERENCES "distritos" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "casos" ADD FOREIGN KEY ("dpto_id") REFERENCES "dpto" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "casos" ADD FOREIGN KEY ("canal_reporte_id") REFERENCES "canales_reporte" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "casos" ADD FOREIGN KEY ("creado_por") REFERENCES "usuarios" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "casos" ADD FOREIGN KEY ("usuario_responsable") REFERENCES "usuarios" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "casos" ADD FOREIGN KEY ("cuadrilla_responsable") REFERENCES "cuadrillas" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "casos" ADD FOREIGN KEY ("estado_id") REFERENCES "estados_casos" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "casos" ADD FOREIGN KEY ("prioridad_id") REFERENCES "prioridades" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "casos_adjuntos" ADD FOREIGN KEY ("caso_id") REFERENCES "casos" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "casos_derivaciones" ADD FOREIGN KEY ("caso_id") REFERENCES "casos" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "casos_derivaciones" ADD FOREIGN KEY ("dpto_origen_id") REFERENCES "dpto" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "casos_derivaciones" ADD FOREIGN KEY ("dpto_destino_id") REFERENCES "dpto" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "casos_derivaciones" ADD FOREIGN KEY ("derivado_por_usuario_id") REFERENCES "usuarios" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "historial_estados_casos" ADD FOREIGN KEY ("caso_id") REFERENCES "casos" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "historial_estados_casos" ADD FOREIGN KEY ("estado_id") REFERENCES "estados_casos" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "historial_estados_casos" ADD FOREIGN KEY ("cambiado_por_usuario_id") REFERENCES "usuarios" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "plantillas_documento" ADD FOREIGN KEY ("dpto_id") REFERENCES "dpto" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "plantillas_documento" ADD FOREIGN KEY ("categoria_caso_id") REFERENCES "categorias_casos" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "plantillas_versiones" ADD FOREIGN KEY ("plantilla_id") REFERENCES "plantillas_documento" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "plantillas_versiones" ADD FOREIGN KEY ("creado_por_usuario_id") REFERENCES "usuarios" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "documentos_emitidos" ADD FOREIGN KEY ("plantilla_id") REFERENCES "plantillas_documento" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "documentos_emitidos" ADD FOREIGN KEY ("plantilla_version_id") REFERENCES "plantillas_versiones" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "documentos_emitidos" ADD FOREIGN KEY ("caso_id") REFERENCES "casos" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "documentos_emitidos" ADD FOREIGN KEY ("generado_por_usuario_id") REFERENCES "usuarios" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "bitacora_auditoria" ADD FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "bitacora_auditoria" ADD FOREIGN KEY ("superadmin_real_id") REFERENCES "usuarios" ("id") DEFERRABLE INITIALLY IMMEDIATE;
