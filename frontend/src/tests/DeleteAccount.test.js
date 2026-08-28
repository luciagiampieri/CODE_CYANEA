import { render, waitFor, fireEvent } from "@testing-library/react-native";
import EditProfileScreen from "../screens/EditProfileScreen";
import { getCurrentUser, deleteCurrentUser, verifyPassword} from "../services/api";

const mockLogout = jest.fn();

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    logout: mockLogout,
  }),
}));

jest.mock("../services/api", () => ({
  getCurrentUser: jest.fn(),
  updateCurrentUser: jest.fn(),
  uploadProfilePhoto: jest.fn(),
  verifyPassword: jest.fn(),
  deleteCurrentUser: jest.fn(),
}));

jest.mock("../hooks/useResponsive", () => ({
  __esModule: true,
  default: () => ({
    isDesktop: false,
  }),
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: {
    Images: "Images",
  },
}));

jest.mock("../components/ui/PrimaryButton", () => {
  const React = require("react");
  const { Pressable, Text } = require("react-native");

  return function PrimaryButton({
    label,
    onPress,
    loading,
    testID,
  }) {
    return (
      <Pressable
        testID={testID || `button-${label}`}
        onPress={onPress}
        disabled={loading}
      >
        <Text>{label}</Text>
      </Pressable>
    );
  };
});

