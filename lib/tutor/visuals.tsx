import React from "react";
import { View, Text, StyleSheet } from "react-native";

const styles = StyleSheet.create({
  dotGroups: {
    flexDirection: "column",
    gap: 12,
    alignItems: "flex-start",
  },
  group: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#999",
    borderRadius: 6,
    padding: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    maxWidth: "100%",
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#4CAF50",
  },
  dotArray: {
    gap: 8,
  },
  arrayRow: {
    flexDirection: "row",
    gap: 8,
  },
  arraySquare: {
    width: 28,
    height: 28,
    backgroundColor: "#E8F5E9",
    borderWidth: 1,
    borderColor: "#4CAF50",
    borderRadius: 4,
  },
  numberLine: {
    alignItems: "center",
    gap: 4,
  },
  lineContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 0,
    height: 80,
  },
  lineSegment: {
    flex: 1,
    height: 1,
    backgroundColor: "#999",
  },
  dotContainer: {
    alignItems: "center",
    width: 40,
  },
  lineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#999",
    marginBottom: -6,
  },
  lineDotActive: {
    backgroundColor: "#4CAF50",
    width: 16,
    height: 16,
    marginBottom: -8,
  },
  lineLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
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

  return (
    <View style={styles.dotGroups}>
      {groupsArray.map((_, groupIndex) => (
        <View key={groupIndex} style={styles.group}>
          {Array.from({ length: dotsPerGroup }).map((_, dotIndex) => (
            <View key={dotIndex} style={styles.dot} />
          ))}
        </View>
      ))}
    </View>
  );
}

export interface DotArrayProps {
  rows: number;
  cols: number;
}

export function DotArray({ rows, cols }: DotArrayProps) {
  return (
    <View style={styles.dotArray}>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <View key={rowIndex} style={styles.arrayRow}>
          {Array.from({ length: cols }).map((_, colIndex) => (
            <View key={colIndex} style={styles.arraySquare} />
          ))}
        </View>
      ))}
    </View>
  );
}

export interface NumberLineProps {
  step: number;
  hops: number;
}

export function NumberLine({ step, hops }: NumberLineProps) {
  const dots = Array.from({ length: hops + 1 });

  return (
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
        {/* Line segments between dots */}
      </View>
    </View>
  );
}
