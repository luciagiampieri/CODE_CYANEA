import { StyleSheet, Text, View } from 'react-native';

import { backofficeColors as c } from '../../theme/backofficeTokens';
import { spacing, textStyles } from '../../theme/tokens';

export const ETIQUETAS_ESTADO = {
  pendiente: 'Pendiente',
  activa: 'Activa',
  suspendida: 'Suspendida',
  inactiva: 'Inactiva',
};

export const ETIQUETAS_PLAN = {
  gratuito: 'Gratuito',
  pro: 'Pro',
};

export const ETIQUETAS_METODO = {
  local: 'Correo y contraseña',
  google: 'Google',
  facebook: 'Facebook',
};

const COLORES_ESTADO = {
  activa: { texto: c.acento, fondo: c.acentoSuave, borde: c.acentoBorde },
  pendiente: { texto: c.textoSecundario, fondo: 'transparent', borde: c.bordeFuerte },
  suspendida: { texto: c.peligro, fondo: c.peligroSuave, borde: c.peligro },
  inactiva: { texto: c.textoTenue, fondo: c.superficie, borde: c.borde },
};

export function formatearFecha(valor) {
  if (!valor) return '—';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function obtenerIniciales(nombreCompleto) {
  return (nombreCompleto || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0].toUpperCase())
    .join('');
}

export function EstadoCuentaBadge({ estado }) {
  const colores = COLORES_ESTADO[estado] || COLORES_ESTADO.inactiva;
  return (
    <View style={[styles.badge, { backgroundColor: colores.fondo, borderColor: colores.borde }]}>
      <View style={[styles.punto, { backgroundColor: colores.texto }]} />
      <Text style={[styles.texto, { color: colores.texto }]}>
        {ETIQUETAS_ESTADO[estado] || estado}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  punto: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  texto: {
    ...textStyles.meta,
    fontSize: 12,
  },
});