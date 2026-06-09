// Barrel export for all visual components
export { StrategyView } from "./StrategyView";

// Re-export visual components from parent visuals.tsx
// Import and re-export all the dot/bar/line components
export {
  DotGroups,
  type DotGroupsProps,
  DotArray,
  type DotArrayProps,
  NumberLine,
  type NumberLineProps,
  DoublingChain,
  type DoublingChainProps,
  PartBar,
  type PartBarProps,
  RemoveBar,
  type RemoveBarProps,
} from "../visuals";
