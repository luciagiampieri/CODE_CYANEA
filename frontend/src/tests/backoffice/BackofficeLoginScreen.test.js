import { fireEvent, render, screen } from '@testing-library/react-native';

import BackofficeLoginScreen from '../../screens/backoffice/BackofficeLoginScreen';

const PLACEHOLDER_EMAIL = 'admin@cyanea.com';
const PLACEHOLDER_PASSWORD = '••••••••';
const BOTON = 'Ingresar al panel';
const ERROR_CAMPOS = 'Completá el correo electrónico y la contraseña.';

function pendiente() {
  return new Promise(() => {});
}

async function renderizar(props = {}) {
  const onLogin = props.onLogin ?? jest.fn(pendiente);
  await render(<BackofficeLoginScreen aviso={props.aviso ?? ''} onLogin={onLogin} />);
  return onLogin;
}

async function completar(email, password) {
  await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER_EMAIL), email);
  await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER_PASSWORD), password);
}

async function enviar() {
  await fireEvent.press(screen.getByText(BOTON));
}

describe('BackofficeLoginScreen', () => {
  test('muestra el formulario de acceso', async () => {
    await renderizar();

    expect(screen.getByText('Iniciá sesión')).toBeTruthy();
    expect(screen.getByText('ACCESO RESTRINGIDO')).toBeTruthy();
    expect(screen.getByText('Correo electrónico')).toBeTruthy();
    expect(screen.getByText('Contraseña')).toBeTruthy();
    expect(screen.getByPlaceholderText(PLACEHOLDER_PASSWORD).props.secureTextEntry).toBe(true);
  });

  test('muestra el aviso que recibe', async () => {
    await renderizar({ aviso: 'Tu sesión expiró. Iniciá sesión nuevamente.' });

    expect(screen.getByText('Tu sesión expiró. Iniciá sesión nuevamente.')).toBeTruthy();
  });

  test('no envía con los campos vacíos', async () => {
    const onLogin = await renderizar();

    await enviar();

    expect(screen.getByText(ERROR_CAMPOS)).toBeTruthy();
    expect(onLogin).not.toHaveBeenCalled();
  });

  test('no envía sin contraseña', async () => {
    const onLogin = await renderizar();
    await completar('admin@cyanea.com', '');

    await enviar();

    expect(screen.getByText(ERROR_CAMPOS)).toBeTruthy();
    expect(onLogin).not.toHaveBeenCalled();
  });

  test('no envía si el correo son solo espacios', async () => {
    const onLogin = await renderizar();
    await completar('   ', 'Segura123!');

    await enviar();

    expect(screen.getByText(ERROR_CAMPOS)).toBeTruthy();
    expect(onLogin).not.toHaveBeenCalled();
  });

  test('normaliza el correo antes de enviarlo', async () => {
    const onLogin = await renderizar();
    await completar('  Admin@Cyanea.COM ', 'Segura123!');

    await enviar();

    expect(onLogin).toHaveBeenCalledWith('admin@cyanea.com', 'Segura123!');
  });

  test('mientras envía bloquea el formulario', async () => {
    await renderizar();
    await completar('admin@cyanea.com', 'Segura123!');

    await enviar();

    expect(screen.queryByText(BOTON)).toBeNull();
    expect(screen.getByPlaceholderText(PLACEHOLDER_EMAIL).props.editable).toBe(false);
    expect(screen.getByPlaceholderText(PLACEHOLDER_PASSWORD).props.editable).toBe(false);
  });

  test('no envía dos veces mientras espera la respuesta', async () => {
    const onLogin = await renderizar();
    await completar('admin@cyanea.com', 'Segura123!');
    const campoPassword = screen.getByPlaceholderText(PLACEHOLDER_PASSWORD);

    await fireEvent(campoPassword, 'submitEditing');
    await fireEvent(campoPassword, 'submitEditing');

    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  test('se puede enviar con Enter desde la contraseña', async () => {
    const onLogin = await renderizar();
    await completar('admin@cyanea.com', 'Segura123!');

    await fireEvent(screen.getByPlaceholderText(PLACEHOLDER_PASSWORD), 'submitEditing');

    expect(onLogin).toHaveBeenCalledWith('admin@cyanea.com', 'Segura123!');
  });

  test('ante credenciales inválidas muestra el error y borra la contraseña', async () => {
    await renderizar({
      onLogin: jest.fn().mockRejectedValue(new Error('Credenciales inválidas.')),
    });
    await completar('admin@cyanea.com', 'mala');

    await enviar();

    expect(await screen.findByText('Credenciales inválidas.')).toBeTruthy();
    expect(screen.getByPlaceholderText(PLACEHOLDER_PASSWORD).props.value).toBe('');
    expect(screen.getByPlaceholderText(PLACEHOLDER_EMAIL).props.value).toBe('admin@cyanea.com');
    expect(screen.getByText(BOTON)).toBeTruthy();
  });

  test('un error sin mensaje muestra uno genérico', async () => {
    await renderizar({ onLogin: jest.fn().mockRejectedValue({}) });
    await completar('admin@cyanea.com', 'Segura123!');

    await enviar();

    expect(await screen.findByText('No se pudo iniciar sesión.')).toBeTruthy();
  });

  test('al reintentar se limpia el error anterior', async () => {
    const onLogin = jest
      .fn()
      .mockRejectedValueOnce(new Error('Credenciales inválidas.'))
      .mockImplementation(pendiente);
    await renderizar({ onLogin });
    await completar('admin@cyanea.com', 'mala');
    await enviar();
    await screen.findByText('Credenciales inválidas.');

    await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER_PASSWORD), 'Segura123!');
    await enviar();

    expect(screen.queryByText('Credenciales inválidas.')).toBeNull();
    expect(onLogin).toHaveBeenCalledTimes(2);
  });
});