# Guía de Configuración y Despliegue

## 1. Crear proyecto en Supabase (5 minutos)

1. Ve a https://supabase.com y crea una cuenta o inicia sesión.
2. Clic en **"New project"** → elige organización → escribe nombre y contraseña de BD → **Create project**.
3. En el panel del proyecto ve a **Settings → API** y copia:
   - **Project URL** → valor para `VITE_SUPABASE_URL`
   - **anon / public** key → valor para `VITE_SUPABASE_ANON_KEY`

## 2. Crear la tabla `projects`

1. En el panel de Supabase ve a **SQL Editor**.
2. Copia y ejecuta el contenido de `supabase/migrations/20260525000000_create_projects.sql`.

   Esto crea la tabla, activa RLS con acceso de lectura/escritura para usuarios autenticados, y habilita actualizaciones en tiempo real.

## 3. Probar en local

1. Crea el archivo `.env.local` en la raíz del proyecto con:
   ```
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-anon-key
   ```
2. Ejecutar:
   ```bash
   npm install
   npm run dev
   ```
3. Abre http://localhost:5173 e inicia sesión.

## 4. Desplegar en Netlify

### Opción A — Drag & Drop (más rápido)
1. Ejecuta `npm run build` → se genera la carpeta `dist/`
2. Ve a https://netlify.com → Log in
3. Arrastra la carpeta `dist/` al área de deploy de Netlify

### Opción B — GitHub + Auto-deploy (recomendado)
1. Sube este proyecto a un repositorio de GitHub
2. En Netlify → **"Add new site"** → **"Import from Git"**
3. Conecta tu repositorio
4. Build command: `npm run build`
5. Publish directory: `dist`
6. Ve a **Site configuration → Environment variables** y añade las 2 variables de Supabase:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

---

Una vez desplegado, cualquier usuario autenticado puede ver y gestionar proyectos en tiempo real desde cualquier pestaña o dispositivo.
