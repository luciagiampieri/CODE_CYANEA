import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { obtenerPlanes, guardarPlanes, obtenerAuditoriaPlanes } from '../../services/backofficeApi';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import { radii, spacing, textStyles } from '../../theme/tokens';
import { confirmar } from '../../utils/dialogs';

const BO = { backoffice: true };
export const CAMPOS_LIMITES = [
  ['maxViajesActivos', 'Viajes activos como administrador'],
  ['maxParticipantesViaje', 'Participantes por viaje'],
  ['maxSugerenciasDiarias', 'Solicitudes de sugerencias por día y viaje'],
  ['maxEscaneosMensuales', 'Escaneos de comprobantes por mes y usuario'],
  ['maxAlmacenamientoMb', 'Almacenamiento por viaje (MB)'],
];
const PRECIOS = [['precioMensualARS', 'Precio mensual Pro (ARS)'], ['precioAnualARS', 'Precio anual Pro (ARS)']];
const NOMBRES = Object.fromEntries([...CAMPOS_LIMITES, ...PRECIOS]);
const COLUMNAS = Object.fromEntries([...CAMPOS_LIMITES, ...PRECIOS].map(([k, v]) => [k[0].toUpperCase() + k.slice(1), v]));

function aFormulario(datos) {
  const grupo = (plan) => Object.fromEntries(CAMPOS_LIMITES.map(([campo]) => [campo, String(datos[plan][campo] ?? '')]));
  return {
    precioMensualARS: String(datos.precioMensualARS ?? ''),
    precioAnualARS: String(datos.precioAnualARS ?? ''),
    gratuito: grupo('gratuito'), pro: grupo('pro'),
  };
}

export function validarPlanes(form) {
  const payload = { gratuito: {}, pro: {} };
  for (const [campo, etiqueta] of PRECIOS) {
    const texto = String(form[campo]).trim().replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(texto) || Number(texto) <= 0 || Number(texto) > 9999999999.99) {
      throw new Error(`${etiqueta}: ingresá un número mayor a cero, con hasta dos decimales.`);
    }
    payload[campo] = texto;
  }
  for (const plan of ['gratuito', 'pro']) {
    for (const [campo, etiqueta] of CAMPOS_LIMITES) {
      const texto = String(form[plan][campo]).trim();
      if (!/^\d+$/.test(texto) || Number(texto) <= 0 || Number(texto) > 2147483647) {
        throw new Error(`${etiqueta} (${plan}): ingresá un número entero mayor a cero.`);
      }
      payload[plan][campo] = Number(texto);
    }
  }
  for (const [campo, etiqueta] of CAMPOS_LIMITES) {
    if (payload.pro[campo] < payload.gratuito[campo]) {
      throw new Error(`${etiqueta}: el límite de Pro debe ser mayor o igual al gratuito.`);
    }
  }
  return payload;
}

