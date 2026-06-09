import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { StrategyPlan } from "../strategies";
import { DotGroups, DotArray, NumberLine, DoublingChain, PartBar, RemoveBar } from "../visuals";

export interface StrategyViewProps {
  plan: StrategyPlan;
  showStep2?: boolean;
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  strategyLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2196f3",
    marginBottom: 12,
    textTransform: "capitalize",
  },
  stepText: {
    fontSize: 15,
    color: "#1a1a1a",
    lineHeight: 22,
    marginBottom: 12,
  },
  visual: {
    marginVertical: 16,
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    alignItems: "flex-start",
  },
  encouragement: {
    fontSize: 14,
    color: "#666",
    fontStyle: "italic",
    marginTop: 8,
  },
});

export function StrategyView({ plan, showStep2 = false }: StrategyViewProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.strategyLabel}>{plan.label}</Text>
      <Text style={styles.stepText}>{plan.step_1}</Text>

      {/* Render the appropriate visual based on visual_type */}
      {plan.visual_type === "parts" && plan.partA != null && plan.partB != null && (
        <View style={styles.visual}>
          <PartBar partA={plan.partA} partB={plan.partB} />
        </View>
      )}
      {plan.visual_type === "remove" && plan.total != null && plan.removeCount != null && (
        <View style={styles.visual}>
          <RemoveBar total={plan.total} removeCount={plan.removeCount} />
        </View>
      )}
      {plan.visual_type === "groups" && plan.visual_a != null && plan.visual_b != null && (
        <View style={styles.visual}>
          <DotGroups
            groups={plan.visual_a}
            dotsPerGroup={plan.visual_b}
            extraGroups={plan.extraGroups}
            removeGroups={plan.removeGroups}
          />
        </View>
      )}
      {plan.visual_type === "array" && plan.visual_a != null && plan.visual_b != null && (
        <View style={styles.visual}>
          <DotArray rows={plan.visual_a} cols={plan.visual_b} />
        </View>
      )}
      {plan.visual_type === "number_line" && plan.visual_a != null && plan.visual_b != null && (
        <View style={styles.visual}>
          <NumberLine step={plan.visual_a} hops={plan.visual_b} />
        </View>
      )}
      {plan.visual_type === "chain" && plan.chainSteps && (
        <View style={styles.visual}>
          <DoublingChain steps={plan.chainSteps} />
        </View>
      )}
      {plan.visual_type === "doubling_chain" && plan.chainSteps && (
        <View style={styles.visual}>
          <DoublingChain steps={plan.chainSteps} />
        </View>
      )}

      {showStep2 && (
        <>
          <Text style={styles.stepText}>{plan.step_2}</Text>
          <Text style={styles.encouragement}>Ready to try?</Text>
        </>
      )}
    </View>
  );
}
