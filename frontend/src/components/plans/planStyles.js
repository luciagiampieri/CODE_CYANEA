import { StyleSheet } from 'react-native';
import { colors, radii, spacing, textStyles } from '../../theme/tokens';

export const LIMITES_COMPARACION = [
  ['maxViajesActivos', 'Viajes activos que administrás', 'simultáneos'],
  ['maxParticipantesViaje', 'Participantes por viaje', 'incluido quien administra'],
  ['maxSugerenciasDiarias', 'Solicitudes de sugerencias con IA', 'por viaje, por día'],
  ['maxEscaneosMensuales', 'Escaneos de comprobantes', 'por usuario, por mes'],
  ['maxAlmacenamientoMb', 'Almacenamiento del repositorio', 'por viaje'],
];

export const precioPlan = (valor) => valor == null ? 'Precio por configurar' : `ARS ${Number(valor).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const limitePlan = (valor, campo) => valor == null ? 'Sin límite' : `${Number(valor).toLocaleString('es-AR')}${campo === 'maxAlmacenamientoMb' ? ' MB' : ''}`;

export const p = StyleSheet.create({
  scroll: { padding: spacing.md, paddingBottom: spacing.xxxl, alignItems: 'center' },
  contenido: { width: '100%', maxWidth: 1000, gap: spacing.lg },
  encabezado: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', paddingVertical: spacing.md },
  pestana: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, backgroundColor: colors.surface },
  titulo: { ...textStyles.screenTitle, color: colors.primary },
  subtitulo: { ...textStyles.meta, color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  texto: { ...textStyles.body, color: colors.textPrimary },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
  panel: { padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  planes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'stretch' },
  plan: { flexGrow: 1, flexBasis: 300 },
  actual: { borderColor: colors.primary, borderWidth: 2 },
  pro: { backgroundColor: '#fffcf0' },
  nombre: { ...textStyles.bodyStrong, color: colors.primary, fontSize: 20 },
  precio: { ...textStyles.screenTitle, color: colors.primary, fontSize: 28 },
  insignia: { backgroundColor: colors.primary, color: colors.surface, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5, fontSize: 12, fontWeight: '700' },
  ahorro: { color: colors.success, fontWeight: '700', fontSize: 15 },
  error: { color: colors.danger, fontSize: 16 },
  comparacionFila: { flexDirection: 'row', borderTopWidth: 1, borderColor: colors.border, paddingVertical: 14, alignItems: 'center', gap: 6 },
  comparacionCabecera: { borderTopWidth: 0 },
  concepto: { flex: 1.8 },
  etiqueta: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  unidad: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  valor: { flex: 1, textAlign: 'center', color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  valorPro: { color: colors.primary, fontWeight: '800' },
});