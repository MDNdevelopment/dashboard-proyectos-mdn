# Guía de Configuración y Despliegue

## 1. Crear proyecto en Firebase (5 minutos)

1. Ve a https://console.firebase.google.com
2. Clic en **"Añadir proyecto"** → escribe el nombre → continuar
3. En el panel del proyecto, clic en el ícono **`</>`** (Web) para registrar la app
4. Escribe un nombre de app (ej: `dashboard`) → clic en **"Registrar app"**
5. Copia los valores del objeto `firebaseConfig` que aparece — los necesitarás luego

## 2. Activar Firestore

1. En el menú izquierdo de Firebase → **Firestore Database**
2. Clic en **"Crear base de datos"**
3. Seleccionar **"Iniciar en modo de prueba"** → Siguiente → Listo

### Reglas de seguridad (para acceso público)

Ve a Firestore → pestaña **Reglas** → pega esto y publica:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

## 3. Probar en local

1. Copia `.env.example` como `.env.local`
2. Rellena los valores de Firebase:
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   ```
3. Ejecutar:
   ```bash
   npm install
   npm run dev
   ```
4. Abre http://localhost:5173

## 4. Desplegar en Netlify

### Opción A — Drag & Drop (más rápido)
1. Ejecuta `npm run build` → se genera la carpeta `dist/`
2. Ve a https://netlify.com → Log in
3. Arrastra la carpeta `dist/` al área de deploy de Netlify
4. Netlify te da el link en segundos

### Opción B — GitHub + Auto-deploy (recomendado)
1. Sube este proyecto a un repositorio de GitHub
2. En Netlify → **"Add new site"** → **"Import from Git"**
3. Conecta tu repositorio
4. Build command: `npm run build`
5. Publish directory: `dist`
6. Ve a **Site configuration → Environment variables** y añade las 6 variables de Firebase

### Variables de entorno en Netlify
Ve a: Site → Site configuration → Environment variables → Add variable

Añade cada una de las 6 variables `VITE_FIREBASE_*` con sus valores reales.

---

Una vez desplegado, el link es permanente y cualquier persona que lo abra verá los proyectos en tiempo real.
