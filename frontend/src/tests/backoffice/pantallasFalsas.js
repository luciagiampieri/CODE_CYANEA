import { Pressable, Text, View } from 'react-native';

function Boton({ texto, onPress }) {
  return (
    <Pressable onPress={onPress}>
      <Text>{texto}</Text>
    </Pressable>
  );
}

export function LoginFalso({ onLogin, aviso }) {
  return (
    <View>
      <Text>Pantalla de login</Text>
      {aviso ? <Text>{aviso}</Text> : null}
      <Boton
        onPress={() => onLogin('admin@cyanea.test', 'Segura123!').catch(() => {})}
        texto="Ingresar"
      />
    </View>
  );
}

export function HomeFalso({ admin, onAbrirUsuarios, onAbrirCategorias, onAbrirMonitoreoIA, onAbrirPlanes, onAbrirSuscripciones }) {
  return (
    <View>
      <Text>{`Inicio de ${admin.nombreCompleto}`}</Text>
      <Boton onPress={onAbrirUsuarios} texto="Ir a usuarios" />
      <Boton onPress={onAbrirCategorias} texto="Ir a categorías" />
      <Boton onPress={onAbrirMonitoreoIA} texto="Ir a monitoreo" />
      <Boton onPress={onAbrirPlanes} texto="Ir a planes" />
      <Boton onPress={onAbrirSuscripciones} texto="Ir a suscripciones" />
    </View>
  );
}

export function PlanesFalso({ onVolver }) {
  return <View><Text>Pantalla de planes</Text><Boton onPress={onVolver} texto="Volver de planes" /></View>;
}

export function SuscripcionesFalso({ onVolver }) {
  return <View><Text>Pantalla de suscripciones</Text><Boton onPress={onVolver} texto="Volver de suscripciones" /></View>;
}

export function CategoriasFalso({ onVolver }) {
  return (
    <View>
      <Text>Pantalla de categorías</Text>
      <Boton onPress={onVolver} texto="Volver de categorías" />
    </View>
  );
}

export function MonitoreoFalso({ onVolver }) {
  return (
    <View>
      <Text>Pantalla de monitoreo</Text>
      <Boton onPress={onVolver} texto="Volver de monitoreo" />
    </View>
  );
}

export function UsuariosFalso({ filtros, onCambiarFiltros, onVerUsuario, onVolver }) {
  return (
    <View>
      <Text>{`Usuarios q=${filtros.q}`}</Text>
      <Boton onPress={() => onCambiarFiltros({ ...filtros, q: 'lucia' })} texto="Filtrar" />
      <Boton onPress={() => onVerUsuario(7)} texto="Ver usuario 7" />
      <Boton onPress={onVolver} texto="Volver" />
    </View>
  );
}

export function DetalleFalso({ idUsuario, onVolver }) {
  return (
    <View>
      <Text>{`Detalle ${idUsuario}`}</Text>
      <Boton onPress={onVolver} texto="Volver al listado" />
    </View>
  );
}
