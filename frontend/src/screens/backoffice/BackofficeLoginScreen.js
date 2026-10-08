import { FontAwesome6 } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import CyaneaLogo from '../../../assets/cyanea_logo_manteca.png';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import { fontFamilies, radii, spacing, textStyles } from '../../theme/tokens';

const ANCHO_PARTIDO = 900;

export default function BackofficeLoginScreen({ onLogin, aviso }) {
  const { width } = useWindowDimensions();
  const partido = width >= ANCHO_PARTIDO;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (enviando) return;
    if (!email.trim() || !password) {
      setError('Completá el correo electrónico y la contraseña.');
      return;
    }
    setError('');
    setEnviando(true);
    try {
      await onLogin(email.trim().toLowerCase(), password);
    } catch (err) {
      setError(err?.message || 'No se pudo iniciar sesión.');
      setPassword('');
      setEnviando(false);
    }
  }

  return (
    <View style={styles.pantalla}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, partido && styles.scrollPartido]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.marca, partido && styles.marcaPartida]}>
            <View style={partido ? null : styles.centrado}>
              <View style={styles.filaMarca}>
                <Image resizeMode="contain" source={CyaneaLogo} style={styles.logo} />
                <Text style={styles.nombreMarca}>Cyanea</Text>
              </View>
              <View style={[styles.pill, !partido && styles.pillCentrada]}>
                <Text style={styles.textoPill}>BACKOFFICE</Text>
              </View>
            </View>

            {partido ? (
              <>
                <View>
                  <View style={styles.rayita} />
                  <Text style={styles.titular}>
                    Todo lo que pasa en Cyanea,{'\n'}
                    <Text style={styles.titularAcento}>en un solo lugar.</Text>
                  </Text>
                </View>
                <Text style={styles.claim}>MUCHAS MANOS, UN ÚNICO DESTINO</Text>
              </>
            ) : null}
          </View>

          <View style={[styles.contenedor, partido && styles.contenedorPartido]}>
            <View style={styles.formulario}>
              <View style={styles.restringido}>
                <FontAwesome6 color={c.acento} name="shield-halved" size={11} />
                <Text style={styles.textoRestringido}>ACCESO RESTRINGIDO</Text>
              </View>

              <Text style={styles.titulo}>Iniciá sesión</Text>
              <Text style={styles.subtitulo}>Ingresá con tu cuenta de administrador del sistema.</Text>

              {aviso ? (
                <View style={styles.aviso}>
                  <FontAwesome6 color={c.acento} name="clock" size={14} />
                  <Text style={styles.textoAviso}>{aviso}</Text>
                </View>
              ) : null}

              <Campo
                autoCapitalize="none"
                autoComplete="email"
                editable={!enviando}
                etiqueta="Correo electrónico"
                icono="envelope"
                keyboardType="email-address"
                onChangeText={setEmail}
                onSubmitEditing={enviar}
                placeholder="admin@cyanea.com"
                value={email}
              />

              <Campo
                autoComplete="current-password"
                editable={!enviando}
                etiqueta="Contraseña"
                icono="lock"
                iconoDerecho={mostrarPassword ? 'eye-slash' : 'eye'}
                alPresionarIconoDerecho={() => setMostrarPassword((actual) => !actual)}
                onChangeText={setPassword}
                onSubmitEditing={enviar}
                placeholder="••••••••"
                secureTextEntry={!mostrarPassword}
                value={password}
              />

              {error ? (
                <View style={styles.cajaError}>
                  <FontAwesome6 color={c.peligro} name="circle-exclamation" size={14} />
                  <Text style={styles.textoError}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                disabled={enviando}
                onPress={enviar}
                style={({ pressed }) => [
                  styles.boton,
                  pressed && styles.presionado,
                  enviando && styles.deshabilitado,
                ]}
              >
                {enviando ? (
                  <ActivityIndicator color={c.sobreAcento} />
                ) : (
                  <>
                    <Text style={styles.textoBoton}>Ingresar al panel</Text>
                    <FontAwesome6 color={c.sobreAcento} name="arrow-right" size={14} style={styles.iconoBoton} />
                  </>
                )}
              </Pressable>

              <View style={styles.pie}>
                <FontAwesome6 color={c.textoTenue} name="lock" size={10} />
                <Text style={styles.textoPie}>Los inicios de sesión quedan registrados por seguridad.</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Campo({ etiqueta, icono, iconoDerecho, alPresionarIconoDerecho, ...props }) {
  const [enfocado, setEnfocado] = useState(false);

  return (
    <View style={styles.campo}>
      <Text style={styles.etiquetaCampo}>{etiqueta}</Text>
      <View style={[styles.cajaInput, enfocado && styles.cajaInputEnfocada]}>
        <FontAwesome6
          color={enfocado ? c.acento : c.textoTenue}
          name={icono}
          size={14}
          style={styles.iconoInput}
        />
        <TextInput
          onBlur={() => setEnfocado(false)}
          onFocus={() => setEnfocado(true)}
          placeholderTextColor={c.textoTenue}
          style={styles.input}
          {...props}
        />
        {iconoDerecho ? (
          <Pressable hitSlop={8} onPress={alPresionarIconoDerecho} style={styles.iconoDerecho}>
            <FontAwesome6 color={c.textoTenue} name={iconoDerecho} size={14} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  pantalla: {
    flex: 1,
    backgroundColor: c.fondo,
  },
  scroll: {
    flexGrow: 1,
  },
  scrollPartido: {
    flexDirection: 'row',
  },
  marca: {
    paddingTop: 64,
    paddingBottom: 40,
    paddingHorizontal: spacing.xl,
  },
  marcaPartida: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: 56,
    paddingHorizontal: 56,
    backgroundColor: c.panel,
    borderRightWidth: 1,
    borderRightColor: c.borde,
  },
  centrado: {
    alignItems: 'center',
  },
  filaMarca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logo: {
    width: 42,
    height: 42,
  },
  nombreMarca: {
    ...textStyles.brandTitle,
    color: c.acento,
    fontSize: 34,
    fontWeight: 'bold',
  },
  pill: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.acentoBorde,
    backgroundColor: c.acentoSuave,
  },
  pillCentrada: {
    alignSelf: 'center',
  },
  textoPill: {
    ...textStyles.sectionLabel,
    color: c.acento,
    fontSize: 11,
    letterSpacing: 2.5,
  },
  rayita: {
    width: 40,
    height: 3,
    borderRadius: 2,
    backgroundColor: c.acento,
    marginBottom: spacing.lg,
  },
  titular: {
    ...textStyles.brandTitle,
    color: c.texto,
    fontSize: 40,
    lineHeight: 50,
  },
  titularAcento: {
    color: c.acento,
  },
  claim: {
    ...textStyles.sectionLabel,
    color: c.textoTenue,
    fontSize: 11,
    letterSpacing: 2,
  },
  contenedor: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  contenedorPartido: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  formulario: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  restringido: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  textoRestringido: {
    ...textStyles.sectionLabel,
    color: c.acento,
    fontSize: 11,
    letterSpacing: 2,
  },
  titulo: {
    ...textStyles.brandTitle,
    color: c.texto,
    fontSize: 30,
  },
  subtitulo: {
    ...textStyles.body,
    color: c.textoSecundario,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: c.acentoSuave,
    borderWidth: 1,
    borderColor: c.acentoBorde,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  textoAviso: {
    ...textStyles.meta,
    color: c.texto,
    flex: 1,
  },
  campo: {
    marginBottom: spacing.lg,
  },
  etiquetaCampo: {
    ...textStyles.label,
    color: c.textoSecundario,
    marginBottom: spacing.xs,
  },
  cajaInput: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.superficie,
    paddingHorizontal: spacing.md,
  },
  cajaInputEnfocada: {
    borderColor: c.acento,
  },
  iconoInput: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 52,
    color: c.texto,
    fontFamily: fontFamilies.sans,
    fontSize: 16,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  iconoDerecho: {
    paddingLeft: spacing.sm,
    paddingVertical: spacing.sm,
  },
  cajaError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: c.peligroSuave,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  textoError: {
    ...textStyles.meta,
    color: c.peligro,
    flex: 1,
  },
  boton: {
    minHeight: 54,
    borderRadius: radii.md,
    backgroundColor: c.acento,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  textoBoton: {
    ...textStyles.button,
    color: c.sobreAcento,
  },
  iconoBoton: {
    marginLeft: spacing.sm,
  },
  pie: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
  },
  textoPie: {
    ...textStyles.meta,
    color: c.textoTenue,
    fontSize: 12,
  },
  presionado: {
    transform: [{ scale: 0.985 }],
  },
  deshabilitado: {
    opacity: 0.7,
  },
});