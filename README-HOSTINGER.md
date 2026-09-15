# Despliegue en Hostinger Node.js

Esta aplicación usa Express en el servidor y MySQL en producción. La base SQLite (`sunquote.db`) se conserva únicamente para desarrollo local.

## Requisitos de Hostinger

Usa Node.js Web App Hosting en un plan compatible con Node.js, no un hosting PHP básico. Hostinger indica que las aplicaciones Node.js administradas están disponibles en planes Business y Cloud, y que MySQL es la base de datos disponible en hosting compartido/administrado.

## Preparación

1. Sube el proyecto a un repositorio GitHub privado. Antes de hacer el primer push, verifica que `.env`, `sunquote.db*`, `node_modules/` y los recibos subidos no estén incluidos.
2. En hPanel entra a **Websites → Add Website → Node.js Web App → Import Git Repository**.
3. Autoriza GitHub, selecciona el repositorio y la rama de producción (recomendado: `main`). Hostinger podrá redeplegar la app cuando publiques nuevos cambios en esa rama.
4. En la configuración de la aplicación selecciona Node.js 22, tipo `Other` si no detecta Express automáticamente, archivo de entrada `server.js` y el comando `npm start`.
5. No subas `.env`, `sunquote.db`, `sunquote.db-wal` ni `sunquote.db-shm` al repositorio.
6. En hPanel crea una base de datos MySQL y asigna el usuario a esa base.
7. Importa `database/schema.sql` desde phpMyAdmin, dentro de la base seleccionada. El archivo crea las tablas y la estructura multiempresa; no intenta crear otra base de datos.
8. Configura estas variables de entorno en hPanel:

```text
NODE_ENV=production
DB_HOST=localhost
DB_PORT=3306
DB_USER=usuario_mysql
DB_PASSWORD=contraseña_mysql
DB_NAME=base_mysql
GROQ_API_KEY=clave_groq
GROQ_MODEL=openai/gpt-oss-120b
```

9. Selecciona Node.js 20, 22 o una versión compatible con las dependencias del proyecto.
10. Usa `server.js` como archivo de inicio y `npm install --omit=optional` como instalación de dependencias. Esto evita compilar `better-sqlite3`, que solo se necesita para SQLite local; en producción la aplicación usa MySQL.
11. Abre `/health`; debe responder `{ "status": "ok" }`.
12. Crea el único superadmin después de configurar la base. El script detecta MySQL por `DB_HOST`, crea la empresa inicial y los perfiles necesarios:

```bash
SUPERADMIN_USERNAME=superadmin SUPERADMIN_PASSWORD='contraseña-segura' npm run create-superadmin
```

En hPanel puede ejecutarse desde la terminal de la aplicación. Si el panel no permite comandos posteriores al despliegue, ejecuta el mismo comando por SSH desde la carpeta del proyecto.

## Flujo de actualización desde GitHub

Después de validar un cambio localmente:

```bash
git add .
git commit -m "Describe el cambio"
git push origin main
```

Hostinger iniciará un nuevo despliegue desde la rama conectada. Después de cada despliegue revisa los logs, abre `/health` y confirma el login. Las variables de entorno permanecen en hPanel y no se almacenan en GitHub.

## PDF y lectura de recibos

La lectura de recibos usa PDF/OCR y la extracción de datos usa Groq. El PDF descargable que replica exactamente la vista previa requiere Chrome o Chromium disponible en el servidor. Si Hostinger ofrece una ruta compatible, configúrala con `CHROME_PATH`; si no, debe habilitarse un renderizador PDF alternativo antes de producción.

## Verificación posterior

- Login de administrador de empresa.
- Creación de clientes, equipos y cotizaciones.
- Creación de una empresa desde la cuenta superadmin.
- Login del administrador de la nueva empresa.
- Confirmar que no puede ver datos de otra empresa.
- Probar subida de recibo y Excel.
- Probar generación y descarga del PDF.

La importación del esquema no copia los datos actuales de `sunquote.db`; si necesitas conservar clientes, inventario y propuestas locales, hay que hacer una migración de datos separada antes de abrir el sistema a usuarios.

Nunca coloques claves de Groq, MySQL o contraseñas en GitHub ni en el frontend.
