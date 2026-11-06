import { useEffect, useRef } from "react";
import { FontAwesome6 } from "@expo/vector-icons";
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { colors } from "../../theme/tokens";
import { sheetFormStyles as styles } from "./sheetFormStyles";

// Panel inferior de selección de los formularios tipo hoja. Se renderiza dentro de la hoja,
// después de su ScrollView. `opciones`: { name, label, icon? }; sin `icon` se usa `name`.
export default function OptionSheet({ visible, titulo, opciones, seleccionado, onSelect, onClose }) {
  const desplazamiento = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(desplazamiento, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    } else {
      desplazamiento.setValue(300);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.modalOverlayC}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View style={[styles.bottomSheetC, { transform: [{ translateY: desplazamiento }] }]}>
        <View style={styles.modalHeaderC}>
          <Text style={styles.modalTitleC}>{titulo}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <FontAwesome6 name="xmark" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <FlatList
          data={opciones}
          keyExtractor={(item) => item.name}
          renderItem={({ item, index }) => {
            const esActivo = seleccionado === item.name;
            const esElUltimo = index === opciones.length - 1;
            return (
              <TouchableOpacity
                style={[
                  styles.modalItemC,
                  esActivo && styles.modalItemActiveC,
                  esElUltimo && { borderBottomWidth: 0 },
                ]}
                onPress={() => onSelect(item.name)}
              >
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                  <FontAwesome6
                    name={item.icon ?? item.name}
                    size={16}
                    color={esActivo ? colors.primary : "#4b5563"}
                    style={{ marginRight: 12, width: 24, textAlign: "center" }}
                  />
                  <Text
                    style={[styles.modalItemTextC, esActivo && styles.modalItemTextActiveC]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {item.label}
                  </Text>
                </View>
                {esActivo && <FontAwesome6 name="check" size={14} color={colors.primary} />}
              </TouchableOpacity>
            );
          }}
        />
      </Animated.View>
    </View>
  );
}
