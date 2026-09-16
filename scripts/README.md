# Scripts SQL

## Convención de nombres

Todo script nuevo lleva un **consecutivo de tres dígitos** al principio:

```
180_add_lo_que_sea.sql
181_verificar_lo_que_sea.sql
```

El número dice **en qué orden se fueron necesitando**, que es el orden en que
habría que correrlos en una instalación nueva. No es una fecha ni una versión.

**Para saber el siguiente número**, mira el último de la carpeta:

```bash
ls scripts/*.sql | sort | tail -1
```

## Las tres carpetas

| Carpeta | Serie | Qué contiene |
|---|---|---|
| `scripts/` | `001`–`179` | Todo lo general: permisos, columnas, vistas, correcciones |
| `scripts/sig/` | `01`–`60` | Sistema Integrado de Gestión. **Serie propia**, no se renumera |
| `scripts/auditoria/` | `01`–`04` | Triggers de auditoría. Serie propia |

`scripts/sig/` conserva su numeración porque ya está corrida en Supabase:
renumerarla rompería la correspondencia entre lo que dice el repositorio y lo
que se ejecutó.

## Dos tipos de script

- **`NNN_add_*.sql`** — cambia la base. Hay que correrlo.
- **`NNN_verificar_*.sql`** — solo lecturas. Sirve para comprobar que el
  anterior quedó bien, y se puede correr las veces que haga falta.

## Cómo se escribe uno

1. **Encabezado que explique el porqué**, no solo el qué. Quien lo lea dentro de
   un año necesita saber qué problema resolvía.
2. **Aditivo e idempotente**: `add column if not exists`, `create table if not
   exists`. Correrlo dos veces no puede romper nada.
3. **Verificación al final**, solo lecturas, para confirmar que quedó aplicado.
4. **Reversión comentada**, con la advertencia de lo que NO se revierte (un
   archivo ya subido a Storage, un movimiento de inventario ya hecho).

Si el script toca nómina, facturación o inventario, decirlo en el encabezado:
son los que mueven dinero y merecen una lectura distinta.
