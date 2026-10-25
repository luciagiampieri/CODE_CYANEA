import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getAvailablePlans } from '../services/api';

export default function useAvailablePlans() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);
  useFocusEffect(useCallback(() => {
    let vigente = true;
    setCargando(true); setError(''); setDatos(null);
    getAvailablePlans().then((respuesta) => { if (vigente) setDatos(respuesta); })
      .catch((err) => { if (vigente) setError(err.message || 'No se pudieron cargar los planes.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [recarga]));
  return { datos, cargando, error, actualizar: () => setRecarga((n) => n + 1) };
}
