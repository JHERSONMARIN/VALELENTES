# VALE-LENTES by VT VALETEC - Sistema POS & Gestión para Óptica (Docker Local)

Sistema de Punto de Venta (POS), Gestión de Inventario Óptico (Monturas, Lunas, Lentes de Sol, Lentes de Contacto), CRM de Clientes con historial de recetas visuales, Módulo de Créditos/Fiados, Arqueo de Caja (Turno Z) y Reportes optimizado para ejecución local en contenedores Docker mediante **Docker Compose**.

---

## 🏛️ Estándares Técnicos y Gobernanza

Este repositorio cumple estrictamente con los lineamientos especificados en la [Constitución de Desarrollo VT VALETEC](constitution.md):
- **Código y Nombres de Archivo:** Estándar internacional en inglés.
- **Documentación y Comentarios:** Redactados en español.
- **Seguridad:** Uso obligatorio de variables de entorno (`.env`) sin datos confidenciales incrustados.

---

## 🚀 Instalación y Pruebas Locales

1. Asegúrate de tener **Docker Desktop** activo en la computadora.
2. Iniciar con un solo clic:
   - Doble clic en `iniciar_valelentes.bat` (inicia contenedores y abre la aplicación en modo App).
   - O bien crea el acceso directo en el escritorio con `crear_acceso_directo.bat`.
3. O mediante terminal:
   ```bash
   docker compose up -d --build
   ```
4. Acceso a las aplicaciones:
   - **Frontend (Interfaz POS Óptica):** [http://localhost:3008](http://localhost:3008)
   - **Backend (API REST Express):** [http://localhost:8098/api/dashboard](http://localhost:8098/api/dashboard)
   - **Credenciales por defecto:**
     - Admin: `admin` / `admin123`
     - Cajero: `cajero` / `cajero123`

---

## 🛠️ Servicios y Puertos Configurados

| Servicio | Contenedor | Puerto Host | Puerto Interno | Descripción |
| :--- | :--- | :---: | :---: | :--- |
| **Frontend** | `valelentes-frontend` | `3008` | `80` | Servidor Web Nginx con proxy inverso hacia la API y WebSockets. |
| **Backend** | `valelentes-backend` | `8098` | `8090` | Servidor API Node.js / Express con Socket.io en tiempo real. |
| **Database** | `valelentes-db` | `5448` | `5432` | Base de datos relacional PostgreSQL 16 Alpine. |

---

## 🔒 Persistencia de Datos

Toda la información (ventas, catálogo óptico, clientes, arqueos y deudas) se almacena localmente en PostgreSQL con volumen persistente montado en `./postgres-data`. Los datos se conservan íntegros al reiniciar o detener los contenedores.
