# Testing del frontend (Cyanea)

Este documento son las reglas que seguimos para escribir y mantener tests en
`frontend/`. El objetivo no es llegar al 100% de cobertura de un día para el
otro, sino que **la cobertura solo pueda subir, nunca bajar**, y que cada test
nuevo aporte confianza real (no un test que "pasa" pero no prueba nada).

Estado de partida (24/08/2026): ~4.5% de statements cubiertos. Última
actualización de este documento (27/08/2026): ~30% de statements, con
`components/ui`, `components/home`, `hooks/` y buena parte de
`components/trip` ya al 100%. Ver el detalle en la sección 6.

⚠️ **El % exacto puede haber cambiado desde que se escribió esto.** No lo
tomes como verdad absoluta — corré `npm run test:coverage` y confiá en eso.
Este documento describe patrones y decisiones, no un número fijo.

## Stack

- Runner: `jest` con preset `jest-expo`
- Render/interacción: `@testing-library/react-native` v14
- Comandos:
  - `npm test` — corre toda la suite
  - `npm test -- NombreDelArchivo` — corre solo los archivos que matcheen ese nombre
  - `npm test -- NombreDelArchivo -t "parte del nombre del test"` — corre un test puntual
  - `npm run test:watch` — modo watch mientras desarrollás
  - `npm run test:coverage` — corre con reporte de cobertura y aplica el piso
  - `npm run test:slow` (`--runInBand`) — corre todo en serie; usalo si `npm test`
    te da resultados que no logras reproducir aislando el archivo (ver punto 9)

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
2. **`render()` y `renderHook()` de RTL son async en este proyecto.** Siempre
   `await render(...)` / `await renderHook(...)`. Si te olvidás el `await`,
   el objeto devuelto no tiene ninguna de las queries (`getByText` etc.
   directamente no existen) y el error es confuso ("`getByText` is not a
   function"). Es la causa #1 de tests que fallan raro al copiar un patrón
   viejo.
3. **Cómo elegir un input cuando no hay `placeholder` ni label accesible.**
   Esta versión de RTL (v14) **no tiene** `UNSAFE_getByType` / `UNSAFE_root`
   / `UNSAFE_getByProps` — ninguna sirve como escape hatch, ni para inputs ni
   para otros componentes (p. ej. una `<Image>` sin testID). Orden de
   preferencia para targetear un elemento:
   1. `getByPlaceholderText(...)` si el input tiene placeholder (caso
      `AddGastoScreen`).
   2. `getByTestId(...)` si no lo tiene. Agregá el `testID` directo en el
      JSX de la pantalla/componente (sin tocar el componente reutilizable, si
      es que ya reenvía props extra al `TextInput`, como pasa con `Field` en
      `LoginScreen`). Convención de nombre: `"<pantalla>-<campo>-input"` para
      inputs, `"<pantalla>-<acción>-<id>"` para botones repetidos dentro de
      un `.map` (ej. `testID="votacion-quitar-propuesta-${index}"`,
      `testID="participant-remove-${participant.key}"`).
   3. Si ninguna de las dos aplica, es momento de agregarle
      `accessibilityLabel` al input y usar `getByLabelText(...)` — mejora
      la pantalla para lectores de pantalla de paso.
   4. **Caso especial: verificar que se usó una `<Image>` sin testID
      disponible** (p. ej. `uploadProfilePhoto`, `Avatar`). Sin
      `UNSAFE_getByProps`, la forma de chequearlo es con `toJSON()`:
      ```js
      const { toJSON, queryByText } = await render(<Avatar imageUrl="..." />);
      expect(queryByText("LG")).toBeNull(); // no cayó al fallback de iniciales
      expect(JSON.stringify(toJSON())).toContain("https://.../foto.jpg");
      ```

   Para un `Switch` (no tiene texto ni placeholder): siempre `testID`, y
   para togglearlo se usa `fireEvent(elemento, "valueChange", true)` en vez
   de `fireEvent.press` (el evento que expone `Switch` es `onValueChange`,
   no `onPress`). Ver `RegisterScreen.test.js` (`toggleTerminos`).
4. **Si una pantalla usa `@expo/vector-icons` (o cualquier componente que
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
5. **Mockeá los componentes de layout/UI pesados** que no son objeto del
   test (`ScreenContainer`, botones custom) devolviendo una versión mínima
   con `testID`, para poder interactuar sin renderizar todo su árbol real.
6. **Nunca uses `setTimeout`/sleeps para esperar un efecto.** Usá siempre
   `waitFor(() => expect(...))` de RTL. Un test que espera con timers fijos
   es un test flaky en potencia.
7. **Ojo con textos duplicados.** Pasa seguido cuando un texto se repite
   entre el título/hero de la pantalla y el label de un botón (ej. "Subir
   documento" en `DocumentsScreen`, "Agregar actividad" en
   `AddActivityScreen`) o entre componentes compartidos (`AuthSwitch` en
   `LoginScreen`/`RegisterScreen`). `getByText(...)` tira "Found multiple
   elements" en esos casos. Dos salidas, según el caso:
   - Si podés targetear el elemento puntual: `testID` (ej.
     `register-submit-button`).
   - Si vas a repetir esta ambigüedad en varios tests del mismo archivo (ej.
     un botón de submit cuyo label coincide con el título): escribí un
     helper `pressSubmit` que tome el **último** match con `getAllByText`,
     ya que el botón se renderiza después del título en el árbol:
     ```js
     async function pressSubmit(utils, texto) {
       await act(async () => {
         const matches = utils.getAllByText(texto);
         fireEvent.press(matches[matches.length - 1]);
       });
     }
     ```
   - Si el texto de un mensaje de error coincide *exactamente* con un
     placeholder visual (ej. "Seleccioná una categoría" en
     `DocumentsScreen`, que es placeholder del selector Y el texto del
     `<Text>` de error), no pelees por desambiguar: usá
     `getAllByText(...)` y afirmá la longitud (`toHaveLength(2)`). Confirma
     que el error efectivamente se está mostrando además del placeholder.
8. **Para pantallas con selector de fecha nativo
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

   **Alternativa más simple cuando el picker no es lo que estás probando**:
   varias pantallas (`AddActivityScreen`, por ejemplo) renderizan los campos
   de hora/fecha como un `<TextInput>` normal en `Platform.OS === "web"` y
   como `<Pressable>` + picker nativo en el resto. Si lo que te importa es
   la *validación* (formato, orden de fechas) y no el picker en sí, forzar
   `Platform.OS = "web"` en el `beforeEach` te deja escribir el valor
   directo con `fireEvent.changeText` y te ahorrás mockear el picker.
9. Cubrí, como mínimo, para cada pantalla con lógica no trivial:
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
  ver sección 8).*
- No agregar `it.skip` a un test que falla "para arreglarlo después". Si no
  se puede arreglar ya, se borra o se abre una tarea puntual para eso.
- No escribir 60 tests casi idénticos para 60 funciones con el mismo
  patrón (ver sección 6, nota sobre `services/api.js`). Si vas a testear
  varias funciones que solo difieren en URL/método/body, un
  `describe.each` con una tabla de casos da la misma cobertura con una
  fracción del código, y agregar un caso nuevo es una línea en un array.

## 4. Regla del piso creciente (coverage ratchet)

En `package.json` hay un `coverageThreshold.global.statements`. Regla del
equipo:

> **Cada vez que una US toque una pantalla o util nuevo y le sume test,
> subí el número del piso al valor real que reporta `npm run test:coverage`
> (redondeando hacia abajo).** Nunca lo bajes. Así el CI evita que la
> cobertura retroceda sin que nadie tenga que discutirlo a mano.

No es una meta de "% total" fija — es un candado de un solo sentido. El
valor concreto fue subiendo varias veces en lo que va del proyecto (4 → 18
→ 19 → 26 → 29 → 30...); no lo copies de este documento, mirá el número real
en tu `package.json` y en la salida de `test:coverage`.

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

**Prioridad alta (dinero, autenticación, alta de datos):** ✅ **completa**
- ~~`AddGastoScreen`~~ ✅ carga inicial, validaciones, alta exitosa, fallback
  offline al fallar el guardado, sin conexión + sin caché al cargar.
- ~~`LoginScreen` / `RegisterScreen`~~ ✅ render, validaciones, alta exitosa
  con navegación, error 422 del backend, error genérico, error de red.
- ~~`CreateTripScreen` / `EditTripScreen`~~ ✅ (con mock de `DateTimePicker`).
  **Bug real encontrado y corregido por el test**: en `CreateTripScreen.js`,
  `errors.destinations` se calculaba pero nunca se renderizaba — el usuario
  apretaba "Crear viaje" sin destinos y no pasaba nada. Se agregó el
  `<Text>{errors.destinations}</Text>` que faltaba.
- ~~`gastosLocal.js` (cola offline)~~ ✅ guardar/leer offline web vs nativo,
  error de SQLite, sincronización con borrado de cola, corte si falla un
  gasto, doble sincronización bloqueada, caché de categorías.
- ~~`AuthContext.js`~~ ✅ 0% → 87%. `useAuth` fuera de provider, sin token,
  token válido, token rechazado por el backend, error de storage, login,
  logout. **Ver limitación de import dinámico en sección 9.**
- ~~`services/api.js`~~ ✅ 2% → ~21%. `parseResponse` a fondo (5 casos),
  `authHeaders`/token, tabla `describe.each` con 10 endpoints
  representativos (GET/POST/PUT/DELETE, query encoding), `deleteTrip` (caso
  especial, no usa `parseResponse`), `uploadProfilePhoto` rama web. **No se
  testearon los ~50 endpoints restantes uno por uno a propósito — ver
  sección 3.** Pendiente si hace falta: `uploadTripDocument`,
  `downloadTripDocument`, `updateTripDocument` (rama nativa con
  `expo-file-system`).

**Prioridad media (flujos core del producto):** ✅ **completa**
- ~~`AddActivityScreen`~~ ✅ validaciones (nombre, formato de hora, orden de
  horas), alta exitosa, error del backend, detección automática de ícono
  vs. selección manual, precarga en modo edición, búsqueda y selección de
  ubicación, error de búsqueda.
- ~~`CreateVotationScreen`~~ ✅ AC2 (arranca con 2 propuestas), validaciones
  (nombre, mínimo de propuestas, propuestas repetidas case-insensitive),
  agregar/quitar propuestas (con el piso de 2), alta exitosa con `Alert` y
  navegación, error del backend, botón de retroceso.
- ~~`DocumentsScreen`~~ ✅ error de carga de categorías, validaciones (3
  campos), selección/reemplazo de archivo, selección de categoría vía
  modal, alta exitosa con `Alert` de confirmación, error de nombre
  duplicado (parseo de mensaje del backend), error genérico, cancelar.

**Prioridad baja pero rápida (componentes chicos):** en su mayoría ✅
- ~~`components/ui/*`~~ ✅ `Avatar`, `AvatarStack`, `StatusPill`,
  `AuthSwitch` — todos al 100%. (`MetricCard`, `PrimaryButton`,
  `IconCircleButton` ya estaban cubiertos indirectamente por otras
  pantallas.)
- ~~`hooks/useResponsive`, `hooks/useItinerarioViewPreference`~~ ✅ ambos al
  100%. Ojo con `useItinerarioViewPreference`: guarda el estado en una
  variable de módulo (no en contexto), así que los tests que lo tocan
  quedan encadenados a propósito en vez de aislados — ver el archivo de
  test para el patrón.
- ~~`components/home/TripCard.js`~~ ✅ 100%.
- ~~`components/trip/ItinerarioViewToggle.js`~~ ✅ 100%.
- ~~`components/trip/ResultadosVotacion.js`~~ ✅ 100%.
- ~~`components/trip/ParticipantList.js`~~ ✅ 100%. Ojo si volvés a tocar
  este componente: tiene lógica de permisos (`isAdmin` + `role ===
  "administrador"`) que condiciona si se muestra el botón de quitar — no
  asumas que siempre está visible.
- ~~`components/trip/ParticipantSearch.js`~~ ✅ 100%.
- ~~`components/trip/CurrencySelector.js`~~ ✅ 100%. Tiene estado y filtro
  propios (busca por nombre O código, case-insensitive) — vale la pena
  releer el test si cambian el criterio de búsqueda.

**Lo que queda (sin empezar o parcial):**
- `components/trip/DocumentsByCategory.js` (0%, 356 líneas) —
  el más grande que queda en `components/trip`.
- `components/trip/ItinerarioCalendarView.js` (ya ~82%, le faltan pocas
  líneas para cerrar).
- `components/map/*` (`MapCanvas.native.js`, `MapCanvas.web.js`,
  `OfflineMapState.js`, `PlaceDetailSheet.js`, `PlaceScheduleSheet.js`) —
  todos en 0%. Dependen de `react-native-maps`; mockearlo es su propio
  trabajo, no lo mezcles con otro test.
- Pantallas en 0% sin tocar todavía: `HomeScreen`, `ProfileScreen`,
  `EditProfileScreen`, `InvitationsScreen`, `EmailConfirmadoScreen`,
  `FacebookRegisterScreen`, `GoogleRegisterScreen`,
  `InformationScreen`, `PlaceholderScreen`,
  `RegistrationSuccessScreen`.
- `context/AuthContext.js` — quedó al 87%; el 13% restante son las ramas
  nativas de `expo-secure-store`, no testeables en este entorno de Jest
  hoy (ver sección 9).

**Caso especial — pantallas "god component" (`TripDetailScreen`, 2102
líneas, `ExplorePlacesScreen`, 970 líneas):** antes de escribirles un test
gigante que mockea 10 cosas, evaluar extraer la sección puntual que se
quiere probar a un componente propio (p. ej. una sección de ruta, una
sección de gastos). Se gana testeabilidad y se mejora el diseño al mismo
tiempo. No las ataquemos como están.

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

**Nota relacionada, no exclusiva de Windows**: vimos al menos un caso
(`GastosLocal.test.js`) donde la suite completa en paralelo (`npm test`
default) daba un falso rojo intermitente que **no se reproducía** corriendo
ese archivo aislado. Si te pasa algo similar: aislá el archivo primero
(`npm test -- NombreDelArchivo`) antes de asumir que rompiste algo — si
aislado pasa, corré `npm run test:slow` para confirmar si es un problema
real o ruido de paralelismo.

## 8. Deuda conocida

- `EditDocumentScreen.test.js` tiene un warning intermitente de React
  (`act(...)`) que a veces hace fallar la suite bajo `--coverage`. Causa:
  un `setState` async no envuelto en `waitFor`. Pendiente de arreglo.

## 9. Limitaciones del entorno de testing (leer antes de tocar storage/archivos)

Cosas que **no son bugs de tu test** — son límites de cómo está configurado
Jest hoy en este proyecto. Si tocás alguno de estos archivos, leé esto
primero para no perder tiempo:

### `await import(...)` (import dinámico) no funciona en los tests

`AuthContext.js` y `services/api.js` usan `await import("expo-secure-store")`
para el storage nativo (fuera de `Platform.OS === "web"`). **Jest, tal como
está configurado hoy (sin `--experimental-vm-modules`), no soporta imports
dinámicos.** Cualquier `jest.mock("expo-secure-store", ...)` se ignora en
silencio, la promesa del `import()` rechaza sola, y el código cae siempre al
`catch` que la rodea. Esto da **falsos positivos**: un test puede "pasar"
sin que tu mock se haya usado ni una vez.

**Cómo lo esquivamos:** forzar `Platform.OS = "web"` en el `beforeEach` y
controlar el storage con un `localStorage` global fake (no existe de
verdad en este entorno, así que se puede reemplazar sin problema):

```js
let localStorageMock;

beforeEach(() => {
  Platform.OS = "web";
  localStorageMock = { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() };
  global.localStorage = localStorageMock;
});

afterEach(() => {
  delete global.localStorage;
});
```

Esto deja sin cobrir a propósito las ramas nativas de `getStoredToken()` (en
ambos archivos) y de `storage.getItem/setItem/removeItem` en `AuthContext.js`.
**Si en algún momento quieren cerrar ese hueco**, la solución es agregar
`babel-plugin-dynamic-import-node` (o equivalente) al `babel.config.js` para
que Jest transpile el `import()` dinámico a un `require()` síncrono — es un
cambio de infraestructura, no de tests.

### `Platform.OS` arranca en `"ios"` por defecto en los tests

El preset `jest-expo` no arranca en `"web"` ni en `"android"` — arranca en
`"ios"`. Importa porque cosas como `API_BASE_URL` en `services/api.js` se
calculan **una sola vez, al importar el módulo**, usando el `Platform.OS`
que haya en ese momento. Si tu test cambia `Platform.OS` en un
`beforeEach`, eso **no** afecta valores ya calculados al importar — solo
afecta lógica que lee `Platform.OS` en el momento de ejecutarse (como
`getStoredToken()` o el JSX condicional `Platform.OS === "web" ? ... : ...`).

### `FormData.append` exige un `Blob` real en este entorno

A diferencia de lo que uno podría asumir, el polyfill de `FormData` en este
entorno de test **valida el tipo** del segundo argumento cuando no es
string, igual que en un navegador real. Pasar un objeto plano tira
`TypeError: Failed to execute 'append' on 'FormData': parameter 2 is not of
type 'Blob'`. Si necesitás testear un flujo que arma un `FormData` con un
archivo (ver `uploadProfilePhoto` en `api.test.js`), usá un `Blob` real:

```js
const archivo = {
  file: new Blob(["fake-image-data"], { type: "image/jpeg" }),
  fileName: "perfil.jpg",
};
```

`Blob` y `FormData` sí están disponibles como globales en este entorno, así
que esto funciona sin mocks extra.