import { FontAwesome6 } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { backofficeColors as c } from '../../theme/backofficeTokens';
import { radii, spacing, textStyles } from '../../theme/tokens';

export default function BackofficeHomeScreen({ admin, onAbrirUsuarios }) {
  const nombre = admin.nombreCompleto.split(' ').filter(Boolean)[0] || '';

  return (
    <View>
      <Text style={styles.saludo}>Hola, {nombre}</Text>
      <Text style={styles.bajada}>Te damos la bienvenida al panel de gestión de Cyanea.</Text>

      <Text style={styles.etiquetaSeccion}>HERRAMIENTAS</Text>
      <View style={styles.grilla}>
        <TarjetaHerramienta
          descripcion="Buscá y consultá las cuentas registradas en la plataforma."
          icono="users"
          onPress={onAbrirUsuarios}
          titulo="Usuarios"
        />
      </View>

      <View style={styles.infoSesion}>
        <FontAwesome6 color={c.textoTenue} name="clock" size={12} />
        <Text style={styles.textoInfo}>
          Por seguridad, la sesión se cierra automáticamente después de 30 minutos de inactividad.
        </Text>
      </View>
    </View>
  );
}

function TarjetaHerramienta({ icono, titulo, descripcion, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered, pressed }) => [
        styles.tarjeta,
        (hovered || pressed) && styles.tarjetaResaltada,
        pressed && styles.presionado,
      ]}
    >
      <View style={styles.iconoTarjeta}>
        <FontAwesome6 color={c.acento} name={icono} size={18} />
      </View>
      <View style={styles.textosTarjeta}>
        <Text style={styles.tituloTarjeta}>{titulo}</Text>
        <Text style={styles.descripcionTarjeta}>{descripcion}</Text>
      </View>
      <FontAwesome6 color={c.textoTenue} name="chevron-right" size={13} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  etiquetaSeccion: {
    ...textStyles.sectionLabel,
    color: c.textoTenue,
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: spacing.md,
  },
  grilla: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  tarjeta: {
    flexGrow: 1,
    flexBasis: 320,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.superficie,
  },
  tarjetaResaltada: {
    borderColor: c.acentoBorde,
  },
  iconoTarjeta: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.acentoSuave,
    borderWidth: 1,
    borderColor: c.acentoBorde,
  },
  textosTarjeta: {
    flex: 1,
  },
  tituloTarjeta: {
    ...textStyles.bodyStrong,
    color: c.texto,
    fontSize: 17,
  },
  descripcionTarjeta: {
    ...textStyles.meta,
    color: c.textoSecundario,
    marginTop: 2,
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