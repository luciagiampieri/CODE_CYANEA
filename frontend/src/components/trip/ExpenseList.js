import { FontAwesome6 } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import CalendarPicker from "react-native-calendar-picker";

import { formatMoney } from "../../utils/money";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";
import { centerInScroll } from "../../utils/scrollHelpers";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const MONTHS_LONG = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DISABLED_DAY_COLOR = "#c9ced6";
const TINTE_PRIMARIO = colors.primarySoft ? `${colors.primarySoft}22` : "#eef4ff";

const normalizeText = (text) =>
  (text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const passesSearch = (expense, query) => !query || normalizeText(expense.Nombre).includes(query);

const MAX_LIST_HEIGHT = 340;

const CATEGORY_ICONS = {
  "comida y bebida": "utensils",
  transporte: "car",
  alojamiento: "bed",
  entretenimiento: "ticket",
  compras: "bag-shopping",
  servicios: "bell-concierge",
  otros: "receipt",
};

export function iconForCategory(nombre) {
  return CATEGORY_ICONS[String(nombre ?? "").trim().toLowerCase()] ?? "receipt";
}

export function formatExpenseDate(ymd, today = new Date()) {
  if (!ymd) return "";
  const [year, month, day] = String(ymd).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "";
  const base = `${day} ${MONTHS[month - 1]}`;
  return year === today.getFullYear() ? base : `${base} ${year}`;
}

function formatOriginalAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const pad = (n) => String(n).padStart(2, "0");

const expenseYmd = (expense) => String(expense.FechaGasto ?? "").slice(0, 10);

function ymdFromDate(value) {
  const date = value?.toDate ? value.toDate() : new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateFromYmd(ymd) {
  const [year, month, day] = String(ymd).split("-").map(Number);
  return new Date(year, month - 1, day);
}

const monthKey = (year, monthIndex) => `${year}-${pad(monthIndex + 1)}`;

const isDateFilterSet = (filter) =>
  Boolean(filter) && (filter.mode === "months" ? filter.months?.length > 0 : Boolean(filter.from));

function formatMonthKey(key, short = false) {
  const [year, month] = key.split("-").map(Number);
  const name = MONTHS_LONG[month - 1];
  return short ? `${name.slice(0, 3)} ${year}` : `${name} ${year}`;
}

function formatDateFilter(filter) {
  if (!isDateFilterSet(filter)) return "Todas las fechas";
  if (filter.mode === "months") {
    return filter.months.length === 1
      ? formatMonthKey(filter.months[0])
      : `${filter.months.length} meses`;
  }
  if (!filter.to || filter.to === filter.from) return formatExpenseDate(filter.from);
  return `${formatExpenseDate(filter.from)} – ${formatExpenseDate(filter.to)}`;
}

function passesDate(expense, filter) {
  if (!isDateFilterSet(filter)) return true;
  const ymd = expenseYmd(expense);
  if (!ymd) return false;
  if (filter.mode === "months") return filter.months.includes(ymd.slice(0, 7));
  return ymd >= filter.from && ymd <= (filter.to || filter.from);
}

const DATE_TABS = [
  { value: "months", label: "Mes", icon: "calendar" },
  { value: "day", label: "Día", icon: "calendar-day" },
  { value: "range", label: "Rango", icon: "arrows-left-right" },
];

const toBool = (v) => v === true || v === 1 || v === "1" || v === "true";

function isSharedExpense(expense) {
  if (expense.EsCompartido != null) return toBool(expense.EsCompartido);
  if (expense.EsPublico != null) return toBool(expense.EsPublico);
  if (expense.EsPersonal != null) return !toBool(expense.EsPersonal);
  return false;
}

const SCOPE = { ALL: "todos", SHARED: "compartido", PERSONAL: "personal" };

const SCOPE_OPTIONS = [
  { value: SCOPE.ALL, label: "Todos", icon: "layer-group" },
  { value: SCOPE.PERSONAL, label: "Personal", icon: "user" },
  { value: SCOPE.SHARED, label: "Compartido", icon: "users" },
];

const SCOPE_LABEL = { [SCOPE.SHARED]: "Compartido", [SCOPE.PERSONAL]: "Personal" };

function passesScope(expense, scope) {
  if (scope === SCOPE.SHARED) return isSharedExpense(expense);
  if (scope === SCOPE.PERSONAL) return !isSharedExpense(expense);
  return true;
}

function passesPayer(expense, onlyMine, currentUserId) {
  if (!onlyMine) return true;
  if (currentUserId === null || currentUserId === undefined) return true;
  return String(expense.IdUsuarioPagador) === String(currentUserId);
}

export default function ExpenseList({
  expenses = [],
  categories = [],
  currency,
  currentUserId,
  loading = false,
  error = "",
  canDelete = false,
  deletingExpenseId = null,
  onDeleteExpense,
  onRetry,
  scrollRef,
  cardRef,
  onViewReceipt,
  onDownloadReceipt,
  downloadingReceiptId,
}) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const [opened, setOpened] = useState({});
  const sectionRefs = useRef({});
  const pendingScrollId = useRef(null);

  const searchRowRef = useRef(null);
  const searchFocused = useRef(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Manejo de apertura del teclado para dispositivos móviles
  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const [categoryFilter, setCategoryFilter] = useState([]);
  const [scope, setScope] = useState(SCOPE.ALL);
  const [dateFilter, setDateFilter] = useState(null);
  const [onlyMine, setOnlyMine] = useState(false);

  const [search, setSearch] = useState("");
  const searchNormalized = normalizeText(search);
  const hasSearch = searchNormalized.length > 0;

  const [panelOpen, setPanelOpen] = useState(false);
  const [panelView, setPanelView] = useState("main");
  const [draftCategories, setDraftCategories] = useState([]);
  const [draftScope, setDraftScope] = useState(SCOPE.ALL);
  const [draftDate, setDraftDate] = useState(null);
  const [draftOnlyMine, setDraftOnlyMine] = useState(false);
  const [dateTab, setDateTab] = useState("months");
  const [monthYear, setMonthYear] = useState(new Date().getFullYear());
  const [calendarKey, setCalendarKey] = useState(0);

  const allCategories = useMemo(() => {
    const map = new Map();

    categories.forEach((category) => {
      const key = String(category.IdCategoria);
      map.set(key, { id: key, nombre: category.Nombre, gastos: [] });
    });

    expenses.forEach((expense) => {
      const key = String(expense.IdCategoria);
      if (!map.has(key)) {
        map.set(key, { id: key, nombre: expense.NombreCategoria ?? "Sin categoría", gastos: [] });
      }
      map.get(key).gastos.push(expense);
    });

    const isOtros = (nombre) => String(nombre ?? "").trim().toLowerCase() === "otros";

    return Array.from(map.values()).sort((a, b) => {
      const aOtros = isOtros(a.nombre);
      const bOtros = isOtros(b.nombre);
      if (aOtros && !bOtros) return 1;
      if (!aOtros && bOtros) return -1;
      return String(a.nombre).localeCompare(String(b.nombre));
    });
  }, [categories, expenses]);

  const dateBounds = useMemo(() => {
    const dates = expenses.map(expenseYmd).filter(Boolean).sort();
    if (dates.length === 0) return null;
    return { min: dates[0], max: dates[dates.length - 1] };
  }, [expenses]);

  const monthCounts = useMemo(() => {
    const counts = {};
    expenses.forEach((expense) => {
      const key = expenseYmd(expense).slice(0, 7);
      if (key) counts[key] = (counts[key] ?? 0) + 1;
    });
    return counts;
  }, [expenses]);

  const yearBounds = useMemo(() => {
    const current = new Date().getFullYear();
    if (!dateBounds) return { min: current, max: current };
    return { min: Number(dateBounds.min.slice(0, 4)), max: Number(dateBounds.max.slice(0, 4)) };
  }, [dateBounds]);

  const sections = useMemo(
    () =>
      allCategories
        .map((category) => ({
          ...category,
          gastos: category.gastos.filter(
            (expense) =>
              passesDate(expense, dateFilter) &&
              passesScope(expense, scope) &&
              passesPayer(expense, onlyMine, currentUserId) &&
              passesSearch(expense, searchNormalized)
          ),
        }))
        .filter((category) => category.gastos.length > 0),
    [allCategories, dateFilter, scope, onlyMine, currentUserId, searchNormalized]
  );

  const { visibleCount, visibleTotal } = useMemo(() => {
    const included =
      categoryFilter.length === 0 ? sections : sections.filter((s) => categoryFilter.includes(s.id));
    let count = 0;
    let total = 0;
    included.forEach((section) => {
      section.gastos.forEach((expense) => {
        count += 1;
        total += Number(expense.Monto ?? 0);
      });
    });
    return { visibleCount: count, visibleTotal: total };
  }, [sections, categoryFilter]);

  const draftCategoryCounts = useMemo(() => {
    const perCategory = {};
    let total = 0;
    allCategories.forEach((category) => {
      const n = category.gastos.filter(
        (expense) =>
          passesDate(expense, draftDate) &&
          passesScope(expense, draftScope) &&
          passesPayer(expense, draftOnlyMine, currentUserId) &&
          passesSearch(expense, searchNormalized)
      ).length;
      perCategory[category.id] = n;
      total += n;
    });
    return { perCategory, total };
  }, [allCategories, draftDate, draftScope, draftOnlyMine, currentUserId, searchNormalized]);

  const draftScopeCounts = useMemo(() => {
    const base = expenses.filter(
      (expense) =>
        passesDate(expense, draftDate) &&
        passesPayer(expense, draftOnlyMine, currentUserId) &&
        passesSearch(expense, searchNormalized) &&
        (draftCategories.length === 0 || draftCategories.includes(String(expense.IdCategoria)))
    );
    const sharedCount = base.filter(isSharedExpense).length;
    return {
      [SCOPE.ALL]: base.length,
      [SCOPE.SHARED]: sharedCount,
      [SCOPE.PERSONAL]: base.length - sharedCount,
    };
  }, [expenses, draftDate, draftOnlyMine, currentUserId, draftCategories, searchNormalized]);

  const draftResults = draftScopeCounts[draftScope];

  useEffect(() => {
    if (expenses.length === 0) return;
    setCategoryFilter((current) => {
      const alive = current.filter((id) => allCategories.some((category) => category.id === id));
      return alive.length === current.length ? current : alive;
    });
  }, [allCategories, expenses.length]);

  const scopeActive = scope !== SCOPE.ALL;
  const dateActive = isDateFilterSet(dateFilter);
  const categoriesActive = categoryFilter.length > 0;
  const payerActive = onlyMine === true;
  const activeFilters = (categoriesActive ? 1 : 0) + (scopeActive ? 1 : 0) + (dateActive ? 1 : 0) + (payerActive ? 1 : 0);

  const openByDefault = sections.length === 1 || activeFilters > 0 || hasSearch;

  // Mantiene las secciones abiertas según filtros o búsqueda, sin interferir con el scroll al tipear
  useEffect(() => {
    if (hasSearch || activeFilters > 0) {
      const nextOpened = {};
      sections.forEach((sec) => {
        nextOpened[sec.id] = true;
      });
      setOpened(nextOpened);
    }
  }, [hasSearch, activeFilters, sections]);

  function isOpen(id) {
    return opened[id] ?? openByDefault;
  }

  function toggleCategory(id) {
    Keyboard.dismiss();
    const willOpen = !(opened[id] ?? openByDefault);
    pendingScrollId.current = willOpen ? id : null;
    setOpened((current) => ({ ...current, [id]: willOpen }));
  }

  function handleSectionLayout(id) {
    if (pendingScrollId.current !== id) return;
    pendingScrollId.current = null;
    centerSection(id);
  }

  function centerSection(id) {
    centerInScroll(scrollRef?.current, sectionRefs.current[id], {
      align: "center",
      margin: spacing.md,
      fallbackViewportHeight: windowHeight * 0.8,
    });
  }

  function openPanel() {
    Keyboard.dismiss();
    setDraftCategories(categoryFilter);
    setDraftScope(scope);
    setDraftDate(dateFilter);
    setDraftOnlyMine(onlyMine);
    setPanelView("main");
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
  }

  function clearDraft() {
    setDraftCategories([]);
    setDraftScope(SCOPE.ALL);
    setDraftDate(null);
    setDraftOnlyMine(false);
    setCalendarKey((key) => key + 1);
  }

  function applyFilters() {
    setCategoryFilter(draftCategories);
    setScope(draftScope);
    setOnlyMine(draftOnlyMine);
    setDateFilter(
      !isDateFilterSet(draftDate)
        ? null
        : draftDate.mode === "months"
        ? draftDate
        : { mode: draftDate.mode, from: draftDate.from, to: draftDate.to || draftDate.from }
    );

    if (draftCategories.length > 0) {
      const next = {};
      allCategories.forEach((category) => {
        next[category.id] = draftCategories.includes(category.id);
      });
      setOpened(next);
    } else {
      setOpened({});
    }

    setPanelOpen(false);
  }

  function clearAllFilters() {
    setCategoryFilter([]);
    setScope(SCOPE.ALL);
    setDateFilter(null);
    setOnlyMine(false);
    setOpened({});
  }

  function clearEverything() {
    clearAllFilters();
    setSearch("");
  }

  function toggleDraftCategory(id) {
    setDraftCategories((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  }

  function openDates() {
    setDateTab(draftDate?.mode ?? "months");
    const anchor = draftDate?.mode === "months" ? draftDate.months[0] : draftDate?.from;
    setMonthYear(anchor ? Number(anchor.slice(0, 4)) : yearBounds.max);
    setCalendarKey((key) => key + 1);
    setPanelView("dates");
  }

  function changeDateTab(tab) {
    setDateTab(tab);
    setCalendarKey((key) => key + 1);
  }

  function toggleMonth(key) {
    setDraftDate((prev) => {
      const current = prev?.mode === "months" ? prev.months : [];
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key].sort();
      return next.length > 0 ? { mode: "months", months: next } : null;
    });
  }

  function onDayChange(date) {
    const ymd = ymdFromDate(date);
    setDraftDate({ mode: "day", from: ymd, to: ymd });
    setPanelView("main");
  }

  function onRangeChange(date, type) {
    const ymd = ymdFromDate(date);
    if (type === "END_DATE") {
      setDraftDate((prev) => {
        const start = prev?.mode === "range" && prev.from ? prev.from : ymd;
        return start <= ymd
          ? { mode: "range", from: start, to: ymd }
          : { mode: "range", from: ymd, to: start };
      });
    } else {
      setDraftDate({ mode: "range", from: ymd, to: null });
    }
  }

  function confirmRange() {
    if (draftDate?.mode === "range" && draftDate.from && !draftDate.to) {
      setDraftDate({ mode: "range", from: draftDate.from, to: draftDate.from });
    }
    setPanelView("main");
  }

  function clearDraftDate() {
    setDraftDate(null);
    setCalendarKey((key) => key + 1);
  }

  if (error && !loading) {
    return (
      <View style={styles.errorState}>
        <Text style={styles.errorText}>{error}</Text>
        {typeof onRetry === "function" ? (
          <Pressable accessibilityRole="button" onPress={onRetry} testID="expenses-retry">
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (loading && expenses.length === 0) {
    return <ActivityIndicator color={colors.primary} style={styles.loader} />;
  }

  if (expenses.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>
          Todavía no hay gastos cargados. Usá “Agregar gasto” para registrar el primero.
        </Text>
      </View>
    );
  }

  const selectedCategories = allCategories.filter((category) => categoryFilter.includes(category.id));
  const selectedWithoutResults =
    categoryFilter.length > 0 && !sections.some((section) => categoryFilter.includes(section.id));
  const showEmpty = sections.length === 0 || selectedWithoutResults;

  const calendarWidth = Math.min(windowWidth, 520) - spacing.lg * 2;
  const selectedMonths = draftDate?.mode === "months" ? draftDate.months : [];
  const draftHasFilters = draftCategories.length > 0 || draftScope !== SCOPE.ALL || isDateFilterSet(draftDate) || draftOnlyMine;

  const draftCategoriesSummary =
    draftCategories.length === 0
      ? "Todas"
      : draftCategories.length === 1
      ? allCategories.find((c) => c.id === draftCategories[0])?.nombre ?? "1 seleccionada"
      : `${draftCategories.length} seleccionadas`;

  const activeChips = [];
  if (categoriesActive) {
    activeChips.push({
      key: "categorias",
      icon: selectedCategories.length === 1 ? iconForCategory(selectedCategories[0].nombre) : "tags",
      label:
        selectedCategories.length === 1
          ? selectedCategories[0].nombre
          : `${categoryFilter.length} categorías`,
      a11y: "Quitar filtro de categorías",
      testID: "expense-filter-tag-categorias",
      onRemove: () => setCategoryFilter([]),
    });
  }
  if (dateActive) {
    activeChips.push({
      key: "fecha",
      icon: "calendar-days",
      label: formatDateFilter(dateFilter),
      a11y: "Quitar filtro de fechas",
      testID: "expense-filter-tag-fecha",
      onRemove: () => setDateFilter(null),
    });
  }
  if (scopeActive) {
    activeChips.push({
      key: "tipo",
      icon: scope === SCOPE.SHARED ? "users" : "user",
      label: SCOPE_LABEL[scope],
      a11y: "Quitar filtro de tipo de gasto",
      testID: "expense-filter-tag-tipo",
      onRemove: () => setScope(SCOPE.ALL),
    });
  }
  if (payerActive) {
    activeChips.push({
      key: "pagador",
      icon: "user-check",
      label: "Pagados por mí",
      a11y: "Quitar filtro de pagador",
      testID: "expense-filter-tag-pagador",
      onRemove: () => setOnlyMine(false),
    });
  }

  const calendarInitialDate = draftDate?.from
    ? dateFromYmd(draftDate.from)
    : dateBounds
    ? dateFromYmd(dateBounds.max)
    : new Date();

  const calendarCommon = {
    width: calendarWidth,
    initialDate: calendarInitialDate,
    minDate: dateBounds ? dateFromYmd(dateBounds.min) : undefined,
    maxDate: dateBounds ? dateFromYmd(dateBounds.max) : undefined,
    restrictMonthNavigation: true,
    startFromMonday: true,
    months: MONTHS_LONG,
    weekdays: WEEKDAYS,
    selectMonthTitle: "Elegí el mes de ",
    selectYearTitle: "Elegí el año",
    previousComponent: <FontAwesome6 name="chevron-left" size={16} color={colors.primary} />,
    nextComponent: <FontAwesome6 name="chevron-right" size={16} color={colors.primary} />,
    selectedDayColor: colors.primary,
    selectedDayTextColor: colors.textInverse,
    todayBackgroundColor: TINTE_PRIMARIO,
    todayTextStyle: { color: colors.primary, fontWeight: "700" },
    textStyle: { color: colors.textPrimary },
    disabledDatesTextStyle: { color: DISABLED_DAY_COLOR },
    monthTitleStyle: { color: colors.primary, fontWeight: "700" },
    yearTitleStyle: { color: colors.primary, fontWeight: "700" },
  };

  return (
    <View style={styles.container}>
      <View collapsable={false} ref={searchRowRef} style={styles.searchRow}>
        <View style={styles.searchBox}>
          <FontAwesome6 name="magnifying-glass" size={13} color={colors.overlay || colors.textMuted} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onBlur={() => {
              searchFocused.current = false;
            }}
            onChangeText={setSearch}
            onFocus={() => {
              searchFocused.current = true;
              if (scrollRef?.current && cardRef?.current) {
                setTimeout(() => {
                  centerInScroll(scrollRef.current, cardRef.current, {
                    align: "top",
                    margin: spacing.xs,
                  });
                }, 300);
              }
            }}
            placeholder="Buscar gasto"
            placeholderTextColor={colors.overlay || colors.textMuted}
            returnKeyType="search"
            style={styles.searchInput}
            testID="expenses-search"
            value={search}
          />
          {search.length > 0 ? (
            <Pressable hitSlop={10} onPress={() => setSearch("")} testID="expenses-search-clear">
              <FontAwesome6 name="circle-xmark" size={15} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={openPanel}
          style={[styles.filterButton, activeFilters > 0 && styles.filterButtonActive]}
          testID="expense-filter-open"
        >
          <FontAwesome6
            color={activeFilters > 0 ? colors.textInverse : colors.primary}
            name="sliders"
            size={13}
          />
          <Text style={[styles.filterButtonText, activeFilters > 0 && styles.filterButtonTextActive]}>
            Filtros
          </Text>
          {activeFilters > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilters}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {activeChips.length > 0 ? (
        <View style={styles.activeBar}>
          {activeChips.map((chip) => (
            <Pressable
              accessibilityLabel={chip.a11y}
              accessibilityRole="button"
              hitSlop={6}
              key={chip.key}
              onPress={chip.onRemove}
              style={styles.activeChip}
              testID={chip.testID}
            >
              <FontAwesome6 color={colors.primary} name={chip.icon} size={11} />
              <Text numberOfLines={1} style={styles.activeChipText}>
                {chip.label}
              </Text>
              <FontAwesome6 color={colors.primary} name="xmark" size={11} />
            </Pressable>
          ))}
          {activeChips.length > 1 ? (
            <Pressable
              hitSlop={8}
              onPress={clearAllFilters}
              style={styles.clearAll}
              testID="expense-filter-clear-all"
            >
              <Text style={styles.clearAllText}>Limpiar</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.totalRow} testID="expenses-total">
        <Text style={styles.totalLabel}>
          {activeFilters > 0 ? "Total filtrado" : "Total"} · {visibleCount}{" "}
          {visibleCount === 1 ? "gasto" : "gastos"}
        </Text>
        <Text style={styles.totalValue}>{formatMoney(visibleTotal, currency)}</Text>
      </View>

      {showEmpty ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            {hasSearch
              ? `No se encontraron gastos para "${search.trim()}"${
                  activeFilters > 0 ? " con los filtros aplicados" : ""
                }.`
              : "No hay gastos con los filtros elegidos."}
          </Text>
          {activeFilters > 0 || hasSearch ? (
            <Pressable onPress={clearEverything} hitSlop={8} testID="expenses-empty-clear">
              <Text style={styles.emptyLink}>
                {activeFilters > 0 ? "Limpiar filtros" : "Limpiar búsqueda"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {sections.map((section) => {
        const open = isOpen(section.id);
        const subtotal = section.gastos.reduce((acc, expense) => acc + Number(expense.Monto ?? 0), 0);

        return (
          <View
            collapsable={false}
            key={section.id}
            onLayout={() => handleSectionLayout(section.id)}
            ref={(node) => {
              sectionRefs.current[section.id] = node;
            }}
            style={styles.section}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              onPress={() => toggleCategory(section.id)}
              style={[styles.sectionHeader, open && styles.sectionHeaderOpen]}
              testID={`expense-category-header-${section.id}`}
            >
              <FontAwesome6
                color={colors.primary}
                name={open ? "chevron-down" : "chevron-right"}
                size={13}
                style={styles.sectionChevron}
              />
              <FontAwesome6 color={colors.primary} name={iconForCategory(section.nombre)} size={14} />
              <View style={styles.sectionTitleBox}>
                <Text numberOfLines={1} style={styles.sectionTitle}>
                  {section.nombre}
                </Text>
                <Text style={styles.sectionSubtotal}>{formatMoney(subtotal, currency)}</Text>
              </View>
              <View style={styles.sectionCountBadge}>
                <Text style={styles.sectionCount}>{section.gastos.length}</Text>
              </View>
            </Pressable>

            {open ? (
              <ScrollView
                contentContainerStyle={styles.sectionListContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator
                style={styles.sectionList}
              >
                {section.gastos.map((expense, index) => {
                  const isLast = index === section.gastos.length - 1;
                  const paidByMe =
                    currentUserId !== null &&
                    currentUserId !== undefined &&
                    String(expense.IdUsuarioPagador) === String(currentUserId);

                  const originalCurrency = String(expense.MonedaOriginal ?? "").trim().toUpperCase();
                  const baseCurrency = String(currency ?? "").trim().toUpperCase();
                  const showOriginal =
                    originalCurrency !== "" &&
                    baseCurrency !== "" &&
                    originalCurrency !== baseCurrency &&
                    expense.MontoOriginal !== null &&
                    expense.MontoOriginal !== undefined;
                  const deleting = String(deletingExpenseId ?? "") === String(expense.IdGasto);

                  return (
                    <View
                      key={expense.IdGasto}
                      style={[styles.row, !isLast && styles.rowDivider]}
                      testID={`expense-${expense.IdGasto}`}
                    >
                      <View style={styles.icon}>
                        <FontAwesome6
                          color={colors.primary}
                          name={iconForCategory(expense.NombreCategoria)}
                          size={14}
                        />
                      </View>
                      <View style={styles.body}>
                        <Text numberOfLines={1} style={styles.name}>
                          {expense.Nombre}
                        </Text>
                        <Text numberOfLines={2} style={styles.meta}>
                          {paidByMe ? "Pagaste vos" : `Pagó ${expense.NombrePagador}`} ·{" "}
                          {formatExpenseDate(expense.FechaGasto)}
                        </Text>
                        {showOriginal ? (
                          <Text
                            style={styles.originalLine}
                            testID={`expense-original-${expense.IdGasto}`}
                          >
                            Registrado: {formatOriginalAmount(expense.MontoOriginal)} {originalCurrency}
                          </Text>
                        ) : null}
                        
                        {expense.UrlComprobante ? (
                          <View style={styles.receiptActionsRow}>
                            <Pressable
                              onPress={() => onViewReceipt && onViewReceipt(expense)}
                              style={styles.receiptActionLink}
                              hitSlop={8}
                            >
                              <FontAwesome6 name="receipt" size={12} color={colors.primary} />
                              <Text style={styles.receiptActionText}>Ver comprobante</Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.rowActions}>
                        <Text style={styles.amount}>{formatMoney(expense.Monto, currency)}</Text>
                        {canDelete && onDeleteExpense ? (
                          <Pressable
                            accessibilityLabel={`Eliminar gasto ${expense.Nombre}`}
                            accessibilityRole="button"
                            disabled={deleting}
                            hitSlop={8}
                            onPress={() => onDeleteExpense(expense)}
                            style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]}
                            testID={`expense-delete-${expense.IdGasto}`}
                          >
                            {deleting ? (
                              <ActivityIndicator color={colors.danger ?? colors.error ?? colors.primary} size="small" />
                            ) : (
                              <FontAwesome6
                                color={colors.danger ?? colors.error ?? colors.textMuted}
                                name="trash-can"
                                size={13}
                              />
                            )}
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            ) : null}
          </View>
        );
      })}

      {/* ---------- Panel de filtros ---------- */}
      <Modal
        animationType="slide"
        onRequestClose={closePanel}
        onShow={() => Keyboard.dismiss()}
        transparent
        visible={panelOpen}
      >
        <View style={styles.overlay}>
          <Pressable
            accessibilityLabel="Cerrar filtros"
            onPress={closePanel}
            style={StyleSheet.absoluteFill}
            testID="expense-filter-overlay"
          />

          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />

            {/* ===== Vista principal ===== */}
            {panelView === "main" ? (
              <>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>Filtros</Text>
                  <View style={styles.sheetHeaderActions}>
                    {draftHasFilters ? (
                      <Pressable hitSlop={10} onPress={clearDraft} testID="expense-filter-limpiar">
                        <Text style={styles.headerLink}>Limpiar</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityLabel="Cerrar"
                      hitSlop={12}
                      onPress={closePanel}
                      testID="expense-filter-close"
                    >
                      <FontAwesome6 color={colors.textMuted} name="xmark" size={18} />
                    </Pressable>
                  </View>
                </View>

                <ScrollView
                  contentContainerStyle={styles.sheetContent}
                  showsVerticalScrollIndicator={false}
                  style={styles.sheetScroll}
                >
                  {/* Tipo de gasto */}
                  <Text style={styles.filterLabel}>Tipo de gasto</Text>
                  <View style={styles.segmented}>
                    {SCOPE_OPTIONS.map((option) => {
                      const active = draftScope === option.value;
                      return (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          key={option.value}
                          onPress={() => setDraftScope(option.value)}
                          style={[styles.segment, active && styles.segmentActive]}
                          testID={`expense-scope-${option.value}`}
                        >
                          <FontAwesome6
                            color={active ? colors.textInverse : colors.primary}
                            name={option.icon}
                            size={12}
                          />
                          <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Filtro: Pagados por mí */}
                  <Text style={[styles.filterLabel, { marginTop: spacing.lg }]}>Pagador</Text>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: draftOnlyMine }}
                    onPress={() => setDraftOnlyMine((prev) => !prev)}
                    style={styles.checkboxRow}
                    testID="expense-filter-pagados-por-mi"
                  >
                    <View style={styles.settingsIcon}>
                      <FontAwesome6 color={colors.primary} name="user-check" size={13} />
                    </View>
                    <Text style={styles.settingsLabel}>Pagados por mí</Text>
                    <View style={[styles.checkbox, draftOnlyMine && styles.checkboxActive]}>
                      {draftOnlyMine ? (
                        <FontAwesome6 color={colors.textInverse} name="check" size={11} />
                      ) : null}
                    </View>
                  </Pressable>

                  {/* Fecha y categorías */}
                  <Text style={[styles.filterLabel, { marginTop: spacing.lg }]}>
                    Más filtros
                  </Text>
                  <View style={styles.settingsCard}>
                    <SettingsRow
                      active={isDateFilterSet(draftDate)}
                      icon="calendar-days"
                      label="Fecha"
                      onClear={() => setDraftDate(null)}
                      onPress={openDates}
                      testID="expense-filter-fecha"
                      value={formatDateFilter(draftDate)}
                    />
                    <View style={styles.settingsDivider} />
                    <SettingsRow
                      active={draftCategories.length > 0}
                      icon="tags"
                      label="Categorías"
                      onClear={() => setDraftCategories([])}
                      onPress={() => setPanelView("categories")}
                      testID="expense-filter-categorias"
                      value={draftCategoriesSummary}
                    />
                  </View>
                </ScrollView>

                <View style={styles.sheetFooter}>
                  <Pressable
                    disabled={draftResults === 0}
                    onPress={applyFilters}
                    style={[styles.primaryButton, draftResults === 0 && styles.primaryButtonDisabled]}
                    testID="expense-filter-aplicar"
                  >
                    <Text style={styles.primaryButtonText}>
                      {draftResults === 0
                        ? "Sin resultados"
                        : `Ver ${draftResults} ${draftResults === 1 ? "gasto" : "gastos"}`}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            {/* ===== Sub-pantalla: Categorías ===== */}
            {panelView === "categories" ? (
              <>
                <View style={styles.sheetHeader}>
                  <Pressable
                    accessibilityLabel="Volver"
                    hitSlop={12}
                    onPress={() => setPanelView("main")}
                    style={styles.backButton}
                    testID="expense-categories-back"
                  >
                    <FontAwesome6 color={colors.primary} name="chevron-left" size={16} />
                    <Text style={styles.sheetTitle}>Categorías</Text>
                  </Pressable>
                  {draftCategories.length > 0 ? (
                    <Pressable
                      hitSlop={10}
                      onPress={() => setDraftCategories([])}
                      testID="expense-categories-clear"
                    >
                      <Text style={styles.headerLink}>Borrar</Text>
                    </Pressable>
                  ) : null}
                </View>

                <Text style={styles.subHint}>Podés elegir varias. Sin selección se muestran todas.</Text>

                <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetScroll}>
                  {allCategories.map((category, index) => {
                    const active = draftCategories.includes(category.id);
                    const count = draftCategoryCounts.perCategory[category.id] ?? 0;
                    const isLast = index === allCategories.length - 1;
                    return (
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: active }}
                        key={category.id}
                        onPress={() => toggleDraftCategory(category.id)}
                        style={[
                          styles.categoryRow,
                          !isLast && styles.categoryRowDivider,
                          count === 0 && !active && styles.categoryRowEmpty,
                        ]}
                        testID={`expense-filter-${category.id}`}
                      >
                        <View style={styles.settingsIcon}>
                          <FontAwesome6
                            color={colors.primary}
                            name={iconForCategory(category.nombre)}
                            size={13}
                          />
                        </View>
                        <Text numberOfLines={1} style={styles.categoryName}>
                          {category.nombre}
                        </Text>
                        <Text style={styles.categoryCount}>{count}</Text>
                        <View style={[styles.checkbox, active && styles.checkboxActive]}>
                          {active ? (
                            <FontAwesome6 color={colors.textInverse} name="check" size={11} />
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <View style={styles.sheetFooter}>
                  <Pressable
                    onPress={() => setPanelView("main")}
                    style={styles.primaryButton}
                    testID="expense-categories-done"
                  >
                    <Text style={styles.primaryButtonText}>Listo</Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            {/* ===== Sub-pantalla: Fecha ===== */}
            {panelView === "dates" ? (
              <>
                <View style={styles.sheetHeader}>
                  <Pressable
                    accessibilityLabel="Volver"
                    hitSlop={12}
                    onPress={() => setPanelView("main")}
                    style={styles.backButton}
                    testID="expense-dates-back"
                  >
                    <FontAwesome6 color={colors.primary} name="chevron-left" size={16} />
                    <Text style={styles.sheetTitle}>Fecha</Text>
                  </Pressable>
                  {draftDate ? (
                    <Pressable hitSlop={10} onPress={clearDraftDate} testID="expense-dates-clear">
                      <Text style={styles.headerLink}>Borrar</Text>
                    </Pressable>
                  ) : null}
                </View>

                <View style={styles.segmented}>
                  {DATE_TABS.map((tab) => {
                    const active = dateTab === tab.value;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        key={tab.value}
                        onPress={() => changeDateTab(tab.value)}
                        style={[styles.segment, active && styles.segmentActive]}
                        testID={`expense-date-tab-${tab.value}`}
                      >
                        <FontAwesome6
                          color={active ? colors.textInverse : colors.primary}
                          name={tab.icon}
                          size={12}
                        />
                        <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                          {tab.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <ScrollView
                  contentContainerStyle={styles.sheetContent}
                  showsVerticalScrollIndicator={false}
                  style={styles.sheetScroll}
                >
                  {dateTab === "months" ? (
                    <>
                      <Text numberOfLines={2} style={styles.subHint}>
                        {selectedMonths.length > 0
                          ? `Seleccionados: ${selectedMonths.map((k) => formatMonthKey(k, true)).join(", ")}`
                          : "Podés elegir varios meses."}
                      </Text>

                      <View style={styles.yearNav}>
                        <Pressable
                          accessibilityLabel="Año anterior"
                          disabled={monthYear <= yearBounds.min}
                          hitSlop={10}
                          onPress={() => setMonthYear((year) => year - 1)}
                          style={[styles.yearArrow, monthYear <= yearBounds.min && styles.yearArrowOff]}
                          testID="expense-year-prev"
                        >
                          <FontAwesome6 color={colors.primary} name="chevron-left" size={14} />
                        </Pressable>
                        <Text style={styles.yearText}>{monthYear}</Text>
                        <Pressable
                          accessibilityLabel="Año siguiente"
                          disabled={monthYear >= yearBounds.max}
                          hitSlop={10}
                          onPress={() => setMonthYear((year) => year + 1)}
                          style={[styles.yearArrow, monthYear >= yearBounds.max && styles.yearArrowOff]}
                          testID="expense-year-next"
                        >
                          <FontAwesome6 color={colors.primary} name="chevron-right" size={14} />
                        </Pressable>
                      </View>

                      <View style={styles.monthGrid}>
                        {MONTHS_LONG.map((name, monthIndex) => {
                          const key = monthKey(monthYear, monthIndex);
                          const count = monthCounts[key] ?? 0;
                          const active = selectedMonths.includes(key);
                          return (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ selected: active, disabled: count === 0 }}
                              disabled={count === 0}
                              key={name}
                              onPress={() => toggleMonth(key)}
                              style={[
                                styles.monthCell,
                                active && styles.monthCellActive,
                                count === 0 && styles.monthCellOff,
                              ]}
                              testID={`expense-month-${monthIndex + 1}`}
                            >
                              <Text style={[styles.monthName, active && styles.monthNameActive]}>
                                {name.slice(0, 3)}
                              </Text>
                              {count > 0 ? (
                                <Text style={[styles.monthCount, active && styles.monthCountActive]}>
                                  {count} {count === 1 ? "gasto" : "gastos"}
                                </Text>
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  ) : null}

                  {dateTab === "day" ? (
                    <CalendarPicker
                      {...calendarCommon}
                      key={`day-${calendarKey}`}
                      onDateChange={onDayChange}
                      selectedStartDate={
                        draftDate?.mode === "day" ? dateFromYmd(draftDate.from) : undefined
                      }
                    />
                  ) : null}

                  {dateTab === "range" ? (
                    <>
                      <Text style={styles.subHint}>
                        {draftDate?.mode === "range" && draftDate.from
                          ? `Seleccionado: ${formatDateFilter(draftDate)}`
                          : "Tocá el primer día y después el último."}
                      </Text>
                      <CalendarPicker
                        {...calendarCommon}
                        key={`range-${calendarKey}`}
                        allowBackwardRangeSelection
                        allowRangeSelection
                        onDateChange={onRangeChange}
                        selectedEndDate={
                          draftDate?.mode === "range" && draftDate.to
                            ? dateFromYmd(draftDate.to)
                            : undefined
                        }
                        selectedStartDate={
                          draftDate?.mode === "range" && draftDate.from
                            ? dateFromYmd(draftDate.from)
                            : undefined
                        }
                      />
                    </>
                  ) : null}
                </ScrollView>

                {dateTab !== "day" ? (
                  <View style={styles.sheetFooter}>
                    <Pressable
                      disabled={dateTab === "range" && !(draftDate?.mode === "range" && draftDate.from)}
                      onPress={confirmRange}
                      style={[
                        styles.primaryButton,
                        dateTab === "range" &&
                          !(draftDate?.mode === "range" && draftDate.from) &&
                          styles.primaryButtonDisabled,
                      ]}
                      testID="expense-dates-done"
                    >
                      <Text style={styles.primaryButtonText}>Listo</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SettingsRow({ icon, label, value, active, onPress, onClear, testID }) {
  return (
    <View style={styles.settingsRow}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={styles.settingsRowMain}
        testID={testID}
      >
        <View style={styles.settingsIcon}>
          <FontAwesome6 color={colors.primary} name={icon} size={13} />
        </View>
        <Text style={styles.settingsLabel}>{label}</Text>
        <Text
          numberOfLines={1}
          style={[styles.settingsValue, active && styles.settingsValueActive]}
        >
          {value}
        </Text>
        {!active ? <FontAwesome6 color={colors.textMuted} name="chevron-right" size={12} /> : null}
      </Pressable>
      {active ? (
        <Pressable
          accessibilityLabel={`Quitar ${label.toLowerCase()}`}
          hitSlop={10}
          onPress={onClear}
          style={styles.settingsClear}
          testID={`${testID}-clear`}
        >
          <FontAwesome6 color={colors.textMuted} name="circle-xmark" size={16} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  loader: {
    paddingVertical: spacing.md,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    height: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: {
    ...textStyles.body,
    flex: 1,
    paddingVertical: 0,
    color: colors.textPrimary,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.md,
    height: 38,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
  },
  filterButtonText: {
    ...textStyles.meta,
    fontSize: 13,
    color: colors.primary,
    fontWeight: "700",
  },
  filterButtonTextActive: {
    color: colors.textInverse,
  },
  filterBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
  },
  activeBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs + 2,
  },
  activeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 200,
    height: 32,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
    backgroundColor: TINTE_PRIMARIO,
  },
  activeChipText: {
    ...textStyles.meta,
    flexShrink: 1,
    color: colors.primary,
    fontWeight: "700",
  },
  clearAll: {
    paddingHorizontal: spacing.xs,
  },
  clearAllText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  totalLabel: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  totalValue: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  section: {
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  sectionHeaderOpen: {
    borderColor: colors.primary,
  },
  sectionChevron: {
    width: 14,
    textAlign: "center",
  },
  sectionTitleBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sectionTitle: {
    ...textStyles.bodyStrong,
    flexShrink: 1,
    color: colors.primary,
  },
  sectionSubtotal: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontWeight: "700",
  },
  sectionCountBadge: {
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  sectionCount: {
    ...textStyles.meta,
    color: colors.textInverse,
    fontWeight: "700",
  },
  sectionList: {
    maxHeight: MAX_LIST_HEIGHT,
  },
  sectionListContent: {
    paddingHorizontal: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: TINTE_PRIMARIO,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
  },
  meta: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  amount: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
    flexShrink: 0,
    textAlign: "right",
  },
  rowActions: {
    alignItems: "flex-end",
    gap: spacing.xs,
    flexShrink: 0,
  },
  deleteButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  originalLine: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  emptyText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    textAlign: "center",
  },
  emptyLink: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  errorState: {
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: colors.dangerSurface,
    padding: spacing.md,
  },
  errorText: {
    ...textStyles.meta,
    color: colors.danger,
    textAlign: "center",
  },
  retryText: {
    ...textStyles.meta,
    color: colors.danger,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: colors.overlayStrong || "rgba(9, 19, 45, 0.7)",
  },
  sheet: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "88%",
    borderTopLeftRadius: radii.xl || 24,
    borderTopRightRadius: radii.xl || 24,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.sm,
  },
  sheetHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  sheetTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 20,
  },
  headerLink: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetContent: {
    paddingVertical: spacing.sm,
  },
  filterLabel: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginBottom: spacing.sm,
  },
  subHint: {
    ...textStyles.meta,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  sheetFooter: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primaryButton: {
    flex: 1,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    ...textStyles.bodyStrong,
    color: colors.textInverse,
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: TINTE_PRIMARIO,
    borderRadius: radii.md,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    height: 40,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "600",
  },
  segmentTextActive: {
    color: colors.textInverse,
    fontWeight: "700",
  },
  settingsCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  settingsRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 54,
    paddingHorizontal: spacing.md,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 54,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  settingsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  settingsIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: TINTE_PRIMARIO,
  },
  settingsLabel: {
    ...textStyles.body,
    color: colors.textPrimary,
    flex: 1,
  },
  settingsValue: {
    ...textStyles.meta,
    flex: 1,
    textAlign: "right",
    color: colors.textMuted,
  },
  settingsValueActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  settingsClear: {
    paddingRight: spacing.md,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  categoryRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  categoryRowEmpty: {
    opacity: 0.45,
  },
  categoryName: {
    ...textStyles.body,
    flex: 1,
    color: colors.textPrimary,
  },
  categoryCount: {
    ...textStyles.meta,
    color: colors.textMuted,
    fontWeight: "600",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  yearNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  yearArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: TINTE_PRIMARIO,
  },
  yearArrowOff: {
    opacity: 0.35,
  },
  yearText: {
    ...textStyles.bodyStrong,
    minWidth: 60,
    textAlign: "center",
    color: colors.primary,
    fontSize: 18,
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: spacing.xs + 2,
  },
  monthCell: {
    width: "31.5%",
    height: 58,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: TINTE_PRIMARIO,
  },
  monthCellActive: {
    backgroundColor: colors.primary,
  },
  monthCellOff: {
    opacity: 0.4,
  },
  monthName: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  monthNameActive: {
    color: colors.textInverse,
  },
  monthCount: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  monthCountActive: {
    color: colors.textInverse,
    opacity: 0.85,
  },
  receiptActionsRow: {
    flexDirection: "row",
    marginTop: 4,
  },
  receiptActionLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: TINTE_PRIMARIO,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  receiptActionText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
  },
});