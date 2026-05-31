'use strict';

/**
 * Chronological dataset split — never random.
 *
 * Split ratios: 70% train / 15% val / 15% test
 * Gap enforcement: horizonBars bars between each split boundary.
 * Any index within the gap zone is discarded (not included in any split).
 *
 * Invariants:
 *   - max(train.indices) < min(val.indices)  by at least horizonBars
 *   - max(val.indices)   < min(test.indices) by at least horizonBars
 *   - No index appears in more than one split
 *   - Splits are non-empty (throws if dataset too small)
 */

const { LABEL_SPEC } = require('./featureDefinitions');

/**
 * @param {number} nSamples  total number of samples in the dataset
 * @param {object} [opts]
 * @param {number} [opts.horizonBars]   gap size in bars (default: LABEL_SPEC.horizonBars)
 * @param {number} [opts.trainRatio]    default 0.70
 * @param {number} [opts.valRatio]      default 0.15
 * @returns {{ trainIdx, valIdx, testIdx, gapIdx, meta }}
 */
function chronologicalSplit(nSamples, opts = {}) {
  const {
    horizonBars: gapSize = LABEL_SPEC.horizonBars,
    trainRatio  = 0.70,
    valRatio    = 0.15,
  } = opts;

  if (nSamples < 30) {
    throw new Error(`Dataset too small for split: ${nSamples} samples (minimum 30)`);
  }

  const trainEnd   = Math.floor(nSamples * trainRatio);
  const valStart   = trainEnd + gapSize;
  const valEnd     = Math.floor(nSamples * (trainRatio + valRatio));
  const testStart  = valEnd + gapSize;

  if (valStart >= valEnd) throw new Error('val split is empty after gap enforcement — dataset too small');
  if (testStart >= nSamples) throw new Error('test split is empty after gap enforcement — dataset too small');

  const trainIdx = range(0, trainEnd);
  const gapIdx1  = range(trainEnd, valStart);
  const valIdx   = range(valStart, valEnd);
  const gapIdx2  = range(valEnd, testStart);
  const testIdx  = range(testStart, nSamples);

  if (!trainIdx.length || !valIdx.length || !testIdx.length) {
    throw new Error('One or more splits are empty — dataset too small');
  }

  return {
    trainIdx,
    valIdx,
    testIdx,
    gapIdx: [...gapIdx1, ...gapIdx2],
    meta: {
      nSamples,
      gapSize,
      trainSize:   trainIdx.length,
      valSize:     valIdx.length,
      testSize:    testIdx.length,
      trainRatio,
      valRatio,
      testRatio:   testIdx.length / nSamples,
      trainEndIdx: trainEnd - 1,
      valStartIdx: valStart,
      valEndIdx:   valEnd - 1,
      testStartIdx: testStart,
    },
  };
}

function range(start, end) {
  const arr = [];
  for (let i = start; i < end; i++) arr.push(i);
  return arr;
}

/**
 * Apply split indices to X, y arrays.
 */
function applySplit(X, y, { trainIdx, valIdx, testIdx }) {
  return {
    trainX: trainIdx.map((i) => X[i]),
    trainY: trainIdx.map((i) => y[i]),
    valX:   valIdx.map((i) => X[i]),
    valY:   valIdx.map((i) => y[i]),
    testX:  testIdx.map((i) => X[i]),
    testY:  testIdx.map((i) => y[i]),
  };
}

/**
 * Validate that split indices have no overlap and correct ordering.
 */
function validateSplit(trainIdx, valIdx, testIdx, gapSize) {
  const errors = [];

  const trainMax  = Math.max(...trainIdx);
  const valMin    = Math.min(...valIdx);
  const valMax    = Math.max(...valIdx);
  const testMin   = Math.min(...testIdx);

  if (valMin - trainMax - 1 < gapSize) {
    errors.push(`Gap between train and val (${valMin - trainMax - 1}) < gapSize (${gapSize})`);
  }
  if (testMin - valMax - 1 < gapSize) {
    errors.push(`Gap between val and test (${testMin - valMax - 1}) < gapSize (${gapSize})`);
  }

  const trainSet = new Set(trainIdx);
  for (const i of valIdx) {
    if (trainSet.has(i)) errors.push(`Overlap: index ${i} in both train and val`);
  }
  const valSet = new Set(valIdx);
  for (const i of testIdx) {
    if (valSet.has(i)) errors.push(`Overlap: index ${i} in both val and test`);
    if (trainSet.has(i)) errors.push(`Overlap: index ${i} in both train and test`);
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { chronologicalSplit, applySplit, validateSplit };
