import { Text } from "react-native";
import RecoveryLayout from "../components/ui/RecoveryLayout";
import ResendConfirmationForm from "../components/ui/ResendConfirmationForm";
import { colors, textStyles } from "../theme/tokens";

export default function RegistrationSuccessScreen({ navigation, route }) {
  const email = route?.params?.email || "";
  return (
    <RecoveryLayout title="¡Revisá tu correo electrónico!"
      subtitle={`Revisá la bandeja de entrada de ${email} y seguí el enlace para activar tu cuenta. El enlace es válido por 24 horas.`}
      onBack={() => navigation.replace("Login")} backLabel="Ir al inicio de sesión">
      <Text style={{ ...textStyles.body, color: colors.textSecondary }}>¿No recibiste el correo? Revisá spam o solicitá un nuevo enlace.</Text>
      <ResendConfirmationForm initialEmail={email} editable={!email} />
    </RecoveryLayout>
  );
}
