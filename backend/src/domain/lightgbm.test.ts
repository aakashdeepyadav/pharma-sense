import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildLightGbmFeatures,
  LIGHTGBM_FEATURE_NAMES,
  loadLightGbmArtifact,
  LightGbmArtifact,
  predictLightGbm,
} from './lightgbm';

describe('LightGBM inference', () => {
  it('builds the same calendar, lag, and rolling features used by training', () => {
    const values = Array.from({ length: 30 }, (_, index) => index + 1);
    const features = buildLightGbmFeatures(values, new Date('2025-01-04T00:00:00.000Z'));

    assert.deepEqual(features, {
      day_of_week: 5,
      month: 1,
      week_of_year: 1,
      is_weekend: 1,
      lag_1: 30,
      lag_7: 24,
      lag_14: 17,
      lag_30: 1,
      rolling_mean_7: 27,
      rolling_mean_14: 23.5,
      rolling_mean_30: 15.5,
    });
  });

  it('walks exported LightGBM trees and sums their leaf predictions', () => {
    const artifact: LightGbmArtifact = {
      format: 'lightgbm-booster-json-v1',
      model: 'test model',
      training_data_source: 'synthetic',
      trained_at: '2025-01-01T00:00:00.000Z',
      feature_names: [...LIGHTGBM_FEATURE_NAMES],
      booster: {
        tree_info: [
          {
            tree_structure: {
              split_index: 0,
              split_feature: 0,
              threshold: 5,
              decision_type: '<=',
              default_left: true,
              left_child: { leaf_value: 2.5 },
              right_child: { leaf_value: 7.25 },
            },
          },
          { tree_structure: { leaf_value: 1.25 } },
        ],
      },
    };

    const features = Object.fromEntries(LIGHTGBM_FEATURE_NAMES.map((name) => [name, 0]));
    assert.equal(predictLightGbm(artifact, features), 3.75);
    assert.equal(predictLightGbm(artifact, { ...features, day_of_week: 6 }), 8.5);
  });

  it('clips negative regression outputs at zero and rejects incompatible history', () => {
    const artifact: LightGbmArtifact = {
      format: 'lightgbm-booster-json-v1',
      model: 'test model',
      training_data_source: 'synthetic',
      trained_at: '2025-01-01T00:00:00.000Z',
      feature_names: [...LIGHTGBM_FEATURE_NAMES],
      booster: { tree_info: [{ tree_structure: { leaf_value: -3 } }] },
    };
    const features = Object.fromEntries(LIGHTGBM_FEATURE_NAMES.map((name) => [name, 0]));
    assert.equal(predictLightGbm(artifact, features), 0);
    assert.throws(() => buildLightGbmFeatures([1, 2, 3], new Date()), /30 days/);
  });

  it('loads the packaged model and returns a finite inference result', async () => {
    const artifact = await loadLightGbmArtifact();
    const features = buildLightGbmFeatures(
      Array.from({ length: 30 }, (_, index) => 4 + (index % 6)),
      new Date('2026-10-20T00:00:00.000Z'),
    );
    const prediction = predictLightGbm(artifact, features);

    assert.equal(artifact.training_data_source, 'synthetic');
    assert.equal(artifact.feature_names.length, LIGHTGBM_FEATURE_NAMES.length);
    assert.ok(Number.isFinite(prediction));
    assert.ok(prediction >= 0);
  });
});
