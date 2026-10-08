import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { useInactividad } from '../hooks/useInactividad';
import BackofficeHomeScreen from '../screens/backoffice/BackofficeHomeScreen';
import BackofficeLoginScreen from '../screens/backoffice/BackofficeLoginScreen';
import {
  cerrarSesion,
  iniciarSesion,
  obtenerAdminActual,
  obtenerToken,
  registrarExpiracionSesion,
} from '../services/backofficeApi';
import { backofficeColors as c } from '../theme/backofficeTokens';

export default function BackofficeApp() {
  const [admin, setAdmin] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Cyanea · Backoffice';
    }

    registrarExpiracionSesion(() => {
      setAdmin(null);
      setAviso('Tu sesión expiró. Iniciá sesión nuevamente.');
    });

    if (!obtenerToken()) {
      setCargando(false);
    } else {
      obtenerAdminActual()
        .then(setAdmin)
        .catch(() => setAdmin(null))
        .finally(() => setCargando(false));
    }

    return () => registrarExpiracionSesion(null);
  }, []);

  const manejarLogin = useCallback(async (email, password) => {
    const datos = await iniciarSesion(email, password);
    setAviso('');
    setAdmin(datos);
  }, []);

  const manejarLogout = useCallback(async () => {
    await cerrarSesion();
    setAdmin(null);
    setAviso('');
  }, []);

  const manejarInactividad = useCallback(async () => {
    await cerrarSesion();
    setAdmin(null);
    setAviso('Tu sesión se cerró por 30 minutos de inactividad.');
  }, []);

  useInactividad(Boolean(admin), manejarInactividad);

  if (cargando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={c.acento} />
      </View>
    );
  }

  if (!admin) {
    return <BackofficeLoginScreen onLogin={manejarLogin} aviso={aviso} />;
  }

  return <BackofficeHomeScreen admin={admin} onLogout={manejarLogout} />;
}

const styles = StyleSheet.create({
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.fondo,
  },
});