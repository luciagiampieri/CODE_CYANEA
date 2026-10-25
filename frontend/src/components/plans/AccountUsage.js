import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { getAccountUsage } from '../../services/api';
import PrimaryButton from '../ui/PrimaryButton';
import { colors, radii, spacing, textStyles } from '../../theme/tokens';

const numero = (valor) => Number(valor).toLocaleString('es-AR', { maximumFractionDigits: 1 });
const fecha = (valor) => new Date(valor).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

export function UsageMeter({ titulo, uso, unidad = '', nota, testID }) {
  const color = uso.limiteExcedido ? colors.danger : uso.limiteAlcanzado || uso.porcentajeUso >= 80 ? colors.warning : colors.success;
  return <View testID={testID} style={s.medidor}>
    <Text style={s.etiqueta}>{titulo}</Text>
    <Text style={[s.valor, { color }]}>{numero(uso.usoActual)}{unidad} / {uso.ilimitado ? 'Sin límite' : `${numero(uso.limite)}${unidad}`}</Text>
    {!uso.ilimitado ? <View accessible accessibilityRole="progressbar" accessibilityLabel={titulo}
      accessibilityValue={{ min: 0, max: 100, now: Math.min(100, uso.porcentajeUso || 0), text: `${numero(uso.usoActual)} de ${numero(uso.limite)}${unidad}` }} style={s.pista}>
      <View style={[s.barra, { width: `${Math.min(100, uso.porcentajeUso || 0)}%`, backgroundColor: color }]} />
    </View> : null}
    {uso.limiteExcedido ? <Text style={[s.nota, { color: colors.danger }]}>Supera el límite vigente.</Text> : uso.limiteAlcanzado ? <Text style={[s.nota, { color: colors.warning }]}>Límite alcanzado</Text> : null}
    {nota ? <Text style={s.nota}>{nota}</Text> : null}
    {uso.renuevaEl ? <Text style={s.nota}>Se renueva el {fecha(uso.renuevaEl)}</Text> : null}
  </View>;
}

export default function AccountUsage() {
  const [datos, setDatos] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  useFocusEffect(useCallback(() => {
    let vigente = true;
    setCargando(true); setError('');
    getAccountUsage(pagina).then((respuesta) => { if (vigente) setDatos(respuesta); })
      .catch((err) => { if (vigente) setError(err.message || 'No se pudo cargar tu consumo.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [pagina, intento]));
  return <View style={s.seccion}>
    <Text style={s.titulo}>El consumo de tu cuenta</Text>
    <Text style={s.nota}>Controlá tus cupos y el uso de cada viaje en curso.</Text>
    {cargando ? <ActivityIndicator color={colors.primary} /> : error ? <View style={s.panel}>
      <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>
      <PrimaryButton label="Reintentar consumo" onPress={() => setIntento((n) => n + 1)} />
    </View> : datos ? <>
      <Text style={s.etiqueta}>Tu plan actual: {datos.planActual === 'pro' ? 'Pro' : 'Gratuito'}</Text>
      <View style={s.resumen}>
        <View style={s.panel}><UsageMeter titulo="Viajes activos que administrás" uso={datos.viajesActivos} testID="consumo-viajes" nota="Incluye viajes activos y borradores. Los viajes en los que solo participás no consumen este cupo." /></View>
        <View style={s.panel}><UsageMeter titulo="Escaneos de comprobantes del mes" uso={datos.escaneosMensuales} testID="consumo-escaneos" nota="Cupo personal de tu cuenta." /></View>
      </View>
      <Text style={s.subtitulo}>Uso por viaje</Text>
      <Text style={s.nota}>Los límites corresponden al plan de quien administra cada viaje. Los participantes incluyen a quien administra.</Text>
      {!datos.items.length ? <Text style={s.nota}>Todavía no tenés viajes activos ni borradores para mostrar.</Text> : datos.items.map((viaje) => <View key={viaje.id} style={s.viaje}>
        <View style={s.cabecera}><Text style={s.subtitulo}>{viaje.titulo}</Text><Text style={s.rol}>{viaje.esAdministrador ? 'Administrás' : 'Participás'} · {viaje.estado === 'borrador' ? 'Borrador' : 'Activo'} · Plan {viaje.planAdministrador === 'pro' ? 'Pro' : 'Gratuito'}</Text></View>
        <View style={s.recursos}>
          <UsageMeter titulo="Participantes" uso={viaje.participantes} />
          <UsageMeter titulo="Solicitudes de IA de hoy" uso={viaje.sugerenciasDiarias} />
          <UsageMeter titulo="Repositorio" uso={viaje.almacenamiento} unidad=" MB" />
        </View>
      </View>)}
      {datos.totalPaginas > 1 ? <View style={s.paginacion}>
        <PrimaryButton label="Página anterior" variant="secondary" disabled={pagina <= 1} onPress={() => setPagina((n) => n - 1)} />
        <Text style={s.nota}>Página {datos.pagina} de {datos.totalPaginas} · {datos.total} viajes</Text>
        <PrimaryButton label="Más viajes" variant="secondary" disabled={pagina >= datos.totalPaginas} onPress={() => setPagina((n) => n + 1)} />
      </View> : null}
      <Text style={s.nota}>Consultado el {new Date(datos.consultadoEl).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}. Se actualiza automáticamente al volver a esta pantalla.</Text>
    </> : null}
  </View>;
}

const s = StyleSheet.create({
  seccion: { gap: spacing.sm },
  titulo: { ...textStyles.tripTitle, color: colors.primary },
  subtitulo: { ...textStyles.bodyStrong, color: colors.primary, fontSize: 18 },
  nota: { ...textStyles.meta, color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  resumen: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  panel: { flexGrow: 1, flexBasis: 280, padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md },
  viaje: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  cabecera: { gap: spacing.xs },
  rol: { ...textStyles.meta, color: colors.textSecondary },
  recursos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  medidor: { flex: 1, flexBasis: 160, gap: 7 },
  etiqueta: { ...textStyles.meta, color: colors.textPrimary, fontWeight: '600' },
  valor: { ...textStyles.bodyStrong, fontSize: 20 },
  pista: { height: 7, backgroundColor: colors.surfaceAlt, borderRadius: 8, overflow: 'hidden' },
  barra: { height: '100%', borderRadius: 8 },
  paginacion: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
});
