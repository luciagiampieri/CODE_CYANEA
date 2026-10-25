import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import PanelMetricas from '../../components/backoffice/PanelMetricas';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import { spacing, textStyles } from '../../theme/tokens';

export default function BackofficeHomeScreen({
  admin,
  onAbrirUsuarios,
  onAbrirCategorias,
  onAbrirMonitoreoIA,
  onAbrirTerminos,
  onAbrirPlanes,
  onAbrirSuscripciones,
}) {
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
            ¡Hola, <Text style={styles.nombre}>{nombre}</Text>! 
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

      <View style={styles.accesos}>
        {onAbrirSuscripciones ? (
          <Acceso descripcion="Estados, historial y seguimiento de ingresos" icono="file-invoice-dollar" onPress={onAbrirSuscripciones} titulo="Suscripciones y pagos" />
        ) : null}
        {onAbrirPlanes ? (
          <Acceso descripcion="Precios de Pro y límites de uso" icono="sliders" onPress={onAbrirPlanes} titulo="Planes y límites" />
        ) : null}
        {onAbrirCategorias ? (
          <Acceso
            descripcion="Gastos, documentos y tareas del checklist"
            icono="tags"
            onPress={onAbrirCategorias}
            titulo="Categorías"
          />
        ) : null}
        {onAbrirMonitoreoIA ? (
          <Acceso
            descripcion="Consumo, fallas y costo de la IA"
            icono="microchip"
            onPress={onAbrirMonitoreoIA}
            titulo="Monitoreo de IA"
          />
        ) : null}
        {onAbrirTerminos ? (
          <Acceso
            descripcion="Versiones, publicación y aceptaciones"
            icono="file-contract"
            onPress={onAbrirTerminos}
            titulo="Términos y Condiciones"
          />
        ) : null}
      </View>

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

function Acceso({ icono, titulo, descripcion, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ hovered, pressed }) => [
        styles.acceso,
        hovered && styles.accesoHover,
        pressed && styles.presionado,
      ]}
    >
      <View style={styles.iconoAcceso}>
        <FontAwesome6 color={c.acento} name={icono} size={15} />
      </View>
      <View style={styles.textosAcceso}>
        <Text style={styles.tituloAcceso}>{titulo}</Text>
        <Text style={styles.descripcionAcceso}>{descripcion}</Text>
      </View>
      <FontAwesome6 color={c.textoTenue} name="chevron-right" size={12} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  accesos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  acceso: {
    flexGrow: 1,
    flexBasis: 280,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.panel,
  },
  accesoHover: {
    borderColor: c.acentoBorde,
  },
  iconoAcceso: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.acentoSuave,
    borderWidth: 1,
    borderColor: c.acentoBorde,
  },
  textosAcceso: {
    flex: 1,
  },
  tituloAcceso: {
    ...textStyles.bodyStrong,
    color: c.texto,
  },
  descripcionAcceso: {
    ...textStyles.meta,
    color: c.textoTenue,
    fontSize: 12,
  },
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
