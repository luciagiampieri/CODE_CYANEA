# Testing del frontend (Cyanea)

Este documento son las reglas que seguimos para escribir y mantener tests en
`frontend/`. El objetivo no es llegar al 100% de cobertura de un día para el
otro, sino que **la cobertura solo pueda subir, nunca bajar**, y que cada test
nuevo aporte confianza real (no un test que "pasa" pero no prueba nada).

Estado de partida (24/08/2026): ~4.5% de statements cubiertos. El piso de
cobertura en `package.json` arranca ahí a propósito — ver "Regla del piso
creciente" más abajo. Al sumar los tests de `AddGastoScreen` subió a ~7.3%.

## Stack

- Runner: `jest` con preset `jest-expo`
- Render/interacción: `@testing-library/react-native`
- Comandos:
  - `npm test` — corre toda la suite
  - `npm run test:watch` — modo watch mientras desarrollás
  - `npm run test:coverage` — corre con reporte de cobertura y aplica el piso

## 1. Dónde va cada test

Todo vive en `frontend/src/tests/`, un archivo por pantalla/componente/util,
con el mismo nombre que lo que testea:

```
src/utils/routeMarkers.js        -> src/tests/routeMarkers.test.js
src/screens/LoginScreen.js       -> src/tests/LoginScreen.test.js
src/components/ui/Avatar.js      -> src/tests/Avatar.test.js
```

Si el archivo prueba una User Story puntual, poné el número/nombre de la US
en el `describe` raíz (ya lo venís haciendo):

```js
describe("US 62 - Generar rutas automáticas", () => { ... });
```

## 2. Los dos tipos de test que vas a escribir

### A) Lógica pura (`utils/`) — la prioridad #1

Si una función no importa React ni hace fetch, se testea sin mockear nada:
input → output. Son los más baratos de escribir, los más rápidos de correr,
y los que menos se rompen con el tiempo. **Antes de tocar una pantalla
grande, preguntate si la lógica que querés probar se puede sacar a un
`utils/` primero.** Ejemplos ya en el repo: `routeMarkers.js`,
`itinerarioOverlaps.js`, `polyline.js`.

```js
import { calcularActividadesSolapadas } from "../utils/itinerarioOverlaps";

it("marca ambas actividades cuando sus horarios se solapan", () => {
  const actividades = [
    { id: 1, horaInicio: "09:00", horaFin: "10:30" },
    { id: 2, horaInicio: "10:00", horaFin: "11:00" },
  ];
  expect(calcularActividadesSolapadas(actividades)).toEqual(new Set([1, 2]));
});
```

### B) Pantallas y componentes — siempre mockeando

Nunca se pega a la red de verdad ni a `AsyncStorage`/SQLite real. Reglas
fijas, tomadas de `EditDocumentScreen.test.js` y `logout.test.js`:

1. **Mockeá `../services/api` siempre**, aunque uses una sola función:
   ```js
   jest.mock("../services/api", () => ({
     getTripDetail: jest.fn(),
     generateTripRoute: jest.fn(),
   }));
   ```
2. **Cómo elegir un input cuando no hay `placeholder` ni label accesible.**
   Esta versión de `@testing-library/react-native` (v14) **no tiene**
   `UNSAFE_getByType`/`UNSAFE_root` — no sirven como escape hatch. Orden de
   preferencia para targetear un campo:
   1. `getByPlaceholderText(...)` si el input tiene placeholder (caso
      `AddGastoScreen`).
   2. `getByTestId(...)` si no lo tiene. Agregá el `testID` directo en el
      JSX de la pantalla (sin tocar el componente reutilizable, si es que
      ya reenvía props extra al `TextInput`, como pasa con `Field` en
      `LoginScreen`). Convención de nombre: `"<pantalla>-<campo>-input"`,
      ej. `testID="login-email-input"`.
   3. Si ninguna de las dos aplica, es momento de agregarle
      `accessibilityLabel` al input y usar `getByLabelText(...)` — mejora
      la pantalla para lectores de pantalla de paso.

   Para un `Switch` (no tiene texto ni placeholder): siempre `testID`, y
   para togglearlo se usa `fireEvent(elemento, "valueChange", true)` en vez
   de `fireEvent.press` (el evento que expone `Switch` es `onValueChange`,
   no `onPress`). Ver `RegisterScreen.test.js` (`toggleTerminos`).
