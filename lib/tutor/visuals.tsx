import React from "react";
import { View, Text, StyleSheet, ScrollView, Dimensions } from "react-native";

const screenHeight = Dimensions.get("window").height;

const styles = StyleSheet.create({
  dotGroupsContainer: {
    maxHeight: screenHeight * 0.35,
    borderRadius: 8,
    backgroundColor: "#fafafa",
    padding: 8,
    marginVertical: 4,
  },
  dotGroups: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "flex-start",
  },
  group: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#999",
    borderRadius: 4,
    padding: 6,
    gap: 3,
  },
  groupAccent: {
    borderColor: "#FF9800",
  },
  groupRemoved: {
    opacity: 0.4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4CAF50",
  },
  dotAccent: {
    backgroundColor: "#FF9800",
  },
  dotRemoved: {
    backgroundColor: "#ccc",
  },
  dotRow: {
    flexDirection: "row",
    gap: 3,
  },
  partBarContainer: {
    maxHeight: screenHeight * 0.15,
    borderRadius: 8,
    backgroundColor: "#fafafa",
    padding: 8,
    marginVertical: 4,
  },
  partBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
    alignItems: "flex-start",
  },
  partDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  partDotA: {
    backgroundColor: "#2196F3",
  },
  partDotB: {
    backgroundColor: "#FF9800",
  },
  removeBarContainer: {
    maxHeight: screenHeight * 0.15,
    borderRadius: 8,
    backgroundColor: "#fafafa",
    padding: 8,
    marginVertical: 4,
  },
  removeBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
    alignItems: "flex-start",
  },
  removeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4CAF50",
  },
  removeDotRemoved: {
    backgroundColor: "#ccc",
    opacity: 0.4,
  },
  arrayContainer: {
    maxHeight: screenHeight * 0.35,
    borderRadius: 8,
    backgroundColor: "#fafafa",
    padding: 8,
    marginVertical: 4,
  },
  dotArray: {
    gap: 3,
    alignItems: "flex-start",
  },
  arrayRow: {
    flexDirection: "row",
    gap: 3,
  },
  arraySquare: {
    width: 12,
    height: 12,
    backgroundColor: "#E8F5E9",
    borderWidth: 1,
    borderColor: "#4CAF50",
    borderRadius: 2,
  },
  chainContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  chainStep: {
    alignItems: "center",
    gap: 4,
    minWidth: 50,
    flexShrink: 0,
  },
  chainDots: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
    width: 40,
    height: 40,
    alignContent: "flex-start",
  },
  chainDot: {
    backgroundColor: "#4CAF50",
  },
  chainLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  chainArrow: {
    fontSize: 16,
    color: "#999",
    marginHorizontal: 2,
  },
  numberLineContainer: {
    maxHeight: screenHeight * 0.25,
    borderRadius: 8,
    backgroundColor: "#fafafa",
    padding: 8,
    marginVertical: 4,
  },
  numberLine: {
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
  },
  lineContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 0,
    minHeight: 60,
    paddingVertical: 8,
  },
  dotContainer: {
    alignItems: "center",
    minWidth: 32,
    flexShrink: 0,
  },
  lineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#999",
    marginBottom: -3,
  },
  lineDotActive: {
    backgroundColor: "#4CAF50",
    width: 10,
    height: 10,
    marginBottom: -5,
  },
  lineLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
    color: "#666",
  },
  lineLabelMuted: {
    color: "#ccc",
  },
  lineLabelActive: {
    color: "#4CAF50",
    fontWeight: "700",
  },
});

export interface DotGroupsProps {
  groups: number;
  dotsPerGroup: number;
  extraGroups?: number; // number of groups (from the end) to highlight in accent color
  removeGroups?: number; // number of groups (from the end) to strike-through/fade
}

