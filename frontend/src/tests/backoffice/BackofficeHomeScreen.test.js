import { fireEvent, render, screen } from '@testing-library/react-native';

import BackofficeHomeScreen from '../../screens/backoffice/BackofficeHomeScreen';

jest.mock('../../components/backoffice/PanelMetricas', () => ({
  __esModule: true,
  default: () => null,
}));

const ADMIN = { id: 1, nombreCompleto: 'Lucía Giampieri', email: 'lucia@cyanea.test' };

describe('BackofficeHomeScreen', () => {
  test('saluda al administrador por su nombre', async () => {
    await render(<BackofficeHomeScreen admin={ADMIN} onAbrirUsuarios={jest.fn()} />);

    expect(screen.getByText('Lucía')).toBeTruthy();
  });

  test('el botón del banner abre la gestión de usuarios', async () => {
    const onAbrirUsuarios = jest.fn();
    await render(<BackofficeHomeScreen admin={ADMIN} onAbrirUsuarios={onAbrirUsuarios} />);

    await fireEvent.press(screen.getByText('Gestionar usuarios'));

    expect(onAbrirUsuarios).toHaveBeenCalledTimes(1);
  });

  test('ofrece accesos a categorías y al monitoreo de IA', async () => {
    const onAbrirCategorias = jest.fn();
    const onAbrirMonitoreoIA = jest.fn();
    await render(
      <BackofficeHomeScreen
        admin={ADMIN}
        onAbrirCategorias={onAbrirCategorias}
        onAbrirMonitoreoIA={onAbrirMonitoreoIA}
        onAbrirUsuarios={jest.fn()}
      />
    );

    await fireEvent.press(screen.getByText('Categorías'));
    await fireEvent.press(screen.getByText('Monitoreo de IA'));

    expect(onAbrirCategorias).toHaveBeenCalledTimes(1);
    expect(onAbrirMonitoreoIA).toHaveBeenCalledTimes(1);
  });
});