3. **Si una pantalla usa `@expo/vector-icons` (o cualquier componente que
   haga `setState` async al montarse), no alcanza con `fireEvent.press(...)`
   seguido de `waitFor(...)`.** En este proyecto ese combo puede quedar en
   un estado donde el update nunca se aplica (ni con `waitFor` esperando).
   La solución que probamos y confirmamos que funciona: envolver **cada**
   interacción en `act(async () => { fireEvent.press(...) })`. Ver
   `AddGastoScreen.test.js` (funciones `press` / `escribir`) para el patrón
   completo, copiable a cualquier pantalla nueva.
   ```js
   import { act, fireEvent } from "@testing-library/react-native";

   await act(async () => {
     fireEvent.press(getByText("Guardar"));
   });
   ```
4. **Mockeá los componentes de layout/UI pesados** que no son objeto del
   test (`ScreenContainer`, botones custom) devolviendo una versión mínima
   con `testID`, para poder interactuar sin renderizar todo su árbol real.
5. **Nunca uses `setTimeout`/sleeps para esperar un efecto.** Usá siempre
   `waitFor(() => expect(...))` de RTL. Un test que espera con timers fijos
   es un test flaky en potencia.
6. **Ojo con textos duplicados por componentes compartidos.** `AuthSwitch`
   se usa tanto en `LoginScreen` como en `RegisterScreen` y tiene una tab
   que dice "Crear cuenta" — si el botón de submit de `RegisterScreen`
   también dice "Crear cuenta", `getByText("Crear cuenta")` tira "Found
   multiple elements". La salida más simple: `testID` en el botón que te
   interesa (`register-submit-button`) en vez de pelear con el texto.
7. **Para pantallas con selector de fecha nativo
   (`@react-native-community/datetimepicker`)**: no intentes interactuar
   con el picker real (depende de módulos nativos). Mockealo con un
   componente simple que dispare `onChange` con una fecha fija al
   presionarlo. Ver `CreateTripScreen.test.js` / `EditTripScreen.test.js`:
   ```js
   jest.mock("@react-native-community/datetimepicker", () => {
     const ReactActual = require("react");
     const { Pressable, Text } = require("react-native");
     return function MockDateTimePicker({ onChange }) {
       return ReactActual.createElement(
         Pressable,
         { testID: "mock-date-picker-confirm", onPress: () => onChange({}, new Date("2030-09-10T12:00:00")) },
         ReactActual.createElement(Text, null, "Confirmar fecha (mock)")
       );
     };
   });
   ```
   Si hay dos campos de fecha vacíos a la vez, van a colisionar en el texto
   del botón ("Seleccionar fecha" x2) — usá `getAllByText(...)[0]` para el
   primero en vez de `getByText`.
8. Cubrí, como mínimo, para cada pantalla con lógica no trivial:
   - el camino feliz (render inicial + acción exitosa)
   - al menos un camino de error (la pantalla debe mostrar el mensaje, no
     solo no explotar)
   - los casos límite mencionados en los criterios de aceptación de la US

## 3. Qué NO hacer

- No testear implementación interna (nombres de variables de estado, si se
  llamó `setX`). Testeá lo que el usuario ve o lo que se le manda a la API.
- No dejar un `console.error` de React (`act(...)`) sin resolver — es señal
  de un `setState` fuera de `waitFor`, y tarde o temprano hace flaky el test.
  *(Ya hay uno así en `EditDocumentScreen.test.js` — está en el backlog,
  ver más abajo).*
- No agregar `it.skip` a un test que falla "para arreglarlo después". Si no
  se puede arreglar ya, se borra o se abre una tarea puntual para eso.

## 4. Regla del piso creciente (coverage ratchet)

En `package.json` hay un `coverageThreshold.global.statements` que hoy vale
`4` (el baseline actual). Regla del equipo:

> **Cada vez que una US toque una pantalla o util nuevo y le sume test,
> subí el número del piso al valor real que reporta `npm run test:coverage`
> (redondeando hacia abajo).** Nunca lo bajes. Así el CI evita que la
> cobertura retroceda sin que nadie tenga que discutirlo a mano.

No es una meta de "% total" fija — es un candado de un solo sentido.

## 5. Definition of Done, agregado

Para toda US nueva que toque frontend:

- [ ] Si agregaste lógica no trivial, ¿está en un `utils/` testeable sin
      mocks?
- [ ] ¿Hay un test que cubra el camino feliz de la pantalla/componente que
      tocaste?
- [ ] ¿Hay un test que cubra al menos un caso de error de esa misma US?
- [ ] `npm run test:coverage` corre en verde localmente
- [ ] Si subió la cobertura, actualizaste el piso en `package.json`

## 6. Backlog de deuda técnica (priorizado)

No es necesario testear todo esto ya — es el orden sugerido para ir
sumando, de mayor a menor impacto/riesgo:

**Prioridad alta (dinero, autenticación, alta de datos):**
- ~~`AddGastoScreen` — carga y cálculo de gastos compartidos~~ ✅ hecho
  (`AddGastoScreen.test.js`: carga inicial, validaciones, alta exitosa,
  fallback offline al fallar el guardado, y sin conexión + sin caché al
  cargar)
