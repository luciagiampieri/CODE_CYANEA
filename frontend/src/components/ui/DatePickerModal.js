import { useMemo } from "react";
import { Modal, Pressable, Text, StyleSheet, useWindowDimensions } from "react-native";
import CalendarPicker from "react-native-calendar-picker";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";
import { toYMD, parseYMD, toJsDate, getTodayIso } from "../../utils/dates";
import { FontAwesome6 } from "@expo/vector-icons";

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DISABLED_DAY_COLOR = "#c9ced6";

/**
 * Modal de selección de fecha, reusado en todas las pantallas que necesiten
 * elegir una fecha (CreateTripScreen, AddGastoScreen, etc). Encapsula toda
 * la lógica de estilos de react-native-calendar-picker (hoy / seleccionado)
 * para que quede resuelta en un solo lugar.
 *
 * @param {boolean} visible
 * @param {() => void} onClose
 * @param {string} title - texto arriba del calendario (ej: "Fecha de ida")
 * @param {string} value - fecha seleccionada en formato "YYYY-MM-DD", o ""
 * @param {(ymd: string) => void} onChange
 * @param {Date} [minDate] - fecha mínima seleccionable
 * @param {Date} [maxDate] - fecha máxima seleccionable
 */
export default function DatePickerModal({
  visible,
  onClose,
  title,
  value,
  onChange,
  minDate,
  maxDate,
}) {
  const { width: windowWidth } = useWindowDimensions();
  const calendarWidth = Math.min(windowWidth - (spacing.lg + spacing.md) * 2, 360);

  const todayYMD = getTodayIso();
  const todayDate = useMemo(() => parseYMD(todayYMD, 12), [todayYMD]);
  const isTodaySelected = value === todayYMD;

  const calendarInitialDate = useMemo(
    () => parseYMD(value || (minDate ? toYMD(minDate) : todayYMD)),
    [value, minDate, todayYMD]
  );
  const calendarSelectedDate = useMemo(
    () => (value ? parseYMD(value) : undefined),
    [value]
  );

  const customDatesStyles = useMemo(() => {
    const stylesArr = [];

    if (!isTodaySelected) {
      stylesArr.push({
        date: todayDate,
        style: {
          backgroundColor: "transparent",
          borderWidth: 1.5,
          borderColor: colors.primary,
          borderRadius: 999,
        },
        textStyle: { color: colors.primary, fontWeight: "700" },
      });
    }

    if (calendarSelectedDate) {
      stylesArr.push({
        date: calendarSelectedDate,
        style: { backgroundColor: colors.primary },
        textStyle: { color: colors.textInverse, fontWeight: "700" },
      });
    }

    return stylesArr;
  }, [calendarSelectedDate, isTodaySelected, todayDate]);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.calendarContainer} onPress={(e) => e.stopPropagation()}>
          {title ? <Text style={styles.calendarTitle}>{title}</Text> : null}

          <CalendarPicker
            width={calendarWidth}
            initialDate={calendarInitialDate}
            customDatesStyles={customDatesStyles}
            minDate={minDate}
            maxDate={maxDate}
            restrictMonthNavigation
            onDateChange={(date) => {
              const picked = toJsDate(date);
              if (!picked || Number.isNaN(picked.getTime())) return;
              onChange(toYMD(picked));
              onClose();
            }}
            months={MONTH_NAMES}
            weekdays={WEEKDAY_LABELS}
            startFromMonday
            selectMonthTitle="Elegí el mes de "
            selectYearTitle="Elegí el año"
            previousComponent={<FontAwesome6 name="chevron-left" size={16} color={colors.primary} />}
            nextComponent={<FontAwesome6 name="chevron-right" size={16} color={colors.primary} />}
            todayBackgroundColor={isTodaySelected ? colors.primary : "transparent"}
            todayTextStyle={{
              color: isTodaySelected ? colors.textInverse : colors.primary,
              fontWeight: "700",
            }}
            textStyle={{ color: colors.textPrimary }}
            disabledDatesTextStyle={{ color: DISABLED_DAY_COLOR }}
            monthTitleStyle={{ color: colors.primary, fontWeight: "700", textDecorationLine: "underline" }}
            yearTitleStyle={{ color: colors.primary, fontWeight: "700", textDecorationLine: "underline" }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  calendarContainer: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radii.lg,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  calendarTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 16,
    marginBottom: 2,
  },
});