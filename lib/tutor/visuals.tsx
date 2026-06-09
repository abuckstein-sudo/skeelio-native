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
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4CAF50",
  },
  dotRow: {
    flexDirection: "row",
    gap: 3,
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
}

export function DotGroups({ groups, dotsPerGroup }: DotGroupsProps) {
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
          // Arrange dots in a grid within each group (max 5 per row)
          const dotRows = Math.ceil(dotsPerGroup / dotsPerRow);
          const dotRows_Array = Array.from({ length: dotRows });

          return (
            <View key={groupIndex} style={styles.group}>
              {dotRows_Array.map((_, rowIndex) => {
                const startIdx = rowIndex * dotsPerRow;
                const endIdx = Math.min(startIdx + dotsPerRow, dotsPerGroup);
                const dotsInRow = endIdx - startIdx;

                return (
                  <View key={rowIndex} style={styles.dotRow}>
                    {Array.from({ length: dotsInRow }).map((_, dotIndex) => (
                      <View key={dotIndex} style={styles.dot} />
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