- ~~`LoginScreen` / `RegisterScreen` — si se rompen, nadie entra a la app~~
  ✅ ambos hechos. `RegisterScreen.test.js`: render, validación completa en
  vacío, formato de email, complejidad de contraseña, confirmación que no
  coincide, alta exitosa con navegación, error 422 de email del backend,
  error genérico del backend, error de red, navegación a login.
- `CreateTripScreen` / `EditTripScreen` ✅ hechos.
  `CreateTripScreen.test.js`: carga de admin, validación en vacío, buscar y
  agregar destino, alta exitosa (con mock de `DateTimePicker`, ver más
  abajo), error del servidor, cancelar. `EditTripScreen.test.js`: carga de
  datos existentes, error de carga, bloqueo de "fecha ida" cuando el viaje
  ya comenzó, validación, guardado exitoso (incluye el `goBack()` diferido
  900ms), error del servidor.

  **Bug real encontrado y corregido por el test**: en `CreateTripScreen.js`,
  `errors.destinations` se calculaba en `validateForm()` pero nunca se
  renderizaba en ningún lado — el usuario apretaba "Crear viaje" sin
  destinos y no pasaba nada, sin ningún mensaje explicando por qué. El test
  de validación en vacío lo hizo evidente de inmediato. Se agregó el
  `<Text>{errors.destinations}</Text>` que faltaba (el patrón ya existía en
  `EditTripScreen.js`, que sí lo tenía bien). Este es exactamente el tipo
  de cosa que una suite de tests encuentra antes que un usuario real.

**Prioridad media (flujos core del producto):**
- `AddActivityScreen`, `CrearVotacionScreen`, `DocumentsScreen`
- ~~`gastosLocal.js` (cola offline)~~ ✅ hecho (`gastosLocal.test.js`:
  guardar/leer offline en web vs nativo, error de SQLite, sincronización
  exitosa con borrado de cola, corte si falla un gasto, doble
  sincronización simultánea bloqueada, caché de categorías)

**Prioridad baja pero rápida (componentes chicos, buen calentamiento):**
- `components/ui/*` (Avatar, StatusPill, MetricCard, PrimaryButton,
  IconCircleButton, AvatarStack, AuthSwitch) — presentacionales, se testean
  en minutos y ya dan práctica con RTL
- `hooks/useResponsive`, `hooks/useItinerarioViewPreference`

**Caso especial — pantallas "god component" (`TripDetailScreen`,
`ExplorePlacesScreen`):** antes de escribirles un test gigante que mockea 10
cosas, evaluar extraer la sección puntual que se quiere probar a un
componente propio (p. ej. una sección de ruta, una sección de gastos). Se
gana testeabilidad y se mejora el diseño al mismo tiempo.

## 7. Troubleshooting: "me tira timeout / me fallan tests que no toqué" (Windows)

Si corrés `npm test` en Windows y ves errores como:

```
thrown: "Exceeded timeout of 5000 ms for a test."
```

...especialmente en el **primer test de cada archivo**, y hasta en archivos
que no tocaste (como `logout.test.js`), **no es un bug en el test ni en tu
código**. Es que Jest tiene un timeout por test de 5000ms por defecto, y el
primer render de cada archivo paga el costo de arrancar el motor de React
Native + cargar las fuentes de los íconos, que en Windows suele ser mucho
más lento que en Linux/Mac — sobre todo si el antivirus (Windows Defender)
escanea cada acceso a `node_modules` en tiempo real.

Qué hacer, en orden:

1. **Ya está resuelto en `package.json`**: subimos `testTimeout` a 20000ms
   a nivel global. Si con eso ya te pasa, no necesitás hacer nada más.
2. Si te sigue pasando, corré `npm run test:slow` (usa `--runInBand`, corre
   los archivos de test de a uno en vez de en paralelo — en máquinas con
   pocos núcleos o con antivirus activo suele ser bastante más rápido que
   la corrida paralela por defecto).
3. Agregá una excepción en Windows Defender para la carpeta del proyecto
   (o al menos `node_modules`). Esto solo lo podés hacer vos localmente,
   no es algo que se resuelva desde el código.
4. El CI (GitHub Actions) corre en Linux, así que este problema es
   exclusivamente de entornos de desarrollo Windows — no debería
   reproducirse ahí. Si el CI se pone rojo mientras localmente te corre
   bien, es una señal real, no ruido de entorno.

## 8. Deuda conocida

- `EditDocumentScreen.test.js` tiene un warning intermitente de React
  (`act(...)`) que a veces hace fallar la suite bajo `--coverage`. Causa:
  un `setState` async no envuelto en `waitFor`. Pendiente de arreglo.