import { Pressable, StyleSheet, Text, View } from 'react-native';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import { radii, spacing, textStyles } from '../../theme/tokens';

export const ESTADOS_SUSCRIPCIONES = { activa: 'Activa', pendiente_pago: 'Pendiente de pago', cancelada: 'Cancelada', vencida: 'Vencida', descartada: 'Descartada' };
export const ESTADOS_PAGOS = { aprobado: 'Aprobado', rechazado: 'Rechazado', pendiente: 'Pendiente' };
export const ESTADOS_NOTIFICACIONES = { procesada: 'Procesada', ignorada: 'Ignorada', error: 'Con error' };

export function monedaARS(valor) {
  return valor == null ? 'No registrado' : `ARS ${Number(valor).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fechaFinanciera(valor) {
  return valor ? new Date(valor).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : 'No prevista';
}

export function BotonFinanzas({ children, onPress, disabled = false, seleccionado = false, accessibilityLabel }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled, selected: seleccionado }} onPress={onPress} disabled={disabled}
    style={[s.boton, seleccionado && s.seleccionado, disabled && s.deshabilitado]}>
    <Text style={[s.textoBoton, seleccionado && s.textoSeleccionado]}>{children}</Text>
  </Pressable>;
}

export function FiltroEstado({ etiquetas, valor, onCambiar, nombre }) {
  return <View accessibilityLabel={nombre} style={s.fila}>
    {[[null, 'Todos'], ...Object.entries(etiquetas)].map(([estado, etiqueta]) =>
      <BotonFinanzas key={estado ?? 'todos'} seleccionado={valor === estado} onPress={() => onCambiar(estado)}>{etiqueta}</BotonFinanzas>)}
  </View>;
}

export function PaginacionFinanzas({ datos, onCambiar }) {
  if (!datos || !datos.total) return null;
  return <View style={s.fila}>
    <BotonFinanzas disabled={datos.pagina <= 1} onPress={() => onCambiar(datos.pagina - 1)}>Anterior</BotonFinanzas>
    <Text style={s.texto}>Página {datos.pagina} de {datos.totalPaginas} · {datos.total} resultados</Text>
    <BotonFinanzas disabled={datos.pagina >= datos.totalPaginas} onPress={() => onCambiar(datos.pagina + 1)}>Siguiente</BotonFinanzas>
  </View>;
}

export const s = StyleSheet.create({
  pantalla: { gap: spacing.md },
  fila: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  tarjeta: { backgroundColor: c.panel, borderWidth: 1, borderColor: c.borde, borderRadius: radii.md, padding: spacing.lg, gap: spacing.sm },
  titulo: { ...textStyles.screenTitle, color: c.texto },
  subtitulo: { ...textStyles.bodyStrong, color: c.texto, fontSize: 18 },
  texto: { ...textStyles.meta, color: c.textoSecundario },
  error: { ...textStyles.body, color: c.peligro },
  total: { ...textStyles.bodyStrong, color: c.salvia, fontSize: 22 },
  boton: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.sm, borderWidth: 1, borderColor: c.bordeFuerte, backgroundColor: c.superficie },
  seleccionado: { backgroundColor: c.acento, borderColor: c.acento },
  textoBoton: { ...textStyles.bodyStrong, color: c.texto, fontSize: 14 },
  textoSeleccionado: { color: c.sobreAcento },
  deshabilitado: { opacity: 0.45 },
});
