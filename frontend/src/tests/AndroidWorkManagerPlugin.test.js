const fs = require("fs");
const os = require("os");
const path = require("path");
const { compileModsAsync } = require("expo/config-plugins");
const withAndroidWorkManager = require("../../plugins/withAndroidWorkManager");
const configurarApp = require("../../app.config");

test("Expo prebuild conserva las reglas Room al regenerar Android sin duplicarlas", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cyanea-workmanager-"));
  const gradlePath = path.join(root, "android/app/build.gradle");
  const sourceRules = path.resolve(__dirname, "../../plugins/android-workmanager.pro");
  const rulesPath = path.join(root, "plugins/android-workmanager.pro");
  const baseGradle = [
    'apply plugin: "com.android.application"',
    'android { buildTypes { release { minifyEnabled true; proguardFiles "proguard-rules.pro" } } }',
    "dependencies { }",
    "",
  ].join("\n");
  try {
    fs.mkdirSync(path.dirname(gradlePath), { recursive: true });
    fs.mkdirSync(path.dirname(rulesPath), { recursive: true });
    fs.copyFileSync(sourceRules, rulesPath);
    fs.writeFileSync(gradlePath, baseGradle);

    const prebuild = async () => {
      const config = withAndroidWorkManager({
        name: "Cyanea",
        slug: "cyanea",
        android: { package: "com.ticigaticasteam.cyanea" },
      });
      await compileModsAsync(config, { projectRoot: root, platforms: ["android"] });
      return fs.readFileSync(gradlePath, "utf8");
    };

    const first = await prebuild();
    expect(await prebuild()).toBe(first);
    expect(first).toContain('proguardFiles "proguard-rules.pro"');
    expect(first).toContain("minifyEnabled true");
    expect(first).toContain('new File(rootDir, "../plugins/android-workmanager.pro")');
    expect(fs.readFileSync(rulesPath, "utf8")).toMatch(
      /-keep class androidx\.work\.impl\.WorkDatabase_Impl \{ \*; \}/
    );

    // La regeneracion limpia de android/ vuelve a conectar el archivo versionado.
    fs.writeFileSync(gradlePath, baseGradle);
    expect(await prebuild()).toBe(first);
  } finally {
    expect(path.dirname(path.resolve(root))).toBe(path.resolve(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("la configuracion publica de Expo incluye el plugin Android una sola vez", () => {
  const first = configurarApp({ config: { name: "Cyanea", slug: "cyanea", plugins: [] } });
  const second = configurarApp({ config: first });
  expect(second.plugins.filter((p) => p === "./plugins/withAndroidWorkManager")).toHaveLength(1);
});
