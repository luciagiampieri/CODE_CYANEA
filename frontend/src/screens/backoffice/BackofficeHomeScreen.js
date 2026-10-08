import { FontAwesome6 } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import CyaneaLogo from '../../../assets/cyanea_logo_manteca.png';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import { radii, spacing, textStyles } from '../../theme/tokens';

export default function BackofficeHomeScreen({ admin, onLogout }) {
  const { width } = useWindowDimensions();
  const compacto = width < 720;
  const [saliendo, setSaliendo] = useState(false);

  const partes = admin.nombreCompleto.split(' ').filter(Boolean);
  const nombre = partes[0] || '';
  const iniciales = partes
    .slice(0, 2)
    .map((parte) => parte[0].toUpperCase())
    .join('');

  async function salir() {
    setSaliendo(true);
    await onLogout();
  }

  return (
    <View style={styles.pantalla}>
      <View style={styles.barra}>
        <View style={styles.filaMarca}>
          <Image resizeMode="contain" source={CyaneaLogo} style={styles.logo} />
          {!compacto ? <Text style={styles.nombreMarca}>Cyanea</Text> : null}
          <View style={styles.pill}>
            <Text style={styles.textoPill}>BACKOFFICE</Text>
          </View>
        </View>

        <View style={styles.filaUsuario}>
          {!compacto ? (
            <View style={styles.datosUsuario}>
              <Text style={styles.nombreUsuario}>{admin.nombreCompleto}</Text>
              <Text style={styles.emailUsuario}>{admin.email}</Text>
            </View>
          ) : null}
          <View style={styles.avatar}>
            <Text style={styles.textoAvatar}>{iniciales}</Text>
          </View>
          <Pressable
            disabled={saliendo}
            onPress={salir}
            style={({ pressed }) => [styles.botonSalir, pressed && styles.presionado]}
          >
            {saliendo ? (
              <ActivityIndicator color={c.texto} size="small" />
            ) : (
              <>
                <FontAwesome6 color={c.texto} name="arrow-right-from-bracket" size={13} />
                {!compacto ? <Text style={styles.textoSalir}>Salir</Text> : null}
              </>
            )}
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.contenido}>
          <Text style={styles.saludo}>Hola, {nombre}</Text>
          <Text style={styles.bajada}>Te damos la bienvenida al panel de gestión de Cyanea.</Text>

          <View style={styles.vacio}>
            <View style={styles.iconoVacio}>
              <FontAwesome6 color={c.acento} name="screwdriver-wrench" size={20} />
            </View>
            <Text style={styles.tituloVacio}>Todavía no hay herramientas habilitadas</Text>
            <Text style={styles.textoVacio}>
              Las secciones de gestión de la plataforma van a aparecer acá.
            </Text>
          </View>

          <View style={styles.infoSesion}>
            <FontAwesome6 color={c.textoTenue} name="clock" size={12} />
            <Text style={styles.textoInfo}>
              Por seguridad, la sesión se cierra automáticamente después de 30 minutos de inactividad.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: c.fondo,
  },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: c.panel,
    borderBottomWidth: 1,
    borderBottomColor: c.borde,
  },
  filaMarca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logo: {
    width: 30,
    height: 30,
  },
  nombreMarca: {
    ...textStyles.brandTitle,
    color: c.acento,
    fontSize: 22,
    fontWeight: 'bold',
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.acentoBorde,
    backgroundColor: c.acentoSuave,
  },
  textoPill: {
    ...textStyles.sectionLabel,
    color: c.acento,
    fontSize: 10,
    letterSpacing: 2,
  },
  filaUsuario: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  datosUsuario: {
    alignItems: 'flex-end',
  },
  nombreUsuario: {
    ...textStyles.bodyStrong,
    color: c.texto,
  },
  emailUsuario: {
    ...textStyles.meta,
    color: c.textoTenue,
    fontSize: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.acento,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoAvatar: {
    ...textStyles.bodyStrong,
    color: c.sobreAcento,
  },
  botonSalir: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.bordeFuerte,
  },
  textoSalir: {
    ...textStyles.meta,
    color: c.texto,
  },
  scroll: {
    flexGrow: 1,
  },
  contenido: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxxl,
  },
  saludo: {
    ...textStyles.brandTitle,
    color: c.texto,
    fontSize: 36,
  },
  bajada: {
    ...textStyles.body,
    color: c.textoSecundario,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  vacio: {
    alignItems: 'center',
    paddingVertical: 56,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: c.bordeFuerte,
    backgroundColor: c.superficie,
  },
  iconoVacio: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.acentoSuave,
    borderWidth: 1,
    borderColor: c.acentoBorde,
    marginBottom: spacing.md,
  },
  tituloVacio: {
    ...textStyles.bodyStrong,
    color: c.texto,
    fontSize: 17,
    textAlign: 'center',
  },
  textoVacio: {
    ...textStyles.body,
    color: c.textoSecundario,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  infoSesion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  textoInfo: {
    ...textStyles.meta,
    color: c.textoTenue,
    fontSize: 12,
    flex: 1,
  },
  presionado: {
    transform: [{ scale: 0.985 }],
  },
});