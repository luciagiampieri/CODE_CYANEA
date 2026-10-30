import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import ScreenContainer from "../components/layout/ScreenContainer";
import ScreenHeader from "../components/ui/ScreenHeader";
import AccountUsage from "../components/plans/AccountUsage";
import PlansComparison from "../components/plans/PlansComparison";
import SubscriptionPanel from "../components/plans/SubscriptionPanel";
import useResponsive from "../hooks/useResponsive";
import { colors, radii, spacing, textStyles } from "../theme/tokens";

const PESTANAS = [
  ["mi_plan", "Mi plan"],
  ["consumo", "Consumo"],
  ["planes", "Planes"],
];


export default function PlanSubscriptionScreen({ navigation, route }) {
  const { isDesktop } = useResponsive();
  const [pestana, setPestana] = useState(route.params?.tab ?? "mi_plan");
  const [refrescando, setRefrescando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (route.params?.tab) setPestana(route.params.tab);
  }, [route.params?.tab]);

  // "Mi plan" avisa cuando termina de recargar; "Consumo" y "Planes" consultan
  // al volver a montarse, así que basta con cambiarles la key.
  function refrescar() {
    setRecarga((n) => n + 1);
    setRefrescando(pestana === "mi_plan");
  }

  return (
    <ScreenContainer fullWidth padded={false}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={refrescar}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <ScreenHeader
          title="Plan y suscripción"
          onBack={() => navigation.goBack()}
          backTestID="planes-volver"
        />

        <View style={[styles.body, isDesktop && styles.bodyDesktop]}>
          <View style={styles.pestanas} accessibilityRole="tablist">
            {PESTANAS.map(([clave, nombre]) => {
              const activa = pestana === clave;
              return (
                <Pressable
                  key={clave}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: activa }}
                  onPress={() => setPestana(clave)}
                  testID={`plan-tab-${clave}`}
                  style={[styles.pestana, activa && styles.pestanaActiva]}
                >
                  <Text style={[styles.pestanaTexto, activa && styles.pestanaTextoActiva]}>
                    {nombre}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {pestana === "mi_plan" ? (
            <SubscriptionPanel
              navigation={navigation}
              onVerPlanes={() => setPestana("planes")}
              recarga={recarga}
              onRecargado={() => setRefrescando(false)}
            />
          ) : pestana === "consumo" ? (
            <AccountUsage key={recarga} />
          ) : (
            <PlansComparison
              key={recarga}
              navigation={navigation}
              onGestionar={() => setPestana("mi_plan")}
            />
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: spacing.xxxl,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  bodyDesktop: {
    maxWidth: 1000,
    width: "100%",
    alignSelf: "center",
  },
  pestanas: {
    flexDirection: "row",
    padding: 4,
    gap: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pestana: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  pestanaActiva: {
    backgroundColor: colors.primary,
  },
  pestanaTexto: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontWeight: "700",
  },
  pestanaTextoActiva: {
    color: colors.textInverse,
  },
});