function valorLegible(valor, precio = false) {
  if (valor == null) return precio ? 'Sin configurar' : 'Sin límite';
  return precio ? `ARS ${Number(valor).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : String(valor);
}

export default function BackofficePlanesScreen({ onVolver }) {
  const [datos, setDatos] = useState(null);
  const [form, setForm] = useState(null);
  const [auditoria, setAuditoria] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [recarga, setRecarga] = useState(0);
  const ocupado = useRef(false);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    Promise.all([obtenerPlanes(), obtenerAuditoriaPlanes()])
      .then(([config, historial]) => {
        if (!vigente) return;
        setDatos(config); setForm(aFormulario(config)); setAuditoria(historial);
      })
      .catch((err) => { if (vigente) setError(err.message || 'No se pudieron cargar los planes.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [recarga]);

  async function guardar() {
    if (ocupado.current) return;
    setError(''); setAviso('');
    let payload;
    try { payload = validarPlanes(form); } catch (err) { setError(err.message); return; }
    const cambios = [];
    for (const [campo, etiqueta] of PRECIOS) {
      if (datos[campo] == null || Number(datos[campo]) !== Number(payload[campo])) {
        cambios.push(`${etiqueta}: ${valorLegible(datos[campo], true)} → ${valorLegible(payload[campo], true)}`);
      }
    }
    for (const plan of ['gratuito', 'pro']) {
      for (const [campo, etiqueta] of CAMPOS_LIMITES) {
        if (datos[plan][campo] !== payload[plan][campo]) {
          cambios.push(`${plan === 'pro' ? 'Pro' : 'Gratuito'} · ${etiqueta}: ${valorLegible(datos[plan][campo])} → ${payload[plan][campo]}`);
        }
      }
    }
    if (!cambios.length) { setAviso('No hay cambios para guardar.'); return; }
    ocupado.current = true;
    setGuardando(true);
    try {
      const acepta = await confirmar({
        titulo: '¿Guardar precios y límites?',
        mensaje: `${cambios.join('\n')}\n\nLos límites se aplicarán de inmediato. Los precios se usarán en nuevas suscripciones y renovaciones; los períodos en curso conservarán su precio.`,
        textoConfirmar: 'Guardar cambios', tipo: 'warning', opciones: BO,
      });
      if (!acepta) return;
      const config = await guardarPlanes(payload);
      setDatos(config); setForm(aFormulario(config));
      setAviso('Los cambios se guardaron y quedaron registrados en la auditoría.');
      try { setAuditoria(await obtenerAuditoriaPlanes()); }
      catch { setError('Los cambios se guardaron, pero no se pudo actualizar la auditoría. Volvé a abrir la pantalla para consultarla.'); }
    } catch (err) {
      setError(err.message || 'No se pudieron guardar los cambios.');
    } finally { ocupado.current = false; setGuardando(false); }
  }

  function campo(etiqueta, valor, onChange, id, precio = false) {
    return <View key={id} style={styles.campo}>
      <Text style={styles.label}>{etiqueta}</Text>
      <TextInput accessibilityLabel={etiqueta} testID={id} value={valor} onChangeText={onChange}
        editable={!guardando} keyboardType={precio ? 'decimal-pad' : 'number-pad'}
        placeholder={precio ? 'Sin configurar' : 'Ingresá un límite'} placeholderTextColor={c.textoTenue} style={styles.input} />
    </View>;
  }

  return <View style={styles.pantalla}>
    <Pressable accessibilityRole="button" disabled={guardando} onPress={onVolver}><Text style={styles.enlace}>← Volver al inicio</Text></Pressable>
    <Text style={styles.titulo}>Planes y límites</Text>
    <Text style={styles.texto}>Configurá la oferta de Pro y los cupos de cada plan.</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {aviso ? <Text accessibilityRole="alert" style={styles.exito}>{aviso}</Text> : null}
    {cargando ? <ActivityIndicator color={c.acento} /> : !form ?
      <Pressable onPress={() => setRecarga((n) => n + 1)}><Text style={styles.enlace}>Reintentar</Text></Pressable> : <>
      <View style={styles.tarjeta}>
        <Text style={styles.subtitulo}>Precios de Pro</Text>
        <Text style={styles.texto}>Importes en pesos argentinos. Cada período contratado conserva su precio.</Text>
        <View style={styles.fila}>{PRECIOS.map(([k, label]) => campo(label, form[k], (v) => setForm((f) => ({ ...f, [k]: v })), k, true))}</View>
      </View>
      <View style={styles.fila}>{['gratuito', 'pro'].map((plan) => <View key={plan} style={[styles.tarjeta, styles.plan]}>
        <Text style={styles.subtitulo}>{plan === 'pro' ? 'Plan Pro' : 'Plan gratuito'}</Text>
        {CAMPOS_LIMITES.map(([k, label]) => campo(`${label} · ${plan === 'pro' ? 'Pro' : 'Gratuito'}`, form[plan][k],
          (v) => setForm((f) => ({ ...f, [plan]: { ...f[plan], [k]: v } })), `${plan}-${k}`))}
      </View>)}</View>
      <Text style={styles.texto}>Los escaneos se renuevan el primer día de cada mes (hora Argentina). Reducir un límite no elimina contenido existente.</Text>
      <Pressable accessibilityRole="button" disabled={guardando} onPress={guardar} style={[styles.boton, guardando && styles.deshabilitado]}>
        {guardando ? <ActivityIndicator color={c.sobreAcento} /> : <Text style={styles.textoBoton}>Guardar cambios</Text>}
      </Pressable>
      <View style={styles.tarjeta}>
        <Text style={styles.subtitulo}>Auditoría · últimos 100 cambios</Text>
        {!auditoria.length ? <Text style={styles.texto}>Todavía no hay cambios registrados.</Text> : auditoria.map((a) => <View key={a.id} style={styles.evento}>
          <Text style={styles.label}>{a.idPlan === 2 ? 'Pro' : 'Gratuito'} · {COLUMNAS[a.campo] || NOMBRES[a.campo] || a.campo}</Text>
          <Text style={styles.texto}>{valorLegible(a.valorAnterior, a.campo.startsWith('Precio'))} → {valorLegible(a.valorNuevo, a.campo.startsWith('Precio'))}</Text>
          <Text style={styles.texto}>Administrador #{a.idAdministrador} · {new Date(a.fechaHora).toLocaleString('es-AR')}</Text>
        </View>)}
      </View>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  pantalla: { gap: spacing.md },
  titulo: { ...textStyles.screenTitle, color: c.texto },
  subtitulo: { ...textStyles.bodyStrong, color: c.texto, fontSize: 20 },
  texto: { ...textStyles.meta, color: c.textoSecundario },
  enlace: { ...textStyles.bodyStrong, color: c.acento },
  tarjeta: { backgroundColor: c.panel, borderColor: c.borde, borderWidth: 1, borderRadius: radii.md, padding: spacing.lg, gap: spacing.md },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  plan: { flexBasis: 320, flexGrow: 1 },
  campo: { gap: spacing.xs, flexGrow: 1, minWidth: 180 },
  label: { ...textStyles.bodyStrong, color: c.texto, fontSize: 14 },
  input: { ...textStyles.body, color: c.texto, backgroundColor: c.superficie, borderWidth: 1, borderColor: c.bordeFuerte, borderRadius: radii.xs, padding: spacing.sm, minHeight: 46 },
  boton: { backgroundColor: c.acento, borderRadius: radii.sm, padding: spacing.md, alignItems: 'center', alignSelf: 'flex-start', minWidth: 180 },
  textoBoton: { ...textStyles.bodyStrong, color: c.sobreAcento },
  deshabilitado: { opacity: 0.6 },
  error: { ...textStyles.body, color: c.peligro },
  exito: { ...textStyles.body, color: c.salvia },
  evento: { gap: spacing.xxs, borderTopWidth: 1, borderTopColor: c.borde, paddingTop: spacing.sm },
});
