import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import Modal from "./AppModal";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

const MENU_WIDTH = 230;
const ITEM_HEIGHT = 44;
const GAP = 6;


export default function ActionMenu({
  items,
  accessibilityLabel = "Más opciones",
  disabled = false,
  triggerColor = colors.textMuted,
  testID,
}) {
  const triggerRef = useRef(null);
  const [abierto, setAbierto] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const { width: winW, height: winH } = useWindowDimensions();

  const visibles = (items ?? []).filter(Boolean);
  if (visibles.length === 0) return null;

  function abrir() {
    setAnchor(null);
    setAbierto(true);
    triggerRef.current?.measureInWindow?.((x, y, w, h) => setAnchor({ x, y, w, h }));
  }

  function cerrar() {
    setAbierto(false);
    setAnchor(null);
  }


  function elegir(item) {
    cerrar();
    setTimeout(() => item.onPress?.(), 150);
  }

  let posicion = { top: 0, right: spacing.md, opacity: 0 };
  if (anchor) {
    const alto = visibles.length * ITEM_HEIGHT + spacing.xs * 2;
    const right = Math.max(spacing.md, winW - (anchor.x + anchor.w));
    const entraAbajo = anchor.y + anchor.h + GAP + alto <= winH - spacing.lg;
    posicion = entraAbajo
      ? { top: anchor.y + anchor.h + GAP, right }
      : { top: Math.max(spacing.lg, anchor.y - alto - GAP), right };
  }

  return (
    <>
      <Pressable
        ref={triggerRef}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ expanded: abierto, disabled }}
        disabled={disabled}
        hitSlop={8}
        onPress={abrir}
        style={({ pressed }) => [
          styles.trigger,
          (pressed || abierto) && styles.triggerActive,
          disabled && { opacity: 0.4 },
        ]}
        testID={testID}
      >
        <FontAwesome6 name="ellipsis-vertical" size={14} color={triggerColor} />
      </Pressable>

      <Modal animationType="fade" transparent visible={abierto} onRequestClose={cerrar}>
        <Pressable
          accessibilityLabel="Cerrar menú"
          style={StyleSheet.absoluteFill}
          onPress={cerrar}
        />
        <View accessibilityRole="menu" style={[styles.menu, posicion]}>
          {visibles.map((item, index) => (
            <View key={item.label}>
              {index > 0 ? <View style={styles.separator} /> : null}
              <Pressable
                accessibilityRole="menuitem"
                onPress={() => elegir(item)}
                style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                testID={item.testID}
              >
                <FontAwesome6
                  name={item.icon}
                  size={14}
                  color={item.destructive ? colors.danger : colors.primary}
                />
                <Text style={[styles.itemText, item.destructive && styles.itemTextDanger]}>
                  {item.label}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  triggerActive: {
    backgroundColor: colors.surfaceAlt,
  },
  menu: {
    position: "absolute",
    width: MENU_WIDTH,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  item: {
    height: ITEM_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  itemPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  itemText: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 14,
  },
  itemTextDanger: {
    color: colors.danger,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
});