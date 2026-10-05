import { resolveApiBaseUrl, resolveDevServerHost } from "../services/api";

const conHost = (hostUri) => ({ expoConfig: { hostUri } });

describe("resolveApiBaseUrl", () => {
  it("usa la URL del .env cuando está definida", () => {
    expect(
      resolveApiBaseUrl({
        envUrl: "https://api.cyanea.app/api/v1",
        platformOS: "ios",
        constants: conHost("192.168.100.150:8081"),
      })
    ).toBe("https://api.cyanea.app/api/v1");
  });

  it("en el celular usa la IP desde la que Expo sirve el código", () => {
    expect(
      resolveApiBaseUrl({
        envUrl: undefined,
        platformOS: "ios",
        constants: conHost("192.168.100.150:8081"),
      })
    ).toBe("http://192.168.100.150:8000/api/v1");
  });

  it("sigue la IP aunque cambie de red", () => {
    expect(
      resolveApiBaseUrl({
        envUrl: undefined,
        platformOS: "android",
        constants: conHost("10.0.0.42:8081"),
      })
    ).toBe("http://10.0.0.42:8000/api/v1");
  });

  it("sin servidor de desarrollo, en Android usa la dirección del emulador", () => {
    expect(
      resolveApiBaseUrl({ envUrl: undefined, platformOS: "android", constants: {} })
    ).toBe("http://10.0.2.2:8000/api/v1");
  });
});

describe("resolveDevServerHost", () => {
  it("ignora los hosts de túnel, que no exponen el puerto del backend", () => {
    expect(resolveDevServerHost(conHost("abc-anonymous-8081.exp.direct"))).toBeNull();
  });

  it("acepta el formato de Expo Go antiguo", () => {
    expect(resolveDevServerHost({ expoGoConfig: { debuggerHost: "192.168.1.24:8081" } })).toBe(
      "192.168.1.24"
    );
  });
});
