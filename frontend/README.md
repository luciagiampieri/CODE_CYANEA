# Frontend

Frontend activo de Cyanea implementado con Expo.

## Objetivo

- mantener un unico codigo para mobile y web
- portar el flujo principal del MVP a React Native
- centralizar la identidad visual en tokens compartidos

## Stack

- Expo
- React Native
- React Navigation
- Expo Web
- `cross-env` para fijar `EXPO_NO_METRO_WORKSPACE_ROOT=1` en scripts locales

## Estructura relevante

```text
src/
|- components/
|- hooks/
|- navigation/
|- screens/
|- services/
`- theme/
```

## Reglas

- `frontend/` es el unico frontend activo
- `frontend-ant/` queda como respaldo de referencia y no debe recibir nuevas funcionalidades
- no reintroducir CSS global para pantallas Expo; la identidad visual se centraliza en `src/theme/tokens.js`
- si cambia un criterio estructural o visual, actualizar `../AGENTS.md`

## Arranque

```powershell
copy .env.example .env
npm install
npm run web
```

Notas:

- el frontend web local levanta en `http://localhost:8081`
- los scripts ya incluyen `EXPO_NO_METRO_WORKSPACE_ROOT=1`, no hace falta exportarlo a mano
