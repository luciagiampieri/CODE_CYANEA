import BackofficePlanesScreen from '../screens/backoffice/BackofficePlanesScreen';
import BackofficeSuscripcionesScreen from '../screens/backoffice/BackofficeSuscripcionesScreen';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import BackofficeLayout from '../components/backoffice/BackofficeLayout';
import { DialogHost } from '../components/ui/AppDialog';
import { useInactividad } from '../hooks/useInactividad';
import BackofficeCategoriasScreen from '../screens/backoffice/BackofficeCategoriasScreen';
import BackofficeHomeScreen from '../screens/backoffice/BackofficeHomeScreen';
import BackofficeLoginScreen from '../screens/backoffice/BackofficeLoginScreen';
import BackofficeMonitoreoIAScreen from '../screens/backoffice/BackofficeMonitoreoIAScreen';
import BackofficeTerminosScreen from '../screens/backoffice/BackofficeTerminosScreen';
import BackofficeUsuarioDetalleScreen from '../screens/backoffice/BackofficeUsuarioDetalleScreen';
import BackofficeUsuariosScreen, {
  FILTROS_USUARIOS_INICIALES,
} from '../screens/backoffice/BackofficeUsuariosScreen';
import {
  cerrarSesion,
  iniciarSesion,
  obtenerAdminActual,
  obtenerToken,
  registrarExpiracionSesion,
} from '../services/backofficeApi';
import { backofficeColors as c } from '../theme/backofficeTokens';

const VISTA_INICIO = { nombre: 'inicio' };

export default function BackofficeApp() {
  const [admin, setAdmin] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState('');
  const [vista, setVista] = useState(VISTA_INICIO);
  const [filtrosUsuarios, setFiltrosUsuarios] = useState(FILTROS_USUARIOS_INICIALES);

  const reiniciarNavegacion = useCallback(() => {
    setVista(VISTA_INICIO);
    setFiltrosUsuarios(FILTROS_USUARIOS_INICIALES);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Cyanea · Backoffice';
    }

    registrarExpiracionSesion(() => {
      setAdmin(null);
      reiniciarNavegacion();
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
  }, [reiniciarNavegacion]);

  const manejarLogin = useCallback(async (email, password) => {
    const datos = await iniciarSesion(email, password);
    setAviso('');
    setAdmin(datos);
  }, []);

  const manejarLogout = useCallback(async () => {
    await cerrarSesion();
    setAdmin(null);
    reiniciarNavegacion();
    setAviso('');
  }, [reiniciarNavegacion]);

  const manejarInactividad = useCallback(async () => {
    await cerrarSesion();
    setAdmin(null);
    reiniciarNavegacion();
    setAviso('Tu sesión se cerró por 30 minutos de inactividad.');
  }, [reiniciarNavegacion]);

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

  let pantalla;
  if (vista.nombre === 'usuarios') {
    pantalla = (
      <BackofficeUsuariosScreen
        filtros={filtrosUsuarios}
        onCambiarFiltros={setFiltrosUsuarios}
        onVerUsuario={(idUsuario) => setVista({ nombre: 'detalleUsuario', idUsuario })}
        onVolver={() => setVista(VISTA_INICIO)}
      />
    );
  } else if (vista.nombre === 'categorias') {
    pantalla = <BackofficeCategoriasScreen onVolver={() => setVista(VISTA_INICIO)} />;
  } else if (vista.nombre === 'monitoreoIA') {
    pantalla = <BackofficeMonitoreoIAScreen onVolver={() => setVista(VISTA_INICIO)} />;
  } else if (vista.nombre === 'planes') {
    pantalla = <BackofficePlanesScreen onVolver={() => setVista(VISTA_INICIO)} />;
  } else if (vista.nombre === 'suscripciones') {
    pantalla = <BackofficeSuscripcionesScreen onVolver={() => setVista(VISTA_INICIO)} />;
  } else if (vista.nombre === 'terminos') {
    pantalla = <BackofficeTerminosScreen onVolver={() => setVista(VISTA_INICIO)} />;
  } else if (vista.nombre === 'detalleUsuario') {
    pantalla = (
      <BackofficeUsuarioDetalleScreen
        idUsuario={vista.idUsuario}
        onVolver={() => setVista({ nombre: 'usuarios' })}
      />
    );
  } else {
    pantalla = (
      <BackofficeHomeScreen
        admin={admin}
        onAbrirCategorias={() => setVista({ nombre: 'categorias' })}
        onAbrirMonitoreoIA={() => setVista({ nombre: 'monitoreoIA' })}
        onAbrirPlanes={() => setVista({ nombre: 'planes' })}
        onAbrirSuscripciones={() => setVista({ nombre: 'suscripciones' })}
        onAbrirTerminos={() => setVista({ nombre: 'terminos' })}
        onAbrirUsuarios={() => setVista({ nombre: 'usuarios' })}
      />
    );
  }

  return (
    <>
      <BackofficeLayout
        admin={admin}
        claveVista={`${vista.nombre}-${vista.idUsuario ?? ''}`}
        onIrInicio={() => setVista(VISTA_INICIO)}
        onLogout={manejarLogout}
      >
        {pantalla}
      </BackofficeLayout>
      <DialogHost root />
    </>
  );
}

const styles = StyleSheet.create({
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.fondo,
  },
});
