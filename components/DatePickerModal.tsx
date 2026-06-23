import { useMemo, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { schoolHomeworkShortDateLabel, todayDateKey } from "@/lib/schoolHomework";

type Props = {
  visible: boolean;
  selectedDate: string;
  onSelect: (dateKey: string) => void;
  onClose: () => void;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dateFromKey(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00`);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dateKey(date: Date): string {
  return todayDateKey(date);
}

export default function DatePickerModal({ visible, selectedDate, onSelect, onClose }: Props) {
  const [visibleMonth, setVisibleMonth] = useState(() => dateFromKey(selectedDate || todayDateKey()));
  const today = todayDateKey();

  const days = useMemo(() => {
    const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1, 12);
    const start = new Date(first);
    const mondayOffset = first.getDay() === 0 ? -6 : 1 - first.getDay();
    start.setDate(first.getDate() + mondayOffset);

    return Array.from({ length: 42 }, (_, index) => {
      const current = new Date(start);
      current.setDate(start.getDate() + index);
      return current;
    });
  }, [visibleMonth]);

  const shiftMonth = (direction: -1 | 1) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1, 12));
  };

  const label = visibleMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const activeMonth = monthKey(visibleMonth);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.iconButton} onPress={() => shiftMonth(-1)}>
              <MaterialCommunityIcons name="chevron-left" size={22} color="#334155" />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>{label}</Text>
            <TouchableOpacity style={styles.iconButton} onPress={() => shiftMonth(1)}>
              <MaterialCommunityIcons name="chevron-right" size={22} color="#334155" />
            </TouchableOpacity>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((day) => (
              <Text key={day} style={styles.weekday}>{day}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {days.map((day) => {
              const key = dateKey(day);
              const selected = key === selectedDate;
              const isToday = key === today;
              const muted = monthKey(day) !== activeMonth;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.dayButton,
                    isToday && styles.todayButton,
                    selected && styles.selectedButton,
                  ]}
                  onPress={() => {
                    onSelect(key);
                    onClose();
                  }}
                >
                  <Text style={[
                    styles.dayText,
                    muted && styles.dayTextMuted,
                    isToday && styles.todayText,
                    selected && styles.selectedText,
                  ]}>
                    {day.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.todayLink} onPress={() => {
              setVisibleMonth(dateFromKey(today));
              onSelect(today);
              onClose();
            }}>
              <MaterialCommunityIcons name="calendar-today" size={16} color="#1565c0" />
              <Text style={styles.todayLinkText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.selectedHint}>{schoolHomeworkShortDateLabel(selectedDate || today)}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.36)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  panel: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 8,
    backgroundColor: "#fff",
    padding: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "800",
    color: "#64748b",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayButton: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  todayButton: {
    borderWidth: 1,
    borderColor: "#90caf9",
  },
  selectedButton: {
    backgroundColor: "#1565c0",
  },
  dayText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
  },
  dayTextMuted: {
    color: "#cbd5e1",
  },
  todayText: {
    color: "#1565c0",
  },
  selectedText: {
    color: "#fff",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  todayLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  todayLinkText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1565c0",
  },
  closeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
  },
  closeText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#334155",
  },
  selectedHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#64748b",
  },
});
