import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import PanelMetricas from '../../components/backoffice/PanelMetricas';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import { spacing, textStyles } from '../../theme/tokens';

export default function BackofficeHomeScreen({ admin, onAbrirUsuarios }) {
  const nombre = admin.nombreCompleto.split(' ').filter(Boolean)[0] || '';

  return (
    <View>
      <LinearGradient
        colors={['rgba(255, 236, 128, 0.20)', 'rgba(255, 236, 128, 0.03)']}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.banner}
      >
        <View pointerEvents="none" style={styles.circuloGrande} />
        <View pointerEvents="none" style={styles.circuloChico} />

        <View style={styles.textosBanner}>
          <Text style={styles.saludo}>
            ¡Hola, <Text style={styles.nombre}>{nombre}</Text>! 👋
          </Text>
          <Text style={styles.bajada}>
            Este es el pulso de Cyanea. Mirá cómo viene creciendo la plataforma.
          </Text>
        </View>

        <Pressable
          onPress={onAbrirUsuarios}
          style={({ hovered, pressed }) => [
            styles.botonBanner,
            hovered && styles.botonBannerHover,
            pressed && styles.presionado,
          ]}
        >
          <FontAwesome6 color={c.sobreAcento} name="users" size={14} />
          <Text style={styles.textoBotonBanner}>Gestionar usuarios</Text>
          <FontAwesome6 color={c.sobreAcento} name="arrow-right" size={12} />
        </Pressable>
      </LinearGradient>

      <PanelMetricas />

      <View style={styles.infoSesion}>
        <FontAwesome6 color={c.textoTenue} name="clock" size={12} />
        <Text style={styles.textoInfo}>
          Por seguridad, la sesión se cierra automáticamente después de 30 minutos de inactividad.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    padding: spacing.xl,
    paddingVertical: spacing.xxxl,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: c.acentoBorde,
    overflow: 'hidden',
    marginBottom: spacing.xl,
    backgroundColor: c.superficie,
  },
  circuloGrande: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    top: -160,
    right: -60,
    backgroundColor: c.acentoSuave,
  },
  circuloChico: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    bottom: -90,
    right: 240,
    backgroundColor: c.acentoSuave,
  },
  textosBanner: {
    flexShrink: 1,
    maxWidth: 720,
  },
  saludo: {
    ...textStyles.brandTitle,
    color: c.texto,
    fontSize: 38,
  },
  nombre: {
    color: c.manteca,
  },
  bajada: {
    ...textStyles.body,
    color: c.textoSecundario,
    fontSize: 17,
    marginTop: spacing.xs,
  },
  botonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    backgroundColor: c.manteca,
  },
  botonBannerHover: {
    opacity: 0.9,
  },
  textoBotonBanner: {
    ...textStyles.bodyStrong,
    color: c.sobreAcento,
  },
  infoSesion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
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