export function DotGroups({ groups, dotsPerGroup, extraGroups = 0, removeGroups = 0 }: DotGroupsProps) {
  const groupsArray = Array.from({ length: groups });
  const dotsPerRow = 5;

  return (
    <ScrollView
      style={styles.dotGroupsContainer}
      scrollEnabled={groups > 6}
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <View style={styles.dotGroups}>
        {groupsArray.map((_, groupIndex) => {
          // Determine if this group is in the "extra" set (accent color)
          const isExtra = extraGroups > 0 && groupIndex >= groups - extraGroups;
          // Determine if this group should be removed/faded
          const isRemoved = removeGroups > 0 && groupIndex >= groups - removeGroups;

          // Arrange dots in a grid within each group (max 5 per row)
          const dotRows = Math.ceil(dotsPerGroup / dotsPerRow);
          const dotRows_Array = Array.from({ length: dotRows });

          return (
            <View
              key={groupIndex}
              style={[
                styles.group,
                isExtra && styles.groupAccent,
                isRemoved && styles.groupRemoved,
              ]}
            >
              {dotRows_Array.map((_, rowIndex) => {
                const startIdx = rowIndex * dotsPerRow;
                const endIdx = Math.min(startIdx + dotsPerRow, dotsPerGroup);
                const dotsInRow = endIdx - startIdx;

                return (
                  <View key={rowIndex} style={styles.dotRow}>
                    {Array.from({ length: dotsInRow }).map((_, dotIndex) => (
                      <View
                        key={dotIndex}
                        style={[
                          styles.dot,
                          isExtra && styles.dotAccent,
                          isRemoved && styles.dotRemoved,
                        ]}
                      />
                    ))}
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

export interface DotArrayProps {
  rows: number;
  cols: number;
}

export function DotArray({ rows, cols }: DotArrayProps) {
  return (
    <ScrollView
      style={styles.arrayContainer}
      scrollEnabled={rows > 10 || cols > 10}
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <View style={styles.dotArray}>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <View key={rowIndex} style={styles.arrayRow}>
            {Array.from({ length: cols }).map((_, colIndex) => (
              <View key={colIndex} style={styles.arraySquare} />
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export interface PartBarProps {
  partA: number;
  partB: number;
}

export function PartBar({ partA, partB }: PartBarProps) {
  return (
    <View style={styles.partBarContainer}>
      <View style={styles.partBar}>
        {Array.from({ length: partA }).map((_, i) => (
          <View key={`a${i}`} style={[styles.partDot, styles.partDotA]} />
        ))}
        {Array.from({ length: partB }).map((_, i) => (
          <View key={`b${i}`} style={[styles.partDot, styles.partDotB]} />
        ))}
      </View>
    </View>
  );
}

export interface RemoveBarProps {
  total: number;
  removeCount: number;
}

export function RemoveBar({ total, removeCount }: RemoveBarProps) {
  return (
    <View style={styles.removeBarContainer}>
      <View style={styles.removeBar}>
        {Array.from({ length: total }).map((_, i) => {
          const isRemoved = i >= total - removeCount;
          return (
            <View
              key={i}
              style={[
                styles.removeDot,
                isRemoved && styles.removeDotRemoved,
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

export interface DoublingChainProps {
  steps: number[]; // e.g. [7, 14, 28, 56]
}

export function DoublingChain({ steps }: DoublingChainProps) {
  const maxDots = Math.max(...steps, 12);
  const scale = Math.max(1, Math.floor(maxDots / 10));
  const dotSize = scale > 1 ? 4 : 6;

  return (
    <ScrollView
      style={styles.numberLineContainer}
      horizontal
      scrollEnabled={steps.length > 4}
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <View style={styles.chainContainer}>
        {steps.map((value, i) => (
          <View key={i} style={styles.chainStep}>
            {/* Compact dot grid showing the value */}
            <View style={styles.chainDots}>
              {Array.from({ length: Math.min(value, 16) }).map((_, dotIdx) => (
                <View
                  key={dotIdx}
                  style={[
                    styles.chainDot,
                    { width: dotSize, height: dotSize, borderRadius: dotSize / 2 },
                  ]}
                />
              ))}
            </View>
            {/* Value label */}
            <Text style={styles.chainLabel}>{value}</Text>
            {/* Arrow (except on last step) */}
            {i < steps.length - 1 && (
              <Text style={styles.chainArrow}>→</Text>
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export interface NumberLineProps {
  step: number;
  hops: number;
}

export function NumberLine({ step, hops }: NumberLineProps) {
  const dots = Array.from({ length: hops + 1 });

  return (
    <ScrollView
      style={styles.numberLineContainer}
      horizontal
      scrollEnabled={hops > 8}
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <View style={styles.numberLine}>
        <View style={styles.lineContainer}>
          {dots.map((_, i) => {
            const isFirst = i === 0;
            const isLast = i === hops;
            const value = i * step;

            return (
              <View key={i} style={styles.dotContainer}>
                <View style={[styles.lineDot, isLast && styles.lineDotActive]} />
                <Text
                  style={[
                    styles.lineLabel,
                    isFirst && styles.lineLabelMuted,
                    isLast && styles.lineLabelActive,
                  ]}
                >
                  {value}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}