describe("US 12 - Eliminar cuenta", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    getCurrentUser.mockResolvedValue({
      nombre: "Juan",
      apellido: "Pérez",
      nombreUsuario: "juanperez",
      email: "juan@gmail.com",
      fotoUrl: null,
      proveedorAutenticacion: "local",
    });
  });

  test("muestra la opción Eliminar cuenta", async () => {
    const { getByTestId } = await render(
      <EditProfileScreen navigation={{}} />
    );

    await waitFor(() => {
      expect(getByTestId("delete-account-button")).toBeTruthy();
    });
    });
  
    it("muestra el modal para ingresar la contraseña en una cuenta local", async () => {
        const {
            getByTestId,
            getByPlaceholderText,
        } = await render(
            <EditProfileScreen navigation={{}} />
        );

        // El usuario toca "Eliminar cuenta"
        fireEvent.press(getByTestId("delete-account-button"));

        // Al ser una cuenta local, debe aparecer el campo de contraseña
        await waitFor(() => {
            expect(getByPlaceholderText("Contraseña")).toBeTruthy();
        });
        });

    it("muestra un error si se intenta continuar sin ingresar contraseña", async () => {
        const {
            getByTestId,
            getByPlaceholderText,
            findByText,
        } = await render(
            <EditProfileScreen navigation={{}} />
        );

        // Primero presionamos el botón "Eliminar cuenta" de la pantalla
        fireEvent.press(getByTestId("delete-account-button"));

        // Verificamos que se abrió el modal y aparece el campo contraseña
        await waitFor(() => {
            expect(getByPlaceholderText("Contraseña")).toBeTruthy();
        });

        fireEvent.press(getByTestId("confirm-password-delete-button"));

        const errorMessage = await findByText(
            "Debés ingresar tu contraseña."
        );
        expect(errorMessage).toBeTruthy();

        expect(deleteCurrentUser).not.toHaveBeenCalled();
    });

    it("muestra un error si se ingresa una contraseña incorrecta", async () => {
        const {
            getByTestId,
            getByPlaceholderText,
            findByText,
            queryByText,
        } = await render(               
            <EditProfileScreen navigation={{}} />
        );

        verifyPassword.mockRejectedValueOnce(
            new Error("Contraseña incorrecta.")
        );

        fireEvent.press(getByTestId("delete-account-button"));

        await waitFor(() => {
            expect(getByPlaceholderText("Contraseña")).toBeTruthy();
        });

        fireEvent.changeText(
            getByPlaceholderText("Contraseña"),
            "wrongpassword"
        );

        await waitFor(() => {
            expect(getByPlaceholderText("Contraseña").props.value).toBe(
                "wrongpassword"
            );
        });

        fireEvent.press(getByTestId("confirm-password-delete-button"));

        const errorMessage = await findByText("Contraseña incorrecta.");
        expect(errorMessage).toBeTruthy();

        expect(
            queryByText("¿Eliminar cuenta definitivamente?")
        ).toBeNull();

        expect(deleteCurrentUser).not.toHaveBeenCalled();
    }); 

    it("permite eliminar la cuenta con una contraseña correcta", async () => {
        const {
            getByTestId,
            getByPlaceholderText,
            findByText,
        } = await render(
            <EditProfileScreen navigation={{}} />
        );

        verifyPassword.mockResolvedValueOnce({
            valid: true,
        });

        deleteCurrentUser.mockResolvedValueOnce({
            message: "Cuenta eliminada correctamente.",
        });

        fireEvent.press(getByTestId("delete-account-button"));

        await waitFor(() => {
            expect(getByPlaceholderText("Contraseña")).toBeTruthy();
        });

        fireEvent.changeText(
            getByPlaceholderText("Contraseña"),
            "correctpassword"
        );

        await waitFor(() => {
            expect(getByPlaceholderText("Contraseña").props.value).toBe(
                "correctpassword"
            );
        });

        fireEvent.press(getByTestId("confirm-password-delete-button"));

        expect(
            await findByText("¿Eliminar cuenta definitivamente?")
        ).toBeTruthy();

        expect(verifyPassword).toHaveBeenCalledWith(
            "correctpassword"
        );

        fireEvent.press(
            getByTestId("confirm-delete-account-button")
        );

        await waitFor(() => {
            expect(deleteCurrentUser).toHaveBeenCalledWith(
                "correctpassword"
            );
        });

        expect(mockLogout).toHaveBeenCalled();
    });

    it("permite eliminar una cuenta de Google sin ingresar contraseña", async () => {
        getCurrentUser.mockResolvedValueOnce({
            nombre: "Juan",
            apellido: "Pérez",
            nombreUsuario: "juanperez",
            email: "juan@gmail.com",
            fotoUrl: null,
            proveedorAutenticacion: "google",
        });

        const {
            getByTestId,
            findByText,
            queryByPlaceholderText,
        } = await render(
            <EditProfileScreen navigation={{}} />
        );

        fireEvent.press(
            getByTestId("delete-account-button")
        );

        expect(
            await findByText("¿Eliminar cuenta definitivamente?")
        ).toBeTruthy();

        expect(
            queryByPlaceholderText("Contraseña")
        ).toBeNull();

        expect(verifyPassword).not.toHaveBeenCalled();

        expect(deleteCurrentUser).not.toHaveBeenCalled();
    });

    it("permite eliminar una cuenta de Facebook sin ingresar contraseña", async () => {
        getCurrentUser.mockResolvedValueOnce({
            nombre: "Juan",
            apellido: "Pérez",
            nombreUsuario: "juanperez",
            email: "juan@gmail.com",
            fotoUrl: null,
            proveedorAutenticacion: "facebook",
        });

        const {
            getByTestId,
            findByText,
            queryByPlaceholderText,
        } = await render(
            <EditProfileScreen navigation={{}} />
        );

        fireEvent.press(
            getByTestId("delete-account-button")
        );

        expect(
            await findByText("¿Eliminar cuenta definitivamente?")
        ).toBeTruthy();

        expect(
            queryByPlaceholderText("Contraseña")
        ).toBeNull();

        expect(verifyPassword).not.toHaveBeenCalled();

        expect(deleteCurrentUser).not.toHaveBeenCalled();
    });

    it("no elimina la cuenta si se cancela la confirmación", async () => {
        const {
            getByTestId,
            getByPlaceholderText,
            findByText,
            queryByText,
        } = await render(
            <EditProfileScreen navigation={{}} />
        );

        verifyPassword.mockResolvedValueOnce({
            valid: true,
        });

        fireEvent.press(
            getByTestId("delete-account-button")
        );

        await waitFor(() => {
            expect(
                getByPlaceholderText("Contraseña")
            ).toBeTruthy();
        });

        fireEvent.changeText(
            getByPlaceholderText("Contraseña"),
            "correctpassword"
        );

        await waitFor(() => {
            expect(getByPlaceholderText("Contraseña").props.value).toBe(
                "correctpassword"
            );
        });

        fireEvent.press(
            getByTestId("confirm-password-delete-button")
        );

        expect(
            await findByText("¿Eliminar cuenta definitivamente?")
        ).toBeTruthy();

        fireEvent.press(
            getByTestId("cancel-delete-account-button")
        );

        await waitFor(() => {
            expect(
                queryByText("¿Eliminar cuenta definitivamente?")
            ).toBeNull();
        });

        expect(deleteCurrentUser).not.toHaveBeenCalled();
        expect(mockLogout).not.toHaveBeenCalled();
    });
});
