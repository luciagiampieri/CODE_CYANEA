# 🐙 Cyanea - Gestión Integral de Viajes Grupales

> *“Muchas manos, un único destino”*

**Cyanea** es una plataforma digital colaborativa (móvil y web) diseñada para centralizar la logística y la información técnica de los viajes en grupo. El sistema optimiza las etapas de planificación, organización y ejecución de los itinerarios, mitigando la fragmentación de datos en canales externos (como WhatsApp o planillas de cálculo), agilizando la comunicación y estructurando la toma de decisiones mediante un sistema de votaciones democráticas.

Este desarrollo se realiza en el marco del **Proyecto Final de Carrera** para la carrera de **Ingeniería en Sistemas de Información** en la **Universidad Tecnológica Nacional - Facultad Regional Córdoba (UTN FRC)**.

---

## 👥 Integrantes del Equipo (Grupo 14)
* **Chialva, Fátima** - Legajo: 95147
* **Correa, Luciano Joaquín** - Legajo: 69323
* **Gatica, Andrea Ticiana** - Legajo: 94371
* **Giampieri, Lucia Belén** - Legajo: 96505 (**Product Owner**)
* **Paez, María Candela** - Legajo: 95256

**Directora / Tutora de Tesis:** Ing. Silvina Arenas

---

## 📁 Estructura del Repositorio de Código

El proyecto utiliza una arquitectura orientada a servicios (API-First) dividida en tres módulos principales dentro de la raíz `CODE_CYANEA`:

* **`backend/`**: Servidor API REST desarrollado en **Node.js** con **Express**, conectado a una base de datos **SQL (MySQL)**.
* **`frontend-web/`**: Portal web responsivo construido en **React.js** con **Vite**, optimizado para la fase de planificación previa compleja (armado de itinerarios, presupuestos base y votaciones estructurales).
* **`frontend-mobile/`**: Aplicación móvil híbrida desarrollada en **React Native** con **Expo**, optimizada para la fase de ejecución en territorio durante el viaje (carga ágil de gastos, consultas rápidas offline, notificaciones push y geolocalización).

---

## 🛠️ Requisitos Previos e Instalación

Para levantar el entorno completo de desarrollo de forma local, asegúrate de tener instalado **Node.js (versión LTS)** en tu sistema operativo.

### 1. Clonar el repositorio
```bash
git clone [https://github.com/tu-usuario/CODE_CYANEA.git](https://github.com/tu-usuario/CODE_CYANEA.git)
cd CODE_CYANEA
