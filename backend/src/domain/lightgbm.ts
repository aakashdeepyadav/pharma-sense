import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type LightGbmNode = {
  leaf_value?: number;
  split_index?: number;
  split_feature?: number;
  threshold?: number;
  decision_type?: string;
  default_left?: boolean;
  left_child?: LightGbmNode;
  right_child?: LightGbmNode;
};

export type LightGbmArtifact = {
  format: 'lightgbm-booster-json-v1';
  model: string;
  training_data_source: 'synthetic' | 'operational';
  trained_at: string;
  feature_names: string[];
  booster: {
    tree_info: Array<{ tree_structure: LightGbmNode }>;
  };
};

let artifactPromise: Promise<LightGbmArtifact> | null = null;

export function loadLightGbmArtifact(): Promise<LightGbmArtifact> {
  if (!artifactPromise) {
    artifactPromise = readFile(path.resolve(process.cwd(), 'ml-artifacts/lightgbm_model.json'), 'utf8')
      .then((serialized) => JSON.parse(serialized) as LightGbmArtifact)
      .catch((error: unknown) => {
        artifactPromise = null;
        throw error;
      });
  }
  return artifactPromise;
}

export const LIGHTGBM_FEATURE_NAMES = [
  'day_of_week',
  'month',
  'week_of_year',
  'is_weekend',
  'lag_1',
  'lag_7',
  'lag_14',
  'lag_30',
  'rolling_mean_7',
  'rolling_mean_14',
  'rolling_mean_30',
] as const;

function isoWeekOfYear(date: Date) {
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = (thursday.getUTCDay() + 6) % 7;
  thursday.setUTCDate(thursday.getUTCDate() - dayOfWeek + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

export function buildLightGbmFeatures(dailyDemand: number[], forecastDate: Date): Record<string, number> {
  if (dailyDemand.length < 30 || dailyDemand.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('LightGBM inference requires at least 30 days of non-negative demand history.');
  }

  const history = dailyDemand.slice(-30);
  const dayOfWeek = (forecastDate.getUTCDay() + 6) % 7;
  return {
    day_of_week: dayOfWeek,
    month: forecastDate.getUTCMonth() + 1,
    week_of_year: isoWeekOfYear(forecastDate),
    is_weekend: dayOfWeek >= 5 ? 1 : 0,
    lag_1: history.at(-1) ?? 0,
    lag_7: history.at(-7) ?? 0,
    lag_14: history.at(-14) ?? 0,
    lag_30: history.at(-30) ?? 0,
    rolling_mean_7: average(history.slice(-7)),
    rolling_mean_14: average(history.slice(-14)),
    rolling_mean_30: average(history),
  };
}

function predictTree(node: LightGbmNode, features: number[]): number {
  if (typeof node.leaf_value === 'number') return node.leaf_value;
  if (
    typeof node.split_feature !== 'number' ||
    typeof node.threshold !== 'number' ||
    !node.left_child ||
    !node.right_child
  ) {
    throw new Error('The LightGBM model artifact contains an invalid tree node.');
  }

  const value = features[node.split_feature];
  const goesLeft = !Number.isFinite(value)
    ? Boolean(node.default_left)
    : node.decision_type === '<='
      ? value <= node.threshold
      : node.decision_type === '<'
        ? value < node.threshold
        : (() => { throw new Error(`Unsupported LightGBM split operator: ${node.decision_type}`); })();
  return predictTree(goesLeft ? node.left_child : node.right_child, features);
}

export function predictLightGbm(artifact: LightGbmArtifact, featureValues: Record<string, number>) {
  if (
    artifact.format !== 'lightgbm-booster-json-v1' ||
    artifact.feature_names.length !== LIGHTGBM_FEATURE_NAMES.length ||
    !LIGHTGBM_FEATURE_NAMES.every((name, index) => artifact.feature_names[index] === name)
  ) {
    throw new Error('The LightGBM model artifact does not match the runtime feature schema.');
  }

  const features = artifact.feature_names.map((name) => featureValues[name]);
  if (features.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error('LightGBM inference received a missing or invalid feature.');
  }

  const prediction = artifact.booster.tree_info.reduce(
    (total, tree) => total + predictTree(tree.tree_structure, features),
    0,
  );
  return Math.max(0, prediction);
}

