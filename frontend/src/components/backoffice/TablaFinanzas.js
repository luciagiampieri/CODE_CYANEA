import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import { s } from './FinanzasPresentacion';

export function fechaCorta(valor) {
  return valor ? new Date(valor).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '—';
}

export function EstadoFinanciero({ estado, etiqueta }) {
  const color = { activa: c.salvia, aprobado: c.salvia, pendiente_pago: c.manteca,
    pendiente: c.manteca, rechazado: c.peligro, cancelada: c.lavanda, vencida: c.textoSecundario, descartada: c.textoSecundario,
    procesada: c.salvia, ignorada: c.textoSecundario, error: c.peligro }[estado] || c.texto;
  return <View style={[t.estado, { borderColor: color }]}><Text style={[s.texto, { color, fontWeight: '600' }]}>{etiqueta}</Text></View>;
}

export default function TablaFinanzas({ columnas, filas, clave = (fila) => fila.id, vacio }) {
  if (!filas.length) return <View style={s.tarjeta}><Text style={s.texto}>{vacio}</Text></View>;
  const ancho = columnas.reduce((total, col) => total + col.ancho, 0);
  return <View style={t.marco}>
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ minWidth: ancho, flex: 1 }}>
        <View style={t.cabecera}>{columnas.map((col) => <Text key={col.nombre} style={[t.celda, t.etiqueta, { width: col.ancho, flexGrow: 1, textAlign: col.numero ? 'right' : 'left' }]}>{col.nombre}</Text>)}</View>
        {filas.map((fila, indice) => <View key={clave(fila)} style={[t.fila, indice % 2 === 1 && t.alterna]}>
          {columnas.map((col) => <View key={col.nombre} style={[t.celda, { width: col.ancho, flexGrow: 1, alignItems: col.numero ? 'flex-end' : 'flex-start' }]}>{col.render(fila)}</View>)}
        </View>)}
      </View>
    </ScrollView>
  </View>;
}

const t = StyleSheet.create({
  marco: { borderWidth: 1, borderColor: c.borde, borderRadius: 16, overflow: 'hidden' },
  cabecera: { flexDirection: 'row', backgroundColor: c.superficieElevada },
  fila: { flexDirection: 'row', alignItems: 'center', minHeight: 68, borderTopWidth: 1, borderColor: c.borde, backgroundColor: c.panel },
  alterna: { backgroundColor: c.superficie },
  celda: { paddingHorizontal: 16, paddingVertical: 13, gap: 4, justifyContent: 'center' },
  etiqueta: { color: c.textoSecundario, fontSize: 12, fontWeight: '600' },
  estado: { borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20 },
});
