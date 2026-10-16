import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import BackofficeLayout from '../../components/backoffice/BackofficeLayout';

const ADMIN = { id: 1, nombreCompleto: 'Lucía Giampieri', email: 'lucia@cyanea.test' };

function renderizar(props = {}) {
  return render(
    <BackofficeLayout
      admin={ADMIN}
      claveVista="inicio"
      onIrInicio={jest.fn()}
      onLogout={jest.fn()}
      {...props}
    >
      <Text>Contenido de prueba</Text>
    </BackofficeLayout>
  );
}

describe('BackofficeLayout', () => {
  test('muestra los datos del administrador', async () => {
    await renderizar();

    expect(screen.getByText('Lucía Giampieri')).toBeTruthy();
    expect(screen.getByText('lucia@cyanea.test')).toBeTruthy();
    expect(screen.getByText('LG')).toBeTruthy();
    expect(screen.getByText('BACKOFFICE')).toBeTruthy();
  });

  test('renderiza el contenido de la vista', async () => {
    await renderizar();

    expect(screen.getByText('Contenido de prueba')).toBeTruthy();
  });

  test('la marca lleva al inicio', async () => {
    const onIrInicio = jest.fn();
    await renderizar({ onIrInicio });

    await fireEvent.press(screen.getByText('Cyanea'));

    expect(onIrInicio).toHaveBeenCalledTimes(1);
  });

  test('salir cierra la sesión y muestra que está procesando', async () => {
    const onLogout = jest.fn(() => new Promise(() => {}));
    await renderizar({ onLogout });

    await fireEvent.press(screen.getByText('Salir'));

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Salir')).toBeNull();
  });
});