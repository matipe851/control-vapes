# Control Vapes

Sistema de ventas y stock con usuario y contraseña. Funciona con GitHub Pages (la página) y Firebase (usuarios y base de datos), los dos gratis.

## 1. Crear Firebase (5 minutos)

1. Entrá a https://console.firebase.google.com y tocá **Crear un proyecto**. Ponele de nombre `control-vapes`. Google Analytics no hace falta.
2. En la página del proyecto tocá el ícono **</>** (Web). Ponele un apodo, no actives Hosting y tocá **Registrar app**.
3. Te muestra un bloque `const firebaseConfig = { ... }`. Copiá los valores y pegalos en **config.js**, reemplazando cada `PEGAR_AQUI`.
4. En el menú: **Compilación > Authentication > Comenzar > Correo electrónico/contraseña > Habilitar > Guardar**.
5. En el menú: **Compilación > Firestore Database > Crear base de datos**. Ubicación: `southamerica-east1 (São Paulo)`. Modo: **producción**.
6. En Firestore abrí la pestaña **Reglas**, borrá lo que hay, pegá el contenido de **firestore.rules** y tocá **Publicar**.

## 2. Subir a GitHub Pages

1. En GitHub: **New repository** y ponele de nombre `control-vapes`. Tiene que ser **Public** si tu cuenta es gratuita.
2. **Add file > Upload files**. Arrastrá `index.html`, `styles.css`, `app.js` y `config.js` (este último ya con tus datos), y tocá **Commit changes**.
3. **Settings > Pages**. En "Branch" elegí `main` y `/ (root)`, y tocá **Save**.
4. En 1 o 2 minutos aparece el link: `https://TU-USUARIO.github.io/control-vapes/`

## 3. Primer uso

1. Abrí el link y creá tu cuenta de **administrador**. La primera persona que entra queda como admin, así que hacelo vos antes de pasar el link. Los 10 sabores con su stock se cargan solos.
2. En **Stock** completá el costo y el precio de cada sabor.
3. En **Usuarios** creá a cada vendedor y pasales el link con su usuario y contraseña.

## Seguridad

- La `apiKey` de config.js no es secreta: Firebase está pensado para que vaya en la página. Lo que protege los datos son las reglas de Firestore. Solo entran usuarios dados de alta, y cada uno puede hacer solo lo que le permite su rol.
- Los vendedores cargan ventas y clientes y pueden borrar solo sus propias ventas. El admin maneja sabores, precios, compras y usuarios.
- Para dar de baja a alguien, borralo en **Usuarios** y pierde el acceso al instante.
- La página tiene `noindex`, así que no aparece en Google.
