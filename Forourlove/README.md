# FOL (For Our Love)
# FOL (For Our Love)

Proyecto web estático listo para:
- desplegar en Vercel
- empaquetar como APK con Capacitor
- sincronizar moods y stickers solo con Supabase

## Stack

- `index.html`
- `style.css`
- `app.js`
- Supabase Realtime (`moods`)
- Supabase Storage + tabla `stickers`
- PWA básica (`manifest.json`, `service-worker.js`)

## Reglas de persistencia local

La app usa `localStorage` **solo** para:
- `folUsername`: username local
- `folAvatar`: avatar local
- `folActivePairCode`: pairCode activo
- `folDarkMode`: preferencia de UI

Los **moods compartidos no se guardan en localStorage**. Se leen y escriben exclusivamente en Supabase.

## Configuración Supabase

### 1) Conectar la librería (index.html)
Agrega antes de `app.js`:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

### 2) Definir credenciales (app.js)
Define en `app.js`:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_STICKERS_BUCKET` (por defecto `stickers`)

### Tabla `moods`

Columnas esperadas:
- `id` (uuid, primary key)
- `pair_code` (text)
- `sender` (text)
- `img` (text)
- `label` (text)
- `mini_message` (text)
- `created_at` (timestamp default now())

### Tabla `stickers`

Columnas esperadas:
- `id` (uuid, primary key)
- `pair_code` (text)
- `img` (text)
- `label` (text)
- `mini` (text)
- `created_at` (timestamp default now())

### Storage

- bucket: `stickers`
- los archivos subidos se guardan por carpeta de `pairCode`
- después de subir, la app obtiene URL pública y la guarda en la tabla `stickers`

## Flujo funcional

1. El usuario elige `username` + avatar local.
2. Ambos dispositivos usan el mismo `pairCode`.
3. Cada mood enviado incluye `pair_code`, `sender`, `img`, `label`, `mini_message`.
4. La UI solo muestra moods y stickers del `pairCode` activo.
5. La app se suscribe en realtime a nuevos `INSERT` de `moods` y `stickers`.
6. Si llega un mood de la otra persona, aparece una notificación visual.

## Capacitor / Android WebView

La app está preparada para migrarse a Capacitor porque:
- no depende de Node en runtime
- usa rutas relativas
- funciona como web estática
- usa APIs compatibles con WebView moderno (`fetch`, `localStorage`, `getUserMedia` cuando el WebView/permisos lo permitan)

## Desarrollo local

Puedes servirla con cualquier servidor estático, por ejemplo:
- `python3 -m http.server 4173`

## Vercel

- no requiere build step
- `vercel.json` mantiene control de caché para `service-worker.js`

## UX incluida

- modo oscuro
- notificación visual al recibir mood
- widget flotante del último mood
- feedback visual al enviar
- editor de sticker con texto encima
- botón “It's show time” con animación
