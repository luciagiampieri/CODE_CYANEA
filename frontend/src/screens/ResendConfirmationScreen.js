import RecoveryLayout from "../components/ui/RecoveryLayout";
import ResendConfirmationForm from "../components/ui/ResendConfirmationForm";

export default function ResendConfirmationScreen({ navigation, route }) {
  return (
    <RecoveryLayout title="Confirmar tu cuenta"
      subtitle="Ingresá el correo con el que te registraste para solicitar un nuevo enlace. Revisá también la carpeta de spam."
      onBack={() => navigation.navigate("Login")}>
      <ResendConfirmationForm initialEmail={route?.params?.email || ""} />
    </RecoveryLayout>
  );
}
