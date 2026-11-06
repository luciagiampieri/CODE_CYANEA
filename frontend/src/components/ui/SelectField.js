import { FontAwesome6 } from "@expo/vector-icons";
import { Keyboard, Text, TouchableOpacity, View } from "react-native";

import { colors } from "../../theme/tokens";
import { sheetFormStyles as styles } from "./sheetFormStyles";

// Botón desplegable de los formularios tipo hoja. Abre un `OptionSheet`.
export default function SelectField({ icono, valor, placeholder, onPress, accessibilityLabel, testID }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={styles.dropdownButton}
      testID={testID}
      onPress={() => {
        Keyboard.dismiss();
        onPress();
      }}
    >
      <View style={styles.dropdownLeftContent}>
        <FontAwesome6
          name={icono}
          size={14}
          color={colors.primary}
          style={{ marginRight: 10, width: 18, textAlign: "center" }}
        />
        <Text
          style={valor ? styles.dropdownText : styles.dropdownPlaceholder}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {valor || placeholder}
        </Text>
      </View>
      <FontAwesome6 name="chevron-down" size={14} color={colors.overlay} />
    </TouchableOpacity>
  );
}
